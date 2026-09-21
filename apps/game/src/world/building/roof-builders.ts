/**
 * Roof geometry builders for all OSM roof:shape types.
 * Each function builds a specific roof type with architectural details.
 */

import * as THREE from 'three'

// ── Footprint-aware helpers ────────────────────────────────────────────────────
// Pitched roofs must hug the real footprint ring. The old code built several
// shapes from the axis-aligned bounding box, so on any non-rectangular building
// (L, U, courtyard wings, angled lots) the roof floated beside the walls.

/** Signed area of a ring in (x, z) plane coordinates. */
function signedArea2(ring: THREE.Vector2[]): number {
  let a = 0
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i]!
    const q = ring[(i + 1) % ring.length]!
    a += p.x * q.y - q.x * p.y
  }
  return a / 2
}

/** Remove closing duplicates and zero-length edges. */
function cleanRing(fp: THREE.Vector2[]): THREE.Vector2[] {
  const out: THREE.Vector2[] = []
  for (const p of fp) {
    const last = out[out.length - 1]
    if (!last || Math.hypot(last.x - p.x, last.y - p.y) > 1e-4) {
      out.push(new THREE.Vector2(p.x, p.y))
    }
  }
  if (out.length > 1) {
    const f = out[0]!
    const l = out[out.length - 1]!
    if (Math.hypot(f.x - l.x, f.y - l.y) <= 1e-4) out.pop()
  }
  return out
}

/** Drop vertices splitting a straight edge (direction change < ~5°). */
function mergeCollinear(ring: THREE.Vector2[]): THREE.Vector2[] {
  const n = ring.length
  if (n <= 4) return ring.slice()
  const out: THREE.Vector2[] = []
  for (let i = 0; i < n; i++) {
    const p = ring[(i + n - 1) % n]!
    const q = ring[i]!
    const r = ring[(i + 1) % n]!
    const d1x = q.x - p.x, d1y = q.y - p.y
    const d2x = r.x - q.x, d2y = r.y - q.y
    const l1 = Math.hypot(d1x, d1y), l2 = Math.hypot(d2x, d2y)
    if (l1 < 1e-6 || l2 < 1e-6) continue
    if ((d1x * d2x + d1y * d2y) / (l1 * l2) > 0.996) continue // ~straight: skip q
    out.push(q)
  }
  return out.length >= 3 ? out : ring.slice()
}

function bboxOf(ring: THREE.Vector2[]): { minX: number; maxX: number; minY: number; maxY: number } {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const p of ring) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x)
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y)
  }
  return { minX, maxX, minY, maxY }
}

/**
 * True when the footprint is a plain rectangle (4 near-right-angle corners,
 * filling its bounding box). Only then is a bounding-box roof exact.
 */
export function isRectangleLike(fp: THREE.Vector2[]): boolean {
  const ring = mergeCollinear(cleanRing(fp))
  if (ring.length !== 4) return false
  for (let i = 0; i < 4; i++) {
    const p = ring[(i + 3) % 4]!
    const q = ring[i]!
    const r = ring[(i + 1) % 4]!
    const d1x = q.x - p.x, d1y = q.y - p.y
    const d2x = r.x - q.x, d2y = r.y - q.y
    const l1 = Math.hypot(d1x, d1y), l2 = Math.hypot(d2x, d2y)
    if (l1 < 0.3 || l2 < 0.3) return false
    const cos = (d1x * d2x + d1y * d2y) / (l1 * l2)
    if (Math.abs(cos) > 0.17) return false // > ~80°..100° off right angle
  }
  const bb = bboxOf(ring)
  const bbArea = (bb.maxX - bb.minX) * (bb.maxY - bb.minY)
  if (bbArea < 1e-6) return false
  return Math.abs(signedArea2(ring)) / bbArea > 0.82
}

/** True when every turn has the same sign (fan triangulation is safe). */
export function isConvexRing(fp: THREE.Vector2[]): boolean {
  const ring = cleanRing(fp)
  const n = ring.length
  if (n < 3) return false
  let sign = 0
  for (let i = 0; i < n; i++) {
    const p = ring[i]!
    const q = ring[(i + 1) % n]!
    const r = ring[(i + 2) % n]!
    const cross = (q.x - p.x) * (r.y - q.y) - (q.y - p.y) * (r.x - q.x)
    if (Math.abs(cross) < 1e-9) continue
    const s = cross > 0 ? 1 : -1
    if (sign === 0) sign = s
    else if (sign !== s) return false
  }
  return true
}

/** Ray-casting point-in-ring on (x, y=z) coordinates. */
function pointInRing2(px: number, pz: number, ring: THREE.Vector2[]): boolean {
  let inside = false
  const n = ring.length
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const a = ring[i]!
    const b = ring[j]!
    if ((a.y > pz) !== (b.y > pz)) {
      const xAt = ((b.x - a.x) * (pz - a.y)) / (b.y - a.y) + a.x
      if (px < xAt) inside = !inside
    }
  }
  return inside
}

