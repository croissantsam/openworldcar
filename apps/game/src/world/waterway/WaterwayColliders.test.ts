import { describe, expect, it } from 'vitest'
import RAPIER from '@dimforge/rapier3d-compat'
import type { Waterway } from '@world-drive/shared'
import { WaterwayMeshGenerator } from './WaterwayMeshGenerator.js'

describe('WaterwayMeshGenerator river parapet colliders', () => {
  it('generates solid cuboid colliders for linear river banks', () => {
    const river: Waterway = {
      id: '201',
      type: 'river',
      points: [
        { x: -50, y: 0, z: 0 },
        { x: 0, y: 0, z: 0 },
        { x: 50, y: 0, z: 0 },
      ],
      width: 40,
    }

    const chunkId = { x: 0, z: 0, level: 0 }
    const descs = WaterwayMeshGenerator.createColliderDescs(river, chunkId)

    // A wide river (width=40) must generate parapet colliders on both left & right banks
    expect(descs.length).toBeGreaterThan(0)

    // Colliders must be cuboids positioned at parapet height (~0.46m)
    for (const desc of descs) {
      expect(desc).toBeInstanceOf(RAPIER.ColliderDesc)
      expect(desc.translation.y).toBeCloseTo(0.46, 1)
    }
  })

  it('skips parapet colliders for narrow streams/ditches', () => {
    const narrowStream: Waterway = {
      id: '202',
      type: 'stream',
      points: [
        { x: -20, y: 0, z: 0 },
        { x: 20, y: 0, z: 0 },
      ],
      width: 4, // halfWidth = 2 < 8m -> no parapet
    }

    const chunkId = { x: 0, z: 0, level: 0 }
    const descs = WaterwayMeshGenerator.createColliderDescs(narrowStream, chunkId)
    expect(descs.length).toBe(0)
  })

  it('generates perimeter colliders for polygon basins/water bodies', () => {
    const basin: Waterway = {
      id: '203',
      type: 'basin',
      width: 0,
      points: [
        { x: 10, y: 0, z: 10 },
        { x: 40, y: 0, z: 10 },
        { x: 40, y: 0, z: 40 },
        { x: 10, y: 0, z: 40 },
      ],
      isPolygon: true,
    }

    const chunkId = { x: 0, z: 0, level: 0 }
    const descs = WaterwayMeshGenerator.createColliderDescs(basin, chunkId)
    expect(descs.length).toBe(4) // 4 sides of the basin
    for (const desc of descs) {
      expect(desc.translation.y).toBeCloseTo(0.46, 1)
    }
  })
})
