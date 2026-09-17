/**
 * RoadMeshGenerator — Burnout Paradise arcade racing aesthetic.
 *
 * Features:
 *   - Sleek dark asphalt with PBR specular sheen and roughness
 *   - Rubber tire wear tracks embedded in every lane
 *   - Bold double yellow continuous lines on 4-lane avenues
 *   - Crisp, long white dashed lane dividers (racing speed ratio)
 *   - Solid white edge lines framing the road
 *   - Directional arrows painted flat on the asphalt
 *   - Wide zebra pedestrian crossings near junctions
 *   - Smooth, clean beveled curbs & raised sidewalks
 *   - NO vertical poles, traffic lights or signs blocking the driving path!
 */

import * as THREE from 'three'
import type { Road } from '@world-drive/shared'

const LANE_WIDTH = 3.6 // metres per lane
const SIDEWALK_HEIGHT = 0.14 // 12cm curb elevation above road (y = 0.028 -> 0.14)
const CURB_WIDTH = 0.18 // 18cm beveled granite curb
const DEFAULT_SIDEWALK_WIDTH = 7.5 // 7.5m wide sidewalk extending all the way to building facades

// ── 1. Materials (Burnout Paradise PBR Palette) ─────────────────────────────

// Realistic weathered asphalt texture (warm charcoal slate + mineral flecks)
function createAsphaltTexture(): THREE.CanvasTexture {
  if (typeof document === 'undefined') {
    return new THREE.CanvasTexture({} as HTMLCanvasElement)
  }
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 512
  const ctx = canvas.getContext('2d')!

  // Medium charcoal grey asphalt base (realistic slate tone)
  ctx.fillStyle = '#42454c'
  ctx.fillRect(0, 0, 512, 512)

  const idata = ctx.getImageData(0, 0, 512, 512)
  const d = idata.data
  for (let i = 0; i < d.length; i += 4) {
    const grain = (Math.random() - 0.5) * 36
    d[i] = Math.min(255, Math.max(0, 66 + grain))
    d[i + 1] = Math.min(255, Math.max(0, 69 + grain))
    d[i + 2] = Math.min(255, Math.max(0, 76 + grain))
    d[i + 3] = 255
  }
  ctx.putImageData(idata, 0, 0)

  // Subtle mineral aggregate speckles
  ctx.fillStyle = 'rgba(200, 205, 215, 0.12)'
  for (let k = 0; k < 300; k++) {
    ctx.fillRect(Math.random() * 512, Math.random() * 512, 2, 2)
  }
  ctx.fillStyle = 'rgba(25, 25, 30, 0.15)'
  for (let k = 0; k < 300; k++) {
    ctx.fillRect(Math.random() * 512, Math.random() * 512, 2, 2)
  }

  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(2, 6)
  return tex
}

const ASPHALT_TEX = createAsphaltTexture()

// High-performance asphalt with slight specular glint under the sun
// Negative polygonOffset pulls road forward so it always cleanly occludes park lawns & terrain
const ASPHALT_MATS: Record<string, THREE.MeshStandardMaterial> = {
  motorway:    new THREE.MeshStandardMaterial({ color: 0xe0e2e8, map: ASPHALT_TEX, roughness: 0.74, metalness: 0.10, polygonOffset: true, polygonOffsetFactor: -2.0, polygonOffsetUnits: -2.0 }),
  trunk:       new THREE.MeshStandardMaterial({ color: 0xd8dae0, map: ASPHALT_TEX, roughness: 0.74, metalness: 0.10, polygonOffset: true, polygonOffsetFactor: -2.0, polygonOffsetUnits: -2.0 }),
  primary:     new THREE.MeshStandardMaterial({ color: 0xdcdfe4, map: ASPHALT_TEX, roughness: 0.76, metalness: 0.08, polygonOffset: true, polygonOffsetFactor: -2.0, polygonOffsetUnits: -2.0 }),
  secondary:   new THREE.MeshStandardMaterial({ color: 0xd4d7dc, map: ASPHALT_TEX, roughness: 0.78, metalness: 0.06, polygonOffset: true, polygonOffsetFactor: -2.0, polygonOffsetUnits: -2.0 }),
  tertiary:    new THREE.MeshStandardMaterial({ color: 0xd0d3d8, map: ASPHALT_TEX, roughness: 0.80, metalness: 0.05, polygonOffset: true, polygonOffsetFactor: -2.0, polygonOffsetUnits: -2.0 }),
  residential: new THREE.MeshStandardMaterial({ color: 0xc8cbd0, map: ASPHALT_TEX, roughness: 0.82, metalness: 0.04, polygonOffset: true, polygonOffsetFactor: -2.0, polygonOffsetUnits: -2.0 }),
  service:     new THREE.MeshStandardMaterial({ color: 0xb8bbc0, map: ASPHALT_TEX, roughness: 0.84, metalness: 0.03, polygonOffset: true, polygonOffsetFactor: -2.0, polygonOffsetUnits: -2.0 }),
  default:     new THREE.MeshStandardMaterial({ color: 0xc8cbd0, map: ASPHALT_TEX, roughness: 0.80, metalness: 0.05, polygonOffset: true, polygonOffsetFactor: -2.0, polygonOffsetUnits: -2.0 }),
}

