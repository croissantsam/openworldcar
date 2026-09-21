/**
 * OsmWorkerClient — main-thread façade for `osm.worker.ts`.
 *
 * Sends OSM fetch+parse+generate work to a background thread and resolves
 * with the finished ChunkMap. If Workers are unavailable (CSP, old browser)
 * or the worker errors, callers fall back to the main-thread
 * `fetchOsmChunksForArea` / `fetchRealOsmArea` in LiveOsmFetcher.
 */

import type { GeoPosition, WorldPosition } from '@world-drive/math'
import type { WorldChunk } from '@world-drive/shared'
import type { ChunkMap } from '@world-drive/world-data'
import type {
  OsmWorkerRequest,
  OsmWorkerResponse,
} from './osm.worker.js'
import type { RealOsmAreaResult } from './LiveOsmFetcher.js'

type Pending = {
  resolveStream: ((chunks: ChunkMap | null) => void) | null
  resolveInitial: ((result: RealOsmAreaResult | null) => void) | null
}

export class OsmWorkerClient {
  private worker: Worker | null = null
  private nextId = 1
  private pending = new Map<number, Pending>()
  /** False once we know Workers can't be used here (construction threw). */
  private supported = true

  get available(): boolean {
    return this.supported
  }

  private _ensure(): Worker | null {
    if (!this.supported) return null
    if (this.worker) return this.worker
    try {
      this.worker = new Worker(new URL('./osm.worker.ts', import.meta.url), { type: 'module' })
    } catch (err) {
      console.warn('[OsmWorker] Workers unavailable, falling back to main thread:', err)
      this.supported = false
      return null
    }
    this.worker.onmessage = (event: MessageEvent<OsmWorkerResponse>) => {
      this._onMessage(event.data)
    }
    this.worker.onerror = (event) => {
      console.warn('[OsmWorker] Worker error, failing pending requests:', event.message)
      // Fail every pending request so callers can fall back / retry.
      for (const [id, p] of this.pending) {
        this.pending.delete(id)
        p.resolveStream?.(null)
        p.resolveInitial?.(null)
      }
    }
    return this.worker
  }

  private _onMessage(msg: OsmWorkerResponse): void {
    const p = this.pending.get(msg.id)
    if (!p) return
    this.pending.delete(msg.id)
    if (msg.kind === 'stream-done') {
      p.resolveStream?.(new Map<string, WorldChunk>(msg.chunks))
      return
    }
    if (msg.kind === 'initial-done') {
      p.resolveInitial?.({
        chunks: new Map<string, WorldChunk>(msg.chunks),
        spawnPoint: msg.spawnPoint,
        spawnHeading: msg.spawnHeading,
        ...(msg.streetName ? { streetName: msg.streetName } : {}),
        totalRoads: msg.totalRoads,
        totalBuildings: msg.totalBuildings,
      })
      return
    }
    // 'failed': null so the caller applies its normal retry / fallback path.
    p.resolveStream?.(null)
    p.resolveInitial?.(null)
  }

  /**
   * Fetch + parse + generate chunks for a circular area in the worker.
   * Resolves null on download failure (caller retries later per its cooldown).
   * Resolves an (empty) Map when the area genuinely has no roads.
   * Rejects when Workers are unavailable — the caller then uses the
   * main-thread fallback.
   */
  fetchStreamChunks(
    center: GeoPosition,
    radius: number,
    origin: GeoPosition,
    signal?: AbortSignal,
  ): Promise<ChunkMap | null> {
    const worker = this._ensure()
    if (!worker) return Promise.reject(new Error('workers-unavailable'))
    const id = this.nextId++
    const req: OsmWorkerRequest = { kind: 'stream', id, center, radius, origin }
    return new Promise<ChunkMap | null>((resolve) => {
      this.pending.set(id, { resolveStream: resolve, resolveInitial: null })
      if (signal) {
        if (signal.aborted) {
          this.pending.delete(id)
          resolve(null)
          return
        }
        signal.addEventListener(
          'abort',
          () => {
            if (this.pending.has(id)) {
              this.pending.delete(id)
              try {
                worker.postMessage({ kind: 'abort', id } satisfies OsmWorkerRequest)
              } catch {
                // ignore post-abort races
              }
              resolve(null)
            }
          },
          { once: true },
        )
      }
      try {
        worker.postMessage(req)
      } catch (err) {
        this.pending.delete(id)
        console.warn('[OsmWorker] postMessage failed:', err)
        resolve(null)
      }
    })
  }

  /**
   * Fetch + parse + generate the initial area (with spawn search) in the worker.
   * Resolves null on failure / empty area — the caller keeps its current world.
   * Rejects when Workers are unavailable.
   */
  fetchInitialArea(
    origin: GeoPosition,
    radius: number,
    preferredSpawn?: WorldPosition,
    preferredHeading?: number,
    signal?: AbortSignal,
  ): Promise<RealOsmAreaResult | null> {
    const worker = this._ensure()
    if (!worker) return Promise.reject(new Error('workers-unavailable'))
    const id = this.nextId++
    const req: OsmWorkerRequest = {
      kind: 'initial',
      id,
      origin,
      radius,
      ...(preferredSpawn ? { preferredSpawn } : {}),
      ...(preferredHeading !== undefined ? { preferredHeading } : {}),
    }
    return new Promise<RealOsmAreaResult | null>((resolve) => {
      this.pending.set(id, { resolveStream: null, resolveInitial: resolve })
      if (signal) {
        if (signal.aborted) {
          this.pending.delete(id)
          resolve(null)
          return
        }
        signal.addEventListener(
          'abort',
          () => {
            if (this.pending.has(id)) {
              this.pending.delete(id)
              try {
                worker.postMessage({ kind: 'abort', id } satisfies OsmWorkerRequest)
              } catch {
                // ignore
              }
              resolve(null)
            }
          },
          { once: true },
        )
      }
      try {
        worker.postMessage(req)
      } catch (err) {
        this.pending.delete(id)
        console.warn('[OsmWorker] postMessage failed:', err)
        resolve(null)
      }
    })
  }

  /** Abort a request (the worker drops its result). */
  abort(id: number): void {
    try {
      this.worker?.postMessage({ kind: 'abort', id } satisfies OsmWorkerRequest)
    } catch {
      // ignore
    }
  }

  dispose(): void {
    for (const [id, p] of this.pending) {
      this.pending.delete(id)
      p.resolveStream?.(null)
      p.resolveInitial?.(null)
    }
    try {
      this.worker?.terminate()
    } catch {
      // ignore
    }
    this.worker = null
  }
}
