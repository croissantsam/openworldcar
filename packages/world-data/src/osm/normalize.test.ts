import { describe, expect, it, beforeAll } from 'vitest'
import { setWorldOrigin } from '@world-drive/math'
import {
  normalizeRoad,
  normalizeBuilding,
  normalizePoi,
  normalizeWaterway,
  isTownhallName,
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

  it('normalizes schools, lycees and universities from tags and names', () => {
    const s1 = normalizeBuilding(way('s1', { building: 'yes', name: 'École Primaire Victor Hugo' }, square))
    expect(s1).not.toBeNull()
    expect(s1!.buildingType).toBe('school')

    const l1 = normalizeBuilding(way('l1', { building: 'yes', name: 'Lycée Condorcet' }, square))
    expect(l1).not.toBeNull()
    expect(l1!.buildingType).toBe('school')

    const u1 = normalizeBuilding(way('u1', { building: 'yes', name: 'Université Panthéon-Sorbonne' }, square))
    expect(u1).not.toBeNull()
    expect(u1!.buildingType).toBe('university')

    const a1 = normalizeBuilding(way('a1', { amenity: 'school', name: 'École Maternelle' }, square))
    expect(a1).not.toBeNull()
    expect(a1!.buildingType).toBe('school')
  })

  it('normalizes hotels from tags and names while avoiding false-positives', () => {
    const h1 = normalizeBuilding(way('h1', { building: 'yes', name: 'Hôtel Le Meurice' }, square))
    expect(h1).not.toBeNull()
    expect(h1!.buildingType).toBe('hotel')

    const h2 = normalizeBuilding(way('h2', { tourism: 'hotel', name: 'Novotel Paris Centre' }, square))
    expect(h2).not.toBeNull()
    expect(h2!.buildingType).toBe('hotel')

    const h3 = normalizeBuilding(way('h3', { tourism: 'motel', name: 'Motel One' }, square))
    expect(h3).not.toBeNull()
    expect(h3!.buildingType).toBe('hotel')

    // False positives in French: Hôtel de Ville = townhall, Hôtel-Dieu = hospital
    const hv = normalizeBuilding(way('hv', { building: 'yes', amenity: 'townhall', name: 'Hôtel de Ville de Paris' }, square))
    expect(hv).not.toBeNull()
    expect(hv!.buildingType).toBe('townhall')

    const hd = normalizeBuilding(way('hd', { building: 'yes', amenity: 'hospital', name: 'Hôtel-Dieu' }, square))
    expect(hd).not.toBeNull()
    expect(hd!.buildingType).toBe('hospital')
  })

  it('normalizes hospitals and clinics from tags and names', () => {
    const hp1 = normalizeBuilding(way('hp1', { building: 'yes', name: 'Hôpital Necker - Enfants Malades' }, square))
    expect(hp1).not.toBeNull()
    expect(hp1!.buildingType).toBe('hospital')

    const hp2 = normalizeBuilding(way('hp2', { healthcare: 'hospital', name: 'CHU de Bordeaux' }, square))
    expect(hp2).not.toBeNull()
    expect(hp2!.buildingType).toBe('hospital')

    const cl1 = normalizeBuilding(way('cl1', { building: 'yes', name: 'Clinique de l’Espérance' }, square))
    expect(cl1).not.toBeNull()
    expect(cl1!.buildingType).toBe('hospital')

    const hd1 = normalizeBuilding(way('hd1', { building: 'yes', name: 'Hôtel-Dieu de Paris' }, square))
    expect(hd1).not.toBeNull()
    expect(hd1!.buildingType).toBe('hospital')
  })

  it('normalizes town halls and mairies from tags and names', () => {
    const th1 = normalizeBuilding(way('th1', { building: 'townhall' }, square))
    expect(th1).not.toBeNull()
    expect(th1!.buildingType).toBe('townhall')

    const th2 = normalizeBuilding(way('th2', { amenity: 'townhall' }, square))
    expect(th2).not.toBeNull()
    expect(th2!.buildingType).toBe('townhall')

    const th3 = normalizeBuilding(way('th3', { building: 'yes', name: 'Hôtel de Ville de Lyon' }, square))
    expect(th3).not.toBeNull()
    expect(th3!.buildingType).toBe('townhall')

    const th4 = normalizeBuilding(way('th4', { building: 'yes', name: 'Mairie du 11e Arrondissement' }, square))
    expect(th4).not.toBeNull()
    expect(th4!.buildingType).toBe('townhall')

    const th5 = normalizeBuilding(way('th5', { building: 'civic', name: 'San Francisco City Hall' }, square))
    expect(th5).not.toBeNull()
    expect(th5!.buildingType).toBe('townhall')

    const th6 = normalizeBuilding(way('th6', { building: 'yes', name: 'Rathaus München' }, square))
    expect(th6).not.toBeNull()
    expect(th6!.buildingType).toBe('townhall')
  })

  it('validates isTownhallName correctly', () => {
    expect(isTownhallName('Hôtel de Ville')).toBe(true)
    expect(isTownhallName('Mairie')).toBe(true)
    expect(isTownhallName('Mairie de quartier')).toBe(true)
    expect(isTownhallName('City Hall')).toBe(true)
    expect(isTownhallName('Town Hall')).toBe(true)
    expect(isTownhallName('Rathaus')).toBe(true)
    expect(isTownhallName('Ayuntamiento de Madrid')).toBe(true)

    // False positives: ordinary hotels or hospitals
    expect(isTownhallName('Hôtel Le Bristol')).toBe(false)
    expect(isTownhallName('Hôtel-Dieu')).toBe(false)
    expect(isTownhallName('Grand Hôtel de la Plage')).toBe(false)
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
