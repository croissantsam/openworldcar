/**
 * Shared profile shapes (client + server, no server-only imports here).
 */

export interface DestinationSnapshot {
  id: string
  name: string
  city: string
  country: string
  flag: string
  description: string
  chunkDir: string
}

export interface SpawnSave {
  destination: DestinationSnapshot
  originLat: number
  originLng: number
  x: number
  y: number
  z: number
  heading: number
}

export interface SettingsSave {
  viewDistance: 'low' | 'medium' | 'high' | 'ultra'
  customLoadRadius: number | null
  customUnloadRadius: number | null
  customCameraFar: number | null
  customFogDensity: number | null
}

export interface PlayerProfileData {
  displayName: string | null
  destination: DestinationSnapshot | null
  originLat: number | null
  originLng: number | null
  x: number | null
  y: number | null
  z: number | null
  heading: number | null
  settings: SettingsSave | null
}
