/**
 * Chunk bounds utilities for clipping geometry to chunk boundaries.
 */

import type { WorldPosition } from '@world-drive/math'
import { chunkToWorld, CHUNK_SIZE, type ChunkId } from '@world-drive/math'

/** Axis-aligned bounding box in world space (XZ plane). */
export interface ChunkBounds {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

/** Get the world-space bounds of a chunk. */
export function getChunkBounds(chunkId: ChunkId): ChunkBounds {
  const origin = chunkToWorld(chunkId)
  return {
    minX: origin.x,
    maxX: origin.x + CHUNK_SIZE,
    minZ: origin.z,
    maxZ: origin.z + CHUNK_SIZE,
  }
}

/** Check if a point is inside chunk bounds (with optional margin). */
export function pointInBounds(
  point: WorldPosition,
  bounds: ChunkBounds,
  margin = 0,
): boolean {
  return (
    point.x >= bounds.minX - margin &&
    point.x <= bounds.maxX + margin &&
    point.z >= bounds.minZ - margin &&
    point.z <= bounds.maxZ + margin
  )
}

/**
 * Clip a line segment to the chunk bounds using Cohen-Sutherland algorithm.
 * Returns the clipped segment endpoints, or null if the segment is entirely outside.
 */
export function clipSegmentToBounds(
  p1: WorldPosition,
  p2: WorldPosition,
  bounds: ChunkBounds,
): { p1: WorldPosition; p2: WorldPosition } | null {
  const INSIDE = 0 // 0000
  const LEFT = 1   // 0001
  const RIGHT = 2  // 0010
  const BOTTOM = 4 // 0100
  const TOP = 8    // 1000

  function computeCode(p: WorldPosition): number {
    let code = INSIDE
    if (p.x < bounds.minX) code |= LEFT
    else if (p.x > bounds.maxX) code |= RIGHT
    if (p.z < bounds.minZ) code |= BOTTOM
    else if (p.z > bounds.maxZ) code |= TOP
    return code
  }

  let code1 = computeCode(p1)
  let code2 = computeCode(p2)
  let accept = false

  while (true) {
    if ((code1 | code2) === 0) {
      // Both endpoints inside
      accept = true
      break
    } else if ((code1 & code2) !== 0) {
      // Both endpoints share an outside region - trivially reject
      break
    } else {
      // Line needs clipping
      const codeOut = code1 !== 0 ? code1 : code2
      let x = 0
      let z = 0

      // Find intersection point
      const dx = p2.x - p1.x
      const dz = p2.z - p1.z

      if ((codeOut & TOP) !== 0) {
        // Intersect with maxZ
        if (Math.abs(dz) > 1e-10) {
          const t = (bounds.maxZ - p1.z) / dz
          x = p1.x + t * dx
          z = bounds.maxZ
        }
      } else if ((codeOut & BOTTOM) !== 0) {
        // Intersect with minZ
        if (Math.abs(dz) > 1e-10) {
          const t = (bounds.minZ - p1.z) / dz
          x = p1.x + t * dx
          z = bounds.minZ
        }
      } else if ((codeOut & RIGHT) !== 0) {
        // Intersect with maxX
        if (Math.abs(dx) > 1e-10) {
          const t = (bounds.maxX - p1.x) / dx
          x = bounds.maxX
          z = p1.z + t * dz
        }
      } else if ((codeOut & LEFT) !== 0) {
        // Intersect with minX
        if (Math.abs(dx) > 1e-10) {
          const t = (bounds.minX - p1.x) / dx
          x = bounds.minX
          z = p1.z + t * dz
        }
      }

      // Replace outside point with intersection
      if (codeOut === code1) {
        p1 = { x, y: p1.y, z }
        code1 = computeCode(p1)
      } else {
        p2 = { x, y: p2.y, z }
        code2 = computeCode(p2)
      }
    }
  }

  if (accept) {
    return { p1, p2 }
  }
  return null
}

/**
 * Clip a polyline (array of points) to chunk bounds.
 * Returns a new array of points that lie within the bounds, with intersections
 * added at boundary crossings.
 */
export function clipPolylineToBounds(
  points: WorldPosition[],
  bounds: ChunkBounds,
): WorldPosition[] {
  if (points.length < 2) return points

  const result: WorldPosition[] = []
  let currentSegment: WorldPosition[] = []

  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i]!
    const p2 = points[i + 1]!

    const clipped = clipSegmentToBounds({ ...p1 }, { ...p2 }, bounds)

    if (clipped) {
      // If we're starting a new segment, add the first point
      if (currentSegment.length === 0) {
        currentSegment.push(clipped.p1)
      }
      // Add the second point
      currentSegment.push(clipped.p2)
    } else {
      // Segment is outside - if we have a current segment, save it
      if (currentSegment.length > 0) {
        result.push(...currentSegment)
        currentSegment = []
      }
    }
  }

  // Don't forget the last segment
  if (currentSegment.length > 0) {
    result.push(...currentSegment)
  }

  // Remove duplicate consecutive points (can happen at boundaries)
  const cleaned: WorldPosition[] = []
  for (const p of result) {
    const last = cleaned[cleaned.length - 1]
    if (!last || Math.hypot(p.x - last.x, p.z - last.z) > 0.01) {
      cleaned.push(p)
    }
  }

  return cleaned.length >= 2 ? cleaned : []
}

/**
 * Create a clipped version of a road for a specific chunk.
 * Returns null if the road doesn't intersect the chunk.
 */
export function clipRoadToChunk(
  road: { points: WorldPosition[] },
  chunkId: ChunkId,
): { points: WorldPosition[] } | null {
  const bounds = getChunkBounds(chunkId)
  const clippedPoints = clipPolylineToBounds(road.points, bounds)
  if (clippedPoints.length < 2) return null
  return { points: clippedPoints }
}