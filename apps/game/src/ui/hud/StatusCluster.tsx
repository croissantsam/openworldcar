import React from 'react'
import { useLocale } from '../../i18n/index.js'
import { alertBannerStyle } from './hudStyles.js'

interface StatusClusterProps {
  flipCountdown: number
  invincibilitySec: number
  destroyed: boolean
  isPlane: boolean
  touchMode: boolean
  showControls?: boolean
  onToggleControls?: () => void
  health?: number
  maxHealth?: number
  damageFlash?: boolean
  combatInvincible?: boolean
}

/** Bottom-center cluster (flip countdown, shield) + destroyed banner + hideable controls hint. */
export const StatusCluster: React.FC<StatusClusterProps> = ({
  flipCountdown,
  invincibilitySec,
  destroyed,
  isPlane,
  touchMode,
  showControls = false,
  onToggleControls,
}) => {
  const { t } = useLocale()
  const showCenterCluster = flipCountdown > 0 || (invincibilitySec > 0 && !isPlane)

  return (
    <>
      {/* Bottom-center cluster: flip countdown + spawn invincibility — both modes */}
      {showCenterCluster && (
        <div
        style={{
          position: 'absolute',
          bottom: touchMode ? 'max(120px, calc(env(safe-area-inset-bottom, 0px) + 120px))' : 30,
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 6,
          pointerEvents: 'none',
          userSelect: 'none',
          zIndex: 34,
        }}
      >
        {/* Flip-over auto recovery countdown — car back on the road shortly */}
        {flipCountdown > 0 && !isPlane && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: 'rgba(28, 14, 4, 0.92)',
              border: '1px solid rgba(251, 146, 60, 0.8)',
              boxShadow: '0 4px 16px rgba(0,0,0,0.4), 0 0 18px rgba(251, 146, 60, 0.45)',
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
              borderRadius: 12,
              padding: touchMode ? '3px 10px' : '4px 12px',
              whiteSpace: 'nowrap',
            }}
          >
            <span style={{ fontSize: touchMode ? 12 : 14 }}>🔄</span>
            <span
              style={{
                fontFamily: "'Orbitron', sans-serif",
                fontSize: touchMode ? 8 : 9,
                fontWeight: 800,
                letterSpacing: 1.2,
                color: '#fdba74',
                textTransform: 'uppercase',
              }}
            >
              {t('hud_flip_countdown', undefined, Math.ceil(flipCountdown))}
            </span>
          </div>
        )}
        {/* Spawn invincibility (car pass-through) — above the PV bar */}
        {invincibilitySec > 0 && !isPlane && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: invincibilitySec <= 5.0
                ? 'rgba(28, 10, 8, 0.92)'
                : 'rgba(8, 16, 28, 0.90)',
              border: invincibilitySec <= 5.0
                ? '1px solid rgba(255, 68, 0, 0.8)'
                : '1px solid rgba(0, 229, 255, 0.55)',
              boxShadow: invincibilitySec <= 5.0
                ? '0 4px 16px rgba(0,0,0,0.4), 0 0 18px rgba(255, 68, 0, 0.45)'
                : '0 4px 16px rgba(0,0,0,0.4), 0 0 16px rgba(0, 229, 255, 0.25)',
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
              borderRadius: 12,
              padding: touchMode ? '3px 10px' : '4px 12px',
              transition: 'border-color 0.3s ease, background 0.3s ease',
              whiteSpace: 'nowrap',
            }}
          >
            <div
              style={{
                width: touchMode ? 18 : 22,
                height: touchMode ? 18 : 22,
                borderRadius: '50%',
                background: invincibilitySec <= 5.0 ? 'rgba(255, 68, 0, 0.2)' : 'rgba(0, 229, 255, 0.15)',
                border: invincibilitySec <= 5.0 ? '1.5px solid rgba(255, 68, 0, 0.6)' : '1.5px solid rgba(0, 229, 255, 0.5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                boxShadow: invincibilitySec <= 5.0 ? '0 0 10px rgba(255, 68, 0, 0.5)' : '0 0 10px rgba(0, 229, 255, 0.4)',
              }}
            >
              <svg width={touchMode ? 10 : 12} height={touchMode ? 10 : 12} viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 2L4 5V11.5C4 16.5 7.5 21.2 12 22.5C16.5 21.2 20 16.5 20 11.5V5L12 2Z"
                  fill={invincibilitySec <= 5.0 ? '#ff4400' : '#00e5ff'}
                  fillOpacity="0.25"
                  stroke={invincibilitySec <= 5.0 ? '#ff4400' : '#00e5ff'}
                  strokeWidth="2"
                  strokeLinejoin="round"
                />
                <path
                  d="M9 12L11 14L15 10"
                  stroke={invincibilitySec <= 5.0 ? '#ff7733' : '#a7f3d0'}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <span
              style={{
                fontFamily: "'Orbitron', sans-serif",
                fontSize: touchMode ? 8 : 9,
                fontWeight: 800,
                letterSpacing: 1.2,
                color: invincibilitySec <= 5.0 ? '#ff6622' : '#38bdf8',
                textTransform: 'uppercase',
              }}
            >
              {invincibilitySec <= 5.0 ? t('hud_shield_ending') : t('hud_shield_active')}
            </span>
            <span
              style={{
                fontFamily: "'Orbitron', sans-serif",
                fontSize: touchMode ? 11 : 13,
                fontWeight: 800,
                color: '#ffffff',
                minWidth: 30,
              }}
            >
              {Math.ceil(invincibilitySec)}s
            </span>
            <div
              style={{
                width: touchMode ? 50 : 75,
                height: touchMode ? 5 : 6,
                borderRadius: 3,
                background: 'rgba(255, 255, 255, 0.12)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${Math.min(100, Math.max(0, (invincibilitySec / 30) * 100))}%`,
                  height: '100%',
                  background: invincibilitySec <= 5.0
                    ? 'linear-gradient(90deg, #ff4400, #ff8800)'
                    : 'linear-gradient(90deg, #00b4d8, #00f2fe)',
                  borderRadius: 3,
                  transition: 'width 0.1s linear',
                  boxShadow: invincibilitySec <= 5.0 ? '0 0 8px #ff4400' : '0 0 8px #00f2fe',
                }}
              />
            </div>
          </div>
        )}
      </div>
    )}

      {/* Destroyed */}
      {destroyed && (
        <div
          style={{
            ...alertBannerStyle,
            top: '42%',
            padding: touchMode ? '8px 18px' : '12px 28px',
            animation: 'hudFlash 0.35s ease-in-out infinite alternate',
          }}
        >
          <span style={{ fontSize: touchMode ? 20 : 28 }}>💀</span>
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
              {t('hud_destroyed_title')}
            </span>
            <span style={{ fontFamily: "'Inter', sans-serif", fontSize: touchMode ? 9 : 11, color: 'rgba(255,255,255,0.85)' }}>
              {t('hud_destroyed_sub')}
            </span>
          </div>
        </div>
      )}

      {/* Controls hint - ONLY shown in desktop keyboard mode when toggled visible (hidden by default, toggle with [H]) */}
      {!touchMode && showControls && (
        <div
          style={{
            position: 'absolute',
            bottom: 24,
            left: 240,
            color: 'rgba(255,255,255,0.45)',
            fontSize: 11,
            fontFamily: "'Inter', sans-serif",
            lineHeight: 1.8,
            pointerEvents: 'auto',
            userSelect: 'none',
            background: 'rgba(10, 16, 28, 0.85)',
            padding: '10px 16px',
            borderRadius: 12,
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            border: '1px solid rgba(0, 212, 255, 0.25)',
            boxShadow: '0 8px 28px rgba(0, 0, 0, 0.6)',
            zIndex: 40,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 8,
              paddingBottom: 6,
              borderBottom: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <span
              style={{
                fontFamily: "'Orbitron', sans-serif",
                fontSize: 10,
                fontWeight: 900,
                color: '#00d4ff',
                letterSpacing: 1.5,
              }}
            >
              {t('hud_controls_title')}
            </span>
            {onToggleControls && (
              <button
                onClick={onToggleControls}
                style={{
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  borderRadius: 6,
                  color: '#94a3b8',
                  cursor: 'pointer',
                  fontSize: 10,
                  padding: '2px 6px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  lineHeight: 1,
                }}
                title={t('hud_controls_hide_hint')}
              >
                <span>✕</span>
                <span style={{ fontSize: 9, opacity: 0.8 }}>[H]</span>
              </button>
            )}
          </div>
          {isPlane ? (
            <>
              <div><strong style={{ color: '#00d4ff' }}>Z / W</strong> — {t('hud_ctl_throttle_up')}</div>
              <div><strong style={{ color: '#00d4ff' }}>S</strong> — {t('hud_ctl_throttle_down')}</div>
              <div><strong style={{ color: '#00d4ff' }}>↓</strong> — {t('hud_ctl_pull_up')}</div>
              <div><strong style={{ color: '#00d4ff' }}>↑</strong> — {t('hud_ctl_push_down')}</div>
              <div><strong style={{ color: '#00d4ff' }}>← / → {t('hud_key_or')} Q / D</strong> — {t('hud_ctl_roll')}</div>
              <div><strong style={{ color: '#00d4ff' }}>ESPACE</strong> — {t('hud_ctl_brakes')}</div>
              <div><strong style={{ color: '#fbbf24' }}>F / {t('hud_ctl_leftclick')}</strong> — {t('hud_ctl_gun')}</div>
              <div><strong style={{ color: '#38bdf8' }}>P</strong> — {t('hud_ctl_back_to_car')}</div>
              <div><strong style={{ color: '#38bdf8' }}>{t('hud_key_shift')} + P</strong> — {t('hud_ctl_retakeoff')}</div>
              <div><strong style={{ color: '#00d4ff' }}>M</strong> — {t('hud_ctl_map')}</div>
            </>
          ) : (
            <>
              <div><strong style={{ color: '#00d4ff' }}>W / Z / ↑</strong> — {t('hud_ctl_accelerate')}</div>
              <div><strong style={{ color: '#00d4ff' }}>S / ↓</strong> — {t('hud_ctl_brake')}</div>
              <div><strong style={{ color: '#00d4ff' }}>A / Q / ←</strong> — {t('hud_ctl_left')}</div>
              <div><strong style={{ color: '#00d4ff' }}>D / →</strong> — {t('hud_ctl_right')}</div>
              <div><strong style={{ color: '#00d4ff' }}>ESPACE</strong> — {t('hud_ctl_handbrake')}</div>
              <div><strong style={{ color: '#00f2fe' }}>{t('hud_key_shift')}</strong> — {t('hud_ctl_nitro')}</div>
              <div><strong style={{ color: '#00d4ff' }}>M</strong> — {t('hud_ctl_map')}</div>
              <div><strong style={{ color: '#38bdf8' }}>P</strong> — {t('hud_ctl_take_plane')}</div>
              <div><strong style={{ color: '#38bdf8' }}>T</strong> — {t('hud_ctl_travel')}</div>
            </>
          )}
        </div>
      )}
    </>
  )
}
