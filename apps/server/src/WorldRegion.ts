/**
 * WorldRegion — owns a set of chunks and the players within them.
 * Designed for future multi-server sharding.
 */

import type { ChunkId } from '@world-drive/math'
import type { PlayerSession } from './players/PlayerSession.js'

export class WorldRegion {
  readonly id: string
  /** Bounding chunk range this region covers. */
  readonly chunkBounds: { minX: number; maxX: number; minZ: number; maxZ: number }

  private players = new Map<string, PlayerSession>()

  constructor(
    id: string,
    chunkBounds: { minX: number; maxX: number; minZ: number; maxZ: number },
  ) {
    this.id = id
    this.chunkBounds = chunkBounds
  }

  addPlayer(session: PlayerSession): void {
    this.players.set(session.id, session)
  }

  removePlayer(id: string): void {
    this.players.delete(id)
  }

  getPlayers(): Map<string, PlayerSession> {
    return this.players
  }

  containsChunk(chunk: ChunkId): boolean {
    return (
      chunk.x >= this.chunkBounds.minX &&
      chunk.x <= this.chunkBounds.maxX &&
      chunk.z >= this.chunkBounds.minZ &&
      chunk.z <= this.chunkBounds.maxZ
    )
  }

  get playerCount(): number {
    return this.players.size
  }
}
