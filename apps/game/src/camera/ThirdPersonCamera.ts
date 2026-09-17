/**
 * ThirdPersonCamera — smooth follow camera.
 *
 * Positions itself behind and above the car.
 * Uses lerp/slerp for smooth motion without jitter.
 * Distance scales with speed.
 */

import * as THREE from 'three'
import type { PlayerCar } from '../vehicles/PlayerCar.js'

const BASE_DISTANCE = 12
const BASE_HEIGHT = 5
const SPEED_DISTANCE_FACTOR = 0.12 // extra distance per m/s
const LERP_FACTOR = 0.08 // position smoothing (per frame)
const LOOK_LERP = 0.15  // look-at smoothing

export class ThirdPersonCamera {
  private camera: THREE.PerspectiveCamera
  private car: PlayerCar

  private currentLookAt = new THREE.Vector3()

  constructor(camera: THREE.PerspectiveCamera, car: PlayerCar) {
    this.camera = camera
    this.car = car
  }

  update(dt: number): void {
    // Sync the car mesh position first
    this.car.syncMesh()

    const carPos = new THREE.Vector3()
    carPos.copy(this.car.getMesh().position)

    const carQuat = this.car.getQuaternion()
    const speed = this.car.getSpeed()

    // Desired offset: behind the car's facing direction
    const distance = BASE_DISTANCE + speed * SPEED_DISTANCE_FACTOR
    const height = BASE_HEIGHT + speed * 0.04

    // "Behind" = negative Z in car-local space
    const offset = new THREE.Vector3(0, height, -distance)
    offset.applyQuaternion(carQuat)

    const desiredPos = carPos.clone().add(offset)

    // Smooth camera position
    this.camera.position.lerp(desiredPos, LERP_FACTOR)

    // Smooth look-at
    const lookTarget = carPos.clone().add(new THREE.Vector3(0, 1.5, 0))
    this.currentLookAt.lerp(lookTarget, LOOK_LERP)
    this.camera.lookAt(this.currentLookAt)
  }
}
