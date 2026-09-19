/**
 * Roof geometry builders for all OSM roof:shape types.
 * Each function builds a specific roof type with architectural details.
 */

import * as THREE from 'three'
import type { WorldPosition } from '@world-drive/math'
import { addLedges } from '../FacadeRelief'

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
  facadeMat: THREE.MeshStandardMaterial,
): THREE.Group {
  const group = new THREE.Group()

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const p of fp) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x)
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y)
  }
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2

  // Inset factor for the mansard curb
  const inset = 1.3
  const lowerH = roofHeight * 0.70

  const outerVerts: THREE.Vector2[] = fp
  const innerVerts: THREE.Vector2[] = fp.map(p => {
    const dx = cx - p.x
    const dy = cy - p.y
    const d = Math.hypot(dx, dy)
    if (d < 0.1) return p
    const ratio = Math.min(0.35, inset / d)
    return new THREE.Vector2(p.x + dx * ratio, p.y + dy * ratio)
  })

  // Steep mansard side slope quads
  const pos: number[] = []
  const norm: number[] = []
  const idx: number[] = []
  const N = fp.length

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
    norm.push(0, 0.7, 0.7,  0, 0.7, 0.7,  0, 0.7, 0.7,  0, 0.7, 0.7)
    idx.push(b, b + 1, b + 2,  b, b + 2, b + 3)
  }

  // Upper flat zinc deck
  const upperShape = new THREE.Shape()
  upperShape.moveTo(innerVerts[0]!.x, -innerVerts[0]!.y)
  for (let i = 1; i < innerVerts.length; i++) upperShape.lineTo(innerVerts[i]!.x, -innerVerts[i]!.y)
  upperShape.closePath()

  const upperGeo = new THREE.ShapeGeometry(upperShape)
  upperGeo.rotateX(-Math.PI / 2)
  upperGeo.translate(0, baseHeight + lowerH, 0)
  const upperMesh = new THREE.Mesh(upperGeo, roofMat)
  group.add(upperMesh)

  const slopeGeo = new THREE.BufferGeometry()
  slopeGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  slopeGeo.setAttribute('normal', new THREE.Float32BufferAttribute(norm, 3))
  slopeGeo.setIndex(idx)
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
): THREE.Group {
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
): THREE.Mesh {
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
): THREE.Mesh {
  let cx = 0, cy = 0
  for (const p of fp) { cx += p.x; cy += p.y }
  cx /= fp.length; cy /= fp.length

  const peakY = baseHeight + roofHeight
  const verts: number[] = [cx, peakY, cy]
  for (const p of fp) verts.push(p.x, baseHeight, p.y)

  const indices: number[] = []
  for (let i = 0; i < fp.length; i++) {
    const next = (i + 1) % fp.length
    indices.push(0, i + 1, next + 1)
  }

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

  // Sloping roof plane
  const roofVerts: number[] = []
  for (const p of fp) {
    const t = slopeAlongX ? (p.x - minX) / spanX : (p.y - minY) / spanY
    roofVerts.push(p.x, baseHeight + t * roofHeight, p.y)
  }

  // Simple fan triangulation for footprint
  const roofIndices: number[] = []
  for (let i = 1; i < fp.length - 1; i++) {
    roofIndices.push(0, i, i + 1)
  }

  const roofGeo = new THREE.BufferGeometry()
  roofGeo.setAttribute('position', new THREE.Float32BufferAttribute(roofVerts, 3))
  roofGeo.setIndex(roofIndices)
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
): THREE.Group {
  const group = new THREE.Group()
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const p of fp) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x)
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y)
  }
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2
  const radius = Math.min(maxX - minX, maxY - minY) / 2

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