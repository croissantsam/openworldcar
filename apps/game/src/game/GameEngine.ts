/**
 * GameEngine — the central coordinator.
 *
 * Owns and connects:
 *   InputManager → PlayerCar → ThirdPersonCamera → Renderer
 *   InputManager → PlayerPlane → FlightCamera → Renderer   (plane mode)
 *   ChunkManager
 *   NPCManager
 *   GameClient (WebSocket)
 *
 * Game loop:
 *   rAF → input → physics tick(s) → networking → world streaming → NPC → render
 *
 * Vehicle mode: the player drives the car ('car') or flies the two-seat
 * plane ('plane'). While flying, the car keeps all its state but its rigid
 * body is disabled and its mesh hidden.
 */

import RAPIER from '@dimforge/rapier3d-compat'
import { Renderer } from '../renderer/Renderer.js'
import { InputManager } from './InputManager.js'
import { PlayerCar } from '../vehicles/PlayerCar.js'
import { ThirdPersonCamera } from '../camera/ThirdPersonCamera.js'
import { PlayerPlane, type PlaneState, type FlightInput } from '../vehicles/PlayerPlane.js'
import { PlaneGun } from '../vehicles/PlaneGun.js'
import { CombatSystem, MAX_HEALTH } from './CombatSystem.js'
import { FlightCamera } from '../camera/FlightCamera.js'
import { ChunkManager, type StreetInfo } from '../world/ChunkManager.js'
import { NPCManager } from '../vehicles/NPCManager.js'
import { RemotePlayerManager } from '../vehicles/RemotePlayerManager.js'
import { GameClient } from '../networking/GameClient.js'
import {
  setWorldOrigin,
  getWorldOrigin,
  worldToChunk,
  worldToGeo,
  geoToWorld,
  geoDistanceMeters,
  solarPosition,
  solarTimeString,
} from '@world-drive/math'
import { nightFactor } from '../renderer/daynight.js'
import type { WorldPosition, GeoPosition } from '@world-drive/math'
import {
  generateTrials,
  getBeaconTrials,
  TRIAL_COUNTDOWN_S,
  TRIAL_FINISH_RADIUS_M,
  TRIAL_START_RADIUS_M,
  type TrialDef,
  type TrialPhase,
  type TrialStatus,
} from '../lib/trials.js'
import { isOnlineMode, setOnlineModeSetting } from '../lib/connectivity.js'
import {
  fetchCorridorRoads,
  fetchRadarMonuments,
  type RadarMonument,
} from '../lib/trialRadar.js'
import { buildRoadGraph, findAStarPath } from '@world-drive/world-data'
import { WORLD_DESTINATIONS, createCustomDestination, type WorldDestination } from '../world/destinations.js'
import { fetchOsmChunksForArea, fetchRealOsmArea, type RealOsmAreaResult } from '../world/LiveOsmFetcher.js'
import { OsmStreamingManager } from '../world/OsmStreamingManager.js'
import { OsmWorkerClient } from '../world/OsmWorkerClient.js'
import type { ChunkMap } from '@world-drive/world-data'
import { tickWater } from '../world/waterway/index.js'
import { ImpactFX } from '../effects/ImpactFX.js'
import type { PointOfInterest, Road } from '@world-drive/shared'
import * as THREE from 'three'

/** Fixed physics timestep (60 Hz). */
const FIXED_DT = 1 / 60

/** Damage of one machine-gun round on another player. */
const DAMAGE_PER_ROUND = 7
/** How long the 'DÉTRUIT' state lasts after the player is shot down (ms). */
const DESTROYED_MS = 1500
/** Upside-down seconds before the car is auto-recovered onto the road. */
const FLIP_RECOVER_AFTER_S = 2.5
/** Car up-vector Y below this counts as flipped (tilted past ~70°). */
const FLIP_UP_Y = 0.35
/** Falling below this altitude means through-the-ground (tunnels excluded by callers). */
const FALL_THROUGH_Y = -15.0
/** Hits on the world only spark this often (the guns fire 11 rounds/s). */
const WORLD_IMPACT_FX_INTERVAL = 0.2

/** Height of the car's rigid-body centre above the road (see PlayerCar.teleport). */
const CAR_RIDE_HEIGHT = 0.48

/** Leaving the plane slower than this, on the ground: the car appears right there. */
const EXIT_IN_PLACE_MAX_SPEED = 8
/** Otherwise the car is put on the nearest road within this distance. */
const EXIT_ROAD_SEARCH_RADIUS = 400

/** Airborne spawn (Shift+P, or the toggle while the plane is requested in the air). */
const AIRBORNE_ALTITUDE = 150
const AIRBORNE_SPEED = 50

/** Road classes a car can be dropped on when leaving the plane, best first. */
const DROP_ROAD_RANK: Record<string, number> = {
  primary: 0,
  secondary: 0,
  tertiary: 0,
  trunk: 1,
  residential: 1,
  unclassified: 1,
  living_street: 2,
  service: 3,
  motorway: 3,
}

export type VehicleMode = 'car' | 'plane'

/** Unsaved session deltas for trophies/leaderboard (meters, seconds). */
export type TripStats = {
  distanceM: number
  jumpM: number
  playTimeS: number
  maxJumpM: number
}

/** A per-frame position jump bigger than this is a teleport, not driving. */
const TRIP_MAX_FRAME_DELTA_M = 100
/**
 * Distance from the world origin beyond which the origin is re-centred on
 * the player (seamless, velocity-preserving). Keeps float32 rendering and
 * origin-relative chunk keys precise on long drives — planetary continuity
 * without a planetary-coordinate overhaul (ratified chunk model).
 */
const REBASE_DISTANCE_M = 8000
/** Upward speed (m/s) that opens a jump segment. */
const JUMP_START_VY = 2.0
/** |vy| below this (after the minimum air time) closes it (landed). */
const JUMP_END_VY = 1.0
/** A segment must last this long to survive the apex (|vy| ≈ 0). */
const JUMP_MIN_TIME_S = 0.25
/** Shorter hops are bumps, not jumps. */
const JUMP_MIN_DIST_M = 5

export type DebugStats = {
  fps: number
  ms: number
  drawCalls: number
  triangles: number
  currentChunk: string
  loadedChunks: number
  /** Cumulative chunk-streaming counters (§30). */
  chunkLoadsStarted: number
  chunkLoadsCompleted: number
  chunkUnloads: number
  chunkBuildQueue: number
  playerPosition: WorldPosition
  gpsPosition: { lat: number; lon: number }
  networkLatency: number
  nearbyPlayers: number
  npcCount: number
  /** Authoritative server tick stats from /api/mp-stats (absent = unreachable). */
  serverTickMs?: number
  serverTickP95?: number
  serverPlayers?: number
  /** Local solar time "HH:MM" at the player's GPS + Sun elevation (deg). */
  solarTime: string
  sunElev: number
  /** JS heap in MB when exposed by the browser (lag diagnosis). */
  heapMB?: number
  streetName?: string
  destinationName?: string
  destinationFlag?: string
}

export class GameEngine {
  private mount: HTMLElement
  renderer!: Renderer
  input!: InputManager
  playerCar!: PlayerCar
  private camera!: ThirdPersonCamera
  private impactFX!: ImpactFX
  chunkManager!: ChunkManager
  private npcManager!: NPCManager
  private gameClient!: GameClient
  /** Set via setLocalDisplayName() before init(); applied on creation. */
  private pendingDisplayName: string | null = null
  private remotePlayers!: RemotePlayerManager
  private osmStreaming!: OsmStreamingManager
  /** Background thread for OSM fetch+parse: driving never waits for map data. */
  private osmWorker: OsmWorkerClient | null = null

  // ─── Plane (created on first use) ──────────────────────────────────────────
  private plane: PlayerPlane | null = null
  private planeGun: PlaneGun | null = null
  private combat: CombatSystem | null = null
  private flightCamera: FlightCamera | null = null

  // Gun scratch (no per-frame allocation)
  private readonly muzzleA = new THREE.Vector3()
  private readonly muzzleB = new THREE.Vector3()
  private readonly gunForward = new THREE.Vector3(0, 0, 1)
  private lastWorldImpactFX = 0
  private destroyedUntil = 0

  /** A round of ours hit another player (HUD hit marker). */
  onGunHit?: (() => void) | undefined
  /** The local player took damage (HUD red flash). */
  onDamageTaken?: ((damage: number, health: number) => void) | undefined
  /** The local player was shot down (HUD 'DÉTRUIT' overlay). */
  onPlayerDestroyed?: ((by: string) => void) | undefined
  private _vehicleMode: VehicleMode = 'car'
  /** Car camera settings saved when taking the plane, restored on landing. */
  private savedCameraSettings: { fov: number; near: number; far: number } | null = null
  /** Last sane plane position (ground point) and yaw, for recovery. */
  private lastSafePlaneGround: WorldPosition | null = null
  private lastSafePlaneYaw = 0
  /** Called when the player switches between car and plane. */
  onVehicleModeChanged?: (mode: VehicleMode) => void

  private world!: RAPIER.World
  private rafId = 0
  private running = false

  private lastTime = 0
  private accumulator = 0

  private lastSafePos: WorldPosition = { x: 3.7, y: 0.48, z: 158.3 }
  private lastSafeYaw = 0
  /** Seconds spent upside-down (auto road-recovery at FLIP_RECOVER_AFTER_S). */
  private flipTimer = 0
  private netTimer = 0
  private driftFxTimer = 0

  // ── Time trials (monument to monument) ───────────────────────────────────
  private trialPhase: TrialPhase = 'idle'
  private trialActive: TrialDef | null = null
  private trialT = 0
  private trialFinalMs = 0
  private trialResult: { trial: TrialDef; timeMs: number } | null = null
  /** Trial picked in the start panel (same beacon); ENTRÉE starts it instead of the proposal. */
  private trialSelected: TrialDef | null = null
  private trialCache: { list: TrialDef[]; count: number; atX: number; atZ: number; atTime: number } | null = null
  /** Cached per-beacon race list (start panel); invalidated via trialDataVersion. */
  private beaconTrialCache: {
    beaconId: string
    destId: string
    count: number
    list: TrialDef[]
    atTime: number
    dataVersion: number
  } | null = null
  /** Bumped whenever trial source data changes (radar arrival, travel). */
  private trialDataVersion = 0
  /** Player GPS stashed while a trial shows direct guidance (restored after). */
  private trialSavedGps: WorldPosition | null = null
  /**
   * Far-monument radar (Overpass): monuments beyond the streamed 300m tiles
   * plus road corridors for candidate pairs. Keyed by destination (the world
   * origin moves with it). Best-effort: trials fall back to loaded chunks.
   */
  private trialRadar: {
    destId: string
    monuments: RadarMonument[]
    corridors: Map<string, Road[]>
    atTime: number
    loading: boolean
  } | null = null
  private trialBeacons: {
    start: THREE.Group
    startRing: THREE.Mesh
    finish: THREE.Group
    finishRing: THREE.Mesh
  } | null = null
  /** A run just finished (HUD submits the time + shows the banner). */
  onTrialFinished?: ((trial: TrialDef, timeMs: number) => void) | undefined

  // ── Trip stats (trophies): unsaved session deltas ────────────────────────
  private tripDistanceM = 0
  private tripJumpM = 0
  private tripPlayTimeS = 0
  private tripMaxJumpM = 0
  private lastStatsPos: WorldPosition | null = null
  private jumpActive = false
  private jumpDistM = 0
  private jumpTimeS = 0

