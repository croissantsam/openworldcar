import React from 'react'
import type { WorldDestination } from '../../world/destinations.js'
import type { TrophyToast } from '../trophies/toast.js'
import { useLocale } from '../../i18n/index.js'
import { destName } from '../../i18n/dict-travel.js'
import { trophyName } from '../../i18n/dict-trophy.js'

interface FxOverlaysProps {
  isGenerating: boolean
  touchMode: boolean
  isWarping: boolean
  currentDest: WorldDestination
  trophyToasts: TrophyToast[]
}

/** Transient FX: world-gen badge, warp overlay, trophy unlock toasts. */
export const FxOverlays: React.FC<FxOverlaysProps> = ({
  isGenerating,
  touchMode,
  isWarping,
  currentDest,
  trophyToasts,
}) => {
  const { t } = useLocale()
  const isMobileLandscape = touchMode
  return (
    <>
      {/* Live World Generation Floating Badge */}
      {isGenerating && (
        <div
          style={{
            position: 'absolute',
            top: isMobileLandscape ? 48 : 76,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(15, 23, 42, 0.92)',
            border: '1px solid #38bdf8',
            boxShadow: '0 0 20px rgba(56, 189, 248, 0.5), 0 4px 12px rgba(0,0,0,0.5)',
            backdropFilter: 'blur(10px)',
            borderRadius: 20,
            padding: isMobileLandscape ? '3px 12px' : '5px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: isMobileLandscape ? 9 : 11,
            fontFamily: "'Orbitron', sans-serif",
            color: '#38bdf8',
            letterSpacing: 1.2,
            zIndex: 15,
            pointerEvents: 'none',
          }}
        >
          <span style={{ fontSize: isMobileLandscape ? 11 : 13, animation: 'spin 1s linear infinite' }}>⚡</span>
          <span>{t('hud_generating')}</span>
        </div>
      )}

      {/* Trophy unlock toasts */}
      {trophyToasts.length > 0 && (
        <div
          style={{
            position: 'absolute',
            top: isMobileLandscape ? 52 : 68,
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            zIndex: 250,
            pointerEvents: 'none',
            alignItems: 'center',
          }}
        >
          {trophyToasts.map((toast) => (
            <div
              key={toast.key}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: 'rgba(20, 14, 4, 0.92)',
                border: '1px solid rgba(251, 191, 36, 0.7)',
                boxShadow: '0 8px 30px rgba(0,0,0,0.6), 0 0 22px rgba(251, 191, 36, 0.35)',
                borderRadius: 14,
                padding: '7px 16px',
                animation: 'hudFlash 0.5s ease-in-out 2 alternate',
                whiteSpace: 'nowrap',
              }}
            >
              <span style={{ fontSize: 18 }}>🏆</span>
              <span style={{ fontSize: 18 }}>{toast.icon}</span>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                <span style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 11, fontWeight: 900, color: '#fde68a', letterSpacing: 1 }}>
                  {trophyName(t, toast.trophyId ?? '', toast.name).toUpperCase()}
                </span>
                <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 9, color: 'rgba(255,255,255,0.75)' }}>
                  {t('trophy_unlocked')}
                </span>
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Hyperspace Warp FX Overlay */}
      {isWarping && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'radial-gradient(circle, rgba(255, 255, 255, 0.95) 0%, rgba(56, 189, 248, 0.8) 40%, rgba(10, 15, 30, 0.98) 100%)',
            backdropFilter: 'blur(20px)',
            pointerEvents: 'none',
          }}
        >
          <div style={{ fontSize: 64, filter: 'drop-shadow(0 0 30px #fff)' }}>{currentDest.flag}</div>
          <div
            style={{
              fontFamily: "'Orbitron', sans-serif",
              fontSize: 28,
              fontWeight: 900,
              color: '#ffffff',
              letterSpacing: 4,
              marginTop: 16,
              textShadow: '0 0 20px rgba(56, 189, 248, 0.8)',
            }}
          >
            {t('hud_warp_title', { city: currentDest.city.toUpperCase() })}
          </div>
          <div
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 14,
              color: 'rgba(255, 255, 255, 0.85)',
              marginTop: 8,
              letterSpacing: 1,
            }}
          >
            {destName(currentDest, t)}
          </div>
        </div>
      )}
    </>
  )
}
