import { describe, it, expect } from 'vitest'
import type { PointOfInterest, Road } from '@world-drive/shared'
import {
  isStatuePoi,
  statueArchetypeFor,
  buildPedestrianStatueGeo,
  buildEquestrianStatueGeo,
  buildBustStatueGeo,
  buildObeliskStatueGeo,
} from './StatueGeometries.js'
import { StreetFurnitureGenerator } from './StreetFurnitureGenerator.js'

describe('Statue Generation & Archetype Classification', () => {
  it('correctly classifies George Washington equestrian statue node', () => {
    const washingtonPoi: PointOfInterest = {
      id: '570349020',
      category: 'other',
      name: 'Statue de George Washington',
      position: { x: 10, y: 0, z: 20 },
      kind: 'tourism',
      tags: {
        artist_name: 'Daniel Chester French',
        historic: 'memorial',
        material: 'bronze',
        memorial: 'statue',
        name: 'Statue de George Washington',
        'name:en': 'George Washington Statue',
        'name:fr': 'Statue de George Washington',
        start_date: '1900-07-03',
        wikidata: 'Q3497629',
        wikipedia: 'en:Equestrian statue of George Washington (Paris)',
      },
    }

    expect(isStatuePoi(washingtonPoi)).toBe(true)
    expect(statueArchetypeFor(washingtonPoi)).toBe('statueEquestrian')
  })

  it('classifies standing pedestrian statues', () => {
    const poi: PointOfInterest = {
      id: 'statue-1',
      category: 'other',
      name: 'Statue de Jean Jaurès',
      position: { x: 0, y: 0, z: 0 },
      kind: 'tourism',
      tags: {
        historic: 'memorial',
        memorial: 'statue',
      },
    }
    expect(isStatuePoi(poi)).toBe(true)
    expect(statueArchetypeFor(poi)).toBe('statuePedestrian')
  })

  it('classifies bust monuments', () => {
    const poi: PointOfInterest = {
      id: 'bust-1',
      category: 'other',
      name: 'Buste de Victor Hugo',
      position: { x: 5, y: 0, z: 5 },
      kind: 'tourism',
      tags: {
        historic: 'memorial',
        memorial: 'bust',
      },
    }
    expect(isStatuePoi(poi)).toBe(true)
    expect(statueArchetypeFor(poi)).toBe('statueBust')
  })

  it('classifies obelisk monuments', () => {
    const poi: PointOfInterest = {
      id: 'obelisk-1',
      category: 'other',
      name: 'Obélisque de Louxor',
      position: { x: 50, y: 0, z: 50 },
      kind: 'tourism',
      tags: {
        historic: 'monument',
        memorial: 'obelisk',
      },
    }
    expect(isStatuePoi(poi)).toBe(true)
    expect(statueArchetypeFor(poi)).toBe('statueObelisk')
  })

  it('builds valid geometries with vertex colors for all statue archetypes', () => {
    const pedGeo = buildPedestrianStatueGeo()
    const eqGeo = buildEquestrianStatueGeo()
    const bustGeo = buildBustStatueGeo()
    const obGeo = buildObeliskStatueGeo()

    for (const g of [pedGeo, eqGeo, bustGeo, obGeo]) {
      expect(g.getAttribute('position')).toBeDefined()
      expect(g.getAttribute('position')!.count).toBeGreaterThan(0)
      expect(g.getAttribute('color')).toBeDefined()
      expect(g.getAttribute('normal')).toBeDefined()
    }
  })

  it('generates instanced meshes with shadows in StreetFurnitureGenerator', () => {
    const pois: PointOfInterest[] = [
      {
        id: '570349020',
        category: 'other',
        name: 'Statue de George Washington',
        position: { x: 15, y: 0, z: 35 },
        kind: 'tourism',
        tags: {
          historic: 'memorial',
          memorial: 'statue',
          wikipedia: 'en:Equestrian statue of George Washington (Paris)',
        },
      },
      {
        id: 'ped-1',
        category: 'other',
        name: 'Statue de la Liberté',
        position: { x: -30, y: 0, z: -40 },
        kind: 'tourism',
        tags: {
          historic: 'monument',
          memorial: 'statue',
        },
      },
    ]

    const roads: Road[] = [
      {
        id: 'r1',
        name: 'Avenue du Président Wilson',
        type: 'primary',
        surface: 'asphalt',
        lanes: 2,
        maxSpeed: 50,
        points: [
          { x: 0, y: 0, z: 25 },
          { x: 30, y: 0, z: 25 },
        ],
      },
    ]

    const group = StreetFurnitureGenerator.generate(pois, roads, [])
    expect(group).not.toBeNull()
    const eqMesh = group!.getObjectByName('sf-statueEquestrian')
    const pedMesh = group!.getObjectByName('sf-statuePedestrian')

    expect(eqMesh).toBeDefined()
    expect(eqMesh?.castShadow).toBe(true)
    expect(pedMesh).toBeDefined()
    expect(pedMesh?.castShadow).toBe(true)
  })

  it('creates solid physics colliders for statue pedestals', () => {
    const pois: PointOfInterest[] = [
      {
        id: '570349020',
        category: 'other',
        name: 'Statue de George Washington',
        position: { x: 15, y: 0, z: 35 },
        kind: 'tourism',
        tags: {
          historic: 'memorial',
          memorial: 'statue',
          wikipedia: 'en:Equestrian statue of George Washington (Paris)',
        },
      },
    ]

    const roads: Road[] = [
      {
        id: 'r1',
        name: 'Avenue',
        type: 'primary',
        surface: 'asphalt',
        lanes: 2,
        maxSpeed: 50,
        points: [
          { x: 0, y: 0, z: 25 },
          { x: 30, y: 0, z: 25 },
        ],
      },
    ]

    const colliders = StreetFurnitureGenerator.createColliderDescs(pois, roads)
    expect(colliders.length).toBe(1)
    const c = colliders[0]!
    expect(c.translation.x).toBe(15)
    expect(c.translation.z).toBe(35)
    expect(c.translation.y).toBeGreaterThan(0)
  })
})
