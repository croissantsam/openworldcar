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
  | 'service'
  | 'path'
  | 'footway'
  | 'cycleway'
  | 'unclassified'

export type Road = {
  id: string
  highway: HighwayType
  name?: string
  lanes: number
  maxSpeed?: number
  /** Whether this segment has bridge tag. */
  bridge: boolean
  /** Whether this segment has tunnel tag. */
  tunnel: boolean
  /** Ordered list of world-space points along the road centre-line. */
  points: WorldPosition[]
}

// ─── Building ────────────────────────────────────────────────────────────────

export type Building = {
  id: string
  /** Footprint polygon (world-space). Last point ≠ first point (open ring). */
  footprint: WorldPosition[]
  height: number
  levels: number
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

export type ParkType = 'park' | 'garden' | 'grass' | 'forest' | 'recreation'

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
