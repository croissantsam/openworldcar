import { useEffect, useRef, useState } from 'react'
import { worldToGeo } from '@world-drive/math'
import type { GameEngine, VehicleMode } from '../game/GameEngine.js'
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

/** Flight instruments shown in plane mode (rounded for display). */
type FlightReadout = {
  kmh: number
  altitude: number
  verticalSpeed: number
  throttle: number
  onGround: boolean
  stall: boolean
  crashed: boolean
}

const FLIGHT_READOUT_EMPTY: FlightReadout = {
  kmh: 0,
  altitude: 0,
  verticalSpeed: 0,
  throttle: 0,
  onGround: true,
  stall: false,
  crashed: false,
}

function sameReadout(a: FlightReadout, b: FlightReadout): boolean {
  return (
    a.kmh === b.kmh &&
    a.altitude === b.altitude &&
    a.verticalSpeed === b.verticalSpeed &&
    a.throttle === b.throttle &&
    a.onGround === b.onGround &&
    a.stall === b.stall &&
    a.crashed === b.crashed
  )
}

function finiteOr(v: number, fallback: number): number {
  return Number.isFinite(v) ? v : fallback
}

/** Machine-gun readout (plane mode). */
type GunReadout = {
  ammo: number
  maxAmmo: number
  /** 0..100 */
  heat: number
  overheated: boolean
}

function sameGun(a: GunReadout | null, b: GunReadout | null): boolean {
  if (a === null || b === null) return a === b
  return a.ammo === b.ammo && a.maxAmmo === b.maxAmmo && a.heat === b.heat && a.overheated === b.overheated
}