function distToSegment2(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax
  const dz = bz - az
  const l2 = dx * dx + dz * dz
  if (l2 < 1e-12) return Math.hypot(px - ax, pz - az)
  let t = ((px - ax) * dx + (pz - az) * dz) / l2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz))
}

/** Area-weighted centroid (stable for irregular rings, unlike vertex means). */
function areaCentroid(ring: THREE.Vector2[]): THREE.Vector2 {
  let a2 = 0, cx = 0, cy = 0
  const n = ring.length
  for (let i = 0; i < n; i++) {
    const p = ring[i]!
    const q = ring[(i + 1) % n]!
    const cross = p.x * q.y - q.x * p.y
    a2 += cross
    cx += (p.x + q.x) * cross
    cy += (p.y + q.y) * cross
  }
  if (Math.abs(a2) < 1e-9) {
    let sx = 0, sy = 0
    for (const p of ring) { sx += p.x; sy += p.y }
    return new THREE.Vector2(sx / n, sy / n)
  }
  return new THREE.Vector2(cx / (3 * a2), cy / (3 * a2))
}

/**
 * Inward edge-offset of a ring by distance d (mitred corners via adjacent
 * line intersection). Correct for concave rings, unlike radial scaling.
 * Returns null when the offset degenerates (ring too small / spikes).
 */
function offsetRingInward(ring: THREE.Vector2[], d: number): THREE.Vector2[] | null {
  const n = ring.length
  if (n < 3 || !(d > 0)) return null
  const sign = signedArea2(ring) > 0 ? 1 : -1
  // Offset lines: same direction as the edge, shifted inward by d.
  const lx: number[] = []
  const lz: number[] = []
  const ldx: number[] = []
  const ldz: number[] = []
  for (let i = 0; i < n; i++) {
    const p = ring[i]!
    const q = ring[(i + 1) % n]!
    const dx = q.x - p.x
    const dz = q.y - p.y
    const len = Math.hypot(dx, dz)
    if (len < 1e-6) return null
    const tx = dx / len
    const tz = dz / len
    // Outward unit normal (same convention as FacadeRelief ledges).
    const ix = -tz * sign
    const iz = tx * sign
    lx.push(p.x + ix * d)
    lz.push(p.y + iz * d)
    ldx.push(tx)
    ldz.push(tz)
  }
  const out: THREE.Vector2[] = []
  for (let i = 0; i < n; i++) {
    const j = (i + n - 1) % n
    const denom = ldx[j]! * ldz[i]! - ldz[j]! * ldx[i]!
    if (Math.abs(denom) < 1e-9) {
      // Parallel neighbours (straight continuation): push the vertex inward.
      const ix = -(ldz[j]! + ldz[i]!) * sign
      const iz = (ldx[j]! + ldx[i]!) * sign
      const l = Math.hypot(ix, iz)
      if (l < 1e-9) return null
      const p = ring[i]!
      out.push(new THREE.Vector2(p.x + (ix / l) * d, p.y + (iz / l) * d))
    } else {
      const t = ((lx[i]! - lx[j]!) * ldz[i]! - (lz[i]! - lz[j]!) * ldx[i]!) / denom
      out.push(new THREE.Vector2(lx[j]! + ldx[j]! * t, lz[j]! + ldz[j]! * t))
    }
  }
  // Degeneracy guards: area must shrink but stay positive, orientation kept.
  const oldA = Math.abs(signedArea2(ring))
  const newA = Math.abs(signedArea2(out))
  if (!Number.isFinite(newA) || newA < Math.min(0.3, oldA * 0.04) || newA > oldA * 0.985) return null
  if ((signedArea2(out) > 0) !== (signedArea2(ring) > 0)) return null
  for (let i = 0; i < n; i++) {
    const p = out[i]!
    const q = out[(i + 1) % n]!
    if (Math.hypot(q.x - p.x, q.y - p.y) < 0.12) return null
  }
  return out
}

/**
 * After assembling an indexed slope strip, guarantee the faces point outward:
 * check the first triangle against the outward direction of its edge and flip
 * every triangle when opposed (ring orientation is arbitrary from OSM).
 */
function ensureOutwardFaces(geo: THREE.BufferGeometry, ring: THREE.Vector2[]): void {
  const sign = signedArea2(ring) > 0 ? 1 : -1
  const p = ring[0]!
  const q = ring[1 % ring.length]!
  const len = Math.max(1e-6, Math.hypot(q.x - p.x, q.y - p.y))
  const ox = ((q.y - p.y) / len) * sign
  const oz = (-(q.x - p.x) / len) * sign
  const posA = geo.getAttribute('position') as THREE.BufferAttribute
  const idx = geo.getIndex()
  if (!idx || posA.count < 3) return
  const ax = posA.getX(0), ay = posA.getY(0), az = posA.getZ(0)
  const bx = posA.getX(1), by = posA.getY(1), bz = posA.getZ(1)
  const cx = posA.getX(2), cy = posA.getY(2), cz = posA.getZ(2)
  const ux = bx - ax, uy = by - ay, uz = bz - az
  const vx = cx - ax, vy = cy - ay, vz = cz - az
  // Face normal = u × v
  const nx = uy * vz - uz * vy
  const ny = uz * vx - ux * vz
  const nz = ux * vy - uy * vx
  if (nx * ox + ny * 0.6 + nz * oz < 0) {
    const arr = idx.array as unknown as number[]
    for (let t = 0; t < arr.length; t += 3) {
      const tmp = arr[t + 1]!
      arr[t + 1] = arr[t + 2]!
      arr[t + 2] = tmp
    }
    idx.needsUpdate = true
  }
}

