/**
 * Landmark Generator — churches, schools, hospitals, stations, etc.
 */

import type { Building, BuildingType } from '@world-drive/shared'
import type { ChunkId } from '@world-drive/math'

export interface LandmarkParams {
  chunkId: ChunkId
  minX: number
  maxX: number
  minZ: number
  maxZ: number
  landmarkSeed: number
  buildings: Building[]
}

function addBuilding(buildings: Building[], building: Building): void {
  buildings.push(building)
}

export function generateLandmarks(params: LandmarkParams): void {
  const { chunkId, minX, maxX, minZ, maxZ, landmarkSeed, buildings } = params
  const midX = (minX + maxX) / 2
  const midZ = (minZ + maxZ) / 2

  // Church/Cathedral (one per ~4 chunks)
  if (landmarkSeed % 4 === 0) {
    const churchX = minX + 187.5 + (landmarkSeed % 100) - 50
    const churchZ = minZ + 187.5 + ((landmarkSeed >> 4) % 100) - 50
    const churchHeight = 28 + (landmarkSeed % 15)
    addBuilding(buildings, {
      id: `bld_church_${chunkId.x}_${chunkId.z}`,
      footprint: [
        { x: churchX - 15, y: 0, z: churchZ - 25 },
        { x: churchX + 15, y: 0, z: churchZ - 25 },
        { x: churchX + 15, y: 0, z: churchZ + 25 },
        { x: churchX - 15, y: 0, z: churchZ + 25 },
      ],
      height: churchHeight,
      levels: Math.round(churchHeight / 3.5),
      buildingType: landmarkSeed % 2 === 0 ? 'church' : 'cathedral',
      roofShape: 'pyramidal',
      roofHeight: 12,
    })
  }

  // School/University (one per ~5 chunks)
  if (landmarkSeed % 5 === 1) {
    const schoolX = minX + 312.5 + (landmarkSeed % 80) - 40
    const schoolZ = minZ + 312.5 + ((landmarkSeed >> 3) % 80) - 40
    const schoolHeight = 12 + (landmarkSeed % 8)
    addBuilding(buildings, {
      id: `bld_school_${chunkId.x}_${chunkId.z}`,
      footprint: [
        { x: schoolX - 20, y: 0, z: schoolZ - 30 },
        { x: schoolX + 20, y: 0, z: schoolZ - 30 },
        { x: schoolX + 20, y: 0, z: schoolZ + 30 },
        { x: schoolX - 20, y: 0, z: schoolZ + 30 },
      ],
      height: schoolHeight,
      levels: Math.round(schoolHeight / 3.5),
      buildingType: landmarkSeed % 2 === 0 ? 'school' : 'university',
      roofShape: 'flat',
    })
  }

  // Hospital/Clinic (one per ~6 chunks)
  if (landmarkSeed % 6 === 2) {
    const hospitalX = minX + 437.5 + (landmarkSeed % 60) - 30
    const hospitalZ = minZ + 62.5 + ((landmarkSeed >> 2) % 60) - 30
    const hospitalHeight = 18 + (landmarkSeed % 10)
    addBuilding(buildings, {
      id: `bld_hospital_${chunkId.x}_${chunkId.z}`,
      footprint: [
        { x: hospitalX - 25, y: 0, z: hospitalZ - 35 },
        { x: hospitalX + 25, y: 0, z: hospitalZ - 35 },
        { x: hospitalX + 25, y: 0, z: hospitalZ + 35 },
        { x: hospitalX - 25, y: 0, z: hospitalZ + 35 },
      ],
      height: hospitalHeight,
      levels: Math.round(hospitalHeight / 3.5),
      buildingType: landmarkSeed % 2 === 0 ? 'hospital' : 'clinic',
      roofShape: 'flat',
    })
  }

  // Train Station (one per ~8 chunks, near primary roads)
  if (landmarkSeed % 8 === 3) {
    const stationX = minX + 312.5
    const stationZ = minZ + 187.5 + 50
    const stationHeight = 14 + (landmarkSeed % 6)
    addBuilding(buildings, {
      id: `bld_station_${chunkId.x}_${chunkId.z}`,
      footprint: [
        { x: stationX - 30, y: 0, z: stationZ - 40 },
        { x: stationX + 30, y: 0, z: stationZ - 40 },
        { x: stationX + 30, y: 0, z: stationZ + 40 },
        { x: stationX - 30, y: 0, z: stationZ + 40 },
      ],
      height: stationHeight,
      levels: Math.round(stationHeight / 3.5),
      buildingType: 'train_station',
      roofShape: 'round',
      roofHeight: 8,
    })
  }

  // Fire Station / Police (one per ~7 chunks)
  if (landmarkSeed % 7 === 4) {
    const civicX = minX + 62.5 + (landmarkSeed % 50) - 25
    const civicZ = minZ + 437.5 + ((landmarkSeed >> 5) % 50) - 25
    const civicHeight = 10 + (landmarkSeed % 5)
    addBuilding(buildings, {
      id: `bld_civic_${chunkId.x}_${chunkId.z}`,
      footprint: [
        { x: civicX - 15, y: 0, z: civicZ - 20 },
        { x: civicX + 15, y: 0, z: civicZ - 20 },
        { x: civicX + 15, y: 0, z: civicZ + 20 },
        { x: civicX - 15, y: 0, z: civicZ + 20 },
      ],
      height: civicHeight,
      levels: Math.round(civicHeight / 3.5),
      buildingType: landmarkSeed % 2 === 0 ? 'fire_station' : 'police',
      roofShape: 'flat',
    })
  }

  // Town Hall / Government (one per ~10 chunks, central location)
  if (landmarkSeed % 10 === 5) {
    const govX = midX
    const govZ = midZ
    const govHeight = 16 + (landmarkSeed % 8)
    addBuilding(buildings, {
      id: `bld_gov_${chunkId.x}_${chunkId.z}`,
      footprint: [
        { x: govX - 20, y: 0, z: govZ - 25 },
        { x: govX + 20, y: 0, z: govZ - 25 },
        { x: govX + 20, y: 0, z: govZ + 25 },
        { x: govX - 20, y: 0, z: govZ + 25 },
      ],
      height: govHeight,
      levels: Math.round(govHeight / 3.5),
      buildingType: landmarkSeed % 2 === 0 ? 'townhall' : 'government',
      roofShape: 'mansard',
      roofHeight: 6,
    })
  }

  // Stadium / Sports Hall (one per ~12 chunks, large footprint)
  if (landmarkSeed % 12 === 6) {
    const stadiumX = maxX - 110
    const stadiumZ = maxZ - 110
    const stadiumHeight = 22 + (landmarkSeed % 8)
    addBuilding(buildings, {
      id: `bld_stadium_${chunkId.x}_${chunkId.z}`,
      footprint: [
        { x: stadiumX - 50, y: 0, z: stadiumZ - 70 },
        { x: stadiumX + 50, y: 0, z: stadiumZ - 70 },
        { x: stadiumX + 50, y: 0, z: stadiumZ + 70 },
        { x: stadiumX - 50, y: 0, z: stadiumZ + 70 },
      ],
      height: stadiumHeight,
      levels: Math.round(stadiumHeight / 3.5),
      buildingType: landmarkSeed % 2 === 0 ? 'stadium' : 'sports_hall',
      roofShape: 'round',
      roofHeight: 12,
    })
  }

  // Industrial / Warehouse (one per ~5 chunks, near edges)
  if (landmarkSeed % 5 === 3) {
    const indX = minX + (landmarkSeed % 2 === 0 ? 30 : 470)
    const indZ = minZ + 62.5 + ((landmarkSeed >> 1) % 375)
    const indHeight = 9 + (landmarkSeed % 6)
    addBuilding(buildings, {
      id: `bld_industrial_${chunkId.x}_${chunkId.z}`,
      footprint: [
        { x: indX - 25, y: 0, z: indZ - 35 },
        { x: indX + 25, y: 0, z: indZ - 35 },
        { x: indX + 25, y: 0, z: indZ + 35 },
        { x: indX - 25, y: 0, z: indZ + 35 },
      ],
      height: indHeight,
      levels: Math.round(indHeight / 3.5),
      buildingType: landmarkSeed % 3 === 0 ? 'warehouse' : (landmarkSeed % 3 === 1 ? 'factory' : 'industrial'),
      roofShape: 'flat',
    })
  }

  // Mosque / Temple / Synagogue (one per ~9 chunks)
  if (landmarkSeed % 9 === 7) {
    const religiousX = minX + 187.5 + (landmarkSeed % 120) - 60
    const religiousZ = minZ + 312.5 + ((landmarkSeed >> 2) % 120) - 60
    const religiousHeight = 16 + (landmarkSeed % 12)
    const religiousType = landmarkSeed % 3 === 0 ? 'mosque' : (landmarkSeed % 3 === 1 ? 'temple' : 'synagogue')
    addBuilding(buildings, {
      id: `bld_religious_${chunkId.x}_${chunkId.z}`,
      footprint: [
        { x: religiousX - 18, y: 0, z: religiousZ - 22 },
        { x: religiousX + 18, y: 0, z: religiousZ - 22 },
        { x: religiousX + 18, y: 0, z: religiousZ + 22 },
        { x: religiousX - 18, y: 0, z: religiousZ + 22 },
      ],
      height: religiousHeight,
      levels: Math.round(religiousHeight / 3.5),
      buildingType: religiousType,
      roofShape: religiousType === 'mosque' ? 'dome' : 'pyramidal',
      roofHeight: 8,
    })
  }

  // Library / Museum / Theatre (one per ~11 chunks)
  if (landmarkSeed % 11 === 8) {
    const culturalX = minX + 62.5 + (landmarkSeed % 80) - 40
    const culturalZ = minZ + 187.5 + ((landmarkSeed >> 3) % 80) - 40
    const culturalHeight = 12 + (landmarkSeed % 8)
    const culturalType = landmarkSeed % 3 === 0 ? 'library' : (landmarkSeed % 3 === 1 ? 'museum' : 'theatre')
    addBuilding(buildings, {
      id: `bld_cultural_${chunkId.x}_${chunkId.z}`,
      footprint: [
        { x: culturalX - 20, y: 0, z: culturalZ - 25 },
        { x: culturalX + 20, y: 0, z: culturalZ - 25 },
        { x: culturalX + 20, y: 0, z: culturalZ + 25 },
        { x: culturalX - 20, y: 0, z: culturalZ + 25 },
      ],
      height: culturalHeight,
      levels: Math.round(culturalHeight / 3.5),
      buildingType: culturalType,
      roofShape: culturalType === 'theatre' ? 'round' : 'flat',
      roofHeight: 6,
    })
  }

  // Monument / Castle / Manor (one per ~15 chunks)
  if (landmarkSeed % 15 === 9) {
    const monumentX = midX + (landmarkSeed % 100) - 50
    const monumentZ = midZ + ((landmarkSeed >> 4) % 100) - 50
    const monumentHeight = 20 + (landmarkSeed % 20)
    const monumentType = landmarkSeed % 3 === 0 ? 'monument' : (landmarkSeed % 3 === 1 ? 'castle' : 'manor')
    addBuilding(buildings, {
      id: `bld_monument_${chunkId.x}_${chunkId.z}`,
      footprint: [
        { x: monumentX - 25, y: 0, z: monumentZ - 30 },
        { x: monumentX + 25, y: 0, z: monumentZ - 30 },
        { x: monumentX + 25, y: 0, z: monumentZ + 30 },
        { x: monumentX - 25, y: 0, z: monumentZ + 30 },
      ],
      height: monumentHeight,
      levels: Math.round(monumentHeight / 3.5),
      buildingType: monumentType,
      roofShape: monumentType === 'monument' ? 'pyramidal' : 'mansard',
      roofHeight: 10,
    })
  }

  // Parking Garage (one per ~6 chunks, near commercial areas)
  if (landmarkSeed % 6 === 4) {
    const parkingX = minX + 312.5 + (landmarkSeed % 60) - 30
    const parkingZ = maxZ - 30
    const parkingHeight = 12 + (landmarkSeed % 8)
    addBuilding(buildings, {
      id: `bld_parking_${chunkId.x}_${chunkId.z}`,
      footprint: [
        { x: parkingX - 20, y: 0, z: parkingZ - 25 },
        { x: parkingX + 20, y: 0, z: parkingZ - 25 },
        { x: parkingX + 20, y: 0, z: parkingZ + 25 },
        { x: parkingX - 20, y: 0, z: parkingZ + 25 },
      ],
      height: parkingHeight,
      levels: Math.round(parkingHeight / 3.0),
      buildingType: 'parking',
      roofShape: 'flat',
    })
  }

  // Fuel Station / Charging Station (one per ~8 chunks, near major roads)
  if (landmarkSeed % 8 === 5) {
    const fuelX = maxX - 20
    const fuelZ = minZ + 312.5 + ((landmarkSeed >> 1) % 100) - 50
    const fuelHeight = 6 + (landmarkSeed % 4)
    addBuilding(buildings, {
      id: `bld_fuel_${chunkId.x}_${chunkId.z}`,
      footprint: [
        { x: fuelX - 12, y: 0, z: fuelZ - 18 },
        { x: fuelX + 12, y: 0, z: fuelZ - 18 },
        { x: fuelX + 12, y: 0, z: fuelZ + 18 },
        { x: fuelX - 12, y: 0, z: fuelZ + 18 },
      ],
      height: fuelHeight,
      levels: 1,
      buildingType: landmarkSeed % 2 === 0 ? 'fuel' : 'charging_station',
      roofShape: 'flat',
    })
  }

  // Shopping Mall / Department Store (one per ~12 chunks)
  if (landmarkSeed % 12 === 7) {
    const mallX = minX + 187.5
    const mallZ = maxZ - 40
    const mallHeight = 14 + (landmarkSeed % 6)
    addBuilding(buildings, {
      id: `bld_mall_${chunkId.x}_${chunkId.z}`,
      footprint: [
        { x: mallX - 35, y: 0, z: mallZ - 45 },
        { x: mallX + 35, y: 0, z: mallZ - 45 },
        { x: mallX + 35, y: 0, z: mallZ + 45 },
        { x: mallX - 35, y: 0, z: mallZ + 45 },
      ],
      height: mallHeight,
      levels: Math.round(mallHeight / 3.5),
      buildingType: landmarkSeed % 2 === 0 ? 'supermarket' : 'commercial',
      roofShape: 'flat',
    })
  }

  // Farm / Barn / Stable (one per ~10 chunks, near edges)
  if (landmarkSeed % 10 === 8) {
    const farmX = minX + (landmarkSeed % 2 === 0 ? 40 : 460)
    const farmZ = minZ + 62.5 + ((landmarkSeed >> 2) % 375)
    const farmHeight = 7 + (landmarkSeed % 5)
    const farmType = landmarkSeed % 3 === 0 ? 'farm' : (landmarkSeed % 3 === 1 ? 'barn' : 'stable')
    addBuilding(buildings, {
      id: `bld_farm_${chunkId.x}_${chunkId.z}`,
      footprint: [
        { x: farmX - 20, y: 0, z: farmZ - 30 },
        { x: farmX + 20, y: 0, z: farmZ - 30 },
        { x: farmX + 20, y: 0, z: farmZ + 30 },
        { x: farmX - 20, y: 0, z: farmZ + 30 },
      ],
      height: farmHeight,
      levels: Math.round(farmHeight / 3.5),
      buildingType: farmType,
      roofShape: 'gabled',
      roofHeight: 5,
    })
  }

  // Greenhouse (one per ~14 chunks)
  if (landmarkSeed % 14 === 10) {
    const greenhouseX = minX + 62.5 + (landmarkSeed % 80) - 40
    const greenhouseZ = minZ + 62.5 + ((landmarkSeed >> 3) % 80) - 40
    const greenhouseHeight = 5 + (landmarkSeed % 3)
    addBuilding(buildings, {
      id: `bld_greenhouse_${chunkId.x}_${chunkId.z}`,
      footprint: [
        { x: greenhouseX - 15, y: 0, z: greenhouseZ - 20 },
        { x: greenhouseX + 15, y: 0, z: greenhouseZ - 20 },
        { x: greenhouseX + 15, y: 0, z: greenhouseZ + 20 },
        { x: greenhouseX - 15, y: 0, z: greenhouseZ + 20 },
      ],
      height: greenhouseHeight,
      levels: 1,
      buildingType: 'greenhouse',
      roofShape: 'round',
      roofHeight: 3,
    })
  }

  // Hangar (one per ~13 chunks, near industrial)
  if (landmarkSeed % 13 === 11) {
    const hangarX = maxX - 30
    const hangarZ = minZ + 187.5 + ((landmarkSeed >> 1) % 125) - 60
    const hangarHeight = 11 + (landmarkSeed % 6)
    addBuilding(buildings, {
      id: `bld_hangar_${chunkId.x}_${chunkId.z}`,
      footprint: [
        { x: hangarX - 30, y: 0, z: hangarZ - 40 },
        { x: hangarX + 30, y: 0, z: hangarZ - 40 },
        { x: hangarX + 30, y: 0, z: hangarZ + 40 },
        { x: hangarX - 30, y: 0, z: hangarZ + 40 },
      ],
      height: hangarHeight,
      levels: 1,
      buildingType: 'hangar',
      roofShape: 'round',
      roofHeight: 8,
    })
  }

  // Carport / Canopy (one per ~7 chunks)
  if (landmarkSeed % 7 === 6) {
    const carportX = minX + 312.5 + (landmarkSeed % 100) - 50
    const carportZ = minZ + 62.5 + ((landmarkSeed >> 2) % 100) - 50
    const carportHeight = 4 + (landmarkSeed % 2)
    addBuilding(buildings, {
      id: `bld_carport_${chunkId.x}_${chunkId.z}`,
      footprint: [
        { x: carportX - 8, y: 0, z: carportZ - 12 },
        { x: carportX + 8, y: 0, z: carportZ - 12 },
        { x: carportX + 8, y: 0, z: carportZ + 12 },
        { x: carportX - 8, y: 0, z: carportZ + 12 },
      ],
      height: carportHeight,
      levels: 1,
      buildingType: 'carport',
      roofShape: 'flat',
    })
  }

  // Kiosk / Shed / Small structures (several per chunk)
  if (landmarkSeed % 3 === 2) {
    for (let k = 0; k < 3; k++) {
      const kioskX = minX + 62.5 + (landmarkSeed % 375) + k * 100
      const kioskZ = minZ + 62.5 + ((landmarkSeed >> 2) % 375) + k * 80
      const kioskHeight = 3 + (landmarkSeed % 3)
      const kioskType = landmarkSeed % 3 === 0 ? 'kiosk' : (landmarkSeed % 3 === 1 ? 'shed' : 'garage')
      addBuilding(buildings, {
        id: `bld_kiosk_${chunkId.x}_${chunkId.z}_${k}`,
        footprint: [
          { x: kioskX - 4, y: 0, z: kioskZ - 5 },
          { x: kioskX + 4, y: 0, z: kioskZ - 5 },
          { x: kioskX + 4, y: 0, z: kioskZ + 5 },
          { x: kioskX - 4, y: 0, z: kioskZ + 5 },
        ],
        height: kioskHeight,
        levels: 1,
        buildingType: kioskType,
        roofShape: 'flat',
      })
    }
  }

  // Ruins (rare, one per ~20 chunks)
  if (landmarkSeed % 20 === 12) {
    const ruinsX = midX + (landmarkSeed % 100) - 50
    const ruinsZ = midZ + ((landmarkSeed >> 3) % 100) - 50
    const ruinsHeight = 4 + (landmarkSeed % 4)
    addBuilding(buildings, {
      id: `bld_ruins_${chunkId.x}_${chunkId.z}`,
      footprint: [
        { x: ruinsX - 10, y: 0, z: ruinsZ - 15 },
        { x: ruinsX + 10, y: 0, z: ruinsZ - 15 },
        { x: ruinsX + 10, y: 0, z: ruinsZ + 15 },
        { x: ruinsX - 10, y: 0, z: ruinsZ + 15 },
      ],
      height: ruinsHeight,
      levels: 1,
      buildingType: 'ruins',
      roofShape: 'flat',
    })
  }
}