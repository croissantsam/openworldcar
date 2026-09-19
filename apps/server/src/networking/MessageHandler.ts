/**
 * MessageHandler — parse and dispatch inbound client messages.
 */

import {
  parseClientMessage,
  serializeMessage,
  type ServerMessage,
} from '@world-drive/protocol'
import {
  MAX_DAMAGE_PER_HIT,
  MAX_HEALTH,
  type PlayerSession,
} from '../players/PlayerSession.js'
import type { GameServer } from '../GameServer.js'

export class MessageHandler {
  constructor(private server: GameServer) {}

  handle(session: PlayerSession, raw: string): void {
    let msg
    try {
      msg = parseClientMessage(raw)
    } catch {
      console.warn(`[MessageHandler] Malformed message from ${session.id}`)
      return
    }

    switch (msg.type) {
      case 'join':
        this._handleJoin(session, msg.playerId)
        break
      case 'player_input':
        session.lastInput = msg.input
        session.lastProcessedSeq = msg.seq
        break
      case 'player_state':
        session.hasClientState = true
        session.state.position = msg.state.position
        session.state.rotation = msg.state.rotation
        session.state.velocity = msg.state.velocity
        session.state.steering = msg.state.steering ?? 0
        session.state.speed = msg.state.speed ?? 0
        // Older clients do not send the field: they drive a car
        session.state.vehicle = msg.state.vehicle === 'plane' ? 'plane' : 'car'
        session.lastProcessedSeq = msg.seq
        this.server.updatePlayerState(session.id, msg.state)
        break
      case 'ping':
        session.send(
          serializeMessage({
            type: 'pong',
            timestamp: msg.timestamp,
            serverTime: Date.now(),
          } satisfies ServerMessage),
        )
        break
      case 'player_respawn':
        session.resetInvincibility(30_000)
        session.resetCombat()
        break
      case 'player_hit':
        this._handleHit(session, msg.targetId, msg.damage, msg.point)
        break
      case 'leave':
        this.server.removePlayer(session.id)
        break
      default:
        break
    }
  }

  /**
   * A client reports that its gun hit another player. The server is authoritative:
   * it validates the shooter, the target, the amount and the rate before applying it.
   */
  private _handleHit(
    shooter: PlayerSession,
    targetId: string,
    rawDamage: number,
    point: { x: number; y: number; z: number },
  ): void {
    if (typeof targetId !== 'string' || targetId === shooter.id) return

    const target = this.server.getSession(targetId)
    if (!target) return
    if (target.isInvincible()) return
    if (target.state.health <= 0) return

    if (typeof rawDamage !== 'number' || !Number.isFinite(rawDamage)) return
    const damage = Math.min(MAX_DAMAGE_PER_HIT, Math.max(0, rawDamage))
    if (damage <= 0) return

    const now = Date.now()
    if (!shooter.tryRegisterHit(targetId, now)) return

    const safePoint = {
      x: Number.isFinite(point?.x) ? point.x : target.state.position.x,
      y: Number.isFinite(point?.y) ? point.y : target.state.position.y,
      z: Number.isFinite(point?.z) ? point.z : target.state.position.z,
    }

    target.state.health = Math.max(0, target.state.health - damage)

    target.send(
      serializeMessage({
        type: 'damage_taken',
        from: shooter.id,
        damage,
        health: target.state.health,
        point: safePoint,
      } satisfies ServerMessage),
    )

    if (target.state.health <= 0) {
      target.send(
        serializeMessage({ type: 'destroyed', by: shooter.id } satisfies ServerMessage),
      )
      target.resetCombat()
      target.state.health = MAX_HEALTH
      target.resetInvincibility(5_000)
      console.log(`[Server] ${targetId} destroyed by ${shooter.id}`)
    }
  }

  private _handleJoin(session: PlayerSession, _clientId: string): void {
    session.resetCombat()
    const welcome: ServerMessage = {
      type: 'welcome',
      playerId: session.id,
      tickRate: 20,
      playerCount: this.server.connectedPlayerCount,
    }
    session.send(serializeMessage(welcome))
    console.log(`[Server] Player joined: ${session.id}`)
  }
}
