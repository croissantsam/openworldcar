/**
 * CombatSystem — air-to-air damage, over the network.
 *
 * The server is authoritative: local health is *never* simulated here, it is
 * mirrored from the 'damage_taken' / 'destroyed' messages. The system only:
 *   - forwards validated hits from the local gun to the server (rate-limited),
 *   - exposes the mirrored health / invincibility to the HUD and the engine,
 *   - relays remote destructions detected by the RemotePlayerManager.
 */

import type { WorldPosition } from '@world-drive/math'
import type { GameClient } from '../networking/GameClient.js'
import type { RemotePlayerManager } from '../vehicles/RemotePlayerManager.js'

export const MAX_HEALTH = 100

/** Local invincibility after being destroyed — matches the server's 5 s. */
const DESTROYED_INVINCIBLE_MS = 5_000
/** Spawn protection, matches the server's PlayerSession (30 s). */
const SPAWN_INVINCIBLE_MS = 30_000

/** Client-side guard, mirrors the server limits (server-side is authoritative). */
const MAX_HITS_PER_SECOND = 15
const MIN_HIT_INTERVAL_MS = 60

export type DamageEvent = {
  damage: number
  health: number
  point: WorldPosition
  from: string
}

export class CombatSystem {
  private client: GameClient
  private remotes: RemotePlayerManager

  private _health = MAX_HEALTH
  private _invincibleUntil = Date.now() + SPAWN_INVINCIBLE_MS
  /** 0 → 1, decays after each hit taken: used for the red screen pulse. */
  private _damageFlash = 0
  /** Timestamps of the hits we reported, for the local rate limit. */
  private hitTimes: number[] = []
  private lastHitPerTarget = new Map<string, number>()

  private prevOnDamage: GameClient['onDamage']
  private prevOnDestroyed: GameClient['onDestroyed']
  private disposed = false

  /** Server told us we took damage. */
  onDamageTaken?: (e: DamageEvent) => void
  /** Local player destroyed (health reached 0): the engine explodes and respawns. */
  onDestroyed?: (by: string) => void
  /** A remote player was destroyed: the engine plays an explosion at that position. */
  onRemoteDestroyed?: (id: string, position: WorldPosition) => void

  constructor(client: GameClient, remotes: RemotePlayerManager) {
    this.client = client
    this.remotes = remotes

    this.prevOnDamage = client.onDamage
    this.prevOnDestroyed = client.onDestroyed

    client.onDamage = (e) => {
      this.prevOnDamage?.(e)
      if (this.disposed) return
      this._health = Math.max(0, Math.min(MAX_HEALTH, e.health))
      this._damageFlash = Math.min(1, this._damageFlash + 0.35 + e.damage / 40)
      this.onDamageTaken?.({
        damage: e.damage,
        health: this._health,
        point: e.point,
        from: e.from,
      })
    }

    client.onDestroyed = (by) => {
      this.prevOnDestroyed?.(by)
      if (this.disposed) return
      // The server already reset us to full health + 5 s of protection
      this._health = MAX_HEALTH
      this._invincibleUntil = Date.now() + DESTROYED_INVINCIBLE_MS
      this._damageFlash = 1
      this.hitTimes.length = 0
      this.lastHitPerTarget.clear()
      this.onDestroyed?.(by)
    }

    remotes.onPlayerDestroyed = (id, position) => {
      if (this.disposed) return
      this.onRemoteDestroyed?.(id, position)
    }
  }

  get health(): number {
    return this._health
  }

  /** True while spawn-protected / just respawned: no damage can be taken. */
  get invincible(): boolean {
    return Date.now() < this._invincibleUntil
  }

  /** 0 → 1, red-flash intensity after a hit (decays in update()). */
  get damageFlash(): number {
    return this._damageFlash
  }

  /**
   * The local gun hit a remote player: report it to the server.
   * Ignored when the target is invincible or when we are over the rate limit.
   */
  reportHit(targetId: string, damage: number, point: WorldPosition): void {
    if (this.disposed || !targetId) return
    if (!Number.isFinite(damage) || damage <= 0) return
    if (targetId === this.client.localPlayerId) return
    if (this.remotes.isPlayerInvincible(targetId)) return

    const now = Date.now()
    const last = this.lastHitPerTarget.get(targetId)
    if (last !== undefined && now - last < MIN_HIT_INTERVAL_MS) return

    const cutoff = now - 1_000
    while (this.hitTimes.length > 0 && (this.hitTimes[0] as number) < cutoff) {
      this.hitTimes.shift()
    }
    if (this.hitTimes.length >= MAX_HITS_PER_SECOND) return

    this.hitTimes.push(now)
    this.lastHitPerTarget.set(targetId, now)
    this.client.sendHit(targetId, damage, point)
  }

  /** Per frame: decay of the local effects. */
  update(dt: number): void {
    if (this._damageFlash > 0) {
      this._damageFlash = Math.max(0, this._damageFlash - dt * 1.6)
    }
  }

  /** Respawn / fast travel: full health and spawn protection again. */
  reset(): void {
    this._health = MAX_HEALTH
    this._invincibleUntil = Date.now() + SPAWN_INVINCIBLE_MS
    this._damageFlash = 0
    this.hitTimes.length = 0
    this.lastHitPerTarget.clear()
  }

  dispose(): void {
    this.disposed = true
    if (this.prevOnDamage) this.client.onDamage = this.prevOnDamage
    else delete this.client.onDamage
    if (this.prevOnDestroyed) this.client.onDestroyed = this.prevOnDestroyed
    else delete this.client.onDestroyed
    delete this.remotes.onPlayerDestroyed
    this.hitTimes.length = 0
    this.lastHitPerTarget.clear()
    delete this.onDamageTaken
    delete this.onDestroyed
    delete this.onRemoteDestroyed
  }
}
