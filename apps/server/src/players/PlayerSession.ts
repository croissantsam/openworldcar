/**
 * PlayerSession — state for one connected client.
 */

import type { WorldPosition } from '@world-drive/math'
import type { PlayerInput } from '@world-drive/protocol'
import type { WebSocket } from 'ws'

export type PlayerState = {
  id: string
  position: WorldPosition
  rotation: { x: number; y: number; z: number; w?: number }
  velocity: { x: number; y: number; z: number }
  steering?: number
  speed?: number
  /** Vehicle reported by the client ('car' when absent). */
  vehicle?: 'car' | 'plane'
}

export class PlayerSession {
  readonly id: string
  readonly ws: WebSocket
  state: PlayerState
  lastInput: PlayerInput | null = null
  lastProcessedSeq = 0
  hasClientState = false
  connectedAt: number
  invincibleUntil: number

  constructor(id: string, ws: WebSocket) {
    this.id = id
    this.ws = ws
    this.connectedAt = Date.now()
    this.invincibleUntil = Date.now() + 30_000
    this.state = {
      id,
      position: { x: 0, y: 1.5, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
    }
  }

  resetInvincibility(durationMs = 30_000): void {
    this.invincibleUntil = Date.now() + durationMs
  }

  isInvincible(): boolean {
    return Date.now() < this.invincibleUntil
  }

  send(data: string): void {
    if (this.ws.readyState === 1 /* OPEN */) {
      this.ws.send(data)
    }
  }
}