// Granite gutter border along the road edge
const GUTTER_MAT = new THREE.MeshStandardMaterial({
  color: 0x50545c,
  roughness: 0.82,
  metalness: 0.05,
  polygonOffset: true,
  polygonOffsetFactor: -2.0,
  polygonOffsetUnits: -2.0,
})

// Rubber tire wear tracks along the lanes
const TIRE_RUBBER_MAT = new THREE.MeshStandardMaterial({
  color: 0x121316,
  roughness: 0.60,
  metalness: 0.06,
  transparent: true,
  opacity: 0.35,
  depthWrite: false,
})

// Sharp, vibrant markings
const WHITE_MARK = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  roughness: 0.35,
  metalness: 0.0,
  emissive: 0xffffff,
  emissiveIntensity: 0.22,
  polygonOffset: true,
  polygonOffsetFactor: -3.0,
  polygonOffsetUnits: -3.0,
})

const YELLOW_MARK = new THREE.MeshStandardMaterial({
  color: 0xffb800,
  roughness: 0.35,
  metalness: 0.0,
  emissive: 0xe6a000,
  emissiveIntensity: 0.25,
  polygonOffset: true,
  polygonOffsetFactor: -3.0,
  polygonOffsetUnits: -3.0,
})

// Procedural Parisian granite paving tile texture for sidewalks
function createSidewalkTileTexture(): THREE.CanvasTexture {
  if (typeof document === 'undefined') {
    return new THREE.CanvasTexture({} as HTMLCanvasElement)
  }
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const ctx = canvas.getContext('2d')!

  // Warm Parisian granite tone (natural stone, not blinding white!)
  ctx.fillStyle = '#8a867e'
  ctx.fillRect(0, 0, 256, 256)

  // 4x4 paving stone slabs with distinct stone variation
  const tileSize = 64
  for (let y = 0; y < 256; y += tileSize) {
    for (let x = 0; x < 256; x += tileSize) {
      const shade = (Math.random() - 0.5) * 18
      const r = Math.min(255, Math.max(0, 138 + shade))
      const g = Math.min(255, Math.max(0, 134 + shade))
      const b = Math.min(255, Math.max(0, 126 + shade))
      ctx.fillStyle = `rgb(${r},${g},${b})`
      ctx.fillRect(x + 2, y + 2, tileSize - 4, tileSize - 4)

      // Fine stone flecks
      ctx.fillStyle = 'rgba(40, 35, 30, 0.10)'
      for (let k = 0; k < 8; k++) {
        ctx.fillRect(x + Math.random() * tileSize, y + Math.random() * tileSize, 2, 2)
      }
    }
  }

  // Dark joints between sidewalk paving slabs
  ctx.strokeStyle = '#4a463e'
  ctx.lineWidth = 3
  for (let x = 0; x <= 256; x += tileSize) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 256); ctx.stroke()
  }
  for (let y = 0; y <= 256; y += tileSize) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(256, y); ctx.stroke()
  }

  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(1, 4)
  return tex
}

// Clean beveled curb & raised sidewalk (with DoubleSide to guarantee visibility)
const CURB_MAT = new THREE.MeshStandardMaterial({
  color: 0x6e6a62, // Distinct darker cut granite curb stone
  roughness: 0.70,
  metalness: 0.08,
  side: THREE.DoubleSide,
})

const SIDEWALK_MAT = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  map: createSidewalkTileTexture(),
  roughness: 0.84,
  metalness: 0.04,
  side: THREE.DoubleSide,
})

function getAsphaltMaterial(highway: string): THREE.MeshStandardMaterial {
  return ASPHALT_MATS[highway] ?? ASPHALT_MATS['default']!
}

// ── 2. Geometric Ribbon & Marking Generators ────────────────────────────────

/**
 * Builds a ribbon mesh (e.g. road surface, edge lines, tire tracks).
 */
