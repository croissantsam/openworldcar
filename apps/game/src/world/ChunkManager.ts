/**
 * ChunkManager — orchestrates chunk lifecycle around the player.
 *
 * Responsibilities:
 *   - calculateRequiredChunks(playerPos)
 *   - loadChunk(id) — async, non-blocking
 *   - unloadChunk(id) — dispose geometry
 *   - update(playerPos) — called every frame
 */

import * as THREE from 'three'
import {
  worldToChunk,
  surroundingChunks,
  chunkKey,
  setWorldOrigin,
  type ChunkId,
  type WorldPosition,
  type GeoPosition,
} from '@world-drive/math'
import type { WorldChunk, Road, Building, PointOfInterest, Waterway, Park, Railway } from '@world-drive/shared'
import RAPIER from '@dimforge/rapier3d-compat'
import { ChunkLoader } from './ChunkLoader.js'
import type { LoadedChunk } from './ChunkLoader.js'
import { ChunkState } from './ChunkState.js'
import { BuildingMeshGenerator } from './BuildingMeshGenerator.js'
import { ParkMeshGenerator } from './ParkMeshGenerator.js'
import { RoadMeshGenerator } from './RoadMeshGenerator.js'

/** Number of chunks loaded in each direction from the player (7x7 grid = 3.5km). */
const LOAD_RADIUS = 3
/** Chunks beyond this distance (in chunk units) are unloaded (5.5km). */
const UNLOAD_RADIUS = 5

export type StreetInfo = {
  name: string
  highway: string
  maxSpeed?: number
  distance: number
}

type ManagedChunk = {
  id: ChunkId
  state: ChunkState
  group: THREE.Group | null
  data?: WorldChunk | undefined
  physicsBody?: RAPIER.RigidBody | null
}

export class ChunkManager {
  private scene: THREE.Scene
  private world?: RAPIER.World | undefined
  private loader: ChunkLoader
  private chunks = new Map<string, ManagedChunk>()
  private missingChunks = new Set<string>()
  private generatingChunks = new Set<string>()
  /** Tracks which chunk the player was in last frame. */
  private lastPlayerChunk: ChunkId | null = null
  onGeneratingStatusChange?: (isGenerating: boolean) => void

  constructor(scene: THREE.Scene, world?: RAPIER.World) {
    this.scene = scene
    this.world = world
    this.loader = new ChunkLoader('/chunks')
    this.loader.onGeneratingChange = (isGen, id) => {
      const k = chunkKey(id)
      if (isGen) this.generatingChunks.add(k)
      else this.generatingChunks.delete(k)
      this.onGeneratingStatusChange?.(this.generatingChunks.size > 0)
    }
  }

  /**
   * Called every frame with the player's current world position.
   * Triggers loads and unloads as needed.
   */
  update(playerPosition: WorldPosition): void {
    const playerChunk = worldToChunk(playerPosition)
    const playerKey = chunkKey(playerChunk)

    // Only recalculate if the player moved to a new chunk
    const lastKey = this.lastPlayerChunk ? chunkKey(this.lastPlayerChunk) : null
    if (lastKey === playerKey) {
      return
    }
    this.lastPlayerChunk = playerChunk

    const required = surroundingChunks(playerChunk, LOAD_RADIUS)
    const requiredKeys = new Set(required.map(chunkKey))

    // Load required chunks that aren't already managed or known missing
    for (const id of required) {
      const key = chunkKey(id)
      if (!this.chunks.has(key) && !this.missingChunks.has(key)) {
        this._startLoad(id)
      }
    }

    // Unload distant chunks
    for (const [key, chunk] of this.chunks) {
      if (requiredKeys.has(key)) continue
      const dx = Math.abs(chunk.id.x - playerChunk.x)
      const dz = Math.abs(chunk.id.z - playerChunk.z)
      if (Math.max(dx, dz) > UNLOAD_RADIUS) {
        this._unload(key, chunk)
      }
    }
  }

