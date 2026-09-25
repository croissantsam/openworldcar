import { describe, expect, it } from 'vitest'
import { chunkKey } from '@world-drive/math'
import type { WorldChunk } from '@world-drive/shared'
import { ChunkLoader } from './ChunkLoader.js'

/**
 * Streamed-data lifecycle: the loader store must stay proportional to the
 * loaded area. Unloading a chunk drops its data (it re-streams on demand),
 * so the map can't grow with every kilometre driven.
 */
describe('ChunkLoader data lifecycle', () => {
  const id = { x: 3, z: -2, level: 0 }
  const key = chunkKey(id)
  const chunk: WorldChunk = {
    id,
    roads: [],
    buildings: [],
    pointsOfInterest: [],
    waterways: [],
    parks: [],
  }

  it('serves streamed data, then forgets it on drop', async () => {
    const loader = new ChunkLoader()
    loader.setRealOsmChunks(new Map([[key, chunk]]))
    expect(await loader.resolveData(id)).toBe(chunk)
    loader.dropData(key)
    expect(await loader.resolveData(id)).toBe('pending')
  })

  it('dropping an unknown key is a no-op', async () => {
    const loader = new ChunkLoader()
    loader.dropData('9:9:0')
    expect(await loader.resolveData(id)).toBe('pending')
  })
})
