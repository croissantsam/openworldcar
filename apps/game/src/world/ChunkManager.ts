/**
 * ChunkManager — orchestrates chunk lifecycle around the player.
 *
 * Responsibilities:
 *   - calculateRequiredChunks(playerPos)
 *   - loadChunk(id) — async, non-blocking: a ground slab appears immediately,
 *     the real geometry is built a few milliseconds per frame and swapped in
 *     when complete (never a multi-hundred-millisecond stall)
 *   - unloadChunk(id) — dispose geometry, cancel pending work
 *   - update(playerPos) — called every frame
 *   - addRealOsmChunks(map) — MERGES streamed OSM data into chunks that are
 *     already built (only the new features get built), instead of tearing
 *     down and rebuilding everything the delivery touches
 */

import * as THREE from 'three'
import {
  worldToChunk,
  surroundingChunks,
  chunkKey,
  chunkCenter,
  setWorldOrigin,
  type ChunkId,
  type WorldPosition,
  type GeoPosition,
} from '@world-drive/math'
import type { WorldChunk, Road, Building, PointOfInterest, Waterway, Park } from '@world-drive/shared'
import RAPIER from '@dimforge/rapier3d-compat'
import { ChunkLoader, unionWorldChunk, chunkFeatureIds, chunkDelta } from './ChunkLoader.js'
import { ChunkState } from './ChunkState.js'
import { BuildingMeshGenerator } from './BuildingMeshGenerator.js'
import { ParkMeshGenerator } from './park/index.js'
import { RoadMeshGenerator } from './RoadMeshGenerator.js'
import { clipRoadToChunk } from './ChunkBounds.js'
import { StreetFurnitureGenerator } from './street-furniture/index.js'
import { useSettingsStore, type ViewDistanceSettings } from '../settings/SettingsStore.js'

/** Called when view distance settings change. */
let onViewDistanceChangeCallback: ((settings: ViewDistanceSettings) => void) | null = null

export function setViewDistanceChangeCallback(cb: (settings: ViewDistanceSettings) => void): void {
  onViewDistanceChangeCallback = cb
}

function getViewDistanceSettings(): ViewDistanceSettings {
  return useSettingsStore.getState().getEffectiveSettings()
}

/** Number of chunks loaded in each direction from the player. Dynamic based on view distance settings. */
function getLoadRadius(): number {
  return getViewDistanceSettings().loadRadius
}
/** Chunks beyond this distance (in chunk units) are unloaded. Dynamic based on view distance settings. */
function getUnloadRadius(): number {
  return getViewDistanceSettings().unloadRadius
}

/**
 * Main-thread time (ms) spent building chunk geometry inside a frame.
 * Adapted to the frame rate (generous when frames are cheap, tight when they
 * are not) so building never turns a smooth frame into a stutter. On top of
 * this, idle time between frames (requestIdleCallback) is used whenever the
 * browser reports some, which is where most of the work happens at 60 fps.
 */
/**
 * In-frame build slice (ms) while the car moves. Congestion-controlled: it
 * grows a little every stable frame and backs off as soon as a frame drops,
 * but never below a minimum so the world always keeps loading.
 */
const BUILD_BUDGET_MIN_MS = 1.5
/** Minimum slice when the chunk under the car itself is still unbuilt. */
const BUILD_BUDGET_MIN_UNDER_CAR_MS = 5
const BUILD_BUDGET_MAX_MS = 6
const BUILD_BUDGET_GROW_MS = 0.2
const BUILD_BUDGET_BACKOFF = 0.6
/** A frame longer than this multiple of the display period counts as dropped. */
const DROPPED_FRAME_FACTOR = 1.5
/** While the car is (almost) stationary nobody notices a longer slice. */
const BUILD_BUDGET_STATIONARY_MS = 10
const STATIONARY_SPEED_MPS = 1.0
/** Longest idle-callback slice (ms); keeps input latency low. */
const IDLE_SLICE_MAX_MS = 10
/** Frames of history used to estimate the display period (min interval). */
const PERIOD_WINDOW = 90
/** Colliders created per slice of the build job before checking the budget. */
const COLLIDERS_PER_SLICE = 12

