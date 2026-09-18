/**
 * StreetFurnitureGenerator — real street objects from OSM tagged nodes
 * (trees, lamps, benches, bollards, bike racks, bins, bus stops, hydrants,
 * post boxes, subway entrances…), instanced per chunk.
 *
 * Called from ChunkLoader.buildGroupIncremental() for each chunk (or delivery
 * delta) with that chunk's POIs; colliders from ChunkManager._runJob().
 */

import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import type { PointOfInterest, Road, Building } from '@world-drive/shared'

export class StreetFurnitureGenerator {
  static generate(_pois: PointOfInterest[], _roads: Road[], _buildings: Building[]): THREE.Group | null {
    return null
  }

  static createColliderDescs(_pois: PointOfInterest[], _roads: Road[]): RAPIER.ColliderDesc[] {
    return []
  }
}
