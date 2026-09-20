/**
 * Live Chunk Generator — composes all sub-generators for procedural city chunks.
 */

import {
  chunkToWorld,
  chunkCenter,
  worldToGeo,
  CHUNK_SIZE,
  type ChunkId,
  type GeoPosition,
} from '@world-drive/math'
import type { WorldChunk, Road, Building, PointOfInterest } from '@world-drive/shared'
import { getLocalizedStreetNames, StreetNameSet } from './StreetNames.js'
import { generateRoadNetwork } from './RoadNetwork.js'
import { createBlockLayout, generateBuilding, BuildingBlock } from './BuildingGenerator.js'
import { generateLandmarks } from './LandmarkGenerator.js'
import { generatePois } from './PoiGenerator.js'

export function generateLiveChunk(chunkId: ChunkId, origin: GeoPosition): WorldChunk {
  const originWorld = chunkToWorld(chunkId)
  const centerWorld = chunkCenter(chunkId)
  const centerGeo = worldToGeo(centerWorld)

  const minX = originWorld.x
  const maxX = minX + CHUNK_SIZE
  const minZ = originWorld.z
  const maxZ = minZ + CHUNK_SIZE

  const streetNames = getLocalizedStreetNames(centerGeo, chunkId)

  // 1. Generate Road Network
  const roads = generateRoadNetwork(chunkId, minX, maxX, minZ, maxZ, streetNames)

  // 2. Generate Buildings
  const buildings: Building[] = []
  let bldCounter = 0

  const blockLayout = createBlockLayout(minX, maxX, minZ, maxZ)

  for (let col = 0; col < 5; col++) {
    for (let row = 0; row < 5; row++) {
      const xs = blockLayout.xSpans[col]!
      const zs = blockLayout.zSpans[row]!
      const blockWidth = xs.max - xs.min
      const blockDepth = zs.max - zs.min

      const bSeed = blockSeed(chunkId, col, row)

      const numSubDivX = blockWidth > 80 ? 3 : 2
      const numSubDivZ = blockDepth > 80 ? 3 : 2
      const stepX = blockWidth / numSubDivX
      const stepZ = blockDepth / numSubDivZ

      for (let sx = 0; sx < numSubDivX; sx++) {
        for (let sz = 0; sz < numSubDivZ; sz++) {
          const bMinX = xs.min + sx * stepX
          const bMaxX = xs.min + (sx + 1) * stepX
          const bMinZ = zs.min + sz * stepZ
          const bMaxZ = zs.min + (sz + 1) * stepZ

          const building = generateBuilding({
            chunkId,
            col,
            row,
            sx,
            sz,
            numSubDivX,
            numSubDivZ,
            bMinX,
            bMaxX,
            bMinZ,
            bMaxZ,
            bldCounter: bldCounter++,
            blockSeed: bSeed,
          })

          if (building) {
            buildings.push(building)
          }
        }
      }
    }
  }

  // 3. Generate POIs
  const pois = generatePois(chunkId, minX, minZ, streetNames)

  // 4. Generate Landmarks
  const landmarkSeed = Math.abs((chunkId.x * 12345) ^ (chunkId.z * 67890))
  generateLandmarks({
    chunkId,
    minX,
    maxX,
    minZ,
    maxZ,
    landmarkSeed,
    buildings,
  })

  return {
    id: chunkId,
    roads,
    buildings,
    pointsOfInterest: pois,
    waterways: [],
    parks: [],
  }
}

function blockSeed(chunkId: ChunkId, col: number, row: number): number {
  return Math.abs(
    (chunkId.x * 73856093) ^
    (chunkId.z * 19349663) ^
    (col * 83492791) ^
    (row * 294967297)
  )
}