/** Flat cap over a ring at height y (earcut-safe for concave rings). */
function flatCapGeometry(ring: THREE.Vector2[], y: number): THREE.BufferGeometry {
  const shape = new THREE.Shape()
  shape.moveTo(ring[0]!.x, -ring[0]!.y)
  for (let i = 1; i < ring.length; i++) shape.lineTo(ring[i]!.x, -ring[i]!.y)
  shape.closePath()
  const geo = new THREE.ShapeGeometry(shape)
  geo.rotateX(-Math.PI / 2)
  geo.translate(0, y, 0)
  return geo
}

/**
 * Hipped-look roof that FOLLOWS any footprint: successive inward offsets form
 * slope bands, finished with a flat deck cap. Fallback for pitched shapes on
 * irregular (non-rectangular) footprints, where bounding-box roofs float off
 * the walls. Returns null when even the first offset degenerates.
 */
export function buildFollowHipRoof(
  fp: THREE.Vector2[],
  roofHeight: number,
  baseHeight: number,
  mat: THREE.Material,
  steps = 4,
): THREE.Group | null {
  const outer = cleanRing(fp)
  if (outer.length < 3) return null
  const bb = bboxOf(outer)
  const minSpan = Math.min(bb.maxX - bb.minX, bb.maxY - bb.minY)
  if (minSpan < 1.2) return null
  const stepD = minSpan / (2 * (steps + 1))

  const rings: THREE.Vector2[][] = [outer]
  for (let s = 0; s < steps; s++) {
    const prev = rings[rings.length - 1]!
    const next = offsetRingInward(prev, stepD)
    if (!next) break
    rings.push(next)
  }
  if (rings.length < 2) return null

  const group = new THREE.Group()
  const peakY = baseHeight + roofHeight
  // Slope bands between consecutive rings.
  const pos: number[] = []
  const idx: number[] = []
  for (let r = 0; r < rings.length - 1; r++) {
    const lower = rings[r]!
    const upper = rings[r + 1]!
    const y0 = baseHeight + (roofHeight * r) / (rings.length - 1)
    const y1 = baseHeight + (roofHeight * (r + 1)) / (rings.length - 1)
    const n = lower.length // upper has the same vertex count by construction
    for (let i = 0; i < n; i++) {
      const next = (i + 1) % n
      const p1 = lower[i]!
      const p2 = lower[next]!
      const q1 = upper[i]!
      const q2 = upper[next]!
      const b = pos.length / 3
      pos.push(p1.x, y0, p1.y, p2.x, y0, p2.y, q2.x, y1, q2.y, q1.x, y1, q1.y)
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3)
    }
  }
  const slopeGeo = new THREE.BufferGeometry()
  slopeGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  slopeGeo.setIndex(idx)
  slopeGeo.computeVertexNormals()
  ensureOutwardFaces(slopeGeo, outer)
  slopeGeo.computeVertexNormals()
  const slopes = new THREE.Mesh(slopeGeo, mat)
  slopes.castShadow = true
  slopes.receiveShadow = true
  group.add(slopes)

  // Deck cap over the innermost ring.
  const cap = new THREE.Mesh(flatCapGeometry(rings[rings.length - 1]!, peakY), mat)
  cap.receiveShadow = true
  group.add(cap)
  return group
}

// ── Roof Geometry Builders (Section 8: roof:shape=*) ──────────────────────────

/**
 * Build a flat roof with stone parapet wall (acrotère) along the perimeter
 * and rooftop technical equipment (elevator housing, HVAC chillers, antenna mast).
 */