function buildRibbon(
  points: { x: number; y: number; z: number }[],
  halfW: number,
  yOffset: number,
  material: THREE.Material,
): THREE.Mesh | null {
  if (points.length < 2) return null
  const vertices: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  let totalLen = 0

  for (let i = 0; i < points.length; i++) {
    const curr = points[i]!
    const prev = points[Math.max(0, i - 1)]!
    const next = points[Math.min(points.length - 1, i + 1)]!

    let dx = next.x - prev.x
    let dz = next.z - prev.z
    const len = Math.sqrt(dx * dx + dz * dz)
    if (len > 0) { dx /= len; dz /= len; }

    const nx = -dz
    const nz = dx

    vertices.push(
      curr.x + nx * halfW, curr.y + yOffset, curr.z + nz * halfW,
      curr.x - nx * halfW, curr.y + yOffset, curr.z - nz * halfW,
    )

    if (i > 0) totalLen += Math.sqrt((curr.x - prev.x) ** 2 + (curr.z - prev.z) ** 2)
    const u = totalLen / (halfW * 2 * 4)
    uvs.push(0, u, 1, u)

    if (i < points.length - 1) {
      const b = i * 2
      indices.push(b, b + 1, b + 2, b + 1, b + 3, b + 2)
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geo.setIndex(indices)
  geo.computeVertexNormals()

  const mesh = new THREE.Mesh(geo, material)
  mesh.receiveShadow = true
  return mesh
}

/**
 * Shift ribbon vertices laterally by `offset` metres along polyline perpendicular.
 */
function shiftRibbonLateral(
  mesh: THREE.Mesh,
  pts: { x: number; y: number; z: number }[],
  offset: number,
): void {
  const pos = mesh.geometry.attributes['position'] as THREE.BufferAttribute
  if (!pos) return
  const arr = pos.array as Float32Array

  for (let i = 0; i < pts.length; i++) {
    const prev = pts[Math.max(0, i - 1)]!
    const next = pts[Math.min(pts.length - 1, i + 1)]!
    let dx = next.x - prev.x; let dz = next.z - prev.z
    const l = Math.sqrt(dx * dx + dz * dz)
    if (l > 0) { dx /= l; dz /= l; }
    const nx = -dz; const nz = dx

    for (let side = 0; side < 2; side++) {
      const vi = (i * 2 + side) * 3
      arr[vi]!     += nx * offset
      arr[vi + 2]! += nz * offset
    }
  }
  pos.needsUpdate = true
  mesh.geometry.computeVertexNormals()
}

export interface RoadObstacleSeg {
  x1: number; z1: number; x2: number; z2: number
  dx: number; dz: number; lenSq: number; halfW: number
  minX: number; maxX: number; minZ: number; maxZ: number
}

export function buildRoadObstacles(roads?: Road[], currentRoadId?: string): RoadObstacleSeg[] {
  if (!roads || roads.length === 0) return []
  const obs: RoadObstacleSeg[] = []
  for (const r of roads) {
    if (r.id === currentRoadId) continue
    if (r.highway === 'path' || r.highway === 'footway' || r.highway === 'cycleway') continue
    const isMajor = r.highway === 'primary' || r.highway === 'motorway' || r.highway === 'trunk'
    const lanes = isMajor ? Math.max(4, r.lanes) : Math.max(2, r.lanes)
    const halfW = (lanes * LANE_WIDTH) / 2
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

function isPointInRoadAsphalt(px: number, pz: number, obs: RoadObstacleSeg[], margin = 0.20): boolean {
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

function resamplePolyline(pts: { x: number; y: number; z: number }[], maxStep = 1.6): { x: number; y: number; z: number }[] {
  if (pts.length < 2) return pts
  const res: { x: number; y: number; z: number }[] = []
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!
    const b = pts[i + 1]!
    const dx = b.x - a.x
    const dy = b.y - a.y
    const dz = b.z - a.z
    const len = Math.hypot(dx, dz)
    const steps = Math.max(1, Math.ceil(len / maxStep))
    for (let s = 0; s < steps; s++) {
      const t = s / steps
      res.push({
        x: a.x + dx * t,
        y: a.y + dy * t,
        z: a.z + dz * t,
      })
    }
  }
  res.push(pts[pts.length - 1]!)
  return res
}

interface SidewalkSlice {
  blocked: boolean
  gX: number; gY: number; gZ: number
  cX: number; cY: number; cZ: number
  wX: number; wY: number; wZ: number
  dX: number; dY: number; dZ: number
  dist: number
}

/**
 * Builds clean, beveled curbs & raised sidewalks on left or right.
 * The road sits at y = 0.028.
 * The curb rises from y = 0.028 to y = 0.14 (stone curb).
 * The sidewalk surface extends outward at y = 0.14 up to 7.5m to reach building facades.
 *
 * Intersection Clipping:
 * Sidewalk quads are omitted wherever they would intersect the roadway corridor
 * of any intersecting street, leaving all crossroads and junctions completely open!
 */
function buildCleanSidewalk(
  rawPts: { x: number; y: number; z: number }[],
  roadHalfW: number,
  sidewalkW: number,
  side: 'left' | 'right',
  obstacles: RoadObstacleSeg[],
): THREE.Group {
  const group = new THREE.Group()
  if (rawPts.length < 2) return group

  const pts = resamplePolyline(rawPts, 1.6)
  const sign = side === 'left' ? 1 : -1
  const curbBevelW = CURB_WIDTH

  const slices: SidewalkSlice[] = []
  let totalDist = 0

  for (let i = 0; i < pts.length; i++) {
    const curr = pts[i]!
    const prev = pts[Math.max(0, i - 1)]!
    const next = pts[Math.min(pts.length - 1, i + 1)]!
    let dx = next.x - prev.x; let dz = next.z - prev.z
    const l = Math.hypot(dx, dz)
    if (l > 0) { dx /= l; dz /= l; }
    const nx = -dz * sign; const nz = dx * sign

    if (i > 0) totalDist += Math.hypot(curr.x - prev.x, curr.z - prev.z)

    // 1. Gutter: where road meets curb bottom
    const gX = curr.x + nx * roadHalfW
    const gY = curr.y + 0.028
    const gZ = curr.z + nz * roadHalfW

    // 2. Curb top outer corner (elevated 14cm)
    const cX = curr.x + nx * (roadHalfW + curbBevelW)
    const cY = curr.y + SIDEWALK_HEIGHT
    const cZ = curr.z + nz * (roadHalfW + curbBevelW)

    // Check if curb itself is inside an intersecting street's asphalt
    let blocked = false
    if (obstacles.length > 0) {
      if (isPointInRoadAsphalt(cX, cZ, obstacles, 0.20) || isPointInRoadAsphalt(gX, gZ, obstacles, 0.20)) {
        blocked = true
      }
    }

    // 3. Sidewalk outer walkway edge (clamped so outer edge doesn't poke into intersecting roads)
    let effW = sidewalkW
    if (!blocked && obstacles.length > 0) {
      while (effW > 1.2 && isPointInRoadAsphalt(curr.x + nx * (roadHalfW + curbBevelW + effW), curr.z + nz * (roadHalfW + curbBevelW + effW), obstacles, 0.20)) {
        effW -= 0.8
      }
    }

    const wX = curr.x + nx * (roadHalfW + curbBevelW + effW)
    const wY = curr.y + SIDEWALK_HEIGHT
    const wZ = curr.z + nz * (roadHalfW + curbBevelW + effW)

    // 4. Skirt bottom (drops to foundation)
    const dX = wX
    const dY = curr.y - 0.05
    const dZ = wZ

    slices.push({
      blocked,
      gX, gY, gZ,
      cX, cY, cZ,
      wX, wY, wZ,
      dX, dY, dZ,
      dist: totalDist,
    })
  }

  const curbVerts: number[] = []
  const curbIndices: number[] = []

  const walkVerts: number[] = []
  const walkUvs: number[] = []
  const walkIndices: number[] = []

  const dropVerts: number[] = []
  const dropIndices: number[] = []

  let curbQuadCount = 0
  let walkQuadCount = 0
  let dropQuadCount = 0

  function addEndCap(s: SidewalkSlice, isStart: boolean): void {
    const cb = curbQuadCount * 4
    curbVerts.push(
      s.cX, s.cY, s.cZ,
      s.wX, s.wY, s.wZ,
      s.cX, s.gY, s.cZ,
      s.wX, s.gY, s.wZ,
    )
    if (isStart) {
      curbIndices.push(cb, cb + 1, cb + 2, cb + 1, cb + 3, cb + 2)
    } else {
      curbIndices.push(cb + 2, cb + 1, cb, cb + 2, cb + 3, cb + 1)
    }
    curbQuadCount++
  }

  // Connect consecutive unblocked slices
  for (let i = 0; i < slices.length - 1; i++) {
    const s1 = slices[i]!
    const s2 = slices[i + 1]!

    if (s1.blocked && !s2.blocked) {
      addEndCap(s2, true)
    } else if (!s1.blocked && s2.blocked) {
      addEndCap(s1, false)
    }

    if (s1.blocked || s2.blocked) {
      continue
    }

    // 1. Beveled Curb Quad
    const cb = curbQuadCount * 4
    curbVerts.push(
      s1.gX, s1.gY, s1.gZ,
      s1.cX, s1.cY, s1.cZ,
      s2.gX, s2.gY, s2.gZ,
      s2.cX, s2.cY, s2.cZ,
    )
    curbIndices.push(cb, cb + 1, cb + 2, cb + 1, cb + 3, cb + 2)
    curbQuadCount++

    // 2. Walkway Tile Quad
    const wb = walkQuadCount * 4
    walkVerts.push(
      s1.cX, s1.cY, s1.cZ,
      s1.wX, s1.wY, s1.wZ,
      s2.cX, s2.cY, s2.cZ,
      s2.wX, s2.wY, s2.wZ,
    )
    const v1 = s1.dist / 3.0
    const v2 = s2.dist / 3.0
    walkUvs.push(0, v1, 1, v1, 0, v2, 1, v2)
    walkIndices.push(wb, wb + 1, wb + 2, wb + 1, wb + 3, wb + 2)
    walkQuadCount++

    // 3. Drop Skirt Quad
    const db = dropQuadCount * 4
    dropVerts.push(
      s1.wX, s1.wY, s1.wZ,
      s1.dX, s1.dY, s1.dZ,
      s2.wX, s2.wY, s2.wZ,
      s2.dX, s2.dY, s2.dZ,
    )
    dropIndices.push(db, db + 1, db + 2, db + 1, db + 3, db + 2)
    dropQuadCount++
  }

  // End cap at road extremities if unblocked
  if (slices.length > 1) {
    if (!slices[0]!.blocked && !slices[1]!.blocked) addEndCap(slices[0]!, true)
    const last = slices.length - 1
    if (!slices[last]!.blocked && !slices[last - 1]!.blocked) addEndCap(slices[last]!, false)
  }

  if (curbVerts.length > 0) {
    const curbGeo = new THREE.BufferGeometry()
    curbGeo.setAttribute('position', new THREE.Float32BufferAttribute(curbVerts, 3))
    curbGeo.setIndex(curbIndices)
    curbGeo.computeVertexNormals()
    const curbMesh = new THREE.Mesh(curbGeo, CURB_MAT)
    curbMesh.receiveShadow = true
    curbMesh.castShadow = true
    curbMesh.renderOrder = 5
    group.add(curbMesh)
  }

  if (walkVerts.length > 0) {
    const walkGeo = new THREE.BufferGeometry()
    walkGeo.setAttribute('position', new THREE.Float32BufferAttribute(walkVerts, 3))
    walkGeo.setAttribute('uv', new THREE.Float32BufferAttribute(walkUvs, 2))
    walkGeo.setIndex(walkIndices)
    walkGeo.computeVertexNormals()
    const walkMesh = new THREE.Mesh(walkGeo, SIDEWALK_MAT)
    walkMesh.receiveShadow = true
    walkMesh.renderOrder = 5
    group.add(walkMesh)
  }

  if (dropVerts.length > 0) {
    const dropGeo = new THREE.BufferGeometry()
    dropGeo.setAttribute('position', new THREE.Float32BufferAttribute(dropVerts, 3))
    dropGeo.setIndex(dropIndices)
    dropGeo.computeVertexNormals()
    const dropMesh = new THREE.Mesh(dropGeo, CURB_MAT)
    dropMesh.receiveShadow = true
    dropMesh.renderOrder = 5
    group.add(dropMesh)
  }

  return group
}

/**
 * Builds dashed lines along a polyline.
 */
function buildDashedLine(
  points: { x: number; y: number; z: number }[],
  lateralOffset: number,
  halfMarkW: number,
  yOffset: number,
  dashLen: number,
  gapLen: number,
  material: THREE.MeshStandardMaterial,
): THREE.Mesh | null {
  if (points.length < 2) return null

  const strip: { x: number; y: number; z: number; nx: number; nz: number }[] = []
  for (let i = 0; i < points.length; i++) {
    const prev = points[Math.max(0, i - 1)]!
    const next = points[Math.min(points.length - 1, i + 1)]!
    let dx = next.x - prev.x; let dz = next.z - prev.z
    const l = Math.sqrt(dx * dx + dz * dz)
    if (l > 0) { dx /= l; dz /= l; }
    strip.push({ x: points[i]!.x + (-dz) * lateralOffset, y: points[i]!.y, z: points[i]!.z + dx * lateralOffset, nx: -dz, nz: dx })
  }

  const vertices: number[] = []
  const indices: number[] = []
  let arcLen = 0
  let quadIdx = 0

  for (let i = 0; i < strip.length - 1; i++) {
    const a = strip[i]!
    const b = strip[i + 1]!
    const segLen = Math.sqrt((b.x - a.x) ** 2 + (b.z - a.z) ** 2)
    const cycleLen = dashLen + gapLen
    let t = 0
    while (t < segLen) {
      const phase = (arcLen + t) % cycleLen
      if (phase < dashLen) {
        const dashRemain = Math.min(dashLen - phase, segLen - t)
        const tA = t / segLen
        const tB = Math.min((t + dashRemain) / segLen, 1.0)
        const pA = { x: a.x + (b.x - a.x) * tA, y: a.y, z: a.z + (b.z - a.z) * tA, nx: a.nx, nz: a.nz }
        const pB = { x: a.x + (b.x - a.x) * tB, y: a.y, z: a.z + (b.z - a.z) * tB, nx: a.nx, nz: a.nz }
        const base = quadIdx * 4
        vertices.push(
          pA.x + pA.nx * halfMarkW, pA.y + yOffset, pA.z + pA.nz * halfMarkW,
          pA.x - pA.nx * halfMarkW, pA.y + yOffset, pA.z - pA.nz * halfMarkW,
          pB.x + pB.nx * halfMarkW, pB.y + yOffset, pB.z + pB.nz * halfMarkW,
          pB.x - pB.nx * halfMarkW, pB.y + yOffset, pB.z - pB.nz * halfMarkW,
        )
        indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2)
        quadIdx++
        t += dashRemain
      } else {
        t += cycleLen - phase
      }
    }
    arcLen += segLen
  }

  if (vertices.length === 0) return null

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  return new THREE.Mesh(geo, material)
}

/**
 * Builds directional arrows painted flat on the asphalt.
 */
function buildRoadArrow(
  centerPt: { x: number; y: number; z: number },
  dir: { dx: number; dz: number },
): THREE.Mesh {
  const norm = { nx: -dir.dz, nz: dir.dx }
  const cy = centerPt.y + 0.040

  const stemHalfW = 0.18
  const headHalfW = 0.65

  // Stem back & front
  const p1 = { x: centerPt.x - dir.dx * 2.2 - norm.nx * stemHalfW, z: centerPt.z - dir.dz * 2.2 - norm.nz * stemHalfW }
  const p2 = { x: centerPt.x - dir.dx * 2.2 + norm.nx * stemHalfW, z: centerPt.z - dir.dz * 2.2 + norm.nz * stemHalfW }
  const p3 = { x: centerPt.x + dir.dx * 0.4 - norm.nx * stemHalfW, z: centerPt.z + dir.dz * 0.4 - norm.nz * stemHalfW }
  const p4 = { x: centerPt.x + dir.dx * 0.4 + norm.nx * stemHalfW, z: centerPt.z + dir.dz * 0.4 + norm.nz * stemHalfW }

  // Arrowhead wings & tip
  const p5 = { x: centerPt.x + dir.dx * 0.4 - norm.nx * headHalfW, z: centerPt.z + dir.dz * 0.4 - norm.nz * headHalfW }
  const p6 = { x: centerPt.x + dir.dx * 0.4 + norm.nx * headHalfW, z: centerPt.z + dir.dz * 0.4 + norm.nz * headHalfW }
  const p7 = { x: centerPt.x + dir.dx * 2.4, z: centerPt.z + dir.dz * 2.4 }

  const verts = [
    p1.x, cy, p1.z,
    p2.x, cy, p2.z,
    p3.x, cy, p3.z,
    p4.x, cy, p4.z,
    p5.x, cy, p5.z,
    p6.x, cy, p6.z,
    p7.x, cy, p7.z,
  ]

  const indices = [
    0, 1, 2, 1, 3, 2, // Stem
    4, 5, 6,          // Head triangle
  ]

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  const arrowMesh = new THREE.Mesh(geo, WHITE_MARK)
  arrowMesh.renderOrder = 4
  return arrowMesh
}

/**
 * Builds zebra stripes (passages piétons) at an intersection or cross point.
 */
function buildCrosswalk(
  centerPt: { x: number; y: number; z: number },
  dir: { dx: number; dz: number },
  roadHalfW: number,
): THREE.Mesh | null {
  const norm = { nx: -dir.dz, nz: dir.dx }
  const stripeWidth = 0.50
  const stripeGap = 0.45
  const stripeLength = 3.6
  const halfLen = stripeLength / 2

  const vertices: number[] = []
  const indices: number[] = []
  let quadIdx = 0

  const totalCrossW = roadHalfW * 2 - 0.8
  const startOffset = -totalCrossW / 2
  const numStripes = Math.floor(totalCrossW / (stripeWidth + stripeGap))

  for (let s = 0; s < numStripes; s++) {
    const lat = startOffset + s * (stripeWidth + stripeGap) + stripeWidth / 2
    const cx = centerPt.x + norm.nx * lat
    const cz = centerPt.z + norm.nz * lat
    const cy = centerPt.y + 0.040

    const p1x = cx + norm.nx * (stripeWidth / 2) - dir.dx * halfLen
    const p1z = cz + norm.nz * (stripeWidth / 2) - dir.dz * halfLen

    const p2x = cx - norm.nx * (stripeWidth / 2) - dir.dx * halfLen
    const p2z = cz - norm.nz * (stripeWidth / 2) - dir.dz * halfLen

    const p3x = cx + norm.nx * (stripeWidth / 2) + dir.dx * halfLen
    const p3z = cz + norm.nz * (stripeWidth / 2) + dir.dz * halfLen

    const p4x = cx - norm.nx * (stripeWidth / 2) + dir.dx * halfLen
    const p4z = cz - norm.nz * (stripeWidth / 2) + dir.dz * halfLen

    const base = quadIdx * 4
    vertices.push(
      p1x, cy, p1z,
      p2x, cy, p2z,
      p3x, cy, p3z,
      p4x, cy, p4z,
    )
    indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2)
    quadIdx++
  }

  if (vertices.length === 0) return null
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  const crossMesh = new THREE.Mesh(geo, WHITE_MARK)
  crossMesh.renderOrder = 4
  return crossMesh
}

/**
 * Builds a continuous stop line across the approach lanes.
 */
function buildStopLine(
  centerPt: { x: number; y: number; z: number },
  dir: { dx: number; dz: number },
  roadHalfW: number,
): THREE.Mesh | null {
  const norm = { nx: -dir.dz, nz: dir.dx }
  const barThick = 0.45
  const halfThick = barThick / 2
  const span = roadHalfW - 0.4

  const cy = centerPt.y + 0.040
  const base = 0
  const vertices = [
    centerPt.x - dir.dx * halfThick, cy, centerPt.z - dir.dz * halfThick,
    centerPt.x + norm.nx * span - dir.dx * halfThick, cy, centerPt.z + norm.nz * span - dir.dz * halfThick,
    centerPt.x + dir.dx * halfThick, cy, centerPt.z + dir.dz * halfThick,
    centerPt.x + norm.nx * span + dir.dx * halfThick, cy, centerPt.z + norm.nz * span + dir.dz * halfThick,
  ]
  const indices = [base, base + 1, base + 2, base + 1, base + 3, base + 2]

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  const stopMesh = new THREE.Mesh(geo, WHITE_MARK)
  stopMesh.renderOrder = 4
  return stopMesh
}

// ── 3. Main RoadMeshGenerator ──────────────────────────────────────────────

export class RoadMeshGenerator {
  /**
   * Generate an arcade-style, high-speed Burnout Paradise road group.
   * Completely clean of vertical poles and obstructions!
   */
  static generate(road: Road, allRoads?: Road[]): THREE.Group | null {
    const pts = road.points
    if (pts.length < 2) return null

    // Highway classification
    const hw = road.highway
    const isHighway = hw === 'motorway' || hw === 'trunk'
    const isMajor = hw === 'primary' || isHighway
    const isMedium = hw === 'secondary' || hw === 'tertiary'
    const isUrbanStreet = !isHighway && hw !== 'path' && hw !== 'footway' && hw !== 'cycleway'

    // Compute lanes: all drivable roads have at least 2 lanes (double sens)
    let lanes = road.lanes
    if (isMajor) lanes = Math.max(4, lanes)
    else lanes = Math.max(2, lanes)

    const roadW = lanes * LANE_WIDTH
    const halfW = roadW / 2
    const group = new THREE.Group()
    group.userData['roadId'] = road.id

    // ── 1. Asphalt Surface (Medium charcoal slate with PBR mineral aggregate) ──
    const surface = buildRibbon(pts, halfW, 0.028, getAsphaltMaterial(hw))
    if (surface) {
      surface.userData['roadId'] = road.id
      surface.renderOrder = 3
      group.add(surface)
    }

    if (hw === 'path' || hw === 'footway' || hw === 'cycleway') {
      return group
    }

    // ── 2. Paved Granite Gutter (Caniveau de bordure de 24cm) ─────────
    const gutterW = 0.24
    const gutterOffset = halfW - gutterW / 2
    const leftGutter = buildRibbon(pts, gutterW / 2, 0.029, GUTTER_MAT)
    const rightGutter = buildRibbon(pts, gutterW / 2, 0.029, GUTTER_MAT)
    if (leftGutter)  { leftGutter.renderOrder = 3; shiftRibbonLateral(leftGutter, pts, gutterOffset); group.add(leftGutter) }
    if (rightGutter) { rightGutter.renderOrder = 3; shiftRibbonLateral(rightGutter, pts, -gutterOffset); group.add(rightGutter) }

    // ── 3. Rubber Tire Tracks (Traces de pneus / gommage au sol) ──────
    const tireTrackHalfW = 0.22
    for (let l = 0; l < lanes; l++) {
      const laneCenter = -halfW + (l + 0.5) * (roadW / lanes)
      const leftWheelOffset = laneCenter - 0.75
      const rightWheelOffset = laneCenter + 0.75

      const trackL = buildRibbon(pts, tireTrackHalfW, 0.032, TIRE_RUBBER_MAT)
      const trackR = buildRibbon(pts, tireTrackHalfW, 0.032, TIRE_RUBBER_MAT)
      if (trackL) { trackL.renderOrder = 3; shiftRibbonLateral(trackL, pts, leftWheelOffset); group.add(trackL) }
      if (trackR) { trackR.renderOrder = 3; shiftRibbonLateral(trackR, pts, rightWheelOffset); group.add(trackR) }
    }

    // ── 4. Solid White Edge Lines (Bandes de rive nettes & visibles) ───
    const edgeHalfW = 0.07 // 14cm wide solid line
    const edgeOffset = halfW - 0.40 // Inset 40cm from curb, clearly on the asphalt
    const leftEdge = buildRibbon(pts, edgeHalfW, 0.040, WHITE_MARK)
    const rightEdge = buildRibbon(pts, edgeHalfW, 0.040, WHITE_MARK)
    if (leftEdge)  { leftEdge.renderOrder = 4; shiftRibbonLateral(leftEdge,  pts,  edgeOffset); group.add(leftEdge)  }
    if (rightEdge) { rightEdge.renderOrder = 4; shiftRibbonLateral(rightEdge, pts, -edgeOffset); group.add(rightEdge) }

    // ── 5. Ground Lane Markings (Ligne centrale & séparateurs de voies) ─
    if (lanes >= 4) {
      // GROSSE AVENUE :
      // A. Double ligne jaune continue centrale
      const doubleSep = 0.14
      const leftCenterLine = buildRibbon(pts, 0.06, 0.040, YELLOW_MARK)
      const rightCenterLine = buildRibbon(pts, 0.06, 0.040, YELLOW_MARK)
      if (leftCenterLine)  { leftCenterLine.renderOrder = 4; shiftRibbonLateral(leftCenterLine,  pts,  doubleSep); group.add(leftCenterLine) }
      if (rightCenterLine) { rightCenterLine.renderOrder = 4; shiftRibbonLateral(rightCenterLine, pts, -doubleSep); group.add(rightCenterLine) }

      // B. Lignes blanches discontinues séparant les voies de chaque sens
      const dividerOffset = halfW / 2
      const divLeft = buildDashedLine(pts, dividerOffset, 0.07, 0.040, 4.0, 5.0, WHITE_MARK)
      const divRight = buildDashedLine(pts, -dividerOffset, 0.07, 0.040, 4.0, 5.0, WHITE_MARK)
      if (divLeft)  { divLeft.renderOrder = 4; group.add(divLeft) }
      if (divRight) { divRight.renderOrder = 4; group.add(divRight) }
    } else {
      // RUE DE VILLE (2 voies à double sens) :
      // Ligne blanche discontinue centrale (pointillés réguliers 3m / 3m)
      const centerDivider = buildDashedLine(pts, 0, 0.07, 0.040, 3.0, 3.0, WHITE_MARK)
      if (centerDivider) { centerDivider.renderOrder = 4; group.add(centerDivider) }
    }

    // ── 6. Clean Elevated Sidewalks & Beveled Curbs ───────────────────
    if (isUrbanStreet) {
      const obstacles = buildRoadObstacles(allRoads, road.id)
      const swWidth = isMajor ? 3.8 : DEFAULT_SIDEWALK_WIDTH
      const leftSidewalk = buildCleanSidewalk(pts, halfW, swWidth, 'left', obstacles)
      const rightSidewalk = buildCleanSidewalk(pts, halfW, swWidth, 'right', obstacles)
      group.add(leftSidewalk)
      group.add(rightSidewalk)
    }

    // ── 6. Directional Road Arrows & Crosswalks (Marquages au sol) ────
    let roadLength = 0
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]!
      const b = pts[i + 1]!
      roadLength += Math.sqrt((b.x - a.x) ** 2 + (b.z - a.z) ** 2)
    }

    if (roadLength >= 25) {
      // Place crosswalk near junction/start
      const crossDist = Math.min(14, roadLength * 0.35)
      let accum = 0

      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i]!; const b = pts[i + 1]!
        const segLen = Math.sqrt((b.x - a.x) ** 2 + (b.z - a.z) ** 2)
        if (accum + segLen >= crossDist) {
          const t = (crossDist - accum) / segLen
          let dx = b.x - a.x; let dz = b.z - a.z
          if (segLen > 0) { dx /= segLen; dz /= segLen; }
          const crosswalkPt = {
            x: a.x + dx * (crossDist - accum),
            y: a.y + (b.y - a.y) * t,
            z: a.z + dz * (crossDist - accum),
          }

          // Zebra stripes
          const crosswalk = buildCrosswalk(crosswalkPt, { dx, dz }, halfW)
          if (crosswalk) { crosswalk.renderOrder = 4; group.add(crosswalk) }

          // Stop line 2.5m before crosswalk
          const stopPt = {
            x: crosswalkPt.x - dx * 2.5,
            y: crosswalkPt.y,
            z: crosswalkPt.z - dz * 2.5,
          }
          const stopLine = buildStopLine(stopPt, { dx, dz }, halfW)
          if (stopLine) { stopLine.renderOrder = 4; group.add(stopLine) }
          break
        }
        accum += segLen
      }

      // Directional arrows painted flat on multi-lane avenues
      if (lanes >= 4 && roadLength >= 50) {
        const arrowDist = roadLength * 0.65
        accum = 0
        for (let i = 0; i < pts.length - 1; i++) {
          const a = pts[i]!; const b = pts[i + 1]!
          const segLen = Math.sqrt((b.x - a.x) ** 2 + (b.z - a.z) ** 2)
          if (accum + segLen >= arrowDist) {
            const t = (arrowDist - accum) / segLen
            let dx = b.x - a.x; let dz = b.z - a.z
            if (segLen > 0) { dx /= segLen; dz /= segLen; }
            const norm = { nx: -dz, nz: dx }

            // Arrow on right lanes (heading forward)
            const arrowCenterRight = {
              x: a.x + dx * (arrowDist - accum) + norm.nx * (halfW * 0.5),
              y: a.y + (b.y - a.y) * t,
              z: a.z + dz * (arrowDist - accum) + norm.nz * (halfW * 0.5),
            }
            const rightArrow = buildRoadArrow(arrowCenterRight, { dx, dz })
            rightArrow.renderOrder = 4
            group.add(rightArrow)

            // Arrow on left lanes (heading opposite)
            const arrowCenterLeft = {
              x: a.x + dx * (arrowDist - accum) - norm.nx * (halfW * 0.5),
              y: a.y + (b.y - a.y) * t,
              z: a.z + dz * (arrowDist - accum) - norm.nz * (halfW * 0.5),
            }
            const leftArrow = buildRoadArrow(arrowCenterLeft, { dx: -dx, dz: -dz })
            leftArrow.renderOrder = 4
            group.add(leftArrow)
            break
          }
          accum += segLen
        }
      }
    }

    return group
  }
}
