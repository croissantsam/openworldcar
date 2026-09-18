/**
 * GameClient — WebSocket client for World Drive.
 *
 * In development, connects directly to ws://localhost:3001.
 * In production, connects to the server that served the page.
 *
 * Features:
 *   - Exponential backoff reconnection (1s → 30s max)
 *   - Silent failure when server is not running (offline / solo mode)
 *   - Ping/pong latency measurement
 */

import {
  serializeMessage,
  parseServerMessage,
  type ClientMessage,
  type PlayerInput,
  type PlayerStateUpdate,
} from '@world-drive/protocol'
import type { NPCManager } from '../vehicles/NPCManager.js'
import type { WorldPosition } from '@world-drive/math'
import type { Road, PlayerSnapshot } from '@world-drive/shared'
import { v4 as uuidv4 } from 'uuid'

/** Resolve WS server URL. Override with VITE_WS_URL env var. */
function resolveWsUrl(): string {
  const isDev = window.location.hostname === 'localhost'
  if (isDev) return 'wss://openspeed.onrender.com'
  return `wss://openspeed.onrender.com`
}

const MIN_RECONNECT_MS = 1_000
const MAX_RECONNECT_MS = 30_000
const PING_INTERVAL_MS = 2_000

export class GameClient {
  private ws: WebSocket | null = null
  private readonly playerId: string = uuidv4()
  private readonly wsUrl = resolveWsUrl()

  private _latency = 0
  private _nearbyPlayers = 0
  private inputSeq = 0

  private pingTimer: ReturnType<typeof setInterval> | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectDelay = MIN_RECONNECT_MS
  private disposed = false
  private connected = false

  /** Callback when server broadcasts player snapshots */
  onSnapshot?: (players: PlayerSnapshot[], localPlayerId: string) => void

  constructor() {
    this._connect()
  }

  get localPlayerId(): string {
    return this.playerId
  }

  private _connect(): void {
    if (this.disposed) return
    try {
      this.ws = new WebSocket(this.wsUrl)
      this.ws.onopen = this._onOpen
      this.ws.onmessage = this._onMessage
      this.ws.onclose = this._onClose
      this.ws.onerror = () => { /* handled by onclose */ }
    } catch {
      this._scheduleReconnect()
    }
  }

  private _onOpen = (): void => {
    this.connected = true
    this.reconnectDelay = MIN_RECONNECT_MS

    this.ws?.send(
      serializeMessage({ type: 'join', playerId: this.playerId } satisfies ClientMessage),
    )

    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(serializeMessage({ type: 'ping', timestamp: Date.now() }))
      }
    }, PING_INTERVAL_MS)
  }

  private _onMessage = (event: MessageEvent<string>): void => {
    try {
      const msg = parseServerMessage(event.data)
      switch (msg.type) {
        case 'pong':
          this._latency = (Date.now() - msg.timestamp) / 2
          break
        case 'world_snapshot':
          this._nearbyPlayers = msg.players.length
          this.onSnapshot?.(msg.players, this.playerId)
          break
        default:
          break
      }
    } catch {
      // Ignore malformed messages
    }
  }

  private _onClose = (): void => {
    this.connected = false
    if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null }
    this._scheduleReconnect()
  }

  private _scheduleReconnect(): void {
    if (this.disposed) return
    this.reconnectTimer = setTimeout(() => this._connect(), this.reconnectDelay)
    // Exponential backoff
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, MAX_RECONNECT_MS)
  }

  sendInput(input: Pick<PlayerInput, 'throttle' | 'brake' | 'steering'>): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return
    this.inputSeq++
    this.ws.send(
      serializeMessage({
        type: 'player_input',
        input: { ...input, timestamp: Date.now() },
        seq: this.inputSeq,
      }),
    )
  }

  sendState(state: PlayerStateUpdate): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return
    this.inputSeq++
    this.ws.send(
      serializeMessage({
        type: 'player_state',
        state: { ...state, timestamp: Date.now() },
        seq: this.inputSeq,
      }),
    )
  }

  /** Called each game frame — manages local NPC population when offline. */
  processMessages(npcManager: NPCManager, playerPos: WorldPosition, activeRoads?: Road[]): void {
    npcManager.ensurePopulated(playerPos, activeRoads)
    npcManager.despawnDistant(playerPos)
  }

  get latency(): number {
    return this.connected ? Math.round(this._latency) : -1
  }

  get nearbyPlayerCount(): number {
    return this._nearbyPlayers
  }

  get isConnected(): boolean {
    return this.connected
  }

  disconnect(): void {
    this.disposed = true
    if (this.pingTimer) clearInterval(this.pingTimer)
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.ws?.close()
  }
}
