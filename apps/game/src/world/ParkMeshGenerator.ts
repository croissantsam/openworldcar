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
import type { Park, ParkType, Road } from '@world-drive/shared'

// ── Procedural Textures ───────────────────────────────────────────────────

let _grassTexture: THREE.CanvasTexture | null = null
function getGrassTexture(): THREE.CanvasTexture {
  if (_grassTexture) return _grassTexture
  if (typeof document === 'undefined') {
    return new THREE.CanvasTexture({} as HTMLCanvasElement)
  }

  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 512
  const ctx = canvas.getContext('2d')!

  // Deep rich grass green base
  ctx.fillStyle = '#3a7233'
  ctx.fillRect(0, 0, 512, 512)

  const idata = ctx.getImageData(0, 0, 512, 512)
  const d = idata.data
  for (let i = 0; i < d.length; i += 4) {
    const noise = (Math.random() - 0.5) * 38
    d[i] = Math.min(255, Math.max(0, 58 + noise * 0.7))      // R
    d[i + 1] = Math.min(255, Math.max(0, 114 + noise))       // G (vibrant)
    d[i + 2] = Math.min(255, Math.max(0, 51 + noise * 0.6))  // B
    d[i + 3] = 255
  }
  ctx.putImageData(idata, 0, 0)

  // Subtle grass blade strokes & organic mossy specks
  ctx.fillStyle = 'rgba(78, 148, 66, 0.35)'
  for (let k = 0; k < 1200; k++) {
    const x = Math.random() * 512
    const y = Math.random() * 512
    const h = 2 + Math.random() * 5
    ctx.fillRect(x, y, 1.5, h)
  }

  ctx.fillStyle = 'rgba(38, 74, 34, 0.30)'
  for (let k = 0; k < 800; k++) {
    const x = Math.random() * 512
    const y = Math.random() * 512
    ctx.fillRect(x, y, 2, 2)
  }

  // Very subtle earth speckles
  ctx.fillStyle = 'rgba(102, 82, 52, 0.12)'
  for (let k = 0; k < 300; k++) {
    ctx.fillRect(Math.random() * 512, Math.random() * 512, 2, 2)
  }

  _grassTexture = new THREE.CanvasTexture(canvas)
  _grassTexture.wrapS = THREE.RepeatWrapping
  _grassTexture.wrapT = THREE.RepeatWrapping
  _grassTexture.repeat.set(1, 1)
  return _grassTexture
}

let _barkTexture: THREE.CanvasTexture | null = null
function getBarkTexture(): THREE.CanvasTexture {
  if (_barkTexture) return _barkTexture
  if (typeof document === 'undefined') {
    return new THREE.CanvasTexture({} as HTMLCanvasElement)
  }

  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const ctx = canvas.getContext('2d')!

  ctx.fillStyle = '#3a2719'
  ctx.fillRect(0, 0, 256, 256)

  // Vertical bark fissures and grain
  for (let x = 0; x < 256; x += 3) {
    const shade = Math.floor(35 + Math.random() * 30)
    ctx.fillStyle = `rgb(${shade + 15}, ${shade}, ${Math.floor(shade * 0.65)})`
    ctx.fillRect(x, 0, 2 + Math.random() * 2, 256)
  }

  _barkTexture = new THREE.CanvasTexture(canvas)
  _barkTexture.wrapS = THREE.RepeatWrapping
  _barkTexture.wrapT = THREE.RepeatWrapping
  _barkTexture.repeat.set(1, 2)
  return _barkTexture
}

// ── Materials ─────────────────────────────────────────────────────────────

const grassTex = getGrassTexture()
const barkTex = getBarkTexture()

