import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import type { Road } from '@world-drive/shared'
import { computeRoadWidth } from './road-width.js'
import { computePolylineNormals, type Pt } from './geometry.js'
import { computeElevatedBridgePoints, computeTunnelPoints } from './elevation.js'
import { elevClass, checkElevationConnections } from './materials.js'
import { resamplePolyline } from './geometry.js'

export function createColliderDescs(road: Road, allRoads?: Road[]): RAPIER.ColliderDesc[] {
  const descs: RAPIER.ColliderDesc[] = []
  const pts = road.points
  if (pts.length < 2) return descs

  if (road.elevationMode === 'bridge' || road.bridge) {
    const { halfW } = computeRoadWidth(road)
    const bridgeHeight = road.bridgeHeight ?? (road.layer > 1 ? road.layer * 4.5 : 4.5)
    const { connectsStart, connectsEnd } = checkElevationConnections(road, allRoads)

    const { points: raisedPts } = computeElevatedBridgePoints(pts, bridgeHeight, connectsStart, connectsEnd)
    const N = raisedPts.length
    if (N < 2) return descs
    const normals = computePolylineNormals(raisedPts)

    const deckVerts: number[] = []
    const deckIdx: number[] = []

    for (let i = 0; i < N; i++) {
      const curr = raisedPts[i]!
      const norm = normals[i]!
      const nx = norm.nx
      const nz = norm.nz
      const miter = norm.miter
      const w = halfW * miter

      deckVerts.push(
        curr.x + nx * w, curr.y, curr.z + nz * w,
        curr.x - nx * w, curr.y, curr.z - nz * w,
      )

      if (i < N - 1) {
        const b = i * 2
        deckIdx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2)
        deckIdx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3)
      }
    }

    if (deckVerts.length >= 9 && deckIdx.length >= 3) {
      const deckCol = RAPIER.ColliderDesc.trimesh(
        new Float32Array(deckVerts),
        new Uint32Array(deckIdx),
      ).setFriction(0.3).setRestitution(0.0)
      descs.push(deckCol)
    }

    const parapetVerts: number[] = []
    const parapetIdx: number[] = []
    const parapetH = 1.2

    for (let i = 0; i < N; i++) {
      const curr = raisedPts[i]!
      const norm = normals[i]!
      const nx = norm.nx
      const nz = norm.nz
      const miter = norm.miter
      const pW = (halfW + 0.15) * miter

      parapetVerts.push(
        curr.x + nx * pW, curr.y, curr.z + nz * pW,
        curr.x + nx * pW, curr.y + parapetH, curr.z + nz * pW,
      )
      parapetVerts.push(
        curr.x - nx * pW, curr.y, curr.z - nz * pW,
        curr.x - nx * pW, curr.y + parapetH, curr.z - nz * pW,
      )

      if (i < N - 1) {
        const lb = i * 4
        parapetIdx.push(lb, lb + 1, lb + 4, lb + 1, lb + 5, lb + 4)
        parapetIdx.push(lb, lb + 4, lb + 1, lb + 1, lb + 4, lb + 5)
        const rb = i * 4 + 2
        parapetIdx.push(rb, rb + 1, rb + 4, rb + 1, rb + 5, rb + 4)
        parapetIdx.push(rb, rb + 4, rb + 1, rb + 1, rb + 4, rb + 5)
      }
    }

    if (parapetVerts.length >= 9 && parapetIdx.length >= 3) {
      const parapetCol = RAPIER.ColliderDesc.trimesh(
        new Float32Array(parapetVerts),
        new Uint32Array(parapetIdx),
      ).setFriction(0.1).setRestitution(0.1)
      descs.push(parapetCol)
    }
  } else if (road.elevationMode === 'tunnel' || road.tunnel) {
    const { halfW } = computeRoadWidth(road)
    const depth = road.layer && road.layer < 0 ? Math.min(-4.5, road.layer * 4.5) : -4.8
    const { connectsStart, connectsEnd } = checkElevationConnections(road, allRoads)

    const { points: tunnelPts } = computeTunnelPoints(pts, depth, connectsStart, connectsEnd)
    const N = tunnelPts.length
    if (N < 2) return descs
    const normals = computePolylineNormals(tunnelPts)

    const floorVerts: number[] = []
    const floorIdx: number[] = []

    for (let i = 0; i < N; i++) {
      const curr = tunnelPts[i]!
      const norm = normals[i]!
      const nx = norm.nx
      const nz = norm.nz
      const miter = norm.miter
      const w = halfW * miter

      floorVerts.push(
        curr.x + nx * w, curr.y, curr.z + nz * w,
        curr.x - nx * w, curr.y, curr.z - nz * w,
      )

      if (i < N - 1) {
        const b = i * 2
        floorIdx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2)
        floorIdx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3)
      }
    }

    if (floorVerts.length >= 9 && floorIdx.length >= 3) {
      const floorCol = RAPIER.ColliderDesc.trimesh(
        new Float32Array(floorVerts),
        new Uint32Array(floorIdx),
      ).setFriction(0.3).setRestitution(0.0)
      descs.push(floorCol)
    }

    const wallVerts: number[] = []
    const wallIdx: number[] = []

    for (let i = 0; i < N; i++) {
      const curr = tunnelPts[i]!
      const norm = normals[i]!
      const nx = norm.nx
      const nz = norm.nz
      const miter = norm.miter
      const tW = (halfW + 0.22) * miter
      const topY = 0.14

      wallVerts.push(
        curr.x + nx * tW, curr.y, curr.z + nz * tW,
        curr.x + nx * tW, topY, curr.z + nz * tW,
      )
      wallVerts.push(
        curr.x - nx * tW, curr.y, curr.z - nz * tW,
        curr.x - nx * tW, topY, curr.z - nz * tW,
      )

      if (i < N - 1) {
        const lb = i * 4
        wallIdx.push(lb, lb + 1, lb + 4, lb + 1, lb + 5, lb + 4)
        wallIdx.push(lb, lb + 4, lb + 1, lb + 1, lb + 4, lb + 5)
        const rb = i * 4 + 2
        wallIdx.push(rb, rb + 1, rb + 4, rb + 1, rb + 5, rb + 4)
        wallIdx.push(rb, rb + 4, rb + 1, rb + 1, rb + 4, rb + 5)
      }
    }

    if (wallVerts.length >= 9 && wallIdx.length >= 3) {
      const wallCol = RAPIER.ColliderDesc.trimesh(
        new Float32Array(wallVerts),
        new Uint32Array(wallIdx),
      ).setFriction(0.1).setRestitution(0.05)
      descs.push(wallCol)
    }
  } else {
    const { halfW } = computeRoadWidth(road)
    for (const portion of roadPortions(road, allRoads)) {
      const smoothPts = resamplePolyline(portion.pts, 1.8)
      const N = smoothPts.length
      if (N >= 2) {
        const normals = computePolylineNormals(smoothPts)
        const roadVerts: number[] = []
        const roadIdx: number[] = []
        const ROAD_Y = 0.028
        for (let i = 0; i < N; i++) {
          const curr = smoothPts[i]!
          const norm = normals[i]!
          const nx = norm.nx
          const nz = norm.nz
          const miter = norm.miter
          const w = halfW * miter

          roadVerts.push(
            curr.x + nx * w, ROAD_Y, curr.z + nz * w,
            curr.x - nx * w, ROAD_Y, curr.z - nz * w,
          )
          if (i < N - 1) {
            const b = i * 2
            roadIdx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2)
            roadIdx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3)
          }
        }
        if (roadVerts.length >= 9 && roadIdx.length >= 3) {
          const roadCol = RAPIER.ColliderDesc.trimesh(
            new Float32Array(roadVerts),
            new Uint32Array(roadIdx),
          ).setFriction(0.35).setRestitution(0.0)
          descs.push(roadCol)
        }
      }
    }
  }

  return descs
}