export type StreetInfo = {
  name: string
  highway: string
  maxSpeed?: number
  distance: number
}

type BuildMode = 'full' | 'merge'
type JobState = 'queued' | 'running' | 'done'

type BuildJob = {
  managed: ManagedChunk
  mode: BuildMode
  state: JobState
  /** Features to build in this job (a whole chunk, or a delivery delta). */
  features: WorldChunk
  /** Roads used as context for junctions / park cut-outs (union of known + new). */
  allRoads: Road[]
  gen: Generator<number | void, THREE.Group, void> | null
  /** Finished geometry, set when the generator completes. */
  result: THREE.Group | null
  /** Fixed body holding this job's colliders (a fresh one for full builds). */
  body: RAPIER.RigidBody | null
  cancelled: boolean
}

type ManagedChunk = {
  id: ChunkId
  key: string
  state: ChunkState
  /** Built (optimized) geometry currently in the scene, or null while slab-only. */
  group: THREE.Group | null
  /** Ground-only placeholder shown until the first build is swapped in. */
  slab: THREE.Group | null
  /** Union of every feature built for this chunk (what the getters expose). */
  data?: WorldChunk | undefined
  /** Prefixed ids of features that are built or queued (dedupes deliveries). */
  knownIds: Set<string>
  physicsBody?: RAPIER.RigidBody | null
  /** Slab-only chunk with no data yet, waiting for OSM streaming. */
  awaitingData: boolean
  /** Job queued or running for this chunk, if any. */
  job: BuildJob | null
  /** Delta delivered while a job runs; built right after it. */
  pending: WorldChunk | null
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

  // ── Frame-budgeted build queue ─────────────────────────────────────────────
  private queue: BuildJob[] = []
  /** Jobs whose geometry and colliders are complete; swapped in one per frame. */
  private ready: BuildJob[] = []
  private lastUpdateAt = 0
  /** Current in-frame slice while moving (congestion-controlled). */
  private movingBudgetMs = 3
  /** Recent frame intervals, to estimate the display period. */
  private intervals: number[] = []
  private periodMs = 1000 / 60
  private lastPlayerPos: WorldPosition | null = null
  private playerSpeedMps = 0
  private idleHandle: number | null = null

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
    // Listen for view distance changes
    setViewDistanceChangeCallback(() => this.refreshChunkLoading())
  }

  /** Force re-evaluation of chunk loading based on current view distance settings. */
  refreshChunkLoading(): void {
    this.lastPlayerChunk = null
  }

  /**
   * Called every frame with the player's current world position.
   * Advances pending chunk builds within the frame budget, swaps at most one
   * finished chunk into the scene, then triggers loads and unloads as needed.
   */
  update(playerPosition: WorldPosition): void {
    this._pump(playerPosition)
    this._flushReady()

    const playerChunk = worldToChunk(playerPosition)
    const playerKey = chunkKey(playerChunk)

    // Only recalculate if the player moved to a new chunk
    const lastKey = this.lastPlayerChunk ? chunkKey(this.lastPlayerChunk) : null
    if (lastKey === playerKey) {
      return
    }
    this.lastPlayerChunk = playerChunk

    const required = surroundingChunks(playerChunk, getLoadRadius())
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
      if (Math.max(dx, dz) > getUnloadRadius()) {
        this._unload(key, chunk)
      }
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Loading
  // ───────────────────────────────────────────────────────────────────────────

  private _startLoad(id: ChunkId): void {
    const key = chunkKey(id)
    const managed: ManagedChunk = {
      id,
      key,
      state: new ChunkState(),
      group: null,
      slab: null,
      knownIds: new Set(),
      awaitingData: false,
      job: null,
      pending: null,
    }
    this.chunks.set(key, managed)
    managed.state.transition('LOADING')

    // Ground slab right away so the world never shows a hole while the
    // real geometry is resolved and built.
    const slab = this.loader.buildGroundGroup(id)
    this.scene.add(slab)
    managed.slab = slab

    this.loader
      .resolveData(id)
      .then((data) => {
        // Still needed?
        if (this.chunks.get(key) !== managed || managed.state.status !== 'LOADING') return

        if (data === 'pending') {
          // No OSM data yet — keep the bare slab. OsmStreamingManager will
          // deliver real data soon, and addRealOsmChunks builds it then.
          managed.awaitingData = true
          managed.state.transition('ACTIVE')
          return
        }
        if (!data) {
          // Genuinely empty area (ocean/park) — don't retry.
          this.missingChunks.add(key)
          this._removeManaged(managed)
          return
        }

        managed.state.transition('ACTIVE')
        this._enqueue(managed, data, 'full')
      })
      .catch((err) => {
        console.error(`[ChunkManager] Load error for ${key}:`, err)
        this.missingChunks.add(key)
        this._removeManaged(managed)
      })
  }

  /** Queue features to build for a chunk, coalescing with queued/running work. */
  private _enqueue(managed: ManagedChunk, features: WorldChunk, mode: BuildMode): void {
    for (const fid of chunkFeatureIds(features)) managed.knownIds.add(fid)

    const running = managed.job
    if (running) {
      if (running.state === 'queued') {
        // Not started yet: fold the new features into the queued job.
        running.features = unionWorldChunk(running.features, features)
        if (running.mode === 'merge' && managed.data && needsFullRebuild(managed.data, running.features)) {
          running.mode = 'full'
          running.features = unionWorldChunk(managed.data, running.features)
        }
        running.allRoads = (managed.data ? unionWorldChunk(managed.data, running.features) : running.features).roads
      } else {
        // Building, or built and waiting for its swap: keep the delta for a follow-up job.
        managed.pending = managed.pending ? unionWorldChunk(managed.pending, features) : features
      }
      return
    }

    // A delta that changes how already-built features must look (a bridge or
    // tunnel continuing an existing one, a road through an existing park) is
    // built as a full, incremental rebuild of the chunk instead of an add-on.
    if (mode === 'merge' && managed.data && needsFullRebuild(managed.data, features)) {
      mode = 'full'
      features = unionWorldChunk(managed.data, features)
    }

    const contextRoads = managed.data ? unionWorldChunk(managed.data, features).roads : features.roads.slice()
    const job: BuildJob = {
      managed,
      mode,
      state: 'queued',
      features,
      allRoads: contextRoads,
      gen: null,
      result: null,
      body: null,
      cancelled: false,
    }
    managed.job = job
    this.queue.push(job)
  }

  /**
   * The complete build for one job, sliced by `yield`: meshes, then colliders
   * (last, so nothing is ever solid before it is visible). Full builds get a
   * fresh fixed body that replaces the chunk's previous one at swap time;
   * merge deltas add their colliders to the chunk's existing body.
   */
  private *_runJob(job: BuildJob): Generator<number | void, THREE.Group, void> {
    const { managed, features, allRoads } = job
    const group = yield* this.loader.buildGroupIncremental(features, allRoads, job.mode === 'full')

    // Rapier static colliders for buildings, and roads
    if (this.world && !job.cancelled) {
      if (job.mode === 'full' || !managed.physicsBody) {
        job.body = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed())
      } else {
        job.body = managed.physicsBody
      }
      const body = job.body
      let n = 0
      const add = (desc: RAPIER.ColliderDesc | null): void => {
        if (!desc || !this.world) return
        this.world.createCollider(desc, body)
        n++
      }
      for (const building of features.buildings) {
        add(BuildingMeshGenerator.createColliderDesc(building))
        if (n >= COLLIDERS_PER_SLICE) { n = 0; yield }
      }
      for (const park of features.parks ?? []) {
        for (const desc of ParkMeshGenerator.createColliderDescs(park, allRoads, features.pointsOfInterest ?? [])) add(desc)
        if (n >= COLLIDERS_PER_SLICE) { n = 0; yield }
      }
      for (const road of features.roads) {
        // Ground roads: clip the collider to the chunk so a way crossing several
        // chunks is not duplicated. Bridges/tunnels keep their full profile: a
        // clipped one would put its ramp at the chunk border (the visual is not clipped).
        const elevated = road.bridge || road.tunnel || (road.elevationMode !== undefined && road.elevationMode !== 'ground')
        const colliderRoad = elevated ? road : clipRoadToChunk(road, managed.id)
        if (colliderRoad) {
          for (const desc of RoadMeshGenerator.createColliderDescs(colliderRoad as Road, allRoads)) add(desc)
        }
        if (n >= COLLIDERS_PER_SLICE) { n = 0; yield }
      }
      const pois = features.pointsOfInterest ?? []
      if (pois.length > 0) {
        for (const desc of StreetFurnitureGenerator.createColliderDescs(pois, allRoads)) {
          add(desc)
          if (n >= COLLIDERS_PER_SLICE) { n = 0; yield }
        }
      }
    }

    return group
  }

  /** Advance the highest-priority job within this frame's time budget. */
  private _pump(playerPosition: WorldPosition): void {
    const now = performance.now()
    if (this.lastUpdateAt > 0) {
      const frameMs = Math.min(now - this.lastUpdateAt, 250)
      // Display period ≈ the shortest interval seen recently (vsync-locked frames)
      this.intervals.push(frameMs)
      if (this.intervals.length > PERIOD_WINDOW) this.intervals.shift()
      this.periodMs = Math.min(34, Math.max(6, Math.min(...this.intervals)))
      // Congestion control: back off on a dropped frame, otherwise grow slowly
      if (frameMs > this.periodMs * DROPPED_FRAME_FACTOR) {
        this.movingBudgetMs = Math.max(BUILD_BUDGET_MIN_MS, this.movingBudgetMs * BUILD_BUDGET_BACKOFF)
      } else {
        this.movingBudgetMs = Math.min(BUILD_BUDGET_MAX_MS, this.movingBudgetMs + BUILD_BUDGET_GROW_MS)
      }
      if (this.lastPlayerPos && frameMs > 0) {
        const dx = playerPosition.x - this.lastPlayerPos.x
        const dz = playerPosition.z - this.lastPlayerPos.z
        const v = (Math.sqrt(dx * dx + dz * dz) / frameMs) * 1000
        this.playerSpeedMps += (v - this.playerSpeedMps) * 0.3
      }
    }
    this.lastUpdateAt = now
    this.lastPlayerPos = { x: playerPosition.x, y: playerPosition.y, z: playerPosition.z }

    if (this.queue.length === 0) return

    // The chunk under the car must never stay an empty slab for long.
    const underCar = this.chunks.get(chunkKey(worldToChunk(playerPosition)))
    const underCarUnbuilt = !!underCar && !underCar.group && !!underCar.job
    const budget =
      this.playerSpeedMps < STATIONARY_SPEED_MPS
        ? BUILD_BUDGET_STATIONARY_MS
        : Math.max(this.movingBudgetMs, underCarUnbuilt ? BUILD_BUDGET_MIN_UNDER_CAR_MS : 0)
    this._runQueue(playerPosition, now + budget)
    this._scheduleIdle()
  }

  /** Use the browser's idle time between frames for building, when it offers some. */
  private _scheduleIdle(): void {
    if (this.idleHandle !== null || this.queue.length === 0) return
    if (typeof requestIdleCallback !== 'function') return
    this.idleHandle = requestIdleCallback((deadline) => {
      this.idleHandle = null
      if (this.queue.length === 0) return
      const pos = this.lastPlayerPos ?? { x: 0, y: 0, z: 0 }
      const slice = Math.min(IDLE_SLICE_MAX_MS, Math.max(0, deadline.timeRemaining() - 1))
      if (slice > 0.5) this._runQueue(pos, performance.now() + slice)
      this._scheduleIdle()
    })
  }

  /** Run queued jobs until `deadline` (performance.now() based). */
  private _runQueue(playerPosition: WorldPosition, deadline: number): void {
    while (this.queue.length > 0 && performance.now() < deadline) {
      const job = this._nearestJob(playerPosition)
      if (job.cancelled) {
        this._dropFromQueue(job)
        continue
      }
      if (!job.gen) {
        job.gen = this._runJob(job)
        job.state = 'running'
      }

      let step: IteratorResult<number | void, THREE.Group>
      try {
        // The first step of a slice always runs (progress is guaranteed);
        // further steps only when their announced cost fits before the deadline.
        step = job.gen.next()
        while (!step.done) {
          const est = typeof step.value === 'number' ? step.value : 0.5
          if (performance.now() + est >= deadline) break
          step = job.gen.next()
        }
      } catch (err) {
        this._failJob(job, err)
        continue
      }
      if (step.done) {
        this._dropFromQueue(job)
        job.gen = null
        job.state = 'done'
        job.result = step.value
        this.ready.push(job)
      }
    }
  }

  /**
   * A build step threw (malformed feature): give the chunk up the way the
   * original loader did (marked missing, removed), never leave it stuck.
   */
  private _failJob(job: BuildJob, err: unknown): void {
    const { managed } = job
    console.error(`[ChunkManager] Build error for ${managed.key}:`, err)
    job.cancelled = true
    this._dropFromQueue(job)
    if (job.body && job.body !== managed.physicsBody && this.world) {
      this.world.removeRigidBody(job.body)
      job.body = null
    }
    managed.job = null
    this.missingChunks.add(managed.key)
    this._removeManaged(managed)
  }

  private _nearestJob(playerPosition: WorldPosition): BuildJob {
    let best = this.queue[0]!
    let bestD = Infinity
    for (const job of this.queue) {
      const c = chunkCenter(job.managed.id)
      const dx = c.x - playerPosition.x
      const dz = c.z - playerPosition.z
      // Slight preference for a job already in progress (frees its memory sooner)
      const d = (dx * dx + dz * dz) * (job.gen ? 0.9 : 1)
      if (d < bestD) {
        bestD = d
        best = job
      }
    }
    return best
  }

  private _dropFromQueue(job: BuildJob): void {
    const i = this.queue.indexOf(job)
    if (i >= 0) this.queue.splice(i, 1)
  }

  /** Put at most one finished build into the scene per frame (spreads GPU uploads). */
  private _flushReady(): void {
    const job = this.ready.shift()
    if (!job) return
    const { managed } = job
    const result = job.result
    job.result = null

    if (job.cancelled || this.chunks.get(managed.key) !== managed) {
      disposeGroup(result ?? undefined)
      if (job.body && job.body !== managed.physicsBody && this.world) this.world.removeRigidBody(job.body)
      return
    }
    if (!result) {
      // Nothing was produced (failed job already handled): release the slot.
      if (managed.job === job) managed.job = null
      return
    }

    if (job.mode === 'full' || !managed.group) {
      if (managed.slab) {
        this.scene.remove(managed.slab)
        managed.slab = null
      }
      if (managed.group) {
        // A full rebuild replacing the existing geometry (seam / park update).
        this.scene.remove(managed.group)
        disposeGroup(managed.group)
      }
      if (job.body && job.body !== managed.physicsBody) {
        if (managed.physicsBody && this.world) this.world.removeRigidBody(managed.physicsBody)
        managed.physicsBody = job.body
      }
      this.scene.add(result)
      managed.group = result
      managed.data = job.features
    } else {
      // Merge: the delta lives next to the existing geometry.
      managed.group.add(result)
      managed.data = managed.data ? unionWorldChunk(managed.data, job.features) : job.features
    }
    if (managed.state.status === 'LOADING') managed.state.transition('ACTIVE')

    managed.job = null
    if (managed.pending) {
      const delta = managed.pending
      managed.pending = null
      this._enqueue(managed, delta, 'merge')
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Unloading
  // ───────────────────────────────────────────────────────────────────────────

  private _unload(key: string, chunk: ManagedChunk): void {
    if (chunk.state.status === 'ACTIVE') {
      chunk.state.transition('UNLOADING')
    }
    this._removeManaged(chunk)
    if (chunk.state.status !== 'UNLOADED') chunk.state.transition('UNLOADED')
    this.chunks.delete(key)
  }

  /** Cancel work, free scene objects and physics for a chunk. */
  private _removeManaged(chunk: ManagedChunk): void {
    if (chunk.job) {
      const job = chunk.job
      job.cancelled = true
      this._dropFromQueue(job)
      if (job.body && job.body !== chunk.physicsBody && this.world) {
        this.world.removeRigidBody(job.body)
        job.body = null
      }
      chunk.job = null
    }
    chunk.pending = null

    // Remove Rapier physics body and colliders
    if (chunk.physicsBody && this.world) {
      this.world.removeRigidBody(chunk.physicsBody)
      chunk.physicsBody = null
    }

    chunk.data = undefined
    if (chunk.slab) {
      this.scene.remove(chunk.slab)
      chunk.slab = null
    }
    if (chunk.group) {
      this.scene.remove(chunk.group)
      disposeGroup(chunk.group)
      chunk.group = null
    }
    if (this.chunks.get(chunk.key) === chunk) this.chunks.delete(chunk.key)
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
    this.queue.length = 0
    if (this.idleHandle !== null && typeof cancelIdleCallback === 'function') {
      cancelIdleCallback(this.idleHandle)
      this.idleHandle = null
    }
    for (const job of this.ready) {
      if (job.result) disposeGroup(job.result)
    }
    this.ready.length = 0
    this.missingChunks.clear()
    this.lastPlayerChunk = null
  }

  /** Stop all pending work (engine shutdown): nothing may touch the world afterwards. */
  dispose(): void {
    this.clearAllChunks()
  }

  /**
   * Switches to a new geographic origin and chunk directory, clearing current chunks.
   */
  resetToOrigin(newOrigin: GeoPosition, chunkDir = '/chunks'): void {
    this.clearAllChunks()
    this.generatingChunks.clear()
    // Chunk keys are relative to the origin: drop the previous area's data so
    // it can never be unioned into the new one.
    this.loader.clearCache()
    this.loader.setOrigin(newOrigin)
    this.loader.setBaseUrl(chunkDir)
    setWorldOrigin(newOrigin)
    this.lastPlayerChunk = null
  }

  setRealOsmChunks(chunks: Map<string, WorldChunk>): void {
    this.loader.setRealOsmChunks(chunks)
  }

  /**
   * Merge new OSM chunks into the world without clearing loaded chunks.
   *   - chunks waiting for data get a full (incremental) build
   *   - chunks already built get only the NEW features built and appended
   *   - chunks with nothing new are left untouched (no rebuild at all)
   * Newly covered chunks will load via the normal update() cycle.
   */
  addRealOsmChunks(newChunks: Map<string, WorldChunk>): void {
    // Accumulate into the loader so future loads see every feature
    this.loader.mergeRealOsmChunks(newChunks)

    for (const [key, delivered] of newChunks) {
      // Always clear from missingChunks so loading is allowed
      this.missingChunks.delete(key)

      const managed = this.chunks.get(key)
      if (!managed) continue
      const status = managed.state.status
      if (status === 'UNLOADING' || status === 'UNLOADED') continue

      if (managed.awaitingData) {
        managed.awaitingData = false
        this._enqueue(managed, delivered, 'full')
        continue
      }

      const delta = chunkDelta(managed.knownIds, delivered)
      if (!delta) continue
      this._enqueue(managed, delta, managed.knownIds.size === 0 ? 'full' : 'merge')
    }

    // Reset lastPlayerChunk so the next update() call re-evaluates the
    // surrounding chunks (chunks previously marked missing can now load).
    this.lastPlayerChunk = null
  }

  get isGenerating(): boolean {
    return this.generatingChunks.size > 0
  }

  get generatingCount(): number {
    return this.generatingChunks.size
  }

  /** Number of chunk builds still queued or in progress (diagnostics). */
  get pendingBuildCount(): number {
    return this.queue.length + this.ready.length
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

  getActiveRailways(): never[] {
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

function isElevated(r: Road): boolean {
  return r.elevationMode === 'bridge' || r.elevationMode === 'tunnel' || r.bridge === true || r.tunnel === true
}

function sameElevationKind(a: Road, b: Road): boolean {
  const aBridge = a.elevationMode === 'bridge' || a.bridge === true
  const bBridge = b.elevationMode === 'bridge' || b.bridge === true
  const aTunnel = a.elevationMode === 'tunnel' || a.tunnel === true
  const bTunnel = b.elevationMode === 'tunnel' || b.tunnel === true
  return (aBridge && bBridge) || (aTunnel && bTunnel)
}

function endpointsTouch(a: Road, b: Road, tol = 1.5): boolean {
  if (a.points.length < 2 || b.points.length < 2) return false
  const ends = [a.points[0]!, a.points[a.points.length - 1]!]
  const others = [b.points[0]!, b.points[b.points.length - 1]!]
  for (const p of ends) {
    for (const q of others) {
      if (Math.hypot(p.x - q.x, p.z - q.z) < tol) return true
    }
  }
  return false
}

type Box = { minX: number; maxX: number; minZ: number; maxZ: number }

function boxOf(points: readonly WorldPosition[], pad: number): Box {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
  for (const p of points) {
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.z < minZ) minZ = p.z
    if (p.z > maxZ) maxZ = p.z
  }
  return { minX: minX - pad, maxX: maxX + pad, minZ: minZ - pad, maxZ: maxZ + pad }
}

function boxesOverlap(a: Box, b: Box): boolean {
  return a.minX <= b.maxX && b.minX <= a.maxX && a.minZ <= b.maxZ && b.minZ <= a.maxZ
}

/**
 * Does this delta change how already-built features should look? Two cases
 * the generators resolve from their surroundings at build time:
 *   - an elevated road continuing an existing elevated road of the same kind
 *     (the existing ramp end must become a connected span), and
 *   - a road crossing an existing park (trees are cut out around
 *     roads).
 */
function needsFullRebuild(existing: WorldChunk, delta: WorldChunk): boolean {
  if (delta.roads.length === 0) return false
  for (const nr of delta.roads) {
    if (!isElevated(nr)) continue
    for (const er of existing.roads) {
      if (er.id !== nr.id && sameElevationKind(er, nr) && endpointsTouch(er, nr)) return true
    }
  }
  const parks = existing.parks ?? []
  if (parks.length > 0) {
    const roadBoxes = delta.roads.map((r) => boxOf(r.points, 12))
    for (const park of parks) {
      const pts = park.polygon
      if (!pts || pts.length < 3) continue
      const pb = boxOf(pts, 0)
      for (const rb of roadBoxes) {
        if (boxesOverlap(pb, rb)) return true
      }
    }
  }
  return false
}

/**
 * Dispose the GPU-backed resources of a chunk group. Shared module-level
 * geometries/materials (templates, slab, instanced archetypes) are left alone;
 * per-chunk resources are freed: merged geometries, InstancedMesh instance
 * buffers, and the per-chunk signage canvas texture.
 */
function disposeGroup(group: THREE.Group | undefined): void {
  if (!group) return
  group.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return
    if (obj.userData['skipMerge']) {
      if ((obj as THREE.InstancedMesh).isInstancedMesh) {
        ;(obj as THREE.InstancedMesh).dispose() // instanceMatrix/instanceColor only
      }
      if (obj.name === 'storefront_signage' && !Array.isArray(obj.material)) {
        const mat = obj.material as THREE.MeshStandardMaterial
        mat.map?.dispose()
        mat.emissiveMap?.dispose()
        mat.dispose()
        obj.geometry.dispose()
      }
      // Per-chunk storefront buffers (their materials are shared: keep them)
      if (obj.name === 'storefront_vitrines' || obj.name === 'storefront_joinery') {
        obj.geometry.dispose()
      }
      return
    }
    obj.geometry.dispose()
    if (Array.isArray(obj.material)) {
      obj.material.forEach((m) => m.dispose())
    }
  })
}
