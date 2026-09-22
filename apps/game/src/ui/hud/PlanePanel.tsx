import React from 'react'
import { useLocale } from '../../i18n/index.js'
import type { FlightReadout, GunReadout } from './types.js'
import { alertBannerStyle, flightLabelStyle, flightUnitStyle } from './hudStyles.js'

interface PlanePanelProps {
  flight: FlightReadout
  gun: GunReadout | null
  hitMarker: boolean
  touchMode: boolean
}

/** Plane-mode cluster: instruments, gun sight, stall/crash warnings, take-off tip. */
export const PlanePanel: React.FC<PlanePanelProps> = ({ flight, gun, hitMarker, touchMode }) => {
  const { t } = useLocale()
  const vsColor =
    flight.verticalSpeed > 0.4 ? '#34d399' : flight.verticalSpeed < -0.4 ? '#fbbf24' : '#e2e8f0'

  return (
    <>
      {/* Flight instruments (plane mode) — same glass language as the speedometer */}
      <div
        style={{
          position: 'absolute',
          bottom: touchMode ? 'max(110px, env(safe-area-inset-bottom, 110px))' : 28,
          right: touchMode ? 'max(24px, env(safe-area-inset-right, 24px))' : 32,
          display: 'flex',
          flexDirection: 'column',
          gap: touchMode ? 4 : 6,
          background: 'rgba(10, 16, 28, 0.72)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          border: flight.stall || flight.crashed
            ? '1px solid rgba(239, 68, 68, 0.75)'
            : '1px solid rgba(0, 212, 255, 0.3)',
          borderRadius: 14,
          padding: touchMode ? '5px 10px' : '8px 14px',
          pointerEvents: 'none',
          userSelect: 'none',
          zIndex: 35,
          boxShadow: flight.stall || flight.crashed
            ? '0 4px 16px rgba(0, 0, 0, 0.4), 0 0 16px rgba(239, 68, 68, 0.35)'
            : '0 4px 16px rgba(0, 0, 0, 0.4)',
          transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: touchMode ? 10 : 16 }}>
          {/* Airspeed */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <span style={flightLabelStyle}>{t('hud_airspeed')}</span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
              <span
                style={{
                  fontFamily: "'Orbitron', sans-serif",
                  fontSize: touchMode ? 24 : 32,
                  fontWeight: 900,
                  color: flight.stall ? '#f87171' : '#fff',
                  lineHeight: 1,
                  textShadow: flight.stall ? '0 0 12px rgba(239, 68, 68, 0.6)' : '0 0 12px rgba(0, 212, 255, 0.5)',
                  minWidth: touchMode ? 44 : 58,
                  textAlign: 'right',
                }}
              >
                {flight.kmh}
              </span>
              <span style={flightUnitStyle}>KM/H</span>
            </div>
          </div>
          {/* Altitude above ground */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <span style={flightLabelStyle}>{t('hud_altitude')}</span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
              <span
                style={{
                  fontFamily: "'Orbitron', sans-serif",
                  fontSize: touchMode ? 17 : 22,
                  fontWeight: 800,
                  color: '#fff',
                  lineHeight: 1,
                  minWidth: touchMode ? 34 : 44,
                  textAlign: 'right',
                }}
              >
                {flight.altitude}
              </span>
              <span style={flightUnitStyle}>M</span>
            </div>
          </div>
          {/* Vertical speed */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <span style={flightLabelStyle}>{t('hud_vario')}</span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
              <span
                style={{
                  fontFamily: "'Orbitron', sans-serif",
                  fontSize: touchMode ? 13 : 16,
                  fontWeight: 800,
                  color: vsColor,
                  lineHeight: 1,
                  minWidth: touchMode ? 40 : 50,
                  textAlign: 'right',
                }}
              >
                {flight.verticalSpeed > 0.4 ? '▲' : flight.verticalSpeed < -0.4 ? '▼' : '•'}
                {Math.abs(flight.verticalSpeed).toFixed(1)}
              </span>
              <span style={flightUnitStyle}>M/S</span>
            </div>
          </div>
        </div>
        {/* Throttle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ ...flightLabelStyle, minWidth: 24 }}>{t('hud_throttle')}</span>
          <div
            style={{
              flex: 1,
              height: touchMode ? 5 : 6,
              borderRadius: 3,
              background: 'rgba(255, 255, 255, 0.12)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${flight.throttle}%`,
                height: '100%',
                borderRadius: 3,
                background: 'linear-gradient(90deg, #00b4d8, #00f2fe)',
                boxShadow: '0 0 8px rgba(0, 242, 254, 0.6)',
                transition: 'width 0.1s linear',
              }}
            />
          </div>
          <span
            style={{
              fontFamily: "'Orbitron', sans-serif",
              fontSize: touchMode ? 9 : 10,
              fontWeight: 800,
              color: '#e2e8f0',
              minWidth: 30,
              textAlign: 'right',
            }}
          >
            {flight.throttle}%
          </span>
          <span
            style={{
              fontFamily: "'Orbitron', sans-serif",
              fontSize: touchMode ? 8 : 9,
              fontWeight: 800,
              letterSpacing: 1,
              color: flight.onGround ? '#fbbf24' : '#34d399',
            }}
          >
            {flight.onGround ? t('hud_ground') : t('hud_airborne')}
          </span>
        </div>
        {/* Machine guns: ammo + barrel heat */}
        {gun && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ ...flightLabelStyle, minWidth: 24, color: gun.overheated ? '#f87171' : '#fbbf24' }}>{t('hud_ammo')}</span>
            <span
              style={{
                fontFamily: "'Orbitron', sans-serif",
                fontSize: touchMode ? 12 : 14,
                fontWeight: 800,
                color: gun.ammo === 0 ? '#f87171' : '#fff',
                minWidth: touchMode ? 30 : 36,
                textAlign: 'right',
              }}
            >
              {gun.ammo}
            </span>
            <div
              style={{
                flex: 1,
                height: touchMode ? 5 : 6,
                borderRadius: 3,
                background: 'rgba(255, 255, 255, 0.12)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${gun.heat}%`,
                  height: '100%',
                  borderRadius: 3,
                  background: gun.overheated
                    ? 'linear-gradient(90deg, #ef4444, #fca5a5)'
                    : 'linear-gradient(90deg, #f59e0b, #fbbf24)',
                  boxShadow: gun.overheated ? '0 0 8px rgba(239, 68, 68, 0.7)' : '0 0 6px rgba(251, 191, 36, 0.5)',
                  transition: 'width 0.1s linear',
                }}
              />
            </div>
            <span
              style={{
                fontFamily: "'Orbitron', sans-serif",
                fontSize: touchMode ? 8 : 9,
                fontWeight: 900,
                letterSpacing: 1,
                color: gun.overheated ? '#f87171' : 'rgba(148, 163, 184, 0.9)',
                minWidth: 56,
                textAlign: 'right',
                animation: gun.overheated ? 'hudFlash 0.45s ease-in-out infinite alternate' : undefined,
              }}
            >
              {gun.overheated ? t('hud_overheat') : `${gun.heat}%`}
            </span>
          </div>
        )}
      </div>

      {/* Gun sight (plane mode) */}
      {!flight.crashed && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 46,
            height: 46,
            pointerEvents: 'none',
            userSelect: 'none',
            zIndex: 25,
          }}
        >
          {/* four thin ticks + centre dot */}
          {([
            { top: 0, left: '50%', width: 1, height: 13, marginLeft: -0.5 },
            { bottom: 0, left: '50%', width: 1, height: 13, marginLeft: -0.5 },
            { left: 0, top: '50%', width: 13, height: 1, marginTop: -0.5 },
            { right: 0, top: '50%', width: 13, height: 1, marginTop: -0.5 },
          ] as React.CSSProperties[]).map((tick, i) => (
            <div
              key={i}
              style={{
                position: 'absolute',
                background: hitMarker ? 'rgba(248, 113, 113, 0.95)' : 'rgba(255, 255, 255, 0.75)',
                boxShadow: '0 0 4px rgba(0, 0, 0, 0.8)',
                ...tick,
              }}
            />
          ))}
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              width: 3,
              height: 3,
              marginTop: -1.5,
              marginLeft: -1.5,
              borderRadius: '50%',
              background: hitMarker ? '#f87171' : 'rgba(255, 255, 255, 0.85)',
              boxShadow: '0 0 4px rgba(0, 0, 0, 0.8)',
            }}
          />
          {/* Hit marker: four diagonals that flash on a player hit */}
          {hitMarker &&
            ([
              { top: 4, left: 4, rotate: '45deg' },
              { top: 4, right: 4, rotate: '-45deg' },
              { bottom: 4, left: 4, rotate: '-45deg' },
              { bottom: 4, right: 4, rotate: '45deg' },
            ] as Array<{ top?: number; bottom?: number; left?: number; right?: number; rotate: string }>).map(
              (m, i) => (
                <div
                  key={`hm${i}`}
                  style={{
                    position: 'absolute',
                    top: m.top,
                    bottom: m.bottom,
                    left: m.left,
                    right: m.right,
                    width: 10,
                    height: 2,
                    background: '#fca5a5',
                    boxShadow: '0 0 6px rgba(239, 68, 68, 0.9)',
                    transform: `rotate(${m.rotate})`,
                  }}
                />
              ),
            )}
        </div>
      )}

      {/* Stall warning */}
      {flight.stall && !flight.crashed && (
        <div
          style={{
            ...alertBannerStyle,
            top: touchMode ? '24%' : '22%',
            animation: 'hudFlash 0.55s ease-in-out infinite alternate',
          }}
        >
          <span style={{ fontSize: touchMode ? 14 : 18 }}>⚠️</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span
              style={{
                fontFamily: "'Orbitron', sans-serif",
                fontSize: touchMode ? 14 : 18,
                fontWeight: 900,
                letterSpacing: 3,
                color: '#fecaca',
              }}
            >
              {t('hud_stall_title')}
            </span>
            <span style={{ fontFamily: "'Inter', sans-serif", fontSize: touchMode ? 9 : 11, color: 'rgba(255,255,255,0.8)' }}>
              {touchMode ? t('hud_stall_hint_touch') : t('hud_stall_hint_keys')}
            </span>
          </div>
        </div>
      )}

      {/* Crash */}
      {flight.crashed && (
        <div
          style={{
            ...alertBannerStyle,
            top: '34%',
            padding: touchMode ? '8px 18px' : '12px 28px',
            animation: 'hudFlash 0.4s ease-in-out infinite alternate',
          }}
        >
          <span style={{ fontSize: touchMode ? 20 : 28 }}>💥</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span
              style={{
                fontFamily: "'Orbitron', sans-serif",
                fontSize: touchMode ? 22 : 30,
                fontWeight: 900,
                letterSpacing: 6,
                color: '#fecaca',
              }}
            >
              {t('hud_crash_title')}
            </span>
            <span style={{ fontFamily: "'Inter', sans-serif", fontSize: touchMode ? 9 : 11, color: 'rgba(255,255,255,0.85)' }}>
              {touchMode ? t('hud_crash_hint_touch') : t('hud_crash_hint_keys')}
            </span>
          </div>
        </div>
      )}

      {/* Take-off tip while sitting on the ground */}
      {flight.onGround && !flight.crashed && flight.kmh < 40 && (
        <div
          style={{
            position: 'absolute',
            bottom: touchMode ? 'max(182px, env(safe-area-inset-bottom, 182px))' : 118,
            right: touchMode ? 'max(24px, env(safe-area-inset-right, 24px))' : 32,
            maxWidth: touchMode ? '46vw' : 360,
            background: 'rgba(10, 16, 28, 0.72)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            border: '1px solid rgba(0, 212, 255, 0.3)',
            borderRadius: 14,
            padding: touchMode ? '4px 12px' : '6px 16px',
            fontFamily: "'Inter', sans-serif",
            fontSize: touchMode ? 10 : 12,
            color: 'rgba(255,255,255,0.88)',
            lineHeight: 1.4,
            pointerEvents: 'none',
            userSelect: 'none',
            zIndex: 30,
          }}
        >
          ✈️{' '}
          {touchMode
            ? t('hud_takeoff_hint_touch')
            : t('hud_takeoff_hint_keys')}
        </div>
      )}
    </>
  )
}
