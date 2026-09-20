/**
 * Building Generator — city blocks with Haussmannian architecture.
 */

import type { Building, BuildingType } from '@world-drive/shared'
import type { ChunkId } from '@world-drive/math'

export interface BlockSpan { min: number; max: number }

export interface BuildingBlock {
  xSpans: BlockSpan[]
  zSpans: BlockSpan[]
  minX: number
  minZ: number
  maxX: number
  maxZ: number
}

export function createBlockLayout(
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
): BuildingBlock {
  const xSpans: BlockSpan[] = [
    { min: minX, max: minX + 62.5 - 4 },
    { min: minX + 62.5 + 4, max: minX + 187.5 - 4 },
    { min: minX + 187.5 + 4, max: minX + 312.5 - 7 },
    { min: minX + 312.5 + 7, max: minX + 437.5 - 4 },
    { min: minX + 437.5 + 4, max: maxX },
  ]

  const zSpans: BlockSpan[] = [
    { min: minZ, max: minZ + 62.5 - 4 },
    { min: minZ + 62.5 + 4, max: minZ + 187.5 - 7 },
    { min: minZ + 187.5 + 7, max: minZ + 312.5 - 5 },
    { min: minZ + 312.5 + 5, max: minZ + 437.5 - 4 },
    { min: minZ + 437.5 + 4, max: maxZ },
  ]

  return { xSpans, zSpans, minX, minZ, maxX, maxZ }
}

function blockSeed(chunkId: ChunkId, col: number, row: number): number {
  return Math.abs(
    (chunkId.x * 73856093) ^
    (chunkId.z * 19349663) ^
    (col * 83492791) ^
    (row * 294967297)
  )
}

function isInteriorBlock(col: number, row: number): boolean {
  return col >= 1 && col <= 3 && row >= 1 && row <= 3
}

function isCourtyardBlock(col: number, row: number, numSubDivX: number, numSubDivZ: number, sx: number, sz: number, subSeed: number): boolean {
  const isInterior = isInteriorBlock(col, row)
  const isCenter = sx === 1 && sz === 1 && numSubDivX === 3 && numSubDivZ === 3
  return isInterior && isCenter && (subSeed % 3 === 0)
}

function buildingHeight(isTower: boolean, subSeed: number): number {
  return isTower ? 48 + (subSeed % 24) : 21 + (subSeed % 14)
}

function buildingLevels(height: number): number {
  return Math.max(5, Math.round(height / 3.3))
}

export type BuildingKind =
  | 'apartments' | 'house' | 'terrace' | 'commercial' | 'retail' | 'office'
  | 'hotel' | 'restaurant' | 'bank' | 'supermarket' | 'garage' | 'warehouse'
  | 'service' | 'church' | 'cathedral' | 'school' | 'university'
  | 'hospital' | 'clinic' | 'train_station' | 'fire_station' | 'police'
  | 'townhall' | 'government' | 'stadium' | 'sports_hall' | 'mosque'
  | 'temple' | 'synagogue' | 'library' | 'museum' | 'theatre'
  | 'monument' | 'castle' | 'manor' | 'parking' | 'fuel' | 'charging_station'
  | 'farm' | 'barn' | 'stable' | 'greenhouse' | 'hangar' | 'carport'
  | 'kiosk' | 'shed' | 'ruins' | 'industrial' | 'factory'

const BUILDING_TYPES: BuildingKind[] = [
  'apartments', 'house', 'terrace', 'commercial', 'retail', 'office',
  'hotel', 'restaurant', 'bank', 'supermarket', 'garage', 'warehouse',
  'service', 'church', 'cathedral', 'school', 'university',
  'hospital', 'clinic', 'train_station', 'fire_station', 'police',
  'townhall', 'government', 'stadium', 'sports_hall', 'mosque',
  'temple', 'synagogue', 'library', 'museum', 'theatre',
  'monument', 'castle', 'manor', 'parking', 'fuel', 'charging_station',
  'farm', 'barn', 'stable', 'greenhouse', 'hangar', 'carport',
  'kiosk', 'shed', 'ruins', 'industrial', 'factory',
]

function pickBuildingType(
  isTower: boolean,
  isCorner: boolean,
  isInterior: boolean,
  isCourtyard: boolean,
  typeSeed: number,
): BuildingKind {
  if (isTower) {
    if (typeSeed < 30) return 'hotel'
    if (typeSeed < 55) return 'office'
    if (typeSeed < 70) return 'apartments'
    if (typeSeed < 80) return 'bank'
    if (typeSeed < 88) return 'townhall'
    return 'commercial'
  }

  if (isCorner) {
    if (typeSeed < 25) return 'apartments'
    if (typeSeed < 45) return 'commercial'
    if (typeSeed < 60) return 'retail'
    if (typeSeed < 70) return 'hotel'
    if (typeSeed < 80) return 'restaurant'
    if (typeSeed < 88) return 'bank'
    return 'office'
  }

  if (isInterior && isCourtyard) {
    if (typeSeed < 50) return 'apartments'
    if (typeSeed < 70) return 'service'
    if (typeSeed < 85) return 'garage'
    return 'warehouse'
  }

  // Standard block buildings
  if (typeSeed < 45) return 'apartments'
  if (typeSeed < 60) return 'house'
  if (typeSeed < 70) return 'terrace'
  if (typeSeed < 78) return 'commercial'
  if (typeSeed < 85) return 'retail'
  if (typeSeed < 90) return 'office'
  if (typeSeed < 95) return 'supermarket'
  return 'garage'
}

