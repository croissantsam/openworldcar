/**
 * PlayerCar — player-controlled vehicle with Rapier physics.
 *
 * Uses a rigid body + cuboid collider.
 * Drive model: simplified arcade — torque on Y axis for steering,
 * linear impulse for throttle/brake.
 */

import RAPIER from '@dimforge/rapier3d-compat'
import * as THREE from 'three'
import { worldToGeo, type WorldPosition } from '@world-drive/math'
import type { RawInput } from '../game/InputManager.js'

// Car dimensions (metres)
const CAR_W = 2.0
const CAR_H = 1.2
const CAR_L = 4.5

// Physics tuning
const CAR_MASS = 1200
const MAX_SPEED = 60 // m/s (~216 km/h)
const MAX_REVERSE_SPEED = 16 // m/s (~58 km/h)
const ACCELERATION = 22 // m/s²
const BRAKE_DECEL = 32 // m/s²
const REVERSE_ACCEL = 14 // m/s²
const NATURAL_DRAG = 3.5 // m/s²
const STEER_RATE = 2.5 // rad/s

export class PlayerCar {
  private body: RAPIER.RigidBody
  private mesh: THREE.Group
  private scene: THREE.Scene

  // Wheel meshes (visual only — no physics)
  private wheels: THREE.Mesh[] = []

