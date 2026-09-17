/**
 * ParkMeshGenerator — renders OSM parks, gardens, and green spaces.
 *
 * Features:
 *   - Rich PBR lawn surfaces for parks, gardens, and urban grass
 *   - Delimited low perimeter fence / railing with stone base and metal bars
 *   - Regular entrance openings (portes / passages piétons) flanked by stone pillars
 *   - Procedural 3D trees scattered inside park boundaries
 *   - Low-poly stylized trees with trunks and lush foliage
 */

import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import type { Park, ParkType, Road } from '@world-drive/shared'

// ── Park grass materials ───────────────────────────────────────────────────
// Depth offset pushes park lawn into background so road asphalt & sidewalks always win depth testing
const PARK_MATS: Record<ParkType, THREE.MeshStandardMaterial> = {
  park:       new THREE.MeshStandardMaterial({ color: 0x3a6e35, roughness: 0.94, metalness: 0.0, polygonOffset: true, polygonOffsetFactor: 4.0, polygonOffsetUnits: 4.0 }),
  garden:     new THREE.MeshStandardMaterial({ color: 0x427c3d, roughness: 0.92, metalness: 0.0, polygonOffset: true, polygonOffsetFactor: 4.0, polygonOffsetUnits: 4.0 }),
  grass:      new THREE.MeshStandardMaterial({ color: 0x4c8544, roughness: 0.95, metalness: 0.0, polygonOffset: true, polygonOffsetFactor: 4.0, polygonOffsetUnits: 4.0 }),
  forest:     new THREE.MeshStandardMaterial({ color: 0x2b5428, roughness: 0.90, metalness: 0.0, polygonOffset: true, polygonOffsetFactor: 4.0, polygonOffsetUnits: 4.0 }),
  recreation: new THREE.MeshStandardMaterial({ color: 0x487e40, roughness: 0.92, metalness: 0.0, polygonOffset: true, polygonOffsetFactor: 4.0, polygonOffsetUnits: 4.0 }),
}

// ── Tree materials ─────────────────────────────────────────────────────────
const TRUNK_MAT = new THREE.MeshStandardMaterial({
  color: 0x3d2817, // dark bark wood
  roughness: 0.90,
})

const FOLIAGE_MATS = [
  new THREE.MeshStandardMaterial({ color: 0x286326, roughness: 0.84 }),
  new THREE.MeshStandardMaterial({ color: 0x32752e, roughness: 0.84 }),
  new THREE.MeshStandardMaterial({ color: 0x225420, roughness: 0.84 }),
  new THREE.MeshStandardMaterial({ color: 0x3d8236, roughness: 0.84 }),
]

// ── Perimeter fence materials ──────────────────────────────────────────────
const FENCE_STONE_MAT = new THREE.MeshStandardMaterial({
  color: 0xc4bead, // Light Paris limestone / sandstone
  roughness: 0.86,
  metalness: 0.04,
})

const FENCE_METAL_MAT = new THREE.MeshStandardMaterial({
  color: 0x1c2420, // Dark wrought iron / heritage green-black
  roughness: 0.55,
  metalness: 0.50,
})

// Reusable tree prototype
let _treeTemplate: THREE.Group | null = null
function getTreeTemplate(): THREE.Group {
  if (_treeTemplate) return _treeTemplate

  const group = new THREE.Group()

  // Trunk (height 2.4m)
  const trunkGeo = new THREE.CylinderGeometry(0.18, 0.26, 2.4, 6)
  trunkGeo.translate(0, 1.2, 0)
  const trunk = new THREE.Mesh(trunkGeo, TRUNK_MAT)
  trunk.castShadow = true
  group.add(trunk)

  // Foliage tier 1 (lower)
  const foliageGeo1 = new THREE.ConeGeometry(1.6, 2.5, 7)
  foliageGeo1.translate(0, 3.2, 0)
  const foliage1 = new THREE.Mesh(foliageGeo1, FOLIAGE_MATS[0]!)
  foliage1.castShadow = true
  foliage1.receiveShadow = true
  group.add(foliage1)

  // Foliage tier 2 (upper)
  const foliageGeo2 = new THREE.ConeGeometry(1.2, 2.2, 7)
  foliageGeo2.translate(0, 4.4, 0)
  const foliage2 = new THREE.Mesh(foliageGeo2, FOLIAGE_MATS[1]!)
  foliage2.castShadow = true
  foliage2.receiveShadow = true
  group.add(foliage2)

  _treeTemplate = group
  return _treeTemplate
}