  // ── Throttled full-map scans (O(all road segments), so never every frame) ─
  private lastWaterCheckPos: WorldPosition | null = null
  private lastWaterCheckAt = 0
  private lastWaterResult = false
  private lastStatStreetPos: WorldPosition | null = null
  private lastStatStreetAt = 0
  private lastStatStreetName: string | undefined = undefined
  /** Last authoritative server metrics from /api/mp-stats (polled ~5 s). */
  private serverMetrics: { tickMsAvg: number; tickMsP95: number; players: number } | null = null
  private lastServerMetricsAt = 0
  /** Real-world day/night state (refreshed ~5 s from player GPS + UTC). */
  private lastSolarAt = 0
  private solarTime = '--:--'
  private sunElev = 0
  /** Solar-time scrub offset in minutes (T/G keys, N resets). 0 = real time. */
  private solarOffsetMin = 0
  private lastTimeKeyAt = 0

  // ─── Stats ──────────────────────────────────────────────────────────────────
  private frameCount = 0
  private fpsTimer = 0
  private currentFps = 0
  private currentMs = 0

  // ─── GPS Navigation ────────────────────────────────────────────────────────
  private gpsDestination: WorldPosition | null = null
  private gpsRoute: WorldPosition[] | null = null

  // ─── Destination & Travel ────────────────────────────────────────────────
  currentDestination: WorldDestination = WORLD_DESTINATIONS[0]!
  onDestinationChanged?: (dest: WorldDestination) => void
  onInvincibilityChanged?: (invincible: boolean) => void
  onInvincibilityWarning?: () => void

  stats: DebugStats = {
    fps: 0,
    ms: 0,
    drawCalls: 0,
    triangles: 0,
    currentChunk: '0:0:0',
    loadedChunks: 0,
    chunkLoadsStarted: 0,
    chunkLoadsCompleted: 0,
    chunkUnloads: 0,
    chunkBuildQueue: 0,
    playerPosition: { x: 0, y: 0, z: 0 },
    gpsPosition: { lat: 0, lon: 0 },
    networkLatency: 0,
    nearbyPlayers: 0,
    npcCount: 0,
    solarTime: '--:--',
    sunElev: 0,
    destinationName: WORLD_DESTINATIONS[0]!.name,
    destinationFlag: WORLD_DESTINATIONS[0]!.flag,
  }

  private disposed = false

  constructor(mount: HTMLElement) {
    this.mount = mount
  }

  /**
   * Boot the engine. When `initialDestination` is provided (e.g. a saved
   * spawn restored from the player profile), the world origin, chunk source
   * and car are set to it BEFORE the first chunk loads — exactly like
   * `travelTo()` does. Skipping this mixes two geographic areas in the same
   * world space: chunk keys are origin-relative, so stale cached chunks from
   * the default area would be unioned into the new one.
   */
  async init(initialDestination?: WorldDestination): Promise<void> {
    if (this.disposed) return

    // Initialise Rapier WASM
    await RAPIER.init()
    if (this.disposed) return

    if (initialDestination) {
      this.currentDestination = initialDestination
    }

    // Set world origin from the (possibly restored) initial destination
    setWorldOrigin(this.currentDestination.origin)

    // Create Rapier world with earth-like gravity
    const gravity = { x: 0.0, y: -9.81, z: 0.0 }
    this.world = new RAPIER.World(gravity)

    // Sub-systems
    this.renderer = new Renderer(this.mount)
    this.input = new InputManager()
    this.playerCar = new PlayerCar(this.world, this.renderer.scene)
    this.playerCar.setEnvMap(this.renderer.getEnvMap())
    this.camera = new ThirdPersonCamera(this.renderer.camera, this.playerCar)
    this.impactFX = new ImpactFX(this.renderer.scene)
    this._buildTrialBeacons()

    // Wire physical collision impacts to camera trauma and audiovisual effects
    this.playerCar.onImpact = (intensity, point, direction) => {
      this.camera.addTrauma(intensity)
      this.impactFX.triggerImpact(intensity, point, direction)
    }

    // Wire invincibility audio & events
    this.playerCar.onInvincibilityChanged = (invincible) => {
      if (invincible) {
        this.impactFX.playShieldActivated()
      } else {
        this.impactFX.playShieldDeactivated()
      }
      this.onInvincibilityChanged?.(invincible)
    }

    this.playerCar.onInvincibilityWarning = () => {
      this.impactFX.playShieldWarning()
      this.onInvincibilityWarning?.()
    }

    // P: car <-> plane, Shift+P: plane directly in the air
    this.input.onVehicleToggle = (airborne) => {
      if (airborne) {
        this.enterPlane({ airborne: true })
      } else {
        this.togglePlane()
      }
    }

    // Start the car on the initial destination's spawn point so the first
    // chunk load (and any early respawn) already targets the right area.
    const initialSpawn = this.currentDestination.spawnPosition ?? { x: 62.5, y: 1.0, z: 62.5 }
    const initialHeading = this.currentDestination.spawnHeading ?? 0
    this.playerCar.teleport(initialSpawn, initialHeading)
    this.lastSafePos = { x: initialSpawn.x, y: initialSpawn.y, z: initialSpawn.z }
    this.lastSafeYaw = initialHeading

    this.chunkManager = new ChunkManager(this.renderer.scene, this.world)
    // Point the chunk loader at the initial destination's origin and static
    // chunk directory BEFORE the first update() — otherwise default-area
    // chunks would load (and stay cached) under a foreign origin.
    this.chunkManager.resetToOrigin(
      this.currentDestination.origin,
    )
    this.npcManager = new NPCManager(this.renderer.scene)
    this.remotePlayers = new RemotePlayerManager(this.renderer.scene, this.world)
    this.gameClient = new GameClient(isOnlineMode())
    this.gameClient.localDisplayName = this.pendingDisplayName

    // OSM streaming manager — continuously fetches real map data as the player drives.
    // Fetch+parse runs in a worker (off the render thread); the main-thread
    // fetcher is only a fallback for browsers without Worker support.
    this.osmWorker = new OsmWorkerClient()
    const worker = this.osmWorker
    const streamFetch = (center: GeoPosition, radius: number, origin: GeoPosition, signal?: AbortSignal): Promise<ChunkMap | null> => {
      try {
        const p = worker.fetchStreamChunks(center, radius, origin, signal)
        return p.catch(() => fetchOsmChunksForArea(center, radius, signal))
      } catch {
        return fetchOsmChunksForArea(center, radius, signal)
      }
    }
    this.osmStreaming = new OsmStreamingManager(streamFetch)
    this.osmStreaming.onChunksReady = (newChunks) => {
      if (!this.disposed) {
        this.chunkManager.addRealOsmChunks(newChunks)
        // Trigger immediate re-load of chunks that just got OSM data
        this.chunkManager.update(this.getPlayerPosition())
      }
    }

    // Receive multiplayer snapshots and route to RemotePlayerManager
    this.gameClient.onSnapshot = (players, localId) => {
      this.remotePlayers?.handleSnapshot(players, localId)
    }

    // ── Combat: damage taken / dealt, destructions ─────────────────────────
    this.combat = new CombatSystem(this.gameClient, this.remotePlayers)
    this.combat.onDamageTaken = (e) => {
      const f = Math.min(1, Math.max(0.18, e.damage / 35))
      this.impactFX?.triggerImpact(f * 0.6, e.point, { x: 0, y: 1, z: 0 })
      const trauma = 0.12 + f * 0.35
      if (this._vehicleMode === 'plane') this.flightCamera?.addTrauma(trauma)
      else this.camera?.addTrauma(trauma)
      this.onDamageTaken?.(e.damage, e.health)
    }
    this.combat.onDestroyed = (by) => {
      this._destroyLocalPlayer(by)
    }
    this.combat.onRemoteDestroyed = (_id, position) => {
      this._explosionAt(position)
    }

    // Ground plane (flat terrain for Phase 1)
    this._createGroundPlane()

    // Initial chunk load around spawn
    this.chunkManager.update(this.playerCar.getPosition())

    // The initial area is being fetched below: mark it covered right away so
    // the streaming manager does not fire a second, near-identical fetch
    // (and a second world rebuild) during the first seconds.
    this.osmStreaming.markCovered(this.currentDestination.origin)

    // Also stream real OpenStreetMap area for the starting location
    // (parsed in the worker so the first paint and drive stay smooth).
    // The destination id is captured now: if the player travels before the
    // fetch completes, the stale initial-area delivery is dropped.
    const initDestId = this.currentDestination.id
    this._fetchInitialOsm(
      this.currentDestination.origin,
      300,
      undefined,
      this.currentDestination.spawnPosition,
      this.currentDestination.spawnHeading,
    )
      .then((realOsm) => {
        this._applyStreamedArea(realOsm, {
          destId: initDestId,
          wasFlying: this._vehicleMode === 'plane',
        })
      })
      .catch((err) => {
        console.warn('[GameEngine] Initial OSM fetch error:', err)
        if (!this.disposed) this.osmStreaming.reset()
      })
  }

  /**
   * Fetch + parse + generate an area's chunks, preferably in the OSM worker
   * (off the render thread). Falls back to the main-thread fetcher when
   * Workers are unavailable. Resolves null when nothing usable arrived —
   * callers keep the current world and let streaming retry later.
   */
  private _fetchInitialOsm(
    origin: GeoPosition,
    radius: number,
    signal?: AbortSignal,
    preferredSpawn?: WorldPosition,
    preferredHeading?: number,
  ): Promise<RealOsmAreaResult | null> {
    const worker = this.osmWorker
    if (worker) {
      try {
        const p = worker.fetchInitialArea(origin, radius, preferredSpawn, preferredHeading, signal)
        return p.catch(() => fetchRealOsmArea(origin, radius, signal, preferredSpawn, preferredHeading))
      } catch {
        // fall through to main-thread fetch
      }
    }
    return fetchRealOsmArea(origin, radius, signal, preferredSpawn, preferredHeading)
  }

  /**
   * Shared far-transition pipeline (ratified chunk model): swap freshly
   * streamed OSM data into the world after init() or travelTo(). The player
   * always continues in the car, re-seated on the real road centreline —
   * unless `landAt` pins a trial-start redo spot.
   */
  private _applyStreamedArea(
    realOsm: RealOsmAreaResult | null,
    opts: { destId: string; landAt?: { x: number; z: number; heading?: number }; wasFlying: boolean },
  ): void {
    const { destId, landAt, wasFlying } = opts
    if (realOsm && realOsm.chunks.size > 0 && this.currentDestination.id === destId && !this.disposed) {
      this.chunkManager.addRealOsmChunks(realOsm.chunks)
      // The world is rebuilt from scratch: the player restarts in the car.
      this._leavePlane()
      if (!landAt) {
        this.playerCar.teleport(realOsm.spawnPoint, realOsm.spawnHeading)
      }
      this.gameClient.sendRespawn()
      if (wasFlying) this._snapCarCamera()
      else this.camera.update(0.016)
      this.chunkManager.update(landAt ? { x: landAt.x, y: 0.5, z: landAt.z } : realOsm.spawnPoint)
      // Mark the area as covered so the streaming manager doesn't
      // immediately re-fetch the same zone.
      this.osmStreaming.markCovered(this.currentDestination.origin)
      if (realOsm.streetName) {
        // New object (not an in-place mutation): HUD state compares by
        // reference, so the same ref would bail out and never re-render.
        this.currentDestination = { ...this.currentDestination, name: realOsm.streetName }
      }
      this.onDestinationChanged?.(this.currentDestination)
    } else if (this.currentDestination.id === destId && !this.disposed) {
      // Nothing arrived: let the streaming manager fetch the area again.
      this.osmStreaming.reset()
    }
  }

