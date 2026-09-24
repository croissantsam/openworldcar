import { describe, expect, it, beforeAll } from 'vitest'
import { setWorldOrigin, chunkKey } from '@world-drive/math'
import { generateChunks } from './generator.js'
import type { Road } from '@world-drive/shared'

beforeAll(() => {
  // Origin at (0,0): chunk (0,0) spans x,z ∈ [0,500).
  setWorldOrigin({ latitude: 0, longitude: 0 })
})

function road(id: string, points: { x: number; y: number; z: number }[]): Road {
  return {
    id,
    highway: 'residential',
    lanes: 2,
    bridge: false,
    tunnel: false,
    layer: 0,
    elevationMode: 'ground',
    points,
  }
}

describe('generateChunks', () => {
  it('returns an empty map for empty input', () => {
    expect(generateChunks([], [], []).size).toBe(0)
  })

  it('buckets a road into every chunk its points touch', () => {
    const r = road('r1', [
      { x: 100, y: 0, z: 100 },
      { x: 600, y: 0, z: 100 },
    ])
    const map = generateChunks([r], [], [])
    expect(map.has(chunkKey({ x: 0, z: 0, level: 0 }))).toBe(true)
    expect(map.has(chunkKey({ x: 1, z: 0, level: 0 }))).toBe(true)
    for (const chunk of map.values()) {
      expect(chunk.roads.map((rr) => rr.id)).toContain('r1')
    }
  })

  it('places buildings by their first footprint point', () => {
    const map = generateChunks(
      [],
      [
        {
          id: 'b1',
          footprint: [
            { x: 1200, y: 0, z: -100 },
            { x: 1210, y: 0, z: -100 },
            { x: 1210, y: 0, z: -90 },
          ],
          height: 9,
          levels: 3,
        },
      ],
      [],
    )
    const chunk = map.get(chunkKey({ x: 2, z: -1, level: 0 }))
    expect(chunk?.buildings.map((b) => b.id)).toEqual(['b1'])
  })
})
