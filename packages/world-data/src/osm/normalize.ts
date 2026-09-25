/**
 * Normalize raw OSM GeoJSON features into game types.
 */

import type {
  Road, RoadElevationMode, Building, PointOfInterest, HighwayType, RoadSurface, BuildingType, RoofShape,
  PoiCategory, Waterway, WaterwayType, Park, ParkType,
} from '@world-drive/shared'
import type { WorldPosition } from '@world-drive/math'
import { lonLatArrayToWorld } from '../geo/projection.js'
import {
  isWantedHighway, isWantedBuilding, isWantedPoi, isWantedPark,
  type OsmTags,
} from './filter.js'

const DEFAULT_FLOOR_HEIGHT = 3.5 // metres

function parseMaxSpeed(raw: string | undefined): number | undefined {
  if (!raw) return undefined
  const n = parseInt(raw, 10)
  return isNaN(n) ? undefined : n
}

function normalizeLanes(
  raw: string | undefined,
  highway: string,
  isOneway = false,
  isLink = false,
): number {
  if (raw) {
    const n = parseInt(raw, 10)
    if (!isNaN(n)) return Math.max(1, n)
  }
  // Bretelles d'échangeur / rampes : 1 voie par défaut
  if (isLink || highway.endsWith('_link')) return 1
  // Voies de service & chemins ruraux / agricoles : 1 voie
  if (highway === 'service' || highway === 'track') return 1
  // Grandes artères (motorway, trunk, primary)
  if (highway === 'motorway' || highway === 'trunk' || highway === 'primary') {
    return isOneway ? 2 : 4
  }
  // Rues urbaines à sens unique : 1 voie de circulation
  if (isOneway) return 1
  // Rues urbaines à double sens : 2 voies
  return 2
}

function normalizeHighwayType(raw: string): HighwayType {
  const clean = raw.endsWith('_link') ? raw.replace('_link', '') : raw
  const map: Record<string, HighwayType> = {
    motorway: 'motorway',
    trunk: 'trunk',
    primary: 'primary',
    secondary: 'secondary',
    tertiary: 'tertiary',
    residential: 'residential',
    living_street: 'living_street',
    service: 'service',
    track: 'track',
    pedestrian: 'pedestrian',
    cycleway: 'cycleway',
    footway: 'footway',
    path: 'path',
    steps: 'steps',
    unclassified: 'unclassified',
    road: 'unclassified',
  }
  return map[clean] ?? 'unclassified'
}