export function buildFlatRoofWithDetails(
  shape: THREE.Shape,
  fp: THREE.Vector2[],
  baseHeight: number,
  roofMat: THREE.MeshStandardMaterial,
  facadeMat: THREE.MeshStandardMaterial,
  skipEquipment = false,
): THREE.Group {
  const group = new THREE.Group()

  // 1. Roof deck slab
  const roofGeo = new THREE.ShapeGeometry(shape)
  roofGeo.rotateX(-Math.PI / 2)
  roofGeo.translate(0, baseHeight, 0)
  const roofMesh = new THREE.Mesh(roofGeo, roofMat)
  roofMesh.receiveShadow = true
  group.add(roofMesh)

  // 2. Continuous Parapet Coping Border (Acrotère) along roof edge
  const parapetHeight = 0.75 // 75cm high safety ledge
  const parapetThickness = 0.35
  const N = fp.length

  // Bounding box calculations
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const p of fp) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x)
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y)
  }
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  const spanX = maxX - minX
  const spanY = maxY - minY

  // Parapet geometry: outer wall, inner wall, and top coping
  const parapetInnerVerts: THREE.Vector2[] = fp.map(p => {
    const dx = cx - p.x
    const dy = cy - p.y
    const d = Math.hypot(dx, dy)
    if (d < 0.1) return p
    const ratio = Math.min(0.25, parapetThickness / d)
    return new THREE.Vector2(p.x + dx * ratio, p.y + dy * ratio)
  })

  const pPos: number[] = []
  const pNorm: number[] = []
  const pIdx: number[] = []

  for (let i = 0; i < N; i++) {
    const next = (i + 1) % N
    const p1 = fp[i]!
    const p2 = fp[next]!
    const q1 = parapetInnerVerts[i]!
    const q2 = parapetInnerVerts[next]!

    // Top coping cap
    const b = pPos.length / 3
    pPos.push(
      p1.x, baseHeight + parapetHeight, p1.y,
      p2.x, baseHeight + parapetHeight, p2.y,
      q2.x, baseHeight + parapetHeight, q2.y,
      q1.x, baseHeight + parapetHeight, q1.y,
    )
    pNorm.push(0, 1, 0,  0, 1, 0,  0, 1, 0,  0, 1, 0)
    pIdx.push(b, b + 1, b + 2,  b, b + 2, b + 3)

    // Inner parapet face
    const b2 = pPos.length / 3
    pPos.push(
      q1.x, baseHeight, q1.y,
      q2.x, baseHeight, q2.y,
      q2.x, baseHeight + parapetHeight, q2.y,
      q1.x, baseHeight + parapetHeight, q1.y,
    )
    pNorm.push(0, 0, 1,  0, 0, 1,  0, 0, 1,  0, 0, 1)
    pIdx.push(b2, b2 + 1, b2 + 2,  b2, b2 + 2, b2 + 3)
  }

  const parapetGeo = new THREE.BufferGeometry()
  parapetGeo.setAttribute('position', new THREE.Float32BufferAttribute(pPos, 3))
  parapetGeo.setAttribute('normal', new THREE.Float32BufferAttribute(pNorm, 3))
  parapetGeo.setIndex(pIdx)
  parapetGeo.computeVertexNormals()
  const parapetMesh = new THREE.Mesh(parapetGeo, facadeMat)
  parapetMesh.receiveShadow = true
  group.add(parapetMesh)

  // 3. Rooftop equipment (elevator penthouse, HVAC chillers, communication mast)
  if (!skipEquipment && spanX > 10 && spanY > 10) {
    const equipMat = new THREE.MeshStandardMaterial({ color: 0x50545a, roughness: 0.85, metalness: 0.25 })

    // Elevator / stair penthouse housing
    const hvacW = Math.min(spanX * 0.22, 5.5)
    const hvacD = Math.min(spanY * 0.22, 4.5)
    const hvacH = 2.4
    const boxGeo = new THREE.BoxGeometry(hvacW, hvacH, hvacD)
    const boxMesh = new THREE.Mesh(boxGeo, equipMat)
    boxMesh.position.set(cx, baseHeight + hvacH / 2, cy)
    boxMesh.receiveShadow = true
    group.add(boxMesh)

    // Secondary ventilation chiller unit with fans
    if (spanX > 16) {
      const ventGeo = new THREE.BoxGeometry(hvacW * 0.65, 1.2, hvacD * 0.65)
      const ventMesh = new THREE.Mesh(ventGeo, equipMat)
      ventMesh.position.set(cx + hvacW * 0.85, baseHeight + 0.6, cy)
      group.add(ventMesh)
    }

    // Communication antenna mast with flashing red beacon
    if (spanX > 14 && spanY > 14) {
      const mastH = 4.5
      const mastGeo = new THREE.CylinderGeometry(0.06, 0.12, mastH, 6)
      const mastMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.8, roughness: 0.2 })
      const mastMesh = new THREE.Mesh(mastGeo, mastMat)
      mastMesh.position.set(cx - hvacW * 0.6, baseHeight + mastH / 2, cy - hvacD * 0.4)
      group.add(mastMesh)

      // Warning beacon tip
      const beaconGeo = new THREE.SphereGeometry(0.16, 8, 8)
      const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff2222 })
      const beaconMesh = new THREE.Mesh(beaconGeo, beaconMat)
      beaconMesh.position.set(cx - hvacW * 0.6, baseHeight + mastH, cy - hvacD * 0.4)
      group.add(beaconMesh)
    }
  }

  return group
}

/**
 * Build a classic Parisian 2-tier Mansard roof:
 * - Steep lower pitch in dark zinc/slate with 3D dormer windows (lucarnes)
 * - Flat upper roof deck
 * - Authentic terracotta chimney stacks (cheminées avec mitrons) along party walls
 */
