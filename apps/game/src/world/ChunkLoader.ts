/**
 * ChunkLoader — fetches chunk data and builds scene objects.
 *
 * Designed for async, non-blocking loading.
 * Each load request is a separate async task.
 */

import * as THREE from 'three'
import type { WorldChunk } from '@world-drive/shared'
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
import { ChunkCache } from './ChunkCache.js'

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

// Continuous urban sub-base bedrock slab with 4m overlap across chunks (zero seams)
const URBAN_SLAB_GEOMETRY = new THREE.PlaneGeometry(CHUNK_SIZE + 4, CHUNK_SIZE + 4)
const URBAN_SLAB_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0x86827a, // Warm Parisian stone pavement foundation matching sidewalk tiles
  roughness: 0.88,
  metalness: 0.04,
  stencilWrite: true,
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
    }
  }

  /**
   * Merge new OSM data into the existing set without clearing the cache.
   * Used by OsmStreamingManager to add new zones incrementally.
   */
  mergeRealOsmChunks(newChunks: Map<string, WorldChunk>): void {
    for (const [key, chunk] of newChunks) {
      this.realOsmChunks.set(key, chunk)
      // Evict the old cached entry so the next load uses the real OSM data
      this.cache.delete(key)
    }
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
    for (const road of chunk.roads) {
      const roadGroup = RoadMeshGenerator.generate(road, chunk.roads)
      if (roadGroup) group.add(roadGroup)
    }

    // 4. Buildings with window textures
    for (const building of chunk.buildings) {
      const buildingGroup = BuildingMeshGenerator.generate(building)
      if (buildingGroup) group.add(buildingGroup)
    }

    return group
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
    group.add(slabMesh)
    return group
  }
}
