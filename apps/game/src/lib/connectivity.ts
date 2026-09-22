/**
 * Connectivity — explicit online/offline mode + offline trial-time storage.
 *
 * - Mode is explicit (default online) and device-local, like airplane mode:
 *   it is NOT synced via the server profile. Persisted in localStorage.
 * - Offline mode disables the multiplayer socket (see
 *   `GameClient.setSocketsEnabled`) AND routes time-trial submissions to a
 *   local queue instead of the HTTP API. The queue is flushed in order when
 *   the game comes back online (see the HUD flush effect).
 * - Every finished run also updates local bests, so leaderboards can show
 *   "record local" rows with zero network.
 */

export const ONLINE_MODE_KEY = 'wd:online-mode'
export const ONLINE_MODE_EVENT = 'online-mode-changed'

const OFFLINE_TRIAL_RUNS_KEY = 'wd:offline-trial-runs'
const LOCAL_TRIAL_BESTS_KEY = 'wd:trial-local-bests'

/** Max queued offline runs — oldest dropped beyond. */
const MAX_QUEUED_RUNS = 200

/** Server `TrialMeta` shape, duplicated to keep this module dependency-free. */
export interface OfflineTrialMeta {
  id: string
  destinationId: string
  label: string
  fromName: string
  toName: string
  distanceM: number
}

export interface OfflineTrialRun {
  trial: OfflineTrialMeta
  timeMs: number
  recordedAt: number
}

function readText(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeText(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // private mode / SSR / quota — offline persistence is best-effort
  }
}

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

/** Explicit mode, default online. */
export function isOnlineMode(): boolean {
  return readText(ONLINE_MODE_KEY) !== 'off'
}

export function setOnlineModeSetting(online: boolean): void {
  writeText(ONLINE_MODE_KEY, online ? 'on' : 'off')
  try {
    window.dispatchEvent(new CustomEvent<boolean>(ONLINE_MODE_EVENT, { detail: online }))
  } catch {
    // non-DOM context — ignore
  }
}

/** Re-run `onChange` when the mode flips (this tab or another one). */
export function subscribeOnlineMode(onChange: (online: boolean) => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const onEvent = (e: Event) => {
    const detail = (e as CustomEvent<boolean>).detail
    onChange(typeof detail === 'boolean' ? detail : isOnlineMode())
  }
  const onStorage = (e: StorageEvent) => {
    if (e.key === ONLINE_MODE_KEY) onChange(isOnlineMode())
  }
  window.addEventListener(ONLINE_MODE_EVENT, onEvent)
  window.addEventListener('storage', onStorage)
  return () => {
    window.removeEventListener(ONLINE_MODE_EVENT, onEvent)
    window.removeEventListener('storage', onStorage)
  }
}

/** Queue a run recorded while offline, for later sync. */
export function queueOfflineTrialRun(trial: OfflineTrialMeta, timeMs: number): void {
  const runs = readJSON<OfflineTrialRun[]>(OFFLINE_TRIAL_RUNS_KEY, [])
  runs.push({ trial, timeMs: Math.round(timeMs), recordedAt: Date.now() })
  while (runs.length > MAX_QUEUED_RUNS) runs.shift()
  writeText(OFFLINE_TRIAL_RUNS_KEY, JSON.stringify(runs))
}

export function getOfflineTrialRuns(): OfflineTrialRun[] {
  return readJSON<OfflineTrialRun[]>(OFFLINE_TRIAL_RUNS_KEY, [])
}

export function setOfflineTrialRuns(runs: OfflineTrialRun[]): void {
  writeText(OFFLINE_TRIAL_RUNS_KEY, JSON.stringify(runs))
}

/** Min-best per trial across every finished run (online + offline). */
export function recordLocalTrialBest(trialId: string, timeMs: number): void {
  const bests = readJSON<Record<string, number>>(LOCAL_TRIAL_BESTS_KEY, {})
  const t = Math.round(timeMs)
  if (bests[trialId] === undefined || t < bests[trialId]!) bests[trialId] = t
  writeText(LOCAL_TRIAL_BESTS_KEY, JSON.stringify(bests))
}

export function getLocalTrialBests(): Record<string, number> {
  return readJSON<Record<string, number>>(LOCAL_TRIAL_BESTS_KEY, {})
}
