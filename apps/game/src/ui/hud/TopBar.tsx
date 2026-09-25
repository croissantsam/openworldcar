import React from 'react'
import type { GameEngine } from '../../game/GameEngine.js'
import type { StreetInfo } from '../../world/ChunkManager.js'
import type { WorldDestination } from '../../world/destinations.js'
import { useLocale } from '../../i18n/index.js'
import { getOfflineTrialRuns } from '../../lib/connectivity.js'

interface TopBarProps {
  engine: GameEngine
  onlineMode: boolean
  playerCount: number
  isNetworkConnected: boolean
  networkPing: number
  touchMode: boolean
  isGuest: boolean
  authLabel: string
  street: StreetInfo | null
  district: string
  currentDest: WorldDestination
  onOpenMenu: () => void
  onOpenAuth: () => void
}

/** Top edge: players badge, account badge, menu button, street badge. */
export const TopBar: React.FC<TopBarProps> = ({
  engine,
  onlineMode,
  playerCount,
  isNetworkConnected,
  networkPing,
  touchMode,
  isGuest,
  authLabel,
  street,
  district,
  currentDest,
  onOpenMenu,
  onOpenAuth,
}) => {
  const { t } = useLocale()
  const isMobileLandscape = touchMode
  return (
    <>
      {/* Sleek Top-Left Connected Players Badge — doubles as the online/offline toggle */}
      <button
        onClick={(e) => {
          e.currentTarget.blur()
          engine.setOnlineMode(!onlineMode)
        }}
        onMouseDown={(e) => e.preventDefault()}
        tabIndex={-1}
        style={{
          position: 'absolute',
          top: isMobileLandscape ? 'max(8px, env(safe-area-inset-top, 8px))' : 16,
          left: isMobileLandscape ? 'max(14px, env(safe-area-inset-left, 14px))' : 20,
          display: 'flex',
          alignItems: 'center',
          gap: isMobileLandscape ? 6 : 8,
          background: 'rgba(10, 16, 28, 0.75)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: isNetworkConnected
            ? '1px solid rgba(0, 212, 255, 0.35)'
            : '1px solid rgba(239, 68, 68, 0.4)',
          borderRadius: 12,
          padding: isMobileLandscape ? '4px 10px' : '6px 14px',
          height: isMobileLandscape ? 34 : 40,
          boxSizing: 'border-box',
          userSelect: 'none',
          pointerEvents: 'auto',
          zIndex: 60,
          boxShadow: isNetworkConnected
            ? '0 4px 16px rgba(0, 0, 0, 0.4), 0 0 12px rgba(0, 212, 255, 0.15)'
            : '0 4px 16px rgba(0, 0, 0, 0.4), 0 0 10px rgba(239, 68, 68, 0.2)',
          transition: 'border-color 0.3s ease, box-shadow 0.3s ease',
          cursor: 'pointer',
        }}
        title={
          onlineMode
            ? isNetworkConnected
              ? t('hud_net_title_online', {
                count: playerCount,
                players: t('hud_net_players', undefined, playerCount),
                ping: networkPing >= 0 ? ` (${networkPing}ms)` : '',
              })
              : t('hud_net_title_reconnect')
            : t('hud_net_title_offline', {
              pending:
                getOfflineTrialRuns().length > 0
                  ? t('hud_net_pending', { count: getOfflineTrialRuns().length })
                  : '',
            })
        }
      >
        {/* Animated Live Status Dot */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div
            style={{
              width: isMobileLandscape ? 7 : 8,
              height: isMobileLandscape ? 7 : 8,
              borderRadius: '50%',
              backgroundColor: isNetworkConnected ? '#10b981' : '#ef4444',
              boxShadow: isNetworkConnected
                ? '0 0 8px #10b981'
                : '0 0 6px #ef4444',
            }}
          />
          {isNetworkConnected && (
            <div
              style={{
                position: 'absolute',
                width: isMobileLandscape ? 13 : 16,
                height: isMobileLandscape ? 13 : 16,
                borderRadius: '50%',
                border: '1.5px solid rgba(16, 185, 129, 0.6)',
                animation: 'pulseRing 2s cubic-bezier(0, 0, 0.2, 1) infinite',
                pointerEvents: 'none',
              }}
            />
          )}
        </div>

        {/* Players Group SVG Icon */}
        <svg
          width={isMobileLandscape ? 13 : 15}
          height={isMobileLandscape ? 13 : 15}
          viewBox="0 0 24 24"
          fill="none"
          stroke={isNetworkConnected ? '#00d4ff' : '#94a3b8'}
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ flexShrink: 0 }}
        >
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>

        {/* Player Count & Label */}
        {isNetworkConnected ? (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
            <span
              style={{
                fontFamily: "'Orbitron', sans-serif",
                fontSize: isMobileLandscape ? 13 : 15,
                fontWeight: 900,
                color: '#ffffff',
                lineHeight: 1,
                textShadow: '0 0 10px rgba(0, 212, 255, 0.5)',
              }}
            >
              {playerCount}
            </span>
          </div>
        ) : (
          <span
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: isMobileLandscape ? 8 : 10,
              fontWeight: 700,
              color: '#f87171',
              letterSpacing: 1,
              lineHeight: 1,
              textTransform: 'uppercase',
            }}
          >
            {t('hud_offline')}
          </span>
        )}

        {/* Latency / Ping Indicator (when online & available) */}
        {isNetworkConnected && networkPing >= 0 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              borderLeft: '1px solid rgba(255, 255, 255, 0.12)',
              paddingLeft: isMobileLandscape ? 5 : 8,
              marginLeft: 2,
            }}
          >
            <span
              style={{
                fontFamily: "'Orbitron', sans-serif",
                fontSize: isMobileLandscape ? 8 : 10,
                fontWeight: 700,
                color:
                  networkPing < 80
                    ? '#34d399'
                    : networkPing < 150
                      ? '#fbbf24'
                      : '#f87171',
                lineHeight: 1,
              }}
            >
              {networkPing}ms
            </span>
          </div>
        )}
      </button>

      {/* Account session badge (guest or pilot) — opens the account modal */}
      <button
        onClick={onOpenAuth}
        style={{
          position: 'absolute',
          top: isMobileLandscape ? 'max(48px, calc(env(safe-area-inset-top, 0px) + 48px))' : 64,
          left: isMobileLandscape ? 'max(14px, env(safe-area-inset-left, 14px))' : 20,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          background: 'rgba(10, 16, 28, 0.75)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: isGuest ? '1px solid rgba(251, 191, 36, 0.4)' : '1px solid rgba(52, 211, 153, 0.4)',
          borderRadius: 12,
          padding: isMobileLandscape ? '3px 10px' : '5px 12px',
          cursor: 'pointer',
          userSelect: 'none',
          zIndex: 60,
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4)',
        }}
        title={isGuest ? t('hud_account_guest_title') : t('hud_account_pilot_title')}
      >
        <span style={{ fontSize: isMobileLandscape ? 10 : 12 }}>{isGuest ? '👤' : '✅'}</span>
        <span
          style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: isMobileLandscape ? 8 : 10,
            fontWeight: 700,
            color: isGuest ? '#fbbf24' : '#6ee7b7',
            letterSpacing: 1,
            lineHeight: 1,
            textTransform: 'uppercase',
            maxWidth: 130,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {authLabel}
        </span>
      </button>

      {/* Sleek Top-Right Menu Button */}
      <button
        onClick={onOpenMenu}
        style={{
          position: 'absolute',
          top: isMobileLandscape ? 'max(8px, env(safe-area-inset-top, 8px))' : 16,
          right: isMobileLandscape ? 'max(14px, env(safe-area-inset-right, 14px))' : 20,
          width: isMobileLandscape ? 34 : 40,
          height: isMobileLandscape ? 34 : 40,
          borderRadius: 10,
          background: 'rgba(10, 16, 28, 0.75)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          border: '1px solid rgba(0, 212, 255, 0.35)',
          color: '#00d4ff',
          fontSize: isMobileLandscape ? 16 : 18,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          zIndex: 60,
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4)',
        }}
        title={t('hud_menu_button_title')}
      >
        ☰
      </button>

      {/* Minimalist Top Street Badge */}
      <div
        style={{
          position: 'absolute',
          top: isMobileLandscape ? 'max(8px, env(safe-area-inset-top, 8px))' : 16,
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(10, 16, 28, 0.72)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: '1px solid rgba(0, 212, 255, 0.25)',
          borderRadius: 20,
          padding: isMobileLandscape ? '4px 12px' : '6px 18px',
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          pointerEvents: 'none',
          userSelect: 'none',
          zIndex: 20,
          maxWidth: isMobileLandscape ? 'calc(100vw - 320px)' : '70vw',
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.35)',
        }}
      >
        <span style={{ fontSize: isMobileLandscape ? 11 : 13 }}>📍</span>
        <span
          style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: isMobileLandscape ? 12 : 14,
            fontWeight: 700,
            color: '#ffffff',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {street ? (
            <>
              {street.name}
              <span style={{ color: 'rgba(148, 163, 184, 0.9)', fontWeight: 600 }}>
                {'  ·  '}
                {district}
              </span>
            </>
          ) : (
            `${currentDest.flag} ${district}`
          )}
        </span>
      </div>
    </>
  )
}