  private _startLoad(id: ChunkId): void {
    const key = chunkKey(id)
    const managed: ManagedChunk = {
      id,
      state: new ChunkState(),
      group: null,
    }
    this.chunks.set(key, managed)
    managed.state.transition('LOADING')

    this.loader
      .load(id, this.scene)
      .then((loaded) => {
        if (loaded === 'pending') {
          // No OSM data yet — show a bare ground slab so the world stays
          // visually seamless. OsmStreamingManager will deliver real data
          // soon, triggering addRealOsmChunks which will reload this chunk.
          const groundGroup = this.loader.buildGroundGroup(id)
          this.scene.add(groundGroup)
          managed.group = groundGroup
          managed.state.transition('ACTIVE')
          return
        }
        if (!loaded) {
          // Genuinely empty area (ocean/park) — don't retry.
          this.missingChunks.add(key)
          managed.state.transition('UNLOADED')
          this.chunks.delete(key)
          return
        }
        // Still needed?
        const current = this.chunks.get(key)
        if (!current || current.state.status === 'UNLOADED') return

        managed.group = loaded.group
        managed.data = loaded.data

        // Build Rapier static colliders for buildings, park barriers, and trees
        if (this.world) {
          const bodyDesc = RAPIER.RigidBodyDesc.fixed()
          const body = this.world.createRigidBody(bodyDesc)
          for (const building of loaded.data.buildings) {
            const colliderDesc = BuildingMeshGenerator.createColliderDesc(building)
            if (colliderDesc) {
              this.world.createCollider(colliderDesc, body)
            }
          }
          for (const park of loaded.data.parks ?? []) {
            const parkColliders = ParkMeshGenerator.createColliderDescs(park, loaded.data.roads)
            for (const colDesc of parkColliders) {
              this.world.createCollider(colDesc, body)
            }
          }
          for (const road of loaded.data.roads ?? []) {
            const roadColliders = RoadMeshGenerator.createColliderDescs(road, loaded.data.roads)
            for (const colDesc of roadColliders) {
              this.world.createCollider(colDesc, body)
            }
          }
          managed.physicsBody = body
        }

        this.scene.add(loaded.group)
        managed.state.transition('ACTIVE')
      })
      .catch((err) => {
        console.error(`[ChunkManager] Load error for ${key}:`, err)
        this.missingChunks.add(key)
        this.chunks.delete(key)
      })
  }