export const HUD: React.FC<HUDProps> = ({ engine }) => {
  const [speed, setSpeed] = useState(0)
  const [gear, setGear] = useState('D')
  const [vehicleMode, setVehicleMode] = useState<VehicleMode>(() => engine.vehicleMode)
  const [flight, setFlight] = useState<FlightReadout>(FLIGHT_READOUT_EMPTY)
  const [gun, setGun] = useState<GunReadout | null>(null)
  const [health, setHealth] = useState<number>(100)
  const [maxHealth, setMaxHealth] = useState<number>(100)
  const [combatInvincible, setCombatInvincible] = useState(false)
  const [hitMarker, setHitMarker] = useState(false)
  const [damageFlash, setDamageFlash] = useState(false)
  const [destroyed, setDestroyed] = useState(false)
  const hitTimer = useRef<number | null>(null)
  const damageTimer = useRef<number | null>(null)
  const destroyedTimer = useRef<number | null>(null)
  const [street, setStreet] = useState<StreetInfo | null>(() => engine.getCurrentStreet())
  const [currentDest, setCurrentDest] = useState<WorldDestination>(() => engine.currentDestination)
  const currentDestRef = useRef<WorldDestination>(engine.currentDestination)
  const [district, setDistrict] = useState<string>(() =>
    getDistrictLabel(worldToGeo(engine.getPlayerPosition()), engine.currentDestination)
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
      const pos = engine.getPlayerPosition()
      const currentGeo = worldToGeo(pos)
      setDistrict(getDistrictLabel(currentGeo, newDest))
    }

    engine.onInvincibilityChanged = () => {
      setInvincibilitySec(engine.getInvincibilityRemaining())
    }

    engine.chunkManager.onGeneratingStatusChange = (gen) => {
      setIsGenerating(gen)
    }

    engine.onVehicleModeChanged = (mode) => {
      setVehicleMode(mode)
    }

    // ── Combat feedback ───────────────────────────────────────────────────
    engine.onGunHit = () => {
      setHitMarker(true)
      if (hitTimer.current !== null) window.clearTimeout(hitTimer.current)
      hitTimer.current = window.setTimeout(() => setHitMarker(false), 220)
    }

    engine.onDamageTaken = (_damage, hp) => {
      setHealth(hp)
      setDamageFlash(true)
      if (damageTimer.current !== null) window.clearTimeout(damageTimer.current)
      damageTimer.current = window.setTimeout(() => setDamageFlash(false), 340)
    }

    engine.onPlayerDestroyed = () => {
      setDestroyed(true)
      if (destroyedTimer.current !== null) window.clearTimeout(destroyedTimer.current)
      destroyedTimer.current = window.setTimeout(() => setDestroyed(false), 1500)
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
      } else if (e.key === '/' || ((e.key === 'f' || e.key === 'F') && engine.vehicleMode !== 'plane')) {
        // In the plane, F is the machine-gun trigger (InputManager)
        e.preventDefault()
        setSearchBarOpen((v) => !v)
      } else if (e.key === 'Escape') {
        setTravelOpen(false)
        setSearchBarOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)

    const id = setInterval(() => {
      setVehicleMode(engine.vehicleMode)
      const fs = engine.getFlightState()
      if (fs) {
        const next: FlightReadout = {
          kmh: Math.round(Math.max(0, finiteOr(fs.airspeed, 0)) * KMH),
          altitude: Math.round(Math.max(0, finiteOr(fs.altitudeAGL, 0))),
          verticalSpeed: Math.round(finiteOr(fs.verticalSpeed, 0) * 10) / 10,
          throttle: Math.round(Math.min(1, Math.max(0, finiteOr(fs.throttle, 0))) * 100),
          onGround: fs.onGround,
          stall: fs.stall,
          crashed: fs.crashed,
        }
        setFlight((prev) => (sameReadout(prev, next) ? prev : next))
      } else {
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
      }

      // Query current street and dynamic district from active chunks
      const pos = engine.getPlayerPosition()
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

      // Machine guns + health
      const gs = engine.getGunState()
      const nextGun: GunReadout | null = gs
        ? {
            ammo: Math.max(0, Math.round(gs.ammo)),
            maxAmmo: Math.max(1, Math.round(gs.maxAmmo)),
            heat: Math.round(Math.min(1, Math.max(0, finiteOr(gs.heat, 0))) * 100),
            overheated: gs.overheated,
          }
        : null
      setGun((prev) => (sameGun(prev, nextGun) ? prev : nextGun))

      const cs = engine.getCombatState()
      setHealth(Math.max(0, Math.round(finiteOr(cs.health, 100))))
      setMaxHealth(Math.max(1, Math.round(finiteOr(cs.maxHealth, 100))))
      setCombatInvincible(cs.invincible)

      setInvincibilitySec(engine.getInvincibilityRemaining())
      setPlayerCount(engine.getConnectedPlayerCount())
      setIsNetworkConnected(engine.isNetworkConnected())
      setNetworkPing(engine.getNetworkLatency())
    }, 100) // 10 Hz

    return () => {
      clearInterval(id)
      window.removeEventListener('keydown', onKey)
      // Clear the timers AND the flags they would have cleared: this effect
      // re-runs whenever the travel modal opens, and a frozen overlay would
      // otherwise stay on screen forever.
      if (hitTimer.current !== null) window.clearTimeout(hitTimer.current)
      if (damageTimer.current !== null) window.clearTimeout(damageTimer.current)
      if (destroyedTimer.current !== null) window.clearTimeout(destroyedTimer.current)
      hitTimer.current = null
      damageTimer.current = null
      destroyedTimer.current = null
      setHitMarker(false)
      setDamageFlash(false)
      setDestroyed(false)
      engine.onGunHit = undefined
      engine.onDamageTaken = undefined
      engine.onPlayerDestroyed = undefined
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

  const isPlane = vehicleMode === 'plane'

  const toggleVehicle = () => {
    engine.togglePlane()
    setVehicleMode(engine.vehicleMode)
  }

  const vsColor =
    flight.verticalSpeed > 0.4 ? '#34d399' : flight.verticalSpeed < -0.4 ? '#fbbf24' : '#e2e8f0'

  return (
    <>
      {/* Flight instruments (plane mode) — same glass language as the speedometer */}
      {isPlane && (
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
              <span style={flightLabelStyle}>VITESSE</span>
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
              <span style={flightLabelStyle}>ALTITUDE</span>
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
              <span style={flightLabelStyle}>VARIO</span>
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
            <span style={{ ...flightLabelStyle, minWidth: 24 }}>GAZ</span>
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
              {flight.onGround ? 'SOL' : 'VOL'}
            </span>
          </div>
          {/* Machine guns: ammo + barrel heat */}
          {gun && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ ...flightLabelStyle, minWidth: 24, color: gun.overheated ? '#f87171' : '#fbbf24' }}>MUN</span>
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
                {gun.overheated ? 'SURCHAUFFE' : `${gun.heat}%`}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Gun sight (plane mode) */}
      {isPlane && !flight.crashed && (
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
      {isPlane && flight.stall && !flight.crashed && (
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
              DÉCROCHAGE
            </span>
            <span style={{ fontFamily: "'Inter', sans-serif", fontSize: touchMode ? 9 : 11, color: 'rgba(255,255,255,0.8)' }}>
              {touchMode ? 'Poussez le joystick ▲ pour reprendre de la vitesse' : 'Piquez (↑) et remettez les gaz (Z / W)'}
            </span>
          </div>
        </div>
      )}

      {/* Crash */}
      {isPlane && flight.crashed && (
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
              CRASH
            </span>
            <span style={{ fontFamily: "'Inter', sans-serif", fontSize: touchMode ? 9 : 11, color: 'rgba(255,255,255,0.85)' }}>
              {touchMode ? 'Touchez 🚗 Voiture pour repartir' : 'P : reprendre la voiture · Maj+P : redécoller en vol'}
            </span>
          </div>
        </div>
      )}

      {/* Take-off tip while sitting on the ground */}
      {isPlane && flight.onGround && !flight.crashed && flight.kmh < 40 && (
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
            ? 'Gaz automatiques : roulez tout droit, puis tirez le joystick ▼ pour décoller'
            : 'Plein gaz (Z / W) sur une grande ligne droite, puis tirez (↓) pour décoller'}
        </div>
      )}

      {/* Speedometer - Minimalist, modern glass badge directly above the FREIN button */}
      {!isPlane && (
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
      )}

      {/* Health (PV) — both modes */}
      <div
        style={{
          position: 'absolute',
          bottom: touchMode ? 'max(120px, calc(env(safe-area-inset-bottom, 0px) + 120px))' : 30,
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: 'rgba(10, 16, 28, 0.72)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          border: damageFlash
            ? '1px solid rgba(239, 68, 68, 0.9)'
            : combatInvincible
            ? '1px solid rgba(0, 229, 255, 0.55)'
            : '1px solid rgba(0, 212, 255, 0.3)',
          boxShadow: damageFlash
            ? '0 4px 16px rgba(0,0,0,0.4), 0 0 18px rgba(239, 68, 68, 0.55)'
            : '0 4px 16px rgba(0, 0, 0, 0.4)',
          borderRadius: 14,
          padding: touchMode ? '4px 10px' : '6px 14px',
          pointerEvents: 'none',
          userSelect: 'none',
          zIndex: 34,
          transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
        }}
      >
        <span style={{ ...flightLabelStyle, color: damageFlash ? '#fca5a5' : '#00d4ff' }}>PV</span>
        <div
          style={{
            width: touchMode ? 110 : 150,
            height: touchMode ? 7 : 8,
            borderRadius: 4,
            background: 'rgba(255, 255, 255, 0.12)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${Math.max(0, Math.min(100, (health / maxHealth) * 100))}%`,
              height: '100%',
              borderRadius: 4,
              background:
                health <= maxHealth * 0.3
                  ? 'linear-gradient(90deg, #dc2626, #f87171)'
                  : health <= maxHealth * 0.6
                  ? 'linear-gradient(90deg, #d97706, #fbbf24)'
                  : 'linear-gradient(90deg, #059669, #34d399)',
              boxShadow: '0 0 8px rgba(52, 211, 153, 0.35)',
              transition: 'width 0.18s ease-out',
            }}
          />
        </div>
        <span
          style={{
            fontFamily: "'Orbitron', sans-serif",
            fontSize: touchMode ? 11 : 13,
            fontWeight: 900,
            color: damageFlash ? '#fca5a5' : '#fff',
            minWidth: 26,
            textAlign: 'right',
          }}
        >
          {health}
        </span>
        {combatInvincible && (
          <span style={{ fontSize: touchMode ? 10 : 12, filter: 'drop-shadow(0 0 4px rgba(0,229,255,0.8))' }}>🛡️</span>
        )}
      </div>

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
              DÉTRUIT
            </span>
            <span style={{ fontFamily: "'Inter', sans-serif", fontSize: touchMode ? 9 : 11, color: 'rgba(255,255,255,0.85)' }}>
              Abattu — réapparition en cours…
            </span>
          </div>
        </div>
      )}

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
          {isPlane ? (
            <>
              <div><strong style={{ color: '#00d4ff' }}>Z / W</strong> — Gaz +</div>
              <div><strong style={{ color: '#00d4ff' }}>S</strong> — Gaz −</div>
              <div><strong style={{ color: '#00d4ff' }}>↓</strong> — Cabrer (monter)</div>
              <div><strong style={{ color: '#00d4ff' }}>↑</strong> — Piquer (descendre)</div>
              <div><strong style={{ color: '#00d4ff' }}>← / → ou Q / D</strong> — Roulis (virer)</div>
              <div><strong style={{ color: '#00d4ff' }}>ESPACE</strong> — Freins (au sol)</div>
              <div><strong style={{ color: '#fbbf24' }}>F / clic gauche</strong> — Mitrailleuse</div>
              <div><strong style={{ color: '#38bdf8' }}>P</strong> — 🚗 Reprendre la voiture</div>
              <div><strong style={{ color: '#38bdf8' }}>MAJ + P</strong> — Redécoller en vol</div>
              <div><strong style={{ color: '#00d4ff' }}>M</strong> — Carte GPS</div>
            </>
          ) : (
            <>
              <div><strong style={{ color: '#00d4ff' }}>W / Z / ↑</strong> — Accélérer</div>
              <div><strong style={{ color: '#00d4ff' }}>S / ↓</strong> — Frein / Marche arrière</div>
              <div><strong style={{ color: '#00d4ff' }}>A / Q / ←</strong> — Tourner à gauche</div>
              <div><strong style={{ color: '#00d4ff' }}>D / →</strong> — Tourner à droite</div>
              <div><strong style={{ color: '#00d4ff' }}>ESPACE</strong> — Frein à main</div>
              <div><strong style={{ color: '#00d4ff' }}>M</strong> — Carte GPS</div>
              <div><strong style={{ color: '#38bdf8' }}>P</strong> — ✈️ Prendre l’avion</div>
              <div><strong style={{ color: '#38bdf8' }}>T</strong> — 🌍 Voyager dans le monde</div>
            </>
          )}
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

      {/* Car / plane toggle, next to the menu button */}
      <button
        onClick={(e) => {
          e.currentTarget.blur()
          toggleVehicle()
        }}
        onMouseDown={(e) => e.preventDefault()}
        tabIndex={-1}
        style={{
          position: 'absolute',
          top: isMobileLandscape ? 'max(8px, env(safe-area-inset-top, 8px))' : 16,
          right: isMobileLandscape ? 'calc(max(14px, env(safe-area-inset-right, 14px)) + 42px)' : 68,
          height: isMobileLandscape ? 34 : 40,
          padding: isMobileLandscape ? '0 10px' : '0 14px',
          borderRadius: 10,
          background: isPlane ? 'rgba(10, 16, 28, 0.75)' : 'rgba(0, 60, 90, 0.78)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          border: isPlane ? '1px solid rgba(251, 191, 36, 0.55)' : '1px solid rgba(0, 212, 255, 0.6)',
          color: isPlane ? '#fbbf24' : '#7dd3fc',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          cursor: 'pointer',
          zIndex: 60,
          boxShadow: isPlane
            ? '0 4px 16px rgba(0, 0, 0, 0.4), 0 0 12px rgba(251, 191, 36, 0.2)'
            : '0 4px 16px rgba(0, 0, 0, 0.4), 0 0 12px rgba(0, 212, 255, 0.25)',
          touchAction: 'manipulation',
          userSelect: 'none',
          WebkitUserSelect: 'none',
        }}
        title={isPlane ? 'Reprendre la voiture (P)' : 'Prendre l’avion (P) — Maj+P : directement en vol'}
      >
        <span style={{ fontSize: isMobileLandscape ? 15 : 17, lineHeight: 1 }}>{isPlane ? '🚗' : '✈️'}</span>
        <span
          style={{
            fontFamily: "'Orbitron', sans-serif",
            fontSize: isMobileLandscape ? 9 : 11,
            fontWeight: 800,
            letterSpacing: 1.2,
          }}
        >
          {isPlane ? 'VOITURE' : 'AVION'}
        </span>
      </button>

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

      {/* 30s Spawn Invincibility Banner (the car's — hidden while flying) */}
      {invincibilitySec > 0 && !isPlane && (
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
      <TouchControls engine={engine} visible={touchMode} vehicleMode={vehicleMode} />

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
        @keyframes hudFlash {
          0% { opacity: 1; }
          100% { opacity: 0.55; }
        }
      `}</style>
    </>
  )
}

const flightLabelStyle: React.CSSProperties = {
  fontFamily: "'Inter', sans-serif",
  fontSize: 8,
  fontWeight: 700,
  color: '#00d4ff',
  letterSpacing: 1.2,
}

const flightUnitStyle: React.CSSProperties = {
  fontFamily: "'Inter', sans-serif",
  fontSize: 8,
  fontWeight: 700,
  color: 'rgba(148, 163, 184, 0.9)',
  letterSpacing: 1,
}

const alertBannerStyle: React.CSSProperties = {
  position: 'absolute',
  left: '50%',
  transform: 'translateX(-50%)',
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  background: 'rgba(40, 8, 8, 0.86)',
  border: '1px solid rgba(239, 68, 68, 0.85)',
  borderRadius: 16,
  padding: '8px 20px',
  boxShadow: '0 8px 30px rgba(0,0,0,0.6), 0 0 24px rgba(239, 68, 68, 0.45)',
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  pointerEvents: 'none',
  userSelect: 'none',
  zIndex: 40,
  whiteSpace: 'nowrap',
}
