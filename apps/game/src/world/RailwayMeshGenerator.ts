/**
 * RailwayMeshGenerator — renders OSM railway=* geometry.
 *
 * Supports:
 *   - rail: two steel rails on concrete slab with wooden sleeper ties
 *   - tram: thin flush rail tracks embedded in asphalt/road surface
 *   - light_rail: same as rail but slightly narrower
 *   - subway: same as rail (rendered at ground level)
 *   - monorail/narrow_gauge: single thin rail beam
 */

import * as THREE from 'three'
import type { Railway } from '@world-drive/shared'

// ── Materials ──────────────────────────────────────────────────────────────

const RAIL_STEEL_MAT = new THREE.MeshStandardMaterial({
  color: 0x8c9099,
  roughness: 0.55,
  metalness: 0.75,
})

const SLEEPER_MAT = new THREE.MeshStandardMaterial({
  color: 0x3d2a1a, // dark weathered wood
  roughness: 0.95,
  metalness: 0.0,
})

const BALLAST_MAT = new THREE.MeshStandardMaterial({
  color: 0x7a7470, // crushed stone ballast
  roughness: 0.97,
  metalness: 0.0,
  polygonOffset: true,
  polygonOffsetFactor: 4.0,
  polygonOffsetUnits: 4.0,
})

const TRAM_RAIL_MAT = new THREE.MeshStandardMaterial({
  color: 0x909698,
  roughness: 0.60,
  metalness: 0.70,
  polygonOffset: true,
  polygonOffsetFactor: -2.0,
  polygonOffsetUnits: -2.0,
})

// ── Geometry helpers ────────────────────────────────────────────────────────

/** Build a ribbon mesh along a polyline. */
function buildRibbon(
  points: { x: number; y: number; z: number }[],
  halfW: number,
  yOffset: number,
  material: THREE.Material,
): THREE.Mesh | null {
  if (points.length < 2) return null
  const vertices: number[] = []
  const indices: number[] = []

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

    if (i < points.length - 1) {
      const b = i * 2
      indices.push(b, b + 1, b + 2, b + 1, b + 3, b + 2)
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  const mesh = new THREE.Mesh(geo, material)
  mesh.receiveShadow = true
  return mesh
}

function shiftLateral(
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
      arr[vi]! += nx * offset
      arr[vi + 2]! += nz * offset
    }
  }
  pos.needsUpdate = true
  mesh.geometry.computeVertexNormals()
}

/** Scatter sleeper ties perpendicular to the rail, every `spacing` metres. */
function buildSleepers(
  pts: { x: number; y: number; z: number }[],
  sleeperW: number,
  sleeperH: number,
  sleeperD: number,
  spacing: number,
  yBase: number,
): THREE.Mesh {
  const vertices: number[] = []
  const indices: number[] = []
  let quadIdx = 0

  let arcLen = 0
  let nextSleeper = 0

  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!
    const b = pts[i + 1]!
    const dx = b.x - a.x; const dz = b.z - a.z
    const segLen = Math.hypot(dx, dz)
    if (segLen < 0.01) continue
    const ux = dx / segLen; const uz = dz / segLen
    const nx = -uz; const nz = ux

    while (arcLen + (nextSleeper - arcLen) <= arcLen + segLen) {
      const t = (nextSleeper - arcLen) / segLen
      if (t > 1) break
      const cx = a.x + ux * (nextSleeper - arcLen)
      const cz = a.z + uz * (nextSleeper - arcLen)
      const cy = a.y + (b.y - a.y) * t + yBase

      // Sleeper quad (flat box along perpendicular)
      const hL = sleeperW / 2
      const hD = sleeperD / 2
      const base = quadIdx * 4
      vertices.push(
        cx + nx * hL - ux * hD, cy,          cz + nz * hL - uz * hD,
        cx - nx * hL - ux * hD, cy,          cz - nz * hL - uz * hD,
        cx + nx * hL + ux * hD, cy,          cz + nz * hL + uz * hD,
        cx - nx * hL + ux * hD, cy,          cz - nz * hL + uz * hD,
        cx + nx * hL - ux * hD, cy + sleeperH, cz + nz * hL - uz * hD,
        cx - nx * hL - ux * hD, cy + sleeperH, cz - nz * hL - uz * hD,
        cx + nx * hL + ux * hD, cy + sleeperH, cz + nz * hL + uz * hD,
        cx - nx * hL + ux * hD, cy + sleeperH, cz - nz * hL + uz * hD,
      )
      // Top face
      indices.push(base + 4, base + 5, base + 6, base + 5, base + 7, base + 6)
      // Side faces
      indices.push(base, base + 4, base + 2, base + 4, base + 6, base + 2)
      indices.push(base + 1, base + 3, base + 5, base + 5, base + 3, base + 7)
      indices.push(base, base + 1, base + 4, base + 1, base + 5, base + 4)
      indices.push(base + 2, base + 6, base + 3, base + 6, base + 7, base + 3)

      quadIdx += 2 // 8 verts per sleeper
      nextSleeper += spacing
    }

    arcLen += segLen
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  const mesh = new THREE.Mesh(geo, SLEEPER_MAT)
  mesh.receiveShadow = true
  return mesh
}

