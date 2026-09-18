import React, { useEffect, useState } from 'react'

export const OrientationPrompt: React.FC = () => {
  const [isPortrait, setIsPortrait] = useState(false)
  const [isTouchDevice, setIsTouchDevice] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const checkOrientation = () => {
      const touch =
        'ontouchstart' in window ||
        navigator.maxTouchPoints > 0 ||
        window.matchMedia('(pointer: coarse)').matches

      setIsTouchDevice(touch)

      const portrait = window.innerHeight > window.innerWidth
      setIsPortrait(portrait)
    }

    checkOrientation()
    window.addEventListener('resize', checkOrientation)
    window.addEventListener('orientationchange', checkOrientation)

    return () => {
      window.removeEventListener('resize', checkOrientation)
      window.removeEventListener('orientationchange', checkOrientation)
    }
  }, [])

  // Only show if in portrait on a touch-capable device (or narrow portrait screen) and not manually dismissed
  if (!isPortrait || !isTouchDevice || dismissed) {
    return null
  }

  const handleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen()
      }
    } catch {
      // Fullscreen not supported or blocked
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        background: 'radial-gradient(circle at center, rgba(10, 20, 40, 0.98) 0%, rgba(3, 7, 18, 0.99) 100%)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 24px',
        color: '#ffffff',
        textAlign: 'center',
        userSelect: 'none',
        animation: 'fadeIn 0.3s ease-out',
      }}
    >
      {/* Animated Rotating Smartphone Icon */}
      <div
        style={{
          position: 'relative',
          width: 80,
          height: 80,
          marginBottom: 32,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            width: 44,
            height: 76,
            border: '3px solid #00d4ff',
            borderRadius: 10,
            position: 'relative',
            animation: 'phoneRotate 2.4s ease-in-out infinite',
            boxShadow: '0 0 25px rgba(0, 212, 255, 0.5), inset 0 0 15px rgba(0, 212, 255, 0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0, 212, 255, 0.08)',
          }}
        >
          {/* Speaker notch */}
          <div
            style={{
              position: 'absolute',
              top: 5,
              width: 14,
              height: 3,
              background: '#00d4ff',
              borderRadius: 2,
              opacity: 0.8,
            }}
          />
          {/* Screen steering mini icon */}
          <span style={{ fontSize: 18, opacity: 0.85 }}>🏎️</span>
          {/* Home indicator */}
          <div
            style={{
              position: 'absolute',
              bottom: 4,
              width: 16,
              height: 2,
              background: '#00d4ff',
              borderRadius: 2,
              opacity: 0.8,
            }}
          />
        </div>

        {/* Orbiting rotation arrow */}
        <div
          style={{
            position: 'absolute',
            width: 86,
            height: 86,
            borderRadius: '50%',
            border: '2px dashed rgba(56, 189, 248, 0.4)',
            animation: 'spinSlow 6s linear infinite',
            pointerEvents: 'none',
          }}
        />
      </div>

      {/* Main Title */}
      <h2
        style={{
          fontFamily: "'Orbitron', sans-serif",
          fontSize: 22,
          fontWeight: 900,
          letterSpacing: 2.5,
          color: '#ffffff',
          textShadow: '0 0 20px rgba(0, 212, 255, 0.6)',
          margin: 0,
        }}
      >
        PIVOTEZ VOTRE ÉCRAN
      </h2>

      {/* Subtitle */}
      <p
        style={{
          fontFamily: "'Inter', sans-serif",
          fontSize: 14,
          color: 'rgba(255, 255, 255, 0.75)',
          maxWidth: 320,
          marginTop: 12,
          lineHeight: 1.5,
          letterSpacing: 0.3,
        }}
      >
        Pour une expérience de pilotage optimale avec les commandes à deux pouces, veuillez tourner votre appareil en mode <strong>horizontal (paysage)</strong>.
      </p>

      {/* Action buttons */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 28, width: '100%', maxWidth: 260 }}>
        {typeof document !== 'undefined' && 'fullscreenEnabled' in document && (
          <button
            onClick={handleFullscreen}
            style={{
              background: 'linear-gradient(135deg, rgba(2, 132, 199, 0.4) 0%, rgba(37, 99, 235, 0.6) 100%)',
              border: '1px solid #38bdf8',
              borderRadius: 14,
              padding: '12px 20px',
              color: '#ffffff',
              fontFamily: "'Orbitron', sans-serif",
              fontSize: 12,
              fontWeight: 800,
              letterSpacing: 1.5,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              boxShadow: '0 0 20px rgba(56, 189, 248, 0.35)',
            }}
          >
            <span>⛶</span>
            <span>PLEIN ÉCRAN</span>
          </button>
        )}

        <button
          onClick={() => setDismissed(true)}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'rgba(255, 255, 255, 0.4)',
            fontFamily: "'Inter', sans-serif",
            fontSize: 12,
            padding: '8px',
            cursor: 'pointer',
            textDecoration: 'underline',
          }}
        >
          Continuer quand même
        </button>
      </div>

      <style>{`
        @keyframes phoneRotate {
          0%, 20% {
            transform: rotate(0deg);
          }
          50%, 70% {
            transform: rotate(-90deg);
          }
          100% {
            transform: rotate(0deg);
          }
        }
        @keyframes spinSlow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </div>
  )
}
