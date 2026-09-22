/**
 * Time trials between monuments (shared client logic).
 *
 * Generation is deterministic for a given world dataset: trial ids
 * (`tt_<poiA>_<poiB>`, OSM-stable poi ids, sorted) never include the
 * destination — the same monument pair raced from two destinations (or
 * two `osm_loc_*` searches) is the same race with one shared
 * leaderboard, no server-side generation needed.
 */

import { buildRoadGraph, findAStarPath } from '@world-drive/world-data'
import type { PointOfInterest, Road } from '@world-drive/shared'
import type { WorldPosition } from '@world-drive/math'

export interface TrialPoint {
  /** OSM node/way id (`ov_*` for radar) — groups trials sharing one start. */
  id: string
  name: string
  x: number
  z: number
}

export interface TrialDef {
  /** `tt_<poiA>_<poiB>` (poi ids sorted) — see `trialIdFor`. */
  id: string
  /** Racing context (submit metadata only — never part of the id). */
  destinationId: string
  from: TrialPoint
  to: TrialPoint
  /** Road distance (A* polyline), meters. */
  distanceM: number
}

/** Straight-line distance band for generated trials (crow-flies). */
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

/** Max distance (m) to snap a monument onto a road; beyond → pair skipped. */
const SNAP_MAX_DIST_M = 250

/**
 * Nearest point on any surface road centre-line (tunnels excluded: a beacon
 * above an underground road would be unreachable). Returns null when no
 * road is close enough.
 */
function snapToRoad(
  x: number,
  z: number,
  roads: Road[],
): { x: number; z: number } | null {
  let best: { x: number; z: number } | null = null
  let bestSq = SNAP_MAX_DIST_M * SNAP_MAX_DIST_M
  for (const road of roads) {
    if (road.tunnel) continue
    if (road.elevationMode !== undefined && road.elevationMode !== 'ground' && road.elevationMode !== 'bridge') continue
    const pts = road.points
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]!
      const b = pts[i + 1]!
      const sx = b.x - a.x
      const sz = b.z - a.z
      const len2 = sx * sx + sz * sz
      if (len2 < 1e-6) continue
      const t = Math.max(0, Math.min(1, ((x - a.x) * sx + (z - a.z) * sz) / len2))
      const px = a.x + sx * t
      const pz = a.z + sz * t
      const dx = px - x
      const dz = pz - z
      const d2 = dx * dx + dz * dz
      if (d2 < bestSq) {
        bestSq = d2
        best = { x: px, z: pz }
      }
    }
  }
  return best
}

/**
 * Canonical trial id — destination-independent on purpose. The same
 * monument pair raced from two different destinations (or two address
 * searches resolving to different `osm_loc_*` ids) is the same physical
 * race and must share one leaderboard. POI ids are OSM-stable
 * (`ov_node_*` / `ov_way_*` for radar, chunk POI ids otherwise).
 */
export function trialIdFor(poiA: string, poiB: string): string {
  const [first, second] = poiA < poiB ? [poiA, poiB] : [poiB, poiA]
  return `tt_${first}_${second}`
}

interface MonumentPt {
  id: string
  name: string
  x: number
  z: number
}

type TrialExtra = {
  monuments?: Array<{ id: string; name: string; x: number; z: number }> | undefined
  roads?: Road[] | undefined
}

/** Tourism monuments from loaded chunks + far-radar extras (deduped). */
function collectMonuments(
  pois: PointOfInterest[],
  extra?: TrialExtra,
): MonumentPt[] {
  const monuments: MonumentPt[] = []
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
  return monuments
}

type RoadGraph = ReturnType<typeof buildRoadGraph>

/**
 * Validate one monument pair: snap both ends onto a surface road, keep
 * crow-flies pairs in band, prove drivability with A*. The A* road path
 * only proves the pair is drivable — the stored distance is crow-flies
 * (shortest path, shortcuts allowed).
 */
function tryBuildTrial(
  a: MonumentPt,
  b: MonumentPt,
  allRoads: Road[],
  graph: RoadGraph,
  destinationId: string,
): TrialDef | null {
  // Snap both ends onto the nearest surface road: monuments often sit
  // inside buildings, courtyards or pedestrian zones — beacons and the
  // finish line must be where the car can actually drive.
  const snapA = snapToRoad(a.x, a.z, allRoads)
  const snapB = snapToRoad(b.x, b.z, allRoads)
  if (!snapA || !snapB) return null
  const crowM = Math.hypot(snapA.x - snapB.x, snapA.z - snapB.z)
  if (crowM < TRIAL_MIN_DIST_M || crowM > TRIAL_MAX_DIST_M) return null
  const path = findAStarPath(graph, { x: snapA.x, y: 0, z: snapA.z }, { x: snapB.x, y: 0, z: snapB.z })
  if (!path || path.length < 2) return null
  const [first, second] = a.id < b.id ? [a, b] : [b, a]
  const [snapFirst, snapSecond] = a.id < b.id ? [snapA, snapB] : [snapB, snapA]
  return {
    id: trialIdFor(first!.id, second!.id),
    destinationId,
    from: { id: first!.id, name: first!.name, x: snapFirst!.x, z: snapFirst!.z },
    to: { id: second!.id, name: second!.name, x: snapSecond!.x, z: snapSecond!.z },
    distanceM: crowM,
  }
}

