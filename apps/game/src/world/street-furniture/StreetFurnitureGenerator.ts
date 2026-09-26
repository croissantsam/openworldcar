/**
 * StreetFurnitureGenerator — real street objects from OSM tagged nodes
 * (trees, lamps, benches, bollards, bike racks, bins, bus stops, hydrants,
 * post boxes, fountains, advertising, subway entrances…), instanced per chunk.
 *
 * Everything comes from the chunk's own POIs (OSM tags); nothing is
 * city-specific. One THREE.InstancedMesh per archetype (one draw call),
 * shared materials, geometry built once per archetype and shared by chunks.
 *
 * Called from ChunkLoader.buildGroupIncremental() for each chunk (or delivery
 * delta) with that chunk's POIs; colliders from ChunkManager._runJob().
 */

import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import type { PointOfInterest, Road, Building } from '@world-drive/shared'
import { RoadIndex } from './RoadIndex.js'
import { ARCH, getGeo, ArchKey } from './Archetypes.js'
import { LabelAtlas, BUS_STYLE, SUBWAY_STYLE } from './LabelAtlas.js'
import { getTreeArch } from './TreeArch.js'
import { isStatuePoi, statueArchetypeFor } from './StatueGeometries.js'
import {
  hash32,
  unit,
  clamp,
  treeArchetypeFor,
  faceYaw,
  parseColourTag,
  parseMetres,
  MAX_PER_KIND,
  MAX_TREES,
} from './PlacementUtils.js'
import { DEFAULT_POSTBOX } from './Materials.js'

interface Placement {
  x: number
  y: number
  z: number
  yaw: number
  sx: number
  sy: number
  sz: number
  colour?: THREE.Color
}

interface LabelPlacement {
  x: number
  y: number
  z: number
  yaw: number
  w: number
  h: number
  slot: number
}

const _m = new THREE.Matrix4()
const _p = new THREE.Vector3()
const _q = new THREE.Quaternion()
const _s = new THREE.Vector3()
const _Y = new THREE.Vector3(0, 1, 0)

