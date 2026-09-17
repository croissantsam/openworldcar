/**
 * GameEngine — the central coordinator.
 *
 * Owns and connects:
 *   InputManager → PlayerCar → ThirdPersonCamera → Renderer
 *   ChunkManager
 *   NPCManager
 *   GameClient (WebSocket)
 *
 * Game loop:
 *   rAF → input → physics tick(s) → networking → world streaming → NPC → render
 */

import RAPIER from '@dimforge/rapier3d-compat'
import { Renderer } from '../renderer/Renderer.js'
import { InputManager } from './InputManager.js'
import { PlayerCar } from '../vehicles/PlayerCar.js'
import { ThirdPersonCamera } from '../camera/ThirdPersonCamera.js'
import { ChunkManager, type StreetInfo } from '../world/ChunkManager.js'
import { NPCManager } from '../vehicles/NPCManager.js'
import { RemotePlayerManager } from '../vehicles/RemotePlayerManager.js'
import { GameClient } from '../networking/GameClient.js'
import {
  setWorldOrigin,
  DEFAULT_ORIGIN,
  worldToChunk,
} from '@world-drive/math'
import type { WorldPosition } from '@world-drive/math'
import { buildRoadGraph, findAStarPath } from '@world-drive/world-data'
import { WORLD_DESTINATIONS, type WorldDestination } from '../world/destinations.js'
import { fetchRealOsmArea } from '../world/LiveOsmFetcher.js'

