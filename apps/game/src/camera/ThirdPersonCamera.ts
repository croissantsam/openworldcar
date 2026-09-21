/**
 * ThirdPersonCamera — Burnout Paradise dynamic arcade chase camera.
 *
 * Positions itself low and tight behind the muscle car, framing the rear
 * spoiler and road stretching ahead, with speed-dependent dynamic FOV
 * and violent impact trauma / screen shake on collisions.
 */

import * as THREE from 'three'
import type { PlayerCar } from '../vehicles/PlayerCar.js'

const BASE_DISTANCE = 5.6 // Close, visceral chase distance
const BASE_HEIGHT = 1.65   // Low over the rear spoiler
const SPEED_DISTANCE_FACTOR = 0.035 // Subtle pullback at high speed
const LERP_FACTOR = 0.14  // Snappy, responsive camera follow
const LOOK_LERP = 0.22    // Smooth horizon tracking
const BASE_FOV = 64
const MAX_FOV = 78

export class ThirdPersonCamera {
  private camera: THREE.PerspectiveCamera
  private car: PlayerCar

  private currentLookAt = new THREE.Vector3()
  private trauma = 0 // 0 to 1 impact trauma

  // Scratch vectors: the camera runs every frame, so never allocate here.
  private readonly _carPos = new THREE.Vector3()
  private readonly _offset = new THREE.Vector3()
  private readonly _desired = new THREE.Vector3()
  private readonly _look = new THREE.Vector3()
  private readonly _up = new THREE.Vector3(0, 0.75, 0)

  constructor(camera: THREE.PerspectiveCamera, car: PlayerCar) {
    this.camera = camera
    this.car = car
  }

  /**
   * Add impact shock / trauma (0.0 to 1.0).
   */
  addTrauma(amount: number): void {
    this.trauma = Math.min(1.0, this.trauma + amount)
  }

  update(dt: number): void {
    // Sync the car mesh position first
    this.car.syncMesh(dt)

    this._carPos.copy(this.car.getMesh().position)

    const carQuat = this.car.getQuaternion()
    const speed = this.car.getSpeed()

    // Frame-rate-independent damping: a constant per-frame lerp trails more
    // the lower the fps drops — exactly the "car lags when driving fast"
    // feeling once frames get heavier. Scale by real elapsed time instead.
    const t = Math.min(0.1, Math.max(0, dt)) * 60
    const posK = 1 - Math.pow(1 - LERP_FACTOR, t)
    const lookK = 1 - Math.pow(1 - LOOK_LERP, t)
    const fovK = 1 - Math.pow(1 - 0.08, t)

    // Dynamic FOV with speed — arcade rush of speed
    const targetFov = Math.min(MAX_FOV, BASE_FOV + speed * 0.30)
    const newFov = THREE.MathUtils.lerp(this.camera.fov, targetFov, fovK)
    if (Math.abs(newFov - this.camera.fov) > 0.02) {
      this.camera.fov = newFov
      this.camera.updateProjectionMatrix()
    }

    // Desired offset: behind the car's facing direction
    const distance = BASE_DISTANCE + speed * SPEED_DISTANCE_FACTOR
    const height = BASE_HEIGHT + Math.min(0.6, speed * 0.015)

    // "Behind" = negative Z in car-local space
    this._offset.set(0, height, -distance).applyQuaternion(carQuat)

    this._desired.copy(this._carPos).add(this._offset)

    // Smooth camera position
    this.camera.position.lerp(this._desired, posK)

    // Look-at eye level: just above car hood looking down the asphalt
    const forwardVec = this.car.getForwardVector()
    this._look.copy(this._carPos).add(this._up).addScaledVector(forwardVec, 3.5)
    this.currentLookAt.lerp(this._look, lookK)
    this.camera.lookAt(this.currentLookAt)

    // ── Impact Camera Shudder / Trauma Shake ──────────────────────────────
    if (this.trauma > 0.005) {
      const shake = this.trauma * this.trauma // quadratic trauma response
      const xShake = (Math.random() * 2 - 1) * 0.45 * shake
      const yShake = (Math.random() * 2 - 1) * 0.35 * shake
      const rollShake = (Math.random() * 2 - 1) * 0.06 * shake
      const yawShake = (Math.random() * 2 - 1) * 0.08 * shake

      this.camera.position.x += xShake
      this.camera.position.y += yShake
      this.camera.rotation.z += rollShake
      this.currentLookAt.x += yawShake * 4
      this.camera.lookAt(this.currentLookAt)

      // Decay trauma quickly over ~0.35s
      this.trauma = Math.max(0, this.trauma - dt * 2.8)
    }
  }
}
