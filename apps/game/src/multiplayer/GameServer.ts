/**
 * GameServer — authoritative multiplayer simulation (tick loop, physics, broadcast).
 *
 * Transport-agnostic: connections arrive via `connect()` from the `/api/mp`
 * Nitro WebSocket route (`mp-ws-handler.ts`, crossws).
 */

import { v4 as uuidv4 } from 'uuid'
import { serializeMessage, type ServerMessage, type PlayerStateUpdate } from '@world-drive/protocol'
import { PlayerSession, type MpPeer } from './players/PlayerSession.js'
import { PhysicsSimulation } from './simulation/PhysicsSimulation.js'
import { NpcSimulation } from './simulation/NpcSimulation.js'
import { InterestManager } from './interest/InterestManager.js'
import { MessageHandler } from './networking/MessageHandler.js'
import { WorldRegion } from './WorldRegion.js'

const TICK_RATE = 20 // Hz
const TICK_DT = 1 / TICK_RATE
/** Tick-duration samples kept for observability (§30): 240 @ 20 Hz ≈ 12 s. */
const METRIC_SAMPLES = 240
/** Server-side summary log cadence (ms). */
const METRIC_LOG_INTERVAL_MS = 30_000

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]!
}

export type ServerMetrics = {
  tickRate: number
  tick: number
  players: number
  npcs: number
  uptimeS: number
  messagesIn: number
  snapshotsOut: number
  /** Mean tick duration (ms) over the sample window. */
  tickMsAvg: number
  /** p95 tick duration (ms) — the tick-budget signal (§30). */
  tickMsP95: number
  /** Mean interest-filter time (ms) per tick. */
  interestMsAvg: number
}

export class GameServer {
  private sessions = new Map<string, PlayerSession>()
  private physics = new PhysicsSimulation()
  private npcSim = new NpcSimulation()
  private interest = new InterestManager()
  private handler = new MessageHandler(this)
  private region = new WorldRegion('world', { minX: -1000, maxX: 1000, minZ: -1000, maxZ: 1000 })
  private tick = 0
  private tickTimer: ReturnType<typeof setInterval> | null = null
  private started = false
  private startedAt = Date.now()
  private tickDurations: number[] = []
  private interestDurations: number[] = []
  private messagesIn = 0
  private snapshotsOut = 0
  private lastMetricLogAt = 0

  async start(): Promise<void> {
    if (this.started) return
    this.started = true
    await this.physics.init()

    // Spawn some initial NPCs
    for (let i = 0; i < 10; i++) {
      this.npcSim.spawn({ x: 0, y: 0, z: 0 })
    }

    // Game tick loop
    this.tickTimer = setInterval(() => this._tick(), 1000 / TICK_RATE)

    console.log(`🎮 GameServer ticking at ${TICK_RATE}Hz`)
  }

  /**
   * Attach a newly-established connection. The adapter owns the socket:
   * it forwards inbound text via `receive()` and calls `removePlayer()`
   * when the socket closes.
   */
  connect(peer: MpPeer): PlayerSession {
    const session = new PlayerSession(uuidv4(), peer)
    this.sessions.set(session.id, session)
    this.physics.addPlayer(session.id, session.state.position)
    this.region.addPlayer(session)
    return session
  }

  /** Dispatch one inbound text message from `sessionId`. */
  receive(sessionId: string, raw: string): void {
    const session = this.sessions.get(sessionId)
    if (!session) return
    this.messagesIn++
    this.handler.handle(session, raw)
  }

  /** Observability snapshot (§30): tick budget, interest cost, population. */
  getMetrics(): ServerMetrics {
    const ticks = [...this.tickDurations].sort((a, b) => a - b)
    const interests = this.interestDurations
    return {
      tickRate: TICK_RATE,
      tick: this.tick,
      players: this.sessions.size,
      npcs: this.npcSim.getSnapshots().length,
      uptimeS: Math.round((Date.now() - this.startedAt) / 1000),
      messagesIn: this.messagesIn,
      snapshotsOut: this.snapshotsOut,
      tickMsAvg: ticks.length > 0 ? ticks.reduce((a, b) => a + b, 0) / ticks.length : 0,
      tickMsP95: percentile(ticks, 95),
      interestMsAvg: interests.length > 0 ? interests.reduce((a, b) => a + b, 0) / interests.length : 0,
    }
  }