function cellKeyOf(p: Pt): string {
  return `${Math.floor(p.x / 500)}:${Math.floor(p.z / 500)}`
}

const buildCellCache = new WeakMap<Road[], { x: number; z: number } | null>()

function inferBuildCell(allRoads?: Road[]): { x: number; z: number } | null {
  if (!allRoads || allRoads.length < 2) return null
  const cached = buildCellCache.get(allRoads)
  if (cached !== undefined) return cached
  let inter: Set<string> | null = null
  for (const r of allRoads) {
    if (r.points.length === 0) continue
    const cells = new Set<string>()
    for (const p of r.points) cells.add(cellKeyOf(p))
    if (!inter) inter = cells
    else for (const k of [...inter]) if (!cells.has(k)) inter.delete(k)
    if (inter.size === 0) break
  }
  let cell: { x: number; z: number } | null = null
  if (inter && inter.size === 1) {
    const [kx, kz] = [...inter][0]!.split(':').map(Number) as [number, number]
    cell = { x: kx, z: kz }
  } else if (inter && inter.size > 1) {
    const counts = new Map<string, number>()
    for (const r of allRoads) for (const p of r.points) {
      const k = cellKeyOf(p)
      if (inter.has(k)) counts.set(k, (counts.get(k) ?? 0) + 1)
    }
    let bestK: string | null = null
    let best = 0
    let tie = false
    for (const [k, n] of counts) {
      if (n > best) { best = n; bestK = k; tie = false }
      else if (n === best) tie = true
    }
    if (bestK && !tie) {
      const [kx, kz] = bestK.split(':').map(Number) as [number, number]
      cell = { x: kx, z: kz }
    }
  }
  buildCellCache.set(allRoads, cell)
  return cell
}

export type RoadPortion = {
  pts: Pt[]
  openStart: boolean
  openEnd: boolean
  arcStart: number
}

