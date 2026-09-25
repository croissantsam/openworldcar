import { describe, expect, it } from 'vitest'
import {
  CHUNK_SIZE,
  worldToChunk,
  chunkToWorld,
  chunkCenter,
  chunkKey,
  parseChunkKey,
  surroundingChunks,
  distanceToChunkM,
} from './chunk.js'

describe('chunk grid', () => {
  it('uses 500 m chunks', () => {
    expect(CHUNK_SIZE).toBe(500)
  })

  it('maps world positions to chunk indices with floor semantics', () => {
    expect(worldToChunk({ x: 0, y: 0, z: 0 })).toEqual({ x: 0, z: 0, level: 0 })
    expect(worldToChunk({ x: 499.9, y: 0, z: 499.9 })).toEqual({ x: 0, z: 0, level: 0 })
    expect(worldToChunk({ x: 500, y: 0, z: -0.1 })).toEqual({ x: 1, z: -1, level: 0 })
    expect(worldToChunk({ x: -1, y: 0, z: -500 })).toEqual({ x: -1, z: -1, level: 0 })
  })

  it('doubles the cell size per LOD level', () => {
    expect(worldToChunk({ x: 600, y: 0, z: 600 }, 1)).toEqual({ x: 0, z: 0, level: 1 })
    expect(worldToChunk({ x: 1200, y: 0, z: 0 }, 1)).toEqual({ x: 1, z: 0, level: 1 })
  })

  it('inverts chunkToWorld / chunkCenter consistently', () => {
    const id = { x: 2, z: -3, level: 0 }
    expect(chunkToWorld(id)).toEqual({ x: 1000, y: 0, z: -1500 })
    expect(chunkCenter(id)).toEqual({ x: 1250, y: 0, z: -1250 })
    // The centre of a chunk maps back to that chunk.
    expect(worldToChunk(chunkCenter(id))).toEqual(id)
  })

  it('serialises chunk ids to stable, parseable keys', () => {
    const id = { x: -4, z: 7, level: 0 }
    expect(parseChunkKey(chunkKey(id))).toEqual(id)
  })

  it('measures the gap to a chunk square (0 inside)', () => {
    // Chunk (0,0) spans x,z ∈ [0,500).
    expect(distanceToChunkM({ x: 100, y: 0, z: 100 }, { x: 0, z: 0, level: 0 })).toBe(0)
    expect(distanceToChunkM({ x: 500, y: 0, z: 250 }, { x: 0, z: 0, level: 0 })).toBe(0)
    expect(distanceToChunkM({ x: 600, y: 0, z: 250 }, { x: 0, z: 0, level: 0 })).toBeCloseTo(100, 9)
    expect(distanceToChunkM({ x: 900, y: 0, z: 900 }, { x: 0, z: 0, level: 0 })).toBeCloseTo(
      Math.hypot(400, 400),
      9,
    )
  })

  it('returns the full neighbourhood square for a radius', () => {
    const center = { x: 10, z: 10, level: 0 }
    expect(surroundingChunks(center, 0)).toHaveLength(1)
    expect(surroundingChunks(center, 1)).toHaveLength(9)
    expect(surroundingChunks(center, 2)).toHaveLength(25)
    const keys = new Set(surroundingChunks(center, 1).map(chunkKey))
    expect(keys.has(chunkKey(center))).toBe(true)
    expect(keys.has(chunkKey({ x: 11, z: 9, level: 0 }))).toBe(true)
  })
})
