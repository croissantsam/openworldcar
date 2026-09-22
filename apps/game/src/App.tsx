import { useEffect, useRef, useState } from 'react'
import { useLocale } from './i18n/index.js'
import { GameEngine } from './game/GameEngine.js'
import { HUD } from './ui/hud/index.js'
import { DebugOverlay } from './renderer/DebugOverlay.js'
import { authClient } from './lib/auth-client.js'
import type { WorldDestination } from './world/destinations.js'
import {
  applyProfileSettings,
  destinationFromProfile,
  loadMyProfile,
  recordCityVisit,
  startProfileAutosave,
} from './services/profileSync.js'

export default function App() {
  const mountRef = useRef<HTMLDivElement>(null)
  const engineRef = useRef<GameEngine | null>(null)
  const [debugVisible, setDebugVisible] = useState(false)
  const [engineReady, setEngineReady] = useState(false)

  useEffect(() => {
    if (!mountRef.current) return
    let isMounted = true
    let stopAutosave: (() => void) | null = null
    const engine = new GameEngine(mountRef.current)
    engineRef.current = engine

    // Guest auto: no session → one-click anonymous account so every
    // player gets a persistent profile (spawn + settings).
    const boot = async () => {
      let sessionUser: { name?: string; isAnonymous?: boolean | null | undefined } | null = null
      try {
        const { data } = await authClient.getSession()
        sessionUser = data?.user ?? null
        if (!sessionUser) {
          const res = await authClient.signIn.anonymous().catch(() => null)
          sessionUser = res?.data?.user ?? null
        }
      } catch {
        // auth backend unreachable — the game stays fully playable offline
      }

      // Restore saved settings + spawn before the world builds. The
      // destination is passed to init() so origin, chunk source and car
      // are set before the first chunk loads (no area mixing).
      const profile = await loadMyProfile()
      if (!isMounted) {
        engine.dispose()
        return
      }
      let initialDest: WorldDestination | undefined = undefined
      if (profile) {
        applyProfileSettings(profile)
        const dest = destinationFromProfile(profile)
        if (dest) initialDest = dest
      }

      // Name shown above our car to other online players: saved pseudo,
      // else the account name (never the "Anonymous" placeholder).
      const displayName = profile?.displayName?.trim()
      const accountName = sessionUser && sessionUser.isAnonymous !== true ? sessionUser.name?.trim() : undefined
      engine.setLocalDisplayName(displayName || accountName || null)

      await engine.init(initialDest)
      if (!isMounted) {
        engine.dispose()
        return
      }
      stopAutosave = startProfileAutosave(engine)
      recordCityVisit(engine.currentDestination.id)
      setEngineReady(true)
      engine.start()
    }

    boot().catch((err) => {
      console.error('[App] Failed to initialise GameEngine:', err)
    })

    const onKey = (e: KeyboardEvent) => {
      if (e.key === '`' || e.key === '~') {
        setDebugVisible((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)

    return () => {
      isMounted = false
      window.removeEventListener('keydown', onKey)
      stopAutosave?.()
      engine.dispose()
    }
  }, [])

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      {/* Three.js canvas mount point */}
      <div ref={mountRef} style={{ width: '100%', height: '100%' }} />

      {engineReady && engineRef.current && (
        <>
          <HUD engine={engineRef.current} />
          {debugVisible && <DebugOverlay engine={engineRef.current} />}
        </>
      )}

      {!engineReady && <LoadingScreen />}
    </div>
  )
}

function LoadingScreen() {
  const { t } = useLocale()
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #0a0a0f 0%, #0d1b2a 50%, #0a0a0f 100%)',
        color: '#fff',
        gap: 24,
      }}
    >
      <h1
        style={{
          fontFamily: "'Orbitron', sans-serif",
          fontSize: 48,
          fontWeight: 900,
          background: 'linear-gradient(90deg, #00d4ff, #0088ff)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          letterSpacing: 4,
        }}
      >
        WORLD DRIVE
      </h1>
      <div style={{ color: '#888', fontSize: 14, letterSpacing: 2 }}>
        {t('core_loading_game')}
      </div>
      <div
        style={{
          width: 240,
          height: 2,
          background: '#1a1a2e',
          borderRadius: 1,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            background: 'linear-gradient(90deg, #00d4ff, #0088ff)',
            animation: 'progress 2s ease-in-out infinite',
          }}
        />
      </div>
      <style>{`
        @keyframes progress {
          0% { width: 0%; margin-left: 0 }
          50% { width: 100%; margin-left: 0 }
          100% { width: 0%; margin-left: 100% }
        }
      `}</style>
    </div>
  )
}
