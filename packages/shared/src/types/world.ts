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
  | 'yes'

/** OSM roof:shape values. */
export type RoofShape = 'flat' | 'gabled' | 'hipped' | 'pyramidal' | 'dome' | 'round' | 'mansard' | 'skillion'

export type Building = {
  id: string
  /** Footprint polygon (world-space). Last point ≠ first point (open ring). */
  footprint: WorldPosition[]
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

export type PointOfInterest = {
  id: string
  category: PoiCategory
  name?: string
  position: WorldPosition
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

// ─── Railway ─────────────────────────────────────────────────────────────────

export type RailwayType = 'rail' | 'tram' | 'light_rail' | 'subway' | 'monorail' | 'narrow_gauge'

export type Railway = {
  id: string
  type: RailwayType
  name?: string
  points: WorldPosition[]
}

// ─── Barrier ─────────────────────────────────────────────────────────────────

export type BarrierType = 'wall' | 'fence' | 'hedge' | 'guard_rail'

export type Barrier = {
  id: string
  type: BarrierType
  height?: number
  points: WorldPosition[]
}

// ─── Chunk ───────────────────────────────────────────────────────────────────

export type WorldChunk = {
  id: ChunkId
  roads: Road[]
  buildings: Building[]
  pointsOfInterest: PointOfInterest[]
  waterways: Waterway[]
  parks: Park[]
  railways: Railway[]
  barriers?: Barrier[]
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
