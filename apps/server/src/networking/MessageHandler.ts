/**
 * MessageHandler — parse and dispatch inbound client messages.
 */

import {
  parseClientMessage,
  serializeMessage,
  type ServerMessage,
} from '@world-drive/protocol'
import type { PlayerSession } from '../players/PlayerSession.js'
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
      case 'leave':
        this.server.removePlayer(session.id)
        break
      default:
        break
    }
  }

  private _handleJoin(session: PlayerSession, _clientId: string): void {
    const welcome: ServerMessage = {
      type: 'welcome',
      playerId: session.id,
      tickRate: 20,
    }
    session.send(serializeMessage(welcome))
    console.log(`[Server] Player joined: ${session.id}`)
  }
}
