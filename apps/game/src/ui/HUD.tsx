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
  const [mapExpanded, setMapExpanded] = useState(false)
  const [isWarping, setIsWarping] = useState(false)
  const [isGenerating, setIsGenerating] = useState(() => engine.chunkManager.isGenerating)
  const [invincibilitySec, setInvincibilitySec] = useState<number>(() =>
    engine.getInvincibilityRemaining()
  )
  const lastSeenRef = useRef<number>(Date.now())

  // Touch / Mobile mode (Joystick on left + Frein on right)
  const [touchMode, setTouchMode] = useState<boolean>(true)
  const [, setHasTouch] = useState(false)

  useEffect(() => {
    const handleResize = () => {
      const touch =
        'ontouchstart' in window ||
        navigator.maxTouchPoints > 0 ||
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
      {/* Speedometer - floats neatly above the FREIN button when in mobile/touch mode */}
      <div
        style={{
          position: 'absolute',
          bottom: touchMode ? 'max(116px, env(safe-area-inset-bottom, 116px))' : 32,
          right: touchMode ? 'max(24px, env(safe-area-inset-right, 24px))' : 40,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          pointerEvents: 'none',
          userSelect: 'none',
          zIndex: 35,
        }}
      >
        {/* Speed number */}
        <div
          style={{
            fontFamily: "'Orbitron', sans-serif",
            fontSize: touchMode ? 38 : 72,
            fontWeight: 900,
            color: '#fff',
            lineHeight: 1,
            textShadow: '0 0 25px rgba(0, 212, 255, 0.6)',
          }}
        >
          {speed}
        </div>
        <div
          style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: touchMode ? 10 : 13,
            color: '#00d4ff',
            letterSpacing: touchMode ? 2 : 3,
            marginTop: -2,
          }}
        >
          KM/H
        </div>

        {/* Gear */}
        <div
          style={{
            marginTop: 4,
            background: 'rgba(0,0,0,0.5)',
            border: '1px solid rgba(0,212,255,0.3)',
            borderRadius: 4,
            padding: touchMode ? '1px 8px' : '2px 12px',
            fontFamily: "'Orbitron', sans-serif",
            fontSize: touchMode ? 12 : 16,
            color: '#00d4ff',
            letterSpacing: 2,
          }}
        >
          {gear}
        </div>
      </div>

      {/* Controls hint (bottom-left) - ONLY shown in keyboard desktop mode, never over the joystick */}
      {!touchMode && (
        <div
          style={{
            position: 'absolute',
            bottom: 24,
            left: 24,
            color: 'rgba(255,255,255,0.45)',
            fontSize: 11,
            fontFamily: "'Inter', sans-serif",
            lineHeight: 2,
            pointerEvents: 'none',
            userSelect: 'none',
            background: 'rgba(0,0,0,0.3)',
            padding: '8px 12px',
            borderRadius: 6,
            backdropFilter: 'blur(4px)',
          }}
        >
          <div><strong style={{ color: '#00d4ff' }}>W / Z / ↑</strong> — Accelerate</div>
          <div><strong style={{ color: '#00d4ff' }}>S / ↓</strong> — Brake / Reverse</div>
          <div><strong style={{ color: '#00d4ff' }}>A / Q / ←</strong> — Steer Left</div>
          <div><strong style={{ color: '#00d4ff' }}>D / →</strong> — Steer Right</div>
          <div><strong style={{ color: '#00d4ff' }}>SPACE</strong> — Handbrake</div>
          <div><strong style={{ color: '#00d4ff' }}>M</strong> — Carte / GPS</div>
          <div><strong style={{ color: '#38bdf8' }}>T</strong> — 🌍 Voyager dans le monde</div>
          <div><strong style={{ color: '#00d4ff' }}>`</strong> — Debug Overlay</div>
        </div>
      )}

      {/* Desktop Mode Button to re-enable mobile joystick anytime */}
      {!touchMode && (
        <button
          onClick={() => setTouchMode(true)}
          style={{
            position: 'absolute',
            top: 14,
            right: 14,
            background: 'rgba(8, 14, 26, 0.85)',
            border: '1px solid rgba(0, 212, 255, 0.4)',
            borderRadius: 10,
            padding: '6px 12px',
            color: '#00d4ff',
            fontFamily: "'Orbitron', sans-serif",
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: 1,
            cursor: 'pointer',
            zIndex: 60,
            backdropFilter: 'blur(8px)',
            boxShadow: '0 4px 14px rgba(0, 0, 0, 0.4)',
          }}
          title="Activer le joystick et les commandes tactiles mobiles"
        >
          🎮 JOYSTICK MOBILE
        </button>
      )}

      {/* Top Street Navigation Banner */}
      <div
        style={{
          position: 'absolute',
          top: isMobileLandscape ? 'max(8px, env(safe-area-inset-top, 8px))' : 20,
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          alignItems: 'center',
          gap: isMobileLandscape ? 8 : 14,
          background: 'rgba(8, 12, 22, 0.88)',
          border: '1px solid rgba(0, 212, 255, 0.35)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5), 0 0 15px rgba(0, 212, 255, 0.15)',
          backdropFilter: 'blur(12px)',
          borderRadius: isMobileLandscape ? 16 : 24,
          padding: isMobileLandscape ? '4px 10px' : '8px 16px 8px 20px',
          userSelect: 'none',
          zIndex: 10,
          maxWidth: '92vw',
        }}
      >
        {/* Navigation Arrow Icon */}
        <div
          style={{
            width: isMobileLandscape ? 24 : 30,
            height: isMobileLandscape ? 24 : 30,
            borderRadius: '50%',
            background: 'rgba(0, 212, 255, 0.15)',
            border: '1px solid rgba(0, 212, 255, 0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            boxShadow: '0 0 10px rgba(0, 212, 255, 0.3)',
          }}
        >
          <svg width={isMobileLandscape ? 12 : 15} height={isMobileLandscape ? 12 : 15} viewBox="0 0 24 24" fill="none">
            <path
              d="M12 2L19 21L12 17L5 21L12 2Z"
              fill="#00d4ff"
              stroke="#00d4ff"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        {/* Street & Area Details */}
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: isMobileLandscape ? 110 : 160 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: isMobileLandscape ? 8 : 9,
              fontFamily: "'Orbitron', sans-serif",
              letterSpacing: 1.5,
              color: 'rgba(0, 212, 255, 0.85)',
              textTransform: 'uppercase',
            }}
          >
            <span>{currentDest.flag} {district.toUpperCase()}</span>
            <span style={{ opacity: 0.4 }}>•</span>
            <span>{street?.highway ? street.highway.toUpperCase() : 'NAVIGATION'}</span>
          </div>

          <div
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: isMobileLandscape ? 13 : 16,
              fontWeight: 700,
              color: '#ffffff',
              letterSpacing: 0.5,
              marginTop: 1,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: isMobileLandscape ? '180px' : '280px',
              textShadow: '0 0 12px rgba(255, 255, 255, 0.2)',
            }}
          >
            {street ? street.name : 'Navigation urbaine'}
          </div>
        </div>

        {/* Speed Limit Badge */}
        <div
          style={{
            width: isMobileLandscape ? 22 : 26,
            height: isMobileLandscape ? 22 : 26,
            borderRadius: '50%',
            background: '#ffffff',
            border: isMobileLandscape ? '2px solid #e02424' : '2.5px solid #e02424',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: "'Inter', sans-serif",
            fontSize: isMobileLandscape ? 9 : 10,
            fontWeight: 900,
            color: '#111',
            boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
            flexShrink: 0,
          }}
          title={street?.maxSpeed ? `Vitesse max: ${street.maxSpeed} km/h` : 'Zone 50'}
        >
          {street?.maxSpeed ?? 50}
        </div>

        {/* World Travel Action Button */}
        <button
          onClick={() => setTravelOpen(true)}
          style={{
            marginLeft: isMobileLandscape ? 4 : 8,
            background: 'linear-gradient(135deg, rgba(2, 132, 199, 0.3) 0%, rgba(37, 99, 235, 0.45) 100%)',
            border: '1px solid rgba(56, 189, 248, 0.5)',
            borderRadius: 14,
            padding: isMobileLandscape ? '4px 8px' : '6px 14px',
            color: '#38bdf8',
            fontFamily: "'Orbitron', sans-serif",
            fontSize: isMobileLandscape ? 9 : 10,
            fontWeight: 800,
            letterSpacing: 1,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: isMobileLandscape ? 3 : 6,
            boxShadow: '0 0 12px rgba(56, 189, 248, 0.25)',
            transition: 'all 0.2s',
          }}
        >
          <span>🌍 {isMobileLandscape ? 'VOYAGE' : 'VOYAGER'}</span>
          {!isMobileLandscape && (
            <span style={{ fontSize: 9, opacity: 0.75, background: 'rgba(255,255,255,0.15)', padding: '1px 5px', borderRadius: 4 }}>T</span>
          )}
        </button>

        {/* Quick Address Search Action Button */}
        <button
          onClick={() => setSearchBarOpen((v) => !v)}
          style={{
            marginLeft: isMobileLandscape ? 3 : 6,
            background: searchBarOpen
              ? 'linear-gradient(135deg, rgba(14, 165, 233, 0.6) 0%, rgba(2, 132, 199, 0.8) 100%)'
              : 'rgba(15, 23, 42, 0.7)',
            border: searchBarOpen ? '1px solid #38bdf8' : '1px solid rgba(56, 189, 248, 0.4)',
            borderRadius: 14,
            padding: isMobileLandscape ? '4px 8px' : '6px 12px',
            color: '#38bdf8',
            fontFamily: "'Orbitron', sans-serif",
            fontSize: isMobileLandscape ? 9 : 10,
            fontWeight: 800,
            letterSpacing: 1,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: isMobileLandscape ? 3 : 5,
            boxShadow: '0 0 10px rgba(56, 189, 248, 0.2)',
            transition: 'all 0.2s',
          }}
          title="Rechercher une adresse, une rue ou un monument (/)"
        >
          <span>🔍 {isMobileLandscape ? 'RUE' : 'ADRESSE'}</span>
          {!isMobileLandscape && (
            <span style={{ fontSize: 9, opacity: 0.75, background: 'rgba(255,255,255,0.15)', padding: '1px 5px', borderRadius: 4 }}>/</span>
          )}
        </button>
      </div>

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

      {/* Mobile Touch Controls Overlay */}
      <TouchControls
        engine={engine}
        onToggleMap={() => setMapExpanded((v) => !v)}
        onToggleTravel={() => setTravelOpen(true)}
        onToggleSearch={() => setSearchBarOpen((v) => !v)}
      />

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
    </>
  )
}