  private _tick(): void {
    const tickStart = performance.now()
    this.tick++

    // Apply inputs and step physics
    for (const [id, session] of this.sessions) {
      if (session.lastInput) {
        this.physics.applyInput(id, session.lastInput)
      }
    }
    this.physics.step()
    this.npcSim.tick(TICK_DT)

    // Sync positions back to session state only for sessions without client-authoritative states
    for (const [id, session] of this.sessions) {
      if (!session.hasClientState) {
        const pos = this.physics.getPosition(id)
        if (pos) session.state.position = pos
        session.state.rotation = this.physics.getRotation(id)
        session.state.velocity = this.physics.getVelocity(id)
      }
    }

    // Broadcast snapshots (interest-filtered; GPS-aware across origins)
    const playerMap = new Map(
      Array.from(this.sessions.entries()).map(([id, s]) => [
        id,
        { position: s.state.position, geo: s.state.geo },
      ]),
    )

    const npcSnapshots = this.npcSim.getSnapshots()

    let interestMs = 0
    for (const [id, session] of this.sessions) {
      const filterStart = performance.now()
      const nearbyIds = this.interest.getPlayersInRange(
        { position: session.state.position, geo: session.state.geo },
        playerMap,
        id,
      )
      interestMs += performance.now() - filterStart

      const playerSnapshots = nearbyIds.map((pid) => {
        const s = this.sessions.get(pid)!
        return {
          id: pid,
          position: s.state.position,
          // Receivers on another origin convert this to their local frame.
          ...(s.state.geo ? { geo: s.state.geo } : {}),
          rotation: s.state.rotation,
          velocity: s.state.velocity,
          tick: this.tick,
          invincibleUntil: s.invincibleUntil,
          health: s.state.health,
          // Only sent for planes: absent = car, as older clients expect
          ...(s.state.vehicle === 'plane' ? { vehicle: 'plane' as const } : {}),
          // Only sent when known: absent = anonymous, as older clients expect
          ...(s.state.name ? { name: s.state.name } : {}),
        }
      })

      const snapshot: ServerMessage = {
        type: 'world_snapshot',
        tick: this.tick,
        lastProcessedSeq: session.lastProcessedSeq,
        players: playerSnapshots,
        npcs: npcSnapshots,
        playerCount: this.sessions.size,
      }

      session.send(serializeMessage(snapshot))
      this.snapshotsOut++
    }
    this.interestDurations.push(interestMs)
    if (this.interestDurations.length > METRIC_SAMPLES) this.interestDurations.shift()
    this.tickDurations.push(performance.now() - tickStart)
    if (this.tickDurations.length > METRIC_SAMPLES) this.tickDurations.shift()

    const now = Date.now()
    if (now - this.lastMetricLogAt >= METRIC_LOG_INTERVAL_MS) {
      this.lastMetricLogAt = now
      const m = this.getMetrics()
      console.log(
        `[Server] tick=${m.tick} players=${m.players} npcs=${m.npcs} ` +
          `tickAvg=${m.tickMsAvg.toFixed(2)}ms p95=${m.tickMsP95.toFixed(2)}ms ` +
          `interestAvg=${m.interestMsAvg.toFixed(2)}ms msgIn=${m.messagesIn} snapOut=${m.snapshotsOut}`,
      )
    }
  }

  getSession(id: string): PlayerSession | undefined {
    return this.sessions.get(id)
  }

  get connectedPlayerCount(): number {
    return this.sessions.size
  }

  updatePlayerState(id: string, state: PlayerStateUpdate): void {
    this.physics.updatePlayerState(id, state.position, state.rotation, state.velocity)
  }

  removePlayer(id: string): void {
    const session = this.sessions.get(id)
    if (!session) return
    this.sessions.delete(id)
    this.physics.removePlayer(id)
    this.region.removePlayer(id)

    // Notify others
    const left: ServerMessage = { type: 'player_left', playerId: id }
    const msg = serializeMessage(left)
    for (const [, s] of this.sessions) s.send(msg)

    console.log(`[Server] Player left: ${id}`)
  }

  stop(): void {
    if (this.tickTimer) clearInterval(this.tickTimer)
    this.tickTimer = null
    this.started = false
  }
}
