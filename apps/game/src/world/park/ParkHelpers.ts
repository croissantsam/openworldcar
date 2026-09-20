/**
 * Park Helpers — Geometry utilities, road obstacle avoidance, and real tree suppression.
 */

import type { Road, PointOfInterest } from '@world-drive/shared'

// ── Helper: Point in polygon test (2D Ray-casting) ─────────────────────────

export function isPointInPolygon(px: number, pz: number, polygon: { x: number; z: number }[]): boolean {
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

export interface RoadObstacleSeg {
  x1: number; z1: number; x2: number; z2: number
  dx: number; dz: number; lenSq: number; halfW: number
  minX: number; maxX: number; minZ: number; maxZ: number
}

export function buildRoadObstacles(roads?: Road[]): RoadObstacleSeg[] {
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

export function isPointInRoadObstacles(px: number, pz: number, obs: RoadObstacleSeg[], margin = 0.8): boolean {
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

// ── Real (OSM natural=tree) POI suppression ────────────────────────────────
// Random park trees are dropped within 4 m of a real surveyed tree so the
// StreetFurnitureGenerator's instanced tree is the only one at that spot.

const REAL_TREE_CLEARANCE = 4

export function collectRealTrees(
  pois: PointOfInterest[] | undefined,
  minX: number, maxX: number, minZ: number, maxZ: number,
): Float64Array {
  if (!pois || pois.length === 0) return new Float64Array(0)
  const out: number[] = []
  for (const p of pois) {
    if (p.kind !== 'tree') continue
    const x = p.position.x, z = p.position.z
    if (x < minX - REAL_TREE_CLEARANCE || x > maxX + REAL_TREE_CLEARANCE) continue
    if (z < minZ - REAL_TREE_CLEARANCE || z > maxZ + REAL_TREE_CLEARANCE) continue
    out.push(x, z)
  }
  return Float64Array.from(out)
}

export function nearRealTree(x: number, z: number, trees: Float64Array): boolean {
  const r2 = REAL_TREE_CLEARANCE * REAL_TREE_CLEARANCE
  for (let i = 0; i < trees.length; i += 2) {
    const dx = trees[i]! - x
    const dz = trees[i + 1]! - z
    if (dx * dx + dz * dz < r2) return true
  }
  return false
}