/**
 * FlightCamera — chase camera for the player's plane.
 *
 * Sits behind and above the plane along a smoothed heading that follows the
 * velocity when airborne (the nose on the ground), partially follows climbs /
 * dives, rolls with ~35 % of the bank, widens its FOV with speed and never
 * dips under the ground. All smoothing is dt-based (k = 1 − e^(−rate·dt)); the
 * camera is glued to the plane's interpolated transform (no positional lag, so
 * no jitter), only its orientation around the plane is smoothed.
 * No per-frame allocations.
 */

import * as THREE from 'three'
import type { PlayerPlane } from '../vehicles/PlayerPlane.js'

const DIST_REST = 11
const DIST_FAST = 16
const HEIGHT_REST = 3.2
const HEIGHT_FAST = 4.5
const FAST_SPEED = 60
const FOV_REST = 60
const FOV_FAST = 70
const FOCUS_HEIGHT = 1.3 // fuselage centre above the reference point (wheels)
const LOOK_AHEAD_REST = 4
const LOOK_AHEAD_FAST = 9
const PITCH_FOLLOW = 0.55 // share of the flight-path pitch the camera follows
const PITCH_LIMIT = 0.5 // rad
const ROLL_SHARE = 0.35
const MIN_CLEARANCE = 1.5

const YAW_RATE = 3.2
const PITCH_RATE = 2.6
const ROLL_RATE = 4
const DIST_RATE = 1.6
const FOV_RATE = 2
const TRAUMA_DECAY = 2 // per second (≈ 0.5 s from full)
const ARM_RADIUS = 0.4 // camera sphere kept out of building walls
const ARM_MIN = 0.12
const ARM_OUT_RATE = 2.5 // pulls back out smoothly; comes in instantly

function expK(rate: number, dt: number): number {
  return 1 - Math.exp(-rate * dt)
}
function wrapAngle(a: number): number {
  let x = a
  while (x > Math.PI) x -= Math.PI * 2
  while (x < -Math.PI) x += Math.PI * 2
  return x
}

export class FlightCamera {
  private camera: THREE.PerspectiveCamera
  private plane: PlayerPlane

  private yaw = 0
  private pitch = 0
  private roll = 0
  private speedS = 0
  private fov = FOV_REST
  private trauma = 0
  private time = 0
  private arm = 1
  private initialised = false

  private readonly focus = new THREE.Vector3()
  private readonly lastFocus = new THREE.Vector3()
  private readonly dir = new THREE.Vector3()
  private readonly look = new THREE.Vector3()
  private readonly vel = new THREE.Vector3()
  private readonly fwd = new THREE.Vector3()
  private readonly up = new THREE.Vector3()
  private readonly worldUp = new THREE.Vector3(0, 1, 0)

  constructor(camera: THREE.PerspectiveCamera, plane: PlayerPlane) {
    this.camera = camera
    this.plane = plane
  }

  addTrauma(amount: number): void {
    if (!Number.isFinite(amount)) return
    this.trauma = Math.min(1, this.trauma + Math.max(0, amount))
  }

  /** Place the camera instantly behind the plane (spawn / reset). */
  snap(): void {
    this.initialised = false
    this.trauma = 0
    this.update(0)
  }