function sortTrials(trials: TrialDef[]): void {
  trials.sort((a, b) => (a.distanceM !== b.distanceM ? a.distanceM - b.distanceM : a.id < b.id ? -1 : 1))
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
  extra?: TrialExtra,
): TrialDef[] {
  const allRoads = extra?.roads && extra.roads.length > 0 ? dedupeRoads(roads, extra.roads) : roads
  if (allRoads.length === 0) return []

  const monuments = collectMonuments(pois, extra)
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
      const t = tryBuildTrial(a, b, allRoads, graph, destinationId)
      if (t) trials.push(t)
    }
  }
  sortTrials(trials)
  return trials
}

/**
 * Every race from one start beacon, shortest first. Deterministic for a
 * given beacon + loaded world data: candidates are ordered by crow-flies
 * distance from the beacon (then id) — never by player position — so two
 * players at the same beacon list the same races and query the same
 * leaderboard ids. Used by the start panel and the ENTRÉE selection.
 */
export function getBeaconTrials(
  beaconId: string,
  pois: PointOfInterest[],
  roads: Road[],
  destinationId: string,
  count = 6,
  extra?: TrialExtra,
  maxAttempts = 32,
): TrialDef[] {
  const allRoads = extra?.roads && extra.roads.length > 0 ? dedupeRoads(roads, extra.roads) : roads
  if (allRoads.length === 0) return []

  const monuments = collectMonuments(pois, extra)
  const beacon = monuments.find((m) => m.id === beaconId)
  if (!beacon) return []

  const others = monuments
    .filter((m) => m.id !== beaconId)
    .sort((p, q) => {
      const dp = (p.x - beacon.x) ** 2 + (p.z - beacon.z) ** 2
      const dq = (q.x - beacon.x) ** 2 + (q.z - beacon.z) ** 2
      if (dp !== dq) return dp - dq
      return p.id < q.id ? -1 : p.id > q.id ? 1 : 0
    })

  const graph = buildRoadGraph(allRoads)
  if (graph.nodes.size === 0) return []

  const trials: TrialDef[] = []
  let attempts = 0
  for (const other of others) {
    if (trials.length >= count || attempts >= maxAttempts) break
    attempts++
    const t = tryBuildTrial(beacon, other, allRoads, graph, destinationId)
    if (t) trials.push(t)
  }
  sortTrials(trials)
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

// ── Leaderboard liveness ─────────────────────────────────────────────────
// Leaderboards used to fetch once on mount: a run submitted by another
// player (or by yourself, then walking back to the beacon) never showed
// up until you left and re-entered the zone. Panels subscribe below and
// HUD notifies after every successful submit.

/** localStorage key pinging other tabs + window event name. */
export const TRIAL_TIMES_CHANGED_KEY = 'wd:trial-times-changed'
export const TRIAL_TIMES_CHANGED_EVENT = 'trial-times-changed'

/** Background refresh interval for open leaderboards, ms. */
export const TRIAL_LEADERBOARD_POLL_MS = 10_000

/** Notify open leaderboards (this tab via event, other tabs via storage). */
export function notifyTrialTimesChanged(): void {
  try {
    window.dispatchEvent(new CustomEvent(TRIAL_TIMES_CHANGED_EVENT))
  } catch {
    // non-DOM context — ignore
  }
  try {
    localStorage.setItem(TRIAL_TIMES_CHANGED_KEY, String(Date.now()))
  } catch {
    // private mode / SSR — ignore
  }
}

/**
 * Re-run `onChange` when trial times may have changed: submit event from
 * this tab, storage ping from another tab, window focus, plus polling.
 * Returns an unsubscribe function.
 */
export function subscribeTrialTimesChanged(onChange: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === TRIAL_TIMES_CHANGED_KEY) onChange()
  }
  window.addEventListener('focus', onChange)
  window.addEventListener(TRIAL_TIMES_CHANGED_EVENT, onChange)
  window.addEventListener('storage', onStorage)
  const id = window.setInterval(onChange, TRIAL_LEADERBOARD_POLL_MS)
  return () => {
    window.removeEventListener('focus', onChange)
    window.removeEventListener(TRIAL_TIMES_CHANGED_EVENT, onChange)
    window.removeEventListener('storage', onStorage)
    window.clearInterval(id)
  }
}
