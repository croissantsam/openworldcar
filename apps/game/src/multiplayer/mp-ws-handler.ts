/**
 * Nitro WebSocket route for `/api/mp` (dev and prod).
 *
 * Registered via the `handlers` option in `vite.config.ts`
 * (`nitro({ handlers: [{ route: '/api/mp', handler: ... }] })` with
 * `features.websocket` enabled). No separate process or port: the game
 * client connects to the same origin that served the page.
 *
 * Note: crossws may deliver `message` before an async `open` resolves,
 * so both hooks await the same `ready` promise (call order is kept:
 * `open` is always invoked first) and the session is created lazily
 * on first use.
 */

import {
  defineWebSocketHandler,
  type WebSocketMessage,
  type WebSocketPeer,
} from 'h3'
import { getMultiplayerServer } from './get-server.js'
import type { GameServer } from './GameServer.js'
import type { PlayerSession } from './players/PlayerSession.js'
import { MP_PEER_OPEN, type MpPeer } from './players/PlayerSession.js'

class NitroPeer implements MpPeer {
  readyState = MP_PEER_OPEN
  constructor(private readonly peer: WebSocketPeer) {}
  send(data: string): void {
    if (this.readyState !== MP_PEER_OPEN) return
    try {
      this.peer.send(data)
    } catch {
      this.readyState = 3 /* CLOSED */
    }
  }
  close(code?: number, reason?: string): void {
    this.readyState = 3 /* CLOSED */
    try {
      this.peer.close(code, reason)
    } catch {
      // already gone — ignore
    }
  }
}

const SESSION_KEY = 'mpSessionId'

let server: GameServer | null = null
const ready: Promise<GameServer> = getMultiplayerServer().then((s) => (server = s))

function sessionIdOf(peer: WebSocketPeer): string | null {
  const id = peer.context[SESSION_KEY]
  return typeof id === 'string' ? id : null
}

/** Return the session for this peer, creating it on first use. */
function ensureSession(peer: WebSocketPeer): PlayerSession | null {
  if (!server) return null
  const existingId = sessionIdOf(peer)
  if (existingId) {
    const existing = server.getSession(existingId)
    if (existing) return existing
  }
  const session = server.connect(new NitroPeer(peer))
  peer.context[SESSION_KEY] = session.id
  return session
}

function disconnect(peer: WebSocketPeer): void {
  if (!server) return
  const id = sessionIdOf(peer)
  if (!id) return
  server.removePlayer(id)
}

export default defineWebSocketHandler({
  async open(peer) {
    await ready
    ensureSession(peer)
  },
  async message(peer, message) {
    await ready
    const session = ensureSession(peer)
    if (!session || !server) return
    const text = (message as WebSocketMessage).text()
    server.receive(session.id, text)
  },
  close(peer) {
    disconnect(peer)
  },
  error(peer) {
    disconnect(peer)
  },
})
