import React, { useEffect, useState, useRef, useCallback } from 'react'
import type { GameEngine } from '../game/GameEngine.js'

interface TouchControlsProps {
  engine: GameEngine
  visible?: boolean
}

const MAX_RADIUS = 34 // Max pixel travel for the smaller joystick knob
const DEADZONE = 0.08

export const TouchControls: React.FC<TouchControlsProps> = ({
  engine,
  visible = true,
}) => {
  // Joystick knob offset from base center
  const [knobPos, setKnobPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [isJoystickActive, setIsJoystickActive] = useState(false)
  const [isBraking, setIsBraking] = useState(false)

  const joystickTouchId = useRef<number | null>(null)
  const brakeTouchId = useRef<number | null>(null)
  const baseRef = useRef<HTMLDivElement>(null)

  // Cache base center in viewport coordinates
  const baseCenterRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })

  const triggerHaptic = (ms = 12) => {
    try {
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate(ms)
      }
    } catch {
      // Haptics not available
    }
  }

  // Measure base center
  const updateBaseCenter = useCallback(() => {
    if (baseRef.current) {
      const rect = baseRef.current.getBoundingClientRect()
      baseCenterRef.current = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      }
    }
  }, [])

  useEffect(() => {
    updateBaseCenter()
    window.addEventListener('resize', updateBaseCenter)
    window.addEventListener('orientationchange', updateBaseCenter)
    return () => {
      window.removeEventListener('resize', updateBaseCenter)
      window.removeEventListener('orientationchange', updateBaseCenter)
    }
  }, [updateBaseCenter])

  // ── Apply inputs to GameEngine ─────────────────────────────────────────────
  const applyInputs = useCallback(
    (kx: number, ky: number, brakingNow: boolean) => {
      const normX = kx / MAX_RADIUS // [-1, 1] Left (-) / Right (+)
      const normY = ky / MAX_RADIUS // [-1, 1] Up (-) / Down (+)

      // Steering
      let steering = 0
      if (Math.abs(normX) > DEADZONE) {
        steering = Math.sign(normX) * ((Math.abs(normX) - DEADZONE) / (1 - DEADZONE))
        steering = Math.min(1, Math.max(-1, steering))
      }

      // Throttle (pushed forward / UP)
      let throttle = 0
      if (normY < -DEADZONE && !brakingNow) {
        throttle = (-normY - DEADZONE) / (1 - DEADZONE)
        throttle = Math.min(1, Math.max(0, throttle))
      }

      // Reverse (pulled backward / DOWN)
      let reverse = 0
      if (normY > 0.12 && !brakingNow) {
        reverse = (normY - 0.12) / (1 - 0.12)
        reverse = Math.min(1, Math.max(0, reverse))
      }

      // Brake & Handbrake
      const brake = brakingNow ? 1 : reverse
      const handbrake = brakingNow

      engine.input.setVirtualInput({
        throttle,
        brake,
        steering,
        handbrake,
      })
    },
    [engine],
  )

  // ── Joystick touch event listeners ─────────────────────────────────────────
  const handleJoystickTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    updateBaseCenter()

    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i]
      if (touch && joystickTouchId.current === null) {
        joystickTouchId.current = touch.identifier
        setIsJoystickActive(true)
        triggerHaptic(8)

        const dx = touch.clientX - baseCenterRef.current.x
        const dy = touch.clientY - baseCenterRef.current.y
        const dist = Math.hypot(dx, dy)
        const ratio = dist > MAX_RADIUS ? MAX_RADIUS / dist : 1
        const kx = dx * ratio
        const ky = dy * ratio

        setKnobPos({ x: kx, y: ky })
        applyInputs(kx, ky, isBraking)
        break
      }
    }
  }

  const handleJoystickTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()

    if (joystickTouchId.current === null) return

    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i]
      if (touch && touch.identifier === joystickTouchId.current) {
        const dx = touch.clientX - baseCenterRef.current.x
        const dy = touch.clientY - baseCenterRef.current.y
        const dist = Math.hypot(dx, dy)
        const ratio = dist > MAX_RADIUS ? MAX_RADIUS / dist : 1
        const kx = dx * ratio
        const ky = dy * ratio

        setKnobPos({ x: kx, y: ky })
        applyInputs(kx, ky, isBraking)
        break
      }
    }
  }

  const handleJoystickTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()

    if (joystickTouchId.current === null) return

    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i]
      if (touch && touch.identifier === joystickTouchId.current) {
        joystickTouchId.current = null
        setIsJoystickActive(false)
        setKnobPos({ x: 0, y: 0 })
        applyInputs(0, 0, isBraking)
        break
      }
    }
  }

  // ── Mouse fallback for desktop testing ────────────────────────────────────
  const isMouseDownRef = useRef(false)

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault()
    updateBaseCenter()
    isMouseDownRef.current = true
    setIsJoystickActive(true)

    const dx = e.clientX - baseCenterRef.current.x
    const dy = e.clientY - baseCenterRef.current.y
    const dist = Math.hypot(dx, dy)
    const ratio = dist > MAX_RADIUS ? MAX_RADIUS / dist : 1
    const kx = dx * ratio
    const ky = dy * ratio

    setKnobPos({ x: kx, y: ky })
    applyInputs(kx, ky, isBraking)

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!isMouseDownRef.current) return
      const mdx = moveEvent.clientX - baseCenterRef.current.x
      const mdy = moveEvent.clientY - baseCenterRef.current.y
      const mdist = Math.hypot(mdx, mdy)
      const mratio = mdist > MAX_RADIUS ? MAX_RADIUS / mdist : 1
      const mkx = mdx * mratio
      const mky = mdy * mratio
      setKnobPos({ x: mkx, y: mky })
      applyInputs(mkx, mky, isBraking)
    }

    const onMouseUp = () => {
      isMouseDownRef.current = false
      setIsJoystickActive(false)
      setKnobPos({ x: 0, y: 0 })
      applyInputs(0, 0, isBraking)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  // ── Brake Button Touch Handlers ───────────────────────────────────────────
  const handleBrakeStart = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    triggerHaptic(20)
    setIsBraking(true)
    applyInputs(knobPos.x, knobPos.y, true)
  }

  const handleBrakeEnd = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsBraking(false)
    applyInputs(knobPos.x, knobPos.y, false)
  }

  if (!visible) {
    return null
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 50,
        userSelect: 'none',
        WebkitUserSelect: 'none',
        touchAction: 'none',
      }}
    >
      {/* ── Left Thumb Zone: Virtual Analog Joystick (Compact) ─────────── */}
      <div
        style={{
          position: 'absolute',
          bottom: 'max(16px, env(safe-area-inset-bottom, 16px))',
          left: 'max(20px, env(safe-area-inset-left, 20px))',
          width: 96,
          height: 96,
          pointerEvents: 'auto',
          touchAction: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        onTouchStart={handleJoystickTouchStart}
        onTouchMove={handleJoystickTouchMove}
        onTouchEnd={handleJoystickTouchEnd}
        onTouchCancel={handleJoystickTouchEnd}
        onMouseDown={handleMouseDown}
      >
        {/* Joystick Base Circle */}
        <div
          ref={baseRef}
          style={{
            position: 'relative',
            width: 88,
            height: 88,
            borderRadius: '50%',
            background: isJoystickActive
              ? 'radial-gradient(circle, rgba(0, 212, 255, 0.12) 0%, rgba(8, 16, 32, 0.6) 75%)'
              : 'radial-gradient(circle, rgba(15, 23, 42, 0.3) 0%, rgba(8, 14, 26, 0.45) 100%)',
            border: isJoystickActive
              ? '2px solid rgba(0, 212, 255, 0.7)'
              : '1.5px solid rgba(56, 189, 248, 0.25)',
            boxShadow: isJoystickActive
              ? '0 0 20px rgba(0, 212, 255, 0.35), inset 0 0 12px rgba(0, 212, 255, 0.15)'
              : '0 4px 16px rgba(0, 0, 0, 0.4)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
          }}
        >
          {/* Subtle directional chevrons */}
          <span
            style={{
              position: 'absolute',
              top: 4,
              fontSize: 8,
              color: isJoystickActive && knobPos.y < -12 ? '#00d4ff' : 'rgba(56, 189, 248, 0.35)',
              fontWeight: 900,
              transition: 'color 0.1s',
            }}
          >
            ▲
          </span>
          <span
            style={{
              position: 'absolute',
              bottom: 4,
              fontSize: 8,
              color: isJoystickActive && knobPos.y > 12 ? '#f87171' : 'rgba(56, 189, 248, 0.35)',
              fontWeight: 900,
              transition: 'color 0.1s',
            }}
          >
            ▼
          </span>
          <span
            style={{
              position: 'absolute',
              left: 5,
              fontSize: 8,
              color: isJoystickActive && knobPos.x < -12 ? '#00d4ff' : 'rgba(56, 189, 248, 0.35)',
              fontWeight: 900,
              transition: 'color 0.1s',
            }}
          >
            ◀
          </span>
          <span
            style={{
              position: 'absolute',
              right: 5,
              fontSize: 8,
              color: isJoystickActive && knobPos.x > 12 ? '#00d4ff' : 'rgba(56, 189, 248, 0.35)',
              fontWeight: 900,
              transition: 'color 0.1s',
            }}
          >
            ▶
          </span>

          {/* Crosshair guide lines */}
          <div
            style={{
              position: 'absolute',
              width: '60%',
              height: 1,
              background: 'rgba(56, 189, 248, 0.12)',
              pointerEvents: 'none',
            }}
          />
          <div
            style={{
              position: 'absolute',
              height: '60%',
              width: 1,
              background: 'rgba(56, 189, 248, 0.12)',
              pointerEvents: 'none',
            }}
          />

          {/* Joystick Movable Thumb Knob */}
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: '50%',
              background: isJoystickActive
                ? 'linear-gradient(135deg, #00d4ff 0%, #0284c7 100%)'
                : 'linear-gradient(135deg, rgba(30, 41, 59, 0.8) 0%, rgba(15, 23, 42, 0.85) 100%)',
              border: isJoystickActive
                ? '2px solid #ffffff'
                : '1.5px solid rgba(0, 212, 255, 0.5)',
              boxShadow: isJoystickActive
                ? '0 0 16px rgba(0, 212, 255, 0.7), inset 0 0 6px rgba(255, 255, 255, 0.4)'
                : '0 4px 10px rgba(0, 0, 0, 0.5), inset 0 0 5px rgba(0, 212, 255, 0.2)',
              transform: `translate(${knobPos.x}px, ${knobPos.y}px)`,
              transition: isJoystickActive ? 'none' : 'transform 0.18s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'grab',
              pointerEvents: 'none',
            }}
          >
            {/* Knob metallic core dot */}
            <div
              style={{
                width: 12,
                height: 12,
                borderRadius: '50%',
                background: isJoystickActive ? '#ffffff' : 'rgba(0, 212, 255, 0.75)',
                boxShadow: isJoystickActive ? '0 0 6px #ffffff' : '0 0 4px rgba(0, 212, 255, 0.4)',
              }}
            />
          </div>
        </div>
      </div>

      {/* ── Right Thumb Zone: Sole Brake Button (FREIN) ──────────────────── */}
      <div
        style={{
          position: 'absolute',
          bottom: 'max(20px, env(safe-area-inset-bottom, 20px))',
          right: 'max(24px, env(safe-area-inset-right, 24px))',
          pointerEvents: 'auto',
          touchAction: 'none',
        }}
      >
        <button
          onTouchStart={handleBrakeStart}
          onTouchEnd={handleBrakeEnd}
          onTouchCancel={handleBrakeEnd}
          onMouseDown={handleBrakeStart}
          onMouseUp={handleBrakeEnd}
          onMouseLeave={handleBrakeEnd}
          style={{
            width: 80,
            height: 80,
            borderRadius: '50%',
            background: isBraking
              ? 'radial-gradient(circle, rgba(239, 68, 68, 0.9) 0%, rgba(185, 28, 28, 0.98) 100%)'
              : 'radial-gradient(circle, rgba(239, 68, 68, 0.2) 0%, rgba(15, 23, 42, 0.6) 100%)',
            border: isBraking ? '2.5px solid #ef4444' : '1.5px solid rgba(239, 68, 68, 0.55)',
            boxShadow: isBraking
              ? '0 0 30px rgba(239, 68, 68, 0.8), inset 0 0 14px rgba(239, 68, 68, 0.5)'
              : '0 4px 20px rgba(0, 0, 0, 0.5), inset 0 0 8px rgba(239, 68, 68, 0.2)',
            transform: isBraking ? 'scale(0.92)' : 'scale(1)',
            transition: 'transform 0.08s ease, background 0.1s ease, border-color 0.1s ease',
            color: '#ffffff',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
          }}
        >
          <span style={{ fontSize: 20, lineHeight: 1 }}>🛑</span>
          <span
            style={{
              fontFamily: "'Orbitron', sans-serif",
              fontSize: 10,
              fontWeight: 900,
              letterSpacing: 1.5,
              marginTop: 3,
              color: isBraking ? '#ffffff' : '#f87171',
              textShadow: isBraking ? '0 0 8px #ffffff' : '0 0 6px rgba(239, 68, 68, 0.4)',
            }}
          >
            FREIN
          </span>
        </button>
      </div>
    </div>
  )
}
