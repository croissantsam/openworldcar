/**
 * Road Network Generator — organic road layout with curvature.
 */

import { CHUNK_SIZE } from '@world-drive/math'
import type { Road, HighwayType } from '@world-drive/shared'
import type { ChunkId } from '@world-drive/math'
import { getLocalizedStreetNames, StreetNameSet } from './StreetNames.js'

export interface RoadOffset {
  offset: number
  lanes: number
  highway: HighwayType
  name: string
  halfW: number
  speed: number
  curve: number
}

export function generateRoadNetwork(
  chunkId: ChunkId,
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
  streetNames: StreetNameSet,
): Road[] {
  const roads: Road[] = []
  const roadMargin = 4
  const seed = Math.abs((chunkId.x * 73856093) ^ (chunkId.z * 19349663))

  // North-South Roads along constant X (with subtle S-curve)
  const xRoadOffsets: RoadOffset[] = [
    { offset: 62.5, lanes: 2, highway: 'residential', name: streetNames.sec3, halfW: 3.5, speed: 30, curve: ((seed % 7) - 3) * 1.2 },
    { offset: 187.5, lanes: 2, highway: 'tertiary', name: streetNames.sec4, halfW: 4, speed: 40, curve: (((seed >> 3) % 7) - 3) * 1.0 },
    { offset: 312.5, lanes: 4, highway: 'primary', name: streetNames.mainNS, halfW: 7, speed: 50, curve: 0 },
    { offset: 437.5, lanes: 2, highway: 'residential', name: streetNames.sec3, halfW: 3.5, speed: 30, curve: (((seed >> 6) % 7) - 3) * 1.2 },
  ]

  for (let i = 0; i < xRoadOffsets.length; i++) {
    const ro = xRoadOffsets[i]!
    const lineX = minX + ro.offset
    const c = ro.curve

    roads.push({
      id: `road_ns_${i}_${chunkId.x}_${chunkId.z}`,
      highway: ro.highway,
      name: ro.name,
      lanes: ro.lanes,
      maxSpeed: ro.speed,
      bridge: false,
      tunnel: false,
      layer: 0,
      elevationMode: 'ground',
      points: [
        { x: lineX, y: 0, z: minZ - roadMargin },
        { x: lineX + c * 0.7, y: 0, z: minZ + 125 },
        { x: lineX + c, y: 0, z: minZ + 250 },
        { x: lineX + c * 0.7, y: 0, z: minZ + 375 },
        { x: lineX, y: 0, z: maxZ + roadMargin },
      ],
    })
  }

  // East-West Roads along constant Z (with subtle curvature)
  const zRoadOffsets: RoadOffset[] = [
    { offset: 62.5, lanes: 2, highway: 'residential', name: streetNames.sec1, halfW: 3.5, speed: 30, curve: (((seed >> 2) % 7) - 3) * 1.2 },
    { offset: 187.5, lanes: 4, highway: 'primary', name: streetNames.mainEW, halfW: 7, speed: 50, curve: 0 },
    { offset: 312.5, lanes: 3, highway: 'secondary', name: streetNames.sec2, halfW: 5, speed: 45, curve: (((seed >> 5) % 7) - 3) * 1.0 },
    { offset: 437.5, lanes: 2, highway: 'residential', name: streetNames.sec1, halfW: 3.5, speed: 30, curve: (((seed >> 8) % 7) - 3) * 1.2 },
  ]

  for (let j = 0; j < zRoadOffsets.length; j++) {
    const ro = zRoadOffsets[j]!
    const lineZ = minZ + ro.offset
    const c = ro.curve

    roads.push({
      id: `road_ew_${j}_${chunkId.x}_${chunkId.z}`,
      highway: ro.highway,
      name: ro.name,
      lanes: ro.lanes,
      maxSpeed: ro.speed,
      bridge: false,
      tunnel: false,
      layer: 0,
      elevationMode: 'ground',
      points: [
        { x: minX - roadMargin, y: 0, z: lineZ },
        { x: minX + 125, y: 0, z: lineZ + c * 0.7 },
        { x: minX + 250, y: 0, z: lineZ + c },
        { x: minX + 375, y: 0, z: lineZ + c * 0.7 },
        { x: maxX + roadMargin, y: 0, z: lineZ },
      ],
    })
  }

  // Diagonal Haussmannian Avenue in alternating chunks
  if ((Math.abs(chunkId.x + chunkId.z) % 2) === 0) {
    roads.push({
      id: `road_diag_${chunkId.x}_${chunkId.z}`,
      highway: 'secondary',
      name: streetNames.diagonal,
      lanes: 3,
      maxSpeed: 45,
      bridge: false,
      tunnel: false,
      layer: 0,
      elevationMode: 'ground',
      points: [
        { x: minX - roadMargin, y: 0, z: minZ + 62.5 },
        { x: minX + 125, y: 0, z: minZ + 187.5 },
        { x: minX + 250, y: 0, z: minZ + 312.5 },
        { x: minX + 375, y: 0, z: minZ + 437.5 },
        { x: maxX + roadMargin, y: 0, z: maxZ + 62.5 },
      ],
    })
  }

  return roads
}