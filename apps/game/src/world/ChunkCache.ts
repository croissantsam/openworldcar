/**
 * ChunkCache — LRU cache for loaded chunk data.
 * Prevents re-fetching recently visited chunks.
 */

import type { WorldChunk } from '@world-drive/shared'
import type { ChunkId } from '@world-drive/math'
import { chunkKey } from '@world-drive/math'

const MAX_CACHE_SIZE = 64

export class ChunkCache {
  /** Ordered by insertion (oldest first). */
  private cache = new Map<string, WorldChunk>()

  get(id: ChunkId): WorldChunk | undefined {
    const key = chunkKey(id)
    const chunk = this.cache.get(key)
    if (chunk) {
      // LRU: move to end
      this.cache.delete(key)
      this.cache.set(key, chunk)
    }
    return chunk
  }

  set(id: ChunkId, chunk: WorldChunk): void {
    const key = chunkKey(id)
    if (this.cache.has(key)) {
      this.cache.delete(key)
    } else if (this.cache.size >= MAX_CACHE_SIZE) {
      // Evict oldest
      const oldest = this.cache.keys().next().value
      if (oldest) this.cache.delete(oldest)
    }
    this.cache.set(key, chunk)
  }

  has(id: ChunkId): boolean {
    return this.cache.has(chunkKey(id))
  }

  clear(): void {
    this.cache.clear()
  }

  get size(): number {
    return this.cache.size
  }
}