export function buildMansardRoof(
  fp: THREE.Vector2[],
  roofHeight: number,
  baseHeight: number,
  roofMat: THREE.MeshStandardMaterial,
  _facadeMat: THREE.MeshStandardMaterial,
): THREE.Group | null {
  const group = new THREE.Group()

  // Edge-offset curb: follows concave footprints too (radial scaling broke on
  // L-shaped blocks, pushing the inner ring outside the walls).
  const outerVerts = cleanRing(fp)
  if (outerVerts.length < 3) return null
  const bb = bboxOf(outerVerts)
  const maxInset = Math.min(bb.maxX - bb.minX, bb.maxY - bb.minY) / 2 - 0.4
  if (maxInset < 0.5) return null
  const innerVerts = offsetRingInward(outerVerts, Math.min(1.3, maxInset))
  if (!innerVerts) return null
  const lowerH = roofHeight * 0.70

  // Steep mansard side slope quads
  const pos: number[] = []
  const idx: number[] = []
  const N = outerVerts.length

  for (let i = 0; i < N; i++) {
    const next = (i + 1) % N
    const p1 = outerVerts[i]!
    const p2 = outerVerts[next]!
    const q1 = innerVerts[i]!
    const q2 = innerVerts[next]!

    const b = pos.length / 3
    pos.push(
      p1.x, baseHeight, p1.y,
      p2.x, baseHeight, p2.y,
      q2.x, baseHeight + lowerH, q2.y,
      q1.x, baseHeight + lowerH, q1.y,
    )
    idx.push(b, b + 1, b + 2,  b, b + 2, b + 3)
  }

  // Upper flat zinc deck (earcut-safe for concave inner rings)
  const upperMesh = new THREE.Mesh(flatCapGeometry(innerVerts, baseHeight + lowerH), roofMat)
  upperMesh.receiveShadow = true
  group.add(upperMesh)

  const slopeGeo = new THREE.BufferGeometry()
  slopeGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  slopeGeo.setIndex(idx)
  slopeGeo.computeVertexNormals()
  ensureOutwardFaces(slopeGeo, outerVerts)
  slopeGeo.computeVertexNormals()
  const slopeMesh = new THREE.Mesh(slopeGeo, roofMat)
  slopeMesh.castShadow = true
  slopeMesh.receiveShadow = true
  group.add(slopeMesh)

  return group
}

/**
 * Build a gabled roof (triangular ridge along major axis or orientation).
 * Features vertical triangular gable end walls (murs pignons) textured with facadeMat,
 * and sloping roof planes textured with roofMat.
 */
export function buildGabledRoof(
  fp: THREE.Vector2[],
  roofHeight: number,
  baseHeight: number,
  roofMat: THREE.MeshStandardMaterial,
  facadeMat: THREE.MeshStandardMaterial,
  orientation?: 'along' | 'across',
): THREE.Group | null {
  // A bbox ridge roof only matches rectangular walls: irregular footprints get
  // a footprint-following hip roof instead of a slab floating off the walls.
  if (!isRectangleLike(fp)) {
    return buildFollowHipRoof(fp, roofHeight, baseHeight, roofMat)
  }
  const group = new THREE.Group()

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const p of fp) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x)
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y)
  }
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  const spanX = maxX - minX
  const spanY = maxY - minY

  let ridgeAlongX = spanX >= spanY
  if (orientation === 'across') ridgeAlongX = !ridgeAlongX

  const ridgeHalfLen = (ridgeAlongX ? spanX : spanY) / 2
  const peakY = baseHeight + roofHeight

  const r1x = ridgeAlongX ? cx - ridgeHalfLen : cx
  const r1z = ridgeAlongX ? cy : cy - ridgeHalfLen
  const r2x = ridgeAlongX ? cx + ridgeHalfLen : cx
  const r2z = ridgeAlongX ? cy : cy + ridgeHalfLen

  const e1 = { x: minX, z: minY }
  const e2 = { x: maxX, z: minY }
  const e3 = { x: maxX, z: maxY }
  const e4 = { x: minX, z: maxY }

  // Sloping roof planes (use roofMat)
  const roofPos: number[] = ridgeAlongX
    ? [
        // Side 1 (North slope)
        r1x, peakY, r1z,  r2x, peakY, r2z,  e2.x, baseHeight, e2.z,  e1.x, baseHeight, e1.z,
        // Side 2 (South slope)
        r2x, peakY, r2z,  r1x, peakY, r1z,  e4.x, baseHeight, e4.z,  e3.x, baseHeight, e3.z,
      ]
    : [
        // Side 1 (West slope)
        r1x, peakY, r1z,  r2x, peakY, r2z,  e4.x, baseHeight, e4.z,  e1.x, baseHeight, e1.z,
        // Side 2 (East slope)
        r2x, peakY, r2z,  r1x, peakY, r1z,  e2.x, baseHeight, e2.z,  e3.x, baseHeight, e3.z,
      ]

  const roofIdx = [
    0, 1, 2,  0, 2, 3,
    4, 5, 6,  4, 6, 7,
  ]

  const roofGeo = new THREE.BufferGeometry()
  roofGeo.setAttribute('position', new THREE.Float32BufferAttribute(roofPos, 3))
  roofGeo.setIndex(roofIdx)
  roofGeo.computeVertexNormals()
  const roofMesh = new THREE.Mesh(roofGeo, roofMat)
  roofMesh.castShadow = true
  roofMesh.receiveShadow = true
  group.add(roofMesh)

  // Vertical gable end walls (murs pignons) textured with facadeMat
  const gablePos: number[] = ridgeAlongX
    ? [
        // West gable end
        r1x, peakY, r1z,  e1.x, baseHeight, e1.z,  e4.x, baseHeight, e4.z,
        // East gable end
        r2x, peakY, r2z,  e3.x, baseHeight, e3.z,  e2.x, baseHeight, e2.z,
      ]
    : [
        // North gable end
        r1x, peakY, r1z,  e2.x, baseHeight, e2.z,  e1.x, baseHeight, e1.z,
        // South gable end
        r2x, peakY, r2z,  e4.x, baseHeight, e4.z,  e3.x, baseHeight, e3.z,
      ]

  const gableIdx = [0, 1, 2,  3, 4, 5]
  const gableGeo = new THREE.BufferGeometry()
  gableGeo.setAttribute('position', new THREE.Float32BufferAttribute(gablePos, 3))
  gableGeo.setIndex(gableIdx)
  gableGeo.computeVertexNormals()
  const gableMesh = new THREE.Mesh(gableGeo, facadeMat)
  gableMesh.castShadow = true
  gableMesh.receiveShadow = true
  group.add(gableMesh)

  // Ridge tile cap cylinder
  const ridgeLen = ridgeAlongX ? spanX : spanY
  const ridgeCapGeo = new THREE.CylinderGeometry(0.12, 0.12, ridgeLen, 6)
  if (ridgeAlongX) {
    ridgeCapGeo.rotateZ(Math.PI / 2)
  } else {
    ridgeCapGeo.rotateX(Math.PI / 2)
  }
  const ridgeCap = new THREE.Mesh(ridgeCapGeo, roofMat)
  ridgeCap.position.set(cx, peakY + 0.06, cy)
  group.add(ridgeCap)

  // Brick chimney stack near the ridge
  const chimH = 1.4
  const chimGeo = new THREE.BoxGeometry(0.7, chimH, 0.7)
  const chimMat = new THREE.MeshStandardMaterial({ color: 0x7c382b, roughness: 0.9 })
  const chimMesh = new THREE.Mesh(chimGeo, chimMat)
  chimMesh.position.set(cx + (ridgeAlongX ? spanX * 0.25 : 0), peakY + chimH * 0.3, cy + (ridgeAlongX ? 0 : spanY * 0.25))
  group.add(chimMesh)

  return group
}