  constructor(world: RAPIER.World, scene: THREE.Scene) {
    this.scene = scene

    // ── Rapier body ─────────────────────────────────────────────────────────
    // Spawn directly on Rue Étienne Marcel, facing down the street
    const spawnX = 3.7
    const spawnZ = 158.3
    const initYaw = Math.atan2(12.1, 4.4)
    const initQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), initYaw)

    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(spawnX, 1.0, spawnZ)
      .setRotation({ x: initQuat.x, y: initQuat.y, z: initQuat.z, w: initQuat.w })
      .setLinearDamping(0.2)
      .setAngularDamping(2.0)
    this.body = world.createRigidBody(bodyDesc)

    // Friction is 0 on chassis so ground doesn't freeze the car
    // Uses roundCuboid with 10cm bevel radius so sharp edges never catch on the terrain
    const r = 0.1
    const colliderDesc = RAPIER.ColliderDesc.roundCuboid(
      CAR_W / 2 - r,
      CAR_H / 2 - r,
      CAR_L / 2 - r,
      r,
    )
      .setMass(CAR_MASS)
      .setRestitution(0.0)
      .setFriction(0.0)
    world.createCollider(colliderDesc, this.body)

    // ── Visual mesh ─────────────────────────────────────────────────────────
    this.mesh = this._buildMesh()
    scene.add(this.mesh)
  }

  private _buildMesh(): THREE.Group {
    const group = new THREE.Group()

    // Body
    const bodyGeo = new THREE.BoxGeometry(CAR_W, CAR_H, CAR_L)
    const bodyMat = new THREE.MeshPhongMaterial({
      color: 0x1a6ef5,
      shininess: 120,
      specular: 0x4488ff,
    })
    const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat)
    bodyMesh.castShadow = true
    bodyMesh.position.y = 0
    group.add(bodyMesh)

    // Cabin/roof
    const roofGeo = new THREE.BoxGeometry(CAR_W * 0.85, CAR_H * 0.6, CAR_L * 0.55)
    const roofMat = new THREE.MeshPhongMaterial({ color: 0x0d4ab5, shininess: 80 })
    const roofMesh = new THREE.Mesh(roofGeo, roofMat)
    roofMesh.castShadow = true
    roofMesh.position.y = CAR_H * 0.8
    roofMesh.position.z = -0.3
    group.add(roofMesh)

    // Headlights
    const lightGeo = new THREE.BoxGeometry(0.4, 0.2, 0.05)
    const lightMat = new THREE.MeshPhongMaterial({ color: 0xffffaa, emissive: 0xffffaa, emissiveIntensity: 0.8 })
    for (const x of [-0.6, 0.6]) {
      const light = new THREE.Mesh(lightGeo, lightMat)
      light.position.set(x, 0, CAR_L / 2)
      group.add(light)
    }

    // Tail lights
    const tailMat = new THREE.MeshPhongMaterial({ color: 0xff2200, emissive: 0xff2200, emissiveIntensity: 0.6 })
    for (const x of [-0.6, 0.6]) {
      const tail = new THREE.Mesh(lightGeo, tailMat)
      tail.position.set(x, 0, -CAR_L / 2)
      group.add(tail)
    }

    // Wheels
    const wheelGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.3, 16)
    const wheelMat = new THREE.MeshPhongMaterial({ color: 0x222222 })
    const wheelPositions = [
      [-CAR_W / 2 - 0.1, -CAR_H / 2 + 0.05, CAR_L / 2 - 0.9],
      [CAR_W / 2 + 0.1, -CAR_H / 2 + 0.05, CAR_L / 2 - 0.9],
      [-CAR_W / 2 - 0.1, -CAR_H / 2 + 0.05, -CAR_L / 2 + 0.9],
      [CAR_W / 2 + 0.1, -CAR_H / 2 + 0.05, -CAR_L / 2 + 0.9],
    ] as const

    for (const [wx, wy, wz] of wheelPositions) {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat)
      wheel.rotation.z = Math.PI / 2
      wheel.position.set(wx, wy, wz)
      wheel.castShadow = true
      group.add(wheel)
      this.wheels.push(wheel)
    }

    return group
  }

  /**
   * Apply player input to the rigid body.
   * Called once per physics tick.
   */
  applyInput(input: RawInput, dt: number): void {
    const vel = this.body.linvel()
    const rot = this.body.rotation()
    const q = new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w)

    // Forward direction in world space (car points toward +Z)
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(q)
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(q)

    // Forward & lateral speed (dot product in XZ plane)
    const forwardSpeed = forward.x * vel.x + forward.z * vel.z
    const lateralSpeed = right.x * vel.x + right.z * vel.z

    // ── Throttle (Forward) ──────────────────────────────────────────────
    if (input.throttle > 0) {
      if (forwardSpeed < MAX_SPEED) {
        const force = ACCELERATION * CAR_MASS * input.throttle * dt
        this.body.applyImpulse({ x: forward.x * force, y: 0, z: forward.z * force }, true)
      }
    }

    // ── Brake / Reverse ─────────────────────────────────────────────────
    if (input.brake > 0) {
      if (forwardSpeed > 0.5) {
        // Moving forward: brake
        const brakeAmount = Math.min(forwardSpeed, BRAKE_DECEL * dt * input.brake)
        const impulse = -brakeAmount * CAR_MASS
        this.body.applyImpulse({ x: forward.x * impulse, y: 0, z: forward.z * impulse }, true)
      } else {
        // Stopped or in reverse: accelerate backward
        if (forwardSpeed > -MAX_REVERSE_SPEED) {
          const revForce = -REVERSE_ACCEL * CAR_MASS * input.brake * dt
          this.body.applyImpulse({ x: forward.x * revForce, y: 0, z: forward.z * revForce }, true)
        }
      }
    }

    // ── Handbrake ───────────────────────────────────────────────────────
    if (input.handbrake) {
      const hbAmount = Math.min(Math.abs(forwardSpeed), BRAKE_DECEL * 1.5 * dt) * Math.sign(forwardSpeed)
      const impulse = -hbAmount * CAR_MASS
      this.body.applyImpulse({ x: forward.x * impulse, y: 0, z: forward.z * impulse }, true)
    }

    // ── Natural Drag (Rolling resistance) ──────────────────────────────
    if (input.throttle === 0 && input.brake === 0 && !input.handbrake && Math.abs(forwardSpeed) > 0.05) {
      const dragAmount = Math.min(Math.abs(forwardSpeed), NATURAL_DRAG * dt) * Math.sign(forwardSpeed)
      const impulse = -dragAmount * CAR_MASS
      this.body.applyImpulse({ x: forward.x * impulse, y: 0, z: forward.z * impulse }, true)
    }

    // ── Lateral Grip (Tire friction prevents sideways slide) ───────────
    const gripFactor = input.handbrake ? 0.70 : 0.95
    const lateralImpulse = -lateralSpeed * gripFactor * CAR_MASS
    this.body.applyImpulse({ x: right.x * lateralImpulse, y: 0, z: right.z * lateralImpulse }, true)

    // ── Steering ────────────────────────────────────────────────────────
    let targetAngVelY = 0
    if (Math.abs(input.steering) > 0.05) {
      const effectiveSpeed = Math.abs(forwardSpeed)
      const isMoving = effectiveSpeed > 0.1 || input.throttle > 0 || input.brake > 0
      if (isMoving) {
        const steerSign = forwardSpeed < -0.2 ? 1 : -1 // Invert when reversing
        const speedFactor = Math.min(1.0, Math.max(0.35, effectiveSpeed / 8.0))
        targetAngVelY = steerSign * input.steering * STEER_RATE * speedFactor
      }
    }
    this.body.setAngvel({ x: 0, y: targetAngVelY, z: 0 }, true)

    // ── Upright Stability (prevent rolling onto side or roof) ────────────
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q)
    if (up.y < 0.8) {
      const euler = new THREE.Euler().setFromQuaternion(q, 'YXZ')
      const upright = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, euler.y, 0))
      this.body.setRotation({ x: upright.x, y: upright.y, z: upright.z, w: upright.w }, true)
      this.body.setAngvel({ x: 0, y: 0, z: 0 }, true)
    }
  }

  /**
   * Sync the Three.js mesh with the Rapier body.
   * Called once per render frame.
   */
  syncMesh(): void {
    const pos = this.body.translation()
    const rot = this.body.rotation()
    this.mesh.position.set(pos.x, pos.y, pos.z)
    this.mesh.quaternion.set(rot.x, rot.y, rot.z, rot.w)

    // Spin wheels based on forward speed
    const forwardSpeed = this.getForwardSpeed()
    for (const wheel of this.wheels) {
      wheel.rotation.x += forwardSpeed * 0.05
    }
  }

  getPosition(): WorldPosition {
    const t = this.body.translation()
    return { x: t.x, y: t.y, z: t.z }
  }

  getSpeed(): number {
    const v = this.body.linvel()
    return Math.sqrt(v.x * v.x + v.z * v.z)
  }

  getForwardSpeed(): number {
    const vel = this.body.linvel()
    const rot = this.body.rotation()
    const q = new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w)
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(q)
    return forward.x * vel.x + forward.z * vel.z
  }

  getGeoPosition(): { lat: number; lon: number } {
    const pos = this.getPosition()
    const geo = worldToGeo(pos)
    return { lat: geo.latitude, lon: geo.longitude }
  }

  getMesh(): THREE.Group {
    return this.mesh
  }

  getQuaternion(): THREE.Quaternion {
    const rot = this.body.rotation()
    return new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w)
  }

  getHeadingVector(): { x: number; z: number } {
    const rot = this.body.rotation()
    const q = new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w)
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(q)
    return { x: forward.x, z: forward.z }
  }

  getYaw(): number {
    const rot = this.body.rotation()
    const q = new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w)
    const euler = new THREE.Euler().setFromQuaternion(q, 'YXZ')
    return euler.y
  }

  /**
   * Teleports the car to a target world position and heading,
   * resetting velocities to safely enter a new location.
   */
  teleport(pos: WorldPosition, heading = 0): void {
    // Center of 1.2m chassis at y >= 1.0 ensures the car bottom is >= +0.4m above ground
    // preventing any clipping into or tunneling below the ground surface
    const safeY = Math.max(1.0, (pos.y ?? 0) + 0.5)
    this.body.setTranslation({ x: pos.x, y: safeY, z: pos.z }, true)
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true)
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true)
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, heading, 0))
    this.body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true)
    this.syncMesh()
  }

  dispose(): void {
    this.scene.remove(this.mesh)
  }
}

