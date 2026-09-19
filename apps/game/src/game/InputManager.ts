/**
 * InputManager — keyboard / gamepad / touch input state.
 *
 * Provides a normalised PlayerInput snapshot every frame (car), and a
 * FlightInput snapshot (plane).
 * Does NOT send to the server; that's the networking layer's job.
 */

import type { FlightInput } from '../vehicles/PlayerPlane.js'

export type RawInput = {
  /** [0, 1] */
  throttle: number
  /** [0, 1] */
  brake: number
  /** [-1, 1] — negative = left */
  steering: number
  /** Handbrake */
  handbrake: boolean
}

/** Raw virtual joystick state written by the touch controls. */
export type VirtualStick = {
  /** [-1, 1] — negative = left */
  x: number
  /** [-1, 1] — negative = pushed UP (away from the player) */
  y: number
  /** FREIN button held */
  brake: boolean
}

/** Touch auto-throttle while flying with the on-screen controls. */
const TOUCH_AUTO_THROTTLE = 0.75
const GAMEPAD_DEADZONE = 0.12

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

function deadzone(v: number | undefined): number {
  if (v === undefined || !Number.isFinite(v)) return 0
  const a = Math.abs(v)
  if (a < GAMEPAD_DEADZONE) return 0
  return Math.sign(v) * Math.min(1, (a - GAMEPAD_DEADZONE) / (1 - GAMEPAD_DEADZONE))
}

export class InputManager {
  private keys = new Set<string>()
  private disposed = false
  private virtualInput: RawInput = {
    throttle: 0,
    brake: 0,
    steering: 0,
    handbrake: false,
  }
  private virtualStick: VirtualStick = { x: 0, y: 0, brake: false }
  /** True while the on-screen touch controls are shown (they drive the auto-throttle). */
  private touchControlsActive = false
  /** Machine-gun trigger from the on-screen 🔫 button. */
  private virtualFire = false
  /** Left mouse button held over the canvas (not over a HUD control). */
  private mouseFire = false

  /**
   * Called on P (toggle car / plane) and Shift+P (take off: plane in the air).
   * Set by the GameEngine.
   */
  onVehicleToggle: ((airborne: boolean) => void) | null = null

  /**
   * Set virtual touch/mobile inputs.
   */
  setVirtualInput(partial: Partial<RawInput>): void {
    if (partial.throttle !== undefined) this.virtualInput.throttle = partial.throttle
    if (partial.brake !== undefined) this.virtualInput.brake = partial.brake
    if (partial.steering !== undefined) this.virtualInput.steering = partial.steering
    if (partial.handbrake !== undefined) this.virtualInput.handbrake = partial.handbrake
  }

  /** Raw joystick position + FREIN button from the touch controls (used in flight). */
  setVirtualStick(partial: Partial<VirtualStick>): void {
    if (partial.x !== undefined && Number.isFinite(partial.x)) this.virtualStick.x = clamp(partial.x, -1, 1)
    if (partial.y !== undefined && Number.isFinite(partial.y)) this.virtualStick.y = clamp(partial.y, -1, 1)
    if (partial.brake !== undefined) this.virtualStick.brake = partial.brake
  }

  /** Whether the on-screen touch controls are visible. */
  setTouchControlsActive(active: boolean): void {
    this.touchControlsActive = active
    if (!active) {
      this.virtualStick = { x: 0, y: 0, brake: false }
      this.virtualFire = false
    }
  }

  /** Machine-gun trigger from the touch controls (held). */
  setVirtualFire(on: boolean): void {
    this.virtualFire = on === true
  }

  private isTyping(): boolean {
    const el = document.activeElement
    return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')
  }

  private readonly onKeyDown = (e: KeyboardEvent) => {
    // Do not capture game control keys if typing in a text field
    if (this.isTyping()) {
      return
    }

    this.keys.add(e.code)
    if (e.key) {
      this.keys.add(e.key.toLowerCase())
    }
    // Prevent default scroll actions for game controls
    if (
      e.code === 'Space' ||
      e.code === 'ArrowUp' ||
      e.code === 'ArrowDown' ||
      e.code === 'ArrowLeft' ||
      e.code === 'ArrowRight'
    ) {
      e.preventDefault()
    }

    // P: car <-> plane. Shift+P: plane, directly in the air.
    if (
      !e.repeat &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.altKey &&
      (e.code === 'KeyP' || e.key === 'p' || e.key === 'P')
    ) {
      this.onVehicleToggle?.(e.shiftKey)
    }
  }