const PARK_MATS: Record<ParkType, THREE.MeshStandardMaterial> = {
  park:        new THREE.MeshStandardMaterial({ map: grassTex, color: 0x427c3a, roughness: 0.88, metalness: 0.0, polygonOffset: true, polygonOffsetFactor: 1.0, polygonOffsetUnits: 1.0 }),
  garden:      new THREE.MeshStandardMaterial({ map: grassTex, color: 0x48843e, roughness: 0.86, metalness: 0.0, polygonOffset: true, polygonOffsetFactor: 1.0, polygonOffsetUnits: 1.0 }),
  grass:       new THREE.MeshStandardMaterial({ map: grassTex, color: 0x4c8842, roughness: 0.90, metalness: 0.0, polygonOffset: true, polygonOffsetFactor: 1.0, polygonOffsetUnits: 1.0 }),
  forest:      new THREE.MeshStandardMaterial({ map: grassTex, color: 0x2b5428, roughness: 0.92, metalness: 0.0, polygonOffset: true, polygonOffsetFactor: 1.0, polygonOffsetUnits: 1.0 }),
  recreation:  new THREE.MeshStandardMaterial({ map: grassTex, color: 0x46823c, roughness: 0.85, metalness: 0.0, polygonOffset: true, polygonOffsetFactor: 1.0, polygonOffsetUnits: 1.0 }),
  // Other types
  cemetery:    new THREE.MeshStandardMaterial({ color: 0x8a8880, roughness: 0.95, metalness: 0.0, polygonOffset: true, polygonOffsetFactor: 1.0, polygonOffsetUnits: 1.0 }),
  farmland:    new THREE.MeshStandardMaterial({ color: 0x9a7c48, roughness: 0.98, metalness: 0.0, polygonOffset: true, polygonOffsetFactor: 1.0, polygonOffsetUnits: 1.0 }),
  parking_lot: new THREE.MeshStandardMaterial({ color: 0x909498, roughness: 0.85, metalness: 0.04, polygonOffset: true, polygonOffsetFactor: 1.0, polygonOffsetUnits: 1.0 }),
  pitch:       new THREE.MeshStandardMaterial({ color: 0x2a7a28, roughness: 0.95, metalness: 0.0, polygonOffset: true, polygonOffsetFactor: 1.0, polygonOffsetUnits: 1.0 }),
  beach:       new THREE.MeshStandardMaterial({ color: 0xe8d898, roughness: 0.98, metalness: 0.0, polygonOffset: true, polygonOffsetFactor: 1.0, polygonOffsetUnits: 1.0 }),
  cliff:       new THREE.MeshStandardMaterial({ color: 0x8c7a6a, roughness: 0.96, metalness: 0.02, polygonOffset: true, polygonOffsetFactor: 1.0, polygonOffsetUnits: 1.0 }),
  scrub:       new THREE.MeshStandardMaterial({ color: 0x608048, roughness: 0.96, metalness: 0.0, polygonOffset: true, polygonOffsetFactor: 1.0, polygonOffsetUnits: 1.0 }),
}

// Tree bark
const TRUNK_MAT = new THREE.MeshStandardMaterial({
  map: barkTex,
  color: 0x4a3220,
  roughness: 0.90,
  metalness: 0.05,
})

// Rich organic foliage tones
const FOLIAGE_MATS = [
  new THREE.MeshStandardMaterial({ color: 0x2d6829, roughness: 0.76, metalness: 0.02, flatShading: true }), // Deep chestnut / plane green
  new THREE.MeshStandardMaterial({ color: 0x3a7833, roughness: 0.74, metalness: 0.02, flatShading: true }), // Summer oak green
  new THREE.MeshStandardMaterial({ color: 0x488c3a, roughness: 0.72, metalness: 0.02, flatShading: true }), // Sunlit linden green
  new THREE.MeshStandardMaterial({ color: 0x245422, roughness: 0.78, metalness: 0.02, flatShading: true }), // Shaded forest crown
]

// Parisian bench materials (Davioud style)
const BENCH_IRON_MAT = new THREE.MeshStandardMaterial({
  color: 0x182c20, // Parisian park dark green cast iron
  roughness: 0.45,
  metalness: 0.55,
})

const BENCH_WOOD_MAT = new THREE.MeshStandardMaterial({
  color: 0x7c4928, // Varnished oak slats
  roughness: 0.65,
  metalness: 0.05,
})

// Park walking path material (sable de Paris / compacted limestone gravel)
const PATH_GRAVEL_MAT = new THREE.MeshStandardMaterial({
  color: 0xd2c4a4,
  roughness: 0.96,
  metalness: 0.0,
  polygonOffset: true,
  polygonOffsetFactor: 0.5,
  polygonOffsetUnits: 0.5,
})

