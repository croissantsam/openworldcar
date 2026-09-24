import { describe, expect, it } from 'vitest'
import {
  isWantedHighway,
  isWantedBuilding,
  isWantedPoi,
  isWantedWater,
  isWantedPark,
} from './filter.js'

describe('OSM tag filter', () => {
  it('keeps drivable highways, drops rail/foot infrastructure', () => {
    for (const h of ['motorway', 'primary', 'residential', 'service', 'unclassified', 'living_street']) {
      expect(isWantedHighway({ highway: h })).toBe(true)
    }
    expect(isWantedHighway({ highway: 'footway' })).toBe(false)
    expect(isWantedHighway({ highway: 'cycleway' })).toBe(false)
    expect(isWantedHighway({ railway: 'rail' })).toBe(false)
    expect(isWantedHighway({})).toBe(false)
  })

  it('keeps buildings but not bare parking lots', () => {
    expect(isWantedBuilding({ building: 'yes' })).toBe(true)
    expect(isWantedBuilding({ building: 'apartments' })).toBe(true)
    expect(isWantedBuilding({ building: 'no' })).toBe(false)
    expect(isWantedBuilding({ amenity: 'parking' })).toBe(false)
    expect(isWantedBuilding({ amenity: 'parking', building: 'garage' })).toBe(true)
    expect(isWantedBuilding({})).toBe(false)
  })

  it('keeps only gameplay-relevant POIs', () => {
    expect(isWantedPoi({ amenity: 'fuel' })).toBe(true)
    expect(isWantedPoi({ amenity: 'hospital' })).toBe(true)
    expect(isWantedPoi({ shop: 'supermarket' })).toBe(true)
    expect(isWantedPoi({ amenity: 'school' })).toBe(false)
    expect(isWantedPoi({ tourism: 'museum' })).toBe(false)
  })

  it('keeps open water, drops buried/covered flow', () => {
    expect(isWantedWater({ waterway: 'river' })).toBe(true)
    expect(isWantedWater({ natural: 'water' })).toBe(true)
    expect(isWantedWater({ waterway: 'river', tunnel: 'culvert' })).toBe(false)
    expect(isWantedWater({ waterway: 'canal', covered: 'yes' })).toBe(false)
    expect(isWantedWater({ waterway: 'stream', layer: '-1' })).toBe(false)
  })

  it('keeps green/leisure space', () => {
    expect(isWantedPark({ leisure: 'park' })).toBe(true)
    expect(isWantedPark({ landuse: 'forest' })).toBe(true)
    expect(isWantedPark({ natural: 'wood' })).toBe(true)
    expect(isWantedPark({ highway: 'residential' })).toBe(false)
  })
})
