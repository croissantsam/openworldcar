import { useEffect, useRef, useState } from 'react'
import { worldToGeo } from '@world-drive/math'
import type { GameEngine } from '../game/GameEngine.js'
import type { StreetInfo } from '../world/ChunkManager.js'
import { getDistrictLabel, type WorldDestination } from '../world/destinations.js'
import { Minimap } from './Minimap.js'
import { WorldTravelModal } from './WorldTravelModal.js'
import { AddressSearchBar } from './AddressSearchBar.js'
import { TouchControls } from './TouchControls.js'
import { OrientationPrompt } from './OrientationPrompt.js'

interface HUDProps {
  engine: GameEngine
}

const KMH = 3.6

export const HUD: React.FC<HUDProps> = ({ engine }) => {
  const [speed, setSpeed] = useState(0)
  const [gear, setGear] = useState('D')
  const [street, setStreet] = useState<StreetInfo | null>(() => engine.getCurrentStreet())
  const [currentDest, setCurrentDest] = useState<WorldDestination>(() => engine.currentDestination)
  const currentDestRef = useRef<WorldDestination>(engine.currentDestination)
  const [district, setDistrict] = useState<string>(() =>
    getDistrictLabel(worldToGeo(engine.playerCar.getPosition()), engine.currentDestination)
  )
  const [travelOpen, setTravelOpen] = useState(false)
  const [searchBarOpen, setSearchBarOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [mapExpanded, setMapExpanded] = useState(false)
  const [isWarping, setIsWarping] = useState(false)
  const [isGenerating, setIsGenerating] = useState(() => engine.chunkManager.isGenerating)
  const [invincibilitySec, setInvincibilitySec] = useState<number>(() =>
    engine.getInvincibilityRemaining()
  )
  const [playerCount, setPlayerCount] = useState<number>(() => engine.getConnectedPlayerCount())
  const [isNetworkConnected, setIsNetworkConnected] = useState<boolean>(() => engine.isNetworkConnected())
  const [networkPing, setNetworkPing] = useState<number>(() => engine.getNetworkLatency())
  const lastSeenRef = useRef<number>(Date.now())

  // Touch / Mobile mode (Joystick on left + Frein on right)
  const [touchMode, setTouchMode] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return (
      ('ontouchstart' in window || navigator.maxTouchPoints > 0) &&
      window.matchMedia('(pointer: coarse)').matches
    )
  })
  const [, setHasTouch] = useState(false)

  useEffect(() => {
    const handleResize = () => {
      const touch =
        ('ontouchstart' in window || navigator.maxTouchPoints > 0) &&
        window.matchMedia('(pointer: coarse)').matches
      setHasTouch(touch)
    }

    handleResize()
    window.addEventListener('resize', handleResize)
    window.addEventListener('orientationchange', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('orientationchange', handleResize)
    }
  }, [])

  const isMobileLandscape = touchMode

  useEffect(() => {
    currentDestRef.current = currentDest
  }, [currentDest])

  useEffect(() => {
    // Initial fetch
    const initial = engine.getCurrentStreet()
    if (initial) {
      setStreet(initial)
      lastSeenRef.current = Date.now()
    }

    engine.onDestinationChanged = (newDest) => {
      setCurrentDest(newDest)
      currentDestRef.current = newDest
      const pos = engine.playerCar.getPosition()
      const currentGeo = worldToGeo(pos)
      setDistrict(getDistrictLabel(currentGeo, newDest))
    }

    engine.onInvincibilityChanged = () => {
      setInvincibilitySec(engine.getInvincibilityRemaining())
    }

    engine.chunkManager.onGeneratingStatusChange = (gen) => {
      setIsGenerating(gen)
    }

    const onKey = (e: KeyboardEvent) => {
      if (
        document.activeElement &&
        (document.activeElement.tagName === 'INPUT' ||
          document.activeElement.tagName === 'TEXTAREA')
      ) {
        if (e.key === 'Escape') {
          setSearchBarOpen(false)
          setTravelOpen(false)
        }
        return
      }

      if (e.key === 't' || e.key === 'T') {
        setTravelOpen((v) => !v)
      } else if (e.key === '/' || e.key === 'f' || e.key === 'F') {
        e.preventDefault()
        setSearchBarOpen((v) => !v)
      } else if (e.key === 'Escape') {
        setTravelOpen(false)
        setSearchBarOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)

    const id = setInterval(() => {
      const fwd = engine.playerCar.getForwardSpeed()
      const absSpeed = Math.abs(fwd)
      setSpeed(Math.round(absSpeed * KMH))
      if (fwd < -0.3) {
        setGear('R')
      } else if (absSpeed < 0.2) {
        setGear('P')
      } else {
        setGear('D')
      }

      // Query current street and dynamic district from active chunks
      const pos = engine.playerCar.getPosition()
      const currentGeo = worldToGeo(pos)
      setDistrict(getDistrictLabel(currentGeo, currentDestRef.current))

      const current = engine.getCurrentStreet()
      if (current) {
        setStreet(current)
        lastSeenRef.current = Date.now()
      } else {
        // Hysteresis: retain last known street for 2.5s when crossing intersections or open areas
        if (Date.now() - lastSeenRef.current > 2500) {
          setStreet(null)
        }
      }

      setInvincibilitySec(engine.getInvincibilityRemaining())
      setPlayerCount(engine.getConnectedPlayerCount())
      setIsNetworkConnected(engine.isNetworkConnected())
      setNetworkPing(engine.getNetworkLatency())
    }, 100) // 10 Hz

    return () => {
      clearInterval(id)
      window.removeEventListener('keydown', onKey)
    }
  }, [engine, travelOpen])

  const handleTravelTo = (dest: WorldDestination) => {
    setIsWarping(true)
    setCurrentDest(dest)
    currentDestRef.current = dest
    engine.travelTo(dest)
    setTimeout(() => {
      setIsWarping(false)
    }, 750)
  }

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

      {/* Controls hint - ONLY shown in desktop keyboard mode, offset to right of minimap */}
      {!touchMode && (
        <div
          style={{
            position: 'absolute',
            bottom: 24,
            left: 240,
            color: 'rgba(255,255,255,0.45)',
            fontSize: 11,
            fontFamily: "'Inter', sans-serif",
            lineHeight: 1.8,
            pointerEvents: 'none',
            userSelect: 'none',
            background: 'rgba(0,0,0,0.4)',
            padding: '8px 14px',
            borderRadius: 8,
            backdropFilter: 'blur(6px)',
            border: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <div><strong style={{ color: '#00d4ff' }}>W / Z / ↑</strong> — Accélérer</div>
          <div><strong style={{ color: '#00d4ff' }}>S / ↓</strong> — Frein / Marche arrière</div>
          <div><strong style={{ color: '#00d4ff' }}>A / Q / ←</strong> — Tourner à gauche</div>
          <div><strong style={{ color: '#00d4ff' }}>D / →</strong> — Tourner à droite</div>
          <div><strong style={{ color: '#00d4ff' }}>ESPACE</strong> — Frein à main</div>
          <div><strong style={{ color: '#00d4ff' }}>M</strong> — Carte GPS</div>
          <div><strong style={{ color: '#38bdf8' }}>T</strong> — 🌍 Voyager dans le monde</div>
        </div>
      )}

      {/* Sleek Top-Left Connected Players Badge */}
      <div
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
        }}
        title={
          isNetworkConnected
            ? `${playerCount} ${playerCount > 1 ? 'joueurs connectés' : 'joueur connecté'} au serveur${
                networkPing >= 0 ? ` (${networkPing}ms)` : ''
              }`
            : 'Déconnecté du serveur multijoueur'
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
            <span
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: isMobileLandscape ? 8 : 10,
                fontWeight: 700,
                color: '#94a3b8',
                letterSpacing: 1,
                lineHeight: 1,
                textTransform: 'uppercase',
              }}
            >
              {isMobileLandscape
                ? playerCount > 1
                  ? 'JOUEURS'
                  : 'JOUEUR'
                : playerCount > 1
                ? 'JOUEURS CONNECTÉS'
                : 'JOUEUR CONNECTÉ'}
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
            HORS-LIGNE
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
      </div>

      {/* Sleek Top-Right Menu Button */}
      <button
        onClick={() => setMenuOpen(true)}
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
        title="Menu du jeu (Voyager, Chercher, Débloquer)"
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
          {street ? street.name : `${currentDest.flag} ${currentDest.city}`}
        </span>
        {street?.maxSpeed && (
          <span
            style={{
              fontSize: isMobileLandscape ? 8 : 9,
              fontWeight: 900,
              color: '#111',
              background: '#fff',
              borderRadius: '50%',
              width: isMobileLandscape ? 18 : 20,
              height: isMobileLandscape ? 18 : 20,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1.5px solid #e02424',
              marginLeft: 2,
              flexShrink: 0,
            }}
          >
            {street.maxSpeed}
          </span>
        )}
      </div>

      {/* Quick Menu Overlay */}
      {menuOpen && (
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
          onClick={() => setMenuOpen(false)}
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
                MENU DU JEU
              </span>
              <button
                onClick={() => setMenuOpen(false)}
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

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {/* 1. Voyage mondial */}
              <button
                onClick={() => {
                  setMenuOpen(false)
                  setTravelOpen(true)
                }}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  gap: 3,
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(0, 212, 255, 0.3)',
                  borderRadius: 12,
                  padding: '10px 12px',
                  cursor: 'pointer',
                  color: '#ffffff',
                  textAlign: 'left',
                }}
              >
                <span style={{ fontSize: 20 }}>🌍</span>
                <span style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 10, fontWeight: 800, color: '#00d4ff' }}>Voyager</span>
                <span style={{ fontSize: 8, color: '#94a3b8' }}>Changer de ville</span>
              </button>

              {/* 2. Recherche adresse */}
              <button
                onClick={() => {
                  setMenuOpen(false)
                  setSearchBarOpen(true)
                }}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  gap: 3,
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(0, 212, 255, 0.3)',
                  borderRadius: 12,
                  padding: '10px 12px',
                  cursor: 'pointer',
                  color: '#ffffff',
                  textAlign: 'left',
                }}
              >
                <span style={{ fontSize: 20 }}>🔍</span>
                <span style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 10, fontWeight: 800, color: '#00d4ff' }}>Rechercher</span>
                <span style={{ fontSize: 8, color: '#94a3b8' }}>Rue ou monument</span>
              </button>

              {/* 3. Débloquer véhicule */}
              <button
                onClick={() => {
                  engine.respawnPlayer()
                  setMenuOpen(false)
                }}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  gap: 3,
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(245, 158, 11, 0.35)',
                  borderRadius: 12,
                  padding: '10px 12px',
                  cursor: 'pointer',
                  color: '#ffffff',
                  textAlign: 'left',
                }}
              >
                <span style={{ fontSize: 20 }}>🔄</span>
                <span style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 10, fontWeight: 800, color: '#fbbf24' }}>Débloquer</span>
                <span style={{ fontSize: 8, color: '#94a3b8' }}>Recentrer voiture</span>
              </button>

              {/* 4. Carte GPS */}
              <button
                onClick={() => {
                  setMenuOpen(false)
                  setMapExpanded(true)
                }}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  gap: 3,
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(0, 212, 255, 0.3)',
                  borderRadius: 12,
                  padding: '10px 12px',
                  cursor: 'pointer',
                  color: '#ffffff',
                  textAlign: 'left',
                }}
              >
                <span style={{ fontSize: 20 }}>🗺️</span>
                <span style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 10, fontWeight: 800, color: '#00d4ff' }}>Carte GPS</span>
                <span style={{ fontSize: 8, color: '#94a3b8' }}>Vue aérienne</span>
              </button>
            </div>

            {/* Toggle tactile / clavier */}
            <button
              onClick={() => setTouchMode((v) => !v)}
              style={{
                marginTop: 4,
                background: 'rgba(0, 212, 255, 0.1)',
                border: '1px solid rgba(0, 212, 255, 0.4)',
                borderRadius: 10,
                padding: '8px 12px',
                color: '#00d4ff',
                fontFamily: "'Orbitron', sans-serif",
                fontSize: 10,
                fontWeight: 800,
                letterSpacing: 1,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
              }}
            >
              <span>{touchMode ? '🎮 COMMANDES TACTILES ACTIVES' : '⌨️ COMMANDES CLAVIER ACTIVES'}</span>
            </button>
          </div>
        </div>
      )}

      {/* 30s Spawn Invincibility Banner */}
      {invincibilitySec > 0 && (
        <div
          style={{
            position: 'absolute',
            top: isMobileLandscape
              ? searchBarOpen
                ? 88
                : isGenerating
                ? 72
                : 46
              : searchBarOpen
              ? 134
              : isGenerating
              ? 114
              : 76,
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            alignItems: 'center',
            gap: isMobileLandscape ? 8 : 12,
            background: invincibilitySec <= 5.0
              ? 'rgba(28, 10, 8, 0.92)'
              : 'rgba(8, 16, 28, 0.90)',
            border: invincibilitySec <= 5.0
              ? '1px solid rgba(255, 68, 0, 0.8)'
              : '1px solid rgba(0, 229, 255, 0.55)',
            boxShadow: invincibilitySec <= 5.0
              ? '0 8px 30px rgba(0,0,0,0.6), 0 0 22px rgba(255, 68, 0, 0.45)'
              : '0 8px 30px rgba(0,0,0,0.6), 0 0 20px rgba(0, 229, 255, 0.25)',
            backdropFilter: 'blur(16px)',
            borderRadius: isMobileLandscape ? 16 : 22,
            padding: isMobileLandscape ? '4px 12px' : '7px 18px',
            userSelect: 'none',
            zIndex: 10,
            transition: 'top 0.2s ease, border-color 0.3s ease, background 0.3s ease',
          }}
        >
          {/* Animated Shield Icon */}
          <div
            style={{
              width: isMobileLandscape ? 22 : 28,
              height: isMobileLandscape ? 22 : 28,
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
            <svg width={isMobileLandscape ? 12 : 15} height={isMobileLandscape ? 12 : 15} viewBox="0 0 24 24" fill="none">
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

          {/* Text Details & Progress */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <div
              style={{
                fontFamily: "'Orbitron', sans-serif",
                fontSize: isMobileLandscape ? 8 : 9,
                fontWeight: 800,
                letterSpacing: 1.2,
                color: invincibilitySec <= 5.0 ? '#ff6622' : '#38bdf8',
                textTransform: 'uppercase',
              }}
            >
              {invincibilitySec <= 5.0 ? '⚠️ Fin bouclier' : '🛡️ Invincibilité'}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: isMobileLandscape ? 6 : 10 }}>
              <span
                style={{
                  fontFamily: "'Orbitron', sans-serif",
                  fontSize: isMobileLandscape ? 12 : 14,
                  fontWeight: 800,
                  color: '#ffffff',
                  minWidth: isMobileLandscape ? 28 : 36,
                }}
              >
                {Math.ceil(invincibilitySec)}s
              </span>
              {/* Energy progress bar */}
              <div
                style={{
                  width: isMobileLandscape ? 50 : 75,
                  height: isMobileLandscape ? 5 : 6,
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
              {!isMobileLandscape && (
                <span
                  style={{
                    fontFamily: "'Inter', sans-serif",
                    fontSize: 10,
                    color: 'rgba(255, 255, 255, 0.7)',
                    letterSpacing: 0.2,
                  }}
                >
                  Pass-through actif entre véhicules
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Quick Address Search Overlay */}
      {searchBarOpen && (
        <div
          style={{
            position: 'absolute',
            top: isMobileLandscape ? 48 : 76,
            left: '50%',
            transform: 'translateX(-50%)',
            width: '92%',
            maxWidth: isMobileLandscape ? '460px' : '560px',
            zIndex: 100,
          }}
        >
          <AddressSearchBar
            autoFocus
            compact
            placeholder="Tapez une adresse, une rue ou un monument (ex: 10 rue de la Paix)..."
            onSelectAddress={(dest) => {
              handleTravelTo(dest)
              setSearchBarOpen(false)
            }}
            onClose={() => setSearchBarOpen(false)}
          />
        </div>
      )}

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
          <span>GÉNÉRATION DU MONDE EN DIRECT (OSM)…</span>
        </div>
      )}

      {/* GPS Radar Minimap */}
      <Minimap
        engine={engine}
        isMobileLandscape={isMobileLandscape}
        externalExpanded={mapExpanded}
        onToggleExpanded={() => setMapExpanded((v) => !v)}
      />

      {/* Mobile Touch Controls Overlay (Joystick + Brake) */}
      <TouchControls engine={engine} visible={touchMode} />

      {/* Mobile Orientation Prompt (when in portrait mode) */}
      <OrientationPrompt />

      {/* World Travel Modal */}
      <WorldTravelModal
        isOpen={travelOpen}
        onClose={() => setTravelOpen(false)}
        currentDestinationId={currentDest.id}
        onSelectDestination={handleTravelTo}
      />

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
            TÉLÉPORTATION VERS {currentDest.city.toUpperCase()}…
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
            {currentDest.name}
          </div>
        </div>
      )}
      {/* Keyframe animations for HUD elements */}
      <style>{`
        @keyframes pulseRing {
          0% { transform: scale(0.9); opacity: 0.8; }
          70% { transform: scale(2.0); opacity: 0; }
          100% { transform: scale(2.0); opacity: 0; }
        }
      `}</style>
    </>
  )
}
