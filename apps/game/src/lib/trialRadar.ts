/**
 * Trial radar — far monuments + road corridors via Overpass.
 *
 * Full-geometry /map downloads stay capped at 300m (OSM 50k-node budget), so
 * monuments beyond the streamed area would never surface. The radar fills
 * that gap with two lightweight query shapes:
 *   1. tourism/historic nodes + ways in a ~2.5km radius (positions only),
 *   2. highway geometry in the narrow corridor of a candidate pair (for the
 *      exact A* road distance).
 * Both go through the disk-cached /api/overpass proxy. Queries are centered
 * on the destination origin (stable for every player in that city), and trial
 * ids derive from OSM ids, so leaderboards merge across players.
 */

import type { GeoPosition } from '@world-drive/math'
import type { Road } from '@world-drive/shared'
import { fetchOverpassXml, parseOsmXml, parseTags } from '../world/osm-parse.js'

export interface RadarMonument {
  /** `ov_node_<id>` / `ov_way_<id>` — stable OSM ids, never collide with chunk POI ids. */
  id: string
  name: string
  lat: number
  lon: number
}

/** Radar sweep radius around the destination origin. */
export const TRIAL_RADAR_RADIUS_M = 2500

const TOURISM_VALUES = 'attraction|museum|monument|memorial|artwork|viewpoint|gallery|theme_park|zoo|aquarium'
const HISTORIC_VALUES = 'monument|memorial'
const TOURISM_RE = /^(attraction|museum|monument|memorial|artwork|viewpoint|gallery|theme_park|zoo|aquarium)$/
const HISTORIC_RE = /^(monument|memorial)$/

export function radarMonumentsQuery(center: GeoPosition, radiusM = TRIAL_RADAR_RADIUS_M): string {
  const around = `around:${radiusM},${center.latitude},${center.longitude}`
  return (
    `[out:xml][timeout:25];(` +
    `node["tourism"~"${TOURISM_VALUES}"](${around});` +
    `node["historic"~"${HISTORIC_VALUES}"](${around});` +
    `way["tourism"~"${TOURISM_VALUES}"](${around});` +
    `way["historic"~"${HISTORIC_VALUES}"](${around});` +
    `);(._;>;);out;`
  )
}

function isMonumentTags(tags: Record<string, string>): boolean {
  return TOURISM_RE.test(tags['tourism'] ?? '') || HISTORIC_RE.test(tags['historic'] ?? '')
}

/** Extract named monuments (nodes + way centroids) from an Overpass XML payload. */
export function extractRadarMonuments(xml: string): RadarMonument[] {
  const out = new Map<string, RadarMonument>()
  let parsed
  try {
    parsed = parseOsmXml(xml)
  } catch {
    return []
  }
  for (const n of parsed.taggedNodes) {
    const name = n.tags['name']?.trim()
    if (!name || !isMonumentTags(n.tags)) continue
    const id = `ov_node_${n.id}`
    if (!out.has(id)) out.set(id, { id, name: name.slice(0, 48), lat: n.lat, lon: n.lon })
  }
  for (const m of xml.matchAll(/<way id="(\d+)"[^>]*>([\s\S]*?)<\/way>/g)) {
    const tags = parseTags(m[2]!)
    if (!isMonumentTags(tags)) continue
    const name = tags['name']?.trim()
    if (!name) continue
    const refs = parsed.wayNodeRefs.get(m[1]!)
    if (!refs || refs.length === 0) continue
    let sx = 0
    let sy = 0
    let n = 0
    for (const ref of refs) {
      const c = parsed.nodes.get(ref)
      if (!c) continue
      sx += c[0]
      sy += c[1]
      n++
    }
    if (n === 0) continue
    const id = `ov_way_${m[1]}`
    if (!out.has(id)) out.set(id, { id, name: name.slice(0, 48), lat: sy / n, lon: sx / n })
  }
  return [...out.values()]
}

export async function fetchRadarMonuments(
  center: GeoPosition,
  signal?: AbortSignal,
): Promise<RadarMonument[]> {
  const xml = await fetchOverpassXml(radarMonumentsQuery(center), signal)
  if (!xml) return []
  return extractRadarMonuments(xml)
}

/** Overpass bbox filter (south,west,north,east) around a segment + margin. */
export function corridorQuery(a: GeoPosition, b: GeoPosition, marginM = 200): string {
  const midLat = (a.latitude + b.latitude) / 2
  const dLat = (marginM / 6378137) * (180 / Math.PI)
  const dLon = (marginM / (6378137 * Math.cos((midLat * Math.PI) / 180))) * (180 / Math.PI)
  const south = Math.min(a.latitude, b.latitude) - dLat
  const north = Math.max(a.latitude, b.latitude) + dLat
  const west = Math.min(a.longitude, b.longitude) - dLon
  const east = Math.max(a.longitude, b.longitude) + dLon
  return `[out:xml][timeout:25];(way["highway"](${south},${west},${north},${east}););(._;>;);out;`
}

/** Highway geometry between two geo points (world-projected roads). */
export async function fetchCorridorRoads(
  a: GeoPosition,
  b: GeoPosition,
  signal?: AbortSignal,
): Promise<Road[]> {
  const xml = await fetchOverpassXml(corridorQuery(a, b), signal)
  if (!xml) return []
  try {
    return parseOsmXml(xml).roads
  } catch {
    return []
  }
}
