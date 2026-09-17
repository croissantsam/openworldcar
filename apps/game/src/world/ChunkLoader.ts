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
  CHUNK_SIZE,
  DEFAULT_ORIGIN,
  type GeoPosition,
  type ChunkId,
} from '@world-drive/math'
import { RoadMeshGenerator } from './RoadMeshGenerator.js'
import { BuildingMeshGenerator } from './BuildingMeshGenerator.js'
import { ChunkCache } from './ChunkCache.js'
import { generateLiveChunk } from './LiveChunkGenerator.js'

export type LoadedChunk = {
  id: ChunkId
  group: THREE.Group
  data: WorldChunk
}

// Continuous dark urban pavement slab with 4m overlap across chunks (zero seams)
const URBAN_SLAB_GEOMETRY = new THREE.PlaneGeometry(CHUNK_SIZE + 4, CHUNK_SIZE + 4)
const URBAN_SLAB_MATERIAL = new THREE.MeshLambertMaterial({ color: 0x2e2e32 })

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
    this.cache.clear()
  }

  setOrigin(origin: GeoPosition): void {
    this.currentOrigin = origin
    this.cache.clear()
  }

  setRealOsmChunks(chunks: Map<string, WorldChunk>): void {
    this.realOsmChunks = new Map(chunks)
    this.cache.clear()
  }

  clearCache(): void {
    this.cache.clear()
    this.realOsmChunks.clear()
  }

  /**
   * Load a chunk: uses real OpenStreetMap data if available,
   * or generates it on-the-fly procedurally using OSM-fidelity algorithms!
   * Completely live and streaming with zero disk/pre-rendered dependencies.
   */
  async load(id: ChunkId, scene: THREE.Scene): Promise<LoadedChunk | null> {
    // Check in-memory cache first
    const cached = this.cache.get(id)
    if (cached) {
      const group = this._buildGroup(cached, scene)
      return { id, group, data: cached }
    }

    const key = chunkKey(id)
    let data: WorldChunk | null = null

    // 1. If we have real OpenStreetMap data for this chunk, use it directly!
    if (this.realOsmChunks.has(key)) {
      data = this.realOsmChunks.get(key)!
    } else {
      // 2. Procedural live chunk with continuous boundary alignment
      try {
        this.onGeneratingChange?.(true, id)
        data = generateLiveChunk(id, this.currentOrigin)
      } catch (err) {
        console.warn(`[ChunkLoader] Live generation failed for ${key}:`, err)
        return null
      } finally {
        this.onGeneratingChange?.(false, id)
      }
    }

    if (!data) return null

    this.cache.set(id, data)
    const group = this._buildGroup(data, scene)
    return { id, group, data }
  }

  private _buildGroup(chunk: WorldChunk, _scene: THREE.Scene): THREE.Group {
    const group = new THREE.Group()
    group.name = `chunk_${chunkKey(chunk.id)}`

    // 0. Continuous Urban Pavement Ground Slab
    // Guarantees dark asphalt/pavement under all roads and buildings with 4m overlap across chunks.
    const center = chunkCenter(chunk.id)
    const slabMesh = new THREE.Mesh(URBAN_SLAB_GEOMETRY, URBAN_SLAB_MATERIAL)
    slabMesh.rotation.x = -Math.PI / 2
    slabMesh.position.set(center.x, 0.005, center.z)
    slabMesh.receiveShadow = true
    group.add(slabMesh)

    // Roads
    for (const road of chunk.roads) {
      const mesh = RoadMeshGenerator.generate(road)
      if (mesh) group.add(mesh)
    }

    // Buildings
    for (const building of chunk.buildings) {
      const mesh = BuildingMeshGenerator.generate(building)
      if (mesh) group.add(mesh)
    }

    return group
  }
}
