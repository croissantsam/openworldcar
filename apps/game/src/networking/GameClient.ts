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

const DEFAULT_WS_URL = 'wss://snowboard-regulated-height-estimation.trycloudflare.com '

/**
 * A host with no scheme ("openspeed.onrender.com") is a path to `new WebSocket`,
 * not a host: the browser resolves it against the page and ends up asking for
 * wss://<the site>/openspeed.onrender.com, which 404s and leaves the game
 * offline. Accept the scheme-less form, and http(s) too, rather than trusting
 * whoever set the variable to have typed it exactly right.
 */
function normalizeWsUrl(raw: string): string {
  const url = raw.trim().replace(/\/+$/, '')
  if (/^wss?:\/\//i.test(url)) return url
  if (/^https:\/\//i.test(url)) return `wss://${url.slice('https://'.length)}`
  if (/^http:\/\//i.test(url)) return `ws://${url.slice('http://'.length)}`
  const host = url.replace(/^\/+/, '')
  if (host.length === 0) return DEFAULT_WS_URL
  // A local server is plain ws: it has no certificate.
  const local = /^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)(?::|\/|$)/i.test(host)
  return `${local ? 'ws' : 'wss'}://${host}`
}

/** Resolve WS server URL. Override with the VITE_WS_URL env var (local server / tests). */
function resolveWsUrl(): string {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env
  const override = env?.['VITE_WS_URL']
  if (typeof override === 'string' && override.length > 0) return normalizeWsUrl(override)
  return DEFAULT_WS_URL
}

const MIN_RECONNECT_MS = 1_000
const MAX_RECONNECT_MS = 30_000
const PING_INTERVAL_MS = 2_000

export class GameClient {
  private ws: WebSocket | null = null
  private playerId: string = uuidv4()
  private readonly wsUrl = resolveWsUrl()

  private _latency = 0
  private _nearbyPlayers = 0
  private _playerCount = 0
  private inputSeq = 0

  private pingTimer: ReturnType<typeof setInterval> | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectDelay = MIN_RECONNECT_MS
  private disposed = false
  private connected = false
  /** Explicit offline mode: socket stays closed, no reconnect attempts. */
  private socketsEnabled = true

  /** Callback when server broadcasts player snapshots */
  onSnapshot?: (players: PlayerSnapshot[], localPlayerId: string) => void

  /**
   * Display name broadcast to other players via `player_state`.
   * Null = anonymous (remote players see the RIVAL #id fallback).
   */
  localDisplayName: string | null = null

  /** The server applied damage to us (authoritative health). */
  onDamage?: (e: { from: string; damage: number; health: number; point: WorldPosition }) => void

  /** Our vehicle was destroyed by `by` (the server already reset us). */
  onDestroyed?: (by: string) => void

  constructor(autoConnect = true) {
    this.socketsEnabled = autoConnect
    if (autoConnect) this._connect()
  }

  /**
   * Toggle the multiplayer socket (explicit online/offline mode).
   * Disabling closes the socket and stops reconnect attempts; re-enabling
   * reconnects immediately. Solo play (driving, NPCs, chunks) is unaffected.
   */
  setSocketsEnabled(enabled: boolean): void {
    this.socketsEnabled = enabled
    if (enabled) {
      if (this.disposed || this.connected) return
      if (this.ws?.readyState === WebSocket.OPEN) return
      this.reconnectDelay = MIN_RECONNECT_MS
      this._connect()
      return
    }
    this.connected = false
    this._playerCount = 0
    this._nearbyPlayers = 0
    if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null }
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null }
    try {
      this.ws?.close()
    } catch {
      // already closed — ignore
    }
    this.ws = null
  }

  get localPlayerId(): string {
    return this.playerId
  }

  private _connect(): void {
    if (this.disposed || !this.socketsEnabled) return
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
    this._playerCount = Math.max(1, this._playerCount)

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
        case 'welcome':
          this.playerId = msg.playerId
          if (typeof msg.playerCount === 'number') {
            this._playerCount = msg.playerCount
          }
          break
        case 'pong':
          this._latency = (Date.now() - msg.timestamp) / 2
          break
        case 'world_snapshot':
          this._nearbyPlayers = msg.players.length
          if (typeof msg.playerCount === 'number') {
            this._playerCount = msg.playerCount
          } else {
            this._playerCount = msg.players.length + 1
          }
          this.onSnapshot?.(msg.players, this.playerId)
          break
        case 'player_joined':
          this._playerCount++
          break
        case 'player_left':
          this._playerCount = Math.max(1, this._playerCount - 1)
          break
        case 'damage_taken':
          this.onDamage?.({
            from: msg.from,
            damage: msg.damage,
            health: msg.health,
            point: msg.point,
          })
          break
        case 'destroyed':
          this.onDestroyed?.(msg.by)
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
    this._playerCount = 0
    if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null }
    this._scheduleReconnect()
  }

  private _scheduleReconnect(): void {
    if (this.disposed || !this.socketsEnabled) return
    this.reconnectTimer = setTimeout(() => this._connect(), this.reconnectDelay)
    // Exponential backoff
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, MAX_RECONNECT_MS)
  }

  sendRespawn(): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return
    this.ws.send(
      serializeMessage({
        type: 'player_respawn',
      }),
    )
  }

  /** Report to the server that our gun hit `targetId`. The server validates and applies it. */
  sendHit(targetId: string, damage: number, point: WorldPosition): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return
    if (!targetId || targetId === this.playerId) return
    this.ws.send(
      serializeMessage({
        type: 'player_hit',
        targetId,
        damage,
        point: { x: point.x, y: point.y, z: point.z },
      } satisfies ClientMessage),
    )
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
    const name = this.localDisplayName?.trim().slice(0, 24)
    this.ws.send(
      serializeMessage({
        type: 'player_state',
        state: { ...state, timestamp: Date.now(), ...(name ? { name } : {}) },
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

  get connectedPlayerCount(): number {
    return this.connected ? Math.max(1, this._playerCount) : 0
  }

  get isConnected(): boolean {
    return this.connected
  }

  disconnect(): void {
    this.disposed = true
    this.connected = false
    this._playerCount = 0
    if (this.pingTimer) clearInterval(this.pingTimer)
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.ws?.close()
  }
}
