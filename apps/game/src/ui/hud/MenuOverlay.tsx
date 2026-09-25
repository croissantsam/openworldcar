import React from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useLocale } from '../../i18n/index.js'
import { LOCALE_LABELS, SUPPORTED_LOCALES, saveLocale, type Locale } from '../../i18n/locales.js'
import { useSettingsStore, PRESETS, type ViewDistancePreset } from '../../settings/SettingsStore.js'
import { menuButtonHintStyle, menuButtonIconStyle, menuButtonStyle, menuButtonTitleStyle } from './hudStyles.js'

/** Burger-menu view-distance preset keys (low/medium/high/ultra) → hud_ labels. */
const PRESET_LABEL_KEYS: Record<ViewDistancePreset, string> = {
  low: 'hud_preset_low',
  medium: 'hud_preset_medium',
  high: 'hud_preset_high',
  ultra: 'hud_preset_ultra',
}

interface MenuOverlayProps {
  isPlane: boolean
  isGuest: boolean
  authLabel: string
  touchMode: boolean
  viewDistanceOpen: boolean
  onClose: () => void
  onOpenTravel: () => void
  onRespawn: () => void
  onToggleVehicle: () => void
  onOpenAuth: () => void
  onOpenTrophies: () => void
  onOpenTrials: () => void
  onOpenDistance: () => void
  onCloseViewDistancePanel: () => void
  onToggleTouchMode: () => void
  showControls?: boolean
  onToggleControls?: () => void
  isFullscreen?: boolean
  onToggleFullscreen?: () => void
}

