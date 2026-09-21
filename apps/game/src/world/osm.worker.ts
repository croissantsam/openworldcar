/**
 * osm.worker — OpenStreetMap fetch + parse + chunk generation OFF the main thread.
 *
 * Driving must never hitch while new map data arrives: the multi-hundred-ms
 * work (5 MB XML regex parsing, building/road normalization, chunk bucketing
 * with the O(buildings × roads) overlap filter) runs here, in a separate
 * thread. The main thread only receives the finished ChunkMap via postMessage
 * and swaps geometry in through ChunkManager's frame-budgeted build queue.
 *
 * Bundled by Vite as a module worker (`new Worker(new URL(...), { type: 'module' })`).
 * Worker-safe imports only: no THREE, no Rapier, no DOM.
 */

import type { GeoPosition, WorldPosition } from '@world-drive/math'
import { setWorldOrigin } from '@world-drive/math'
import type { WorldChunk } from '@world-drive/shared'
import { generateChunks } from '@world-drive/world-data'
import {
  bboxForCenter,
  fetchOsmXml,
  findSpawnPoint,
  parseOsmXml,
  poisFromNodes,
} from './osm-parse.js'

export type OsmWorkerStreamRequest = {
  kind: 'stream'
  id: number
  center: GeoPosition
  radius: number
  /** Projection origin active on the main thread (deterministic geo→world). */
  origin: GeoPosition
}

export type OsmWorkerInitialRequest = {
  kind: 'initial'
  id: number
  origin: GeoPosition
  radius: number
  preferredSpawn?: WorldPosition
  preferredHeading?: number
}

export type OsmWorkerRequest = OsmWorkerStreamRequest | OsmWorkerInitialRequest | { kind: 'abort'; id: number }

export type OsmWorkerResponse =
  | {
      kind: 'stream-done'
      id: number
      /** ChunkMap as entries (structured-cloned). Empty array = genuinely empty area. */
      chunks: [string, WorldChunk][]
      totalRoads: number
      totalBuildings: number
    }
  | {
      kind: 'initial-done'
      id: number
      chunks: [string, WorldChunk][]
      spawnPoint: WorldPosition
      spawnHeading: number
      streetName?: string
      totalRoads: number
      totalBuildings: number
    }
  | { kind: 'failed'; id: number; reason: string }

const pending = new Map<number, AbortController>()

function post(msg: OsmWorkerResponse): void {
  postMessage(msg)
}

async function handleStream(req: OsmWorkerStreamRequest): Promise<void> {
  const ctrl = new AbortController()
  pending.set(req.id, ctrl)
  try {
    const bbox = bboxForCenter(req.center, req.radius)
    const xmlText = await fetchOsmXml(bbox, ctrl.signal)
    if (ctrl.signal.aborted) return
    if (!xmlText || xmlText.length < 50) {
      post({ kind: 'failed', id: req.id, reason: 'download' })
      return
    }
    // Origin-relative projection must match the main thread exactly.
    setWorldOrigin(req.origin)
    const { roads, buildings, waterways, parks, taggedNodes } = parseOsmXml(xmlText)
    if (ctrl.signal.aborted) return
    const pois = poisFromNodes(taggedNodes)
    console.info(
      `[LiveOsmFetcher] ${taggedNodes.length} tagged nodes parsed → ${pois.length} POIs (${roads.length} roads, ${buildings.length} buildings)`,
    )
    if (roads.length === 0) {
      post({ kind: 'stream-done', id: req.id, chunks: [], totalRoads: 0, totalBuildings: buildings.length })
      return
    }
    const chunks = generateChunks(roads, buildings, pois, waterways, parks)
    if (ctrl.signal.aborted) return
    post({
      kind: 'stream-done',
      id: req.id,
      chunks: [...chunks.entries()],
      totalRoads: roads.length,
      totalBuildings: buildings.length,
    })
  } catch (err) {
    if (ctrl.signal.aborted) return
    post({ kind: 'failed', id: req.id, reason: (err as Error)?.message ?? 'parse' })
  } finally {
    if (pending.get(req.id) === ctrl) pending.delete(req.id)
  }
}

async function handleInitial(req: OsmWorkerInitialRequest): Promise<void> {
  const ctrl = new AbortController()
  pending.set(req.id, ctrl)
  try {
    const bbox = bboxForCenter(req.origin, req.radius)
    const xmlText = await fetchOsmXml(bbox, ctrl.signal)
    if (ctrl.signal.aborted) return
    if (!xmlText || xmlText.length < 50) {
      post({ kind: 'failed', id: req.id, reason: 'download' })
      return
    }
    setWorldOrigin(req.origin)
    const { roads, buildings, waterways, parks, taggedNodes } = parseOsmXml(xmlText)
    if (ctrl.signal.aborted) return
    const pois = poisFromNodes(taggedNodes)
    console.info(
      `[LiveOsmFetcher] ${taggedNodes.length} tagged nodes parsed → ${pois.length} POIs (${roads.length} roads, ${buildings.length} buildings)`,
    )
    if (roads.length === 0) {
      post({ kind: 'failed', id: req.id, reason: 'empty' })
      return
    }
    const chunks = generateChunks(roads, buildings, pois, waterways, parks)
    if (ctrl.signal.aborted) return
    const spawn = findSpawnPoint(roads, req.preferredSpawn, req.preferredHeading)
    post({
      kind: 'initial-done',
      id: req.id,
      chunks: [...chunks.entries()],
      spawnPoint: spawn.spawnPoint,
      spawnHeading: spawn.spawnHeading,
      ...(spawn.streetName ? { streetName: spawn.streetName } : {}),
      totalRoads: roads.length,
      totalBuildings: buildings.length,
    })
  } catch (err) {
    if (ctrl.signal.aborted) return
    post({ kind: 'failed', id: req.id, reason: (err as Error)?.message ?? 'parse' })
  } finally {
    if (pending.get(req.id) === ctrl) pending.delete(req.id)
  }
}

addEventListener('message', (event: MessageEvent<OsmWorkerRequest>) => {
  const req = event.data
  if (req.kind === 'abort') {
    pending.get(req.id)?.abort()
    pending.delete(req.id)
    return
  }
  if (req.kind === 'stream') {
    void handleStream(req)
    return
  }
  if (req.kind === 'initial') {
    void handleInitial(req)
    return
  }
})