export class StreetFurnitureGenerator {
  static generate(pois: PointOfInterest[], roads: Road[], _buildings: Building[]): THREE.Group | null {
    if (pois.length === 0) return null
    const t0 = performance.now()

    const index = new RoadIndex(roads)
    const lists = new Map<ArchKey, Placement[]>()
    const labels: LabelPlacement[] = []
    const atlas = new LabelAtlas()
    let treeCount = 0

    const push = (key: ArchKey, p: Placement, cap = MAX_PER_KIND): boolean => {
      let list = lists.get(key)
      if (!list) {
        list = []
        lists.set(key, list)
      }
      if (list.length >= cap) return false
      list.push(p)
      return true
    }

    const simple = (key: ArchKey, x: number, z: number, yaw: number, s = 1, colour?: THREE.Color): boolean => {
      const p: Placement = { x, y: 0, z, yaw, sx: s, sy: s, sz: s }
      if (colour) p.colour = colour
      return push(key, p)
    }

    for (const poi of pois) {
      const kind = poi.kind
      if (!kind) continue
      const x = poi.position.x
      const z = poi.position.z
      const tags = poi.tags
      const h = hash32(poi.id)

      if (isStatuePoi(poi)) {
        if (!index.insideRoad(x, z)) {
          const arch = statueArchetypeFor(poi)
          const near = index.nearest(x, z)
          const yaw = faceYaw(near, h)
          simple(arch, x, z, yaw)
        }
        continue
      }

      switch (kind) {
        case 'tree': {
          if (treeCount >= MAX_TREES) break
          if (index.insideRoad(x, z)) break
          const arch = treeArchetypeFor(tags)
          const ta = getTreeArch(arch)
          let height = parseMetres(tags?.['height']) ?? 9
          height = clamp(height, 3, 25) * (0.9 + 0.2 * unit(h, 2))
          height = clamp(height, 3, 25)
          const sy = height / ta.height
          const sxz = Math.pow(sy, 0.8)
          const yaw = unit(h, 1) * Math.PI * 2
          const p: Placement = { x, y: 0, z, yaw, sx: sxz, sy, sz: sxz }
          const tk = ('trunk' + arch) as ArchKey
          const ck = ('crown' + arch) as ArchKey
          if (push(tk, p, MAX_TREES) && push(ck, p, MAX_TREES)) treeCount++
          break
        }
        case 'street_lamp': {
          if (index.insideRoad(x, z)) break
          const near = index.nearest(x, z)
          const yaw = faceYaw(near, h)
          const lh = clamp(parseMetres(tags?.['height']) ?? 4, 3, 10) / 4
          const p: Placement = { x, y: 0, z, yaw, sx: 1, sy: lh, sz: 1 }
          if (push('lamp', p)) push('lampHead', p)
          break
        }
        case 'bench': {
          if (index.insideRoad(x, z)) break
          const yaw = faceYaw(index.nearest(x, z), h)
          const noBack = tags?.['backrest'] === 'no'
          simple(noBack ? 'benchNb' : 'bench', x, z, yaw)
          break
        }
        case 'bollard': {
          if (index.insideRoad(x, z)) break
          simple('bollard', x, z, 0)
          break
        }
        case 'bicycle_parking': {
          if (index.insideRoad(x, z)) break
          const near = index.nearest(x, z)
          const cap = parseInt(tags?.['capacity'] ?? '', 10)
          const n = Number.isFinite(cap) && cap > 0 ? clamp(Math.ceil(cap / 2), 1, 6) : 3
          let dx = 1
          let dz = 0
          let yaw: number
          if (near) {
            dx = near.dirX
            dz = near.dirZ
            // local +x → road normal (perpendicular to the row)
            yaw = Math.atan2(-near.toZ, near.toX)
          } else {
            const a = unit(h, 3) * Math.PI * 2
            dx = Math.cos(a)
            dz = Math.sin(a)
            yaw = Math.atan2(-dx, -dz)
          }
          const spacing = 0.9
          for (let i = 0; i < n; i++) {
            const off = (i - (n - 1) / 2) * spacing
            if (!simple('bike', x + dx * off, z + dz * off, yaw)) break
          }
          break
        }
        case 'waste_basket': {
          if (index.insideRoad(x, z)) break
          simple('waste', x, z, faceYaw(index.nearest(x, z), h) + Math.PI)
          break
        }
        case 'fire_hydrant': {
          if (index.insideRoad(x, z)) break
          simple('hydrant', x, z, faceYaw(index.nearest(x, z), h))
          break
        }
        case 'post_box': {
          if (index.insideRoad(x, z)) break
          const colour = parseColourTag(tags?.['colour'] ?? tags?.['color']) ?? DEFAULT_POSTBOX
          simple('postbox', x, z, faceYaw(index.nearest(x, z), h), 1, colour)
          break
        }
        case 'fountain': {
          if (index.insideRoad(x, z)) break
          simple('fountain', x, z, 0, 0.85 + 0.3 * unit(h, 2))
          break
        }
        case 'advertising': {
          if (index.insideRoad(x, z)) break
          const isColumn = tags?.['advertising'] === 'column' || tags?.['advertising'] === 'totem'
          simple(isColumn ? 'adColumn' : 'ad', x, z, faceYaw(index.nearest(x, z), h))
          break
        }
        case 'bus_stop': {
          if (index.insideRoad(x, z)) break
          const yaw = faceYaw(index.nearest(x, z), h)
          if (!simple('busStop', x, z, yaw)) break
          const name = tags?.['name'] ?? poi.name
          if (name) {
            const slot = atlas.add(name, BUS_STYLE)
            if (slot !== null) labels.push({ x, y: 2.72, z, yaw, w: 0.58, h: 0.145, slot })
          }
          break
        }
        case 'subway_entrance': {
          if (index.insideRoad(x, z)) break
          const yaw = faceYaw(index.nearest(x, z), h)
          if (!simple('subway', x, z, yaw)) break
          const name = tags?.['name'] ?? poi.name ?? 'M'
          const slot = atlas.add(name, SUBWAY_STYLE)
          if (slot !== null) {
            // sign board sits at local (1.2, 2.45, 0); front face at z = +0.02
            const sin = Math.sin(yaw)
            const cos = Math.cos(yaw)
            labels.push({
              x: x + cos * 1.2 + sin * 0.025,
              y: 2.45,
              z: z - sin * 1.2 + cos * 0.025,
              yaw,
              w: 0.68,
              h: 0.17,
              slot,
            })
          }
          break
        }
        default:
          break
      }
    }

    if (lists.size === 0) return null

    const group = new THREE.Group()
    group.name = 'street-furniture'
    let total = 0

    for (const [key, list] of lists) {
      if (list.length === 0) continue
      const def = ARCH[key]
      const mesh = new THREE.InstancedMesh(getGeo(key), def.mat(), list.length)
      mesh.name = 'sf-' + key
      const wantsColour = key === 'postbox'
      for (let i = 0; i < list.length; i++) {
        const p = list[i]!
        _p.set(p.x, p.y, p.z)
        _q.setFromAxisAngle(_Y, p.yaw)
        _s.set(p.sx, p.sy, p.sz)
        _m.compose(_p, _q, _s)
        mesh.setMatrixAt(i, _m)
        if (wantsColour) mesh.setColorAt(i, p.colour ?? DEFAULT_POSTBOX)
      }
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
      mesh.castShadow = def.shadow
      mesh.receiveShadow = false
      mesh.userData['skipMerge'] = true
      mesh.computeBoundingSphere()
      group.add(mesh)
      total += list.length
    }

    // Text labels: small planes sharing this chunk's atlas material (merged by ChunkOptimizer)
    const labelMat = labels.length > 0 ? atlas.build() : null
    if (labelMat) {
      for (const l of labels) {
        const g = new THREE.PlaneGeometry(l.w, l.h)
        const uv = g.getAttribute('uv') as THREE.BufferAttribute
        const [u0, v0, u1, v1] = atlas.uv(l.slot)
        for (let i = 0; i < uv.count; i++) {
          uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0))
        }
        // front face of the board: local z = +0.02 (bus stop board is 0.03 thick at z = 0)
        _p.set(l.x, l.y, l.z)
        _q.setFromAxisAngle(_Y, l.yaw)
        _s.set(1, 1, 1)
        _m.compose(_p, _q, _s)
        g.translate(0, 0, 0.02)
        g.applyMatrix4(_m)
        const mesh = new THREE.Mesh(g, labelMat)
        mesh.castShadow = false
        mesh.receiveShadow = false
        group.add(mesh)
      }
    }

    const ms = performance.now() - t0
    console.debug(`[StreetFurniture] ${total} instances in ${lists.size} draw calls, ${labels.length} labels — ${ms.toFixed(1)} ms`)
    return group
  }

  /** Solid colliders for statue pedestals, tree trunks and bollards. */
  static createColliderDescs(pois: PointOfInterest[], roads: Road[]): RAPIER.ColliderDesc[] {
    const out: RAPIER.ColliderDesc[] = []
    if (pois.length === 0) return out
    const index = new RoadIndex(roads)
    let trees = 0
    let bollards = 0
    for (const poi of pois) {
      const x = poi.position.x
      const z = poi.position.z
      if (index.insideRoad(x, z)) continue

      if (isStatuePoi(poi)) {
        const arch = statueArchetypeFor(poi)
        const h = hash32(poi.id)
        const near = index.nearest(x, z)
        const yaw = faceYaw(near, h)
        const halfYaw = yaw * 0.5
        const rot = { x: 0, y: Math.sin(halfYaw), z: 0, w: Math.cos(halfYaw) }

        switch (arch) {
          case 'statueEquestrian':
            out.push(
              RAPIER.ColliderDesc.cuboid(1.2, 1.35, 2.0)
                .setTranslation(x, 1.35, z)
                .setRotation(rot),
            )
            break
          case 'statuePedestrian':
            out.push(
              RAPIER.ColliderDesc.cuboid(1.1, 1.25, 1.1)
                .setTranslation(x, 1.25, z)
                .setRotation(rot),
            )
            break
          case 'statueBust':
            out.push(
              RAPIER.ColliderDesc.cuboid(0.65, 1.0, 0.65)
                .setTranslation(x, 1.0, z)
                .setRotation(rot),
            )
            break
          case 'statueObelisk':
            out.push(
              RAPIER.ColliderDesc.cuboid(1.9, 1.2, 1.9)
                .setTranslation(x, 1.2, z)
                .setRotation(rot),
            )
            break
        }
        continue
      }

      const kind = poi.kind
      if (kind === 'tree') {
        if (trees >= MAX_TREES) continue
        trees++
        out.push(RAPIER.ColliderDesc.cylinder(1.0, 0.25).setTranslation(x, 1.0, z))
      } else if (kind === 'bollard') {
        if (bollards >= MAX_PER_KIND) continue
        bollards++
        out.push(RAPIER.ColliderDesc.cylinder(0.45, 0.08).setTranslation(x, 0.45, z))
      }
    }
    return out
  }
}