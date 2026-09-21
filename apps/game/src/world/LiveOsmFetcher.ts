/**
 * LiveOsmFetcher — fetches REAL OpenStreetMap roads, buildings and geometries
 * directly from OpenStreetMap on the fly.
 */

import {
  type GeoPosition,
  type WorldPosition,
  setWorldOrigin,
} from '@world-drive/math'
import { generateChunks, type ChunkMap } from '@world-drive/world-data'
import {
  bboxForCenter,
  fetchOsmXml,
  findSpawnPoint,
  parseOsmXml,
  poisFromNodes,
} from './osm-parse.js'

/**
 * Fetch OpenStreetMap data for a circular area and return a ChunkMap
 * ready to inject into ChunkManager. Used by OsmStreamingManager for
 * continuous open-world streaming.
 */
export async function fetchOsmChunksForArea(
  center: GeoPosition,
  radius = 600,
  signal?: AbortSignal,
): Promise<ChunkMap | null> {
  const bbox = bboxForCenter(center, radius)

  const xmlText = await fetchOsmXml(bbox, signal)
  if (!xmlText || xmlText.length < 50) return null

  const { roads, buildings, waterways, parks, taggedNodes } = parseOsmXml(xmlText)
  const pois = poisFromNodes(taggedNodes)
  console.info(`[LiveOsmFetcher] ${taggedNodes.length} tagged nodes parsed → ${pois.length} POIs (${roads.length} roads, ${buildings.length} buildings)`)
  // Genuinely empty area (no roads): an empty map. A failed download stays null.
  if (roads.length === 0) return new Map()

  return generateChunks(roads, buildings, pois, waterways, parks)
}

export interface RealOsmAreaResult {
  chunks: ChunkMap
  spawnPoint: WorldPosition
  spawnHeading: number
  streetName?: string
  totalRoads: number
  totalBuildings: number
}

export async function fetchRealOsmArea(
  origin: GeoPosition,
  radius = 500,
  signal?: AbortSignal,
  preferredSpawn?: WorldPosition,
  preferredHeading?: number,
): Promise<RealOsmAreaResult | null> {
  // 1. Calculate bounding box in lat/lon
  const bbox = bboxForCenter(origin, radius)

  // 2. Fetch raw XML from local proxy or official OSM API
  const xmlText = await fetchOsmXml(bbox, signal)
  if (!xmlText || xmlText.length < 50) return null

  // Ensure coordinate projection origin is set
  setWorldOrigin(origin)

  // 3. Parse ways into roads, buildings, waterways, parks
  const { roads, buildings, waterways, parks, taggedNodes } = parseOsmXml(xmlText)
  const pois = poisFromNodes(taggedNodes)
  console.info(`[LiveOsmFetcher] ${taggedNodes.length} tagged nodes parsed → ${pois.length} POIs (${roads.length} roads, ${buildings.length} buildings)`)

  if (roads.length === 0) {
    return null
  }

  // 4. Partition into chunk grid
  const chunks = generateChunks(roads, buildings, pois, waterways, parks)

  // 5. Find the best on-road spawn point closest to preferredSpawn or world (0, 0)
  const spawn = findSpawnPoint(roads, preferredSpawn, preferredHeading)

  return {
    chunks,
    spawnPoint: spawn.spawnPoint,
    spawnHeading: spawn.spawnHeading,
    ...(spawn.streetName ? { streetName: spawn.streetName } : {}),
    totalRoads: roads.length,
    totalBuildings: buildings.length,
  }
}

