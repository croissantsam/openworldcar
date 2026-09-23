/**
 * InterestManager — determines which players/entities are visible to each player.
 *
 * V1 uses a simple radius filter.
 * Designed to evolve to chunk-based spatial hashing.
 *
 * Players report GPS with their state: interest is computed on true Earth
 * distance (haversine), because raw `position` values live in per-client
 * local frames (one world origin per destination) and are not comparable
 * across origins. When either side has no GPS (older client), fall back to
 * the legacy raw-position distance.
 */

import type { GeoPosition, WorldPosition } from '@world-drive/math'

const INTEREST_RADIUS = 2000 // metres

/** Great-circle distance in metres. */
function haversineM(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6_371_000
  const toRad = Math.PI / 180
  const dLat = (bLat - aLat) * toRad
  const dLon = (bLon - aLon) * toRad
  const s =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(aLat * toRad) * Math.cos(bLat * toRad) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)))
}

export type InterestPoint = {
  position: WorldPosition
  geo?: GeoPosition | undefined
}

export class InterestManager {
  /**
   * Return the set of playerIds that are within interest radius of `origin`.
   */
  getPlayersInRange(origin: InterestPoint, allPlayers: Map<string, InterestPoint>, selfId: string): string[] {
    const result: string[] = []
    for (const [id, player] of allPlayers) {
      if (id === selfId) continue
      const a = origin.geo
      const b = player.geo
      if (a && b) {
        if (haversineM(a.latitude, a.longitude, b.latitude, b.longitude) <= INTEREST_RADIUS) {
          result.push(id)
        }
        continue
      }
      const dx = player.position.x - origin.position.x
      const dz = player.position.z - origin.position.z
      if (Math.sqrt(dx * dx + dz * dz) <= INTEREST_RADIUS) {
        result.push(id)
      }
    }
    return result
  }
}
