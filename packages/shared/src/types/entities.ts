import type { GeoPosition, WorldPosition } from '@world-drive/math'

// ─── Player ───────────────────────────────────────────────────────────────────

export type PlayerSnapshot = {
  id: string
  position: WorldPosition
  /**
   * GPS of `position` (WGS84, forwarded from the sender). Receivers on a
   * different local origin convert it to their own frame instead of using
   * `position` raw. Absent = older server/client (raw position fallback).
   */
  geo?: GeoPosition
  /** Euler angles (radians): { x, y, z } or Quaternion { x, y, z, w } */
  rotation: { x: number; y: number; z: number; w?: number }
  velocity: { x: number; y: number; z: number }
  /** Server tick number this snapshot belongs to. */
  tick: number
  /** Timestamp (ms) until which the player is invincible against collisions with other players. */
  invincibleUntil?: number
  /** Vehicle the player is driving. Absent = 'car' (older servers / clients). */
  vehicle?: 'car' | 'plane'
  /** Current health [0, 100]. Absent = full health (older servers). */
  health?: number
  /** Display name reported by the player. Absent = anonymous (older servers). */
  name?: string
}

// ─── NPC ─────────────────────────────────────────────────────────────────────

export type NPCSnapshot = {
  id: string
  position: WorldPosition
  rotation: { x: number; y: number; z: number }
  speed: number
}

// ─── Serialised chunk (over the wire) ────────────────────────────────────────

import type { WorldChunk } from './world.js'

export type SerializedChunk = WorldChunk