// Shrub and flowerbed materials
const SHRUB_MAT = new THREE.MeshStandardMaterial({
  color: 0x2e6628,
  roughness: 0.80,
  flatShading: true,
})

const FLOWER_BLOSSOM_MATS = [
  new THREE.MeshStandardMaterial({ color: 0xf4f0dc, roughness: 0.7 }), // Cream white
  new THREE.MeshStandardMaterial({ color: 0xdf6f88, roughness: 0.7 }), // Rose pink
  new THREE.MeshStandardMaterial({ color: 0x8a66c4, roughness: 0.7 }), // Lavender purple
]

// ── Realistic Tree Templates ──────────────────────────────────────────────

let _plataneTemplate: THREE.Group | null = null
let _lindenTemplate: THREE.Group | null = null
let _ornamentalTemplate: THREE.Group | null = null

/**
 * Archetype 1: Parisian Plane Tree / Horse Chestnut (Platane / Marronnier)
 * Majestic spreading crown with multiple organic leafy tiers and branching boughs.
 */
function getPlataneTemplate(): THREE.Group {
  if (_plataneTemplate) return _plataneTemplate
  const group = new THREE.Group()

  // Main Trunk (height 3.2m, tapering)
  const trunkGeo = new THREE.CylinderGeometry(0.28, 0.44, 3.2, 8)
  trunkGeo.translate(0, 1.6, 0)
  const trunk = new THREE.Mesh(trunkGeo, TRUNK_MAT)
  trunk.castShadow = true
  group.add(trunk)

  // 3 Angled Branching Boughs spreading outward from trunk top
  const branchAngles = [0, (Math.PI * 2) / 3, (Math.PI * 4) / 3]
  for (const angle of branchAngles) {
    const bGeo = new THREE.CylinderGeometry(0.12, 0.20, 1.8, 6)
    bGeo.rotateZ(0.55)
    bGeo.rotateY(angle)
    bGeo.translate(Math.sin(angle) * 0.6, 3.4, Math.cos(angle) * 0.6)
    const bMesh = new THREE.Mesh(bGeo, TRUNK_MAT)
    bMesh.castShadow = true
    group.add(bMesh)
  }

  // Voluminous Organic Canopy Clusters (Dodecahedrons for rich foliage clusters)
  const clusterDefs = [
    { x: 0, y: 5.2, z: 0, r: 2.1, matIdx: 0 },
    { x: 1.4, y: 4.5, z: 0.6, r: 1.7, matIdx: 1 },
    { x: -1.3, y: 4.6, z: -0.5, r: 1.8, matIdx: 2 },
    { x: 0.4, y: 4.7, z: 1.3, r: 1.6, matIdx: 1 },
    { x: -0.5, y: 4.8, z: -1.3, r: 1.6, matIdx: 0 },
    { x: 0.1, y: 6.2, z: 0.1, r: 1.5, matIdx: 2 },
  ]

  for (const c of clusterDefs) {
    const fGeo = new THREE.DodecahedronGeometry(c.r, 1)
    fGeo.translate(c.x, c.y, c.z)
    const fMesh = new THREE.Mesh(fGeo, FOLIAGE_MATS[c.matIdx]!)
    fMesh.castShadow = true
    fMesh.receiveShadow = true
    group.add(fMesh)
  }

  _plataneTemplate = group
  return _plataneTemplate
}

/**
 * Archetype 2: Linden / Oak Tree (Tilleul noble / Chêne)
 * Stately upright trunk with tall, layered oval canopy.
 */
