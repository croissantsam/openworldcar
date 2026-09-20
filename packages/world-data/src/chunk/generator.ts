/**
 * Chunk generator — splits world features into ChunkId-keyed buckets.
 */

import {
  worldToChunk,
  chunkKey,
  CHUNK_SIZE,
  type ChunkId,
} from '@world-drive/math'
import type { Road, Building, PointOfInterest, WorldChunk, Waterway, Park, Railway, Barrier } from '@world-drive/shared'
import { filterBuildingsOverlappingRoads } from './building-filter.js'

function chunksForLine(points: { x: number; y: number; z: number }[], level: number): ChunkId[] {
  const seen = new Set<string>()
  const result: ChunkId[] = []
  for (const pt of points) {
    const id = worldToChunk(pt, level)
    const k = chunkKey(id)
    if (!seen.has(k)) { seen.add(k); result.push(id) }
  }
  return result
}

export type ChunkMap = Map<string, WorldChunk>

/**
 * Build a map of ChunkId → WorldChunk from flat feature lists.
 */
export function generateChunks(
  roads: Road[],
  buildings: Building[],
  pois: PointOfInterest[],
  waterways: Waterway[] = [],
  parks: Park[] = [],
  railways: Railway[] = [],
  barriers: Barrier[] = [],
  level = 0,
): ChunkMap {
  const chunks: ChunkMap = new Map()

  function getOrCreate(id: ChunkId): WorldChunk {
    const k = chunkKey(id)
    if (!chunks.has(k)) {
      chunks.set(k, { id, roads: [], buildings: [], pointsOfInterest: [], waterways: [], parks: [], railways: [], barriers: [] })
    }
    return chunks.get(k)!
  }

  for (const road of roads) {
    for (const chunkId of chunksForLine(road.points, level)) {
      getOrCreate(chunkId).roads.push(road)
    }
  }

  const filteredBuildings = filterBuildingsOverlappingRoads(buildings, roads)

  for (const building of filteredBuildings) {
    if (building.footprint.length > 0) {
      const chunkId = worldToChunk(building.footprint[0]!, level)
      getOrCreate(chunkId).buildings.push(building)
    }
  }

  for (const poi of pois) {
    const chunkId = worldToChunk(poi.position, level)
    getOrCreate(chunkId).pointsOfInterest.push(poi)
  }

  for (const waterway of waterways) {
    for (const chunkId of chunksForLine(waterway.points, level)) {
      getOrCreate(chunkId).waterways.push(waterway)
    }
  }

  for (const park of parks) {
    for (const chunkId of chunksForLine(park.polygon, level)) {
      getOrCreate(chunkId).parks.push(park)
    }
  }

  for (const railway of railways) {
    for (const chunkId of chunksForLine(railway.points, level)) {
      getOrCreate(chunkId).railways.push(railway)
    }
  }

  for (const barrier of barriers) {
    for (const chunkId of chunksForLine(barrier.points, level)) {
      getOrCreate(chunkId).barriers!.push(barrier)
    }
  }

  return chunks
}

export { CHUNK_SIZE }
