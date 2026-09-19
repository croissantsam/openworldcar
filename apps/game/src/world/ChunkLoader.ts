/**
 * ChunkLoader — fetches chunk data and builds scene objects.
 *
 * Designed for async, non-blocking loading.
 * Each load request is a separate async task.
 */

import * as THREE from 'three'
import type { WorldChunk, Road, Park } from '@world-drive/shared'
import {
  chunkKey,
  chunkCenter,
  chunkToWorld,
  CHUNK_SIZE,
  DEFAULT_ORIGIN,
  type GeoPosition,
  type ChunkId,
} from '@world-drive/math'
import { RoadMeshGenerator } from './RoadMeshGenerator.js'
import { BuildingMeshGenerator } from './BuildingMeshGenerator.js'
import { WaterwayMeshGenerator } from './WaterwayMeshGenerator.js'
import { ParkMeshGenerator } from './ParkMeshGenerator.js'
import { StreetFurnitureGenerator } from './StreetFurnitureGenerator.js'
import { StorefrontGenerator } from './StorefrontGenerator.js'
import { ChunkCache } from './ChunkCache.js'
import { optimizeChunkGroup, optimizeChunkGroupIncremental } from './ChunkOptimizer.js'
import { deduplicateBuildings } from '@world-drive/world-data'

/**
 * Upstream deduplication compares outer rings only: a courtyard block (holes)
 * would "overlap" the buildings standing inside its courtyard. Courtyard blocks
 * are therefore kept as they are and the rule applies to the others.
 */
function dedupeBuildings(buildings: WorldChunk['buildings']): WorldChunk['buildings'] {
  const courtyards = buildings.filter((b) => (b.holes?.length ?? 0) > 0)
  if (courtyards.length === 0) return deduplicateBuildings(buildings)
  return [...deduplicateBuildings(buildings.filter((b) => (b.holes?.length ?? 0) === 0)), ...courtyards]
}

export type LoadedChunk = {
  id: ChunkId
  group: THREE.Group
  data: WorldChunk
}

/**
 * Result type for chunk loading.
 * - LoadedChunk: successfully loaded with OSM data
 * - null: chunk has real data but it's empty (ocean/park) — permanently missing
 * - 'pending': no OSM data yet, retry after OsmStreamingManager delivers data
 */
export type LoadResult = LoadedChunk | null | 'pending'

/** Data-only result: same lookup order as load(), without building meshes. */
export type ResolvedChunk = WorldChunk | null | 'pending'

type Keyed = { id: string }

function appendMissing<T extends Keyed>(target: T[], source: readonly T[] | undefined): void {
  if (!source || source.length === 0) return
  const seen = new Set(target.map((f) => f.id))
  for (const f of source) {
    if (!seen.has(f.id)) {
      seen.add(f.id)
      target.push(f)
    }
  }
}

/**
 * Union of two chunks' features by id (fresh object; inputs are not mutated).
 * Consecutive OSM fetches overlap: each delivery is only a partial view of a
 * chunk, so deliveries must be accumulated, never used as replacements.
 */
export function unionWorldChunk(base: WorldChunk, extra: WorldChunk): WorldChunk {
  const out: WorldChunk = {
    id: base.id,
    roads: [...base.roads],
    buildings: [...base.buildings],
    pointsOfInterest: [...base.pointsOfInterest],
    waterways: [...(base.waterways ?? [])],
    parks: [...(base.parks ?? [])],
    railways: [...(base.railways ?? [])],
    barriers: [...(base.barriers ?? [])],
  }
  appendMissing(out.roads, extra.roads)
  appendMissing(out.buildings, extra.buildings)
  out.buildings = dedupeBuildings(out.buildings)
  appendMissing(out.pointsOfInterest, extra.pointsOfInterest)
  appendMissing(out.waterways, extra.waterways)
  appendMissing(out.parks, extra.parks)
  appendMissing(out.railways, extra.railways)
  appendMissing(out.barriers!, extra.barriers)
  return out
}

/** Rough main-thread cost (ms) of generating one road's meshes. */
function estimateRoadMs(road: Road): number {
  const elevated = road.elevationMode === 'bridge' || road.elevationMode === 'tunnel' || road.bridge || road.tunnel
  return 0.2 + 0.02 * road.points.length + (elevated ? 2.5 : 0)
}

/** Rough main-thread cost (ms) of generating one park (trees scale with area). */
function estimateParkMs(park: Park): number {
  const pts = park.polygon
  if (!pts || pts.length < 3) return 0.3
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
  for (const p of pts) {
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.z < minZ) minZ = p.z
    if (p.z > maxZ) maxZ = p.z
  }
  const area = (maxX - minX) * (maxZ - minZ)
  return Math.min(9, 0.6 + area / 6000)
}

