/**
 * ParkMeshGenerator — renders OSM parks, gardens, and green spaces.
 *
 * Features:
 *   - Rich PBR lawn surfaces with seamless procedural grass texture
 *   - Completely open perimeter (no fences or blocking barriers)
 *   - Highly realistic Parisian tree archetypes (Platanes, Tilleuls, Arbres d'ornement)
 *     with authentic bark trunks, spreading boughs, and lush billowing leafy crowns
 *   - Authentic Parisian park furniture (Bancs publics Davioud en fonte et bois)
 *   - Organic shrubs, flowerbeds, and compacted gravel walking paths
 *   - Accurate Rapier tree-trunk colliders (open access for driving on grass)
 */

import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import type { ChunkId } from '@world-drive/math'
import type { Park, PointOfInterest, Road } from '@world-drive/shared'
import { PARK_MATS, TRUNK_MAT, PATH_GRAVEL_MAT } from './ParkMaterials.js'
import { getPlataneTemplate, getLindenTemplate, getOrnamentalTemplate } from './TreeTemplates.js'
import { getBenchTemplate } from './BenchTemplate.js'
import { getShrubTemplate } from './ShrubTemplate.js'
import {
  isPointInPolygon,
  isPointInRect,
  buildRoadObstacles,
  isPointInRoadObstacles,
  computeTreePlacements,
  chunkBounds,
  clipPolygonToRect,
  polygonArea,
  polygonCentroid,
} from './ParkHelpers.js'

