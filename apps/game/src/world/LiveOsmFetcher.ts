/**
 * LiveOsmFetcher — fetches REAL OpenStreetMap roads, buildings and geometries
 * directly from OpenStreetMap on the fly.
 */

import type { WorldChunk, Road, Building, Waterway, Park, Railway, Barrier, PointOfInterest, PoiKind, PoiCategory, RoadCrossing } from '@world-drive/shared'
import {
  type GeoPosition,
  type WorldPosition,
  setWorldOrigin,
  geoToWorld,
} from '@world-drive/math'
import { normalizeRoad, normalizeBuilding, normalizeWaterway, normalizePark, deduplicateBuildings } from '@world-drive/world-data'
import { generateChunks, type ChunkMap, type RawOsmNode } from '@world-drive/world-data'

/**
 * Decode the XML character entities the OSM API emits in attribute values
 * ("Saint-Lazare &amp; Opéra" → "Saint-Lazare & Opéra").
 */
function decodeXmlEntities(value: string): string {
  if (value.indexOf('&') === -1) return value
  return value.replace(/&(amp|quot|apos|lt|gt|#(\d+)|#x([0-9a-fA-F]+));/g, (m, name: string, dec?: string, hex?: string) => {
    switch (name) {
      case 'amp': return '&'
      case 'quot': return '"'
      case 'apos': return "'"
      case 'lt': return '<'
      case 'gt': return '>'
    }
    const code = dec !== undefined ? parseInt(dec, 10) : hex !== undefined ? parseInt(hex, 16) : NaN
    return Number.isFinite(code) ? String.fromCodePoint(code) : m
  })
}

/** Parse the <tag k v/> children of an element body into a decoded tag map. */
function parseTags(body: string): Record<string, string> {
  const tags: Record<string, string> = {}
  for (const tg of body.matchAll(/<tag k="([^"]+)" v="([^"]+)"/g)) {
    tags[decodeXmlEntities(tg[1]!)] = decodeXmlEntities(tg[2]!)
  }
  return tags
}

const COMMERCE_AMENITIES = new Set([
  'restaurant', 'cafe', 'bar', 'pub', 'fast_food', 'ice_cream', 'food_court', 'pharmacy', 'bank',
  'post_office', 'clinic', 'dentist', 'doctors', 'veterinary', 'cinema', 'theatre', 'library',
  'bureau_de_change', 'car_rental', 'car_wash', 'fuel', 'marketplace', 'nightclub', 'casino',
  'driving_school', 'language_school', 'music_school', 'coworking_space', 'internet_cafe',
])

/** Classify a tagged node for street-level rendering; null = not interesting. */
function poiKindOf(tags: Record<string, string>): PoiKind | null {
  if (tags['shop']) return 'shop'
  const amenity = tags['amenity']
  if (amenity) {
    if (COMMERCE_AMENITIES.has(amenity)) return 'amenity'
    if (amenity === 'bench') return 'bench'
    if (amenity === 'bicycle_parking') return 'bicycle_parking'
    if (amenity === 'waste_basket' || amenity === 'recycling') return 'waste_basket'
    if (amenity === 'post_box') return 'post_box'
    if (amenity === 'fountain' || amenity === 'drinking_water') return 'fountain'
  }
  if (tags['office']) return 'office'
  if (tags['craft']) return 'craft'
  if (tags['tourism'] && tags['tourism'] !== 'information') return 'tourism'
  if (tags['natural'] === 'tree') return 'tree'
  const hw = tags['highway']
  if (hw === 'street_lamp') return 'street_lamp'
  if (hw === 'bus_stop' || (tags['public_transport'] === 'platform' && tags['bus'] === 'yes')) return 'bus_stop'
  if (hw === 'crossing') return 'crossing'
  if (hw === 'traffic_signals') return 'traffic_signals'
  if (tags['barrier'] === 'bollard') return 'bollard'
  const rw = tags['railway']
  if (rw === 'subway_entrance' || rw === 'train_station_entrance') return 'subway_entrance'
  if (tags['emergency'] === 'fire_hydrant') return 'fire_hydrant'
  if (tags['advertising']) return 'advertising'
  if (tags['entrance']) return 'entrance'
  if (tags['addr:housenumber']) return 'housenumber'
  return null
}

function poiCategoryOf(kind: PoiKind, tags: Record<string, string>): PoiCategory {
  const amenity = tags['amenity']
  if (kind === 'shop') return 'shop'
  if (amenity === 'restaurant' || amenity === 'fast_food' || amenity === 'cafe') return 'restaurant'
  if (amenity === 'fuel') return 'fuel'
  if (amenity === 'hospital' || amenity === 'clinic') return 'hospital'
  if (amenity === 'police') return 'police'
  return 'other'
}