/** Prefixed ids of every feature in a chunk (arrays use separate id spaces). */
export function chunkFeatureIds(chunk: WorldChunk): string[] {
  const ids: string[] = []
  for (const r of chunk.roads) ids.push('r' + r.id)
  for (const b of chunk.buildings) ids.push('b' + b.id)
  for (const p of chunk.pointsOfInterest) ids.push('p' + p.id)
  for (const w of chunk.waterways ?? []) ids.push('w' + w.id)
  for (const k of chunk.parks ?? []) ids.push('k' + k.id)
  for (const l of chunk.railways ?? []) ids.push('l' + l.id)
  for (const x of chunk.barriers ?? []) ids.push('x' + x.id)
  return ids
}

/**
 * The features of `incoming` whose prefixed id is not in `known`, or null
 * when the delivery brings nothing new for this chunk.
 */
export function chunkDelta(known: ReadonlySet<string>, incoming: WorldChunk): WorldChunk | null {
  const out: WorldChunk = {
    id: incoming.id,
    roads: incoming.roads.filter((f) => !known.has('r' + f.id)),
    buildings: incoming.buildings.filter((f) => !known.has('b' + f.id)),
    pointsOfInterest: incoming.pointsOfInterest.filter((f) => !known.has('p' + f.id)),
    waterways: (incoming.waterways ?? []).filter((f) => !known.has('w' + f.id)),
    parks: (incoming.parks ?? []).filter((f) => !known.has('k' + f.id)),
    railways: (incoming.railways ?? []).filter((f) => !known.has('l' + f.id)),
    barriers: (incoming.barriers ?? []).filter((f) => !known.has('x' + f.id)),
  }
  const n =
    out.roads.length +
    out.buildings.length +
    out.pointsOfInterest.length +
    out.waterways.length +
    out.parks.length +
    out.railways.length +
    (out.barriers?.length ?? 0)
  return n === 0 ? null : out
}

// Continuous urban sub-base bedrock slab with 4m overlap across chunks (zero seams)
const URBAN_SLAB_GEOMETRY = new THREE.PlaneGeometry(CHUNK_SIZE + 4, CHUNK_SIZE + 4)
const URBAN_SLAB_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0x7c7872, // Warm Parisian stone pavement foundation
  roughness: 0.88,
  metalness: 0.04,
  // Stencil TEST only (three.js enables the test through stencilWrite; mask 0 = no writes):
  // tunnel trench masks (ref 1, drawn first) cut the slab so descending ramps stay visible.
  stencilWrite: true,
  stencilWriteMask: 0,
  stencilRef: 1,
  stencilFunc: THREE.NotEqualStencilFunc,
})

export class ChunkLoader {
  private cache = new ChunkCache()
  /** Base URL where chunk JSON files are served. */
  private baseUrl: string
  private currentOrigin: GeoPosition = DEFAULT_ORIGIN
  private realOsmChunks = new Map<string, WorldChunk>()
  onGeneratingChange?: (isGenerating: boolean, chunkId: ChunkId) => void

  constructor(baseUrl = '/chunks', origin: GeoPosition = DEFAULT_ORIGIN) {
    this.baseUrl = baseUrl
    this.currentOrigin = origin
  }

  setBaseUrl(url: string): void {
    this.baseUrl = url
  }

  setOrigin(origin: GeoPosition): void {
    this.currentOrigin = origin
  }

  /**
   * Set real OSM chunks dynamically (called when OsmStreamingManager fetches OSM data).
   */
  setRealOsmChunks(chunks: Map<string, WorldChunk>): void {
    for (const [k, v] of chunks) {
      this.realOsmChunks.set(k, v)
      // Never let a stale cached entry shadow freshly fetched data
      this.cache.delete(k)
    }
  }

  /**
   * Merge new OSM data into the existing set without clearing the cache.
   * Used by OsmStreamingManager to add new zones incrementally.
   */
  mergeRealOsmChunks(newChunks: Map<string, WorldChunk>): void {
    for (const [key, chunk] of newChunks) {
      // Accumulate: a delivery only covers the part of the chunk inside its
      // fetch bbox, so replacing would drop everything outside it.
      const existing = this.realOsmChunks.get(key)
      this.realOsmChunks.set(key, existing ? unionWorldChunk(existing, chunk) : chunk)
      // Evict the old cached entry so the next load uses the real OSM data
      this.cache.delete(key)
    }
  }