  private readonly onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code)
    if (e.key) {
      this.keys.delete(e.key.toLowerCase())
    }
  }

  private readonly onBlur = () => {
    this.keys.clear()
    this.mouseFire = false
  }

  /**
   * Only a click on the 3D view itself fires. Allow-listing the canvas rather
   * than blocking known controls: the HUD is mostly plain divs (minimap, modal
   * backdrops, search results, panels), and any of them would otherwise shoot.
   */
  private static overViewport(target: EventTarget | null): boolean {
    const el = target as Element | null
    return !!el && (el as Element).tagName === 'CANVAS'
  }

  private readonly onMouseDown = (e: MouseEvent) => {
    if (e.button !== 0) return
    if (!InputManager.overViewport(e.target)) return
    this.mouseFire = true
  }

  private readonly onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) this.mouseFire = false
  }

  /**
   * The button can be released outside the window, where no mouseup reaches us.
   * `buttons` is authoritative on the next move, so the guns never stay stuck on.
   */
  private readonly onMouseMove = (e: MouseEvent) => {
    if (this.mouseFire && e.buttons === 0) this.mouseFire = false
  }

  constructor() {
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    window.addEventListener('blur', this.onBlur)
    window.addEventListener('mousedown', this.onMouseDown)
    window.addEventListener('mouseup', this.onMouseUp)
    window.addEventListener('mousemove', this.onMouseMove)
  }

  /**
   * Returns the current raw input state.
   * Called once per frame by the game loop.
   */
  getInput(): RawInput {
    // Forward / Accelerate: W (QWERTY), Z (AZERTY), ArrowUp
    const up =
      this.keys.has('KeyW') ||
      this.keys.has('KeyZ') ||
      this.keys.has('ArrowUp') ||
      this.keys.has('w') ||
      this.keys.has('z') ||
      this.keys.has('arrowup')

    // Brake / Reverse: S, ArrowDown
    const down =
      this.keys.has('KeyS') ||
      this.keys.has('ArrowDown') ||
      this.keys.has('s') ||
      this.keys.has('arrowdown')

    // Steer Left: A (QWERTY), Q (AZERTY), ArrowLeft
    const left =
      this.keys.has('KeyA') ||
      this.keys.has('KeyQ') ||
      this.keys.has('ArrowLeft') ||
      this.keys.has('a') ||
      this.keys.has('q') ||
      this.keys.has('arrowleft')

    // Steer Right: D, ArrowRight
    const right =
      this.keys.has('KeyD') ||
      this.keys.has('ArrowRight') ||
      this.keys.has('d') ||
      this.keys.has('arrowright')

    // Handbrake: Space
    const handbrake =
      this.keys.has('Space') ||
      this.keys.has(' ') ||
      this.keys.has('space')

    const kThrottle = up ? 1 : 0
    const kBrake = down ? 1 : 0
    const kSteer = left ? -1 : right ? 1 : 0
    const kHandbrake = handbrake

    return {
      throttle: Math.max(kThrottle, Math.min(1, Math.max(0, this.virtualInput.throttle))),
      brake: Math.max(kBrake, Math.min(1, Math.max(0, this.virtualInput.brake))),
      steering: kSteer !== 0 ? kSteer : Math.min(1, Math.max(-1, this.virtualInput.steering)),
      handbrake: kHandbrake || this.virtualInput.handbrake,
    }
  }

  /**
   * Flight controls (plane mode). Keyboard first, then gamepad, then touch.
   *
   * Keyboard: W/Z throttle up, S throttle down, ↓ pull (nose up), ↑ push
   * (nose down), A/Q/← roll left, D/→ roll right, Space wheel brakes.
   */
  getFlightInput(): FlightInput {
    const k = this.keys
    const kThrottleUp = k.has('KeyW') || k.has('KeyZ') || k.has('w') || k.has('z')
    const kThrottleDown = k.has('KeyS') || k.has('s')
    const kNoseDown = k.has('ArrowUp') || k.has('arrowup')
    const kNoseUp = k.has('ArrowDown') || k.has('arrowdown')
    const kLeft =
      k.has('KeyA') || k.has('KeyQ') || k.has('ArrowLeft') || k.has('a') || k.has('q') || k.has('arrowleft')
    const kRight = k.has('KeyD') || k.has('ArrowRight') || k.has('d') || k.has('arrowright')
    const kBrake = k.has('Space') || k.has(' ') || k.has('space')
    const kFire = k.has('KeyF') || k.has('f')

    const kPitch = (kNoseUp ? 1 : 0) - (kNoseDown ? 1 : 0)
    const kRoll = (kRight ? 1 : 0) - (kLeft ? 1 : 0)

    // ── Gamepad (standard mapping) ────────────────────────────────────────
    let gpRoll = 0
    let gpPitch = 0
    let gpYaw = 0
    let gpThrottleSet: number | undefined
    let gpThrottleDown = false
    let gpBrake = false
    let gpFire = false
    const pad = this.getGamepad()
    if (pad) {
      gpRoll = deadzone(pad.axes[0])
      // Stick forward (axis < 0) = push = nose down
      gpPitch = deadzone(pad.axes[1])
      gpYaw = deadzone(pad.axes[2])
      const rt = pad.buttons[7]
      const lt = pad.buttons[6]
      const rtValue = rt ? (rt.value > 0 ? rt.value : rt.pressed ? 1 : 0) : 0
      if (rtValue > 0.05) gpThrottleSet = clamp(rtValue, 0, 1)
      gpThrottleDown = !!lt && (lt.pressed || lt.value > 0.3)
      gpBrake = !!pad.buttons[0]?.pressed
      // Right bumper (5) or X / square (2): machine guns.
      gpFire = !!pad.buttons[5]?.pressed || !!pad.buttons[2]?.pressed
    }

    // ── Touch (virtual joystick + FREIN) ─────────────────────────────────
    const touch = this.touchControlsActive
    const vRoll = touch ? this.virtualStick.x : 0
    // Joystick pushed up (y < 0) = nose down
    const vPitch = touch ? this.virtualStick.y : 0
    const vBrake = touch && this.virtualStick.brake

    const pick = (a: number, b: number, c: number): number =>
      clamp(a !== 0 ? a : b !== 0 ? b : c, -1, 1)

    const input: FlightInput = {
      throttleUp: kThrottleUp,
      throttleDown: kThrottleDown || gpThrottleDown,
      pitch: pick(kPitch, gpPitch, vPitch),
      roll: pick(kRoll, gpRoll, vRoll),
      yaw: clamp(gpYaw, -1, 1),
      brake: kBrake || gpBrake || vBrake,
      fire: kFire || this.mouseFire || gpFire || (touch && this.virtualFire),
    }

    // Absolute throttle: only when no throttle key is held
    if (!kThrottleUp && !kThrottleDown) {
      if (gpThrottleSet !== undefined) {
        input.throttleSet = gpThrottleSet
      } else if (touch && !gpThrottleDown) {
        input.throttleSet = vBrake ? 0 : TOUCH_AUTO_THROTTLE
      }
    }
    return input
  }

  private getGamepad(): Gamepad | null {
    if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return null
    let pads: (Gamepad | null)[]
    try {
      pads = Array.from(navigator.getGamepads())
    } catch {
      return null
    }
    for (const p of pads) {
      if (p && p.connected && p.axes.length >= 2) return p
    }
    return null
  }

  isKeyDown(code: string): boolean {
    return this.keys.has(code)
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.onVehicleToggle = null
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    window.removeEventListener('blur', this.onBlur)
    window.removeEventListener('mousedown', this.onMouseDown)
    window.removeEventListener('mouseup', this.onMouseUp)
    window.removeEventListener('mousemove', this.onMouseMove)
    this.keys.clear()
    this.mouseFire = false
    this.virtualFire = false
  }
}