export class ParkMeshGenerator {
  /**
   * Generate a 3D park group with rich procedural lawn, realistic tree archetypes,
   * benches, flowerbeds, and walking paths (without any blocking fences or barriers).
   *
   * The same park object lives in every chunk its polygon touches: `ownerChunk`
   * restricts this build to that chunk's cell (clipped lawn, owned trees only,
   * centroid-owned overlays) so geometry and colliders are never duplicated.
   */
  static generate(
    park: Park,
    roads?: Road[],
    pois?: PointOfInterest[],
    ownerChunk?: ChunkId,
  ): THREE.Group | null {
    const pts = park.polygon
    if (pts.length < 3) return null

    // ── 0. Deduplicate and clean polygon points ────────────────────────────
    const cleanPts: { x: number; z: number }[] = []
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i]!
      if (cleanPts.length > 0) {
        const prev = cleanPts[cleanPts.length - 1]!
        if (Math.hypot(p.x - prev.x, p.z - prev.z) < 0.01) continue
      }
      cleanPts.push(p)
    }
    if (cleanPts.length > 2) {
      const first = cleanPts[0]!
      const last = cleanPts[cleanPts.length - 1]!
      if (Math.hypot(first.x - last.x, first.z - last.z) < 0.01) {
        cleanPts.pop()
      }
    }
    if (cleanPts.length < 3) return null

    const roadObs = buildRoadObstacles(roads)
    const group = new THREE.Group()
    group.userData['parkId'] = park.id

    // ── Single-owner partitioning: this chunk only builds its own cell ──────
    const ownerRect = ownerChunk ? chunkBounds(ownerChunk) : null
    // Overlays and the central path are built once, by the centroid's chunk.
    const centroid = polygonCentroid(pts)
    const ownsOverlays = !ownerRect || isPointInRect(centroid.x, centroid.z, ownerRect)

    // ── 1. Park Lawn Surface ────────────────────────────────────────────────
    // Placed at y = 0.022m (cleanly above urban slab at 0.001m, and flush/below road asphalt at 0.028m).
    // In Three.js, Shape is constructed in 2D (x, y). When rotateX(-PI/2) is applied,
    // (x, y, 0) -> (x, 0, -y). Therefore, to get world (x, 0, z), we must pass (x, -z) to Shape!
    // The lawn is clipped to the owner chunk: adjacent chunks share only an
    // edge, never an overlapping surface (no z-fighting).
    const lawnPts = ownerRect ? clipPolygonToRect(cleanPts, ownerRect) : cleanPts
    if (lawnPts.length >= 3 && polygonArea(lawnPts) > 0.01) {
    try {
      const shape = new THREE.Shape()
      shape.moveTo(lawnPts[0]!.x, -lawnPts[0]!.z)
      for (let i = 1; i < lawnPts.length; i++) {
        shape.lineTo(lawnPts[i]!.x, -lawnPts[i]!.z)
      }
      shape.closePath()

      const geo = new THREE.ShapeGeometry(shape)
      geo.rotateX(-Math.PI / 2)
      geo.translate(0, 0.022, 0)

      // Compute seamless world-space planar UV mapping for grass texture (repeats every 8m)
      const posAttr = geo.getAttribute('position')
      if (posAttr) {
        const uvs = new Float32Array(posAttr.count * 2)
        for (let i = 0; i < posAttr.count; i++) {
          uvs[i * 2] = posAttr.getX(i) / 8.0
          uvs[i * 2 + 1] = posAttr.getZ(i) / 8.0
        }
        geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
      }

      geo.computeVertexNormals()

      const mat = PARK_MATS[park.type] ?? PARK_MATS['park']
      const lawn = new THREE.Mesh(geo, mat)
      lawn.receiveShadow = true
      lawn.renderOrder = 2
      group.add(lawn)
    } catch (err) {
      console.warn(`[ParkMeshGenerator] Failed to triangulate park ${park.id}:`, err)
    }
    }

    // ── 2. Type-specific overlays (Cemetery, Parking lot, Pitch) ────────────
    // Built once by the centroid's chunk (positions are seeded from the park
    // id, so unowned chunks would stack identical copies).
    if (ownsOverlays && park.type === 'cemetery') {
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
      for (const p of pts) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z) }
      const w = maxX - minX; const d = maxZ - minZ
      let seed = 0
      for (let i = 0; i < park.id.length; i++) seed = (seed * 31 + park.id.charCodeAt(i)) >>> 0
      const pseudoR = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280 }
      const crossMat = new THREE.MeshStandardMaterial({ color: 0xb0a898, roughness: 0.88, metalness: 0.04 })
      const numCrosses = Math.min(20, Math.floor((w * d) / 30) + 2)
      for (let c = 0; c < numCrosses * 3; c++) {
        const cx = minX + pseudoR() * w; const cz = minZ + pseudoR() * d
        if (!isPointInPolygon(cx, cz, pts)) continue
        const hGeo = new THREE.BoxGeometry(0.8, 0.08, 0.08)
        const hMesh = new THREE.Mesh(hGeo, crossMat)
        hMesh.position.set(cx, 0.7, cz)
        group.add(hMesh)
        const vGeo = new THREE.BoxGeometry(0.08, 1.1, 0.08)
        const vMesh = new THREE.Mesh(vGeo, crossMat)
        vMesh.position.set(cx, 0.55, cz)
        group.add(vMesh)
        if (group.children.length > 200) break
      }
    }

    if (ownsOverlays && park.type === 'parking_lot') {
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
      for (const p of pts) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z) }
      const lineMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, emissive: 0xffffff, emissiveIntensity: 0.08, polygonOffset: true, polygonOffsetFactor: 2.0, polygonOffsetUnits: 2.0 })
      const bayW = 2.5
      const bayDepth = 5.0
      for (let x = minX; x < maxX; x += bayW) {
        for (let z = minZ; z < maxZ - bayDepth; z += bayDepth) {
          const lineGeo = new THREE.BoxGeometry(0.08, 0.01, bayDepth)
          const lineMesh = new THREE.Mesh(lineGeo, lineMat)
          lineMesh.position.set(x, 0.018, z + bayDepth / 2)
          group.add(lineMesh)
        }
      }
    }

    if (ownsOverlays && park.type === 'pitch') {
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
      for (const p of pts) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z) }
      const cX = (minX + maxX) / 2; const cZ = (minZ + maxZ) / 2
      const w = maxX - minX; const d = maxZ - minZ
      const lineMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, emissive: 0xffffff, emissiveIntensity: 0.1, polygonOffset: true, polygonOffsetFactor: 2.0, polygonOffsetUnits: 2.0 })
      const borders: [number, number, number, number][] = [
        [minX, cZ, 0.10, d],
        [maxX, cZ, 0.10, d],
        [cX, minZ, w, 0.10],
        [cX, maxZ, w, 0.10],
        [cX, cZ, 0.10, d],
      ]
      for (const [bx, bz, bw, bd] of borders) {
        const bg = new THREE.BoxGeometry(bw, 0.01, bd)
        const bm = new THREE.Mesh(bg, lineMat)
        bm.position.set(bx, 0.02, bz)
        group.add(bm)
      }
      const circleR = Math.min(w, d) * 0.12
      const circleGeo = new THREE.TorusGeometry(circleR, 0.05, 4, 32)
      circleGeo.rotateX(Math.PI / 2)
      const circleMesh = new THREE.Mesh(circleGeo, lineMat)
      circleMesh.position.set(cX, 0.02, cZ)
      group.add(circleMesh)
    }

    // ── 3. Internal Compacted Sand Walking Path (for larger gardens) ───────
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
    for (const p of pts) {
      if (p.x < minX) minX = p.x
      if (p.x > maxX) maxX = p.x
      if (p.z < minZ) minZ = p.z
      if (p.z > maxZ) maxZ = p.z
    }
    const width = maxX - minX
    const depth = maxZ - minZ
    const approxArea = width * depth

    if (ownsOverlays && (park.type === 'park' || park.type === 'garden') && approxArea >= 350) {
      const cX = (minX + maxX) / 2
      const cZ = (minZ + maxZ) / 2
      // Draw a cross or central path
      const pathW = 2.4
      const p1Geo = new THREE.BoxGeometry(width * 0.7, 0.005, pathW)
      const p1Mesh = new THREE.Mesh(p1Geo, PATH_GRAVEL_MAT)
      p1Mesh.position.set(cX, 0.025, cZ)
      p1Mesh.receiveShadow = true
      p1Mesh.renderOrder = 3
      group.add(p1Mesh)

      if (depth > 25 && width > 25) {
        const p2Geo = new THREE.BoxGeometry(pathW, 0.005, depth * 0.7)
        const p2Mesh = new THREE.Mesh(p2Geo, PATH_GRAVEL_MAT)
        p2Mesh.position.set(cX, 0.025, cZ)
        p2Mesh.receiveShadow = true
        p2Mesh.renderOrder = 3
        group.add(p2Mesh)
      }
    }

    // ── 4. Realistic 3D Trees Scatter ──────────────────────────────────────
    // Placements are shared with createColliderDescs() (same positions AND
    // same archetype/scale draws): visual trunks and physics trunks match.
    // Only the trees inside this chunk's cell are built here.
    const ownedPlacements = (() => {
      const all = computeTreePlacements(park.id, pts, park.type, roads, pois)
      if (!ownerRect) return all
      return all.filter((t) => isPointInRect(t.x, t.z, ownerRect))
    })()
    if (ownedPlacements.length > 0) {
      const archetypes = [
        getPlataneTemplate(),    // Marronnier / Platane parisien
        getLindenTemplate(),     // Tilleul / Chêne
        getOrnamentalTemplate(), // Arbre d'ornement / Cerisier
      ]

      let seed = 0
      for (let i = 0; i < park.id.length; i++) seed = (seed * 31 + park.id.charCodeAt(i)) >>> 0
      function pseudoRandom(): number {
        seed = (seed * 9301 + 49297) % 233280
        return seed / 233280
      }

      const treeLocations: Array<{ x: number; z: number }> = []
      for (const placement of ownedPlacements) {
        const template = archetypes[placement.archetype]!
        const tree = template.clone()

        // Natural variations in scale, orientation, and subtle tilt
        tree.scale.set(placement.scale, placement.scale, placement.scale)
        tree.rotation.y = placement.rotY
        tree.rotation.z = placement.lean // natural slight lean

        tree.position.set(placement.x, 0, placement.z)
        group.add(tree)

        treeLocations.push({ x: placement.x, z: placement.z })
      }

        // ── 5. Park Furniture: Parisian Davioud Benches & Shrubs ────────────
        if ((park.type === 'park' || park.type === 'garden') && treeLocations.length > 0) {
          const benchTemplate = getBenchTemplate()
          const shrubTemplate = getShrubTemplate()

          // Place 2 to 6 benches under shade trees
          const numBenches = Math.min(6, Math.max(2, Math.floor(treeLocations.length / 3)))
          for (let b = 0; b < numBenches && b < treeLocations.length; b++) {
            const loc = treeLocations[b * 2 % treeLocations.length]!
            const bench = benchTemplate.clone()
            const bDist = 2.2 + pseudoRandom() * 0.8
            const bAng = pseudoRandom() * Math.PI * 2
            const bx = loc.x + Math.cos(bAng) * bDist
            const bz = loc.z + Math.sin(bAng) * bDist

            if (isPointInPolygon(bx, bz, pts) && !isPointInRoadObstacles(bx, bz, roadObs, 1.0)) {
              bench.position.set(bx, 0.016, bz)
              bench.rotation.y = bAng + Math.PI // Face outward from tree
              group.add(bench)
            }
          }

          // Place flowering shrubs near trees
          const numShrubs = Math.min(10, Math.max(3, Math.floor(treeLocations.length / 2)))
          for (let s = 0; s < numShrubs && s < treeLocations.length; s++) {
            const loc = treeLocations[(s * 3 + 1) % treeLocations.length]!
            const shrub = shrubTemplate.clone()
            const sDist = 1.8 + pseudoRandom() * 1.2
            const sAng = pseudoRandom() * Math.PI * 2
            const sx = loc.x + Math.cos(sAng) * sDist
            const sz = loc.z + Math.sin(sAng) * sDist

            if (isPointInPolygon(sx, sz, pts) && !isPointInRoadObstacles(sx, sz, roadObs, 0.8)) {
              const sScale = 0.75 + pseudoRandom() * 0.5
              shrub.scale.set(sScale, sScale, sScale)
              shrub.position.set(sx, 0.016, sz)
              shrub.rotation.y = pseudoRandom() * Math.PI * 2
              group.add(shrub)
            }
          }
        }
      }

    return group
  }

  /**
   * Generates Rapier static colliders for park tree trunks ONLY.
   * Perimeter fences and barrier colliders are completely omitted,
   * allowing cars to drive seamlessly onto park grass.
   */
  static createColliderDescs(
    park: Park,
    roads?: Road[],
    pois?: PointOfInterest[],
    ownerChunk?: ChunkId,
  ): RAPIER.ColliderDesc[] {
    const pts = park.polygon
    if (pts.length < 3) return []

    // Same deterministic placements as the visual trees above, restricted to
    // this chunk's cell: every visible trunk gets exactly one collider, no
    // invisible walls, no stacked duplicates.
    const ownerRect = ownerChunk ? chunkBounds(ownerChunk) : null
    const colliders: RAPIER.ColliderDesc[] = []
    for (const t of computeTreePlacements(park.id, pts, park.type, roads, pois)) {
      if (ownerRect && !isPointInRect(t.x, t.z, ownerRect)) continue
      // Solid trunk cylinder (radius 0.38m ≈ visual trunk base, half-height
      // 1.6m centered at y = 1.6m so low branches don't catch the car).
      colliders.push(
        RAPIER.ColliderDesc.cylinder(1.6, 0.38).setTranslation(t.x, 1.6, t.z),
      )
    }
    return colliders
  }
}

