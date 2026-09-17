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

// ─── Chunk ───────────────────────────────────────────────────────────────────

export type WorldChunk = {
  id: ChunkId
  roads: Road[]
  buildings: Building[]
  pointsOfInterest: PointOfInterest[]
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
