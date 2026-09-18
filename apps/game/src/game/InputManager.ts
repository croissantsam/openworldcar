/**
 * InputManager — keyboard / gamepad input state.
 *
 * Provides a normalised PlayerInput snapshot every frame.
 * Does NOT send to the server; that's the networking layer's job.
 */

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

export class InputManager {
  private keys = new Set<string>()
  private disposed = false
  private virtualInput: RawInput = {
    throttle: 0,
    brake: 0,
    steering: 0,
    handbrake: false,
  }

  /**
   * Set virtual touch/mobile inputs.
   */
  setVirtualInput(partial: Partial<RawInput>): void {
    if (partial.throttle !== undefined) this.virtualInput.throttle = partial.throttle
    if (partial.brake !== undefined) this.virtualInput.brake = partial.brake
    if (partial.steering !== undefined) this.virtualInput.steering = partial.steering
    if (partial.handbrake !== undefined) this.virtualInput.handbrake = partial.handbrake
  }

  private readonly onKeyDown = (e: KeyboardEvent) => {
    // Do not capture game control keys if typing in a text field
    if (
      document.activeElement &&
      (document.activeElement.tagName === 'INPUT' ||
        document.activeElement.tagName === 'TEXTAREA')
    ) {
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
  }

  private readonly onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code)
    if (e.key) {
      this.keys.delete(e.key.toLowerCase())
    }
  }

  private readonly onBlur = () => {
    this.keys.clear()
  }

  constructor() {
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    window.addEventListener('blur', this.onBlur)
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

  isKeyDown(code: string): boolean {
    return this.keys.has(code)
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    window.removeEventListener('blur', this.onBlur)
    this.keys.clear()
  }
}
