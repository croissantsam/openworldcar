import type { WorldPosition } from '@world-drive/math'

// ─── Player ───────────────────────────────────────────────────────────────────

export type PlayerSnapshot = {
  id: string
  position: WorldPosition
  /** Euler angles (radians): { x, y, z } or Quaternion { x, y, z, w } */
  rotation: { x: number; y: number; z: number; w?: number }
  velocity: { x: number; y: number; z: number }
  /** Server tick number this snapshot belongs to. */
  tick: number
  /** Timestamp (ms) until which the player is invincible against collisions with other players. */
  invincibleUntil?: number
  /** Vehicle the player is driving. Absent = 'car' (older servers / clients). */
  vehicle?: 'car' | 'plane' | 'foot'
  /** Current health [0, 100]. Absent = full health (older servers). */
  health?: number
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
