/**
 * LiveOsmFetcher — fetches REAL OpenStreetMap roads, buildings and geometries
 * directly from OpenStreetMap on the fly.
 */

import type { WorldChunk, Road, Building } from '@world-drive/shared'
import {
  type GeoPosition,
  type WorldPosition,
  setWorldOrigin,
  geoToWorld,
} from '@world-drive/math'
import { normalizeRoad, normalizeBuilding } from '@world-drive/world-data'
import { generateChunks, type ChunkMap } from '@world-drive/world-data'

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
): Promise<RealOsmAreaResult | null> {
  // 1. Calculate bounding box in lat/lon
  const dLat = (radius / 6378137) * (180 / Math.PI)
  const dLon =
    (radius / (6378137 * Math.cos((origin.latitude * Math.PI) / 180))) *
    (180 / Math.PI)

  const south = origin.latitude - dLat
  const north = origin.latitude + dLat
  const west = origin.longitude - dLon
  const east = origin.longitude + dLon

  const bboxStr = `${west.toFixed(5)},${south.toFixed(5)},${east.toFixed(5)},${north.toFixed(5)}`

  // 2. Fetch raw XML from local proxy or official OSM API
  let xmlText = ''
  try {
    const proxyUrl = `/api/osm-map?bbox=${bboxStr}`
    const res = await fetch(proxyUrl, {
      headers: { Accept: 'application/xml' },
      ...(signal ? { signal } : {}),
    })
    if (res.ok) {
      xmlText = await res.text()
    } else {
      throw new Error(`Proxy error: ${res.status}`)
    }
  } catch {
    try {
      const directUrl = `https://api.openstreetmap.org/api/0.6/map?bbox=${bboxStr}`
      const res = await fetch(directUrl, {
        headers: {
          'User-Agent': 'OpenWorldCar-Game/1.0 (https://github.com/openworldcar)',
          Accept: 'application/xml',
        },
        ...(signal ? { signal } : {}),
      })
      if (res.ok) {
        xmlText = await res.text()
      }
    } catch (directErr) {
      console.warn('[LiveOsmFetcher] OSM API fetch failed:', directErr)
      return null
    }
  }

  if (!xmlText || xmlText.length < 50) return null

  // Ensure coordinate projection origin is set
  setWorldOrigin(origin)

  // 3. Fast XML parser for nodes
  const nodes = new Map<string, [number, number]>()
  const nodeMatches = xmlText.matchAll(
    /<node id="(\d+)"[^>]*lat="([\d.-]+)"[^>]*lon="([\d.-]+)"/g,
  )
  for (const m of nodeMatches) {
    // Stored as [lon, lat] for GeoJSON/projection compatibility
    nodes.set(m[1]!, [parseFloat(m[3]!), parseFloat(m[2]!)])
  }

  // 4. Parse ways into roads and buildings
  const roads: Road[] = []
  const buildings: Building[] = []

  const wayMatches = xmlText.matchAll(/<way id="(\d+)"[^>]*>([\s\S]*?)<\/way>/g)

  for (const wm of wayMatches) {
    const wayId = wm[1]!
    const body = wm[2]!
    const coords: [number, number][] = []

    for (const nd of body.matchAll(/<nd ref="(\d+)"/g)) {
      const pt = nodes.get(nd[1]!)
      if (pt) coords.push(pt)
    }

    if (coords.length < 2) continue

    const tags: Record<string, string> = {}
    for (const tg of body.matchAll(/<tag k="([^"]+)" v="([^"]+)"/g)) {
      tags[tg[1]!] = tg[2]!
    }

    const raw = { id: wayId, tags, coords }

    const road = normalizeRoad(raw)
    if (road) {
      roads.push(road)
      continue
    }

    const building = normalizeBuilding(raw)
    if (building) {
      buildings.push(building)
      continue
    }
  }

  if (roads.length === 0) {
    return null
  }

  // 5. Partition into chunk grid
  const chunks = generateChunks(roads, buildings, [])

  // 6. Find the best on-road spawn point closest to world (0, 0)
  let bestDistSq = Infinity
  let spawnPoint: WorldPosition = { x: 0, y: 0.5, z: 0 }
  let spawnHeading = 0
  let primaryStreetName: string | undefined

  for (const road of roads) {
    for (let i = 0; i < road.points.length - 1; i++) {
      const p1 = road.points[i]!
      const p2 = road.points[i + 1]!

      // Midpoint of segment
      const mx = (p1.x + p2.x) / 2
      const mz = (p1.z + p2.z) / 2
      const distSq = mx * mx + mz * mz

      if (distSq < bestDistSq) {
        bestDistSq = distSq
        spawnPoint = { x: mx, y: 1.0, z: mz }
        spawnHeading = Math.atan2(p2.x - p1.x, p2.z - p1.z)
        if (road.name) primaryStreetName = road.name
      }
    }
  }

  return {
    chunks,
    spawnPoint,
    spawnHeading,
    ...(primaryStreetName ? { streetName: primaryStreetName } : {}),
    totalRoads: roads.length,
    totalBuildings: buildings.length,
  }
}