/** Burger menu: actions, view distance, touch toggle, language switcher. */
export const MenuOverlay: React.FC<MenuOverlayProps> = ({
  isPlane,
  isGuest,
  authLabel,
  touchMode,
  viewDistanceOpen,
  onClose,
  onOpenTravel,
  onRespawn,
  onToggleVehicle,
  onOpenAuth,
  onOpenTrophies,
  onOpenTrials,
  onOpenDistance,
  onCloseViewDistancePanel,
  onToggleTouchMode,
  showControls = false,
  onToggleControls,
  isFullscreen = false,
  onToggleFullscreen,
}) => {
  const { locale, t } = useLocale()
  const navigate = useNavigate()
  const viewDistance = useSettingsStore((state) => state.viewDistance)
  // Burger-menu language switch: persists the choice and moves to the
  // matching locale route (/fr, /en, /es). The game reboots on the saved
  // spawn, so the session continues where it was.
  const switchLanguage = (lng: Locale) => {
    if (lng === locale) return
    saveLocale(lng)
    onClose()
    navigate({ to: '/$locale', params: { locale: lng } })
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.7)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'rgba(15, 23, 42, 0.95)',
          border: '1px solid rgba(0, 212, 255, 0.4)',
          borderRadius: 20,
          padding: '18px 22px',
          maxWidth: 380,
          width: '90%',
          boxShadow: '0 20px 50px rgba(0,0,0,0.8), 0 0 25px rgba(0, 212, 255, 0.2)',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 12, fontWeight: 900, color: '#00d4ff', letterSpacing: 2 }}>
            {t('hud_menu_title')}
          </span>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 8,
              color: '#fff',
              width: 28,
              height: 28,
              cursor: 'pointer',
              fontSize: 13,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* 1. Voyage mondial */}
          <button
            onClick={onOpenTravel}
            style={menuButtonStyle}
          >
            <span style={menuButtonIconStyle}>🌍</span>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <span style={menuButtonTitleStyle}>{t('hud_menu_travel')}</span>
              <span style={menuButtonHintStyle}>{t('hud_menu_travel_hint')}</span>
            </span>
          </button>

          {/* 2. Débloquer véhicule */}
          <button
            onClick={onRespawn}
            style={menuButtonStyle}
          >
            <span style={menuButtonIconStyle}>🔄</span>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <span style={menuButtonTitleStyle}>{t('hud_menu_unstuck')}</span>
              <span style={menuButtonHintStyle}>{t('hud_menu_unstuck_hint')}</span>
            </span>
          </button>

          {/* 3. Voiture / Avion */}
          <button
            onClick={onToggleVehicle}
            style={menuButtonStyle}
          >
            <span style={menuButtonIconStyle}>{isPlane ? '🚗' : '✈️'}</span>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <span style={menuButtonTitleStyle}>
                {isPlane ? t('hud_menu_car') : t('hud_menu_plane')}
              </span>
              <span style={menuButtonHintStyle}>
                {isPlane ? t('hud_menu_to_car_hint') : t('hud_menu_to_plane_hint')}
              </span>
            </span>
          </button>

          {/* 4. Distance de vue */}
          <button
            onClick={onOpenDistance}
            style={menuButtonStyle}
          >
            <span style={menuButtonIconStyle}>👁️</span>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <span style={menuButtonTitleStyle}>{t('hud_menu_distance')}</span>
              <span style={menuButtonHintStyle}>{t('hud_menu_distance_hint')}</span>
            </span>
          </button>
        </div>

        {/* 5. Compte pilote (guest / connexion / synchronisation) */}
        <button
          onClick={onOpenAuth}
          style={menuButtonStyle}
        >
          <span style={menuButtonIconStyle}>{isGuest ? '👤' : '✅'}</span>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <span style={menuButtonTitleStyle}>
              {isGuest ? t('hud_menu_guest_account') : authLabel}
            </span>
            <span style={menuButtonHintStyle}>
              {isGuest ? t('hud_menu_guest_hint') : t('hud_menu_sync_hint')}
            </span>
          </span>
        </button>

        {/* 6. Trophées & classement */}
        <button
          onClick={onOpenTrophies}
          style={menuButtonStyle}
        >
          <span style={menuButtonIconStyle}>🏆</span>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <span style={menuButtonTitleStyle}>
              {t('hud_menu_trophies')}
            </span>
            <span style={menuButtonHintStyle}>
              {t('hud_menu_trophies_hint')}
            </span>
          </span>
        </button>

        {/* 7. Time trials (monument to monument) */}
        <button
          onClick={onOpenTrials}
          style={menuButtonStyle}
        >
          <span style={menuButtonIconStyle}>⏱️</span>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <span style={menuButtonTitleStyle}>
              {t('hud_menu_chrono')}
            </span>
            <span style={menuButtonHintStyle}>
              {t('hud_menu_chrono_hint')}
            </span>
          </span>
        </button>

        {/* Distance de vue panel */}
        {viewDistanceOpen && (
          <div
            style={{
              marginTop: 8,
              padding: '12px 16px',
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(0, 212, 255, 0.2)',
              borderRadius: 12,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 10, fontWeight: 800, color: '#00d4ff' }}>
                {t('hud_view_distance')}
              </span>
              <button
                onClick={onCloseViewDistancePanel}
                style={{
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  borderRadius: 6,
                  color: '#fff',
                  width: 24,
                  height: 24,
                  cursor: 'pointer',
                  fontSize: 12,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                ✕
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {Object.entries(PRESETS).map(([key, preset]) => (
                <button
                  key={key}
                  onClick={() => {
                    useSettingsStore.getState().setViewDistance(key as ViewDistancePreset)
                    onCloseViewDistancePanel()
                  }}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    gap: 2,
                    background: viewDistance === key
                      ? 'rgba(0, 212, 255, 0.15)'
                      : 'rgba(255, 255, 255, 0.05)',
                    border: viewDistance === key
                      ? '1px solid rgba(0, 212, 255, 0.6)'
                      : '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: 10,
                    padding: '8px 10px',
                    cursor: 'pointer',
                    color: '#ffffff',
                    textAlign: 'left',
                  }}
                >
                  <span style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 9, fontWeight: 800, color: viewDistance === key ? '#00d4ff' : '#94a3b8' }}>
                    {(() => {
                      const labelKey = PRESET_LABEL_KEYS[key as ViewDistancePreset]
                      return labelKey ? t(labelKey) : preset.label.toUpperCase()
                    })()}
                  </span>
                  <span style={{ fontSize: 7, color: '#94a3b8' }}>
                    {t('hud_preset_chunks', { count: preset.loadRadius })}
                  </span>
                </button>
              ))}
            </div>
            <div style={{ marginTop: 8, fontSize: 8, color: '#94a3b8', lineHeight: 1.4 }}>
              {t('hud_view_distance_note')}
            </div>
          </div>
        )}

        {/* Toggle afficher / masquer les contrôles (desktop) */}
        {!touchMode && onToggleControls && (
          <button
            onClick={() => {
              onToggleControls()
              onClose()
            }}
            style={menuButtonStyle}
          >
            <span style={menuButtonIconStyle}>⌨️</span>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <span style={menuButtonTitleStyle}>
                {showControls ? t('hud_menu_controls_hide') : t('hud_menu_controls_show')}
              </span>
              <span style={menuButtonHintStyle}>{t('hud_menu_controls_hint')}</span>
            </span>
          </button>
        )}

        {/* Plein écran / Grand écran */}
        {onToggleFullscreen && (
          <button
            onClick={() => {
              onToggleFullscreen()
              onClose()
            }}
            style={menuButtonStyle}
          >
            <span style={menuButtonIconStyle}>⛶</span>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <span style={menuButtonTitleStyle}>
                {isFullscreen ? t('hud_menu_fullscreen_exit') : t('hud_menu_fullscreen')}
              </span>
              <span style={menuButtonHintStyle}>{t('hud_menu_fullscreen_hint')}</span>
            </span>
          </button>
        )}

        {/* Toggle tactile / clavier */}
        <button
          onClick={onToggleTouchMode}
          style={{
            ...menuButtonStyle,
            justifyContent: 'center',
          }}
        >
          <span style={{ ...menuButtonTitleStyle, letterSpacing: 1 }}>
            {touchMode ? t('hud_touch_on') : t('hud_touch_off')}
          </span>
        </button>

        {/* Language switcher (burger menu only — nothing on the HUD) */}
        <div
          style={{
            ...menuButtonStyle,
            cursor: 'default',
            justifyContent: 'center',
          }}
        >
          <span style={{ ...menuButtonTitleStyle, letterSpacing: 1 }}>
            🌐 {t('core_language_title')}
          </span>
          {SUPPORTED_LOCALES.map((lng) => (
            <button
              key={lng}
              onClick={() => switchLanguage(lng)}
              style={{
                background: locale === lng ? 'rgba(0, 212, 255, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                border:
                  locale === lng
                    ? '1px solid rgba(0, 212, 255, 0.6)'
                    : '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: 8,
                padding: '4px 10px',
                color: locale === lng ? '#00d4ff' : '#94a3b8',
                fontFamily: "'Inter', sans-serif",
                fontSize: 10,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {LOCALE_LABELS[lng]}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
