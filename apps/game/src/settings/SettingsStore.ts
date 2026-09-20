import { create } from 'zustand'

type ViewDistancePreset = 'low' | 'medium' | 'high' | 'ultra'

interface ViewDistanceSettings {
  loadRadius: number
  unloadRadius: number
  cameraFar: number
  fogDensity: number
  label: string
}

const PRESETS: Record<ViewDistancePreset, ViewDistanceSettings> = {
  low: {
    loadRadius: 1,
    unloadRadius: 2,
    cameraFar: 1500,
    fogDensity: 0.001,
    label: 'Faible (performance)'
  },
  medium: {
    loadRadius: 2,
    unloadRadius: 4,
    cameraFar: 3000,
    fogDensity: 0.0005,
    label: 'Moyen (équilibré)'
  },
  high: {
    loadRadius: 3,
    unloadRadius: 5,
    cameraFar: 5000,
    fogDensity: 0.0003,
    label: 'Élevé (détail)'
  },
  ultra: {
    loadRadius: 4,
    unloadRadius: 6,
    cameraFar: 8000,
    fogDensity: 0.00015,
    label: 'Ultra (max détails)'
  }
}

interface SettingsState {
  viewDistance: ViewDistancePreset
  customLoadRadius: number | null
  customUnloadRadius: number | null
  customCameraFar: number | null
  customFogDensity: number | null
  setViewDistance: (preset: ViewDistancePreset) => void
  setCustomSettings: (settings: Partial<{
    loadRadius: number
    unloadRadius: number
    cameraFar: number
    fogDensity: number
  }>) => void
  resetCustomSettings: () => void
  getEffectiveSettings: () => ViewDistanceSettings
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  viewDistance: 'medium',
  customLoadRadius: null,
  customUnloadRadius: null,
  customCameraFar: null,
  customFogDensity: null,

  setViewDistance: (preset) => {
    set({ viewDistance: preset, customLoadRadius: null, customUnloadRadius: null, customCameraFar: null, customFogDensity: null })
  },

  setCustomSettings: (settings) => {
    set((state) => ({
      customLoadRadius: settings.loadRadius ?? state.customLoadRadius,
      customUnloadRadius: settings.unloadRadius ?? state.customUnloadRadius,
      customCameraFar: settings.cameraFar ?? state.customCameraFar,
      customFogDensity: settings.fogDensity ?? state.customFogDensity,
    }))
  },

  resetCustomSettings: () => {
    set({ customLoadRadius: null, customUnloadRadius: null, customCameraFar: null, customFogDensity: null })
  },

  getEffectiveSettings: () => {
    const state = get()
    const preset = PRESETS[state.viewDistance]
    return {
      loadRadius: state.customLoadRadius ?? preset.loadRadius,
      unloadRadius: state.customUnloadRadius ?? preset.unloadRadius,
      cameraFar: state.customCameraFar ?? preset.cameraFar,
      fogDensity: state.customFogDensity ?? preset.fogDensity,
      label: preset.label
    }
  }
}))

export { PRESETS, type ViewDistancePreset, type ViewDistanceSettings }