/**
 * Build a genuine hipped roof (toit à 4 pans) with a central horizontal ridge
 * and 4 sloping trapezoidal/triangular roof facets.
 */
export function buildHippedRoof(
  fp: THREE.Vector2[],
  roofHeight: number,
  baseHeight: number,
  mat: THREE.MeshStandardMaterial,
): THREE.Mesh | THREE.Group | null {
  // Same rule as gabled: bbox hips only match rectangular walls.
  if (!isRectangleLike(fp)) {
    return buildFollowHipRoof(fp, roofHeight, baseHeight, mat)
  }
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const p of fp) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x)
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y)
  }
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  const spanX = maxX - minX
  const spanY = maxY - minY

  const alongX = spanX >= spanY
  const ridgeHalfLen = Math.max(0.5, (alongX ? spanX - spanY : spanY - spanX) / 2)
  const peakY = baseHeight + roofHeight

  const r1x = alongX ? cx - ridgeHalfLen : cx
  const r1z = alongX ? cy : cy - ridgeHalfLen
  const r2x = alongX ? cx + ridgeHalfLen : cx
  const r2z = alongX ? cy : cy + ridgeHalfLen

  const e1 = { x: minX, z: minY }
  const e2 = { x: maxX, z: minY }
  const e3 = { x: maxX, z: maxY }
  const e4 = { x: minX, z: maxY }

  const verts: number[] = [
    r1x, peakY, r1z,   // 0
    r2x, peakY, r2z,   // 1
    e1.x, baseHeight, e1.z, // 2
    e2.x, baseHeight, e2.z, // 3
    e3.x, baseHeight, e3.z, // 4
    e4.x, baseHeight, e4.z, // 5
  ]

  const indices: number[] = alongX
    ? [
        0, 3, 2,  0, 1, 3, // North trapezoid
        1, 4, 3,           // East triangle hip
        0, 4, 1,  0, 5, 4, // South trapezoid
        0, 2, 5,           // West triangle hip
      ]
    : [
        0, 2, 3,           // North triangle hip
        0, 3, 1,  1, 3, 4, // East trapezoid
        0, 1, 4,  0, 4, 5, // South triangle hip
        0, 5, 2,  1, 2, 5, // West trapezoid
      ]

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  const mesh = new THREE.Mesh(geo, mat)
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

/**
 * Build a pyramidal roof from footprint centroid.
 */
