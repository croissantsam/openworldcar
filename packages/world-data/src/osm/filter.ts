/**
 * OSM tag filter.
 *
 * Determines which OSM elements are relevant for the game.
 * Run before normalization to reduce data volume.
 */

export type OsmTags = Record<string, string>

/** Highway types we care about (drivable roads + pedestrian streets). */
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
  'track',
  'unclassified',
  'road',
])

export function isWantedHighway(tags: OsmTags): boolean {
  const highway = tags['highway']
  if (!highway || !WANTED_HIGHWAYS.has(highway)) return false
  // Subway/railway tunnels are handled separately; keep vehicular road tunnels
  return true
}

export function isWantedBuilding(tags: OsmTags): boolean {
  // Exclude surface parking lots without a building structure
  if (tags['amenity'] === 'parking' && !tags['building']) return false
  if (tags['building'] && tags['building'] !== 'no') return true
  if (tags['building:part'] && tags['building:part'] !== 'no') return true
  if (tags['historic'] && ['building', 'monument', 'memorial', 'castle', 'manor', 'church'].includes(tags['historic'])) return true
  return false
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

const WANTED_WATERWAYS = new Set([
  'river',
  'stream',
  'canal',
  'tidal_channel',
  'dock',
  'lock',
  'riverbank',
  'boatyard',
  'dam',
  'weir',
])

export function isWantedWater(tags: OsmTags): boolean {
  // Underground aqueducts, culverts, buried waterways, and covered canals must be excluded
  if (tags['tunnel'] && tags['tunnel'] !== 'no') return false
  if (tags['covered'] === 'yes') return false
  if (tags['location'] === 'underground') return false
  const layer = parseInt(tags['layer'] ?? '0', 10)
  if (layer < 0) return false

  if (tags['waterway'] && WANTED_WATERWAYS.has(tags['waterway'])) return true
  if (tags['natural'] === 'water') return true
  if (tags['water'] !== undefined) return true
  if (tags['landuse'] === 'basin' || tags['landuse'] === 'reservoir') return true
  return false
}

const WANTED_LEISURE = new Set([
  'park',
  'garden',
  'recreation_ground',
  'pitch',
  'playground',
  'dog_park',
  'common',
  'swimming_pool',
])

const WANTED_LANDUSE = new Set([
  'grass',
  'forest',
  'village_green',
  'meadow',
  'cemetery',
  'farmland',
  'farmyard',
  'orchard',
  'vineyard',
  'allotments',
  'parking',
])

const WANTED_NATURAL = new Set([
  'wood',
  'scrub',
  'heath',
  'grassland',
  'beach',
  'sand',
  'cliff',
  'wetland',
  'marsh',
])

export function isWantedPark(tags: OsmTags): boolean {
  if (tags['leisure'] && WANTED_LEISURE.has(tags['leisure'])) return true
  if (tags['landuse'] && WANTED_LANDUSE.has(tags['landuse'])) return true
  if (tags['natural'] && WANTED_NATURAL.has(tags['natural'])) return true
  if (tags['amenity'] === 'grave_yard') return true
  return false
}