function getLindenTemplate(): THREE.Group {
  if (_lindenTemplate) return _lindenTemplate
  const group = new THREE.Group()

  // Trunk (height 3.8m)
  const trunkGeo = new THREE.CylinderGeometry(0.24, 0.38, 3.8, 8)
  trunkGeo.translate(0, 1.9, 0)
  const trunk = new THREE.Mesh(trunkGeo, TRUNK_MAT)
  trunk.castShadow = true
  group.add(trunk)

  // Stratified Tall Canopy Clusters
  const clusterDefs = [
    { x: 0, y: 4.8, z: 0, r: 2.2, matIdx: 1 },
    { x: 0.8, y: 5.4, z: 0.5, r: 1.7, matIdx: 2 },
    { x: -0.7, y: 5.5, z: -0.6, r: 1.7, matIdx: 0 },
    { x: 0, y: 6.6, z: 0, r: 1.6, matIdx: 2 },
    { x: 0, y: 7.7, z: 0, r: 1.2, matIdx: 1 },
  ]

  for (const c of clusterDefs) {
    const fGeo = new THREE.DodecahedronGeometry(c.r, 1)
    fGeo.translate(c.x, c.y, c.z)
    const fMesh = new THREE.Mesh(fGeo, FOLIAGE_MATS[c.matIdx]!)
    fMesh.castShadow = true
    fMesh.receiveShadow = true
    group.add(fMesh)
  }

  _lindenTemplate = group
  return _lindenTemplate
}

/**
 * Archetype 3: Ornamental Park Tree / Birch / Flowering (Arbre d'ornement)
 * Graceful slender trunk with delicate spreading canopy.
 */
function getOrnamentalTemplate(): THREE.Group {
  if (_ornamentalTemplate) return _ornamentalTemplate
  const group = new THREE.Group()

  // Slender Trunk (height 2.8m)
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.26, 2.8, 7)
  trunkGeo.translate(0, 1.4, 0)
  const trunk = new THREE.Mesh(trunkGeo, TRUNK_MAT)
  trunk.castShadow = true
  group.add(trunk)

  // Delicate rounded foliage dome
  const clusterDefs = [
    { x: 0, y: 3.8, z: 0, r: 1.7, matIdx: 2 },
    { x: 0.8, y: 4.2, z: 0.5, r: 1.3, matIdx: 1 },
    { x: -0.7, y: 4.1, z: -0.5, r: 1.3, matIdx: 2 },
    { x: 0, y: 5.0, z: 0, r: 1.1, matIdx: 3 },
  ]

  for (const c of clusterDefs) {
    const fGeo = new THREE.DodecahedronGeometry(c.r, 1)
    fGeo.translate(c.x, c.y, c.z)
    const fMesh = new THREE.Mesh(fGeo, FOLIAGE_MATS[c.matIdx]!)
    fMesh.castShadow = true
    fMesh.receiveShadow = true
    group.add(fMesh)
  }

  _ornamentalTemplate = group
  return _ornamentalTemplate
}

// ── Parisian Park Furniture (Banc Davioud) ─────────────────────────────────

let _benchTemplate: THREE.Group | null = null
function getBenchTemplate(): THREE.Group {
  if (_benchTemplate) return _benchTemplate
  const group = new THREE.Group()

  // 2 Cast Iron End Legs
  for (const xOff of [-0.75, 0.75]) {
    const legGeo = new THREE.BoxGeometry(0.06, 0.44, 0.52)
    legGeo.translate(xOff, 0.22, 0)
    const leg = new THREE.Mesh(legGeo, BENCH_IRON_MAT)
    leg.castShadow = true
    group.add(leg)

    // Backrest upright support
    const upGeo = new THREE.BoxGeometry(0.05, 0.45, 0.05)
    upGeo.translate(xOff, 0.60, -0.22)
    const up = new THREE.Mesh(upGeo, BENCH_IRON_MAT)
    up.castShadow = true
    group.add(up)
  }

  // Wooden Seat Slats
  for (let s = 0; s < 3; s++) {
    const slatGeo = new THREE.BoxGeometry(1.65, 0.035, 0.12)
    slatGeo.translate(0, 0.44, -0.16 + s * 0.15)
    const slat = new THREE.Mesh(slatGeo, BENCH_WOOD_MAT)
    slat.castShadow = true
    group.add(slat)
  }

  // Wooden Backrest Slats
  for (let b = 0; b < 2; b++) {
    const backGeo = new THREE.BoxGeometry(1.65, 0.12, 0.035)
    backGeo.translate(0, 0.62 + b * 0.15, -0.24)
    const back = new THREE.Mesh(backGeo, BENCH_WOOD_MAT)
    back.castShadow = true
    group.add(back)
  }

  _benchTemplate = group
  return _benchTemplate
}