const PAN = 3.5

function cornerFootprint(
  bMinX: number,
  bMaxX: number,
  bMinZ: number,
  bMaxZ: number,
  cornerType: 'se' | 'sw' | 'ne' | 'nw',
): Array<{ x: number; y: number; z: number }> {
  switch (cornerType) {
    case 'se': // South-East
      return [
        { x: bMinX, y: 0, z: bMinZ },
        { x: bMaxX, y: 0, z: bMinZ },
        { x: bMaxX, y: 0, z: bMaxZ - PAN },
        { x: bMaxX - PAN, y: 0, z: bMaxZ },
        { x: bMinX, y: 0, z: bMaxZ },
      ]
    case 'sw': // South-West
      return [
        { x: bMinX, y: 0, z: bMinZ },
        { x: bMaxX, y: 0, z: bMinZ },
        { x: bMaxX, y: 0, z: bMaxZ },
        { x: bMinX + PAN, y: 0, z: bMaxZ },
        { x: bMinX, y: 0, z: bMaxZ - PAN },
      ]
    case 'ne': // North-East
      return [
        { x: bMinX, y: 0, z: bMinZ },
        { x: bMaxX - PAN, y: 0, z: bMinZ },
        { x: bMaxX, y: 0, z: bMinZ + PAN },
        { x: bMaxX, y: 0, z: bMaxZ },
        { x: bMinX, y: 0, z: bMaxZ },
      ]
    case 'nw': // North-West
      return [
        { x: bMinX, y: 0, z: bMinZ },
        { x: bMaxX, y: 0, z: bMinZ },
        { x: bMaxX, y: 0, z: bMaxZ },
        { x: bMinX, y: 0, z: bMaxZ },
        { x: bMinX, y: 0, z: bMinZ + PAN },
        { x: bMinX + PAN, y: 0, z: bMinZ },
      ]
  }
}

function standardFootprint(
  bMinX: number,
  bMaxX: number,
  bMinZ: number,
  bMaxZ: number,
): Array<{ x: number; y: number; z: number }> {
  return [
    { x: bMinX, y: 0, z: bMinZ },
    { x: bMaxX, y: 0, z: bMinZ },
    { x: bMaxX, y: 0, z: bMaxZ },
    { x: bMinX, y: 0, z: bMaxZ },
  ]
}

interface BuildingParams {
  chunkId: ChunkId
  col: number
  row: number
  sx: number
  sz: number
  numSubDivX: number
  numSubDivZ: number
  bMinX: number
  bMaxX: number
  bMinZ: number
  bMaxZ: number
  bldCounter: number
  blockSeed: number
}

export function generateBuilding(params: BuildingParams): Building | null {
  const { chunkId, col, row, sx, sz, numSubDivX, numSubDivZ, bMinX, bMaxX, bMinZ, bMaxZ, bldCounter, blockSeed } = params

  const subSeed = Math.abs(blockSeed ^ (sx * 31) ^ (sz * 79))

  // Skip courtyard center occasionally
  if (isCourtyardBlock(col, row, numSubDivX, numSubDivZ, sx, sz, subSeed)) {
    return null
  }

  const isCorner = (sx === 0 || sx === numSubDivX - 1) && (sz === 0 || sz === numSubDivZ - 1)
  const isTower = isCorner && (subSeed % 13 === 0)
  const isInterior = isInteriorBlock(col, row)
  const isCourtyard = isInterior && (sx === 1 && sz === 1 && numSubDivX === 3 && numSubDivZ === 3)

  const height = buildingHeight(isTower, subSeed)
  const levels = buildingLevels(height)
  const typeSeed = subSeed % 100
  const buildingType = pickBuildingType(isTower, isCorner, isInterior, isCourtyard, typeSeed)

  let footprint: Array<{ x: number; y: number; z: number }>

  if (isCorner) {
    if (sx === numSubDivX - 1 && sz === numSubDivZ - 1) {
      footprint = cornerFootprint(bMinX, bMaxX, bMinZ, bMaxZ, 'se')
    } else if (sx === 0 && sz === numSubDivZ - 1) {
      footprint = cornerFootprint(bMinX, bMaxX, bMinZ, bMaxZ, 'sw')
    } else if (sx === numSubDivX - 1 && sz === 0) {
      footprint = cornerFootprint(bMinX, bMaxX, bMinZ, bMaxZ, 'ne')
    } else {
      footprint = cornerFootprint(bMinX, bMaxX, bMinZ, bMaxZ, 'nw')
    }
  } else {
    footprint = standardFootprint(bMinX, bMaxX, bMinZ, bMaxZ)
  }

  return {
    id: `bld_${chunkId.x}_${chunkId.z}_${bldCounter}`,
    footprint,
    height,
    levels,
    buildingType,
  }
}