/**
 * Point in polygon test (2D Ray-casting).
 */
function isPointInPolygon(px: number, pz: number, polygon: { x: number; z: number }[]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i]!.x, zi = polygon[i]!.z
    const xj = polygon[j]!.x, zj = polygon[j]!.z
    const intersect = (zi > pz) !== (zj > pz) && px < ((xj - xi) * (pz - zi)) / (zj - zi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

/**
 * Helper to push an oriented 3D cuboid into vertex/normal/index arrays.
 */
function addOrientedBox(
  posList: number[],
  normList: number[],
  idxList: number[],
  cx: number,
  cz: number,
  yMin: number,
  yMax: number,
  halfLen: number,
  halfWidth: number,
  ux: number,
  uz: number,
  nx: number,
  nz: number,
) {
  const baseIdx = posList.length / 3

  const c0x = cx - ux * halfLen - nx * halfWidth
  const c0z = cz - uz * halfLen - nz * halfWidth

  const c1x = cx + ux * halfLen - nx * halfWidth
  const c1z = cz + uz * halfLen - nz * halfWidth

  const c2x = cx + ux * halfLen + nx * halfWidth
  const c2z = cz + uz * halfLen + nz * halfWidth

  const c3x = cx - ux * halfLen + nx * halfWidth
  const c3z = cz - uz * halfLen + nz * halfWidth

  // Face 0: Top (+Y)
  posList.push(c0x, yMax, c0z,  c1x, yMax, c1z,  c2x, yMax, c2z,  c3x, yMax, c3z)
  normList.push(0, 1, 0,  0, 1, 0,  0, 1, 0,  0, 1, 0)
  idxList.push(baseIdx, baseIdx + 1, baseIdx + 2, baseIdx, baseIdx + 2, baseIdx + 3)

  // Face 1: Bottom (-Y)
  const b1 = baseIdx + 4
  posList.push(c3x, yMin, c3z,  c2x, yMin, c2z,  c1x, yMin, c1z,  c0x, yMin, c0z)
  normList.push(0, -1, 0,  0, -1, 0,  0, -1, 0,  0, -1, 0)
  idxList.push(b1, b1 + 1, b1 + 2, b1, b1 + 2, b1 + 3)

  // Face 2: Side +N
  const b2 = baseIdx + 8
  posList.push(c2x, yMin, c2z,  c3x, yMin, c3z,  c3x, yMax, c3z,  c2x, yMax, c2z)
  normList.push(nx, 0, nz,  nx, 0, nz,  nx, 0, nz,  nx, 0, nz)
  idxList.push(b2, b2 + 1, b2 + 2, b2, b2 + 2, b2 + 3)

  // Face 3: Side -N
  const b3 = baseIdx + 12
  posList.push(c0x, yMin, c0z,  c1x, yMin, c1z,  c1x, yMax, c1z,  c0x, yMax, c0z)
  normList.push(-nx, 0, -nz,  -nx, 0, -nz,  -nx, 0, -nz,  -nx, 0, -nz)
  idxList.push(b3, b3 + 1, b3 + 2, b3, b3 + 2, b3 + 3)

  // Face 4: End +U
  const b4 = baseIdx + 16
  posList.push(c1x, yMin, c1z,  c2x, yMin, c2z,  c2x, yMax, c2z,  c1x, yMax, c1z)
  normList.push(ux, 0, uz,  ux, 0, uz,  ux, 0, uz,  ux, 0, uz)
  idxList.push(b4, b4 + 1, b4 + 2, b4, b4 + 2, b4 + 3)

  // Face 5: End -U
  const b5 = baseIdx + 20
  posList.push(c3x, yMin, c3z,  c0x, yMin, c0z,  c0x, yMax, c0z,  c3x, yMax, c3z)
  normList.push(-ux, 0, -uz,  -ux, 0, -uz,  -ux, 0, -uz,  -ux, 0, -uz)
  idxList.push(b5, b5 + 1, b5 + 2, b5, b5 + 2, b5 + 3)
}

interface RoadObstacleSeg {
  x1: number; z1: number; x2: number; z2: number
  dx: number; dz: number; lenSq: number; halfW: number
  minX: number; maxX: number; minZ: number; maxZ: number
}

function buildRoadObstacles(roads?: Road[]): RoadObstacleSeg[] {
  if (!roads || roads.length === 0) return []
  const obs: RoadObstacleSeg[] = []
  for (const r of roads) {
    const isMajor = r.highway === 'primary' || r.highway === 'motorway' || r.highway === 'trunk'
    const lanes = isMajor ? Math.max(4, r.lanes) : Math.max(2, r.lanes)
    const halfW = (lanes * 3.6) / 2
    const pts = r.points
    for (let i = 0; i < pts.length - 1; i++) {
      const p1 = pts[i]!
      const p2 = pts[i + 1]!
      const dx = p2.x - p1.x
      const dz = p2.z - p1.z
      const lenSq = dx * dx + dz * dz
      if (lenSq < 1e-4) continue
      obs.push({
        x1: p1.x, z1: p1.z,
        x2: p2.x, z2: p2.z,
        dx, dz, lenSq,
        halfW,
        minX: Math.min(p1.x, p2.x),
        maxX: Math.max(p1.x, p2.x),
        minZ: Math.min(p1.z, p2.z),
        maxZ: Math.max(p1.z, p2.z),
      })
    }
  }
  return obs
}

function isPointInRoadObstacles(px: number, pz: number, obs: RoadObstacleSeg[], margin = 0.5): boolean {
  for (let i = 0; i < obs.length; i++) {
    const ob = obs[i]!
    const r = ob.halfW + margin
    if (px < ob.minX - r || px > ob.maxX + r || pz < ob.minZ - r || pz > ob.maxZ + r) continue
    let t = ((px - ob.x1) * ob.dx + (pz - ob.z1) * ob.dz) / ob.lenSq
    t = Math.max(0, Math.min(1, t))
    const projX = ob.x1 + t * ob.dx
    const projZ = ob.z1 + t * ob.dz
    if ((px - projX) ** 2 + (pz - projZ) ** 2 < r * r) return true
  }
  return false
}

export class ParkMeshGenerator {
  /**
   * Generate a 3D park group with grass lawn, low perimeter boundary fences
   * with entrance openings, and procedural trees.
   */
  static generate(park: Park, roads?: Road[]): THREE.Group | null {
    const pts = park.polygon
    if (pts.length < 3) return null

    const roadObs = buildRoadObstacles(roads)
    const group = new THREE.Group()
    group.userData['parkId'] = park.id

    // ── 1. Park Lawn Surface ────────────────────────────────────────────────
    // Lowered to y = 0.003m and using polygonOffset so asphalt roads & sidewalks
    // always render cleanly on top with zero z-fighting.
    const shape = new THREE.Shape()
    shape.moveTo(pts[0]!.x, pts[0]!.z)
    for (let i = 1; i < pts.length; i++) {
      shape.lineTo(pts[i]!.x, pts[i]!.z)
    }
    shape.closePath()

    const geo = new THREE.ShapeGeometry(shape)
    geo.rotateX(-Math.PI / 2)
    geo.translate(0, 0.003, 0)
    geo.computeVertexNormals()

    const mat = PARK_MATS[park.type] ?? PARK_MATS['park']
    const lawn = new THREE.Mesh(geo, mat)
    lawn.receiveShadow = true
    lawn.renderOrder = 1
    group.add(lawn)

    // ── 2. Delimited Low Barrier / Fence with Openings ──────────────────────
    // Parks, gardens and squares have urban perimeter fences with pedestrian openings.
    if (park.type !== 'forest') {
      const stonePos: number[] = []
      const stoneNorm: number[] = []
      const stoneIdx: number[] = []

      const metalPos: number[] = []
      const metalNorm: number[] = []
      const metalIdx: number[] = []

      const GATE_WIDTH = 3.6 // 3.6m wide entrance opening
      const HALF_GATE = GATE_WIDTH / 2
      const N = pts.length

      for (let i = 0; i < N; i++) {
        const A = pts[i]!
        const B = pts[(i + 1) % N]!

        // Skip fence segments that cross or run inside a road corridor
        if (
          isPointInRoadObstacles(A.x, A.z, roadObs, 0.6) ||
          isPointInRoadObstacles(B.x, B.z, roadObs, 0.6) ||
          isPointInRoadObstacles((A.x + B.x) / 2, (A.z + B.z) / 2, roadObs, 0.6)
        ) {
          continue
        }

        const dx = B.x - A.x
        const dz = B.z - A.z
        const edgeLen = Math.hypot(dx, dz)
        if (edgeLen < 3.0) continue

        const ux = dx / edgeLen
        const uz = dz / edgeLen
        const nx = -uz
        const nz = ux

        // Corner pillar at vertex A
        addOrientedBox(
          stonePos, stoneNorm, stoneIdx,
          A.x, A.z,
          0.0, 0.78,
          0.16, 0.16,
          ux, uz, nx, nz
        )
        // Corner decorative cap
        addOrientedBox(
          stonePos, stoneNorm, stoneIdx,
          A.x, A.z,
          0.78, 0.88,
          0.20, 0.20,
          ux, uz, nx, nz
        )

        // Calculate gate openings along this edge
        type Segment = { start: number; end: number }
        const fenceSegments: Segment[] = []
        const gateCutoffs: number[] = []

        if (edgeLen < 9.5) {
          // Short edge: single continuous fence without opening
          fenceSegments.push({ start: 0.25, end: edgeLen - 0.25 })
        } else if (edgeLen < 26.0) {
          // Medium edge: 1 centered opening
          const center = edgeLen / 2
          const gStart = Math.max(1.2, center - HALF_GATE)
          const gEnd = Math.min(edgeLen - 1.2, center + HALF_GATE)

          if (gStart - 0.25 > 0.6) fenceSegments.push({ start: 0.25, end: gStart })
          gateCutoffs.push(gStart, gEnd)
          if (edgeLen - 0.25 - gEnd > 0.6) fenceSegments.push({ start: gEnd, end: edgeLen - 0.25 })
        } else {
          // Long edge: multiple openings spaced ~22m to 28m apart
          const numGates = Math.max(1, Math.round(edgeLen / 26))
          const gateSpacing = edgeLen / (numGates + 1)

          let cursor = 0.25
          for (let g = 1; g <= numGates; g++) {
            const gCenter = g * gateSpacing
            const gStart = gCenter - HALF_GATE
            const gEnd = gCenter + HALF_GATE

            if (gStart - cursor > 0.6) {
              fenceSegments.push({ start: cursor, end: gStart })
            }
            gateCutoffs.push(gStart, gEnd)
            cursor = gEnd
          }
          if (edgeLen - 0.25 - cursor > 0.6) {
            fenceSegments.push({ start: cursor, end: edgeLen - 0.25 })
          }
        }

        // Stone entrance pillars flanking each opening
        for (const tGate of gateCutoffs) {
          const px = A.x + ux * tGate
          const pz = A.z + uz * tGate

          // Stately entrance pillar shaft (0.90m high)
          addOrientedBox(
            stonePos, stoneNorm, stoneIdx,
            px, pz,
            0.0, 0.88,
            0.20, 0.20,
            ux, uz, nx, nz
          )
          // Pillar capital / cap with slight overhang
          addOrientedBox(
            stonePos, stoneNorm, stoneIdx,
            px, pz,
            0.88, 0.98,
            0.25, 0.25,
            ux, uz, nx, nz
          )
        }

        // Build low barrier components for each fence segment
        for (const seg of fenceSegments) {
          const segLen = seg.end - seg.start
          if (segLen < 0.5) continue

          const midT = (seg.start + seg.end) / 2
          const cx = A.x + ux * midT
          const cz = A.z + uz * midT
          const halfLen = segLen / 2

          // 1. Low stone plinth curb (0.12m high)
          addOrientedBox(
            stonePos, stoneNorm, stoneIdx,
            cx, cz,
            0.0, 0.12,
            halfLen, 0.11,
            ux, uz, nx, nz
          )

          // 2. Top railing bar (at 0.70m)
          addOrientedBox(
            metalPos, metalNorm, metalIdx,
            cx, cz,
            0.64, 0.70,
            halfLen, 0.035,
            ux, uz, nx, nz
          )

          // 3. Mid railing bar (at 0.36m)
          addOrientedBox(
            metalPos, metalNorm, metalIdx,
            cx, cz,
            0.33, 0.37,
            halfLen, 0.025,
            ux, uz, nx, nz
          )

          // 4. Sturdy intermediate posts every ~2.5m
          const postCount = Math.max(1, Math.round(segLen / 2.5))
          for (let p = 0; p <= postCount; p++) {
            const pT = seg.start + p * (segLen / postCount)
            const px = A.x + ux * pT
            const pz = A.z + uz * pT
            addOrientedBox(
              metalPos, metalNorm, metalIdx,
              px, pz,
              0.12, 0.74,
              0.038, 0.038,
              ux, uz, nx, nz
            )
          }

          // 5. Vertical pickets (barreaux) spaced every ~0.5m
          const picketCount = Math.max(1, Math.floor(segLen / 0.55))
          for (let k = 1; k <= picketCount; k++) {
            const pkT = seg.start + k * (segLen / (picketCount + 1))
            const pkx = A.x + ux * pkT
            const pkz = A.z + uz * pkT
            addOrientedBox(
              metalPos, metalNorm, metalIdx,
              pkx, pkz,
              0.12, 0.67,
              0.016, 0.016,
              ux, uz, nx, nz
            )
          }
        }
      }

      // Add stone fence mesh if geometry was generated
      if (stonePos.length > 0) {
        const stoneGeo = new THREE.BufferGeometry()
        stoneGeo.setAttribute('position', new THREE.Float32BufferAttribute(stonePos, 3))
        stoneGeo.setAttribute('normal', new THREE.Float32BufferAttribute(stoneNorm, 3))
        stoneGeo.setIndex(stoneIdx)
        const stoneMesh = new THREE.Mesh(stoneGeo, FENCE_STONE_MAT)
        stoneMesh.castShadow = true
        stoneMesh.receiveShadow = true
        group.add(stoneMesh)
      }

      // Add metal railing mesh if geometry was generated
      if (metalPos.length > 0) {
        const metalGeo = new THREE.BufferGeometry()
        metalGeo.setAttribute('position', new THREE.Float32BufferAttribute(metalPos, 3))
        metalGeo.setAttribute('normal', new THREE.Float32BufferAttribute(metalNorm, 3))
        metalGeo.setIndex(metalIdx)
        const metalMesh = new THREE.Mesh(metalGeo, FENCE_METAL_MAT)
        metalMesh.castShadow = true
        metalMesh.receiveShadow = true
        group.add(metalMesh)
      }
    }

    // ── 3. Procedural Trees Scatter ─────────────────────────────────────────
    let minX = Infinity, maxX = -Infinity
    let minZ = Infinity, maxZ = -Infinity
    for (const p of pts) {
      if (p.x < minX) minX = p.x
      if (p.x > maxX) maxX = p.x
      if (p.z < minZ) minZ = p.z
      if (p.z > maxZ) maxZ = p.z
    }

    const width = maxX - minX
    const depth = maxZ - minZ
    const approxArea = width * depth

    if (approxArea >= 60) {
      // Scale number of trees according to park size (capped at 25 for 60 FPS performance)
      const numCandidates = Math.min(25, Math.floor(approxArea / 200) + 2)
      const treeTemplate = getTreeTemplate()

      // Deterministic seed based on park id
      let seed = 0
      for (let i = 0; i < park.id.length; i++) seed = (seed * 31 + park.id.charCodeAt(i)) >>> 0

      function pseudoRandom(): number {
        seed = (seed * 9301 + 49297) % 233280
        return seed / 233280
      }

      let treesPlaced = 0
      for (let attempt = 0; attempt < numCandidates * 2 && treesPlaced < numCandidates; attempt++) {
        const candidateX = minX + pseudoRandom() * width
        const candidateZ = minZ + pseudoRandom() * depth

        if (
          isPointInPolygon(candidateX, candidateZ, pts) &&
          !isPointInRoadObstacles(candidateX, candidateZ, roadObs, 1.5)
        ) {
          const tree = treeTemplate.clone()
          const scale = 0.8 + pseudoRandom() * 0.45
          tree.scale.set(scale, scale, scale)
          tree.rotation.y = pseudoRandom() * Math.PI * 2
          tree.position.set(candidateX, 0, candidateZ)
          group.add(tree)
          treesPlaced++
        }
      }
    }

    return group
  }

  /**
   * Generates Rapier static colliders for park fences, entrance posts, and tree trunks.
   */
  static createColliderDescs(park: Park, roads?: Road[]): RAPIER.ColliderDesc[] {
    const pts = park.polygon
    if (pts.length < 3) return []

    const colliders: RAPIER.ColliderDesc[] = []
    const roadObs = buildRoadObstacles(roads)

    // 1. Perimeter fence barriers and corner pillars
    if (park.type !== 'forest') {
      const GATE_WIDTH = 3.6
      const HALF_GATE = GATE_WIDTH / 2
      const N = pts.length

      for (let i = 0; i < N; i++) {
        const A = pts[i]!
        const B = pts[(i + 1) % N]!

        if (
          isPointInRoadObstacles(A.x, A.z, roadObs, 0.6) ||
          isPointInRoadObstacles(B.x, B.z, roadObs, 0.6) ||
          isPointInRoadObstacles((A.x + B.x) / 2, (A.z + B.z) / 2, roadObs, 0.6)
        ) {
          continue
        }

        const dx = B.x - A.x
        const dz = B.z - A.z
        const edgeLen = Math.hypot(dx, dz)
        if (edgeLen < 3.0) continue

        const ux = dx / edgeLen
        const uz = dz / edgeLen

        // Corner pillar at vertex A
        colliders.push(
          RAPIER.ColliderDesc.cuboid(0.18, 0.44, 0.18)
            .setTranslation(A.x, 0.44, A.z)
        )

        // Calculate gate openings along this edge
        type Segment = { start: number; end: number }
        const fenceSegments: Segment[] = []

        if (edgeLen < 9.5) {
          fenceSegments.push({ start: 0.25, end: edgeLen - 0.25 })
        } else if (edgeLen < 26.0) {
          const center = edgeLen / 2
          const gStart = Math.max(1.2, center - HALF_GATE)
          const gEnd = Math.min(edgeLen - 1.2, center + HALF_GATE)

          if (gStart - 0.25 > 0.6) fenceSegments.push({ start: 0.25, end: gStart })
          if (edgeLen - 0.25 - gEnd > 0.6) fenceSegments.push({ start: gEnd, end: edgeLen - 0.25 })
        } else {
          const numGates = Math.max(1, Math.round(edgeLen / 26))
          const gateSpacing = edgeLen / (numGates + 1)
          let cursor = 0.25
          for (let g = 1; g <= numGates; g++) {
            const gCenter = g * gateSpacing
            const gStart = gCenter - HALF_GATE
            const gEnd = gCenter + HALF_GATE
            if (gStart - cursor > 0.6) {
              fenceSegments.push({ start: cursor, end: gStart })
            }
            cursor = gEnd
          }
          if (edgeLen - 0.25 - cursor > 0.6) {
            fenceSegments.push({ start: cursor, end: edgeLen - 0.25 })
          }
        }

        // Add colliders for each fence barrier segment
        for (const seg of fenceSegments) {
          const segLen = seg.end - seg.start
          if (segLen < 0.4) continue
          const midDist = (seg.start + seg.end) / 2
          const cx = A.x + ux * midDist
          const cz = A.z + uz * midDist

          const q = new THREE.Quaternion().setFromUnitVectors(
            new THREE.Vector3(1, 0, 0),
            new THREE.Vector3(ux, 0, uz),
          )

          colliders.push(
            RAPIER.ColliderDesc.cuboid(segLen / 2, 0.44, 0.14)
              .setTranslation(cx, 0.44, cz)
              .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }),
          )
        }
      }
    }

    // 2. Tree trunk colliders
    let minX = Infinity, maxX = -Infinity
    let minZ = Infinity, maxZ = -Infinity
    for (const p of pts) {
      if (p.x < minX) minX = p.x
      if (p.x > maxX) maxX = p.x
      if (p.z < minZ) minZ = p.z
      if (p.z > maxZ) maxZ = p.z
    }

    const width = maxX - minX
    const depth = maxZ - minZ
    const approxArea = width * depth

    if (approxArea >= 60) {
      const numCandidates = Math.min(25, Math.floor(approxArea / 200) + 2)
      let seed = 0
      for (let i = 0; i < park.id.length; i++) seed = (seed * 31 + park.id.charCodeAt(i)) >>> 0

      function pseudoRandom(): number {
        seed = (seed * 9301 + 49297) % 233280
        return seed / 233280
      }

      let treesPlaced = 0
      for (let attempt = 0; attempt < numCandidates * 2 && treesPlaced < numCandidates; attempt++) {
        const candidateX = minX + pseudoRandom() * width
        const candidateZ = minZ + pseudoRandom() * depth

        if (
          isPointInPolygon(candidateX, candidateZ, pts) &&
          !isPointInRoadObstacles(candidateX, candidateZ, roadObs, 1.5)
        ) {
          colliders.push(
            RAPIER.ColliderDesc.cylinder(1.4, 0.28)
              .setTranslation(candidateX, 1.4, candidateZ),
          )
          treesPlaced++
        }
      }
    }

    return colliders
  }
}