/** Fixed physics timestep (60 Hz). */
const FIXED_DT = 1 / 60

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
  private input!: InputManager
  playerCar!: PlayerCar
  private camera!: ThirdPersonCamera
  chunkManager!: ChunkManager
  private npcManager!: NPCManager
  private gameClient!: GameClient
  private remotePlayers!: RemotePlayerManager

  private world!: RAPIER.World
  private rafId = 0
  private running = false

  private lastTime = 0
  private accumulator = 0

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
    this.chunkManager = new ChunkManager(this.renderer.scene, this.world)
    this.npcManager = new NPCManager(this.renderer.scene)
    this.remotePlayers = new RemotePlayerManager(this.renderer.scene)
    this.gameClient = new GameClient()

    // Receive multiplayer snapshots and route to RemotePlayerManager
    this.gameClient.onSnapshot = (players, localId) => {
      this.remotePlayers?.handleSnapshot(players, localId)
    }

    // Ground plane (flat terrain for Phase 1)
    this._createGroundPlane()

    // Initial chunk load around spawn
    this.chunkManager.update(this.playerCar.getPosition())

    // Also stream real OpenStreetMap area for the starting location
    fetchRealOsmArea(this.currentDestination.origin, 550)
      .then((realOsm) => {
        if (realOsm && realOsm.chunks.size > 0 && !this.disposed) {
          this.chunkManager.setRealOsmChunks(realOsm.chunks)
          this.chunkManager.clearAllChunks()
          this.playerCar.teleport(realOsm.spawnPoint, realOsm.spawnHeading)
          this.camera.update(0.016)
          this.chunkManager.update(realOsm.spawnPoint)
          if (realOsm.streetName) {
            this.currentDestination.name = realOsm.streetName
          }
          this.onDestinationChanged?.(this.currentDestination)
        }
      })
      .catch((err) => console.warn('[GameEngine] Initial OSM fetch error:', err))
  }

  private _createGroundPlane(): void {
    // Rapier static ground plane: solid 20-metre thick bedrock slab from y = 0.0 down to y = -20.0
    // Prevents any downward tunneling, clipping or falling through the world.
    const groundDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(0, -10.0, 0)
    const groundBody = this.world.createRigidBody(groundDesc)
    const groundCollider = RAPIER.ColliderDesc.cuboid(500000, 10.0, 500000)
      .setFriction(0.0)
      .setRestitution(0.0)
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

    // ── Fixed timestep physics ─────────────────────────────────────────────
    while (this.accumulator >= FIXED_DT) {
      this.playerCar.applyInput(rawInput, FIXED_DT)
      this.world.step()
      this.npcManager.tick(FIXED_DT)
      this.accumulator -= FIXED_DT
    }

    // ── Safety Net: Prevent infinite falling ────────────────────────────────
    const pos = this.playerCar.getPosition()
    if (pos.y < -3.0) {
      this.playerCar.teleport({ x: pos.x, y: 1.0, z: pos.z }, this.playerCar.getYaw())
    }

    // ── Networking ─────────────────────────────────────────────────────────
    this.gameClient.sendInput(rawInput)
    this.gameClient.processMessages(this.npcManager, pos, this.chunkManager?.getActiveRoads())

    // ── World streaming ────────────────────────────────────────────────────
    this.chunkManager.update(pos)

    // ── Remote Multiplayer Players ─────────────────────────────────────────
    this.remotePlayers?.update(delta)

    // ── Camera ─────────────────────────────────────────────────────────────
    this.camera.update(delta)

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

  recalculateGpsRoute(): void {
    if (!this.gpsDestination || !this.chunkManager || !this.playerCar) return
    const roads = this.chunkManager.getActiveRoads()
    if (roads.length === 0) return
    const graph = buildRoadGraph(roads)
    const p = this.playerCar.getPosition()
    this.gpsRoute = findAStarPath(graph, p, this.gpsDestination)
  }

  /**
   * Fast travels to another city/region in the world.
   * Re-centers the Mercator projection, reloads chunks from the destination pack,
   * and places the player car safely at the spawn point.
   */
  travelTo(destination: WorldDestination): void {
    this.currentDestination = destination

    // 1. Reset origin and switch chunk base path
    this.chunkManager.resetToOrigin(destination.origin, destination.chunkDir)

    // 2. Clear GPS destination and route
    this.gpsDestination = null
    this.gpsRoute = null

    // 3. Teleport player car to destination spawn
    const spawnPos = destination.spawnPosition ?? { x: 62.5, y: 0.5, z: 62.5 }
    const spawnHeading = destination.spawnHeading ?? 0
    this.playerCar.teleport(spawnPos, spawnHeading)

    // 4. Update camera
    this.camera.update(0.016)

    // 5. Trigger immediate world streaming around spawn point (procedural ready immediately)
    this.chunkManager.update(spawnPos)

    // 6. Notify UI
    this.onDestinationChanged?.(destination)

    // 7. Stream real OpenStreetMap roads & buildings live for this new area!
    fetchRealOsmArea(destination.origin, 550)
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
          this.playerCar.teleport(realOsm.spawnPoint, realOsm.spawnHeading)
          this.camera.update(0.016)
          this.chunkManager.update(realOsm.spawnPoint)
          if (realOsm.streetName) {
            this.currentDestination.name = realOsm.streetName
          }
          this.onDestinationChanged?.(this.currentDestination)
        }
      })
      .catch((err) => {
        console.warn('[GameEngine] Live OSM fetch failed, keeping procedural chunks:', err)
      })
  }

  getCurrentStreet(): StreetInfo | null {
    if (!this.chunkManager || !this.playerCar) return null
    return this.chunkManager.getNearestStreet(
      this.playerCar.getPosition(),
      this.playerCar.getHeadingVector(),
    )
  }

  private _updateStats(pos: WorldPosition): void {
    const info = this.renderer.renderer.info
    const chunkId = worldToChunk(pos)
    const heading = this.playerCar?.getHeadingVector()
    const street = this.chunkManager?.getNearestStreet(pos, heading)

    this.stats = {
      fps: this.currentFps,
      ms: parseFloat(this.currentMs.toFixed(2)),
      drawCalls: info.render.calls,
      triangles: info.render.triangles,
      currentChunk: `${chunkId.x}:${chunkId.z}:${chunkId.level}`,
      loadedChunks: this.chunkManager.loadedCount,
      playerPosition: pos,
      gpsPosition: this.playerCar.getGeoPosition(),
      networkLatency: this.gameClient.latency,
      nearbyPlayers: this.gameClient.nearbyPlayerCount,
      npcCount: this.npcManager.activeCount,
      ...(street ? { streetName: street.name } : {}),
      destinationName: this.currentDestination.name,
      destinationFlag: this.currentDestination.flag,
    }
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
    this.playerCar?.dispose()
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

