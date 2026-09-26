import type { WorldPosition } from '@world-drive/math'
import type { ChunkId } from '@world-drive/math'

// ─── Road ────────────────────────────────────────────────────────────────────

export type HighwayType =
  | 'motorway'
  | 'trunk'
  | 'primary'
  | 'secondary'
  | 'tertiary'
  | 'residential'
  | 'living_street'
  | 'service'
  | 'track'
  | 'path'
  | 'footway'
  | 'cycleway'
  | 'pedestrian'
  | 'steps'
  | 'unclassified'

/** OSM surface tag values that affect visual rendering. */
export type RoadSurface =
  | 'asphalt'
  | 'concrete'
  | 'cobblestone'
  | 'sett'
  | 'paved'
  | 'unpaved'
  | 'gravel'
  | 'fine_gravel'
  | 'dirt'
  | 'ground'
  | 'sand'

export type RoadElevationMode = 'ground' | 'bridge' | 'tunnel'

export type Road = {
  id: string
  highway: HighwayType
  name?: string
  lanes: number
  lanesForward?: number
  lanesBackward?: number
  maxSpeed?: number
  /** Whether this is a slip road / interchange ramp (_link tag in OSM). */
  isLink?: boolean
  /** Whether this is a roundabout (junction=roundabout). */
  isRoundabout?: boolean
  /** Road surface material from OSM surface tag. */
  surface?: RoadSurface
  /** Whether this segment has bridge tag. */
  bridge: boolean
  /** Whether this segment has tunnel tag. */
  tunnel: boolean
  /** OSM layer relative vertical level (-1 = tunnel, 0 = ground, 1 = overpass/bridge). */
  layer: number
  /** Elevation classification according to pont.txt (ground, bridge, tunnel). */
  elevationMode: RoadElevationMode
  /** Estimated or calculated vertical clearance/height for bridges (metres). */
  bridgeHeight?: number
  /** Sidewalk presence mode: both, left, right, or none (from sidewalk=*). */
  sidewalkMode?: 'both' | 'left' | 'right' | 'none'
  /** Cycleway infrastructure associated with road (from cycleway=*). */
  cycleway?: 'lane' | 'track' | 'shared_lane' | 'both' | 'right' | 'left' | 'none'
  /** Whether the road is one-way (from oneway=yes). */
  oneway?: boolean
  /** Roadside parking bays along the curb (from parking:lane=*). */
  parkingLane?: 'both' | 'right' | 'left' | 'none'
  /** Whether road has a dedicated bus lane (from bus:lanes=*). */
  hasBusLane?: boolean
  /** Whether road has street lighting (from lit=yes). */
  lit?: boolean
  /** Explicit roadway width measured in metres from OSM (width=* or est_width=*). */
  explicitWidth?: number
  /** Ordered list of world-space points along the road centre-line. */
  points: WorldPosition[]
  /** Crossing / traffic-signal nodes on this way (from OSM node tags). */
  crossings?: RoadCrossing[]
}

// ─── Building ────────────────────────────────────────────────────────────────

/** OSM building type values that affect visual rendering. */
export type BuildingType =
  | 'house'
  | 'detached'
  | 'semidetached_house'
  | 'terrace'
  | 'apartments'
  | 'bungalow'
  | 'hut'
  | 'cabin'
  | 'shed'
  | 'kiosk'
  | 'garage'
  | 'garages'
  | 'carport'
  | 'warehouse'
  | 'industrial'
  | 'factory'
  | 'commercial'
  | 'retail'
  | 'office'
  | 'supermarket'
  | 'hotel'
  | 'motel'
  | 'hostel'
  | 'guest_house'
  | 'hospital'
  | 'clinic'
  | 'school'
  | 'university'
  | 'kindergarten'
  | 'church'
  | 'cathedral'
  | 'chapel'
  | 'mosque'
  | 'temple'
  | 'synagogue'
  | 'train_station'
  | 'stadium'
  | 'sports_hall'
  | 'fire_station'
  | 'police'
  | 'townhall'
  | 'courthouse'
  | 'government'
  | 'civic'
  | 'public'
  | 'service'
  | 'parking'
  | 'hangar'
  | 'farm'
  | 'farm_auxiliary'
  | 'barn'
  | 'stable'
  | 'greenhouse'
  | 'roof'
  | 'monument'
  | 'castle'
  | 'manor'
  | 'ruins'
  | 'restaurant'
  | 'bank'
  | 'library'
  | 'museum'
  | 'theatre'
  | 'fuel'
  | 'charging_station'
  | 'yes'

