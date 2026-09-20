/**
 * RoadMeshGenerator — Burnout Paradise arcade racing aesthetic.
 *
 * This file now re-exports from the modular road/ folder structure.
 * The original monolithic file has been split into multiple focused modules.
 */

export { RoadMeshGenerator } from './road/road-mesh-generator.js'
export type { RoadGenerateOptions, RoadPortion } from './road/ground-road.js'
export type { JunctionInfo, RoadEndJunction, JunctionArm, RoadObstacleSeg } from './road/junction.js'
export type { JunctionCorners, TrimSeg } from './road/junction-corners.js'
export type { PolylineNormal, EndNormals, Pt, Vec2 } from './road/geometry.js'
export type { ElevationProfile } from './road/elevation.js'

// Re-export all materials, utilities, and builders
export * from './road/index.js'