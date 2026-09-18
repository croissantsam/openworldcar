import type { PlayerSnapshot, NPCSnapshot, SerializedChunk } from '@world-drive/shared'
import type { ChunkId, WorldPosition } from '@world-drive/math'

// ─── Client → Server ─────────────────────────────────────────────────────────

export type PlayerInput = {
  /** Normalised throttle [0, 1] */
  throttle: number
  /** Normalised brake [0, 1] */
  brake: number
  /** Normalised steering [-1, 1] — negative = left */
  steering: number
  /** Client timestamp (ms) for RTT calculation. */
  timestamp: number
}

export type PlayerStateUpdate = {
  position: WorldPosition
  rotation: { x: number; y: number; z: number; w?: number }
  velocity: { x: number; y: number; z: number }
  steering?: number
  speed?: number
  timestamp?: number
}

export type ClientMessage =
  | { type: 'join'; playerId: string }
  | { type: 'player_input'; input: PlayerInput; seq: number }
  | { type: 'player_state'; state: PlayerStateUpdate; seq: number }
  | { type: 'ping'; timestamp: number }
  | { type: 'request_chunk'; chunkId: ChunkId }
  | { type: 'player_respawn' }
  | { type: 'leave' }

// ─── Server → Client ─────────────────────────────────────────────────────────

export type ServerMessage =
  | {
      type: 'welcome'
      playerId: string
      /** Server tick rate in Hz. */
      tickRate: number
    }
  | {
      type: 'world_snapshot'
      tick: number
      /** Timestamp of last processed client input (for reconciliation). */
      lastProcessedSeq: number
      players: PlayerSnapshot[]
      npcs: NPCSnapshot[]
    }
  | {
      type: 'chunk'
      chunk: SerializedChunk
    }
  | {
      type: 'pong'
      timestamp: number
      serverTime: number
    }
  | {
      type: 'player_joined'
      snapshot: PlayerSnapshot
    }
  | {
      type: 'player_left'
      playerId: string
    }
  | {
      type: 'error'
      code: string
      message: string
    }

// ─── Serialisation helpers ────────────────────────────────────────────────────

export function serializeMessage(msg: ClientMessage | ServerMessage): string {
  return JSON.stringify(msg)
}

export function parseClientMessage(raw: string): ClientMessage {
  return JSON.parse(raw) as ClientMessage
}

export function parseServerMessage(raw: string): ServerMessage {
  return JSON.parse(raw) as ServerMessage
}
