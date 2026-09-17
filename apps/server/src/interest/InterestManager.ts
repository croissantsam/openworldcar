/**
 * InterestManager — determines which players/entities are visible to each player.
 *
 * V1 uses a simple radius filter.
 * Designed to evolve to chunk-based spatial hashing.
 */

import type { WorldPosition } from '@world-drive/math'

const INTEREST_RADIUS = 2000 // metres

export class InterestManager {
  /**
   * Return the set of playerIds that are within interest radius of `origin`.
   */
  getPlayersInRange(
    origin: WorldPosition,
    allPlayers: Map<string, { position: WorldPosition }>,
    selfId: string,
  ): string[] {
    const result: string[] = []
    for (const [id, player] of allPlayers) {
      if (id === selfId) continue
      const dx = player.position.x - origin.x
      const dz = player.position.z - origin.z
      if (Math.sqrt(dx * dx + dz * dz) <= INTEREST_RADIUS) {
        result.push(id)
      }
    }
    return result
  }
}
