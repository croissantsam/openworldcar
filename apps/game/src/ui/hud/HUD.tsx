import { useEffect, useRef, useState } from 'react'
import { useLocale } from '../../i18n/index.js'
import type { GameEngine, VehicleMode } from '../../game/GameEngine.js'
import type { StreetInfo } from '../../world/ChunkManager.js'
import { getDistrictLabel, type WorldDestination } from '../../world/destinations.js'
import { Minimap } from '../Minimap.js'
import { WorldTravelModal } from '../WorldTravelModal.js'
import { TouchControls } from '../TouchControls.js'
import { OrientationPrompt } from '../OrientationPrompt.js'
import { AuthModal } from '../auth/AuthModal.js'
import { TrophyModal } from '../trophies/TrophyModal.js'
import { TrialBoardModal } from '../trials/TrialBoardModal.js'
import { TrialStartPanel } from '../trials/TrialStartPanel.js'
import { TrialWidgets } from '../trials/TrialWidgets.js'
import { useTrophyToast } from '../trophies/toast.js'
import { authClient } from '../../lib/auth-client.js'
import { recordCityVisit } from '../../services/profileSync.js'
import { submitTrialTime } from '../../server/trials.js'
import {
  notifyTrialTimesChanged,
  TRIAL_START_RADIUS_M,
  type TrialStatus,
} from '../../lib/trials.js'
import {
  getOfflineTrialRuns,
  isOnlineMode,
  queueOfflineTrialRun,
  recordLocalTrialBest,
  setOfflineTrialRuns,
  subscribeOnlineMode,
  type OfflineTrialMeta,
} from '../../lib/connectivity.js'
import { FLIGHT_READOUT_EMPTY, sameGun, sameReadout, type FlightReadout, type GunReadout } from './types.js'
import { PlanePanel } from './PlanePanel.js'
import { CarPanel } from './CarPanel.js'
import { StatusCluster } from './StatusCluster.js'
import { TopBar } from './TopBar.js'
import { MenuOverlay } from './MenuOverlay.js'
import { FxOverlays } from './FxOverlays.js'

interface HUDProps {
  engine: GameEngine
}

const KMH = 3.6

function finiteOr(v: number, fallback: number): number {
  return Number.isFinite(v) ? v : fallback
}

