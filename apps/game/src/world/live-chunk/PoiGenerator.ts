/**
 * POI Generator — Points of Interest (metro, cafes, etc.)
 */

import type { PointOfInterest } from '@world-drive/shared'
import type { ChunkId } from '@world-drive/math'
import { getLocalizedStreetNames, StreetNameSet } from './StreetNames.js'

export function generatePois(chunkId: ChunkId, minX: number, minZ: number, streetNames: StreetNameSet): PointOfInterest[] {
  return [
    {
      id: `poi_metro_${chunkId.x}_${chunkId.z}`,
      category: 'other',
      name: `Métro ${streetNames.mainEW.split(' ')[0]}`,
      position: { x: minX + 312.5 + 12, y: 0, z: minZ + 187.5 + 12 },
    },
    {
      id: `poi_cafe_${chunkId.x}_${chunkId.z}`,
      category: 'restaurant',
      name: `Café ${streetNames.sec1.split(' ')[0]}`,
      position: { x: minX + 312.5 - 12, y: 0, z: minZ + 187.5 - 12 },
    },
  ]
}