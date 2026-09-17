/**
 * OSM tag filter.
 *
 * Determines which OSM elements are relevant for the game.
 * Run before normalization to reduce data volume.
 */

export type OsmTags = Record<string, string>

/** Highway types we care about (drives + walkable). */
const WANTED_HIGHWAYS = new Set([
  'motorway',
  'motorway_link',
  'trunk',
  'trunk_link',
  'primary',
  'primary_link',
  'secondary',
  'secondary_link',
  'tertiary',
  'tertiary_link',
  'residential',
  'living_street',
  'pedestrian',
  'service',
  'unclassified',
  'road',
])

export function isWantedHighway(tags: OsmTags): boolean {
  const highway = tags['highway']
  return highway !== undefined && WANTED_HIGHWAYS.has(highway)
}

export function isWantedBuilding(tags: OsmTags): boolean {
  return 'building' in tags
}

const WANTED_POI_AMENITIES = new Set([
  'fuel',
  'parking',
  'restaurant',
  'fast_food',
  'hospital',
  'police',
])

const WANTED_POI_SHOPS = new Set(['convenience', 'supermarket', 'mall'])

export function isWantedPoi(tags: OsmTags): boolean {
  if (tags['amenity'] && WANTED_POI_AMENITIES.has(tags['amenity'])) return true
  if (tags['shop'] && WANTED_POI_SHOPS.has(tags['shop'])) return true
  return false
}

const WANTED_WATERWAYS = new Set(['river', 'stream', 'canal', 'drain', 'ditch', 'riverbank', 'dock'])

export function isWantedWater(tags: OsmTags): boolean {
  if (tags['waterway'] && WANTED_WATERWAYS.has(tags['waterway'])) return true
  if (tags['natural'] === 'water') return true
  if (tags['water'] !== undefined) return true
  if (tags['landuse'] === 'basin' || tags['landuse'] === 'reservoir') return true
  return false
}

const WANTED_LEISURE = new Set(['park', 'garden', 'recreation_ground', 'pitch', 'playground'])
const WANTED_LANDUSE = new Set(['grass', 'forest', 'village_green', 'meadow'])

export function isWantedPark(tags: OsmTags): boolean {
  if (tags['leisure'] && WANTED_LEISURE.has(tags['leisure'])) return true
  if (tags['landuse'] && WANTED_LANDUSE.has(tags['landuse'])) return true
  if (tags['natural'] === 'wood' || tags['natural'] === 'scrub') return true
  return false
}
