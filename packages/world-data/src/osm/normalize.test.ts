import { describe, expect, it, beforeAll } from 'vitest'
import { setWorldOrigin } from '@world-drive/math'
import {
  normalizeRoad,
  normalizeBuilding,
  normalizePoi,
  normalizeWaterway,
  type RawOsmWay,
} from './normalize.js'

const ORIGIN = { latitude: 48.8648, longitude: 2.349 }

beforeAll(() => {
  setWorldOrigin(ORIGIN)
})

function way(id: string, tags: Record<string, string>, coords: [number, number][]): RawOsmWay {
  return { id, tags, coords }
}

describe('normalizeRoad', () => {
  it('converts a tagged way to a game road', () => {
    const road = normalizeRoad(
      way('r1', { highway: 'residential', name: 'Rue Test', lanes: '2' }, [
        [2.349, 48.8648],
        [2.35, 48.8649],
        [2.351, 48.865],
      ]),
    )
    expect(road).not.toBeNull()
    expect(road!.id).toBe('r1')
    expect(road!.highway).toBe('residential')
    expect(road!.name).toBe('Rue Test')
    expect(road!.points).toHaveLength(3)
  })

  it('rejects non-drivable ways and degenerate geometry', () => {
    expect(normalizeRoad(way('f1', { highway: 'footway' }, [[2.349, 48.8648], [2.35, 48.8649]]))).toBeNull()
    expect(normalizeRoad(way('x1', { highway: 'residential' }, [[2.349, 48.8648]]))).toBeNull()
    expect(normalizeRoad(way('x2', {}, [[2.349, 48.8648], [2.35, 48.8649]]))).toBeNull()
  })
})

describe('normalizeBuilding', () => {
  const square: [number, number][] = [
    [2.349, 48.8648],
    [2.3491, 48.8648],
    [2.3491, 48.8649],
    [2.349, 48.8649],
  ]

  it('derives height from levels', () => {
    const b = normalizeBuilding(way('b1', { building: 'apartments', 'building:levels': '4' }, square))
    expect(b).not.toBeNull()
    expect(b!.levels).toBe(4)
    expect(b!.height).toBeGreaterThan(0)
    expect(b!.footprint).toHaveLength(4)
  })

  it('prefers the explicit height tag', () => {
    const b = normalizeBuilding(way('b2', { building: 'yes', height: '25' }, square))
    expect(b!.height).toBe(25)
  })

  it('rejects non-buildings and degenerate footprints', () => {
    expect(normalizeBuilding(way('p1', { amenity: 'parking' }, square))).toBeNull()
    expect(normalizeBuilding(way('p2', { building: 'yes' }, [[2.349, 48.8648], [2.35, 48.8649]]))).toBeNull()
  })
})

describe('normalizePoi / normalizeWaterway', () => {
  it('keeps wanted POIs with category and world position', () => {
    const poi = normalizePoi(
      { id: 'n1', tags: { amenity: 'fuel', name: 'Station' }, lon: 2.349, lat: 48.8648 },
      { x: 1, y: 0, z: 2 },
    )
    expect(poi).not.toBeNull()
    expect(poi!.category).toBe('fuel')
    expect(poi!.position).toEqual({ x: 1, y: 0, z: 2 })
  })

  it('drops unwanted POI nodes', () => {
    expect(
      normalizePoi({ id: 'n2', tags: { amenity: 'school' }, lon: 2.349, lat: 48.8648 }, { x: 0, y: 0, z: 0 }),
    ).toBeNull()
  })

  it('keeps open rivers, drops culverted flow', () => {
    const river = normalizeWaterway(
      way('w1', { waterway: 'river', name: 'Seine' }, [[2.349, 48.8648], [2.36, 48.865]]),
    )
    expect(river).not.toBeNull()
    expect(river!.type).toBe('river')
    expect(
      normalizeWaterway(
        way('w2', { waterway: 'river', tunnel: 'culvert' }, [[2.349, 48.8648], [2.36, 48.865]]),
      ),
    ).toBeNull()
  })
})
