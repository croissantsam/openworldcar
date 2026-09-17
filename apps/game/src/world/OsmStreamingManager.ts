/**
 * OsmStreamingManager — continuous OpenStreetMap streaming for infinite open-world driving.
 *
 * Watches the player's GPS position and automatically fetches new OSM data
 * whenever they approach the edge of the currently-covered area.
 * Seamlessly injects fetched chunks into ChunkManager without restarting the world.
 */

import type { GeoPosition } from '@world-drive/math'
import type { ChunkMap } from '@world-drive/world-data'
import { fetchOsmChunksForArea } from './LiveOsmFetcher.js'

/** Haversine distance in metres between two geo points. */
function geoDistanceMeters(a: GeoPosition, b: GeoPosition): number {
  const R = 6378137
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180
  const sinLat = Math.sin(dLat / 2)
  const sinLon = Math.sin(dLon / 2)
  const h =
    sinLat * sinLat +
    Math.cos((a.latitude * Math.PI) / 180) *
      Math.cos((b.latitude * Math.PI) / 180) *
      sinLon * sinLon
  return 2 * R * Math.asin(Math.sqrt(h))
}

/**
 * Radius (metres) for each OSM fetch.
 * Kept at 300m to stay well under the OSM API 50 000-node limit even in
 * dense city centres like Paris. Fetches tile seamlessly as the player drives.
 */
const FETCH_RADIUS = 300

/**
 * If the player moves more than this distance (metres) from the centre of the
 * last fetched area, trigger a new fetch.
 * Set to FETCH_RADIUS * 0.5 so new data arrives before the player exits the zone.
 */
const REFETCH_THRESHOLD = FETCH_RADIUS * 0.5

export type OsmStreamingCallback = (chunks: ChunkMap) => void

export class OsmStreamingManager {
  /** Centre geo positions of all areas already fetched. */
  private fetchedCenters: GeoPosition[] = []

  /** Currently running fetch's AbortController (max 1 concurrent). */
  private currentAbort: AbortController | null = null

  /** Whether a fetch is currently in flight. */
  private isFetching = false

  /** Last known player geo position (for debouncing). */
  private lastUpdatePos: GeoPosition | null = null

  /** Called with new chunk data when a fetch completes successfully. */
  onChunksReady: OsmStreamingCallback | null = null

  /**
   * Called every frame with the player's current GPS position.
   * Internally throttled — safe to call from the game loop.
   */
  update(playerGeo: GeoPosition): void {
    if (this.isFetching) return

    // Throttle: only re-evaluate if player moved >= 10m since last check
    if (this.lastUpdatePos) {
      const moved = geoDistanceMeters(this.lastUpdatePos, playerGeo)
      if (moved < 10) return
    }
    this.lastUpdatePos = playerGeo

    // Check if the player is still well within a fetched zone
    const alreadyCovered = this.fetchedCenters.some(
      (center) => geoDistanceMeters(center, playerGeo) < REFETCH_THRESHOLD,
    )
    if (alreadyCovered) return

    // Player is approaching uncovered territory — fetch now
    this._startFetch(playerGeo)
  }

  /**
   * Mark an area as already covered (e.g. the initial OSM fetch done at startup).
   * Prevents a redundant duplicate fetch for the starting location.
   */
  markCovered(center: GeoPosition): void {
    this.fetchedCenters.push(center)
  }

  private _startFetch(center: GeoPosition): void {
    this.isFetching = true
    this.currentAbort = new AbortController()
    const { signal } = this.currentAbort

    console.info(
      `[OsmStreaming] Fetching OSM at ${center.latitude.toFixed(5)}, ${center.longitude.toFixed(5)} (r=${FETCH_RADIUS}m)`,
    )

    fetchOsmChunksForArea(center, FETCH_RADIUS, signal)
      .then((chunks) => {
        if (signal.aborted) return
        if (chunks && chunks.size > 0) {
          this.fetchedCenters.push(center)
          console.info(
            `[OsmStreaming] Received ${chunks.size} new OSM chunks`,
          )
          this.onChunksReady?.(chunks)
        } else {
          // No roads here (ocean/park/empty) — mark covered to avoid re-fetching
          this.fetchedCenters.push(center)
          console.info('[OsmStreaming] No roads found in this area.')
        }
      })
      .catch((err) => {
        if (signal.aborted) return
        console.warn('[OsmStreaming] Fetch failed:', err)
        // Don't mark as covered on error — allow retry on next update cycle
      })
      .finally(() => {
        if (!signal.aborted) {
          this.isFetching = false
          this.currentAbort = null
        }
      })
  }

  /**
   * Cancel any in-flight fetch and reset state.
   * Call when teleporting to a new city (travelTo).
   */
  reset(): void {
    this.currentAbort?.abort()
    this.currentAbort = null
    this.isFetching = false
    this.fetchedCenters = []
    this.lastUpdatePos = null
  }
}