export const HUD: React.FC<HUDProps> = ({ engine }) => {
  const { t } = useLocale()
  const [speed, setSpeed] = useState(0)
  const [gear, setGear] = useState('D')
  const [nitro, setNitro] = useState(1)
  const [nitroBoosting, setNitroBoosting] = useState(false)
  const [drifting, setDrifting] = useState(false)
  const [vehicleMode, setVehicleMode] = useState<VehicleMode>(() => engine.vehicleMode)
  const [flight, setFlight] = useState<FlightReadout>(FLIGHT_READOUT_EMPTY)
  const [gun, setGun] = useState<GunReadout | null>(null)
  const [health, setHealth] = useState<number>(100)
  const [maxHealth, setMaxHealth] = useState<number>(100)
  const [combatInvincible, setCombatInvincible] = useState(false)
  const [showControls, setShowControls] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('world_drive_show_controls') === 'true'
  })
  const toggleControls = () => {
    setShowControls((prev) => {
      const next = !prev
      try {
        localStorage.setItem('world_drive_show_controls', String(next))
      } catch {}
      return next
    })
  }
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
    getDistrictLabel(engine.currentDestination)
  )
  const [travelOpen, setTravelOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [authOpen, setAuthOpen] = useState(false)
  const [trophyOpen, setTrophyOpen] = useState(false)
  const [trialBoardOpen, setTrialBoardOpen] = useState(false)
  const [trialStatus, setTrialStatus] = useState<TrialStatus>(() => engine.getTrialStatus())
  const [trialSubmit, setTrialSubmit] = useState<{ timeMs: number; bestMs: number; isRecord: boolean; offline?: boolean } | null>(null)
  // Explicit online/offline mode (default online). Offline: socket closed,
  // trial runs recorded locally and synced on return to online.
  const [onlineMode, setOnlineModeState] = useState<boolean>(() => isOnlineMode())
  const flushingRef = useRef(false)
  const trophyToasts = useTrophyToast((s) => s.items)
  const { data: authSession } = authClient.useSession()
  const authUser = authSession?.user as { name?: string; email?: string; isAnonymous?: boolean | null } | undefined
  const isGuest = !authUser || authUser.isAnonymous === true || authUser.isAnonymous === null
  const authLabel = isGuest ? t('hud_guest_name') : (authUser?.name || authUser?.email || t('hud_pilot_name')).toUpperCase().slice(0, 18)
  const [mapExpanded, setMapExpanded] = useState(false)
  const [viewDistanceOpen, setViewDistanceOpen] = useState(false)
  const [isWarping, setIsWarping] = useState(false)
  const [isGenerating, setIsGenerating] = useState(() => engine.chunkManager.isGenerating)
  const [invincibilitySec, setInvincibilitySec] = useState<number>(() =>
    engine.getInvincibilityRemaining()
  )
  const [flipCountdown, setFlipCountdown] = useState<number>(0)
  const [playerCount, setPlayerCount] = useState<number>(() => engine.getConnectedPlayerCount())
  const [isNetworkConnected, setIsNetworkConnected] = useState<boolean>(() => engine.isNetworkConnected())
  const [networkPing, setNetworkPing] = useState<number>(() => engine.getNetworkLatency())
  const lastSeenRef = useRef<number>(Date.now())
  // getCurrentStreet() scans every loaded road segment: only re-query when
  // the car actually moved (or 1s elapsed), not on every 100ms tick.
  const lastStreetPosRef = useRef<{ x: number; z: number } | null>(null)
  const lastStreetAtRef = useRef<number>(0)

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
      // A city change reuses local world coords (each city is centered on
      // its own origin): force the street/district refresh instead of
      // trusting the moved-distance + hysteresis caches, and drop the old
      // city's street immediately so the badge shows the new city at once.
      setStreet(null)
      lastStreetPosRef.current = null
      lastStreetAtRef.current = 0
      lastSeenRef.current = Date.now()
      setDistrict(getDistrictLabel(newDest))
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

    // ── Time-trial finish: submit the run, banner shows record or best ─────
    // Offline mode (or connection lost mid-submit): the run is recorded
    // locally and synced when back online — never lost.
    engine.onTrialFinished = (trial, timeMs) => {
      const meta: OfflineTrialMeta = {
        id: trial.id,
        destinationId: trial.destinationId,
        label: `${trial.from.name} → ${trial.to.name}`,
        fromName: trial.from.name,
        toName: trial.to.name,
        distanceM: trial.distanceM,
        fromX: trial.from.x,
        fromZ: trial.from.z,
        toX: trial.to.x,
        toZ: trial.to.z,
        originLat: engine.currentDestination.origin.latitude,
        originLng: engine.currentDestination.origin.longitude,
      }
      recordLocalTrialBest(trial.id, timeMs)
      if (isOnlineMode() && navigator.onLine) {
        submitTrialTime({
          data: {
            trial: meta,
            timeMs,
          },
        })
          .then((res) => {
            setTrialSubmit({ timeMs, bestMs: res.bestMs, isRecord: res.isRecord })
            notifyTrialTimesChanged()
          })
          .catch(() => {
            if (!navigator.onLine) {
              queueOfflineTrialRun(meta, timeMs)
              setTrialSubmit({ timeMs, bestMs: timeMs, isRecord: false, offline: true })
            } else {
              setTrialSubmit({ timeMs, bestMs: timeMs, isRecord: false })
            }
          })
      } else {
        queueOfflineTrialRun(meta, timeMs)
        setTrialSubmit({ timeMs, bestMs: timeMs, isRecord: false, offline: true })
      }
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
          setTravelOpen(false)
        }
        return
      }

      if (e.key === 't' || e.key === 'T') {
        setTravelOpen((v) => !v)
      } else if (e.key === 'h' || e.key === 'H') {
        toggleControls()
      } else if (e.key === 'Escape') {
        setTravelOpen(false)
        setShowControls(false)
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
        const ns = engine.getNitroState()
        setNitro(ns ? Math.max(0, Math.min(1, ns.charge)) : 0)
        setNitroBoosting(ns ? ns.boosting : false)
        setDrifting(engine.isDrifting())
      }

      // Query current street and dynamic district from active chunks.
      // Skipped while the car barely moves: the scan is O(all road segments).
      const pos = engine.getPlayerPosition()
      const lp = lastStreetPosRef.current
      const nowMs = Date.now()
      const movedM = lp ? Math.hypot(pos.x - lp.x, pos.z - lp.z) : Infinity
      if (movedM > 2 || nowMs - lastStreetAtRef.current > 1000) {
        lastStreetPosRef.current = { x: pos.x, z: pos.z }
        lastStreetAtRef.current = nowMs
        setDistrict(getDistrictLabel(currentDestRef.current))

        const current = engine.getCurrentStreet()
        if (current) {
          setStreet(current)
          lastSeenRef.current = nowMs
        } else {
          // Hysteresis: retain last known street for 2.5s when crossing intersections or open areas
          if (nowMs - lastSeenRef.current > 2500) {
            setStreet(null)
          }
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
      setFlipCountdown(engine.getFlipRecoveryCountdown())
      setPlayerCount(engine.getConnectedPlayerCount())
      setIsNetworkConnected(engine.isNetworkConnected())
      setNetworkPing(engine.getNetworkLatency())
      const ts = engine.getTrialStatus()
      setTrialStatus((prev) =>
        prev.phase === ts.phase &&
        prev.countdownS === ts.countdownS &&
        prev.elapsedMs === ts.elapsedMs &&
        prev.distToStartM === ts.distToStartM &&
        prev.remainingM === ts.remainingM &&
        prev.proposal?.id === ts.proposal?.id &&
        prev.active?.id === ts.active?.id &&
        prev.lastResult?.timeMs === ts.lastResult?.timeMs
          ? prev
          : ts,
      )
      if (ts.phase === 'countdown') {
        // New run starting: drop the previous finish banner data.
        setTrialSubmit(null)
      }
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
      engine.onTrialFinished = undefined
    }
  }, [engine, travelOpen])

  // Explicit online/offline mode (menu toggle, other tab).
  useEffect(() => subscribeOnlineMode(setOnlineModeState), [])

  // Flush offline-recorded trial runs when (back) online — in order, then
  // refresh leaderboards. Also runs once on boot, syncing runs queued in a
  // previous session. Failures that aren't validation errors are re-queued.
  useEffect(() => {
    if (!onlineMode) return
    if (flushingRef.current) return
    if (getOfflineTrialRuns().length === 0) return
    flushingRef.current = true
    ;(async () => {
      const pending = getOfflineTrialRuns()
      // Clear first: a second flight (StrictMode) then sees an empty queue.
      setOfflineTrialRuns([])
      let synced = 0
      const failed: typeof pending = []
      for (const run of pending) {
        try {
          await submitTrialTime({ data: { trial: run.trial, timeMs: run.timeMs } })
          recordLocalTrialBest(run.trial.id, run.timeMs)
          synced++
        } catch (err) {
          const msg = err instanceof Error ? err.message : ''
          if (!msg.includes('INVALID') && !msg.includes('IMPOSSIBLE')) failed.push(run)
        }
      }
      if (failed.length > 0) setOfflineTrialRuns([...failed, ...getOfflineTrialRuns()])
      if (synced > 0) notifyTrialTimesChanged()
    })()
      .catch(() => {})
      .finally(() => {
        flushingRef.current = false
      })
  }, [onlineMode])

  const handleTravelTo = (dest: WorldDestination) => {
    setIsWarping(true)
    setCurrentDest(dest)
    currentDestRef.current = dest
    // Optimistic HUD refresh: same resets as onDestinationChanged so the
    // badge/district switch instantly, even before the engine callback.
    // (The player hasn't teleported yet, so derive the district from the
    // destination origin — the engine callback recomputes it post-teleport.)
    setStreet(null)
    lastStreetPosRef.current = null
    lastStreetAtRef.current = 0
    lastSeenRef.current = Date.now()
    setDistrict(getDistrictLabel(dest))
    engine.travelTo(dest)
    recordCityVisit(dest.id)
    setTimeout(() => {
      setIsWarping(false)
    }, 750)
  }

  const isPlane = vehicleMode === 'plane'

  const toggleVehicle = () => {
    engine.togglePlane()
    setVehicleMode(engine.vehicleMode)
  }

  return (
    <>
      {isPlane && <PlanePanel flight={flight} gun={gun} hitMarker={hitMarker} touchMode={touchMode} />}
      {!isPlane && (
        <CarPanel
          speed={speed}
          gear={gear}
          nitro={nitro}
          nitroBoosting={nitroBoosting}
          drifting={drifting}
          touchMode={touchMode}
        />
      )}
      <StatusCluster
        flipCountdown={flipCountdown}
        invincibilitySec={invincibilitySec}
        destroyed={destroyed}
        isPlane={isPlane}
        touchMode={touchMode}
        showControls={showControls}
        onToggleControls={toggleControls}
      />
      <TopBar
        engine={engine}
        onlineMode={onlineMode}
        playerCount={playerCount}
        isNetworkConnected={isNetworkConnected}
        networkPing={networkPing}
        touchMode={touchMode}
        isGuest={isGuest}
        authLabel={authLabel}
        street={street}
        district={district}
        currentDest={currentDest}
        onOpenMenu={() => setMenuOpen(true)}
        onOpenAuth={() => setAuthOpen(true)}
      />
      {menuOpen && (
        <MenuOverlay
          isPlane={isPlane}
          isGuest={isGuest}
          authLabel={authLabel}
          touchMode={touchMode}
          viewDistanceOpen={viewDistanceOpen}
          showControls={showControls}
          onToggleControls={toggleControls}
          onClose={() => setMenuOpen(false)}
          onOpenTravel={() => {
            setMenuOpen(false)
            setTravelOpen(true)
          }}
          onRespawn={() => {
            engine.respawnPlayer()
            setMenuOpen(false)
          }}
          onToggleVehicle={() => {
            toggleVehicle()
            setMenuOpen(false)
          }}
          onOpenAuth={() => {
            setMenuOpen(false)
            setAuthOpen(true)
          }}
          onOpenTrophies={() => {
            setMenuOpen(false)
            setTrophyOpen(true)
          }}
          onOpenTrials={() => {
            setMenuOpen(false)
            setTrialBoardOpen(true)
          }}
          onOpenDistance={() => {
            setMenuOpen(false)
            setViewDistanceOpen(true)
          }}
          onCloseViewDistancePanel={() => setViewDistanceOpen(false)}
          onToggleTouchMode={() => setTouchMode((v) => !v)}
        />
      )}
      <FxOverlays
        isGenerating={isGenerating}
        touchMode={touchMode}
        isWarping={isWarping}
        currentDest={currentDest}
        trophyToasts={trophyToasts}
      />
      {/* GPS Radar Minimap */}
      <Minimap
        engine={engine}
        isMobileLandscape={isMobileLandscape}
        externalExpanded={mapExpanded}
        onToggleExpanded={() => setMapExpanded((v) => !v)}
        destinationCity={currentDest.city}
        destinationFlag={currentDest.flag}
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

      {/* Pilot account modal */}
      {authOpen && <AuthModal engine={engine} onClose={() => setAuthOpen(false)} />}

      {/* Trophies & leaderboard modal */}
      {trophyOpen && <TrophyModal onClose={() => setTrophyOpen(false)} />}

      {/* Time-trial board modal */}
      {trialBoardOpen && <TrialBoardModal engine={engine} onClose={() => setTrialBoardOpen(false)} />}

      {/* Full start panel within the beacon zone, else race widgets.
          Discovery beyond that lives on the minimap (no far guidance). */}
      {trialStatus.phase === 'idle' &&
      trialStatus.proposal &&
      trialStatus.distToStartM <= TRIAL_START_RADIUS_M ? (
        <TrialStartPanel
          engine={engine}
          proposal={trialStatus.proposal}
          distToStartM={trialStatus.distToStartM}
          touchMode={touchMode}
        />
      ) : (
        <TrialWidgets
          status={trialStatus}
          submit={trialSubmit}
          touchMode={touchMode}
          onAbort={() => engine.abortTrial()}
        />
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