function cellEntryT(a: Pt, b: Pt): number {
  const cx = Math.floor(b.x / 500)
  const cz = Math.floor(b.z / 500)
  const x0 = cx * 500
  const x1 = x0 + 500
  const z0 = cz * 500
  const z1 = z0 + 500
  let t = 0
  const dx = b.x - a.x
  const dz = b.z - a.z
  if (a.x < x0 && dx > 1e-9) t = Math.max(t, (x0 - a.x) / dx)
  else if (a.x >= x1 && dx < -1e-9) t = Math.max(t, (x1 - a.x) / dx)
  if (a.z < z0 && dz > 1e-9) t = Math.max(t, (z0 - a.z) / dz)
  else if (a.z >= z1 && dz < -1e-9) t = Math.max(t, (z1 - a.z) / dz)
  return Math.max(0, Math.min(1, t))
}

function splitRoadForCell(points: Pt[], cell: { x: number; z: number }): RoadPortion[] {
  const inCell = (p: Pt): boolean => Math.floor(p.x / 500) === cell.x && Math.floor(p.z / 500) === cell.z
  const portions: RoadPortion[] = []
  let cur: RoadPortion | null = null
  let arc = 0
  const close = (openEnd: boolean): void => {
    if (cur && cur.pts.length >= 2) {
      let len = 0
      for (let i = 1; i < cur.pts.length; i++) len += Math.hypot(cur.pts[i]!.x - cur.pts[i - 1]!.x, cur.pts[i]!.z - cur.pts[i - 1]!.z)
      if (len > 0.05) { cur.openEnd = openEnd; portions.push(cur) }
    }
    cur = null
  }
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!
    const b = points[i + 1]!
    const segLen = Math.hypot(b.x - a.x, b.z - a.z)
    const ca = inCell(a)
    const cb = inCell(b)
    if (ca) {
      if (!cur) cur = { pts: [a], openStart: false, openEnd: false, arcStart: arc }
      if (cb) {
        cur.pts.push(b)
      } else {
        const t = cellEntryT(a, b)
        cur.pts.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t })
        close(true)
      }
    } else if (cb) {
      const t = cellEntryT(a, b)
      cur = { pts: [{ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t }], openStart: true, openEnd: false, arcStart: arc + segLen * t }
      cur.pts.push(b)
    }
    arc += segLen
  }
  close(false)
  return portions
}

export function buildCellOf(allRoads?: Road[], opts?: { cell?: { x: number; z: number } }): { x: number; z: number } | null {
  return opts?.cell ?? inferBuildCell(allRoads)
}

export function roadPortions(road: Road, allRoads?: Road[], opts?: { cell?: { x: number; z: number } }): RoadPortion[] {
  const cell = buildCellOf(allRoads, opts)
  if (!cell) return [{ pts: road.points, openStart: false, openEnd: false, arcStart: 0 }]
  return splitRoadForCell(road.points, cell)
}

export function clipGroupToCell(group: THREE.Group, cell: { x: number; z: number }): THREE.Group | null {
  const CHUNK_SIZE = 500
  const x0 = cell.x * CHUNK_SIZE
  const x1 = x0 + CHUNK_SIZE
  const z0 = cell.z * CHUNK_SIZE
  const z1 = z0 + CHUNK_SIZE
  group.updateMatrixWorld(true)
  const remove: THREE.Object3D[] = []
  const v = new THREE.Vector3()
  group.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh || !m.geometry || (m as THREE.InstancedMesh).isInstancedMesh) return
    const geo = m.geometry
    const pos = geo.getAttribute('position') as THREE.BufferAttribute | undefined
    if (!pos) return
    const idx = geo.getIndex()
    const triCount = Math.floor((idx ? idx.count : pos.count) / 3)
    const keep: number[] = []
    for (let t = 0; t < triCount; t++) {
      let cx = 0
      let cz = 0
      for (let k = 0; k < 3; k++) {
        const i = idx ? idx.getX(t * 3 + k) : t * 3 + k
        v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld)
        cx += v.x
        cz += v.z
      }
      cx /= 3
      cz /= 3
      if (cx >= x0 && cx < x1 && cz >= z0 && cz < z1) keep.push(t)
    }
    if (keep.length === triCount) return
    if (keep.length === 0) { remove.push(m); return }
    const newIdx: number[] = []
    for (const t of keep) {
      for (let k = 0; k < 3; k++) newIdx.push(idx ? idx.getX(t * 3 + k) : t * 3 + k)
    }
    const clipped = geo.clone()
    clipped.setIndex(newIdx)
    m.geometry = clipped
  })
  for (const m of remove) m.parent?.remove(m)
  // Collect first, detach after: Object3D.traverse caches children.length before
  // it recurses, so removing a child from inside the callback makes it read past
  // the end of the shrunken array and call .traverse on undefined.
  let changed = true
  while (changed) {
    changed = false
    const empty: THREE.Object3D[] = []
    group.traverse((o) => {
      if (o !== group && !(o as THREE.Mesh).isMesh && o.children.length === 0 && o.parent) {
        empty.push(o)
      }
    })
    for (const o of empty) {
      o.parent?.remove(o)
      changed = true
    }
  }
  return group.children.length > 0 ? group : null
}