/** Build a PointOfInterest from a tagged node (world position already projected). */
function poiFromNode(node: RawOsmNode, position: WorldPosition): PointOfInterest | null {
  const kind = poiKindOf(node.tags)
  if (!kind) return null
  const name = node.tags['name']
  const brand = node.tags['brand']
  return {
    id: node.id,
    category: poiCategoryOf(kind, node.tags),
    ...(name !== undefined ? { name } : {}),
    position,
    kind,
    tags: node.tags,
    ...(brand !== undefined ? { brand } : {}),
  }
}

/**
 * Shared XML parser: parses OSM XML into Road[], Building[], Waterway[], Park[]
 * and the tagged nodes (shops, trees, crossings, street furniture, addresses…)
 * that the same payload already carries.
 */
function parseOsmXml(xmlText: string): {
  roads: Road[]
  buildings: Building[]
  waterways: Waterway[]
  parks: Park[]
  railways: Railway[]
  barriers: Barrier[]
  /** Nodes that carry at least one tag, with decoded tag values. */
  taggedNodes: RawOsmNode[]
} {
  const nodes = new Map<string, [number, number]>()
  const nodeMatches = xmlText.matchAll(
    /<node id="(\d+)"[^>]*lat="([\d.-]+)"[^>]*lon="([\d.-]+)"/g,
  )
  for (const m of nodeMatches) {
    nodes.set(m[1]!, [parseFloat(m[3]!), parseFloat(m[2]!)])
  }

  // Tagged nodes are written as <node …>…<tag/>…</node> (never self-closing).
  // The attribute part must not contain "/>" so a self-closing node can never
  // swallow the following elements up to some later </node>.
  const taggedNodes: RawOsmNode[] = []
  const crossingNodes = new Map<string, RawOsmNode>()
  const taggedMatches = xmlText.matchAll(/<node id="(\d+)"((?:[^>/]|\/(?!>))*)>([\s\S]*?)<\/node>/g)
  for (const tm of taggedMatches) {
    const body = tm[3]!
    if (body.indexOf('<tag') === -1) continue
    const coords = nodes.get(tm[1]!)
    if (!coords) continue
    const tags = parseTags(body)
    const node: RawOsmNode = { id: tm[1]!, tags, lon: coords[0], lat: coords[1] }
    taggedNodes.push(node)
    const hw = tags['highway']
    if (hw === 'crossing' || hw === 'traffic_signals') crossingNodes.set(node.id, node)
  }

  const roads: Road[] = []
  const buildings: Building[] = []
  const waterways: Waterway[] = []
  const parks: Park[] = []
  const railways: Railway[] = []
  const barriers: Barrier[] = []

  const wayMatches = xmlText.matchAll(/<way id="(\d+)"[^>]*>([\s\S]*?)<\/way>/g)
  for (const wm of wayMatches) {
    const wayId = wm[1]!
    const body = wm[2]!
    const coords: [number, number][] = []
    const refs: string[] = []

    for (const nd of body.matchAll(/<nd ref="(\d+)"/g)) {
      const pt = nodes.get(nd[1]!)
      if (pt) {
        coords.push(pt)
        refs.push(nd[1]!)
      }
    }

    if (coords.length < 2) continue

    const tags = parseTags(body)

    const raw = { id: wayId, tags, coords }

    const road = normalizeRoad(raw)
    if (road) {
      // Pedestrian crossings / signals mapped as nodes of this way
      if (crossingNodes.size > 0) {
        const crossings: RoadCrossing[] = []
        for (let i = 0; i < refs.length; i++) {
          const cn = crossingNodes.get(refs[i]!)
          if (!cn) continue
          const t = cn.tags
          const markings = t['crossing:markings'] ?? t['crossing']
          crossings.push({
            nodeId: cn.id,
            position: geoToWorld({ latitude: cn.lat, longitude: cn.lon }),
            index: i,
            signals: t['highway'] === 'traffic_signals' || t['crossing'] === 'traffic_signals',
            ...(markings !== undefined ? { markings } : {}),
          })
        }
        if (crossings.length > 0) road.crossings = crossings
      }
      roads.push(road)
      continue
    }

    const building = normalizeBuilding(raw)
    if (building) { buildings.push(building); continue }

    const waterway = normalizeWaterway(raw)
    if (waterway) { waterways.push(waterway); continue }

    const park = normalizePark(raw)
    if (park) { parks.push(park); continue }
  }

  return { roads, buildings: deduplicateBuildings(buildings), waterways, parks, railways, barriers, taggedNodes }
}

/** Project and classify tagged nodes into street-level POIs (world origin must be set). */
function poisFromNodes(taggedNodes: RawOsmNode[]): PointOfInterest[] {
  const pois: PointOfInterest[] = []
  for (const n of taggedNodes) {
    const poi = poiFromNode(n, geoToWorld({ latitude: n.lat, longitude: n.lon }))
    if (poi) pois.push(poi)
  }
  return pois
}

