import { describe, expect, it, vi } from 'vitest'
import { OsmStreamingManager } from './OsmStreamingManager.js'

const PARIS = { latitude: 48.8648, longitude: 2.349 }

function flush(ms = 20): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

describe('OsmStreamingManager (§12 single pipeline / §29 OSM outage)', () => {
  it('fetches uncovered areas through the one streaming path', async () => {
    const fetchFn = vi.fn().mockResolvedValue(null)
    const manager = new OsmStreamingManager(fetchFn)
    manager.update(PARIS, { x: 0, z: 0 })
    await flush()
    expect(fetchFn).toHaveBeenCalledOnce()
  })

  it('delivers fetched chunks through onChunksReady', async () => {
    const { generateChunks } = await import('@world-drive/world-data')
    const chunks = generateChunks([], [], [])
    const fetchFn = vi.fn().mockResolvedValue(chunks)
    const manager = new OsmStreamingManager(fetchFn)
    const onReady = vi.fn()
    manager.onChunksReady = onReady
    manager.update(PARIS, { x: 0, z: 0 })
    await flush()
    // Empty delivery (no roads here): covered, no callback.
    expect(fetchFn).toHaveBeenCalledOnce()
    expect(onReady).not.toHaveBeenCalled()
  })

  it('reset() aborts coverage so the area refetches', async () => {
    const fetchFn = vi.fn().mockResolvedValue(null)
    const manager = new OsmStreamingManager(fetchFn)
    manager.update(PARIS, { x: 0, z: 0 })
    await flush()
    expect(fetchFn).toHaveBeenCalledOnce()
    manager.reset()
    manager.update({ latitude: 48.8649, longitude: 2.3491 }, { x: 0, z: 0 })
    await flush()
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })
})
