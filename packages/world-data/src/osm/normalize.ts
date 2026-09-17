/**
 * Normalize raw OSM GeoJSON features into game types.
 */

import type { Road, Building, PointOfInterest, HighwayType, PoiCategory } from '@world-drive/shared'
import type { WorldPosition } from '@world-drive/math'
import { lonLatArrayToWorld } from '../geo/projection.js'
import { isWantedHighway, isWantedBuilding, isWantedPoi, type OsmTags } from './filter.js'

const DEFAULT_FLOOR_HEIGHT = 3.5 // metres

function parseMaxSpeed(raw: string | undefined): number | undefined {
  if (!raw) return undefined
  const n = parseInt(raw, 10)
  return isNaN(n) ? undefined : n
}

function normalizeLanes(raw: string | undefined, highway: string): number {
  if (raw) {
    const n = parseInt(raw, 10)
    if (!isNaN(n)) return Math.max(1, n)
  }
  // Sensible defaults by road type
  if (highway === 'motorway' || highway === 'trunk') return 3
  if (highway === 'primary' || highway === 'secondary') return 2
  return 1
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
