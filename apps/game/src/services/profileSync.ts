import type { GameEngine } from '../game/GameEngine.js'
import { getMyProfile, saveSettings, saveSpawn } from '../server/profile.js'
import { PRESETS, useSettingsStore } from '../settings/SettingsStore.js'
import type { WorldDestination } from '../world/destinations.js'
import type {
  PlayerProfileData,
  SettingsSave,
  SpawnSave,
} from '../lib/profile.js'

export type { PlayerProfileData }

/** Load the signed-in player's profile (null when none saved yet). */
export async function loadMyProfile(): Promise<PlayerProfileData | null> {
  try {
    return await getMyProfile()
  } catch {
    return null
  }
}

/** Apply saved graphics settings to the local store. */
export function applyProfileSettings(profile: PlayerProfileData): void {
  const s = profile.settings
  if (!s) return
  if (!(s.viewDistance in PRESETS)) return
  useSettingsStore.setState({
    viewDistance: s.viewDistance,
    customLoadRadius: finiteOrNull(s.customLoadRadius),
    customUnloadRadius: finiteOrNull(s.customUnloadRadius),
    customCameraFar: finiteOrNull(s.customCameraFar),
    customFogDensity: finiteOrNull(s.customFogDensity),
  })
}

function finiteOrNull(v: number | null): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

/**
 * Rebuild the saved destination (known city or custom search result).
 * Returns null when nothing usable was saved — the caller keeps the default.
 */
export function destinationFromProfile(profile: PlayerProfileData): WorldDestination | null {
  const d = profile.destination
  if (!d || !profile.originLat || !profile.originLng) return null
  if (![profile.originLat, profile.originLng].every(Number.isFinite)) return null
  const x = profile.x ?? 62.5
  const y = profile.y ?? 1.0
  const z = profile.z ?? 62.5
  const heading = profile.heading ?? 0
  if (![x, y, z, heading].every(Number.isFinite)) return null
  return {
    id: d.id,
    name: d.name || 'Destination sauvegardée',
    city: d.city || '',
    country: d.country || '',
    flag: d.flag || '📍',
    description: d.description || '',
    origin: { latitude: profile.originLat, longitude: profile.originLng },
    chunkDir: d.chunkDir || '/chunks',
    spawnPosition: { x, y, z },
    spawnHeading: heading,
    landmarks: [],
  }
}

/** Snapshot the engine's current destination + player pose for saving. */
export function snapshotSpawn(engine: GameEngine): SpawnSave {
  const dest = engine.currentDestination
  const pos = engine.getPlayerPosition()
  return {
    destination: {
      id: dest.id,
      name: dest.name,
      city: dest.city,
      country: dest.country,
      flag: dest.flag,
      description: dest.description,
      chunkDir: dest.chunkDir,
    },
    originLat: dest.origin.latitude,
    originLng: dest.origin.longitude,
    x: pos.x,
    y: Math.max(0, pos.y),
    z: pos.z,
    heading: engine.playerCar.getYaw(),
  }
}

function snapshotSettings(): SettingsSave {
  const s = useSettingsStore.getState()
  return {
    viewDistance: s.viewDistance,
    customLoadRadius: s.customLoadRadius,
    customUnloadRadius: s.customUnloadRadius,
    customCameraFar: s.customCameraFar,
    customFogDensity: s.customFogDensity,
  }
}

/** Immediately persist spawn + settings (e.g. after a guest upgrades). */
export async function persistCurrentState(engine: GameEngine): Promise<void> {
  try {
    await Promise.all([saveSpawn({ data: snapshotSpawn(engine) }), saveSettings({ data: snapshotSettings() })])
  } catch {
    // offline or logged out — local play continues unsaved
  }
}

/**
 * Continuous autosave: settings on change (2s debounce), spawn every 20s.
 * Returns a cleanup function for engine disposal.
 */
export function startProfileAutosave(engine: GameEngine): () => void {
  let settingsTimer: ReturnType<typeof setTimeout> | null = null
  let lastSettingsJson = JSON.stringify(snapshotSettings())

  const unsub = useSettingsStore.subscribe((s) => {
    const next: SettingsSave = {
      viewDistance: s.viewDistance,
      customLoadRadius: s.customLoadRadius,
      customUnloadRadius: s.customUnloadRadius,
      customCameraFar: s.customCameraFar,
      customFogDensity: s.customFogDensity,
    }
    const json = JSON.stringify(next)
    if (json === lastSettingsJson) return
    lastSettingsJson = json
    if (settingsTimer) clearTimeout(settingsTimer)
    settingsTimer = setTimeout(() => {
      settingsTimer = null
      saveSettings({ data: next }).catch(() => {})
    }, 2000)
  })

  const saveLoop = async () => {
    try {
      await saveSpawn({ data: snapshotSpawn(engine) })
    } catch {
      // ignore transient failures; the next tick retries
    }
  }
  const interval = setInterval(saveLoop, 20_000)

  return () => {
    unsub()
    if (settingsTimer) clearTimeout(settingsTimer)
    clearInterval(interval)
  }
}