export function buildPyramidalRoof(
  fp: THREE.Vector2[],
  roofHeight: number,
  baseHeight: number,
  mat: THREE.MeshStandardMaterial,
): THREE.Mesh | THREE.Group | null {
  const ring = cleanRing(fp)
  if (ring.length < 3) return null
  // A single apex fan inverts on concave footprints (centroid outside the
  // ring): those get a footprint-following hip roof instead.
  if (!isConvexRing(ring)) {
    return buildFollowHipRoof(ring, roofHeight, baseHeight, mat)
  }
  const c = areaCentroid(ring)

  const peakY = baseHeight + roofHeight
  const verts: number[] = [c.x, peakY, c.y]
  for (const p of ring) verts.push(p.x, baseHeight, p.y)

  const indices: number[] = []
  for (let i = 0; i < ring.length; i++) {
    const next = (i + 1) % ring.length
    indices.push(0, i + 1, next + 1)
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  ensureOutwardFaces(geo, ring)
  geo.computeVertexNormals()
  const mesh = new THREE.Mesh(geo, mat)
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

/**
 * Build a skillion roof (mono-pitch shed roof) sloping from one side to the other.
 */
export function buildSkillionRoof(
  fp: THREE.Vector2[],
  roofHeight: number,
  baseHeight: number,
  roofMat: THREE.MeshStandardMaterial,
  facadeMat: THREE.MeshStandardMaterial,
): THREE.Group {
  const group = new THREE.Group()

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const p of fp) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x)
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y)
  }
  const spanX = maxX - minX
  const spanY = maxY - minY

  const slopeAlongX = spanX <= spanY

  // Sloping roof plane: earcut triangulation (safe on concave footprints —
  // the old fan covered voids outside the walls), then displace to the slope.
  // Returns null on degenerate footprints (caller falls back to flat).
  const ring = cleanRing(fp)
  if (ring.length < 3 || spanX < 1e-6 || spanY < 1e-6) return group
  const roofGeo = flatCapGeometry(ring, 0)
  const rp = roofGeo.getAttribute('position') as THREE.BufferAttribute
  for (let i = 0; i < rp.count; i++) {
    const x = rp.getX(i)
    const z = rp.getZ(i)
    const t = slopeAlongX ? (x - minX) / spanX : (z - minY) / spanY
    rp.setY(i, baseHeight + Math.max(0, Math.min(1, t)) * roofHeight)
  }
  rp.needsUpdate = true
  roofGeo.computeVertexNormals()
  const roofMesh = new THREE.Mesh(roofGeo, roofMat)
  roofMesh.castShadow = true
  roofMesh.receiveShadow = true
  group.add(roofMesh)

  // Side clerestory triangular/trapezoid wall skirts
  const wallPos: number[] = []
  const wallIdx: number[] = []
  const N = fp.length

  for (let i = 0; i < N; i++) {
    const next = (i + 1) % N
    const p1 = fp[i]!
    const p2 = fp[next]!
    const t1 = slopeAlongX ? (p1.x - minX) / spanX : (p1.y - minY) / spanY
    const t2 = slopeAlongX ? (p2.x - minX) / spanX : (p2.y - minY) / spanY

    const h1 = baseHeight + t1 * roofHeight
    const h2 = baseHeight + t2 * roofHeight

    const b = wallPos.length / 3
    wallPos.push(
      p1.x, baseHeight, p1.y,
      p2.x, baseHeight, p2.y,
      p2.x, h2, p2.y,
      p1.x, h1, p1.y,
    )
    wallIdx.push(b, b + 1, b + 2,  b, b + 2, b + 3)
  }

  const wallGeo = new THREE.BufferGeometry()
  wallGeo.setAttribute('position', new THREE.Float32BufferAttribute(wallPos, 3))
  wallGeo.setIndex(wallIdx)
  wallGeo.computeVertexNormals()
  const wallMesh = new THREE.Mesh(wallGeo, facadeMat)
  wallMesh.castShadow = true
  group.add(wallMesh)

  return group
}

/**
 * Build a round / barrel vault roof (toit arrondi / en berceau)
 * Typical for train stations, sports halls, hangars, and modern structures.
 */
export function buildRoundRoof(
  fp: THREE.Vector2[],
  roofHeight: number,
  baseHeight: number,
  roofMat: THREE.MeshStandardMaterial,
  _facadeMat: THREE.MeshStandardMaterial,
): THREE.Group | null {
  // A barrel vault spans a rectangular hall: on irregular footprints the sheet
  // floats off the walls, so decline (caller falls back to flat).
  if (!isRectangleLike(fp)) return null
  const group = new THREE.Group()

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const p of fp) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x)
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y)
  }
  const spanX = maxX - minX
  const spanY = maxY - minY
  const archAlongX = spanX <= spanY

  // Generate curved barrel arc
  const segments = 12
  const pos: number[] = []
  const idx: number[] = []

  const len = archAlongX ? spanY : spanX
  const width = archAlongX ? spanX : spanY
  const startW = archAlongX ? minX : minY
  const startL = archAlongX ? minY : minX

  for (let s = 0; s <= segments; s++) {
    const t = s / segments
    const angle = t * Math.PI
    const arcY = baseHeight + Math.sin(angle) * roofHeight
    const coordW = startW + t * width

    const x1 = archAlongX ? coordW : startL
    const z1 = archAlongX ? startL : coordW
    const x2 = archAlongX ? coordW : startL + len
    const z2 = archAlongX ? startL + len : coordW

    pos.push(x1, arcY, z1)
    pos.push(x2, arcY, z2)

    if (s > 0) {
      const b = (s - 1) * 2
      idx.push(b, b + 1, b + 3,  b, b + 3, b + 2)
    }
  }

  const barrelGeo = new THREE.BufferGeometry()
  barrelGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  barrelGeo.setIndex(idx)
  barrelGeo.computeVertexNormals()
  const barrelMesh = new THREE.Mesh(barrelGeo, roofMat)
  barrelMesh.castShadow = true
  barrelMesh.receiveShadow = true
  group.add(barrelMesh)

  return group
}