/**
 * Fetch raw OSM XML for a bounding box, trying the local proxy first then
 * falling back to the official OSM API.
 */
async function fetchOsmXml(
  bbox: { south: number; north: number; west: number; east: number },
  signal?: AbortSignal,
): Promise<string | null> {
  const bboxStr = `${bbox.west.toFixed(5)},${bbox.south.toFixed(5)},${bbox.east.toFixed(5)},${bbox.north.toFixed(5)}`

  try {
    const proxyUrl = `/api/osm-map?bbox=${bboxStr}`
    const res = await fetch(proxyUrl, {
      headers: { Accept: 'application/xml' },
      ...(signal ? { signal } : {}),
    })
    if (res.ok) return await res.text()
    throw new Error(`Proxy error: ${res.status}`)
  } catch (e) {
    if ((e as Error).name === 'AbortError') return null
    try {
      const directUrl = `https://api.openstreetmap.org/api/0.6/map?bbox=${bboxStr}`
      const res = await fetch(directUrl, {
        headers: {
          'User-Agent': 'OpenWorldCar-Game/1.0 (https://github.com/openworldcar)',
          Accept: 'application/xml',
        },
        ...(signal ? { signal } : {}),
      })
      if (res.ok) return await res.text()
    } catch (directErr) {
      if ((directErr as Error).name === 'AbortError') return null
      console.warn('[LiveOsmFetcher] OSM API fetch failed:', directErr)
    }
  }
  return null
}

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
  const dLat = (radius / 6378137) * (180 / Math.PI)
  const dLon =
    (radius / (6378137 * Math.cos((center.latitude * Math.PI) / 180))) *
    (180 / Math.PI)

  const bbox = {
    south: center.latitude - dLat,
    north: center.latitude + dLat,
    west: center.longitude - dLon,
    east: center.longitude + dLon,
  }

  const xmlText = await fetchOsmXml(bbox, signal)
  if (!xmlText || xmlText.length < 50) return null

  const { roads, buildings, waterways, parks, railways, barriers, taggedNodes } = parseOsmXml(xmlText)
  const pois = poisFromNodes(taggedNodes)
  console.info(`[LiveOsmFetcher] ${taggedNodes.length} tagged nodes parsed → ${pois.length} POIs (${roads.length} roads, ${buildings.length} buildings)`)
  if (roads.length === 0) return null

  return generateChunks(roads, buildings, pois, waterways, parks, railways, barriers)
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
  const dLat = (radius / 6378137) * (180 / Math.PI)
  const dLon =
    (radius / (6378137 * Math.cos((origin.latitude * Math.PI) / 180))) *
    (180 / Math.PI)

  const bbox = {
    south: origin.latitude - dLat,
    north: origin.latitude + dLat,
    west: origin.longitude - dLon,
    east: origin.longitude + dLon,
  }

  // 2. Fetch raw XML from local proxy or official OSM API
  const xmlText = await fetchOsmXml(bbox, signal)
  if (!xmlText || xmlText.length < 50) return null

  // Ensure coordinate projection origin is set
  setWorldOrigin(origin)

  // 3. Parse ways into roads, buildings, waterways, parks, railways and barriers
  const { roads, buildings, waterways, parks, railways, barriers, taggedNodes } = parseOsmXml(xmlText)
  const pois = poisFromNodes(taggedNodes)
  console.info(`[LiveOsmFetcher] ${taggedNodes.length} tagged nodes parsed → ${pois.length} POIs (${roads.length} roads, ${buildings.length} buildings)`)

  if (roads.length === 0) {
    return null
  }

  // 4. Partition into chunk grid
  const chunks = generateChunks(roads, buildings, pois, waterways, parks, railways, barriers)

  // 5. Find the best on-road spawn point closest to preferredSpawn or world (0, 0)
  let bestDistSq = Infinity
  let spawnPoint: WorldPosition = preferredSpawn ?? { x: 0, y: 0.5, z: 0 }
  let spawnHeading = preferredHeading ?? 0
  let primaryStreetName: string | undefined

  const targetX = preferredSpawn ? preferredSpawn.x : 0
  const targetZ = preferredSpawn ? preferredSpawn.z : 0

  for (const road of roads) {
    for (let i = 0; i < road.points.length - 1; i++) {
      const p1 = road.points[i]!
      const p2 = road.points[i + 1]!

      // Midpoint of segment
      const mx = (p1.x + p2.x) / 2
      const mz = (p1.z + p2.z) / 2
      const dx = mx - targetX
      const dz = mz - targetZ
      let distSq = dx * dx + dz * dz

      // Prefer main vehicular roads over service alleys or pedestrian paths
      if (road.highway === 'service') distSq += 25 * 25
      if (road.highway === 'pedestrian') distSq += 50 * 50

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

