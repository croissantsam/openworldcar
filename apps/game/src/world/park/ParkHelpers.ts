/**
 * Park Helpers — Geometry utilities, road obstacle avoidance, and real tree suppression.
 */

import {
  CHUNK_SIZE,
  chunkCenter,
  type ChunkId,
} from '@world-drive/math'
import type { ParkType, Road, PointOfInterest } from '@world-drive/shared'

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

// ── Deterministic procedural tree placement ────────────────────────────────
// ONE function feeds both the visual meshes (ParkMeshGenerator.generate) and
// the Rapier trunk colliders (ParkMeshGenerator.createColliderDescs). Two
// separate RNG streams used to diverge after the first placed tree, so cars
// drove through visible trunks and hit invisible ones. Never split this.

export interface TreePlacement {
  x: number
  z: number
  /** Index into the archetype list (platane, linden, ornamental). */
  archetype: 0 | 1 | 2
  scale: number
  rotY: number
  /** Slight natural lean (radians around Z). */
  lean: number
}

/** Park types that get procedural trees. */
const TREE_PARK_TYPES: ParkType[] = ['park', 'garden', 'grass', 'forest', 'recreation', 'scrub', 'cemetery']

/** Minimum distance between two procedural trees (no more intersecting canopies). */
const MIN_TREE_SPACING = 3.0
const MIN_TREE_SPACING_SQ = MIN_TREE_SPACING * MIN_TREE_SPACING

function seedFromId(id: string): number {
  let seed = 0
  for (let i = 0; i < id.length; i++) seed = (seed * 31 + id.charCodeAt(i)) >>> 0
  return seed
}

export function computeTreePlacements(
  parkId: string,
  polygon: Array<{ x: number; z: number }>,
  parkType: ParkType,
  roads?: Road[],
  pois?: PointOfInterest[] | undefined,
): TreePlacement[] {
  if (!TREE_PARK_TYPES.includes(parkType)) return []

  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
  for (const p of polygon) {
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.z < minZ) minZ = p.z
    if (p.z > maxZ) maxZ = p.z
  }
  const width = maxX - minX
  const depth = maxZ - minZ
  if (!Number.isFinite(width) || !Number.isFinite(depth) || width * depth < 50) return []

  // Density tuned for visual lushness & 60 FPS performance
  const numCandidates = Math.min(30, Math.floor((width * depth) / 160) + 3)
  const roadObs = buildRoadObstacles(roads)
  const realTrees = collectRealTrees(pois, minX, maxX, minZ, maxZ)

  let seed = seedFromId(parkId)
  const pseudoRandom = (): number => {
    seed = (seed * 9301 + 49297) % 233280
    return seed / 233280
  }

  const placements: TreePlacement[] = []
  for (let attempt = 0; attempt < numCandidates * 3 && placements.length < numCandidates; attempt++) {
    const x = minX + pseudoRandom() * width
    const z = minZ + pseudoRandom() * depth

    if (!isPointInPolygon(x, z, polygon)) continue
    if (isPointInRoadObstacles(x, z, roadObs, 1.6)) continue
    if (nearRealTree(x, z, realTrees)) continue
    let tooClose = false
    for (const t of placements) {
      const dx = t.x - x
      const dz = t.z - z
      if (dx * dx + dz * dz < MIN_TREE_SPACING_SQ) {
        tooClose = true
        break
      }
    }
    if (tooClose) continue

    placements.push({
      x,
      z,
      archetype: Math.floor(pseudoRandom() * 3) as 0 | 1 | 2,
      scale: 0.85 + pseudoRandom() * 0.4,
      rotY: pseudoRandom() * Math.PI * 2,
      lean: (pseudoRandom() - 0.5) * 0.08,
    })
  }
  return placements
}

// ── Single-owner chunk partitioning ─────────────────────────────────────────
// generateChunks() puts the SAME whole park into every chunk its polygon
// touches. Without partitioning, each of those chunks would build (and
// collide) the full lawn, every tree and every overlay — stacked duplicate
// trunk colliders throw the physics solver off (cars ejected or stuck).
// Rule: a chunk only builds the part inside its own bounds; trees (and their
// colliders) are owned by position with half-open intervals so exactly one
// chunk owns each tree; lawns are clipped; overlays belong to the centroid's
// chunk. Filtering happens AFTER all RNG draws so the stream is identical
// for every chunk (visuals and colliders can never diverge).

export interface Rect {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

/** World-space bounds of a chunk cell. */
export function chunkBounds(id: ChunkId): Rect {
  const c = chunkCenter(id)
  const size = CHUNK_SIZE * Math.pow(2, id.level)
  return { minX: c.x - size / 2, maxX: c.x + size / 2, minZ: c.z - size / 2, maxZ: c.z + size / 2 }
}

/** Half-open containment: exactly one of two adjacent chunks owns a point. */
export function isPointInRect(x: number, z: number, rect: Rect): boolean {
  return x >= rect.minX && x < rect.maxX && z >= rect.minZ && z < rect.maxZ
}

function clipAgainst(
  poly: Array<{ x: number; z: number }>,
  axis: 'x' | 'z',
  bound: number,
  keepGreater: boolean,
): Array<{ x: number; z: number }> {
  const out: Array<{ x: number; z: number }> = []
  if (poly.length === 0) return out
  let prev = poly[poly.length - 1]!
  let prevInside = keepGreater ? prev[axis] >= bound : prev[axis] <= bound
  for (const cur of poly) {
    const curInside = keepGreater ? cur[axis] >= bound : cur[axis] <= bound
    if (curInside) {
      if (!prevInside) {
        const t = (bound - prev[axis]) / (cur[axis] - prev[axis])
        out.push({
          x: prev.x + (cur.x - prev.x) * t,
          z: prev.z + (cur.z - prev.z) * t,
        })
      }
      out.push(cur)
    } else if (prevInside) {
      const t = (bound - prev[axis]) / (cur[axis] - prev[axis])
      out.push({
        x: prev.x + (cur.x - prev.x) * t,
        z: prev.z + (cur.z - prev.z) * t,
      })
    }
    prev = cur
    prevInside = curInside
  }
  return out
}

/** Sutherland–Hodgman clip of a polygon against an axis-aligned rect. */
export function clipPolygonToRect(
  polygon: Array<{ x: number; z: number }>,
  rect: Rect,
): Array<{ x: number; z: number }> {
  let out = polygon
  out = clipAgainst(out, 'x', rect.minX, true)
  out = clipAgainst(out, 'x', rect.maxX, false)
  out = clipAgainst(out, 'z', rect.minZ, true)
  out = clipAgainst(out, 'z', rect.maxZ, false)
  return out
}

/** Signed area (shoelace); near-zero slivers are skipped, not triangulated. */
export function polygonArea(polygon: Array<{ x: number; z: number }>): number {
  let sum = 0
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!
    const b = polygon[(i + 1) % polygon.length]!
    sum += a.x * b.z - b.x * a.z
  }
  return Math.abs(sum) / 2
}

/** Centroid (average of vertices) — deterministic overlay owner rule. */
export function polygonCentroid(polygon: Array<{ x: number; z: number }>): { x: number; z: number } {
  let x = 0
  let z = 0
  for (const p of polygon) {
    x += p.x
    z += p.z
  }
  return { x: x / Math.max(1, polygon.length), z: z / Math.max(1, polygon.length) }
}