  /**
   * Resolve a chunk's DATA (cache → streamed OSM → static JSON) without
   * building any meshes. The ChunkManager builds them incrementally.
   */
  async resolveData(id: ChunkId): Promise<ResolvedChunk> {
    const cached = this.cache.get(id)
    if (cached) return cached

    const key = chunkKey(id)
    const realOsmChunk = this.realOsmChunks.get(key)
    if (realOsmChunk) {
      this.cache.set(id, realOsmChunk)
      return realOsmChunk
    }

    const url = `${this.baseUrl}/chunk_${id.x}_${id.z}.json`
    try {
      const resp = await fetch(url)
      if (resp.status === 404) {
        return 'pending'
      }
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status} ${resp.statusText}`)
      }
      // Dev servers answer unknown paths with index.html (200): not a chunk.
      const ctype = resp.headers.get('content-type') ?? ''
      if (!ctype.includes('json')) {
        return 'pending'
      }
      const data: WorldChunk = await resp.json()
      this.cache.set(id, data)
      return data
    } catch (err) {
      console.warn(`[ChunkLoader] Failed to load ${key}:`, err)
      return null
    }
  }

  /**
   * Incremental twin of _buildGroup: identical scene output, but yields after
   * every feature and inside the optimizer so the work can be spread over
   * frames. `withSlab` adds the ground slab (full chunk build); merge deltas
   * are built without one.
   */
  *buildGroupIncremental(
    chunk: WorldChunk,
    allRoads: readonly Road[],
    withSlab: boolean,
  ): Generator<number | void, THREE.Group, void> {
    const group = new THREE.Group()
    group.name = `chunk_${chunkKey(chunk.id)}`

    if (withSlab) {
      const center = chunkCenter(chunk.id)
      const slabMesh = new THREE.Mesh(URBAN_SLAB_GEOMETRY, URBAN_SLAB_MATERIAL)
      slabMesh.rotation.x = -Math.PI / 2
      slabMesh.position.set(center.x, 0.001, center.z)
      slabMesh.receiveShadow = true
      slabMesh.renderOrder = 0
      slabMesh.userData['skipMerge'] = true
      group.add(slabMesh)
    }

    // Each yield announces the rough cost (ms) of the NEXT step so the
    // scheduler can defer heavy ones to a slice that can afford them.
    for (const waterway of chunk.waterways ?? []) {
      yield 1.0
      const mesh = WaterwayMeshGenerator.generate(waterway)
      if (mesh) group.add(mesh)
    }
    const chunkPois = chunk.pointsOfInterest ?? []
    for (const park of chunk.parks ?? []) {
      yield estimateParkMs(park)
      const parkGroup = ParkMeshGenerator.generate(park, allRoads as Road[], chunkPois)
      if (parkGroup) group.add(parkGroup)
    }
    const pois = chunk.pointsOfInterest ?? []
    const hasRealLamps = pois.some((p) => p.kind === 'street_lamp')
    for (const road of chunk.roads) {
      yield estimateRoadMs(road)
      // The generator builds only this cell's portions of the way (junction-aware
      // cuts at the cell border), so the full way is passed rather than a clipped one.
      const roadGroup = RoadMeshGenerator.generate(road, allRoads as Road[], { syntheticLamps: !hasRealLamps, cell: { x: chunk.id.x, z: chunk.id.z } })
      if (roadGroup) group.add(roadGroup)
    }
    const uniqueBuildings = dedupeBuildings(chunk.buildings)
    for (const building of uniqueBuildings) {
      yield 0.2 + 0.03 * building.footprint.length
      const buildingGroup = BuildingMeshGenerator.generate(building)
      if (buildingGroup) group.add(buildingGroup)
    }

    // Street-level reality from tagged nodes (instanced; cheap per chunk)
    if (pois.length > 0) {
      // Measured: ~0.05 ms per POI (instancing) and ~0.07 ms per POI for the
      // signage atlas (canvas text); announced so heavy chunks run in idle slices.
      yield 2 + pois.length * 0.05
      const furniture = StreetFurnitureGenerator.generate(pois, allRoads as Road[], chunk.buildings)
      if (furniture) group.add(furniture)
      yield 2 + pois.length * 0.07
      const storefronts = StorefrontGenerator.generate(pois, chunk.buildings, allRoads as Road[])
      if (storefronts) group.add(storefronts)
    }

    return yield* optimizeChunkGroupIncremental(group)
  }

  clearCache(): void {
    this.cache.clear()
    this.realOsmChunks.clear()
  }

  /**
   * Loads a chunk by ID asynchronously.
   * Priority:
   * 1. In-memory cache
   * 2. Real-time OSM streamed chunks (from Overpass API)
   * 3. Static JSON files in /chunks/
   */
  async load(id: ChunkId, _scene?: THREE.Scene): Promise<LoadResult> {
    const cached = this.cache.get(id)
    if (cached) {
      const group = this._buildGroup(cached)
      return { id, group, data: cached }
    }

    const key = chunkKey(id)
    const realOsmChunk = this.realOsmChunks.get(key)
    if (realOsmChunk) {
      this.cache.set(id, realOsmChunk)
      const group = this._buildGroup(realOsmChunk)
      return { id, group, data: realOsmChunk }
    }

    const url = `${this.baseUrl}/chunk_${id.x}_${id.z}.json`
    try {
      const resp = await fetch(url)
      if (resp.status === 404) {
        return 'pending'
      }
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status} ${resp.statusText}`)
      }
      const data: WorldChunk = await resp.json()
      this.cache.set(id, data)
      const group = this._buildGroup(data)
      return { id, group, data }
    } catch (err) {
      console.warn(`[ChunkLoader] Failed to load ${key}:`, err)
      return null
    }
  }

  integrateStreamedOsm(chunk: WorldChunk): LoadedChunk {
    const key = chunkKey(chunk.id)
    this.realOsmChunks.set(key, chunk)
    this.cache.set(chunk.id, chunk)
    const group = this._buildGroup(chunk)
    return { id: chunk.id, group, data: chunk }
  }

  /**
   * Builds the complete Three.js visual group for a WorldChunk.
   * Strict architectural layering:
   * 0. Ground slab (bedrock sub-base)
   * 1. Waterways (rivers, canals, basins)
   * 2. Parks & green spaces
   * 3. Railways & tramways
   * 4. Road network (asphalt, sidewalks, lane markings)
   * 5. Bridges & Viaducts (elevated decks & piers)
   * 6. Buildings & 3D architecture
   */
  private _buildGroup(chunk: WorldChunk): THREE.Group {
    const group = new THREE.Group()
    group.name = `chunk_${chunkKey(chunk.id)}`

    // 0. Continuous Urban Pavement Ground Slab
    const center = chunkCenter(chunk.id)
    const slabMesh = new THREE.Mesh(URBAN_SLAB_GEOMETRY, URBAN_SLAB_MATERIAL)
    slabMesh.rotation.x = -Math.PI / 2
    slabMesh.position.set(center.x, 0.001, center.z)
    slabMesh.receiveShadow = true
    slabMesh.renderOrder = 0
    slabMesh.userData['skipMerge'] = true
    group.add(slabMesh)

    // 1. Waterways (rendered below roads so roads occlude river banks)
    for (const waterway of chunk.waterways ?? []) {
      const mesh = WaterwayMeshGenerator.generate(waterway)
      if (mesh) group.add(mesh)
    }

    // 2. Parks & Gardens (lush green lawns and 3D trees)
    for (const park of chunk.parks ?? []) {
      const parkGroup = ParkMeshGenerator.generate(park, chunk.roads)
      if (parkGroup) group.add(parkGroup)
    }

    // 3. Roads with markings and sidewalks
    // Each way is built once per cell it crosses (portions), never doubled at chunk borders
    for (const road of chunk.roads) {
      const roadGroup = RoadMeshGenerator.generate(road, chunk.roads, { cell: { x: chunk.id.x, z: chunk.id.z } })
      if (roadGroup) group.add(roadGroup)
    }

    // 4. Buildings with window textures
    for (const building of chunk.buildings) {
      const buildingGroup = BuildingMeshGenerator.generate(building)
      if (buildingGroup) group.add(buildingGroup)
    }

    // Consolidate static geometries to minimize draw calls by ~95%
    return optimizeChunkGroup(group)
  }

  /**
   * Build a ground-only group (no roads, no buildings) for a chunk that is
   * awaiting OSM data. Keeps the world visually seamless while data loads.
   */
  buildGroundGroup(id: ChunkId): THREE.Group {
    const group = new THREE.Group()
    group.name = `chunk_ground_${chunkKey(id)}`
    const center = chunkCenter(id)
    const slabMesh = new THREE.Mesh(URBAN_SLAB_GEOMETRY, URBAN_SLAB_MATERIAL)
    slabMesh.rotation.x = -Math.PI / 2
    slabMesh.position.set(center.x, -0.05, center.z)
    slabMesh.receiveShadow = true
    slabMesh.renderOrder = 0
    slabMesh.userData['skipMerge'] = true
    group.add(slabMesh)
    return group
  }
}