/**
 * Build a dome roof with drum base and decorative golden/copper apex spire finial.
 */
export function buildDomeRoof(
  fp: THREE.Vector2[],
  roofHeight: number,
  baseHeight: number,
  mat: THREE.MeshStandardMaterial,
): THREE.Group | null {
  const group = new THREE.Group()
  const ring = cleanRing(fp)
  if (ring.length < 3) return null
  // Inscribed fit: the drum must sit ON the walls. The bbox centre can lie
  // outside an irregular footprint (and the area centroid in a thin spot), so
  // scan a coarse grid over the bbox and keep the largest inscribed circle.
  // Decline when nothing fits (caller falls back to flat).
  const bb = bboxOf(ring)
  const spanX = bb.maxX - bb.minX
  const spanZ = bb.maxY - bb.minY
  if (Math.min(spanX, spanZ) < 2.4) return null
  let cx = 0, cy = 0, radius = 0
  const steps = 8
  for (let gx = 0; gx <= steps; gx++) {
    for (let gz = 0; gz <= steps; gz++) {
      const px = bb.minX + (spanX * gx) / steps
      const pz = bb.minY + (spanZ * gz) / steps
      if (!pointInRing2(px, pz, ring)) continue
      let r = Infinity
      for (let i = 0; i < ring.length; i++) {
        const p = ring[i]!
        const q = ring[(i + 1) % ring.length]!
        r = Math.min(r, distToSegment2(px, pz, p.x, p.y, q.x, q.y))
      }
      if (r > radius) { radius = r; cx = px; cy = pz }
    }
  }
  if (radius < 1.2) return null

  // Stepped drum base collar
  const drumH = roofHeight * 0.25
  const drumGeo = new THREE.CylinderGeometry(radius * 0.95, radius, drumH, 20)
  drumGeo.translate(cx, baseHeight + drumH / 2, cy)
  const drumMesh = new THREE.Mesh(drumGeo, mat)
  drumMesh.castShadow = true
  group.add(drumMesh)

  // Dome hemisphere shell
  const domeH = roofHeight * 0.75
  const geo = new THREE.SphereGeometry(radius * 0.95, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2)
  geo.scale(1, domeH / (radius * 0.95), 1)
  geo.translate(cx, baseHeight + drumH, cy)
  const mesh = new THREE.Mesh(geo, mat)
  mesh.castShadow = true
  mesh.receiveShadow = true
  group.add(mesh)

  // Decorative gold/copper apex spire finial
  const finialGeo = new THREE.CylinderGeometry(0.12, 0.35, 3.5, 8)
  finialGeo.translate(cx, baseHeight + roofHeight + 1.75, cy)
  const finialMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.8, roughness: 0.25 })
  const finialMesh = new THREE.Mesh(finialGeo, finialMat)
  group.add(finialMesh)

  return group
}

/**
 * Build an open canopy / carport structure with slender support pillars
 * and a roof slab that players can drive under freely.
 */
export function buildOpenCanopy(
  fp: THREE.Vector2[],
  height: number,
  roofMat: THREE.MeshStandardMaterial,
): THREE.Group {
  const group = new THREE.Group()

  // Roof slab
  const shape = new THREE.Shape()
  shape.moveTo(fp[0]!.x, -fp[0]!.y)
  for (let i = 1; i < fp.length; i++) shape.lineTo(fp[i]!.x, -fp[i]!.y)
  shape.closePath()

  const roofGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.40, bevelEnabled: false })
  roofGeo.rotateX(-Math.PI / 2)
  roofGeo.translate(0, height, 0)
  const roofMesh = new THREE.Mesh(roofGeo, roofMat)
  roofMesh.castShadow = true
  roofMesh.receiveShadow = true
  group.add(roofMesh)

  // Slender steel support pillars at corners
  const pillarGeo = new THREE.CylinderGeometry(0.15, 0.15, height, 8)
  pillarGeo.translate(0, height / 2, 0)
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0x484a4e, metalness: 0.6, roughness: 0.4 })

  for (let i = 0; i < fp.length; i++) {
    const p = fp[i]!
    const pillar = new THREE.Mesh(pillarGeo, pillarMat)
    pillar.position.set(p.x, 0, p.y)
    group.add(pillar)
  }

  return group
}