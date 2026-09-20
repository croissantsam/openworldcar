/**
 * FootCamera — over-the-shoulder chase camera for the player on foot.
 *
 * Same shape as FlightCamera: it owns the shared perspective camera while the
 * player walks, smooths its own yaw toward the character, pulls in when a wall
 * would clip it, and carries the trauma shake the combat code already drives.
 */

import * as THREE from 'three'
import type { PlayerCharacter } from '../characters/PlayerCharacter.js'

/** Distance behind the character when standing, m. */
const DIST_REST = 4.6
/** Distance when running flat out, m. */
const DIST_FAST = 6.2
const HEIGHT_REST = 2.0
const HEIGHT_FAST = 2.3
/** Speed at which the "fast" framing is fully reached, m/s. */
const FAST_SPEED = 5.6
const FOV_REST = 58
const FOV_FAST = 66
/** Look at this height above the feet, m: roughly the chest. */
const FOCUS_HEIGHT = 1.25
/** Slight offset to the right, so the character does not sit dead centre, m. */
const SHOULDER = 0.55

const YAW_RATE = 6.0
const DIST_RATE = 4.0
const FOV_RATE = 3.0
const TRAUMA_DECAY = 2

/** Camera sphere kept out of walls. */
const ARM_RADIUS = 0.3
const ARM_MIN = 0.35
const ARM_OUT_RATE = 3.0

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v)
const finite = (v: number, fallback: number): number => (Number.isFinite(v) ? v : fallback)

export class FootCamera {
  private camera: THREE.PerspectiveCamera
  private character: PlayerCharacter

  private yaw = 0
  private speedS = 0
  private fov = FOV_REST
  private dist = DIST_REST
  private arm = 1
  private trauma = 0
  private shakeT = 0

  private readonly focus = new THREE.Vector3()
  private readonly desired = new THREE.Vector3()
  private readonly offset = new THREE.Vector3()
  private readonly tmp = new THREE.Vector3()

  private saved: { fov: number; near: number; far: number } | null = null

  constructor(camera: THREE.PerspectiveCamera, character: PlayerCharacter) {
    this.camera = camera
    this.character = character
    this.saved = { fov: camera.fov, near: camera.near, far: camera.far }
    camera.near = 0.15
    camera.far = 4000
    camera.updateProjectionMatrix()
    this.snap()
  }

  /** Jump straight to the framing, with no smoothing: spawn, respawn, mode change. */
  snap(): void {
    this.yaw = finite(this.character.getYaw(), 0)
    this.speedS = 0
    this.dist = DIST_REST
    this.fov = FOV_REST
    this.arm = 1
    this.trauma = 0
    this._place(0)
  }

  addTrauma(amount: number): void {
    if (!Number.isFinite(amount)) return
    this.trauma = clamp(this.trauma + amount, 0, 1)
  }

  update(dt: number): void {
    const step = clamp(dt, 0, 0.1)

    const targetYaw = finite(this.character.getYaw(), this.yaw)
    let d = targetYaw - this.yaw
    while (d > Math.PI) d -= Math.PI * 2
    while (d < -Math.PI) d += Math.PI * 2
    this.yaw += d * (1 - Math.exp(-YAW_RATE * step))

    const state = this.character.getState()
    const speed = finite(state.speed, 0)
    this.speedS += (speed - this.speedS) * (1 - Math.exp(-3 * step))
    const t = clamp(this.speedS / FAST_SPEED, 0, 1)

    const wantDist = DIST_REST + (DIST_FAST - DIST_REST) * t
    this.dist += (wantDist - this.dist) * (1 - Math.exp(-DIST_RATE * step))

    const wantFov = FOV_REST + (FOV_FAST - FOV_REST) * t
    this.fov += (wantFov - this.fov) * (1 - Math.exp(-FOV_RATE * step))

    if (this.trauma > 0) this.trauma = Math.max(0, this.trauma - TRAUMA_DECAY * step)
    this.shakeT += step

    this._place(t)
  }

  private _place(t: number): void {
    this.character.getHeadPosition(this.tmp)
    // getHeadPosition gives the eyes; frame the chest instead.
    this.focus.set(this.tmp.x, this.tmp.y - 1.5 + FOCUS_HEIGHT, this.tmp.z)
    if (!Number.isFinite(this.focus.x) || !Number.isFinite(this.focus.y) || !Number.isFinite(this.focus.z)) {
      return
    }

    const sy = Math.sin(this.yaw)
    const cy = Math.cos(this.yaw)
    const height = HEIGHT_REST + (HEIGHT_FAST - HEIGHT_REST) * t

    // The character faces +Z in its own frame, so "behind" is -forward.
    this.offset.set(-sy * this.dist + cy * SHOULDER, height, -cy * this.dist - sy * SHOULDER)
    this.desired.copy(this.focus).add(this.offset)

    // Keep the camera out of walls by pulling it along the arm.
    const free = this._freeArm()
    this.arm = free < this.arm ? free : this.arm + (free - this.arm) * (1 - Math.exp(-ARM_OUT_RATE * 0.016))
    const armed = clamp(this.arm, ARM_MIN, 1)
    this.desired.lerpVectors(this.focus, this.desired, armed)

    if (this.trauma > 0) {
      const s = this.trauma * this.trauma * 0.28
      this.desired.x += Math.sin(this.shakeT * 37) * s
      this.desired.y += Math.sin(this.shakeT * 43 + 1.7) * s
      this.desired.z += Math.cos(this.shakeT * 31 + 0.6) * s
    }

    this.camera.position.copy(this.desired)
    this.camera.lookAt(this.focus)
    if (Math.abs(this.camera.fov - this.fov) > 0.01) {
      this.camera.fov = this.fov
      this.camera.updateProjectionMatrix()
    }
  }

  /** Fraction of the focus → desired segment that is clear of walls. */
  private _freeArm(): number {
    const free = this.character.sweepCameraArm(this.focus, this.desired, ARM_RADIUS)
    return free < 0 ? 1 : clamp(free, ARM_MIN, 1)
  }

  dispose(): void {
    if (this.saved) {
      this.camera.fov = this.saved.fov
      this.camera.near = this.saved.near
      this.camera.far = this.saved.far
      this.camera.updateProjectionMatrix()
      this.saved = null
    }
  }
}
