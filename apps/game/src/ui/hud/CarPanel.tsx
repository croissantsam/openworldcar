import React from 'react'
import { useLocale } from '../../i18n/index.js'

interface CarPanelProps {
  speed: number
  gear: string
  nitro: number
  nitroBoosting: boolean
  drifting: boolean
  touchMode: boolean
}

/** Car-mode cluster: speedometer + nitro gauge + drift badge. */
export const CarPanel: React.FC<CarPanelProps> = ({
  speed,
  gear,
  nitro,
  nitroBoosting,
  drifting,
  touchMode,
}) => {
  const { t } = useLocale()
  return (
    <>
      {/* Speedometer - Minimalist, modern glass badge directly above the FREIN button */}
      <div
        style={{
          position: 'absolute',
          bottom: touchMode ? 'max(110px, env(safe-area-inset-bottom, 110px))' : 28,
          right: touchMode ? 'max(24px, env(safe-area-inset-right, 24px))' : 32,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: 'rgba(10, 16, 28, 0.7)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          border: '1px solid rgba(0, 212, 255, 0.3)',
          borderRadius: 14,
          padding: '4px 12px',
          pointerEvents: 'none',
          userSelect: 'none',
          zIndex: 35,
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4)',
        }}
      >
        <span
          style={{
            fontFamily: "'Orbitron', sans-serif",
            fontSize: touchMode ? 28 : 36,
            fontWeight: 900,
            color: '#fff',
            lineHeight: 1,
            textShadow: '0 0 12px rgba(0, 212, 255, 0.5)',
          }}
        >
          {speed}
        </span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <span
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 8,
              fontWeight: 700,
              color: '#00d4ff',
              letterSpacing: 1.2,
            }}
          >
            KM/H
          </span>
          <span
            style={{
              fontFamily: "'Orbitron', sans-serif",
              fontSize: 10,
              fontWeight: 800,
              color: gear === 'R' ? '#f87171' : gear === 'P' ? '#fbbf24' : '#34d399',
            }}
          >
            {gear}
          </span>
        </div>
      </div>

      {/* Nitro gauge + drift badge (car mode) */}
      <div
        style={{
          position: 'absolute',
          bottom: touchMode ? 'max(156px, env(safe-area-inset-bottom, 156px))' : 86,
          right: touchMode ? 'max(24px, env(safe-area-inset-right, 24px))' : 32,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'stretch',
          gap: 4,
          width: touchMode ? 118 : 148,
          pointerEvents: 'none',
          userSelect: 'none',
          zIndex: 35,
        }}
      >
        {drifting && (
          <div
            style={{
              alignSelf: 'flex-end',
              fontFamily: "'Orbitron', sans-serif",
              fontSize: touchMode ? 13 : 15,
              fontWeight: 900,
              letterSpacing: 3,
              color: '#fdba74',
              textShadow: '0 0 12px rgba(251, 146, 60, 0.8)',
              animation: 'hudFlash 0.4s ease-in-out infinite alternate',
            }}
          >
            {t('hud_drift')}
          </div>
        )}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: 'rgba(10, 16, 28, 0.7)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            border: nitroBoosting
              ? '1px solid rgba(0, 242, 254, 0.9)'
              : '1px solid rgba(0, 212, 255, 0.3)',
            borderRadius: 10,
            padding: '4px 10px',
            boxShadow: nitroBoosting
              ? '0 4px 16px rgba(0, 0, 0, 0.4), 0 0 14px rgba(0, 242, 254, 0.5)'
              : '0 4px 16px rgba(0, 0, 0, 0.4)',
            transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
          }}
        >
          <span
            style={{
              fontFamily: "'Orbitron', sans-serif",
              fontSize: 8,
              fontWeight: 900,
              letterSpacing: 1.2,
              color: nitroBoosting ? '#a5f3fc' : '#00d4ff',
              whiteSpace: 'nowrap',
            }}
          >
            {t('hud_nitro')}
          </span>
          <div
            style={{
              flex: 1,
              height: 6,
              borderRadius: 3,
              background: 'rgba(255, 255, 255, 0.12)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${Math.round(nitro * 100)}%`,
                height: '100%',
                borderRadius: 3,
                background: nitroBoosting
                  ? 'linear-gradient(90deg, #00f2fe, #a5f3fc)'
                  : 'linear-gradient(90deg, #0369a1, #00d4ff)',
                boxShadow: nitroBoosting ? '0 0 10px rgba(0, 242, 254, 0.9)' : 'none',
                transition: 'width 0.1s linear',
              }}
            />
          </div>
        </div>
      </div>
    </>
  )
}