// ── Organic Flowering Shrub Template ───────────────────────────────────────

let _shrubTemplate: THREE.Group | null = null
function getShrubTemplate(): THREE.Group {
  if (_shrubTemplate) return _shrubTemplate
  const group = new THREE.Group()

  const mainGeo = new THREE.DodecahedronGeometry(0.75, 1)
  mainGeo.scale(1.2, 0.8, 1.0)
  mainGeo.translate(0, 0.55, 0)
  const shrub = new THREE.Mesh(mainGeo, SHRUB_MAT)
  shrub.castShadow = true
  shrub.receiveShadow = true
  group.add(shrub)

  // Blossom accents
  const blossomCount = 8
  for (let i = 0; i < blossomCount; i++) {
    const bGeo = new THREE.SphereGeometry(0.08, 4, 4)
    const ang = (i / blossomCount) * Math.PI * 2
    const bx = Math.cos(ang) * 0.6
    const bz = Math.sin(ang) * 0.5
    const by = 0.55 + Math.sin(i * 2.3) * 0.25
    bGeo.translate(bx, by, bz)
    const bMesh = new THREE.Mesh(bGeo, FLOWER_BLOSSOM_MATS[i % FLOWER_BLOSSOM_MATS.length]!)
    group.add(bMesh)
  }

  _shrubTemplate = group
  return _shrubTemplate
}

// ── Helper: Point in polygon test (2D Ray-casting) ─────────────────────────

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

// ── Road Obstacle Avoidance ────────────────────────────────────────────────

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