  private _unload(key: string, chunk: ManagedChunk): void {
    if (chunk.state.status !== 'ACTIVE') {
      this.chunks.delete(key)
      return
    }
    chunk.state.transition('UNLOADING')

    // Remove Rapier physics body and colliders
    if (chunk.physicsBody && this.world) {
      this.world.removeRigidBody(chunk.physicsBody)
      chunk.physicsBody = null
    }

    chunk.data = undefined
    if (chunk.group) {
      this.scene.remove(chunk.group)
      // Dispose geometries and materials to free GPU memory
      chunk.group.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose()
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => m.dispose())
          }
        }
      })
      chunk.group = null
    }

    chunk.state.transition('UNLOADED')
    this.chunks.delete(key)
  }

  /**
   * Cleans up all loaded chunks, disposing Three.js meshes and Rapier colliders.
   */
  clearAllChunks(): void {
    const chunkEntries = Array.from(this.chunks.entries())
    for (const [key, chunk] of chunkEntries) {
      this._unload(key, chunk)
    }
    this.chunks.clear()
    this.missingChunks.clear()
    this.lastPlayerChunk = null
  }

  /**
   * Switches to a new geographic origin and chunk directory, clearing current chunks.
   */
  resetToOrigin(newOrigin: GeoPosition, chunkDir = '/chunks'): void {
    this.clearAllChunks()
    this.generatingChunks.clear()
    this.loader.setOrigin(newOrigin)
    this.loader.setBaseUrl(chunkDir)
    setWorldOrigin(newOrigin)
    this.lastPlayerChunk = null
  }

  setRealOsmChunks(chunks: Map<string, WorldChunk>): void {
    this.loader.setRealOsmChunks(chunks)
  }

  /**
   * Merge new OSM chunks into the world without clearing all loaded chunks.
   * Active chunks that now have real OSM data are reloaded seamlessly.
   * Newly covered chunks will load via the normal update() cycle.
   */
  addRealOsmChunks(newChunks: Map<string, WorldChunk>): void {
    // Pass new data to loader so future loads use it
    this.loader.mergeRealOsmChunks(newChunks)

    // Reload chunks that are now covered by real OSM data
    for (const [key] of newChunks) {
      const existing = this.chunks.get(key)
      if (existing && (existing.state.status === 'ACTIVE' || existing.state.status === 'LOADING')) {
        // Unload (removes ground-only slab or old data) and let update() reload with real OSM
        this._unload(key, existing)
      }
      // Always clear from missingChunks so re-loading is allowed
      this.missingChunks.delete(key)
    }

    // Reset lastPlayerChunk so the next update() call re-evaluates ALL surrounding
    // chunks, even if the player hasn't moved to a different chunk.
    // Without this, ground-only chunks that were just unloaded would never reload.
    this.lastPlayerChunk = null
  }

  get isGenerating(): boolean {
    return this.generatingChunks.size > 0
  }

  get generatingCount(): number {
    return this.generatingChunks.size
  }

  /**
   * Find the nearest road to the given position across active or loaded chunks.
   * Uses proximity, named priority, and optional car heading alignment.
   */
  getNearestStreet(
    pos: WorldPosition,
    heading?: { x: number; z: number },
    maxDistance = 120,
  ): StreetInfo | null {
    let bestRoad: Road | null = null
    let bestScore = Infinity
    let bestRawDist = Infinity

    for (const [, chunk] of this.chunks) {
      if (!chunk.data || chunk.state.status === 'UNLOADED') continue

      for (const road of chunk.data.roads) {
        const pts = road.points
        if (pts.length < 2) continue

        for (let i = 0; i < pts.length - 1; i++) {
          const p1 = pts[i]!
          const p2 = pts[i + 1]!
          const dSq = this._distanceToSegmentSq(pos.x, pos.z, p1.x, p1.z, p2.x, p2.z)
          const dist = Math.sqrt(dSq)
          if (dist > maxDistance) continue

          // Score: lower is better
          let score = dist
          if (road.name) {
            // Prioritise named roads when close
            score -= Math.min(15, dist * 0.4)
          }

          // If car heading is supplied, favor roads aligned with travel direction
          if (heading && (heading.x !== 0 || heading.z !== 0)) {
            const segDx = p2.x - p1.x
            const segDz = p2.z - p1.z
            const segLen = Math.hypot(segDx, segDz)
            if (segLen > 0) {
              const dot = Math.abs((heading.x * segDx + heading.z * segDz) / segLen)
              score -= dot * 10
            }
          }

          if (score < bestScore) {
            bestScore = score
            bestRoad = road
            bestRawDist = dist
          }
        }
      }
    }

    if (!bestRoad || bestRawDist > maxDistance) return null

    return {
      name: bestRoad.name ?? this._formatHighway(bestRoad.highway),
      highway: bestRoad.highway,
      ...(bestRoad.maxSpeed !== undefined ? { maxSpeed: bestRoad.maxSpeed } : {}),
      distance: bestRawDist,
    }
  }

  private _formatHighway(type: string): string {
    switch (type) {
      case 'motorway': return 'Autoroute'
      case 'trunk': return 'Voie Rapide'
      case 'primary': return 'Avenue Principale'
      case 'secondary': return 'Boulevard'
      case 'tertiary': return 'Rue'
      case 'residential': return 'Rue'
      case 'service': return 'Voie de Desserte'
      default: return 'Voie Publique'
    }
  }

  private _distanceToSegmentSq(
    px: number, pz: number,
    ax: number, az: number,
    bx: number, bz: number,
  ): number {
    const dx = bx - ax
    const dz = bz - az
    const lenSq = dx * dx + dz * dz
    if (lenSq === 0) {
      const ex = px - ax
      const ez = pz - az
      return ex * ex + ez * ez
    }
    let t = ((px - ax) * dx + (pz - az) * dz) / lenSq
    t = Math.max(0, Math.min(1, t))
    const rx = px - (ax + t * dx)
    const rz = pz - (az + t * dz)
    return rx * rx + rz * rz
  }

  getActiveRoads(): Road[] {
    const list: Road[] = []
    for (const [, chunk] of this.chunks) {
      if (chunk.data && chunk.state.status !== 'UNLOADED') {
        list.push(...chunk.data.roads)
      }
    }
    return list
  }

  getActiveBuildings(): Building[] {
    const list: Building[] = []
    for (const [, chunk] of this.chunks) {
      if (chunk.data && chunk.state.status !== 'UNLOADED') {
        list.push(...chunk.data.buildings)
      }
    }
    return list
  }

  getActivePOIs(): PointOfInterest[] {
    const list: PointOfInterest[] = []
    for (const [, chunk] of this.chunks) {
      if (chunk.data && chunk.state.status !== 'UNLOADED') {
        list.push(...chunk.data.pointsOfInterest)
      }
    }
    return list
  }

  getActiveWaterways(): Waterway[] {
    const list: Waterway[] = []
    for (const [, chunk] of this.chunks) {
      if (chunk.data && chunk.state.status !== 'UNLOADED') {
        list.push(...chunk.data.waterways)
      }
    }
    return list
  }

  getActiveParks(): Park[] {
    const list: Park[] = []
    for (const [, chunk] of this.chunks) {
      if (chunk.data && chunk.state.status !== 'UNLOADED') {
        list.push(...(chunk.data.parks ?? []))
      }
    }
    return list
  }

  getActiveRailways(): Railway[] {
    return []
  }

  get loadedCount(): number {
    let n = 0
    for (const [, c] of this.chunks) {
      if (c.state.status === 'ACTIVE') n++
    }
    return n
  }

  /**
   * Checks whether a 2D world position is within or approaching an underground tunnel corridor.
   * Used to dynamically toggle ground plane collision so vehicles can descend below y = 0.
   */
  isPointNearTunnel(x: number, z: number): boolean {
    for (const [, chunk] of this.chunks) {
      if (chunk.state.status !== 'ACTIVE' || !chunk.data) continue
      for (const road of chunk.data.roads) {
        if (road.elevationMode !== 'tunnel' && !road.tunnel) continue
        const isMajor = road.highway === 'motorway' || road.highway === 'trunk' || road.highway === 'primary' || (road.lanes && road.lanes >= 4)
        const lanes = Math.max(2, road.lanes || (isMajor ? 4 : 2))
        const roadW = lanes * 3.6
        const halfW = roadW / 2 + 1.2
        const halfWSq = halfW * halfW
        const pts = road.points
        for (let i = 0; i < pts.length - 1; i++) {
          const p1 = pts[i]!
          const p2 = pts[i + 1]!
          const dx = p2.x - p1.x
          const dz = p2.z - p1.z
          const lenSq = dx * dx + dz * dz
          if (lenSq < 1e-4) continue
          let t = ((x - p1.x) * dx + (z - p1.z) * dz) / lenSq
          t = Math.max(0, Math.min(1, t))
          const projX = p1.x + t * dx
          const projZ = p1.z + t * dz
          const distSq = (x - projX) ** 2 + (z - projZ) ** 2
          if (distSq <= halfWSq) return true
        }
      }
    }
    return false
  }
}