function normalizeRoadSurface(raw: string | undefined): RoadSurface | undefined {
  if (!raw) return undefined
  const map: Record<string, RoadSurface> = {
    asphalt: 'asphalt',
    concrete: 'concrete',
    'concrete:lanes': 'concrete',
    'concrete:plates': 'concrete',
    cobblestone: 'cobblestone',
    sett: 'sett',
    paved: 'paved',
    unpaved: 'unpaved',
    gravel: 'gravel',
    fine_gravel: 'fine_gravel',
    dirt: 'dirt',
    ground: 'ground',
    sand: 'sand',
    compacted: 'gravel',
    brick: 'sett',
  }
  return map[raw] ?? undefined
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

/** sidewalk:* side value → present? ('separate' = mapped as its own way, but it EXISTS). */
function sidewalkSidePresent(v: string | undefined): boolean | undefined {
  if (v === undefined) return undefined
  if (v === 'yes' || v === 'separate' || v === 'both' || v === 'left' || v === 'right') return true
  if (v === 'no' || v === 'none') return false
  return undefined
}

function normalizeSidewalk(tags: OsmTags, highway: string): 'both' | 'left' | 'right' | 'none' {
  const sw = tags['sidewalk']
  const swBoth = tags['sidewalk:both']
  const swLeft = tags['sidewalk:left']
  const swRight = tags['sidewalk:right']

  if (sw === 'none' || sw === 'no') return 'none'
  if (sw === 'both' || sw === 'yes' || sw === 'separate') return 'both'
  if (sw === 'left') return 'left'
  if (sw === 'right') return 'right'
  const both = sidewalkSidePresent(swBoth)
  if (both === true) return 'both'
  if (both === false) return 'none'

  const left = sidewalkSidePresent(swLeft)
  const right = sidewalkSidePresent(swRight)
  if (left !== undefined && right !== undefined) {
    if (left && right) return 'both'
    if (left) return 'left'
    if (right) return 'right'
    return 'none'
  }
  if (left === true) return 'left'
  if (right === true) return 'right'

  // Default: motorways, trunks, and link ramps have no pedestrian sidewalks
  if (highway === 'motorway' || highway === 'trunk' || highway.endsWith('_link')) {
    return 'none'
  }
  return 'both'
}

function normalizeCycleway(tags: OsmTags): 'lane' | 'track' | 'shared_lane' | 'both' | 'right' | 'left' | 'none' | undefined {
  const cw = tags['cycleway']
  const cwBoth = tags['cycleway:both']
  const cwRight = tags['cycleway:right']
  const cwLeft = tags['cycleway:left']

  if (cw === 'no' || cw === 'none') return 'none'
  if (cw === 'lane' || cwBoth === 'lane') return 'lane'
  if (cw === 'track' || cwBoth === 'track') return 'track'
  if (cw === 'shared_lane') return 'shared_lane'
  if (cw === 'both' || (cwRight && cwLeft)) return 'both'
  if (cw === 'right' || cwRight) return 'right'
  if (cw === 'left' || cwLeft) return 'left'
  if (cw && cw !== 'no') return 'lane'
  return undefined
}

/** Current street-parking schema (parking:left/right/both=*) → parking present on that side? */
function parkingSidePresent(v: string | undefined): boolean | undefined {
  if (v === undefined) return undefined
  switch (v) {
    case 'lane':
    case 'street_side':
    case 'on_kerb':
    case 'half_on_kerb':
    case 'shoulder':
    case 'yes':
      return true
    case 'no':
    case 'separate':
    case 'no_parking':
    case 'no_stopping':
    case 'no_standing':
    case 'missing':
    case 'none':
      return false
    default:
      return undefined
  }
}

/** Deprecated parking:lane:* schema → parking present on that side? */
function legacyParkingLanePresent(v: string | undefined): boolean | undefined {
  if (v === undefined) return undefined
  switch (v) {
    case 'parallel':
    case 'diagonal':
    case 'perpendicular':
    case 'marked':
    case 'yes':
      return true
    case 'no':
    case 'no_parking':
    case 'no_stopping':
    case 'no_standing':
    case 'fire_lane':
    case 'separate':
    case 'none':
      return false
    default:
      return undefined
  }
}

function combineParkingSides(left: boolean | undefined, right: boolean | undefined): 'both' | 'right' | 'left' | 'none' | undefined {
  if (left === undefined && right === undefined) return undefined
  const l = left === true
  const r = right === true
  if (l && r) return 'both'
  if (l) return 'left'
  if (r) return 'right'
  return 'none'
}

function normalizeParkingLane(tags: OsmTags): 'both' | 'right' | 'left' | 'none' | undefined {
  // 1. Current schema: parking:both / parking:left / parking:right
  //    (parking:*:orientation defaults to parallel; presence does not depend on it)
  const both = parkingSidePresent(tags['parking:both'])
  const left = parkingSidePresent(tags['parking:left']) ?? both
  const right = parkingSidePresent(tags['parking:right']) ?? both
  const current = combineParkingSides(left, right)
  if (current !== undefined) return current

  // 2. Deprecated schema fallback: parking:lane / parking:lane:both|left|right
  const pk = tags['parking:lane']
  if (pk === 'none' || pk === 'no') return 'none'
  if (pk === 'both') return 'both'
  if (pk === 'right') return 'right'
  if (pk === 'left') return 'left'
  const lBoth = legacyParkingLanePresent(tags['parking:lane:both'])
  const lLeft = legacyParkingLanePresent(tags['parking:lane:left']) ?? lBoth
  const lRight = legacyParkingLanePresent(tags['parking:lane:right']) ?? lBoth
  const legacy = combineParkingSides(lLeft, lRight)
  if (legacy !== undefined) return legacy
  if (pk === 'parallel' || pk === 'diagonal' || pk === 'perpendicular' || pk === 'yes') return 'both'
  return undefined
}

export function normalizeRoad(way: RawOsmWay): Road | null {
  if (!isWantedHighway(way.tags)) return null
  const points = lonLatArrayToWorld(way.coords)
  if (points.length < 2) return null

  const highway = way.tags['highway'] ?? 'unclassified'
  const name = way.tags['name']
  const maxSpeed = parseMaxSpeed(way.tags['maxspeed'])
  const surface = normalizeRoadSurface(way.tags['surface'])
  const isRoundabout = way.tags['junction'] === 'roundabout'

  const layer = parseInt(way.tags['layer'] ?? '0', 10) || 0
  const isBridge = way.tags['bridge'] === 'yes' || way.tags['bridge'] === 'viaduct' || layer > 0
  const isTunnel = way.tags['tunnel'] === 'yes' || way.tags['tunnel'] === 'building_passage' || layer < 0

  let elevationMode: RoadElevationMode = 'ground'
  if (isBridge || isTunnel) elevationMode = 'bridge'
  // Tunnels are converted to bridges (elevationMode = 'bridge')

  // Bridge clearance height calculation (from pont.txt sections 6, 10, 21)
  const bridgeHeight = (isBridge || isTunnel) ? Math.max(3.8, Math.abs(layer) * 4.5 || 4.5) : undefined

  const isLink = highway.endsWith('_link')
  const onewayTag = way.tags['oneway']
  const isOneway = onewayTag === 'yes' || onewayTag === '1' || onewayTag === '-1' || isRoundabout || highway === 'motorway' || highway === 'motorway_link'

  const lanesFwdRaw = parseInt(way.tags['lanes:forward'] ?? '', 10)
  const lanesBwdRaw = parseInt(way.tags['lanes:backward'] ?? '', 10)
  const lanesForward = !isNaN(lanesFwdRaw) ? lanesFwdRaw : undefined
  const lanesBackward = !isNaN(lanesBwdRaw) ? lanesBwdRaw : undefined

  const hasBusLane = Boolean(
    way.tags['bus:lanes'] ||
    way.tags['lanes:bus'] ||
    way.tags['busway'] ||
    way.tags['busway:right'] ||
    way.tags['busway:left'] ||
    way.tags['busway:both'] ||
    highway === 'busway'
  )

  const sidewalkMode = normalizeSidewalk(way.tags, highway)
  const cycleway = normalizeCycleway(way.tags)
  const parkingLane = normalizeParkingLane(way.tags)
  const isLit = way.tags['lit'] === 'yes'

  const rawWidth = parseFloat(way.tags['width'] ?? way.tags['est_width'] ?? '0')
  const explicitWidth = rawWidth > 0 && !isNaN(rawWidth) ? Math.max(3.2, rawWidth) : undefined

  return {
    id: way.id,
    highway: normalizeHighwayType(highway),
    ...(name !== undefined ? { name } : {}),
    lanes: normalizeLanes(way.tags['lanes'], highway, isOneway, isLink),
    ...(lanesForward !== undefined ? { lanesForward } : {}),
    ...(lanesBackward !== undefined ? { lanesBackward } : {}),
    ...(isLink ? { isLink: true } : {}),
    ...(maxSpeed !== undefined ? { maxSpeed } : {}),
    ...(surface !== undefined ? { surface } : {}),
    ...(isRoundabout ? { isRoundabout: true } : {}),
    bridge: isBridge || isTunnel,
    tunnel: false,
    layer,
    elevationMode,
    ...(bridgeHeight !== undefined ? { bridgeHeight } : {}),
    sidewalkMode,
    ...(cycleway !== undefined ? { cycleway } : {}),
    ...(isOneway ? { oneway: true } : {}),
    ...(parkingLane !== undefined ? { parkingLane } : {}),
    ...(hasBusLane ? { hasBusLane: true } : {}),
    ...(isLit ? { lit: true } : {}),
    ...(explicitWidth !== undefined ? { explicitWidth } : {}),
    points,
  }
}

/** Type-specific default height fallbacks (metres) */
/** Type-specific default height fallbacks (metres) */
const BUILDING_TYPE_HEIGHTS: Partial<Record<BuildingType, number>> = {
  house: 6,
  detached: 6,
  semidetached_house: 7,
  terrace: 8,
  apartments: 18, // 5-6 storey residential apartment building (typical Paris/European)
  bungalow: 4,
  hut: 3,
  cabin: 3.5,
  shed: 3.2,
  kiosk: 3,
  garage: 3,
  garages: 3,
  carport: 2.8,
  warehouse: 9,
  industrial: 8,
  factory: 10,
  commercial: 14,
  retail: 8,
  office: 24,
  supermarket: 6,
  hotel: 20,
  hospital: 22,
  clinic: 12,
  school: 10,
  university: 16,
  kindergarten: 5,
  church: 18,
  cathedral: 32,
  chapel: 10,
  mosque: 16,
  temple: 14,
  synagogue: 14,
  train_station: 12,
  stadium: 22,
  sports_hall: 9,
  fire_station: 9,
  police: 14,
  townhall: 16,
  courthouse: 18,
  government: 18,
  civic: 15,
  public: 14,
  service: 5,
  parking: 14,
  hangar: 11,
  farm: 6,
  farm_auxiliary: 5,
  barn: 7,
  stable: 4.5,
  greenhouse: 4.5,
  roof: 3.5,
  monument: 15,
  castle: 25,
  manor: 12,
  ruins: 3.5,
  restaurant: 8,
  bank: 12,
  yes: 8,
}

const NAMED_COLOURS: Record<string, string> = {
  white: '#f5f5f5',
  snow: '#fffafa',
  ivory: '#fffff0',
  cream: '#fffdd0',
  lightgrey: '#d3d3d3',
  lightgray: '#d3d3d3',
  silver: '#c0c0c0',
  grey: '#808080',
  gray: '#808080',
  darkgrey: '#505050',
  darkgray: '#505050',
  black: '#1e1e1e',
  charcoal: '#36454f',
  slate: '#5c6b73',
  red: '#a93226',
  darkred: '#78281f',
  crimson: '#b03a2e',
  maroon: '#641e16',
  brown: '#795548',
  saddlebrown: '#6d4c41',
  sienna: '#8d6e63',
  chocolate: '#5d4037',
  terracotta: '#b85d38',
  beige: '#e8dcba',
  tan: '#d2b48c',
  khaki: '#c3b091',
  yellow: '#e5b638',
  gold: '#d4af37',
  orange: '#d35400',
  darkorange: '#ba4a00',
  green: '#27ae60',
  darkgreen: '#1e8449',
  forestgreen: '#196f3d',
  olive: '#7d6608',
  copper: '#528f78',
  zinc: '#586472',
  blue: '#2980b9',
  navy: '#1b4f72',
  darkblue: '#154360',
  lightblue: '#85c1e9',
  teal: '#117864',
  cyan: '#138d75',
}

function parseCssColour(raw: string | undefined): string | undefined {
  if (!raw) return undefined
  const cleaned = raw.trim().toLowerCase()
  if (NAMED_COLOURS[cleaned]) return NAMED_COLOURS[cleaned]
  // Accept both "#rrggbb" and plain 6-hex "rrggbb"
  if (/^#[0-9a-fA-F]{3,6}$/.test(cleaned)) return cleaned
  if (/^[0-9a-fA-F]{6}$/.test(cleaned)) return `#${cleaned}`
  return undefined
}

function normalizeRoofShape(raw: string | undefined): RoofShape | undefined {
  if (!raw) return undefined
  const v = raw.toLowerCase()
  const valid: RoofShape[] = ['flat', 'gabled', 'hipped', 'pyramidal', 'dome', 'round', 'mansard', 'skillion']
  if (valid.includes(v as RoofShape)) return v as RoofShape
  // Common OSM aliases / regional spellings → closest supported shape.
  // Without these, mapper-tagged roofs (pyramid, half-hipped, …) silently fell back to flat.
  switch (v) {
    case 'pyramid': return 'pyramidal'
    case 'half-hipped':
    case 'halfhipped':
    case 'half_hipped': return 'hipped'
    case 'gambrel': return 'gabled'
    case 'saltbox': return 'skillion'
    case 'cone': return 'pyramidal'
    case 'onion': return 'dome'
    default: return undefined
  }
}

function normalizeBuildingType(raw: string | undefined, tags?: OsmTags): BuildingType | undefined {
  if (tags) {
    if (tags['historic']) {
      const h = tags['historic']
      if (h === 'monument' || h === 'memorial') return 'monument'
      if (h === 'castle' || h === 'fort') return 'castle'
      if (h === 'manor') return 'manor'
      if (h === 'church') return 'church'
      if (h === 'ruins' || h === 'archaeological_site') return 'ruins'
    }

    if (tags['amenity']) {
      const a = tags['amenity']
      if (a === 'school') return 'school'
      if (a === 'university' || a === 'college') return 'university'
      if (a === 'kindergarten') return 'kindergarten'
      if (a === 'hospital') return 'hospital'
      if (a === 'clinic' || a === 'doctors' || a === 'dentist') return 'clinic'
      if (a === 'fire_station') return 'fire_station'
      if (a === 'police') return 'police'
      if (a === 'townhall') return 'townhall'
      if (a === 'courthouse') return 'courthouse'
      if (a === 'place_of_worship') {
        const rel = tags['religion']
        if (rel === 'muslim') return 'mosque'
        if (rel === 'jewish') return 'synagogue'
        if (rel === 'buddhist' || rel === 'hindu' || rel === 'shinto' || rel === 'taoist') return 'temple'
        if (tags['denomination'] === 'cathedral' || tags['building'] === 'cathedral') return 'cathedral'
        if (tags['building'] === 'chapel') return 'chapel'
        return 'church'
      }
      if (a === 'restaurant' || a === 'fast_food' || a === 'cafe' || a === 'bar' || a === 'pub') return 'restaurant'
      if (a === 'bank') return 'bank'
      if (a === 'parking') return 'parking'
      if (a === 'fuel') return tags['building'] ? 'commercial' : 'roof'
      if (a === 'theatre') return 'theatre'
      if (a === 'cinema' || a === 'arts_centre') return 'civic'
      if (a === 'library') return 'library'
      if (a === 'post_office') return 'public'
    }

    if (tags['shop']) {
      const s = tags['shop']
      if (s === 'supermarket' || s === 'mall' || s === 'department_store') return 'supermarket'
      return 'retail'
    }

    if (tags['tourism']) {
      const t = tags['tourism']
      if (t === 'hotel' || t === 'motel' || t === 'hostel' || t === 'guest_house') return 'hotel'
      if (t === 'museum') return 'museum'
      if (t === 'gallery') return 'civic'
    }

    if (tags['office']) return 'office'
    if (tags['craft']) return 'commercial'

    if (tags['leisure']) {
      const l = tags['leisure']
      if (l === 'sports_centre' || l === 'fitness_centre') return 'sports_hall'
      if (l === 'stadium') return 'stadium'
    }

    if (tags['man_made']) {
      const m = tags['man_made']
      if (m === 'works') return 'factory'
      if (m === 'silo' || m === 'storage_tank') return 'industrial'
      if (m === 'tower' || m === 'water_tower') return 'monument'
    }

    if (tags['railway'] === 'station') return 'train_station'
  }

  if (!raw) return undefined
  if (raw === 'residential') return 'apartments'
  const valid: BuildingType[] = [
    'house', 'detached', 'semidetached_house', 'terrace', 'apartments', 'bungalow',
    'hut', 'cabin', 'shed', 'kiosk', 'garage', 'garages', 'carport', 'warehouse',
    'industrial', 'factory', 'commercial', 'retail', 'office', 'supermarket', 'hotel',
    'hospital', 'clinic', 'school', 'university', 'kindergarten', 'church', 'cathedral',
    'chapel', 'mosque', 'temple', 'synagogue', 'train_station', 'stadium', 'sports_hall',
    'fire_station', 'police', 'townhall', 'courthouse', 'government', 'civic', 'public',
    'service', 'parking', 'hangar', 'farm', 'farm_auxiliary', 'barn', 'stable',
    'greenhouse', 'roof', 'monument', 'castle', 'manor', 'ruins', 'restaurant', 'bank',
    'library', 'museum', 'theatre', 'fuel', 'charging_station', 'yes',
  ]
  return valid.includes(raw as BuildingType) ? (raw as BuildingType) : 'yes'
}

export function normalizeBuilding(way: RawOsmWay): Building | null {
  if (!isWantedBuilding(way.tags)) return null
  const footprint = lonLatArrayToWorld(way.coords)
  if (footprint.length < 3) return null

  const buildingTag = way.tags['building'] ?? way.tags['building:part'] ?? (way.tags['historic'] ? 'yes' : undefined)
  const buildingType = normalizeBuildingType(buildingTag, way.tags)
  const levels = parseInt(way.tags['building:levels'] ?? '0', 10) || 0
  const minLevel = parseInt(way.tags['building:min_level'] ?? '0', 10) || 0
  const heightTag = parseFloat(way.tags['height'] ?? '0')
  const minHeightTag = parseFloat(way.tags['min_height'] ?? '0')
  const typeDefaultHeight = buildingType ? (BUILDING_TYPE_HEIGHTS[buildingType] ?? 8) : 8
  const floorH = (buildingType === 'office' || buildingType === 'commercial' || buildingType === 'hotel') ? 3.6 : DEFAULT_FLOOR_HEIGHT
  const height = heightTag > 0
    ? heightTag
    : levels > 0
      ? levels * floorH
      : typeDefaultHeight

  const minHeight = minHeightTag > 0
    ? minHeightTag
    : minLevel > 0
      ? minLevel * floorH
      : undefined

  const colour = parseCssColour(way.tags['building:colour'] ?? way.tags['colour'])
  const roofColour = parseCssColour(way.tags['roof:colour'])
  const roofShape = normalizeRoofShape(way.tags['roof:shape'])
  const roofLevels = parseInt(way.tags['roof:levels'] ?? '0', 10) || undefined
  const rawRoofHeight = parseFloat(way.tags['roof:height'] ?? '0')
  const roofHeight = rawRoofHeight > 0
    ? rawRoofHeight
    : roofLevels
      ? roofLevels * 2.5
      : undefined
  const material = way.tags['building:material'] ?? way.tags['material']
  const roofMaterial = way.tags['roof:material']
  const roofOrientationRaw = way.tags['roof:orientation']
  const roofOrientation = roofOrientationRaw === 'across' ? 'across' : (roofOrientationRaw === 'along' ? 'along' : undefined)
  const name = way.tags['name']
  const brand = way.tags['brand'] ?? way.tags['operator']

  const isPart = Boolean(way.tags['building:part'] && way.tags['building:part'] !== 'no')
  const source = way.tags['source']

  return {
    id: way.id,
    footprint,
    height,
    levels: levels || Math.round(height / floorH),
    ...(minHeight !== undefined ? { minHeight } : {}),
    ...(buildingType ? { buildingType } : {}),
    ...(material ? { material } : {}),
    ...(colour ? { colour } : {}),
    ...(roofShape ? { roofShape } : {}),
    ...(roofMaterial ? { roofMaterial } : {}),
    ...(roofColour ? { roofColour } : {}),
    ...(roofHeight !== undefined ? { roofHeight } : {}),
    ...(roofOrientation ? { roofOrientation } : {}),
    ...(roofLevels !== undefined ? { roofLevels } : {}),
    ...(name !== undefined ? { name } : {}),
    ...(brand !== undefined ? { brand } : {}),
    ...(isPart ? { isPart: true } : {}),
    ...(source ? { source } : {}),
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
  river: 90,
  canal: 26,
  stream: 6,
  drain: 3,
  ditch: 3,
  tidal_channel: 20,
  dock: 50,
  lake: 60,
  basin: 45,
  water: 35,
}

export function normalizeWaterway(way: RawOsmWay): Waterway | null {
  // Exclude subterranean aqueducts, underground culverts, buried rivers, and covered canals
  if (way.tags['tunnel'] && way.tags['tunnel'] !== 'no') return null
  if (way.tags['covered'] === 'yes') return null
  if (way.tags['location'] === 'underground') return null
  const layer = parseInt(way.tags['layer'] ?? '0', 10)
  if (layer < 0) return null

  const waterwayTag = way.tags['waterway']
  // Exclude roadside storm drains and ditches (not major open surface water features)
  if (waterwayTag === 'drain' || waterwayTag === 'ditch') return null

  const naturalTag = way.tags['natural']
  const waterSubTag = way.tags['water']
  const landuseTag = way.tags['landuse']

  // Determine if this is water
  let type: WaterwayType = 'water'

  if (waterwayTag === 'riverbank' || naturalTag === 'water' || landuseTag === 'basin' || landuseTag === 'reservoir' || waterSubTag) {
    if (waterSubTag === 'river' || waterwayTag === 'riverbank') type = 'river'
    else if (waterSubTag === 'canal' || waterwayTag === 'canal') type = 'canal'
    else if (waterSubTag === 'lake' || waterSubTag === 'pond' || naturalTag === 'water') type = 'lake'
    else if (landuseTag === 'basin' || waterSubTag === 'basin' || landuseTag === 'reservoir' || waterSubTag === 'reservoir') type = 'basin'
    else type = 'water'
  } else if (waterwayTag) {
    if (['river', 'stream', 'canal', 'dock'].includes(waterwayTag)) {
      type = waterwayTag as WaterwayType
    } else if (['dock', 'lock', 'tidal_channel'].includes(waterwayTag)) {
      type = 'dock'
    } else {
      type = 'water'
    }
  } else {
    return null
  }

  const coords = way.coords
  if (coords.length < 2) return null

  // A way is ONLY a polygon if it is genuinely a closed loop (>= 4 coords, first === last)
  let isPolygon = false
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
  let width = widthTag > 0 ? widthTag : (WATERWAY_WIDTHS[type] ?? 15)

  const name = way.tags['name']
  // If it's a major famous river like La Seine, give it realistic Parisian river width (120-140m)
  if (name && /seine/i.test(name)) {
    width = Math.max(width, 130)
    type = 'river'
  }

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
  const amenity = way.tags['amenity']

  let type: ParkType = 'park'
  if (leisure === 'garden') type = 'garden'
  else if (leisure === 'pitch') type = 'pitch'
  else if (leisure === 'swimming_pool') type = 'recreation' // pool — blue rectangle
  else if (landuse === 'grass' || landuse === 'village_green' || landuse === 'meadow') type = 'grass'
  else if (landuse === 'forest' || natural === 'wood') type = 'forest'
  else if (natural === 'scrub' || natural === 'heath') type = 'scrub'
  else if (natural === 'beach' || natural === 'sand') type = 'beach'
  else if (natural === 'cliff') type = 'cliff'
  else if (landuse === 'cemetery' || amenity === 'grave_yard') type = 'cemetery'
  else if (landuse === 'farmland' || landuse === 'farmyard' || landuse === 'orchard' || landuse === 'vineyard' || landuse === 'allotments') type = 'farmland'
  else if (landuse === 'parking') type = 'parking_lot'
  else if (natural === 'grassland' || natural === 'wetland' || natural === 'marsh') type = 'grass'
  else if (leisure === 'recreation_ground' || leisure === 'playground' || leisure === 'dog_park' || leisure === 'common') type = 'recreation'
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
