/**
 * Time trials between monuments (shared client logic).
 *
 * Generation is deterministic for a given destination + OSM data: trial ids
 * are derived from the destination and the two monument node ids (sorted),
 * so every player in the same area generates the same trials → shared
 * leaderboards without any server-side generation.
 */

import { buildRoadGraph, findAStarPath } from '@world-drive/world-data'
import type { PointOfInterest, Road } from '@world-drive/shared'
import type { WorldPosition } from '@world-drive/math'

export interface TrialPoint {
  name: string
  x: number
  z: number
}

export interface TrialDef {
  /** `tt_<destinationId>_<poiA>_<poiB>` (poi ids sorted). */
  id: string
  destinationId: string
  from: TrialPoint
  to: TrialPoint
  /** Road distance (A* polyline), meters. */
  distanceM: number
}

/** Road-distance band for generated trials. */
export const TRIAL_MIN_DIST_M = 200
export const TRIAL_MAX_DIST_M = 3000
/** Drive-to-start / finish-crossing radius, meters. */
export const TRIAL_START_RADIUS_M = 30
export const TRIAL_FINISH_RADIUS_M = 30
/** Countdown before GO, seconds. */
export const TRIAL_COUNTDOWN_S = 3

export function polylineLength(points: WorldPosition[]): number {
  let total = 0
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!
    const b = points[i + 1]!
    total += Math.hypot(b.x - a.x, b.z - a.z)
  }
  return total
}

export function formatTrialTime(ms: number): string {
  const total = Math.max(0, Math.round(ms / 100))
  const minutes = Math.floor(total / 600)
  const seconds = Math.floor((total % 600) / 10)
  const tenths = total % 10
  const ss = seconds.toString().padStart(2, '0')
  return minutes > 0 ? `${minutes}:${ss}.${tenths}` : `${seconds}.${tenths}`
}

export function formatTrialDist(m: number): string {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`
}

function monumentName(poi: PointOfInterest): string | null {
  const name = poi.name?.trim() ?? poi.tags?.['name']?.trim()
  return name && name.length > 0 ? name.slice(0, 48) : null
}

/** Merge corridor roads, deduped by OSM way id (corridors overlap). */
function dedupeRoads(base: Road[], extra: Road[]): Road[] {
  const seen = new Set(base.map((r) => r.id))
  const out = base.slice()
  for (const r of extra) {
    if (!r || typeof r.id !== 'string' || r.points.length < 2) continue
    if (seen.has(r.id)) continue
    seen.add(r.id)
    out.push(r)
  }
  return out
}

/**
 * Generate up to `count` trials from tourism monuments near the player.
 * Deterministic: same POIs + destination → same trials in the same order.
 *
 * `extra` merges far-radar monuments and corridor roads (time-trial radar):
 * extras within 25m of a loaded monument are skipped (same place, no dupes).
 */
export function generateTrials(
  pois: PointOfInterest[],
  roads: Road[],
  destinationId: string,
  playerPos: WorldPosition,
  count = 3,
  extra?: {
    monuments?: Array<{ id: string; name: string; x: number; z: number }> | undefined
    roads?: Road[] | undefined
  },
): TrialDef[] {
  const allRoads = extra?.roads && extra.roads.length > 0 ? dedupeRoads(roads, extra.roads) : roads
  if (allRoads.length === 0) return []

  const monuments: Array<{ id: string; name: string; x: number; z: number }> = []
  for (const poi of pois) {
    if (poi.kind !== 'tourism') continue
    const name = monumentName(poi)
    if (!name) continue
    const { x, z } = poi.position
    if (!Number.isFinite(x) || !Number.isFinite(z)) continue
    monuments.push({ id: poi.id, name, x, z })
  }
  if (extra?.monuments) {
    for (const m of extra.monuments) {
      if (!m || typeof m.id !== 'string' || typeof m.name !== 'string') continue
      if (!Number.isFinite(m.x) || !Number.isFinite(m.z)) continue
      const dupe = monuments.some((e) => e.id === m.id || Math.hypot(e.x - m.x, e.z - m.z) < 25)
      if (!dupe) monuments.push({ id: m.id, name: m.name.slice(0, 48), x: m.x, z: m.z })
    }
  }
  if (monuments.length < 2) return []

  // Nearest monuments first (stable order: distance, then id).
  monuments.sort((a, b) => {
    const da = (a.x - playerPos.x) ** 2 + (a.z - playerPos.z) ** 2
    const db = (b.x - playerPos.x) ** 2 + (b.z - playerPos.z) ** 2
    if (da !== db) return da - db
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })
  const candidates = monuments.slice(0, 12)

  const graph = buildRoadGraph(allRoads)
  if (graph.nodes.size === 0) return []

  const trials: TrialDef[] = []
  const seen = new Set<string>()
  let attempts = 0
  for (let i = 0; i < candidates.length && trials.length < count && attempts < 24; i++) {
    for (let j = i + 1; j < candidates.length && trials.length < count && attempts < 24; j++) {
      attempts++
      const a = candidates[i]!
      const b = candidates[j]!
      const key = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`
      if (seen.has(key)) continue
      seen.add(key)
      const path = findAStarPath(graph, { x: a.x, y: 0, z: a.z }, { x: b.x, y: 0, z: b.z })
      if (!path || path.length < 2) continue
      const distanceM = polylineLength(path)
      if (distanceM < TRIAL_MIN_DIST_M || distanceM > TRIAL_MAX_DIST_M) continue
      const [first, second] = a.id < b.id ? [a, b] : [b, a]
      trials.push({
        id: `tt_${destinationId}_${first!.id}_${second!.id}`,
        destinationId,
        from: { name: first!.name, x: first!.x, z: first!.z },
        to: { name: second!.name, x: second!.x, z: second!.z },
        distanceM,
      })
    }
  }
  trials.sort((a, b) => (a.distanceM !== b.distanceM ? a.distanceM - b.distanceM : a.id < b.id ? -1 : 1))
  return trials
}

export type TrialPhase = 'idle' | 'countdown' | 'running' | 'finished'

/** Snapshot of the trial state machine for HUD/minimap. */
export interface TrialStatus {
  phase: TrialPhase
  /** Nearest trial start (idle phase guidance). */
  proposal: TrialDef | null
  /** Distance from the player to the proposal start, meters. */
  distToStartM: number
  /** Trial being counted down / run / just finished. */
  active: TrialDef | null
  /** Countdown remaining, seconds. */
  countdownS: number
  /** Run timer, milliseconds. */
  elapsedMs: number
  /** Straight-line distance to the finish, meters. */
  remainingM: number
  /** Last finished run (banner until dismissed). */
  lastResult: { trial: TrialDef; timeMs: number } | null
}
