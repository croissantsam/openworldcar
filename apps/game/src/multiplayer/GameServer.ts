/**
 * GameServer — manages WebSocket connections, physics, and game tick.
 */

import { WebSocketServer, WebSocket } from 'ws'
import { v4 as uuidv4 } from 'uuid'
import { serializeMessage, type ServerMessage, type PlayerStateUpdate } from '@world-drive/protocol'
import { PlayerSession } from './players/PlayerSession.js'
import { PhysicsSimulation } from './simulation/PhysicsSimulation.js'
import { NpcSimulation } from './simulation/NpcSimulation.js'
import { InterestManager } from './interest/InterestManager.js'
import { MessageHandler } from './networking/MessageHandler.js'
import { WorldRegion } from './WorldRegion.js'

const TICK_RATE = 20 // Hz
const TICK_DT = 1 / TICK_RATE

export class GameServer {
  private wss: WebSocketServer
  private sessions = new Map<string, PlayerSession>()
  private physics = new PhysicsSimulation()
  private npcSim = new NpcSimulation()
  private interest = new InterestManager()
  private handler = new MessageHandler(this)
  private region = new WorldRegion('world', { minX: -1000, maxX: 1000, minZ: -1000, maxZ: 1000 })
  private tick = 0
  private tickTimer: ReturnType<typeof setInterval> | null = null

  constructor(private readonly port: number) {
    this.wss = new WebSocketServer({ port })
  }

  async start(): Promise<void> {
    await this.physics.init()

    // Spawn some initial NPCs
    for (let i = 0; i < 10; i++) {
      this.npcSim.spawn({ x: 0, y: 0, z: 0 })
    }

    this.wss.on('connection', (ws: WebSocket) => {
      const session = new PlayerSession(uuidv4(), ws)
      this.sessions.set(session.id, session)
      this.physics.addPlayer(session.id, session.state.position)
      this.region.addPlayer(session)

      ws.on('message', (data: Buffer) => {
        this.handler.handle(session, data.toString())
      })

      ws.on('close', () => {
        this.removePlayer(session.id)
      })
    })

    // Game tick loop
    this.tickTimer = setInterval(() => this._tick(), 1000 / TICK_RATE)

    console.log(`🎮 GameServer listening on ws://localhost:${this.port}`)
  }

  private _tick(): void {
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

    for (const [id, session] of this.sessions) {
      const nearbyIds = this.interest.getPlayersInRange(
        { position: session.state.position, geo: session.state.geo },
        playerMap,
        id,
      )

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
    this.wss.close()
  }
}
