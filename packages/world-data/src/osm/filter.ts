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