  private _createGroundPlane(): void {
    // Rapier static ground plane: solid 20-metre thick bedrock slab from y = 0.0 down to y = -20.0
    // Prevents any downward tunneling, clipping or falling through the world.
    const groundDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(0, -10.0, 0)
    const groundBody = this.world.createRigidBody(groundDesc)
    const GROUP_CAR = 0x0001
    const GROUP_GROUND = 0x0002
    const groundCollider = RAPIER.ColliderDesc.cuboid(500000, 10.0, 500000)
      .setFriction(0.0)
      .setRestitution(0.0)
      .setCollisionGroups((GROUP_GROUND << 16) | GROUP_CAR)
    this.world.createCollider(groundCollider, groundBody)
  }

  start(): void {
    if (this.running || this.disposed) return
    this.running = true
    this.lastTime = performance.now()
    this.rafId = requestAnimationFrame(this._loop)
  }

  private _loop = (now: number): void => {
    if (!this.running || this.disposed) return
    this.rafId = requestAnimationFrame(this._loop)

    const delta = Math.min((now - this.lastTime) / 1000, 0.1) // cap at 100ms
    this.lastTime = now
    this.accumulator += delta

    // ── FPS counter ────────────────────────────────────────────────────────
    this.frameCount++
    this.fpsTimer += delta
    if (this.fpsTimer >= 1) {
      this.currentFps = this.frameCount
      this.frameCount = 0
      this.fpsTimer = 0
    }
    this.currentMs = delta * 1000

    // ── Input ──────────────────────────────────────────────────────────────
    const rawInput = this.input.getInput()
    if (this.input.consumeEnterPressed()) this._onEnterPressed()
    // ── Solar time scrub: T/G ±1 h, N back to real time (250 ms repeat) ──
    // Lets the player sweep the Sun through sunrise → zenith → sunset.
    if (now - this.lastTimeKeyAt > 250) {
      if (this.input.isKeyDown('KeyT')) {
        this.solarOffsetMin += 60
        this.lastTimeKeyAt = now
        this.lastSolarAt = 0
      } else if (this.input.isKeyDown('KeyG')) {
        this.solarOffsetMin -= 60
        this.lastTimeKeyAt = now
        this.lastSolarAt = 0
      } else if (this.input.isKeyDown('KeyN')) {
        if (this.solarOffsetMin !== 0) {
          this.solarOffsetMin = 0
          this.lastSolarAt = 0
        }
        this.lastTimeKeyAt = now
      }
    }
    const plane = this._vehicleMode === 'plane' ? this.plane : null
    // During the start countdown the car is held (handbrake, not brake:
    // brake at standstill means reverse) so nobody jumps GO.
    const countingDown = this.trialPhase === 'countdown'
    const driveInput = countingDown
      ? { throttle: 0, brake: 0, steering: 0, handbrake: true, nitro: false }
      : rawInput
    const flightInput = plane
      ? countingDown
        ? { throttleUp: false, throttleDown: false, pitch: 0, roll: 0, yaw: 0, brake: true, fire: false }
        : this.input.getFlightInput()
      : null

    // ── Fixed timestep physics ─────────────────────────────────────────────
    while (this.accumulator >= FIXED_DT) {
      if (plane && flightInput) {
        plane.step(flightInput, FIXED_DT)
      } else {
        this.playerCar.applyInput(driveInput, FIXED_DT)
      }
      this.world.step()
      this.npcManager.tick(FIXED_DT)
      this.accumulator -= FIXED_DT
    }

    let pos: WorldPosition
    if (plane) {
      // ── Plane safety net (the plane handles its own crashes) ─────────────
      pos = plane.getPosition()
      if (!isFiniteVec(pos) || pos.y < -15.0) {
        this._recoverPlane()
        pos = this.getPlayerPosition()
      } else if (pos.y >= -2.0) {
        this.lastSafePlaneGround = groundBelow(pos, plane.getState().altitudeAGL)
        const yaw = plane.getYaw()
        if (Number.isFinite(yaw)) this.lastSafePlaneYaw = yaw
      }
    } else {
      // ── Water Plunge & Falling Respawn ────────────────────────────────────
      pos = this.playerCar.getPosition()
      const inTunnel = this.chunkManager?.isPointNearTunnel(pos.x, pos.z) ?? false
      this.playerCar.setNearTunnel(inTunnel)

      const inWater = !inTunnel && this._isCarInWater(pos)

      if (inWater || pos.y < FALL_THROUGH_Y) {
        // Plunged into water (Seine, canal, basin) or fell through the world:
        // back on the road, at the spot — not miles behind at lastSafePos.
        this.impactFX?.triggerWaterSplash(pos)
        this.camera.addTrauma(0.65)
        this._recoverCarOnRoad('fall')
      } else if (pos.y >= -7.0) {
        // Car is safely on road (surface or inside subterranean tunnel) — update safe respawn position
        this.lastSafePos = { x: pos.x, y: pos.y, z: pos.z }
        this.lastSafeYaw = this.playerCar.getYaw()
      }

      // ── Flip-over auto recovery (car on roof/side) ──────────────────────
      // 2.5 s upside-down → upright on the nearest road, same XZ area.
      // Brief mid-air tilts (jumps, stunts) never reach the threshold.
      let upY = 1
      try {
        upY = new THREE.Vector3(0, 1, 0).applyQuaternion(this.playerCar.getQuaternion()).y
      } catch {
        upY = 1
      }
      if (upY < FLIP_UP_Y) {
        this.flipTimer += delta
        if (this.flipTimer >= FLIP_RECOVER_AFTER_S) {
          this._recoverCarOnRoad('flip')
        }
      } else {
        this.flipTimer = 0
      }
    }

    // ── Origin auto-rebase (long drives stay precise; same session) ──────
    // Refresh the frame's snapshot when the world frame moved underneath us.
    if (this._maybeRebaseOrigin()) {
      pos = this.getPlayerPosition()
    }

    // ── Trip stats (distance, jumps, play time) ────────────────────────────
    this._trackTripStats(delta, pos, plane === null)

    // ── Time trial (countdown, timer, finish detection) ────────────────────
    this._updateTrial(delta, pos)

    // ── Networking ─────────────────────────────────────────────────────────
    this.gameClient.sendInput(driveInput)

    this.netTimer += delta
    if (this.netTimer >= 0.05) {
      this.netTimer = 0
      if (this._vehicleMode === 'plane' && this.plane) {
        const q = this.plane.getQuaternion()
        const v = this.plane.getVelocity()
        const planePos = this.plane.getPosition()
        this.gameClient.sendState({
          position: planePos,
          geo: worldToGeo(planePos),
          rotation: { x: q.x, y: q.y, z: q.z, w: q.w },
          velocity: v,
          steering: 0,
          speed: Math.hypot(v.x, v.y, v.z),
          vehicle: 'plane',
        })
      } else {
        const carPos = this.playerCar.getPosition()
        const quat = this.playerCar.getQuaternion()
        const vel = this.playerCar.getVelocity()
        const speed = this.playerCar.getSpeed()
        this.gameClient.sendState({
          position: carPos,
          geo: worldToGeo(carPos),
          rotation: { x: quat.x, y: quat.y, z: quat.z, w: quat.w },
          velocity: vel,
          steering: driveInput.steering,
          speed,
          vehicle: 'car',
        })
      }
    }

    // NPC traffic is disabled: skip building the active-roads array every frame.
    this.gameClient.processMessages(this.npcManager, pos)

    // ── World streaming ────────────────────────────────────────────────────
    this.chunkManager.update(pos)

    // ── OSM continuous streaming (throttled internally) ────────────────────
    const geoPos = worldToGeo(pos)
    this.osmStreaming.update(
      { latitude: geoPos.latitude, longitude: geoPos.longitude },
      this.getPlayerVelocity(),
    )

    // ── Water animation tick ───────────────────────────────────────────────
    tickWater()

    // ── Remote Multiplayer Players ─────────────────────────────────────────
    // While flying, other players' cars are ghosts to the plane
    this.remotePlayers?.setLocalPlayerState(pos, plane ? true : this.playerCar.isInvincible())
    this.remotePlayers?.update(delta)

    // ── Impact Sparks & Screen FX ───────────────────────────────────────────
    this.impactFX?.update(delta)
    // ── Drift smoke + tire screech (car mode only, smoke capped at ~30 Hz) ─
    // Two puffs per rear wheel per tick for a thick continuous cloud.
    if (this._vehicleMode === 'car' && this.playerCar.isDrifting()) {
      this.driftFxTimer += delta
      if (this.driftFxTimer >= 1 / 30) {
        this.driftFxTimer = 0
        const [rearL, rearR] = this.playerCar.getRearWheelPositions()
        this.impactFX?.emitDriftSmoke(rearL)
        this.impactFX?.emitDriftSmoke(rearL)
        this.impactFX?.emitDriftSmoke(rearR)
        this.impactFX?.emitDriftSmoke(rearR)
      }
      this.impactFX?.setDriftScreech(Math.min(1, Math.abs(this.playerCar.getDriftAngle()) * 2.5))
    } else {
      this.driftFxTimer = 0
      this.impactFX?.setDriftScreech(0)
    }
    this.combat?.update(delta)
    if (this.lastWorldImpactFX > 0) this.lastWorldImpactFX = Math.max(0, this.lastWorldImpactFX - delta)

    // ── Camera ─────────────────────────────────────────────────────────────
    if (this._vehicleMode === 'plane' && this.plane && this.flightCamera) {
      // Render interpolation between the last two physics states
      this.plane.syncMesh(Math.min(1, Math.max(0, this.accumulator / FIXED_DT)), delta)
      // Guns after syncMesh: the muzzles follow the pose that is drawn
      this._updateGun(delta, this.plane, flightInput)
      this.flightCamera.update(delta)
    } else {
      // Car mode: the guns never fire, but their tracers finish and cool down
      this._updateGun(delta, null, null)
      this.camera.update(delta)
    }

    // ── Update Sun & Shadow Camera around Player ───────────────────────────
    // (in the air, keep the shadow box low enough to cover the streets below)
    this.renderer.updateSunPosition(
      this._vehicleMode === 'plane' ? { x: pos.x, y: Math.min(pos.y, 60), z: pos.z } : pos,
    )

    // ── Speed Blur — feed vehicle speed to post-processing ─────────────────
    {
      const speedMs = this._vehicleMode === 'plane' && this.plane
        ? (this.plane.getState?.().groundSpeed ?? 0)
        : this.playerCar.getSpeed()
      this.renderer.setSpeed(speedMs)
    }

    // ── Render ─────────────────────────────────────────────────────────────
    this.renderer.render()

    // ── GPS Route Progress ──────────────────────────────────────────────────
    if (this.gpsRoute && this.gpsRoute.length > 0) {
      while (this.gpsRoute.length > 1) {
        const nextWp = this.gpsRoute[1]!
        const dx = nextWp.x - pos.x
        const dz = nextWp.z - pos.z
        if (dx * dx + dz * dz < 144) {
          this.gpsRoute.shift()
        } else {
          break
        }
      }
      if (this.gpsRoute.length === 1 && this.gpsDestination) {
        const dx = this.gpsDestination.x - pos.x
        const dz = this.gpsDestination.z - pos.z
        if (dx * dx + dz * dz < 100) {
          this.gpsDestination = null
          this.gpsRoute = null
        }
      }
    }

    // ── Update debug stats ─────────────────────────────────────────────────
    this._updateStats(pos)
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Vehicle mode (car / plane)
  // ───────────────────────────────────────────────────────────────────────────

  get vehicleMode(): VehicleMode {
    return this._vehicleMode
  }

  /** Switch car -> plane (on the ground, where the car is) or plane -> car. */
  togglePlane(opts: { airborne?: boolean } = {}): void {
    if (this._vehicleMode === 'plane') {
      this.exitPlane()
    } else {
      this.enterPlane(opts)
    }
  }

  /**
   * Take the plane. It appears where the car is, facing the same way — on the
   * ground, or (airborne) 150 m above it at cruise speed. In plane mode,
   * `airborne` re-launches the plane in the air above its current position.
   * Returns false if the plane could not be spawned (the car is kept).
   */
  enterPlane(opts: { airborne?: boolean } = {}): boolean {
    if (this.disposed || !this.world || !this.playerCar) return false
    const airborne = opts.airborne === true

    let ground: WorldPosition
    let heading: number
    if (this._vehicleMode === 'plane' && this.plane) {
      if (!airborne) return true
      const p = this.plane.getPosition()
      ground = isFiniteVec(p)
        ? groundBelow(p, this.plane.getState().altitudeAGL)
        : this.lastSafePlaneGround ?? { x: this.lastSafePos.x, y: 0, z: this.lastSafePos.z }
      heading = Number.isFinite(this.plane.getYaw()) ? this.plane.getYaw() : this.lastSafePlaneYaw
    } else {
      const c = this.playerCar.getPosition()
      // A car in a tunnel would put the plane under the street: clamp to street level
      ground = { x: c.x, y: Math.max(0, c.y - CAR_RIDE_HEIGHT), z: c.z }
      heading = this.playerCar.getYaw()
    }

    let plane: PlayerPlane
    try {
      plane = this._ensurePlane()
      plane.spawn(
        ground,
        heading,
        airborne ? { airborne: true, altitude: AIRBORNE_ALTITUDE, speed: AIRBORNE_SPEED } : undefined,
      )
    } catch (err) {
      console.error('[GameEngine] Could not spawn the plane:', err)
      try {
        this.plane?.despawn()
      } catch {
        // ignore
      }
      return false
    }

    if (this._vehicleMode !== 'plane') {
      // Park the car: keep all its state, take it out of the simulation
      // (also zeroes the UI-facing velocity cache).
      this.playerCar.park()
      this.playerCar.getMesh().visible = false

      const cam = this.renderer.camera
      this.savedCameraSettings = { fov: cam.fov, near: cam.near, far: cam.far }
      this._vehicleMode = 'plane'
      this.onVehicleModeChanged?.('plane')
    }

    this.lastSafePlaneGround = { ...ground }
    this.lastSafePlaneYaw = heading
    plane.syncMesh(1, 0)
    this.planeGun?.reset()
    plane.getMuzzles(this.muzzleA, this.muzzleB)
    plane.readForward(this.gunForward)
    this.flightCamera?.snap()
    return true
  }

  /**
   * Back to the car. Slow on the ground: the car appears where the plane is.
   * Otherwise (in the air, fast, crashed): on the nearest road, heading along it.
   */
  exitPlane(): void {
    if (this._vehicleMode !== 'plane') return
    const plane = this.plane
    let target: { pos: WorldPosition; heading: number; inPlace: boolean } | null = null

    if (plane) {
      const p = plane.getPosition()
      const st = plane.getState()
      const yaw = plane.getYaw()
      const sane = isFiniteVec(p) && Number.isFinite(yaw)
      if (sane && st.onGround && !st.crashed && st.groundSpeed < EXIT_IN_PLACE_MAX_SPEED) {
        target = { pos: { x: p.x, y: Math.max(0, p.y), z: p.z }, heading: yaw, inPlace: true }
      } else if (sane) {
        const road = this._findRoadDrop(p.x, p.z, yaw)
        if (road) target = { ...road, inPlace: false }
      }
    }

    this._leavePlane()

    if (target) {
      this._placeCar(target.pos, target.heading, !target.inPlace)
    } else {
      // Fallback: the last place the car was safely driving
      this._placeCar(
        { x: this.lastSafePos.x, y: Math.max(0, this.lastSafePos.y - CAR_RIDE_HEIGHT), z: this.lastSafePos.z },
        this.lastSafeYaw,
        true,
      )
    }
    this.gameClient?.sendRespawn()
    this._snapCarCamera()
  }

  /** Despawn the plane and give the simulation back to the car (not moved). */
  private _leavePlane(): void {
    if (this._vehicleMode !== 'plane') return
    try {
      this.plane?.despawn()
    } catch (err) {
      console.warn('[GameEngine] plane.despawn failed:', err)
    }
    this.planeGun?.reset()
    const body = this.playerCar.getRigidBody()
    body.setEnabled(true)
    this.playerCar.getMesh().visible = true

    // Give the car camera back its own settings
    const cam = this.renderer.camera
    if (this.savedCameraSettings) {
      cam.fov = this.savedCameraSettings.fov
      cam.near = this.savedCameraSettings.near
      cam.far = this.savedCameraSettings.far
      this.savedCameraSettings = null
    }
    cam.up.set(0, 1, 0)
    cam.updateProjectionMatrix()

    this._vehicleMode = 'car'
    this.onVehicleModeChanged?.('car')
  }

  /**
   * Put the (enabled) car at a ground point. `respawn` = like a respawn
   * (spawn invincibility); otherwise a quiet placement.
   */
  private _placeCar(ground: WorldPosition, heading: number, respawn: boolean): void {
    const car = this.playerCar
    if (respawn) {
      car.teleport(ground, heading)
    } else {
      const body = car.getRigidBody()
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), heading)
      body.setTranslation({ x: ground.x, y: ground.y + CAR_RIDE_HEIGHT, z: ground.z }, true)
      body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true)
      body.setLinvel({ x: 0, y: 0, z: 0 }, true)
      body.setAngvel({ x: 0, y: 0, z: 0 }, true)
      car.syncMesh(0)
    }
    // The car remembers its velocity from before the flight: one zero-dt tick
    // with a muted impact callback resets that, so no phantom crash is felt
    const onImpact = car.onImpact
    car.onImpact = () => {}
    car.applyInput({ throttle: 0, brake: 0, steering: 0, handbrake: false, nitro: false }, 0)
    if (onImpact) car.onImpact = onImpact

    const p = car.getPosition()
    this.lastSafePos = { x: p.x, y: p.y, z: p.z }
    this.lastSafeYaw = heading
  }

  /** Converge the chase camera behind the car right away. */
  private _snapCarCamera(): void {
    for (let i = 0; i < 45; i++) this.camera.update(1 / 60)
  }

  /**
   * Nearest drivable road point within EXIT_ROAD_SEARCH_RADIUS of (x, z),
   * heading along the road (the direction closest to `yaw`, or the one-way
   * direction). Main streets win over service roads at similar distance.
   */
  private _findRoadDrop(x: number, z: number, yaw: number): { pos: WorldPosition; heading: number } | null {
    const roads: Road[] = this.chunkManager?.getActiveRoads() ?? []
    const fx = Math.sin(yaw)
    const fz = Math.cos(yaw)
    let best: { pos: WorldPosition; heading: number } | null = null
    let bestScore = Infinity
    const maxSq = EXIT_ROAD_SEARCH_RADIUS * EXIT_ROAD_SEARCH_RADIUS
    for (const r of roads) {
      const rank = DROP_ROAD_RANK[r.highway]
      if (rank === undefined || r.points.length < 2) continue
      // Only plain street-level roads (no bridge decks, no tunnels)
      if (r.bridge || r.tunnel || (r.elevationMode && r.elevationMode !== 'ground')) continue
      const pts = r.points
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i]!
        const b = pts[i + 1]!
        const sx = b.x - a.x
        const sz = b.z - a.z
        const len2 = sx * sx + sz * sz
        if (len2 < 1) continue
        let t = ((x - a.x) * sx + (z - a.z) * sz) / len2
        // Stay off the very ends of a segment (junctions)
        t = Math.max(0.1, Math.min(0.9, t))
        const px = a.x + sx * t
        const pz = a.z + sz * t
        const d2 = (px - x) * (px - x) + (pz - z) * (pz - z)
        if (d2 > maxSq) continue
        const score = Math.sqrt(d2) + rank * 40
        if (score < bestScore) {
          bestScore = score
          let hx = sx
          let hz = sz
          if (!r.oneway && hx * fx + hz * fz < 0) {
            hx = -hx
            hz = -hz
          }
          best = { pos: { x: px, y: 0, z: pz }, heading: Math.atan2(hx, hz) }
        }
      }
    }
    return best
  }

  /** The plane state went bad (NaN, fell through the world): relaunch it in the air. */
  private _recoverPlane(): void {
    console.warn('[GameEngine] Plane state invalid — relaunching it in the air')
    const ground = this.lastSafePlaneGround ?? {
      x: this.lastSafePos.x,
      y: 0,
      z: this.lastSafePos.z,
    }
    try {
      this.plane?.spawn(ground, this.lastSafePlaneYaw, {
        airborne: true,
        altitude: AIRBORNE_ALTITUDE,
        speed: AIRBORNE_SPEED,
      })
      if (this.plane && isFiniteVec(this.plane.getPosition())) {
        this.plane.syncMesh(1, 0)
        this.flightCamera?.snap()
        return
      }
    } catch (err) {
      console.error('[GameEngine] Plane relaunch failed:', err)
    }
    // Still broken: back to the car
    this._leavePlane()
    this._placeCar(
      { x: this.lastSafePos.x, y: Math.max(0, this.lastSafePos.y - CAR_RIDE_HEIGHT), z: this.lastSafePos.z },
      this.lastSafeYaw,
      true,
    )
    this._snapCarCamera()
  }

  private _ensurePlane(): PlayerPlane {
    if (this.plane) return this.plane
    const plane = new PlayerPlane(this.world, this.renderer.scene)
    plane.onCrash = (intensity, point, direction) => {
      this.flightCamera?.addTrauma(intensity)
      this.impactFX?.triggerImpact(intensity, point, direction)
    }
    this.plane = plane
    this.flightCamera = new FlightCamera(this.renderer.camera, plane)

    const gun = new PlaneGun(this.renderer.scene, this.world)
    gun.onHit = (hit) => {
      const id =
        hit.colliderHandle === null
          ? null
          : this.remotePlayers?.getPlayerIdForCollider(hit.colliderHandle) ?? null
      if (id) {
        // Another player: the server arbitrates the damage
        this.combat?.reportHit(id, DAMAGE_PER_ROUND, { x: hit.point.x, y: hit.point.y, z: hit.point.z })
        this.onGunHit?.()
        return
      }
      // World hit: sparks + sound, throttled (the gun draws its own dust puff)
      if (this.lastWorldImpactFX > 0) return
      this.lastWorldImpactFX = WORLD_IMPACT_FX_INTERVAL
      this.impactFX?.triggerImpact(0.3, hit.point, this.gunForward)
    }
    this.planeGun = gun
    return plane
  }

  /**
   * One frame of machine guns. `plane` is null in car mode: the gun then only
   * cools down and finishes its tracers — it can never fire.
   */
  private _updateGun(dt: number, plane: PlayerPlane | null, input: FlightInput | null): void {
    const gun = this.planeGun
    if (!gun) return
    let firing = false
    if (plane) {
      plane.getMuzzles(this.muzzleA, this.muzzleB)
      plane.readForward(this.gunForward)
      firing = input?.fire === true && !plane.isCrashed() && this.destroyedUntil <= performance.now()
    }
    const before = gun.getState().ammo
    gun.update(dt, this.muzzleA, this.muzzleB, this.gunForward, firing)
    const fired = before - gun.getState().ammo
    if (fired > 0) this.flightCamera?.addTrauma(0.04 * fired)
  }

  /** A big two-stage burst (used for destructions). */
  private _explosionAt(p: WorldPosition): void {
    if (!isFiniteVec(p)) return
    this.impactFX?.triggerImpact(1, p, { x: 0, y: 1, z: 0 })
    this.impactFX?.triggerImpact(0.8, { x: p.x, y: p.y + 1.4, z: p.z }, { x: 0, y: -1, z: 0 })
  }

  /** Health reached 0: explosion, 'DÉTRUIT' state, then respawn. */
  private _destroyLocalPlayer(by: string): void {
    const pos = this.getPlayerPosition()
    this._explosionAt(pos)
    this.destroyedUntil = performance.now() + DESTROYED_MS
    this.planeGun?.reset()
    if (this._vehicleMode === 'plane') {
      this.flightCamera?.addTrauma(1)
      // Crash-reset: the plane is relaunched in the air over the last safe ground
      const ground =
        this.lastSafePlaneGround ??
        (isFiniteVec(pos) ? { x: pos.x, y: Math.max(0, pos.y - (this.plane?.getState().altitudeAGL ?? 0)), z: pos.z } : null)
      try {
        if (ground) {
          this.plane?.spawn(ground, this.lastSafePlaneYaw, {
            airborne: true,
            altitude: AIRBORNE_ALTITUDE,
            speed: AIRBORNE_SPEED,
          })
          this.plane?.syncMesh(1, 0)
          this.flightCamera?.snap()
        } else {
          this._recoverPlane()
        }
      } catch (err) {
        console.warn('[GameEngine] Respawn of the destroyed plane failed:', err)
        this._recoverPlane()
      }
    } else {
      this.camera?.addTrauma(1)
      this.respawnPlayer()
    }
    this.onPlayerDestroyed?.(by)
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Active-vehicle getters (car or plane) for the UI
  // ───────────────────────────────────────────────────────────────────────────

  /** Position of the vehicle being driven (car body centre / plane wheels point). */
  getPlayerPosition(): WorldPosition {
    if (this._vehicleMode === 'plane' && this.plane) {
      const p = this.plane.getPosition()
      if (isFiniteVec(p)) return p
    }
    return this.playerCar.getPosition()
  }

  /** Horizontal-ish heading vector of the active vehicle (car: its forward vector, as before). */
  getPlayerHeadingVector(): THREE.Vector3 {
    if (this._vehicleMode === 'plane' && this.plane) {
      const f = this.plane.getForwardVector()
      const h = Math.hypot(f.x, f.z)
      if (Number.isFinite(h) && h > 0.2) return new THREE.Vector3(f.x / h, 0, f.z / h)
      // Nose straight up/down: use the flight path, then the yaw
      const v = this.plane.getVelocity()
      const vh = Math.hypot(v.x, v.z)
      if (Number.isFinite(vh) && vh > 1) return new THREE.Vector3(v.x / vh, 0, v.z / vh)
      const yaw = this.plane.getYaw()
      if (Number.isFinite(yaw)) return new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw))
    }
    return this.playerCar.getHeadingVector()
  }

  /** World velocity (m/s) of the active vehicle. */
  getPlayerVelocity(): { x: number; y: number; z: number } {
    if (this._vehicleMode === 'plane' && this.plane) {
      const v = this.plane.getVelocity()
      if (isFiniteVec(v)) return v
      return { x: 0, y: 0, z: 0 }
    }
    return this.playerCar.getVelocity()
  }

  /** Speed (m/s) of the active vehicle (car: horizontal speed, as before). */
  getPlayerSpeed(): number {
    if (this._vehicleMode === 'plane' && this.plane) {
      const v = this.getPlayerVelocity()
      return Math.hypot(v.x, v.y, v.z)
    }
    return this.playerCar.getSpeed()
  }

  /** Flight instruments, or null when driving the car. */
  getFlightState(): PlaneState | null {
    if (this._vehicleMode !== 'plane' || !this.plane) return null
    return this.plane.getState()
  }
  /** Machine-gun readout (ammo, heat), or null outside plane mode. */
  getGunState(): { ammo: number; maxAmmo: number; heat: number; overheated: boolean; firing: boolean } | null {
    if (this._vehicleMode !== 'plane' || !this.planeGun) return null
    return this.planeGun.getState()
  }

  /** Nitro gauge 0..1 + boost state, or null outside car mode. */
  getNitroState(): { charge: number; boosting: boolean } | null {
    if (this._vehicleMode !== 'car' || !this.playerCar) return null
    return this.playerCar.getNitro()
  }

  /** True while the car is sliding (car mode only). */
  isDrifting(): boolean {
    if (this._vehicleMode !== 'car' || !this.playerCar) return false
    return this.playerCar.isDrifting()
  }

  /** Health / spawn protection of the local player. */
  getCombatState(): { health: number; maxHealth: number; invincible: boolean } {
    const c = this.combat
    return {
      health: c ? c.health : MAX_HEALTH,
      maxHealth: MAX_HEALTH,
      invincible: c ? c.invincible : false,
    }
  }

  /** True during the ~1.5 s that follow a destruction (HUD overlay). */
  isDestroyed(): boolean {
    return this.destroyedUntil > performance.now()
  }

  /**
   * Accumulate trophy stats for one frame. Jump detection is heuristic and
   * bridge-safe: a segment opens on strong upward velocity (ramps/bumps off
   * bridge decks never spike vy) and closes once vertical speed settles past
   * a minimum air time (survives the apex, ends on landing).
   */
  private _trackTripStats(delta: number, pos: WorldPosition, inCar: boolean): void {
    this.tripPlayTimeS += delta

    const prev = this.lastStatsPos
    this.lastStatsPos = { x: pos.x, y: pos.y, z: pos.z }
    if (!prev) return
    const dx = pos.x - prev.x
    const dz = pos.z - prev.z
    const step = Math.hypot(dx, dz)
    if (!Number.isFinite(step)) return
    if (step > TRIP_MAX_FRAME_DELTA_M) {
      // Teleport / travel / vehicle switch: drop the segment, rebase.
      this.jumpActive = false
      this.jumpDistM = 0
      this.jumpTimeS = 0
      return
    }
    this.tripDistanceM += step

    if (!inCar) {
      this.jumpActive = false
      this.jumpDistM = 0
      this.jumpTimeS = 0
      return
    }
    const vy = this.getPlayerVelocity().y
    if (!Number.isFinite(vy)) {
      this.jumpActive = false
      return
    }
    if (!this.jumpActive) {
      if (vy > JUMP_START_VY) {
        this.jumpActive = true
        this.jumpDistM = 0
        this.jumpTimeS = 0
      }
      return
    }
    this.jumpDistM += step
    this.jumpTimeS += delta
    if (this.jumpTimeS >= JUMP_MIN_TIME_S && Math.abs(vy) < JUMP_END_VY) {
      if (this.jumpDistM >= JUMP_MIN_DIST_M) {
        this.tripJumpM += this.jumpDistM
        if (this.jumpDistM > this.tripMaxJumpM) this.tripMaxJumpM = this.jumpDistM
      }
      this.jumpActive = false
      this.jumpDistM = 0
      this.jumpTimeS = 0
    }
  }

  /** Unsaved session deltas; resets distance/jump/time (max is server-side). */
  consumeTripStats(): TripStats {
    const out: TripStats = {
      distanceM: this.tripDistanceM,
      jumpM: this.tripJumpM,
      playTimeS: this.tripPlayTimeS,
      maxJumpM: this.tripMaxJumpM,
    }
    this.tripDistanceM = 0
    this.tripJumpM = 0
    this.tripPlayTimeS = 0
    this.tripMaxJumpM = 0
    return out
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Time trials (monument → monument, started on foot with Enter)
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Shared trial source data: loaded POIs/roads plus far-radar monuments
   * and corridors for the current destination (best-effort).
   */
  private trialSourceData(): {
    pois: PointOfInterest[]
    roads: Road[]
    extra: { monuments?: { id: string; name: string; x: number; z: number }[]; roads?: Road[] } | undefined
  } {
    const pois = this.chunkManager.getActivePOIs()
    const roads = this.chunkManager.getActiveRoads()
    const radar = this.trialRadar && this.trialRadar.destId === this.currentDestination.id
      ? this.trialRadar
      : null
    const extraMonuments = radar
      ? radar.monuments.map((m) => {
          const w = geoToWorld({ latitude: m.lat, longitude: m.lon })
          return { id: m.id, name: m.name, x: w.x, z: w.z }
        })
      : undefined
    const extraRoads = radar ? [...radar.corridors.values()].flat() : undefined
    const extra =
      extraMonuments || extraRoads
        ? {
            ...(extraMonuments ? { monuments: extraMonuments } : {}),
            ...(extraRoads ? { roads: extraRoads } : {}),
          }
        : undefined
    return { pois, roads, extra }
  }

  /** Nearby generated trials (cached, recomputed at most every 5s / 150m). */
  getNearbyTrials(count = 3): TrialDef[] {
    const pos = this.getPlayerPosition()
    const now = performance.now()
    const c = this.trialCache
    if (c && c.count === count) {
      const movedSq = (pos.x - c.atX) * (pos.x - c.atX) + (pos.z - c.atZ) * (pos.z - c.atZ)
      if (now - c.atTime < 5000 && movedSq < 150 * 150) return c.list
    }
    let list: TrialDef[] = []
    try {
      if (this.chunkManager) {
        const src = this.trialSourceData()
        list = generateTrials(
          src.pois,
          src.roads,
          this.currentDestination.id,
          pos,
          count,
          src.extra,
        )
      }
    } catch {
      list = []
    }
    this.trialCache = { list, count, atX: pos.x, atZ: pos.z, atTime: now }
    return list
  }

  /**
   * Every race from one start beacon (start panel list). Cached 30s and
   * invalidated with the trial source data, so all players at the same
   * beacon converge on the same races once chunks/radar settle.
   */
  getBeaconTrials(beaconId: string, count = 6): TrialDef[] {
    const now = performance.now()
    const c = this.beaconTrialCache
    if (
      c &&
      c.beaconId === beaconId &&
      c.destId === this.currentDestination.id &&
      c.dataVersion === this.trialDataVersion &&
      now - c.atTime < 30_000
    ) {
      return c.list.slice(0, count)
    }
    let list: TrialDef[] = []
    try {
      if (this.chunkManager) {
        const src = this.trialSourceData()
        list = getBeaconTrials(
          beaconId,
          src.pois,
          src.roads,
          this.currentDestination.id,
          Math.max(count, 6),
          src.extra,
        )
      }
    } catch {
      list = []
    }
    this.beaconTrialCache = {
      beaconId,
      destId: this.currentDestination.id,
      count,
      list,
      atTime: now,
      dataVersion: this.trialDataVersion,
    }
    return list.slice(0, count)
  }

  /**
   * Refresh the far-monument radar (Overpass, disk-cached): monuments in a
   * ~2.5km sweep around the destination origin, then road corridors for the
   * most promising pairs. No-op while a run is active; throttled to 90s per
   * destination. Resolves when done (errors → chunk-only fallback).
   */
  async refreshTrialRadar(): Promise<void> {
    if (this.disposed || this.trialPhase !== 'idle') return
    const dest = this.currentDestination
    const prev = this.trialRadar && this.trialRadar.destId === dest.id ? this.trialRadar : null
    if (prev && (prev.loading || performance.now() - prev.atTime < 90_000)) return
    const radar = {
      destId: dest.id,
      monuments: prev?.monuments ?? [],
      corridors: prev?.corridors ?? new Map<string, Road[]>(),
      atTime: performance.now(),
      loading: true,
    }
    this.trialRadar = radar
    try {
      const monuments = await fetchRadarMonuments(dest.origin)
      if (this.disposed || this.currentDestination.id !== dest.id) return
      radar.monuments = monuments

      // Candidate pairs by crow-flies distance (deterministic order), then
      // corridors for the first few so A* has real road distances.
      const pos = this.getPlayerPosition()
      const pts: Array<{ id: string; x: number; z: number }> = []
      try {
        for (const poi of this.chunkManager.getActivePOIs()) {
          if (poi.kind !== 'tourism' || !poi.name) continue
          pts.push({ id: poi.id, x: poi.position.x, z: poi.position.z })
        }
      } catch {
        // chunk manager unavailable — radar monuments only
      }
      for (const m of monuments) {
        const w = geoToWorld({ latitude: m.lat, longitude: m.lon })
        pts.push({ id: m.id, x: w.x, z: w.z })
      }
      const pairs: Array<{ key: string; a: GeoPosition; b: GeoPosition }> = []
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const a = pts[i]!
          const b = pts[j]!
          const crow = Math.hypot(a.x - b.x, a.z - b.z)
          if (crow < 150 || crow > 3500) continue
          const key = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`
          pairs.push({
            key,
            a: worldToGeo({ x: a.x, y: 0, z: a.z }),
            b: worldToGeo({ x: b.x, y: 0, z: b.z }),
          })
        }
      }
      pairs.sort((p, q) => (p.key < q.key ? -1 : p.key > q.key ? 1 : 0))
      for (const pair of pairs.slice(0, 3)) {
        if (this.disposed || this.currentDestination.id !== dest.id) return
        if (!radar.corridors.has(pair.key)) {
          const roads = await fetchCorridorRoads(pair.a, pair.b).catch(() => [])
          if (this.disposed || this.currentDestination.id !== dest.id) return
          radar.corridors.set(pair.key, roads)
          // Bounded FIFO: corridors refetch cheaply (server-cached Overpass).
          while (radar.corridors.size > 12) {
            const oldest = radar.corridors.keys().next().value
            if (oldest === undefined) break
            radar.corridors.delete(oldest)
          }
        }
      }
      radar.atTime = performance.now()
    } catch {
      // best-effort radar — chunk POIs still work
    } finally {
      radar.loading = false
      // Surface the new data on the next read.
      this.trialCache = null
      this.trialDataVersion++
    }
  }

  getTrialStatus(): TrialStatus {
    const pos = this.getPlayerPosition()
    if (this.trialPhase === 'idle') {
      let proposal: TrialDef | null = null
      let dist = Infinity
      for (const t of this.getNearbyTrials()) {
        const d = Math.hypot(t.from.x - pos.x, t.from.z - pos.z)
        if (d < dist) {
          dist = d
          proposal = t
        }
      }
      return {
        phase: 'idle',
        proposal,
        distToStartM: dist,
        active: null,
        countdownS: 0,
        elapsedMs: 0,
        remainingM: 0,
        lastResult: this.trialResult,
      }
    }
    const active = this.trialActive
    const remaining = active ? Math.hypot(active.to.x - pos.x, active.to.z - pos.z) : 0
    return {
      phase: this.trialPhase,
      proposal: null,
      distToStartM: Infinity,
      active,
      countdownS: this.trialPhase === 'countdown' ? Math.max(0, this.trialT) : 0,
      elapsedMs: this.trialPhase === 'running' ? Math.round(this.trialT * 1000) : this.trialFinalMs,
      remainingM: remaining,
      lastResult: this.trialResult,
    }
  }

  /** Start/finish markers for the minimap. The finish stays hidden until GO. */
  getTrialMarkers(): { start: { x: number; z: number } | null; finish: { x: number; z: number } | null } {    if (this.trialPhase === 'idle') {
      const st = this.getTrialStatus()
      const p = st.proposal
      return {
        start: p ? { x: p.from.x, z: p.from.z } : null,
        finish: null,
      }
    }
    const a = this.trialActive
    if (!a || this.trialPhase === 'finished') return { start: null, finish: null }
    return { start: { x: a.from.x, z: a.from.z }, finish: { x: a.to.x, z: a.to.z } }
  }

  /**
   * Every available trial start (deduped beacons) for the minimap.
   * Discovery lives on the map now — no HUD guidance nagging.
   */
  getTrialStartPoints(): Array<{ x: number; z: number }> {
    const seen = new Set<string>()
    const out: Array<{ x: number; z: number }> = []
    try {
      for (const t of this.getNearbyTrials(12)) {
        if (seen.has(t.from.id)) continue
        seen.add(t.from.id)
        out.push({ x: t.from.x, z: t.from.z })
      }
    } catch {
      // no chunk data yet — nothing to show
    }
    return out
  }

  /**
   * Start a trial from the current position (no teleport: the player drove
   * to the start). Returns false when too far from the start line.
   * Guidance during the run is a straight line (shortest path), so the
   * player's own GPS is stashed and restored afterwards.
   */
  startTrial(trial: TrialDef): boolean {
    if (this.disposed || !this.playerCar) return false
    if (this._vehicleMode === 'plane') this.exitPlane()
    const pos = this.getPlayerPosition()
    if (Math.hypot(trial.from.x - pos.x, trial.from.z - pos.z) > TRIAL_START_RADIUS_M * 1.5) {
      return false
    }
    this.abortTrial()
    this.trialActive = trial
    this.trialPhase = 'countdown'
    this.trialT = TRIAL_COUNTDOWN_S
    this.trialFinalMs = 0
    this.trialSavedGps = this.gpsDestination
    this.setGpsDestination(null)
    return true
  }

  abortTrial(): void {
    this.trialPhase = 'idle'
    this.trialActive = null
    this.trialResult = null
    this.trialFinalMs = 0
    const saved = this.trialSavedGps
    this.trialSavedGps = null
    this.setGpsDestination(saved)
  }

  private _onEnterPressed(): void {
    if (this.disposed) return
    if (this.trialPhase === 'countdown' || this.trialPhase === 'running') return
    if (this.trialPhase === 'finished') {
      this.abortTrial()
      return
    }
    const st = this.getTrialStatus()
    if (st.proposal && st.distToStartM <= TRIAL_START_RADIUS_M) {
      // A race picked in the start panel (click / keys 1-6) wins over the
      // default proposal. startTrial() itself enforces proximity, so a
      // stale pick simply falls back to the proposal.
      const sel = this.trialSelected
      if (sel) {
        if (this.startTrial(sel)) {
          this.trialSelected = null
          return
        }
      }
      this.trialSelected = null
      this.startTrial(st.proposal)
    } else if (this._vehicleMode === 'plane') {
      this.exitPlane()
    }
  }

  /** Race picked in the start panel (same beacon). ENTRÉE starts it. */
  setTrialSelection(trial: TrialDef | null): void {
    this.trialSelected = trial
  }

  private _updateTrial(delta: number, pos: WorldPosition): void {
    if (this.trialPhase === 'countdown') {
      this.trialT -= delta
      if (this.trialT <= 0) {
        this.trialPhase = 'running'
        this.trialT = 0
      }
    } else if (this.trialPhase === 'running' && this.trialActive) {
      this.trialT += delta
      const dx = this.trialActive.to.x - pos.x
      const dz = this.trialActive.to.z - pos.z
      if (dx * dx + dz * dz < TRIAL_FINISH_RADIUS_M * TRIAL_FINISH_RADIUS_M) {
        const ms = Math.round(this.trialT * 1000)
        this.trialPhase = 'finished'
        this.trialFinalMs = ms
        this.trialResult = { trial: this.trialActive, timeMs: ms }
        const saved = this.trialSavedGps
        this.trialSavedGps = null
        this.setGpsDestination(saved)
        this.onTrialFinished?.(this.trialActive, ms)
      }
    }
    this._updateTrialBeacons()
  }

  private _buildTrialBeacons(): void {
    const make = (color: number): { group: THREE.Group; ring: THREE.Mesh } => {
      const group = new THREE.Group()
      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(2.2, 2.2, 44, 20, 1, true),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.28, depthWrite: false }),
      )
      beam.position.y = 22
      beam.renderOrder = 50
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(5, 0.35, 10, 40),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false }),
      )
      ring.rotation.x = Math.PI / 2
      ring.position.y = 0.4
      ring.renderOrder = 51
      group.add(beam, ring)
      group.visible = false
      this.renderer.scene.add(group)
      return { group, ring }
    }
    const start = make(0x34d399)
    const finish = make(0xef4444)
    this.trialBeacons = {
      start: start.group,
      startRing: start.ring,
      finish: finish.group,
      finishRing: finish.ring,
    }
  }

  private _updateTrialBeacons(): void {
    const b = this.trialBeacons
    if (!b) return
    const pulse = 1 + 0.12 * Math.sin(performance.now() / 250)
    b.startRing.scale.set(pulse, pulse, 1)
    b.finishRing.scale.set(pulse, pulse, 1)
    if (this.trialPhase === 'idle') {
      const p = this.getTrialStatus().proposal
      b.start.visible = !!p
      // The finish beacon is a surprise: revealed at GO, not before.
      b.finish.visible = false
      if (p) {
        b.start.position.set(p.from.x, 0, p.from.z)
      }
    } else if (this.trialPhase === 'finished') {
      b.start.visible = false
      b.finish.visible = false
    } else if (this.trialActive) {
      b.start.visible = false
      b.finish.visible = true
      b.finish.position.set(this.trialActive.to.x, 0, this.trialActive.to.z)
    } else {
      b.start.visible = false
      b.finish.visible = false
    }
  }

  /**
   * Display name shown above our car to other players (null = anonymous).
   * Safe to call before init(): the value is applied when the GameClient
   * is created.
   */
  setLocalDisplayName(name: string | null): void {
    const clean = name?.trim().slice(0, 24)
    this.pendingDisplayName = clean ? clean : null
    if (this.gameClient) {
      this.gameClient.localDisplayName = this.pendingDisplayName
    }
  }

  setGpsDestination(target: WorldPosition | null): void {
    this.gpsDestination = target
    if (!target) {
      this.gpsRoute = null
      return
    }
    this.recalculateGpsRoute()
  }

  getGpsDestination(): WorldPosition | null {
    return this.gpsDestination
  }

  getGpsRoute(): WorldPosition[] | null {
    return this.gpsRoute
  }

  getNPCPositions(): WorldPosition[] {
    return this.npcManager?.getNPCPositions() ?? []
  }

  getRemotePlayerPositions(): Array<{ id: string; x: number; z: number }> {
    return this.remotePlayers?.getPlayerPositions() ?? []
  }

  getConnectedPlayerCount(): number {
    if (!this.gameClient || !this.gameClient.isConnected) return 0
    const clientCount = this.gameClient.connectedPlayerCount
    const visibleRemote = this.remotePlayers?.getPlayerPositions().length ?? 0
    return Math.max(clientCount, visibleRemote + 1)
  }

  isNetworkConnected(): boolean {
    return this.gameClient?.isConnected ?? false
  }

  /**
   * Explicit online/offline mode (default online). Offline closes the
   * multiplayer socket with no reconnect attempts; time-trial runs are
   * recorded locally and synced on return to online (see the HUD flush).
   * Solo play (driving, NPC traffic, chunks) is unaffected.
   */
  setOnlineMode(online: boolean): void {
    setOnlineModeSetting(online)
    this.gameClient?.setSocketsEnabled(online)
  }

  getNetworkLatency(): number {
    return this.gameClient?.latency ?? -1
  }

  getInvincibilityRemaining(): number {
    return this.playerCar?.getInvincibilityRemaining() ?? 0
  }

  isPlayerInvincible(): boolean {
    return this.playerCar?.isInvincible() ?? false
  }

  respawnPlayer(): void {
    if (!this.playerCar) return
    if (this._vehicleMode === 'plane') {
      // Back in the car, on a road near the plane (or the last safe spot)
      this.exitPlane()
      this.playerCar.grantSpawnInvincibility()
      return
    }
    this._recoverCarOnRoad('manual')
  }

  /**
   * Puts the car back upright, preferably right where it is when there is
   * solid ground underneath (street, bridge — or a rooftop, which is fully
   * drivable): flip-over and manual "Débloquer" keep you at the spot.
   * Falls through the world and water land on the nearest road instead.
   * Final fallback is the last safe position.
   */
  private _recoverCarOnRoad(reason: 'fall' | 'flip' | 'manual'): void {
    const car = this.playerCar
    if (!car) return
    this.flipTimer = 0
    let pos: WorldPosition
    try {
      pos = car.getPosition()
    } catch {
      car.teleport(this.lastSafePos, this.lastSafeYaw)
      this.gameClient?.sendRespawn()
      return
    }
    if (!isFiniteVec(pos)) {
      car.teleport(this.lastSafePos, this.lastSafeYaw)
      car.grantSpawnInvincibility()
      this.gameClient?.sendRespawn()
      return
    }
    // Face along current travel direction when known (avoids respawning
    // nose-to-traffic); reused by both the in-place and road recoveries.
    const heading = this._levelHeading()
    if (reason !== 'fall') {
      // Solid surface close underneath? Re-level in place (rooftops stay
      // rooftops — driving up there is a feature, not a bug).
      const ground = this._solidGroundBelow(pos.x, pos.y, pos.z, 8)
      if (ground !== null && pos.y - ground <= 8) {
        const y = ground + 0.5
        car.teleport({ x: pos.x, y, z: pos.z }, heading)
        car.grantSpawnInvincibility()
        this.gameClient?.sendRespawn()
        this.lastSafePos = { x: pos.x, y, z: pos.z }
        this.lastSafeYaw = heading
        return
      }
    }
    const spot = this.chunkManager?.getNearestRoadPoint(pos.x, pos.z, 150) ?? null
    if (!spot) {
      // No road data (chunks still loading): stay at the spot, safe height.
      const y = Number.isFinite(pos.y) ? Math.max(pos.y, 0.5) : 0.5
      car.teleport({ x: pos.x, y, z: pos.z }, this.lastSafeYaw)
      car.grantSpawnInvincibility()
      this.gameClient?.sendRespawn()
      this.lastSafePos = { x: pos.x, y, z: pos.z }
      return
    }
    // Face along the road, keeping the car's current direction when it
    // disagrees with the segment orientation.
    let sx = spot.dirX
    let sz = spot.dirZ
    {
      const cur = this._levelForward()
      if (cur && cur.hx * spot.dirX + cur.hz * spot.dirZ < 0) {
        sx = -spot.dirX
        sz = -spot.dirZ
      }
    }
    const roadHeading = Math.atan2(sx, sz)
    const y = spot.y + 0.5
    car.teleport({ x: spot.x, y, z: spot.z }, roadHeading)
    car.grantSpawnInvincibility()
    this.gameClient?.sendRespawn()
    this.lastSafePos = { x: spot.x, y, z: spot.z }
    this.lastSafeYaw = roadHeading
  }

  /** Horizontal forward of the car (null when unusable, e.g. nose straight down). */
  private _levelForward(): { hx: number; hz: number } | null {
    try {
      const f = this.playerCar.getHeadingVector()
      const hl = Math.hypot(f.x, f.z)
      if (hl > 0.2) return { hx: f.x / hl, hz: f.z / hl }
    } catch {
      // fall through to the yaw fallback below
    }
    const yaw = this.lastSafeYaw
    if (Number.isFinite(yaw)) return { hx: Math.sin(yaw), hz: Math.cos(yaw) }
    return null
  }

  /** Yaw keeping the current travel direction when known. */
  private _levelHeading(): number {
    const cur = this._levelForward()
    if (!cur) return this.lastSafeYaw
    return Math.atan2(cur.hx, cur.hz)
  }

  /** Reusable downward ray for the recovery ground check (see PlayerPlane). */
  private recoverRay: RAPIER.Ray | null = null

  /** Height of the first solid surface below (x, y, z), car excluded. */
  private _solidGroundBelow(x: number, y: number, z: number, maxDist: number): number | null {
    try {
      if (!this.recoverRay) {
        this.recoverRay = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 })
      }
      const r = this.recoverRay
      r.origin.x = x
      r.origin.y = y + 0.5
      r.origin.z = z
      r.dir.x = 0
      r.dir.y = -1
      r.dir.z = 0
      let exclude: RAPIER.RigidBody | undefined
      try {
        exclude = this.playerCar?.getRigidBody() ?? undefined
      } catch {
        exclude = undefined
      }
      const hit = this.world.castRay(
        r,
        maxDist,
        true,
        RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
        undefined,
        undefined,
        exclude,
        undefined,
      )
      return hit ? r.origin.y - hit.toi : null
    } catch {
      return null
    }
  }

  /** Seconds left before auto flip-recovery (0 when upright): HUD countdown. */
  getFlipRecoveryCountdown(): number {
    if (this._vehicleMode !== 'car' || !this.playerCar) return 0
    if (this.flipTimer <= 0.05) return 0
    return Math.max(0, FLIP_RECOVER_AFTER_S - this.flipTimer)
  }

  recalculateGpsRoute(): void {
    if (!this.gpsDestination || !this.chunkManager || !this.playerCar) return
    const roads = this.chunkManager.getActiveRoads()
    if (roads.length === 0) return
    const graph = buildRoadGraph(roads)
    const p = this.getPlayerPosition()
    this.gpsRoute = findAStarPath(graph, p, this.gpsDestination)
  }

  /**
   * Fast travels to another city/region in the world.
   * Re-centers the Mercator projection, streams the area through the single
   * world pipeline, and places the player car safely at the spawn point —
   * or at `opts.landAt` (trial-start redo: lands facing the finish instead
   * of the spawn). Identical logic for every place on Earth.
   */
  travelTo(destination: WorldDestination, opts?: { landAt?: { x: number; z: number; heading?: number } }): void {
    // A world jump voids any running time trial (and its GPS guidance).
    this.abortTrial()
    // The world origin moves: radar caches are tied to the destination.
    this.trialRadar = null
    this.trialCache = null
    this.beaconTrialCache = null
    this.trialDataVersion++
    // Travel always lands in the car
    const wasFlying = this._vehicleMode === 'plane'
    this._leavePlane()
    this.currentDestination = destination

    // 1. Reset origin and reload the area through the single streaming pipeline
    this.chunkManager.resetToOrigin(destination.origin)

    // 2. Reset OSM streaming state for the new location (the destination area
    //    is fetched below, so mark it covered to avoid a duplicate fetch)
    this.osmStreaming.reset()
    this.osmStreaming.markCovered(destination.origin)

    // 3. Clear GPS destination and route
    this.gpsDestination = null
    this.gpsRoute = null

    // 3. Teleport player car to destination spawn (or the trial start)
    const landAt = opts?.landAt
    const spawnPos = landAt
      ? { x: landAt.x, y: 0.5, z: landAt.z }
      : (destination.spawnPosition ?? { x: 62.5, y: 0.5, z: 62.5 })
    const spawnHeading = landAt?.heading ?? destination.spawnHeading ?? 0
    this.playerCar.teleport(spawnPos, spawnHeading)
    this.gameClient.sendRespawn()

    // 4. Update camera
    if (wasFlying) this._snapCarCamera()
    else this.camera.update(0.016)

    // 5. Trigger immediate world streaming around spawn point (procedural ready immediately)
    this.chunkManager.update(spawnPos)

    // 6. Notify UI
    this.onDestinationChanged?.(destination)

    // 7. Stream real OpenStreetMap roads & buildings live for this new area!
    // (parsed in the worker so the teleport stays smooth).
    this._fetchInitialOsm(
      destination.origin,
      300,
      undefined,
      destination.spawnPosition,
      destination.spawnHeading,
    )
      .then((realOsm) => {
        // Shared far-transition pipeline: re-seat on the real road
        // centreline unless we landed on a trial start (redo).
        // (the player may have taken the plane meanwhile: back to the car)
        this._applyStreamedArea(realOsm, {
          destId: destination.id,
          ...(landAt ? { landAt } : {}),
          wasFlying: this._vehicleMode === 'plane',
        })
      })
      .catch((err) => {
        console.warn('[GameEngine] Live OSM fetch failed, keeping procedural chunks:', err)
        if (this.currentDestination.id === destination.id && !this.disposed) this.osmStreaming.reset()
      })
  }

  /**
   * Origin auto-rebase: when the player drives far from the world origin,
   * re-centre the Mercator frame on the player instead of letting local
   * coordinates (and chunk keys) grow unbounded.
   *
   * Same WS/session throughout; velocity, heading, GPS route and safe-spot
   * survive via geo round-trips. Trials follow travelTo policy (aborted:
   * beacons are local-frame). Returns true when a rebase happened and the
   * caller must refresh its position snapshot.
   */
  private _maybeRebaseOrigin(): boolean {
    if (this.disposed) return false
    const pos = this.getPlayerPosition()
    if (!isFiniteVec(pos)) return false
    const geo = worldToGeo(pos)
    if (geoDistanceMeters(getWorldOrigin(), geo) < REBASE_DISTANCE_M) return false

    const flying = this._vehicleMode === 'plane' && this.plane !== null
    const heading = flying && this.plane ? this.plane.getYaw() : this.playerCar.getYaw()

    // Trials are local-frame: same policy as travelTo.
    this.abortTrial()
    this.trialRadar = null
    this.trialCache = null
    this.beaconTrialCache = null
    this.trialSelected = null
    this.trialDataVersion++

    // Snapshot everything worth keeping (old frame → geo).
    const gpsGeo = this.gpsDestination ? worldToGeo(this.gpsDestination) : null
    const safeGeo = worldToGeo(this.lastSafePos)

    // Re-centre: new local frame, fresh chunk/streaming state.
    const newOrigin: GeoPosition = { latitude: geo.latitude, longitude: geo.longitude }
    this.chunkManager.resetToOrigin(newOrigin)
    this.osmStreaming.reset()
    this.osmStreaming.markCovered(newOrigin)

    // Same geo, new local coords (≈ origin): velocity-preserving move.
    // (car teleport adds ride height itself, so subtract it back.)
    const local = geoToWorld(newOrigin)
    if (flying && this.plane) {
      this.plane.shiftBy(local.x - pos.x, local.z - pos.z)
      this.flightCamera?.snap()
    } else {
      this.playerCar.teleport({ x: local.x, y: pos.y - 0.48, z: local.z }, heading, {
        preserveVelocity: true,
      })
      this._snapCarCamera()
    }
    this.gameClient.sendRespawn()

    // Restore keepers in the new frame (geo round-trips preserve altitude).
    this.lastSafePos = geoToWorld(safeGeo)
    this.lastSafeYaw = heading
    if (gpsGeo) {
      this.gpsDestination = geoToWorld(gpsGeo)
      this.recalculateGpsRoute()
    } else {
      this.gpsRoute = null
    }

    this.chunkManager.update(this.getPlayerPosition())

    // Backfill real OSM around the new origin without moving the player.
    this._fetchInitialOsm(newOrigin, 300)
      .then((realOsm) => {
        if (this.disposed || !realOsm || realOsm.chunks.size === 0) return
        // The player may have driven on (or hit another rebase) since.
        if (geoDistanceMeters(getWorldOrigin(), newOrigin) > 1) return
        this.chunkManager.addRealOsmChunks(realOsm.chunks)
        this.chunkManager.update(this.getPlayerPosition())
        this.osmStreaming.markCovered(newOrigin)
      })
      .catch((err) => {
        console.warn('[GameEngine] Rebase OSM backfill failed, keeping procedural chunks:', err)
      })

    console.log(
      `[GameEngine] Origin rebased → lat ${newOrigin.latitude.toFixed(5)}, lon ${newOrigin.longitude.toFixed(5)}`,
    )
    return true
  }

  /**
   * Teleport to a trial start from the run history (CHRONO redo). Travels to
   * the trial's destination when needed, then lands on the start beacon
   * facing the finish — the start panel appears, ENTRÉE re-runs the race.
   * Returns false when the destination can't be resolved (rows recorded
   * before start coordinates were stored).
   */
  gotoTrialStart(t: {
    destinationId: string
    fromX: number | null
    fromZ: number | null
    toX?: number | null
    toZ?: number | null
    originLat?: number | null
    originLng?: number | null
  }): boolean {
    if (t.fromX === null || t.fromZ === null || !Number.isFinite(t.fromX) || !Number.isFinite(t.fromZ)) {
      return false
    }
    const fromX = t.fromX
    const fromZ = t.fromZ
    this.abortTrial()
    const dx = (t.toX ?? fromX) - fromX
    const dz = (t.toZ ?? fromZ) - fromZ
    const heading = dx === 0 && dz === 0 ? 0 : Math.atan2(dx, dz)
    if (this.currentDestination.id === t.destinationId) {
      const p = this.getPlayerPosition()
      this.playerCar.teleport({ x: fromX, y: p.y, z: fromZ }, heading)
      this.gameClient?.sendRespawn()
      return true
    }
    const known = WORLD_DESTINATIONS.find((d) => d.id === t.destinationId)
    if (known) {
      this.travelTo(known, { landAt: { x: fromX, z: fromZ, heading } })
      return true
    }
    // Old search area: rebuild a custom destination around the stored origin.
    if (
      typeof t.originLat === 'number' &&
      typeof t.originLng === 'number' &&
      Number.isFinite(t.originLat) &&
      Number.isFinite(t.originLng)
    ) {
      this.travelTo(createCustomDestination(t.originLat, t.originLng, 'Chrono'), {
        landAt: { x: fromX, z: fromZ, heading },
      })
      return true
    }
    return false
  }

  getCurrentStreet(): StreetInfo | null {
    if (!this.chunkManager || !this.playerCar) return null
    return this.chunkManager.getNearestStreet(
      this.getPlayerPosition(),
      this.getPlayerHeadingVector(),
    )
  }

  private _updateStats(pos: WorldPosition): void {
    const info = this.renderer.renderer.info
    const chunkId = worldToChunk(pos)
    // Street lookup scans every loaded road segment: refresh at ~5 Hz / 5 m.
    const now = performance.now()
    const sp = this.lastStatStreetPos
    const movedSq = sp ? (pos.x - sp.x) * (pos.x - sp.x) + (pos.z - sp.z) * (pos.z - sp.z) : Infinity
    if (!sp || movedSq > 25 || now - this.lastStatStreetAt > 200) {
      this.lastStatStreetPos = { x: pos.x, y: pos.y, z: pos.z }
      this.lastStatStreetAt = now
      const heading = this.getPlayerHeadingVector()
      const street = this.chunkManager?.getNearestStreet(pos, heading)
      this.lastStatStreetName = street ? street.name : undefined
    }
    const streetName = this.lastStatStreetName
    // Poll authoritative server metrics at low frequency (fire-and-forget).
    if (now - this.lastServerMetricsAt > 5000) {
      this.lastServerMetricsAt = now
      fetch('/api/mp-stats')
        .then((r) => (r.ok ? r.json() : null))
        .then((j: unknown) => {
          if (j && typeof j === 'object' && typeof (j as { tickMsAvg?: unknown }).tickMsAvg === 'number') {
            const m = j as { tickMsAvg: number; tickMsP95: number; players: number }
            this.serverMetrics = { tickMsAvg: m.tickMsAvg, tickMsP95: m.tickMsP95, players: m.players }
          }
        })
        .catch(() => {
          // Server metrics unavailable (offline / not yet serving): overlay shows '—'.
        })
    }
    const stream = this.chunkManager.streamStats
    const heapMB = (performance as unknown as { memory?: { usedJSHeapSize?: number } }).memory
      ?.usedJSHeapSize
    const statsHeapMB = heapMB !== undefined && heapMB > 0 ? Math.round(heapMB / 1048576) : undefined
    let gpsPosition: { lat: number; lon: number }
    if (this._vehicleMode === 'plane') {
      const g = worldToGeo(pos)
      gpsPosition = { lat: g.latitude, lon: g.longitude }
    } else {
      gpsPosition = this.playerCar.getGeoPosition()
    }
    // Real-world day/night: Sun follows the true solar time of the player's
    // GPS position (same UTC instant = different light in Paris vs Tokyo).
    // Throttled — the Sun barely moves within 5 s.
    if (now - this.lastSolarAt > 5000) {
      this.lastSolarAt = now
      const at = new Date(Date.now() + this.solarOffsetMin * 60000)
      const solar = solarPosition(gpsPosition.lat, gpsPosition.lon, at)
      this.renderer.applySolarState(solar.elevationDeg, solar.azimuthDeg)
      this.playerCar.setEnvMap(this.renderer.getEnvMap())
      this.playerCar.setHeadlightLevel(nightFactor(solar.elevationDeg))
      const off = this.solarOffsetMin / 60
      this.solarTime =
        solarTimeString(gpsPosition.lon, at) + (off !== 0 ? ` ${off > 0 ? '+' : '-'}${Math.abs(off)}h` : '')
      this.sunElev = solar.elevationDeg
    }

    this.stats = {
      fps: this.currentFps,
      ms: parseFloat(this.currentMs.toFixed(2)),
      drawCalls: info.render.calls,
      triangles: info.render.triangles,
      currentChunk: `${chunkId.x}:${chunkId.z}:${chunkId.level}`,
      loadedChunks: this.chunkManager.loadedCount,
      chunkLoadsStarted: stream.loadsStarted,
      chunkLoadsCompleted: stream.loadsCompleted,
      chunkUnloads: stream.unloads,
      chunkBuildQueue: stream.buildQueue + stream.readyQueue,
      playerPosition: pos,
      gpsPosition,
      networkLatency: this.gameClient.latency,
      nearbyPlayers: this.gameClient.nearbyPlayerCount,
      npcCount: this.npcManager.activeCount,
      solarTime: this.solarTime,
      sunElev: this.sunElev,
      ...(statsHeapMB !== undefined ? { heapMB: statsHeapMB } : {}),
      ...(this.serverMetrics
        ? {
            serverTickMs: this.serverMetrics.tickMsAvg,
            serverTickP95: this.serverMetrics.tickMsP95,
            serverPlayers: this.serverMetrics.players,
          }
        : {}),
      ...(streetName ? { streetName } : {}),
      destinationName: this.currentDestination.name,
      destinationFlag: this.currentDestination.flag,
    }
  }

  /**
   * Detect if the player car has driven into an active waterway (Seine, canal, lake),
   * while not safely driving across a bridge / road.
   *
   * The full scan is O(all road + waterway segments): cached and refreshed at
   * ~4 Hz / 4 m — water state cannot change faster than the car moves.
   */
  private _isCarInWater(pos: { x: number; y: number; z: number }): boolean {
    if (!this.chunkManager) return false

    // Water surface is at y = 0.012m.
    // If car is elevated on a bridge/viaduct (pos.y > 1.2m),
    // or inside a subterranean underpass/tunnel (pos.y < -1.5m), it is physically not in water!
    if (pos.y > 1.2 || pos.y < -1.5) return false

    const now = performance.now()
    const lp = this.lastWaterCheckPos
    if (lp && now - this.lastWaterCheckAt < 250) {
      const dx = pos.x - lp.x
      const dz = pos.z - lp.z
      if (dx * dx + dz * dz < 16) return this.lastWaterResult
    }
    const result = this._isCarInWaterSlow(pos)
    this.lastWaterCheckPos = { x: pos.x, y: pos.y, z: pos.z }
    this.lastWaterCheckAt = now
    this.lastWaterResult = result
    return result
  }

  private _isCarInWaterSlow(pos: { x: number; y: number; z: number }): boolean {

    // 1. If car is on an active road / bridge, it's safe!
    const roads = this.chunkManager.getActiveRoads()
    for (const r of roads) {
      const pts = r.points
      const isMajor = r.highway === 'motorway' || r.highway === 'trunk' || r.highway === 'primary' || (r.lanes && r.lanes >= 4)
      const lanes = r.lanes || (isMajor ? 4 : 2)
      const halfW = (lanes * 3.8) / 2 + (isMajor ? 3.5 : 1.8)
      const halfWSq = halfW * halfW
      for (let i = 0; i < pts.length - 1; i++) {
        const p1 = pts[i]!
        const p2 = pts[(i + 1)]!
        if (distToSegmentSquared(pos.x, pos.z, p1.x, p1.z, p2.x, p2.z) < halfWSq) {
          return false
        }
      }
    }

    // 2. Check if car is within bounds of an active waterway
    const waterways = this.chunkManager.getActiveWaterways()
    for (const w of waterways) {
      const pts = w.points
      if (w.isPolygon && pts.length >= 3) {
        if (isPointInPolygon2D(pos.x, pos.z, pts)) {
          return true
        }
      } else if (pts.length >= 2) {
        const halfW = (w.width || 30) / 2
        const halfWSq = halfW * halfW
        for (let i = 0; i < pts.length - 1; i++) {
          const p1 = pts[i]!
          const p2 = pts[(i + 1)]!
          if (distToSegmentSquared(pos.x, pos.z, p1.x, p1.z, p2.x, p2.z) < halfWSq) {
            return true
          }
        }
      }
    }

    return false
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.running = false
    if (this.rafId) {
      cancelAnimationFrame(this.rafId)
      this.rafId = 0
    }
    this.input?.dispose()
    try {
      this.osmWorker?.dispose()
    } catch {
      // ignore worker teardown races
    }
    if (this.trialBeacons) {
      this.renderer.scene.remove(this.trialBeacons.start)
      this.renderer.scene.remove(this.trialBeacons.finish)
      this.trialBeacons = null
    }
    this.osmWorker = null
    this.chunkManager?.dispose()
    this.flightCamera?.dispose()
    this.flightCamera = null
    this.planeGun?.dispose()
    this.planeGun = null
    this.combat?.dispose()
    this.combat = null
    this.plane?.dispose()
    this.plane = null
    this.playerCar?.dispose()
    this.impactFX?.dispose()
    this.remotePlayers?.dispose()
    this.renderer?.dispose()
    this.gameClient?.disconnect()
    if (this.world) {
      try {
        this.world.free()
      } catch {
        // ignore already freed or uninitialized
      }
    }
  }
}

function isFiniteVec(v: { x: number; y: number; z: number }): boolean {
  return Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z)
}

/** Ground point under a plane position, given its height above ground. */
function groundBelow(p: WorldPosition, altitudeAGL: number): WorldPosition {
  const agl = Number.isFinite(altitudeAGL) ? Math.max(0, altitudeAGL) : p.y
  return { x: p.x, y: Math.max(0, p.y - agl), z: p.z }
}

function distToSegmentSquared(px: number, pz: number, x1: number, z1: number, x2: number, z2: number): number {
  const l2 = (x2 - x1) * (x2 - x1) + (z2 - z1) * (z2 - z1)
  if (l2 === 0) return (px - x1) * (px - x1) + (pz - z1) * (pz - z1)
  let t = ((px - x1) * (x2 - x1) + (pz - z1) * (z2 - z1)) / l2
  t = Math.max(0, Math.min(1, t))
  const projX = x1 + t * (x2 - x1)
  const projZ = z1 + t * (z2 - z1)
  return (px - projX) * (px - projX) + (pz - projZ) * (pz - projZ)
}

function isPointInPolygon2D(px: number, pz: number, polygon: { x: number; z: number }[]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i]!.x, zi = polygon[i]!.z
    const xj = polygon[j]!.x, zj = polygon[j]!.z
    const intersect = ((zi > pz) !== (zj > pz)) && (px < ((xj - xi) * (pz - zi)) / (zj - zi) + xi)
    if (intersect) inside = !inside
  }
  return inside
}

