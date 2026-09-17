import { useEffect, useRef, useState } from 'react'
import { GameEngine } from './game/GameEngine.js'
import { HUD } from './ui/HUD.js'
import { DebugOverlay } from './renderer/DebugOverlay.js'

export default function App() {
  const mountRef = useRef<HTMLDivElement>(null)
  const engineRef = useRef<GameEngine | null>(null)
  const [debugVisible, setDebugVisible] = useState(false)
  const [engineReady, setEngineReady] = useState(false)

  useEffect(() => {
    if (!mountRef.current) return
    let isMounted = true
    const engine = new GameEngine(mountRef.current)
    engineRef.current = engine

    engine
      .init()
      .then(() => {
        if (!isMounted) {
          engine.dispose()
          return
        }
        setEngineReady(true)
        engine.start()
      })
      .catch((err) => {
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
        INITIALISING PHYSICS ENGINE…
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
