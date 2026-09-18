/**
 * StorefrontGenerator — real shops on real facades: ground-floor storefront
 * band with the shop's real name, house-number plaques, street-name plaques.
 *
 * Called from ChunkLoader.buildGroupIncremental() for each chunk (or delivery
 * delta) with that chunk's POIs, buildings and roads.
 */

import * as THREE from 'three'
import type { PointOfInterest, Road, Building } from '@world-drive/shared'

export class StorefrontGenerator {
  static generate(_pois: PointOfInterest[], _buildings: Building[], _roads: Road[]): THREE.Group | null {
    return null
  }
}
