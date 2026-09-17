/**
 * Normalize raw OSM GeoJSON features into game types.
 */

import type { Road, Building, PointOfInterest, HighwayType, PoiCategory, Waterway, WaterwayType, Park, ParkType } from '@world-drive/shared'
import type { WorldPosition } from '@world-drive/math'
import { lonLatArrayToWorld } from '../geo/projection.js'
import { isWantedHighway, isWantedBuilding, isWantedPoi, isWantedPark, type OsmTags } from './filter.js'

const DEFAULT_FLOOR_HEIGHT = 3.5 // metres

function parseMaxSpeed(raw: string | undefined): number | undefined {
  if (!raw) return undefined
  const n = parseInt(raw, 10)
  return isNaN(n) ? undefined : n
}

function normalizeLanes(raw: string | undefined, highway: string): number {
  if (raw) {
    const n = parseInt(raw, 10)
    if (!isNaN(n)) return Math.max(2, n)
  }
  // - Grosses avenues (primary, motorway, trunk) : 4 voies (2 voies dans chaque sens)
  if (highway === 'motorway' || highway === 'trunk' || highway === 'primary') return 4
  // - Rues de ville & boulevards (secondary, tertiary, residential, pedestrian, etc.) : 2 voies
  return 2
}

function normalizeHighwayType(raw: string): HighwayType {
  if (raw.endsWith('_link')) raw = raw.replace('_link', '')
  const map: Record<string, HighwayType> = {
    motorway: 'motorway',
    trunk: 'trunk',
    primary: 'primary',
    secondary: 'secondary',
    tertiary: 'tertiary',
    residential: 'residential',
    service: 'service',
    living_street: 'residential',
    pedestrian: 'residential',
    unclassified: 'unclassified',
    road: 'unclassified',
  }
  return map[raw] ?? 'unclassified'
}

export type RawOsmWay = {
  id: string
  tags: OsmTags
  /** [lon, lat] pairs */
  coords: [number, number][]
}

export type RawOsmNode = {
  id: string
  tags: OsmTags
  lon: number
  lat: number
}

export function normalizeRoad(way: RawOsmWay): Road | null {
  if (!isWantedHighway(way.tags)) return null
  const points = lonLatArrayToWorld(way.coords)
  if (points.length < 2) return null

  const highway = way.tags['highway'] ?? 'unclassified'
  const name = way.tags['name']
  const maxSpeed = parseMaxSpeed(way.tags['maxspeed'])
  return {
    id: way.id,
    highway: normalizeHighwayType(highway),
    ...(name !== undefined ? { name } : {}),
    lanes: normalizeLanes(way.tags['lanes'], highway),
    ...(maxSpeed !== undefined ? { maxSpeed } : {}),
    bridge: way.tags['bridge'] === 'yes',
    tunnel: way.tags['tunnel'] === 'yes',
    points,
  }
}

export function normalizeBuilding(way: RawOsmWay): Building | null {
  if (!isWantedBuilding(way.tags)) return null
  const footprint = lonLatArrayToWorld(way.coords)
  if (footprint.length < 3) return null

  const levels = parseInt(way.tags['building:levels'] ?? '0', 10) || 2
  const heightTag = parseFloat(way.tags['height'] ?? '0')
  const height = heightTag > 0 ? heightTag : levels * DEFAULT_FLOOR_HEIGHT

  return {
    id: way.id,
    footprint,
    height,
    levels,
  }
}

function resolvePoiCategory(tags: OsmTags): PoiCategory {
  const amenity = tags['amenity']
  if (amenity === 'fuel') return 'fuel'
  if (amenity === 'parking') return 'parking'
  if (amenity === 'restaurant' || amenity === 'fast_food') return 'restaurant'
  if (amenity === 'hospital') return 'hospital'
  if (amenity === 'police') return 'police'
  if (tags['shop']) return 'shop'
  return 'other'
}

export function normalizePoi(
  node: RawOsmNode,
  worldPos: WorldPosition,
): PointOfInterest | null {
  if (!isWantedPoi(node.tags)) return null
  const name = node.tags['name']
  return {
    id: node.id,
    category: resolvePoiCategory(node.tags),
    ...(name !== undefined ? { name } : {}),
    position: worldPos,
  }
}

const WATERWAY_WIDTHS: Record<string, number> = {
  river: 22,
  canal: 14,
  stream: 5,
  drain: 2,
  dock: 30,
  lake: 50,
  basin: 30,
  water: 25,
}

export function normalizeWaterway(way: RawOsmWay): Waterway | null {
  const waterwayTag = way.tags['waterway']
  const naturalTag = way.tags['natural']
  const waterSubTag = way.tags['water']
  const landuseTag = way.tags['landuse']

  // Determine if this is water
  let type: WaterwayType = 'water'
  let isPolygon = false

  if (waterwayTag === 'riverbank' || naturalTag === 'water' || landuseTag === 'basin' || landuseTag === 'reservoir') {
    isPolygon = true
    if (waterSubTag === 'river' || waterwayTag === 'riverbank') type = 'river'
    else if (waterSubTag === 'canal' || waterwayTag === 'canal') type = 'canal'
    else if (waterSubTag === 'lake' || naturalTag === 'water') type = 'lake'
    else if (landuseTag === 'basin' || waterSubTag === 'basin') type = 'basin'
    else type = 'water'
  } else if (waterwayTag) {
    if (['river', 'stream', 'canal', 'drain', 'dock'].includes(waterwayTag)) {
      type = waterwayTag as WaterwayType
    } else {
      type = 'water'
    }
  } else if (waterSubTag) {
    type = 'water'
  } else {
    return null
  }

  // Check if closed polygon
  const coords = way.coords
  if (coords.length < 2) return null
  if (coords.length >= 4) {
    const first = coords[0]!
    const last = coords[coords.length - 1]!
    if (Math.abs(first[0] - last[0]) < 1e-6 && Math.abs(first[1] - last[1]) < 1e-6) {
      isPolygon = true
    }
  }

  const points = lonLatArrayToWorld(coords)
  if (points.length < 2) return null

  const widthTag = parseFloat(way.tags['width'] ?? '0')
  const width = widthTag > 0 ? widthTag : (WATERWAY_WIDTHS[type] ?? 10)
  const name = way.tags['name']

  return {
    id: way.id,
    type,
    ...(name !== undefined ? { name } : {}),
    width,
    points,
    isPolygon,
  }
}

export function normalizePark(way: RawOsmWay): Park | null {
  if (!isWantedPark(way.tags)) return null

  const leisure = way.tags['leisure']
  const landuse = way.tags['landuse']
  const natural = way.tags['natural']

  let type: ParkType = 'park'
  if (leisure === 'garden') type = 'garden'
  else if (landuse === 'grass' || landuse === 'village_green' || landuse === 'meadow') type = 'grass'
  else if (landuse === 'forest' || natural === 'wood') type = 'forest'
  else if (leisure === 'pitch' || leisure === 'recreation_ground' || leisure === 'playground') type = 'recreation'
  else type = 'park'

  const coords = way.coords
  if (coords.length < 3) return null

  const points = lonLatArrayToWorld(coords)
  if (points.length < 3) return null

  const name = way.tags['name']

  return {
    id: way.id,
    type,
    ...(name !== undefined ? { name } : {}),
    polygon: points,
  }
}
