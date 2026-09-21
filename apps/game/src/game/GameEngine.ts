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
  DEFAULT_ORIGIN,
  worldToChunk,
  worldToGeo,
} from '@world-drive/math'
import type { WorldPosition, GeoPosition } from '@world-drive/math'
import { buildRoadGraph, findAStarPath } from '@world-drive/world-data'
import { WORLD_DESTINATIONS, type WorldDestination } from '../world/destinations.js'
import { fetchOsmChunksForArea, fetchRealOsmArea, type RealOsmAreaResult } from '../world/LiveOsmFetcher.js'
import { OsmStreamingManager } from '../world/OsmStreamingManager.js'
import { OsmWorkerClient } from '../world/OsmWorkerClient.js'
import type { ChunkMap } from '@world-drive/world-data'
import { tickWater } from '../world/waterway/index.js'
import { ImpactFX } from '../effects/ImpactFX.js'
import type { Road } from '@world-drive/shared'
import * as THREE from 'three'

/** Fixed physics timestep (60 Hz). */
const FIXED_DT = 1 / 60

/** Damage of one machine-gun round on another player. */
const DAMAGE_PER_ROUND = 7
/** How long the 'DÉTRUIT' state lasts after the player is shot down (ms). */
const DESTROYED_MS = 1500
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