function isPointInRoadObstacles(px: number, pz: number, obs: RoadObstacleSeg[], margin = 0.8): boolean {
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

// ─────────────────────────────────────────────────────────────────────────────
// ParkMeshGenerator Class
// ─────────────────────────────────────────────────────────────────────────────

export class ParkMeshGenerator {
  /**
   * Generate a 3D park group with rich procedural lawn, realistic tree archetypes,
   * benches, flowerbeds, and walking paths (without any blocking fences or barriers).
   */
  static generate(park: Park, roads?: Road[]): THREE.Group | null {
    const pts = park.polygon
    if (pts.length < 3) return null

    const roadObs = buildRoadObstacles(roads)
    const group = new THREE.Group()
    group.userData['parkId'] = park.id

    // ── 1. Park Lawn Surface ────────────────────────────────────────────────
    // Placed at y = 0.016m (cleanly above urban slab at 0.001m, and below road asphalt at 0.028m).
    const shape = new THREE.Shape()
    shape.moveTo(pts[0]!.x, pts[0]!.z)
    for (let i = 1; i < pts.length; i++) {
      shape.lineTo(pts[i]!.x, pts[i]!.z)
    }
    shape.closePath()

    const geo = new THREE.ShapeGeometry(shape)
    geo.rotateX(-Math.PI / 2)
    geo.translate(0, 0.016, 0)

    // Compute seamless world-space planar UV mapping for grass texture
    const posAttr = geo.getAttribute('position')
    if (posAttr) {
      const uvs = new Float32Array(posAttr.count * 2)
      for (let i = 0; i < posAttr.count; i++) {
        uvs[i * 2] = posAttr.getX(i) / 10.0 // repeat every 10m in world space
        uvs[i * 2 + 1] = posAttr.getZ(i) / 10.0
      }
      geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
    }

    geo.computeVertexNormals()

    const mat = PARK_MATS[park.type] ?? PARK_MATS['park']
    const lawn = new THREE.Mesh(geo, mat)
    lawn.receiveShadow = true
    lawn.renderOrder = 1
    group.add(lawn)

    // ── 2. Type-specific overlays (Cemetery, Parking lot, Pitch) ───────────
    if (park.type === 'cemetery') {
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

    if (park.type === 'parking_lot') {
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

    if (park.type === 'pitch') {
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

    if ((park.type === 'park' || park.type === 'garden') && approxArea >= 350) {
      const cX = (minX + maxX) / 2
      const cZ = (minZ + maxZ) / 2
      // Draw a cross or central path
      const pathW = 2.4
      const p1Geo = new THREE.BoxGeometry(width * 0.7, 0.005, pathW)
      const p1Mesh = new THREE.Mesh(p1Geo, PATH_GRAVEL_MAT)
      p1Mesh.position.set(cX, 0.017, cZ)
      p1Mesh.receiveShadow = true
      group.add(p1Mesh)

      if (depth > 25 && width > 25) {
        const p2Geo = new THREE.BoxGeometry(pathW, 0.005, depth * 0.7)
        const p2Mesh = new THREE.Mesh(p2Geo, PATH_GRAVEL_MAT)
        p2Mesh.position.set(cX, 0.017, cZ)
        p2Mesh.receiveShadow = true
        group.add(p2Mesh)
      }
    }

    // ── 4. Realistic 3D Trees Scatter ──────────────────────────────────────
    const treeTypes: ParkType[] = ['park', 'garden', 'grass', 'forest', 'recreation', 'scrub', 'cemetery']
    if (treeTypes.includes(park.type)) {
      if (approxArea >= 50) {
        // Density tuned for visual lushness & 60 FPS performance
        const numCandidates = Math.min(30, Math.floor(approxArea / 160) + 3)

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

        let treesPlaced = 0
        const treeLocations: Array<{ x: number; z: number }> = []

        for (let attempt = 0; attempt < numCandidates * 3 && treesPlaced < numCandidates; attempt++) {
          const candidateX = minX + pseudoRandom() * width
          const candidateZ = minZ + pseudoRandom() * depth

          if (
            isPointInPolygon(candidateX, candidateZ, pts) &&
            !isPointInRoadObstacles(candidateX, candidateZ, roadObs, 1.6)
          ) {
            // Pick archetype based on random roll
            const archIdx = Math.floor(pseudoRandom() * archetypes.length)
            const template = archetypes[archIdx]!
            const tree = template.clone()

            // Natural variations in scale, orientation, and subtle tilt
            const scale = 0.85 + pseudoRandom() * 0.40
            tree.scale.set(scale, scale, scale)
            tree.rotation.y = pseudoRandom() * Math.PI * 2
            tree.rotation.z = (pseudoRandom() - 0.5) * 0.08 // natural slight lean

            tree.position.set(candidateX, 0, candidateZ)
            group.add(tree)

            treeLocations.push({ x: candidateX, z: candidateZ })
            treesPlaced++
          }
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
    }

    return group
  }

  /**
   * Generates Rapier static colliders for park tree trunks ONLY.
   * Perimeter fences and barrier colliders are completely omitted,
   * allowing cars to drive seamlessly onto park grass.
   */
  static createColliderDescs(park: Park, roads?: Road[]): RAPIER.ColliderDesc[] {
    const pts = park.polygon
    if (pts.length < 3) return []

    const colliders: RAPIER.ColliderDesc[] = []
    const roadObs = buildRoadObstacles(roads)

    // Tree trunk solid colliders
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

    const treeTypes: ParkType[] = ['park', 'garden', 'grass', 'forest', 'recreation', 'scrub', 'cemetery']
    if (treeTypes.includes(park.type) && approxArea >= 50) {
      const numCandidates = Math.min(30, Math.floor(approxArea / 160) + 3)
      let seed = 0
      for (let i = 0; i < park.id.length; i++) seed = (seed * 31 + park.id.charCodeAt(i)) >>> 0

      function pseudoRandom(): number {
        seed = (seed * 9301 + 49297) % 233280
        return seed / 233280
      }

      let treesPlaced = 0
      for (let attempt = 0; attempt < numCandidates * 3 && treesPlaced < numCandidates; attempt++) {
        const candidateX = minX + pseudoRandom() * width
        const candidateZ = minZ + pseudoRandom() * depth

        if (
          isPointInPolygon(candidateX, candidateZ, pts) &&
          !isPointInRoadObstacles(candidateX, candidateZ, roadObs, 1.6)
        ) {
          // Tree trunk solid cylinder collider (radius 0.32m, half-height 1.6m centered at y = 1.6m)
          colliders.push(
            RAPIER.ColliderDesc.cylinder(1.6, 0.32)
              .setTranslation(candidateX, 1.6, candidateZ),
          )
          treesPlaced++
        }
      }
    }

    return colliders
  }
}