  update(dtIn: number): void {
    const dt = Number.isFinite(dtIn) ? Math.min(Math.max(dtIn, 0), 0.1) : 0
    const mesh = this.plane.getMesh()
    const q = mesh.quaternion

    // Focus: fuselage centre of the interpolated plane
    this.up.set(0, 1, 0).applyQuaternion(q)
    this.focus.copy(mesh.position).addScaledVector(this.up, FOCUS_HEIGHT)

    // A teleport / respawn → snap instead of sweeping across the map
    if (this.initialised && this.focus.distanceToSquared(this.lastFocus) > 60 * 60) this.initialised = false
    this.lastFocus.copy(this.focus)
    const snap = !this.initialised

    this.plane.readVelocity(this.vel)
    const speed = this.vel.length()
    const onGround = this.plane.isOnGround()

    // Chase direction: velocity when flying, nose on the ground (or when slow)
    this.fwd.set(0, 0, 1).applyQuaternion(q)
    const wVel = onGround || !Number.isFinite(speed) ? 0 : Math.min(1, Math.max(0, (speed - 6) / 10))
    this.dir.copy(this.fwd).multiplyScalar(1 - wVel)
    if (wVel > 0 && speed > 1e-3) this.dir.addScaledVector(this.vel, wVel / speed)
    const hLen = Math.hypot(this.dir.x, this.dir.z)
    const targetPitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, Math.atan2(this.dir.y, Math.max(hLen, 1e-6)) * PITCH_FOLLOW))

    // Bank of the plane (right wing down +)
    const bank = this.plane.getBank()
    const targetRoll = Math.abs(bank) < Math.PI / 2 ? bank * ROLL_SHARE : Math.sign(bank) * (Math.PI - Math.abs(bank)) * ROLL_SHARE

    if (snap) {
      this.yaw = hLen > 1e-3 ? Math.atan2(this.dir.x, this.dir.z) : Math.atan2(this.fwd.x, this.fwd.z)
      this.pitch = targetPitch
      this.roll = targetRoll
      this.speedS = speed
      this.fov = FOV_REST + (FOV_FAST - FOV_REST) * Math.min(1, speed / FAST_SPEED)
      this.initialised = true
    } else {
      // Heading: only when the direction has a horizontal component (vertical flight keeps the last one)
      if (hLen > 0.15) {
        const targetYaw = Math.atan2(this.dir.x, this.dir.z)
        this.yaw = wrapAngle(this.yaw + wrapAngle(targetYaw - this.yaw) * expK(YAW_RATE, dt))
      }
      this.pitch += (targetPitch - this.pitch) * expK(PITCH_RATE, dt)
      this.roll += (targetRoll - this.roll) * expK(ROLL_RATE, dt)
      this.speedS += ((Number.isFinite(speed) ? speed : 0) - this.speedS) * expK(DIST_RATE, dt)
    }

    // Offset behind / above along the smoothed heading
    const s = Math.min(1, Math.max(0, this.speedS / FAST_SPEED))
    const dist = DIST_REST + (DIST_FAST - DIST_REST) * s
    const height = HEIGHT_REST + (HEIGHT_FAST - HEIGHT_REST) * s
    const cp = Math.cos(this.pitch)
    const dx = Math.sin(this.yaw) * cp
    const dy = Math.sin(this.pitch)
    const dz = Math.cos(this.yaw) * cp
    const cam = this.camera.position
    cam.set(
      mesh.position.x - dx * dist,
      mesh.position.y - dy * dist + height,
      mesh.position.z - dz * dist,
    )

    // Spring arm: no building wall between the plane and the camera
    const free = Math.max(ARM_MIN, this.plane.probeCameraArm(this.focus.x, this.focus.y, this.focus.z, cam.x, cam.y, cam.z, ARM_RADIUS))
    if (snap || free < this.arm) this.arm = free
    else this.arm += (free - this.arm) * expK(ARM_OUT_RATE, dt)
    if (this.arm < 0.999) {
      cam.set(
        this.focus.x + (cam.x - this.focus.x) * this.arm,
        this.focus.y + (cam.y - this.focus.y) * this.arm,
        this.focus.z + (cam.z - this.focus.z) * this.arm,
      )
    }

    // Never under the ground (plane AGL gives the ground height under it)
    const groundY = this.plane.getGroundY()
    if (Number.isFinite(groundY) && cam.y < groundY + MIN_CLEARANCE) cam.y = groundY + MIN_CLEARANCE

    // Look slightly ahead of the plane
    const ahead = LOOK_AHEAD_REST + (LOOK_AHEAD_FAST - LOOK_AHEAD_REST) * s
    this.look.set(this.focus.x + dx * ahead, this.focus.y + dy * ahead + 0.4, this.focus.z + dz * ahead)

    // Trauma shake: smooth sine noise
    this.time += dt
    let shakeRoll = 0
    if (this.trauma > 0.001) {
      const t = this.time
      const a = this.trauma * this.trauma
      cam.x += a * 0.5 * (Math.sin(t * 37.1) * 0.6 + Math.sin(t * 61.7 + 1.3) * 0.4)
      cam.y += a * 0.4 * (Math.sin(t * 43.3 + 0.7) * 0.6 + Math.sin(t * 71.9 + 2.1) * 0.4)
      cam.z += a * 0.5 * (Math.sin(t * 39.7 + 2.9) * 0.6 + Math.sin(t * 57.3 + 0.4) * 0.4)
      shakeRoll = a * 0.06 * Math.sin(t * 29.3 + 1.1)
      this.trauma = Math.max(0, this.trauma - TRAUMA_DECAY * dt)
    }

    this.camera.up.copy(this.worldUp)
    this.camera.lookAt(this.look)
    // Roll with the plane (right wing down → camera rolls clockwise too)
    const r = this.roll + shakeRoll
    if (r !== 0) this.camera.rotateZ(-r)

    // FOV with speed
    const targetFov = FOV_REST + (FOV_FAST - FOV_REST) * s
    this.fov += (targetFov - this.fov) * (snap ? 1 : expK(FOV_RATE, dt))
    if (Math.abs(this.camera.fov - this.fov) > 0.01) {
      this.camera.fov = this.fov
      this.camera.updateProjectionMatrix()
    }
  }

  dispose(): void {
    // Nothing owned: the camera belongs to the renderer.
  }
}
