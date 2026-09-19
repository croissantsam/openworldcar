/**
 * PlayerSession — state for one connected client.
 */

import type { WorldPosition } from '@world-drive/math'
import type { PlayerInput } from '@world-drive/protocol'
import type { WebSocket } from 'ws'

export const MAX_HEALTH = 100
/** Maximum damage the server accepts for a single reported hit. */
export const MAX_DAMAGE_PER_HIT = 12
/** Maximum accepted hits per second, per shooter. */
export const MAX_HITS_PER_SECOND = 15
/** Minimum delay between two accepted hits on the same target, per shooter. */
export const MIN_HIT_INTERVAL_MS = 60

export type PlayerState = {
  id: string
  position: WorldPosition
  rotation: { x: number; y: number; z: number; w?: number }
  velocity: { x: number; y: number; z: number }
  steering?: number
  speed?: number
  /** Vehicle reported by the client ('car' when absent). */
  vehicle?: 'car' | 'plane'
  /** Current health, [0, MAX_HEALTH]. */
  health: number
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

  /** Timestamps (ms) of the hits this player landed, for rate limiting. */
  private hitTimes: number[] = []
  /** Last accepted hit per target, for the per-target cooldown. */
  private lastHitPerTarget = new Map<string, number>()

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
      health: MAX_HEALTH,
    }
  }

  resetInvincibility(durationMs = 30_000): void {
    this.invincibleUntil = Date.now() + durationMs
  }

  isInvincible(): boolean {
    return Date.now() < this.invincibleUntil
  }

  /** Full health + no pending combat rate-limit state (join, respawn, destruction). */
  resetCombat(): void {
    this.state.health = MAX_HEALTH
    this.hitTimes.length = 0
    this.lastHitPerTarget.clear()
  }

  /**
   * Rate limit for this player as a *shooter*: at most MAX_HITS_PER_SECOND accepted
   * hits per second overall, and one hit per MIN_HIT_INTERVAL_MS on a given target.
   * Returns true (and records the hit) when the shot is accepted.
   */
  tryRegisterHit(targetId: string, now: number): boolean {
    const last = this.lastHitPerTarget.get(targetId)
    if (last !== undefined && now - last < MIN_HIT_INTERVAL_MS) return false

    // Drop everything older than one second
    const cutoff = now - 1_000
    while (this.hitTimes.length > 0 && (this.hitTimes[0] as number) < cutoff) {
      this.hitTimes.shift()
    }
    if (this.hitTimes.length >= MAX_HITS_PER_SECOND) return false

    this.hitTimes.push(now)
    this.lastHitPerTarget.set(targetId, now)
    return true
  }

  send(data: string): void {
    if (this.ws.readyState === 1 /* OPEN */) {
      this.ws.send(data)
    }
  }
}