// ── Main class ─────────────────────────────────────────────────────────────

export class RailwayMeshGenerator {
  /**
   * Generate a 3D railway segment group from an OSM Railway object.
   */
  static generate(railway: Railway): THREE.Group | null {
    const pts = railway.points
    if (pts.length < 2) return null

    const group = new THREE.Group()
    group.userData['railwayId'] = railway.id

    const type = railway.type
    if (type === 'subway') return null // Subways are underground in cities

    if (type === 'tram') {
      // Tram: thin flush rails embedded in road surface (y = 0.035)
      const GAUGE = 1.435 // standard gauge in metres
      const railHalfW = 0.04
      const leftRail = buildRibbon(pts, railHalfW, 0.035, TRAM_RAIL_MAT)
      const rightRail = buildRibbon(pts, railHalfW, 0.035, TRAM_RAIL_MAT)
      if (leftRail)  { shiftLateral(leftRail,  pts,  GAUGE / 2); group.add(leftRail) }
      if (rightRail) { shiftLateral(rightRail, pts, -GAUGE / 2); group.add(rightRail) }
      return group
    }

    // Standard rail / light_rail / subway / monorail / narrow_gauge
    const GAUGE = type === 'narrow_gauge' ? 1.0 : 1.435
    const BALLAST_W = GAUGE + 1.2
    const RAIL_H_OFFSET = 0.10 // rail sits 10cm above ballast surface
    const railHalfW = 0.055

    // 1. Ballast bed (flat ribbon at y = 0.01)
    const ballast = buildRibbon(pts, BALLAST_W / 2, 0.01, BALLAST_MAT)
    if (ballast) { ballast.renderOrder = 2; group.add(ballast) }

    // 2. Sleeper ties
    const sleepers = buildSleepers(pts, GAUGE + 0.3, 0.10, 0.16, 0.6, 0.01)
    sleepers.renderOrder = 2
    group.add(sleepers)

    // 3. Left & right steel rails
    const leftRail = buildRibbon(pts, railHalfW, RAIL_H_OFFSET, RAIL_STEEL_MAT)
    const rightRail = buildRibbon(pts, railHalfW, RAIL_H_OFFSET, RAIL_STEEL_MAT)
    if (leftRail) {
      shiftLateral(leftRail, pts, GAUGE / 2)
      leftRail.castShadow = true
      leftRail.renderOrder = 3
      group.add(leftRail)
    }
    if (rightRail) {
      shiftLateral(rightRail, pts, -GAUGE / 2)
      rightRail.castShadow = true
      rightRail.renderOrder = 3
      group.add(rightRail)
    }

    return group
  }
}
