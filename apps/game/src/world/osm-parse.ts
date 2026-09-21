/**
 * osm-parse — worker-safe OpenStreetMap XML parsing + chunk generation.
 *
 * Pure data work, no DOM / THREE / Rapier imports: this module runs both on
 * the main thread (fallback / initial area load) and inside `osm.worker.ts`
 * so the heavy regex parsing and chunk bucketing never blocks the render loop.
 */

import type {
  Road,
  Building,
  Waterway,
  Park,
  PointOfInterest,
  PoiKind,
  PoiCategory,
  RoadCrossing,
} from '@world-drive/shared'
import {
  type GeoPosition,
  type WorldPosition,
  setWorldOrigin,
  geoToWorld,
} from '@world-drive/math'
import {
  normalizeRoad,
  normalizeBuilding,
  normalizeWaterway,
  normalizePark,
  deduplicateBuildings,
  generateChunks,
  type ChunkMap,
  type RawOsmNode,
} from '@world-drive/world-data'
import { parseMultipolygonBuildings } from './OsmMultipolygon.js'
import { fillMissingHeights } from './BuildingHeights.js'

/**
 * Decode the XML character entities the OSM API emits in attribute values
 * ("Saint-Lazare &amp; Opéra" → "Saint-Lazare & Opéra").
 */
export function decodeXmlEntities(value: string): string {
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
export function parseTags(body: string): Record<string, string> {
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
 *
 * Requires the world origin to be set (geoToWorld is origin-relative).
 */
export function parseOsmXml(xmlText: string): {
  roads: Road[]
  buildings: Building[]
  waterways: Waterway[]
  parks: Park[]
  /** Nodes that carry at least one tag, with decoded tag values. */
  taggedNodes: RawOsmNode[]
  /** All node coordinates by id ([lon, lat]). */
  nodes: Map<string, [number, number]>
  /** All ways' ordered node ids, tagged or not. */
  wayNodeRefs: Map<string, string[]>
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
  /** Every way's ordered node ids (tagged or not): multipolygon rings are stitched from these. */
  const wayNodeRefs = new Map<string, string[]>()

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
    wayNodeRefs.set(wayId, refs)

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

  // Resolve duplicated / superseded outlines among way buildings (upstream rule)
  const emitted = new Set(buildings.map((b) => b.id))
  const dedupedBuildings = deduplicateBuildings(buildings)

  // Buildings mapped as multipolygon relations (courtyard blocks): their outer
  // ways carry no tags, so they were absent from the scene until now. Added after
  // deduplication, which compares outer rings only and would otherwise drop a
  // courtyard block or a building standing inside its courtyard.
  const relationBuildings = parseMultipolygonBuildings(xmlText, nodes, wayNodeRefs, normalizeBuilding, parseTags, emitted)
  for (const b of relationBuildings) dedupedBuildings.push(b)

  // Buildings without any height/levels tag take the median of their tagged
  // neighbours instead of a flat default (no more 2-storey stubs in a 7-storey street).
  fillMissingHeights(dedupedBuildings)

  return { roads, buildings: dedupedBuildings, waterways, parks, taggedNodes, nodes, wayNodeRefs }
}

/** Project and classify tagged nodes into street-level POIs (world origin must be set). */
export function poisFromNodes(taggedNodes: RawOsmNode[]): PointOfInterest[] {
  const pois: PointOfInterest[] = []
  for (const n of taggedNodes) {
    const poi = poiFromNode(n, geoToWorld({ latitude: n.lat, longitude: n.lon }))
    if (poi) pois.push(poi)
  }
  return pois
}

/** Bounding box (degrees) for a circular fetch area. */
export function bboxForCenter(
  center: GeoPosition,
  radius: number,
): { south: number; north: number; west: number; east: number } {
  const dLat = (radius / 6378137) * (180 / Math.PI)
  const dLon =
    (radius / (6378137 * Math.cos((center.latitude * Math.PI) / 180))) *
    (180 / Math.PI)
  return {
    south: center.latitude - dLat,
    north: center.latitude + dLat,
    west: center.longitude - dLon,
    east: center.longitude + dLon,
  }
}

/**
 * Fetch raw OSM XML for a bounding box, trying the local proxy first then
 * falling back to the official OSM API. Works in a Worker (fetch is available).
 */
export async function fetchOsmXml(
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
 * Best on-road spawn point closest to preferredSpawn or world (0, 0).
 * Prefers main vehicular roads over service alleys / pedestrian paths.
 */
export function findSpawnPoint(
  roads: Road[],
  preferredSpawn?: WorldPosition,
  preferredHeading?: number,
): { spawnPoint: WorldPosition; spawnHeading: number; streetName?: string } {
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
    spawnPoint,
    spawnHeading,
    ...(primaryStreetName ? { streetName: primaryStreetName } : {}),
  }
}

export type ParsedOsmArea = {
  chunks: ChunkMap
  totalRoads: number
  totalBuildings: number
  taggedNodes: number
  totalPois: number
}

/**
 * Parse fetched XML into chunk data. Sets the world origin first so
 * geoToWorld is deterministic in whichever thread runs this.
 *
 * Returns null on download failure; an empty ChunkMap when the area genuinely
 * has no roads (ocean/park/empty).
 */
export function buildChunksFromXml(xmlText: string, origin: GeoPosition): ParsedOsmArea | null {
  if (!xmlText || xmlText.length < 50) return null
  setWorldOrigin(origin)
  const { roads, buildings, waterways, parks, taggedNodes } = parseOsmXml(xmlText)
  const pois = poisFromNodes(taggedNodes)
  if (typeof console !== 'undefined') {
    console.info(`[LiveOsmFetcher] ${taggedNodes.length} tagged nodes parsed → ${pois.length} POIs (${roads.length} roads, ${buildings.length} buildings)`)
  }
  // Genuinely empty area (no roads): an empty map. A failed download stays null.
  if (roads.length === 0) return { chunks: new Map(), totalRoads: 0, totalBuildings: buildings.length, taggedNodes: taggedNodes.length, totalPois: pois.length }
  const chunks = generateChunks(roads, buildings, pois, waterways, parks)
  return { chunks, totalRoads: roads.length, totalBuildings: buildings.length, taggedNodes: taggedNodes.length, totalPois: pois.length }
}
