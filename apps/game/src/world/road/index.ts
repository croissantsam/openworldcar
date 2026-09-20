// Materials - all materials, textures, and constants
export * from './materials.js'

// Geometry utilities
export * from './geometry.js'

// Elevation solvers
export * from './elevation.js'

// Road width computation
export * from './road-width.js'

// Junction analysis
export * from './junction.js'

// Sidewalk building
export { buildCleanSidewalk } from './sidewalk.js'

// Markings
export * from './markings.js'

// Templates
export * from './templates.js'

// Bridge builders
export * from './bridge.js'

// Tunnel builders
export * from './tunnel.js'

// Colliders
export * from './colliders.js'

// Junction corners (JunctionCorners, TrimSeg)
export * from './junction-corners.js'

// Arm asphalt geometry
export * from './arm-asphalt.js'

// Junction helpers
export * from './junction-helpers.js'

// Ground road generation
export { generateGroundPortion, type RoadPortion, type RoadGenerateOptions } from './ground-road.js'

// Main generator class
export { RoadMeshGenerator } from './road-mesh-generator.js'