export type DebugStats = {
  fps: number
  ms: number
  drawCalls: number
  triangles: number
  currentChunk: string
  loadedChunks: number
  playerPosition: WorldPosition
  gpsPosition: { lat: number; lon: number }
  networkLatency: number
  nearbyPlayers: number
  npcCount: number
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
  private netTimer = 0

  // ── Throttled full-map scans (O(all road segments), so never every frame) ─
  private lastWaterCheckPos: WorldPosition | null = null
  private lastWaterCheckAt = 0
  private lastWaterResult = false
  private lastStatStreetPos: WorldPosition | null = null
  private lastStatStreetAt = 0
  private lastStatStreetName: string | undefined = undefined

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
    playerPosition: { x: 0, y: 0, z: 0 },
    gpsPosition: { lat: 0, lon: 0 },
    networkLatency: 0,
    nearbyPlayers: 0,
    npcCount: 0,
    destinationName: WORLD_DESTINATIONS[0]!.name,
    destinationFlag: WORLD_DESTINATIONS[0]!.flag,
  }

  private disposed = false

  constructor(mount: HTMLElement) {
    this.mount = mount
  }

  async init(): Promise<void> {
    if (this.disposed) return

    // Initialise Rapier WASM
    await RAPIER.init()
    if (this.disposed) return

    // Set world origin (Paris 2e — default for V1)
    setWorldOrigin(DEFAULT_ORIGIN)

    // Create Rapier world with earth-like gravity
    const gravity = { x: 0.0, y: -9.81, z: 0.0 }
    this.world = new RAPIER.World(gravity)

    // Sub-systems
    this.renderer = new Renderer(this.mount)
    this.input = new InputManager()
    this.playerCar = new PlayerCar(this.world, this.renderer.scene)
    this.camera = new ThirdPersonCamera(this.renderer.camera, this.playerCar)
    this.impactFX = new ImpactFX(this.renderer.scene)

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

    this.chunkManager = new ChunkManager(this.renderer.scene, this.world)
    this.npcManager = new NPCManager(this.renderer.scene)
    this.remotePlayers = new RemotePlayerManager(this.renderer.scene, this.world)
    this.gameClient = new GameClient()

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
    this._fetchInitialOsm(
      this.currentDestination.origin,
      300,
      undefined,
      this.currentDestination.spawnPosition,
      this.currentDestination.spawnHeading,
    )
      .then((realOsm) => {
        if (realOsm && realOsm.chunks.size > 0 && !this.disposed) {
          this.chunkManager.setRealOsmChunks(realOsm.chunks)
          this.chunkManager.clearAllChunks()
          // The world is rebuilt from scratch: the player restarts in the car
          const wasFlying = this._vehicleMode === 'plane'
          this._leavePlane()
          this.playerCar.teleport(realOsm.spawnPoint, realOsm.spawnHeading)
          if (wasFlying) this._snapCarCamera()
          else this.camera.update(0.016)
          this.chunkManager.update(realOsm.spawnPoint)
          // Mark the initial area as covered so the streaming manager
          // doesn't immediately re-fetch the same zone
          this.osmStreaming.markCovered(this.currentDestination.origin)
          if (realOsm.streetName) {
            this.currentDestination.name = realOsm.streetName
          }
          this.onDestinationChanged?.(this.currentDestination)
        } else if (!this.disposed) {
          // Nothing arrived: let the streaming manager fetch the area again
          this.osmStreaming.reset()
        }
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
    const plane = this._vehicleMode === 'plane' ? this.plane : null
    const flightInput = plane ? this.input.getFlightInput() : null

    // ── Fixed timestep physics ─────────────────────────────────────────────
    while (this.accumulator >= FIXED_DT) {
      if (plane && flightInput) {
        plane.step(flightInput, FIXED_DT)
      } else {
        this.playerCar.applyInput(rawInput, FIXED_DT)
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

      if (inWater || pos.y < -15.0) {
        // Car plunged into water (Seine, canal, basin) or fell off the world — respawn!
        this.impactFX?.triggerWaterSplash(pos)
        this.camera.addTrauma(0.65)
        this.playerCar.teleport(this.lastSafePos, this.lastSafeYaw)
        this.gameClient.sendRespawn()
      } else if (pos.y >= -7.0) {
        // Car is safely on road (surface or inside subterranean tunnel) — update safe respawn position
        this.lastSafePos = { x: pos.x, y: pos.y, z: pos.z }
        this.lastSafeYaw = this.playerCar.getYaw()
      }
    }

    // ── Networking ─────────────────────────────────────────────────────────
    this.gameClient.sendInput(rawInput)

    this.netTimer += delta
    if (this.netTimer >= 0.05) {
      this.netTimer = 0
      if (this._vehicleMode === 'plane' && this.plane) {
        const q = this.plane.getQuaternion()
        const v = this.plane.getVelocity()
        this.gameClient.sendState({
          position: this.plane.getPosition(),
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
          rotation: { x: quat.x, y: quat.y, z: quat.z, w: quat.w },
          velocity: vel,
          steering: rawInput.steering,
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
    car.applyInput({ throttle: 0, brake: 0, steering: 0, handbrake: false }, 0)
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
    this.playerCar.teleport(this.lastSafePos, this.lastSafeYaw)
    this.playerCar.grantSpawnInvincibility()
    this.gameClient?.sendRespawn()
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
   * Re-centers the Mercator projection, reloads chunks from the destination pack,
   * and places the player car safely at the spawn point.
   */
  travelTo(destination: WorldDestination): void {
    // Travel always lands in the car
    const wasFlying = this._vehicleMode === 'plane'
    this._leavePlane()
    this.currentDestination = destination

    // 1. Reset origin and switch chunk base path
    this.chunkManager.resetToOrigin(destination.origin, destination.chunkDir)

    // 2. Reset OSM streaming state for the new location (the destination area
    //    is fetched below, so mark it covered to avoid a duplicate fetch)
    this.osmStreaming.reset()
    this.osmStreaming.markCovered(destination.origin)

    // 3. Clear GPS destination and route
    this.gpsDestination = null
    this.gpsRoute = null

    // 3. Teleport player car to destination spawn
    const spawnPos = destination.spawnPosition ?? { x: 62.5, y: 0.5, z: 62.5 }
    const spawnHeading = destination.spawnHeading ?? 0
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
        if (
          realOsm &&
          realOsm.chunks.size > 0 &&
          this.currentDestination.id === destination.id &&
          !this.disposed
        ) {
          this.chunkManager.setRealOsmChunks(realOsm.chunks)
          this.chunkManager.clearAllChunks()
          // Reposition car directly onto the real OSM road centerline
          // (the player may have taken the plane meanwhile: back to the car)
          const wasFlying = this._vehicleMode === 'plane'
          this._leavePlane()
          this.playerCar.teleport(realOsm.spawnPoint, realOsm.spawnHeading)
          this.gameClient.sendRespawn()
          if (wasFlying) this._snapCarCamera()
          else this.camera.update(0.016)
          this.chunkManager.update(realOsm.spawnPoint)
          // Mark the new destination as covered so streaming doesn't re-fetch immediately
          this.osmStreaming.markCovered(destination.origin)
          if (realOsm.streetName) {
            this.currentDestination.name = realOsm.streetName
          }
          this.onDestinationChanged?.(this.currentDestination)
        } else if (this.currentDestination.id === destination.id && !this.disposed) {
          // Nothing arrived: let the streaming manager fetch the area again
          this.osmStreaming.reset()
        }
      })
      .catch((err) => {
        console.warn('[GameEngine] Live OSM fetch failed, keeping procedural chunks:', err)
        if (this.currentDestination.id === destination.id && !this.disposed) this.osmStreaming.reset()
      })
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
    let gpsPosition: { lat: number; lon: number }
    if (this._vehicleMode === 'plane') {
      const g = worldToGeo(pos)
      gpsPosition = { lat: g.latitude, lon: g.longitude }
    } else {
      gpsPosition = this.playerCar.getGeoPosition()
    }

    this.stats = {
      fps: this.currentFps,
      ms: parseFloat(this.currentMs.toFixed(2)),
      drawCalls: info.render.calls,
      triangles: info.render.triangles,
      currentChunk: `${chunkId.x}:${chunkId.z}:${chunkId.level}`,
      loadedChunks: this.chunkManager.loadedCount,
      playerPosition: pos,
      gpsPosition,
      networkLatency: this.gameClient.latency,
      nearbyPlayers: this.gameClient.nearbyPlayerCount,
      npcCount: this.npcManager.activeCount,
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