/** OSM roof:shape values. */
export type RoofShape = 'flat' | 'gabled' | 'hipped' | 'pyramidal' | 'dome' | 'round' | 'mansard' | 'skillion'

export type Building = {
  id: string
  /** Footprint polygon (world-space). Last point ≠ first point (open ring). */
  footprint: WorldPosition[]
  /** Inner courtyards (open rings), from multipolygon relations. */
  holes?: WorldPosition[][]
  height: number
  levels: number
  minHeight?: number
  /** OSM building=* value for type-specific rendering. */
  buildingType?: BuildingType
  material?: string
  /** OSM building:colour or colour tag (CSS hex string, e.g. "#8a867e"). */
  colour?: string
  /** OSM roof:shape tag. */
  roofShape?: RoofShape
  roofMaterial?: string
  /** OSM roof:colour tag. */
  roofColour?: string
  roofHeight?: number
  roofOrientation?: 'along' | 'across'
  roofLevels?: number
  name?: string
  brand?: string
  /** Whether this element is an OSM building:part (3D sub-part of a building). */
  isPart?: boolean
  /** OSM source tag (e.g. cadastre-dgi-fr). */
  source?: string
}

// ─── Point of Interest ───────────────────────────────────────────────────────

export type PoiCategory =
  | 'fuel'
  | 'parking'
  | 'restaurant'
  | 'hospital'
  | 'police'
  | 'shop'
  | 'other'

/** What a tagged OSM node represents, for rendering (street level). */
export type PoiKind =
  | 'shop'
  | 'amenity'
  | 'office'
  | 'craft'
  | 'tourism'
  | 'tree'
  | 'street_lamp'
  | 'bench'
  | 'bollard'
  | 'bicycle_parking'
  | 'waste_basket'
  | 'bus_stop'
  | 'subway_entrance'
  | 'fire_hydrant'
  | 'post_box'
  | 'housenumber'
  | 'entrance'
  | 'advertising'
  | 'fountain'
  | 'crossing'
  | 'traffic_signals'
  | 'other'

export type PointOfInterest = {
  id: string
  category: PoiCategory
  name?: string
  position: WorldPosition
  /** Street-level kind (shop, tree, bench…). Absent on legacy/prebuilt data. */
  kind?: PoiKind
  /** Raw OSM tags of the node (decoded). */
  tags?: Record<string, string>
  brand?: string
}

/** A pedestrian crossing / traffic signal node lying on a road way. */
export type RoadCrossing = {
  nodeId: string
  position: WorldPosition
  /** Index of the node in the way's node list (best effort; snap by position). */
  index: number
  /** highway=traffic_signals or crossing=traffic_signals */
  signals: boolean
  /** crossing:markings / crossing value (zebra, lines, no, uncontrolled, marked…) */
  markings?: string
}

// ─── Waterway & Water Areas ───────────────────────────────────────────────────

export type WaterwayType = 'river' | 'stream' | 'canal' | 'drain' | 'lake' | 'basin' | 'dock' | 'water'

export type Waterway = {
  id: string
  type: WaterwayType
  name?: string
  /** Visual width in metres (for linear waterways) or 0 for polygons. */
  width: number
  points: WorldPosition[]
  /** True when the points form a closed polygon surface (e.g. natural=water, riverbank). */
  isPolygon?: boolean
}

// ─── Parks & Green Spaces ───────────────────────────────────────────────────

export type ParkType =
  | 'park'
  | 'garden'
  | 'grass'
  | 'forest'
  | 'recreation'
  | 'cemetery'
  | 'farmland'
  | 'parking_lot'
  | 'pitch'
  | 'beach'
  | 'cliff'
  | 'scrub'

export type Park = {
  id: string
  type: ParkType
  name?: string
  polygon: WorldPosition[]
}

// ─── Chunk ───────────────────────────────────────────────────────────────────

export type WorldChunk = {
  id: ChunkId
  roads: Road[]
  buildings: Building[]
  pointsOfInterest: PointOfInterest[]
  waterways: Waterway[]
  parks: Park[]
}


// ─── Road graph ──────────────────────────────────────────────────────────────

export type RoadNode = {
  id: string
  position: WorldPosition
}

export type RoadEdge = {
  id: string
  from: string
  to: string
  length: number
  speedLimit: number
  lanes: number
}

export type RoadGraph = {
  nodes: Map<string, RoadNode>
  edges: Map<string, RoadEdge>
  /** Adjacency: nodeId → edgeId[] */
  adjacency: Map<string, string[]>
}
