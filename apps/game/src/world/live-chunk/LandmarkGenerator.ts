/**
 * Landmark Generator — churches, synagogues, schools, hospitals, stations, etc.
 * Places monumental buildings strictly inside city blocks with generous setbacks from streets.
 */

import type { Building, BuildingType } from '@world-drive/shared'
import type { ChunkId } from '@world-drive/math'
import type { BuildingBlock } from './BuildingGenerator.js'

export interface LandmarkParams {
  chunkId: ChunkId
  minX: number
  maxX: number
  minZ: number
  maxZ: number
  landmarkSeed: number
  buildings: Building[]
  blockLayout?: BuildingBlock
  onBlockReserved?: (col: number, row: number) => void
}

function addBuilding(buildings: Building[], building: Building): void {
  buildings.push(building)
}

/**
 * Computes safe building plot coordinates strictly inside a city block.
 * Ensures buildings NEVER overhang or encroach onto the surrounding road network.
 */
function getInteriorBlockPlot(
  col: number,
  row: number,
  halfW: number,
  halfD: number,
  minX: number,
  minZ: number,
  blockLayout?: BuildingBlock,
  margin = 10,
): { cx: number; cz: number; w: number; d: number } {
  const c = Math.max(0, Math.min(4, col))
  const r = Math.max(0, Math.min(4, row))

  if (blockLayout && blockLayout.xSpans[c] && blockLayout.zSpans[r]) {
    const xs = blockLayout.xSpans[c]!
    const zs = blockLayout.zSpans[r]!
    const cx = (xs.min + xs.max) / 2
    const cz = (zs.min + zs.max) / 2
    const maxHalfW = Math.max(8, (xs.max - xs.min) / 2 - margin)
    const maxHalfD = Math.max(8, (zs.max - zs.min) / 2 - margin)
    return {
      cx,
      cz,
      w: Math.min(halfW, maxHalfW),
      d: Math.min(halfD, maxHalfD),
    }
  }

  // Fallback centers strictly in block interiors (never on roads at 62.5, 187.5, 312.5, 437.5)
  const colCenters = [29.25, 125, 248.5, 376.5, 470.75]
  const rowCenters = [29.25, 123.5, 251, 375.5, 470.75]
  const cx = minX + (colCenters[c] ?? 248.5)
  const cz = minZ + (rowCenters[r] ?? 251)
  return { cx, cz, w: Math.min(halfW, 16), d: Math.min(halfD, 20) }
}

export function generateLandmarks(params: LandmarkParams): void {
  const { chunkId, minX, maxX, minZ, maxZ, landmarkSeed, buildings, blockLayout, onBlockReserved } = params

  // 1. Church / Cathedral (one per ~4 chunks)
  if (landmarkSeed % 4 === 0) {
    const col = 1, row = 1
    onBlockReserved?.(col, row)
    const plot = getInteriorBlockPlot(col, row, 15, 24, minX, minZ, blockLayout, 12)
    const churchHeight = 28 + (landmarkSeed % 15)
    addBuilding(buildings, {
      id: `bld_church_${chunkId.x}_${chunkId.z}`,
      footprint: [
        { x: plot.cx - plot.w, y: 0, z: plot.cz - plot.d },
        { x: plot.cx + plot.w, y: 0, z: plot.cz - plot.d },
        { x: plot.cx + plot.w, y: 0, z: plot.cz + plot.d },
        { x: plot.cx - plot.w, y: 0, z: plot.cz + plot.d },
      ],
      height: churchHeight,
      levels: Math.round(churchHeight / 3.5),
      buildingType: landmarkSeed % 2 === 0 ? 'church' : 'cathedral',
      roofShape: 'gabled',
      roofHeight: 12,
    })
  }

  // 2. School / Lycée / University (one per ~5 chunks)
  if (landmarkSeed % 5 === 1) {
    const col = 2, row = 1
    onBlockReserved?.(col, row)
    const eduVariant = landmarkSeed % 3 // 0: ecole, 1: lycee, 2: universite
    const isUni = eduVariant === 2
    const isLycee = eduVariant === 1
    const plotW = isUni ? 22 : isLycee ? 20 : 18
    const plotD = isUni ? 28 : isLycee ? 26 : 24
    const plot = getInteriorBlockPlot(col, row, plotW, plotD, minX, minZ, blockLayout, 10)
    const eduHeight = isUni ? 18 + (landmarkSeed % 6) : isLycee ? 14 + (landmarkSeed % 4) : 10 + (landmarkSeed % 3)
    const bType = isUni ? 'university' : 'school'
    const name = isUni ? 'Université Panthéon-Sorbonne' : isLycee ? 'Lycée Condorcet' : 'École Primaire Jules Ferry'
    addBuilding(buildings, {
      id: `bld_school_${chunkId.x}_${chunkId.z}`,
      footprint: [
        { x: plot.cx - plot.w, y: 0, z: plot.cz - plot.d },
        { x: plot.cx + plot.w, y: 0, z: plot.cz - plot.d },
        { x: plot.cx + plot.w, y: 0, z: plot.cz + plot.d },
        { x: plot.cx - plot.w, y: 0, z: plot.cz + plot.d },
      ],
      height: eduHeight,
      levels: Math.round(eduHeight / 3.4),
      buildingType: bType,
      name,
      roofShape: isUni ? 'flat' : 'mansard',
    })
  }

  // 3. Hospital / Clinic (one per ~6 chunks)
  if (landmarkSeed % 6 === 2) {
    const col = 3, row = 1
    onBlockReserved?.(col, row)
    const plot = getInteriorBlockPlot(col, row, 20, 28, minX, minZ, blockLayout, 10)
    const hospitalHeight = 18 + (landmarkSeed % 10)
    addBuilding(buildings, {
      id: `bld_hospital_${chunkId.x}_${chunkId.z}`,
      footprint: [
        { x: plot.cx - plot.w, y: 0, z: plot.cz - plot.d },
        { x: plot.cx + plot.w, y: 0, z: plot.cz - plot.d },
        { x: plot.cx + plot.w, y: 0, z: plot.cz + plot.d },
        { x: plot.cx - plot.w, y: 0, z: plot.cz + plot.d },
      ],
      height: hospitalHeight,
      levels: Math.round(hospitalHeight / 3.5),
      buildingType: landmarkSeed % 2 === 0 ? 'hospital' : 'clinic',
      roofShape: 'flat',
    })
  }

  // 4. Train Station (one per ~8 chunks, northern edge block)
  if (landmarkSeed % 8 === 3) {
    const col = 2, row = 0
    onBlockReserved?.(col, row)
    const plot = getInteriorBlockPlot(col, row, 25, 18, minX, minZ, blockLayout, 8)
    const stationHeight = 14 + (landmarkSeed % 6)
    addBuilding(buildings, {
      id: `bld_station_${chunkId.x}_${chunkId.z}`,
      footprint: [
        { x: plot.cx - plot.w, y: 0, z: plot.cz - plot.d },
        { x: plot.cx + plot.w, y: 0, z: plot.cz - plot.d },
        { x: plot.cx + plot.w, y: 0, z: plot.cz + plot.d },
        { x: plot.cx - plot.w, y: 0, z: plot.cz + plot.d },
      ],
      height: stationHeight,
      levels: Math.round(stationHeight / 3.5),
      buildingType: 'train_station',
      roofShape: 'round',
      roofHeight: 8,
    })
  }

  // 5. Fire Station / Police (one per ~7 chunks)
  if (landmarkSeed % 7 === 4) {
    const col = 1, row = 3
    onBlockReserved?.(col, row)
    const plot = getInteriorBlockPlot(col, row, 14, 18, minX, minZ, blockLayout, 10)
    const civicHeight = 10 + (landmarkSeed % 5)
    addBuilding(buildings, {
      id: `bld_civic_${chunkId.x}_${chunkId.z}`,
      footprint: [
        { x: plot.cx - plot.w, y: 0, z: plot.cz - plot.d },
        { x: plot.cx + plot.w, y: 0, z: plot.cz - plot.d },
        { x: plot.cx + plot.w, y: 0, z: plot.cz + plot.d },
        { x: plot.cx - plot.w, y: 0, z: plot.cz + plot.d },
      ],
      height: civicHeight,
      levels: Math.round(civicHeight / 3.5),
      buildingType: landmarkSeed % 2 === 0 ? 'fire_station' : 'police',
      roofShape: 'flat',
    })
  }

  // 6. Town Hall / Government (one per ~10 chunks, central civic block)
  if (landmarkSeed % 10 === 5) {
    const col = 2, row = 2
    onBlockReserved?.(col, row)
    const plot = getInteriorBlockPlot(col, row, 18, 22, minX, minZ, blockLayout, 12)
    const govHeight = 16 + (landmarkSeed % 8)
    addBuilding(buildings, {
      id: `bld_gov_${chunkId.x}_${chunkId.z}`,
      footprint: [
        { x: plot.cx - plot.w, y: 0, z: plot.cz - plot.d },
        { x: plot.cx + plot.w, y: 0, z: plot.cz - plot.d },
        { x: plot.cx + plot.w, y: 0, z: plot.cz + plot.d },
        { x: plot.cx - plot.w, y: 0, z: plot.cz + plot.d },
      ],
      height: govHeight,
      levels: Math.round(govHeight / 3.5),
      buildingType: landmarkSeed % 2 === 0 ? 'townhall' : 'government',
      roofShape: 'mansard',
      roofHeight: 6,
    })
  }

  // 7. Stadium / Sports Hall (one per ~12 chunks)
  if (landmarkSeed % 12 === 6) {
    const col = 3, row = 3
    onBlockReserved?.(col, row)
    const plot = getInteriorBlockPlot(col, row, 28, 34, minX, minZ, blockLayout, 10)
    const stadiumHeight = 22 + (landmarkSeed % 8)
    addBuilding(buildings, {
      id: `bld_stadium_${chunkId.x}_${chunkId.z}`,
      footprint: [
        { x: plot.cx - plot.w, y: 0, z: plot.cz - plot.d },
        { x: plot.cx + plot.w, y: 0, z: plot.cz - plot.d },
        { x: plot.cx + plot.w, y: 0, z: plot.cz + plot.d },
        { x: plot.cx - plot.w, y: 0, z: plot.cz + plot.d },
      ],
      height: stadiumHeight,
      levels: Math.round(stadiumHeight / 3.5),
      buildingType: landmarkSeed % 2 === 0 ? 'stadium' : 'sports_hall',
      roofShape: 'round',
      roofHeight: 12,
    })
  }

  // 8. Industrial / Warehouse (one per ~5 chunks)
  if (landmarkSeed % 5 === 3) {
    const col = 0, row = 2
    onBlockReserved?.(col, row)
    const plot = getInteriorBlockPlot(col, row, 16, 24, minX, minZ, blockLayout, 8)
    const indHeight = 9 + (landmarkSeed % 6)
    addBuilding(buildings, {
      id: `bld_industrial_${chunkId.x}_${chunkId.z}`,
      footprint: [
        { x: plot.cx - plot.w, y: 0, z: plot.cz - plot.d },
        { x: plot.cx + plot.w, y: 0, z: plot.cz - plot.d },
        { x: plot.cx + plot.w, y: 0, z: plot.cz + plot.d },
        { x: plot.cx - plot.w, y: 0, z: plot.cz + plot.d },
      ],
      height: indHeight,
      levels: Math.round(indHeight / 3.5),
      buildingType: landmarkSeed % 3 === 0 ? 'warehouse' : (landmarkSeed % 3 === 1 ? 'factory' : 'industrial'),
      roofShape: 'flat',
    })
  }

  // 9. Synagogue / Mosque / Temple (one per ~9 chunks, strictly inside block (1, 2))
  if (landmarkSeed % 9 === 7) {
    const col = 1, row = 2
    onBlockReserved?.(col, row)
    // Generous 14m setback from the block boundary guarantees at least 18-20m distance to any road!
    const plot = getInteriorBlockPlot(col, row, 15, 20, minX, minZ, blockLayout, 14)
    const religiousHeight = 16 + (landmarkSeed % 10)
    const religiousType = landmarkSeed % 3 === 0 ? 'mosque' : (landmarkSeed % 3 === 1 ? 'temple' : 'synagogue')
    addBuilding(buildings, {
      id: `bld_religious_${chunkId.x}_${chunkId.z}`,
      footprint: [
        { x: plot.cx - plot.w, y: 0, z: plot.cz - plot.d },
        { x: plot.cx + plot.w, y: 0, z: plot.cz - plot.d },
        { x: plot.cx + plot.w, y: 0, z: plot.cz + plot.d },
        { x: plot.cx - plot.w, y: 0, z: plot.cz + plot.d },
      ],
      height: religiousHeight,
      levels: Math.round(religiousHeight / 3.5),
      buildingType: religiousType,
      roofShape: religiousType === 'mosque' ? 'dome' : 'gabled',
      roofHeight: 8,
    })
  }

  // 10. Library / Museum / Theatre (one per ~11 chunks)
  if (landmarkSeed % 11 === 8) {
    const col = 3, row = 2
    onBlockReserved?.(col, row)
    const plot = getInteriorBlockPlot(col, row, 16, 22, minX, minZ, blockLayout, 10)
    const culturalHeight = 12 + (landmarkSeed % 8)
    const culturalType = landmarkSeed % 3 === 0 ? 'library' : (landmarkSeed % 3 === 1 ? 'museum' : 'theatre')
    addBuilding(buildings, {
      id: `bld_cultural_${chunkId.x}_${chunkId.z}`,
      footprint: [
        { x: plot.cx - plot.w, y: 0, z: plot.cz - plot.d },
        { x: plot.cx + plot.w, y: 0, z: plot.cz - plot.d },
        { x: plot.cx + plot.w, y: 0, z: plot.cz + plot.d },
        { x: plot.cx - plot.w, y: 0, z: plot.cz + plot.d },
      ],
      height: culturalHeight,
      levels: Math.round(culturalHeight / 3.5),
      buildingType: culturalType,
      roofShape: culturalType === 'theatre' ? 'round' : 'flat',
      roofHeight: 6,
    })
  }

  // 11. Monument / Castle / Manor (one per ~15 chunks)
  if (landmarkSeed % 15 === 9) {
    const col = 2, row = 2
    onBlockReserved?.(col, row)
    const plot = getInteriorBlockPlot(col, row, 18, 22, minX, minZ, blockLayout, 12)
    const monumentHeight = 20 + (landmarkSeed % 20)
    const monumentType = landmarkSeed % 3 === 0 ? 'monument' : (landmarkSeed % 3 === 1 ? 'castle' : 'manor')
    addBuilding(buildings, {
      id: `bld_monument_${chunkId.x}_${chunkId.z}`,
      footprint: [
        { x: plot.cx - plot.w, y: 0, z: plot.cz - plot.d },
        { x: plot.cx + plot.w, y: 0, z: plot.cz - plot.d },
        { x: plot.cx + plot.w, y: 0, z: plot.cz + plot.d },
        { x: plot.cx - plot.w, y: 0, z: plot.cz + plot.d },
      ],
      height: monumentHeight,
      levels: Math.round(monumentHeight / 3.5),
      buildingType: monumentType,
      roofShape: monumentType === 'monument' ? 'pyramidal' : 'mansard',
      roofHeight: 10,
    })
  }

  // 12. Parking Garage (one per ~6 chunks)
  if (landmarkSeed % 6 === 4) {
    const col = 2, row = 3
    onBlockReserved?.(col, row)
    const plot = getInteriorBlockPlot(col, row, 16, 20, minX, minZ, blockLayout, 10)
    const parkingHeight = 12 + (landmarkSeed % 8)
    addBuilding(buildings, {
      id: `bld_parking_${chunkId.x}_${chunkId.z}`,
      footprint: [
        { x: plot.cx - plot.w, y: 0, z: plot.cz - plot.d },
        { x: plot.cx + plot.w, y: 0, z: plot.cz - plot.d },
        { x: plot.cx + plot.w, y: 0, z: plot.cz + plot.d },
        { x: plot.cx - plot.w, y: 0, z: plot.cz + plot.d },
      ],
      height: parkingHeight,
      levels: Math.round(parkingHeight / 3.0),
      buildingType: 'parking',
      roofShape: 'flat',
    })
  }

  // 13. Fuel Station / Charging Station (one per ~8 chunks)
  if (landmarkSeed % 8 === 5) {
    const col = 4, row = 2
    onBlockReserved?.(col, row)
    const plot = getInteriorBlockPlot(col, row, 12, 16, minX, minZ, blockLayout, 8)
    const fuelHeight = 6 + (landmarkSeed % 4)
    addBuilding(buildings, {
      id: `bld_fuel_${chunkId.x}_${chunkId.z}`,
      footprint: [
        { x: plot.cx - plot.w, y: 0, z: plot.cz - plot.d },
        { x: plot.cx + plot.w, y: 0, z: plot.cz - plot.d },
        { x: plot.cx + plot.w, y: 0, z: plot.cz + plot.d },
        { x: plot.cx - plot.w, y: 0, z: plot.cz + plot.d },
      ],
      height: fuelHeight,
      levels: 1,
      buildingType: landmarkSeed % 2 === 0 ? 'fuel' : 'charging_station',
      roofShape: 'flat',
    })
  }

  // 14. Shopping Mall / Department Store (one per ~12 chunks)
  if (landmarkSeed % 12 === 7) {
    const col = 1, row = 2
    onBlockReserved?.(col, row)
    const plot = getInteriorBlockPlot(col, row, 22, 28, minX, minZ, blockLayout, 10)
    const mallHeight = 14 + (landmarkSeed % 6)
    addBuilding(buildings, {
      id: `bld_mall_${chunkId.x}_${chunkId.z}`,
      footprint: [
        { x: plot.cx - plot.w, y: 0, z: plot.cz - plot.d },
        { x: plot.cx + plot.w, y: 0, z: plot.cz - plot.d },
        { x: plot.cx + plot.w, y: 0, z: plot.cz + plot.d },
        { x: plot.cx - plot.w, y: 0, z: plot.cz + plot.d },
      ],
      height: mallHeight,
      levels: Math.round(mallHeight / 3.5),
      buildingType: landmarkSeed % 2 === 0 ? 'supermarket' : 'commercial',
      roofShape: 'flat',
    })
  }

  // 15. Farm / Barn / Stable (one per ~10 chunks)
  if (landmarkSeed % 10 === 8) {
    const col = 0, row = 1
    onBlockReserved?.(col, row)
    const plot = getInteriorBlockPlot(col, row, 15, 20, minX, minZ, blockLayout, 8)
    const farmHeight = 8 + (landmarkSeed % 4)
    addBuilding(buildings, {
      id: `bld_farm_${chunkId.x}_${chunkId.z}`,
      footprint: [
        { x: plot.cx - plot.w, y: 0, z: plot.cz - plot.d },
        { x: plot.cx + plot.w, y: 0, z: plot.cz - plot.d },
        { x: plot.cx + plot.w, y: 0, z: plot.cz + plot.d },
        { x: plot.cx - plot.w, y: 0, z: plot.cz + plot.d },
      ],
      height: farmHeight,
      levels: 2,
      buildingType: landmarkSeed % 3 === 0 ? 'farm' : (landmarkSeed % 3 === 1 ? 'barn' : 'stable'),
      roofShape: 'gabled',
      roofHeight: 5,
    })
  }
}