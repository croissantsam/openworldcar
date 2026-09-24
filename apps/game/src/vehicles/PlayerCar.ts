/**
 * PlayerCar — Hunter Cavalry Muscle Car with realistic physics,
 * ground-contact suspension, dynamic body roll/pitch, steerable front wheels,
 * downforce, and high-impact collision feedback.
 */

import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { worldToGeo, type WorldPosition, type GeoPosition } from '@world-drive/math'
import type { RawInput } from '../game/InputManager.js'
import { createFerrari, FERRARI_WHEEL_RADIUS, type FerrariCar } from './FerrariModel.js'

// Car dimensions (metres)
const CAR_W = 1.95
const CAR_H = 1.15
const CAR_L = 4.6
const WHEEL_RADIUS = 0.33
const WHEEL_Y = -0.14

// Physics tuning (fast & responsive arcade feel)
const CAR_MASS = 1200
const MAX_SPEED = 70 // m/s (~252 km/h)
const MAX_REVERSE_SPEED = 18 // m/s (~65 km/h)
const ACCELERATION = 28 // m/s²
const BRAKE_DECEL = 38 // m/s²
const REVERSE_ACCEL = 16 // m/s²
const NATURAL_DRAG = 3.2 // m/s²
const STEER_RATE = 2.8 // rad/s

// Nitro tuning
const NITRO_ACCEL = 62 // m/s² extra thrust while boosting
const NITRO_TOP_SPEED = MAX_SPEED * 1.45 // boost can push past the cruise cap
const NITRO_DRAIN = 0.34 // charge per second while boosting
const NITRO_REGEN = 0.055 // charge per second while driving normally
const NITRO_DRIFT_REGEN = 0.30 // charge per second while drifting (reward slides)
const NITRO_RESTART_CHARGE = 0.08 // charge needed to (re)ignite the boost (anti-flicker)
// Drift detection: sideways slide (m/s) above this at speed counts as a drift
const DRIFT_LATERAL_MIN = 7.0
const DRIFT_SPEED_MIN = 8.0

function createContactShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, 256, 256)

  // Soft blurred black rounded rect for vehicle underside
  const grad = ctx.createRadialGradient(128, 128, 30, 128, 128, 120)
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.95)')
  grad.addColorStop(0.5, 'rgba(0, 0, 0, 0.65)')
  grad.addColorStop(1, 'rgba(0, 0, 0, 0.0)')
  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.roundRect(24, 18, 208, 220, 36)
  ctx.fill()

  // Extra dark spots under the 4 wheels
  const tireSpots = [
    { x: 48, y: 55 },
    { x: 208, y: 55 },
    { x: 48, y: 200 },
    { x: 208, y: 200 },
  ]
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)'
  for (const s of tireSpots) {
    ctx.beginPath()
    ctx.arc(s.x, s.y, 24, 0, Math.PI * 2)
    ctx.fill()
  }

  const texture = new THREE.CanvasTexture(canvas)
  return texture
}

export type ImpactCallback = (
  intensity: number,
  point: WorldPosition,
  direction: WorldPosition,
) => void

export class PlayerCar {
  private body: RAPIER.RigidBody
  private mesh: THREE.Group
  private scene: THREE.Scene

  // Suspension & steering components
  private chassisGroup = new THREE.Group()
  private wheelFLSteer = new THREE.Group()
  private wheelFRSteer = new THREE.Group()
  private wheelMeshes: THREE.Group[] = []
  private carModel: FerrariCar | null = null
  /** Wheels live in a container turned by π about Y: forward travel spins them the other way. */
  private readonly wheelSpinSign = -1
  private nitroFlames: THREE.Mesh[] = []

  // Dynamic visual suspension state
  private chassisPitch = 0
  private chassisRoll = 0
  private steerAngle = 0

  // Impact tracking
  private prevLinVel = { x: 0, y: 0, z: 0 }
  private hasPrevVel = false
  public onImpact?: ImpactCallback

  // ── Velocity cache ──────────────────────────────────────────────────────
  // Refreshed once per physics tick (and on teleport/park). UI polling
  // (HUD interval) reads ONLY these fields so it never touches the Rapier
  // WASM heap off the render loop — cross-thread linvel() calls both cost
  // and can throw (__wbindgen_throw) when the body/world is being recycled
  // by chunk streaming on the next frame.
  private cachedVel = { x: 0, y: 0, z: 0 }
  private cachedSpeed = 0
  private cachedForwardSpeed = 0
  private readonly _cacheQuat = new THREE.Quaternion()
  private readonly _cacheFwd = new THREE.Vector3()

  // ── Invincibility System ──────────────────────────────────────────────────
  private invincibleUntil: number = Date.now() + 30_000
  private lastWarningPlayed = false
  private wasInvincible = true

  public onInvincibilityChanged?: (invincible: boolean) => void
  public onInvincibilityWarning?: () => void

  constructor(world: RAPIER.World, scene: THREE.Scene) {
    this.scene = scene

    // ── Rapier body ─────────────────────────────────────────────────────────
    const spawnX = -15.4
    const spawnZ = 8.6
    const initYaw = 1.106
    const initQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), initYaw)

    // Spawn resting directly on road (wheel bottom = 0.0 when body center = 0.47)
    const bDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(spawnX, 0.48, spawnZ)
      .setRotation({ x: initQuat.x, y: initQuat.y, z: initQuat.z, w: initQuat.w })
      .setLinearDamping(0.6)
      .setAngularDamping(3.5)
    this.body = world.createRigidBody(bDesc)

    // 1. Elevated chassis box collider (clears curbs, stops at walls/buildings)
    const chassisDesc = RAPIER.ColliderDesc.roundCuboid(
      CAR_W / 2 - 0.06,
      0.24,
      CAR_L / 2 - 0.12,
      0.05,
    )
      .setTranslation(0, 0.16, 0)
      .setMass(CAR_MASS * 0.6)
      .setRestitution(0.12)
      .setFriction(0.25)
    const chassisCol = world.createCollider(chassisDesc, this.body)
    this.colliders.push(chassisCol)

    // 2. 4 Rolling wheel colliders that contact the asphalt
    const wheelOffsets = [
      { x: -CAR_W / 2 + 0.04, y: WHEEL_Y, z: CAR_L / 2 - 0.95 },
      { x:  CAR_W / 2 - 0.04, y: WHEEL_Y, z: CAR_L / 2 - 0.95 },
      { x: -CAR_W / 2 + 0.04, y: WHEEL_Y, z: -CAR_L / 2 + 0.95 },
      { x:  CAR_W / 2 - 0.04, y: WHEEL_Y, z: -CAR_L / 2 + 0.95 },
    ]
    for (const wo of wheelOffsets) {
      const wheelDesc = RAPIER.ColliderDesc.ball(WHEEL_RADIUS)
        .setTranslation(wo.x, wo.y, wo.z)
        .setMass(CAR_MASS * 0.1)
        .setFriction(0.2)
        .setRestitution(0.04)
      const wheelCol = world.createCollider(wheelDesc, this.body)
      this.colliders.push(wheelCol)
    }

    // ── Visual mesh ─────────────────────────────────────────────────────────
    this.mesh = this._buildMesh()
    scene.add(this.mesh)
  }

  private isNearTunnel = false
  private lastInTunnel = false
  private colliders: RAPIER.Collider[] = []

  setNearTunnel(near: boolean): void {
    this.isNearTunnel = near
    this._updateCollisionGroups()
  }

  private _updateCollisionGroups(): void {
    const pos = this.body.translation()
    // In tunnel mode if near tunnel corridor OR already below surface (pos.y < 0.38)
    const inTunnel = this.isNearTunnel || pos.y < 0.38
    if (inTunnel !== this.lastInTunnel) {
      this.lastInTunnel = inTunnel
      const GROUP_CAR = 0x0001
      const GROUP_GROUND = 0x0002
      const filter = inTunnel ? (0xffff & ~GROUP_GROUND) : 0xffff
      const groups = (GROUP_CAR << 16) | filter
      for (const col of this.colliders) {
        col.setCollisionGroups(groups)
      }
    }
  }

  private _buildMesh(): THREE.Group {
    const car = new THREE.Group()

    // ── A. Ground Contact AO Shadow Quad ───────────────────────────────────
    const shadowGeo = new THREE.PlaneGeometry(CAR_W + 0.45, CAR_L + 0.45)
    shadowGeo.rotateX(-Math.PI / 2)
    const shadowMat = new THREE.MeshBasicMaterial({
      map: createContactShadowTexture(),
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
    })
    const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat)
    shadowMesh.position.y = -0.45 // 2cm above road surface
    car.add(shadowMesh)

    // ── B. Ferrari-inspired coupe (procedural, see FerrariModel.ts) ────────
    // Model frame: nose toward -Z, ground at y = 0. Game frame: forward +Z,
    // the rigid body centre 0.48 m above the road. One container turns the
    // model around (π about Y) and lowers it so its ground meets the road.
    const porsche = createFerrari()
    this.carModel = porsche
    const MODEL_Y = -0.48

    // Body (everything but the wheels) under the pitch/roll chassis group
    this.chassisGroup = new THREE.Group()
    car.add(this.chassisGroup)
    const bodyRoot = new THREE.Group()
    bodyRoot.rotation.y = Math.PI
    bodyRoot.position.y = MODEL_Y
    this.chassisGroup.add(bodyRoot)
    for (const child of [...porsche.group.children]) {
      if (!porsche.wheels.includes(child as THREE.Group)) bodyRoot.add(child)
    }

    // Wheels: same rotated container, but each wheel sits in its own steer /
    // fixed group at the hub so the existing steering + spin code applies.
    const wheelRoot = new THREE.Group()
    wheelRoot.rotation.y = Math.PI
    wheelRoot.position.y = MODEL_Y
    car.add(wheelRoot)
    const [wheelFL, wheelFR, wheelRL, wheelRR] = porsche.wheels as [THREE.Group, THREE.Group, THREE.Group, THREE.Group]
    const mount = (wheel: THREE.Group): THREE.Group => {
      const holder = new THREE.Group()
      holder.position.copy(wheel.position)
      wheel.position.set(0, 0, 0)
      holder.add(wheel)
      wheelRoot.add(holder)
      this.wheelMeshes.push(wheel)
      return holder
    }
    this.wheelFLSteer = mount(wheelFL)
    this.wheelFRSteer = mount(wheelFR)
    mount(wheelRL)
    mount(wheelRR)

    // ── C. Burnout nitro flames behind the exhausts ─────────────────────────
    for (const x of [-0.31, 0.31]) {
      const flameGeo = new THREE.ConeGeometry(0.08, 0.50, 8)
      flameGeo.rotateX(-Math.PI / 2)
      flameGeo.translate(0, 0, -0.28)
      const flameMat = new THREE.MeshBasicMaterial({
        color: 0x00ff88,
        transparent: true,
        opacity: 0.85,
      })
      const flame = new THREE.Mesh(flameGeo, flameMat)
      flame.position.set(x, -0.08, -2.45)
      flame.scale.set(0.001, 0.001, 0.001)
      this.chassisGroup.add(flame)
      this.nitroFlames.push(flame)
    }

    car.traverse((child) => {
      if ((child as THREE.Mesh).isMesh && child !== shadowMesh) {
        child.castShadow = true
      }
    })

    return car
  }

  triggerInvincibility(durationMs = 30_000): void {
    this.invincibleUntil = Date.now() + durationMs
    this.lastWarningPlayed = false
    this.wasInvincible = true
    this.onInvincibilityChanged?.(true)
  }

  grantSpawnInvincibility(durationMs = 30_000): void {
    this.triggerInvincibility(durationMs)
  }

  isInvincible(): boolean {
    return Date.now() < this.invincibleUntil
  }

  getInvincibilityRemaining(): number {
    return Math.max(0, (this.invincibleUntil - Date.now()) / 1000)
  }

  /**
   * Apply player input to the rigid body.
   * Called once per physics tick.
   */
  applyInput(input: RawInput, dt: number): void {
    this._updateCollisionGroups()
    const forwardSpeed = this.getForwardSpeed()
    const speed = this.getSpeed()

    // ── Impact & Collision Detection ─────────────────────────────────────────
    const curLinVel = this.body.linvel()
    if (this.hasPrevVel) {
      const dvX = curLinVel.x - this.prevLinVel.x
      const dvY = curLinVel.y - this.prevLinVel.y
      const dvZ = curLinVel.z - this.prevLinVel.z
      const dvMag = Math.hypot(dvX, dvY, dvZ)

      // An abrupt acceleration change > 3.0 m/s not caused by input is an impact
      const expectedDv = (ACCELERATION * dt) + 1.2
      if (dvMag > expectedDv + 2.5) {
        const intensity = Math.min(1.0, (dvMag - 2.5) / 14.0)
        const pos = this.getPosition()
        this.onImpact?.(
          intensity,
          pos,
          { x: dvX / dvMag, y: dvY / dvMag, z: dvZ / dvMag },
        )
      }
    }
    this.prevLinVel = { x: curLinVel.x, y: curLinVel.y, z: curLinVel.z }
    this.hasPrevVel = true

    // ── Steering ─────────────────────────────────────────────────────────────
    if (input.steering !== 0) {
      const speedFactor = Math.min(1.0, Math.abs(forwardSpeed) / 4.0)
      const highSpeedDamp = 1.0 - Math.min(0.4, (speed / MAX_SPEED) * 0.4)
      // Handbrake flick: extra rotation to throw the tail out at speed.
      const flick = input.handbrake && speed > 10 ? 1.45 : 1.0
      // Real-car reverse: the rear follows the steering wheel, so the yaw
      // response flips with travel direction. `speedFactor` already fades
      // the torque to zero at standstill, so the sign flip can't snap.
      const travelDir = forwardSpeed >= 0 ? 1 : -1
      const steerTorque = -input.steering * STEER_RATE * speedFactor * highSpeedDamp * CAR_MASS * 2.2 * flick * travelDir
      this.body.applyTorqueImpulse({ x: 0, y: steerTorque * dt, z: 0 }, true)
    }

    // ── Handbrake yaw stabilization: slides stay steerable instead of
    // spinning out (mild angular damping while the rear axle is free).
    if (input.handbrake) {
      try {
        const av = this.body.angvel()
        this.body.setAngvel({ x: av.x, y: av.y * Math.max(0, 1.0 - 1.4 * dt), z: av.z }, true)
      } catch {
        // ignore teardown races
      }
    }

    // ── Throttle & Brake ─────────────────────────────────────────────────────
    const forward = this.getForwardVector()

    if (input.throttle > 0) {
      if (forwardSpeed < MAX_SPEED) {
        const force = input.throttle * ACCELERATION * CAR_MASS
        this.body.applyImpulse(
          { x: forward.x * force * dt, y: 0, z: forward.z * force * dt },
          true,
        )
      }
    }

    if (input.brake > 0) {
      if (forwardSpeed > 1.0) {
        const brakeForce = input.brake * BRAKE_DECEL * CAR_MASS
        this.body.applyImpulse(
          { x: -forward.x * brakeForce * dt, y: 0, z: -forward.z * brakeForce * dt },
          true,
        )
      } else if (forwardSpeed > -MAX_REVERSE_SPEED) {
        const revForce = input.brake * REVERSE_ACCEL * CAR_MASS
        this.body.applyImpulse(
          { x: -forward.x * revForce * dt, y: 0, z: -forward.z * revForce * dt },
          true,
        )
      }
    }

    // ── Nitro Boost ──────────────────────────────────────────────────────────
    // Extra thrust along the nose; can push past the cruise top speed.
    // Per-tick dv (~1 m/s) stays far below the impact-detection threshold.
    // Hysteresis on an empty gauge: restarting needs some charge, otherwise
    // the flames/boost would stutter every other tick at ~0%.
    const wantNitro = input.nitro === true && forwardSpeed < NITRO_TOP_SPEED
    if (this.nitroBoosting) {
      this.nitroBoosting = wantNitro && this.nitroCharge > 0
    } else {
      this.nitroBoosting = wantNitro && this.nitroCharge > NITRO_RESTART_CHARGE
    }
    if (this.nitroBoosting) {
      const force = NITRO_ACCEL * CAR_MASS
      this.body.applyImpulse(
        { x: forward.x * force * dt, y: 0, z: forward.z * force * dt },
        true,
      )
      this.nitroCharge = Math.max(0, this.nitroCharge - NITRO_DRAIN * dt)
    }

    // ── Handbrake Drift ──────────────────────────────────────────────────────
    // Light drag at speed (slides keep their momentum) but strong bite when
    // slow (still an effective emergency brake). Lateral grip is cut hard so
    // the tail steps out instead of following the nose.
    if (input.handbrake) {
      const vel = this.body.linvel()
      const dragRate = speed > 12 ? 0.55 : 1.8
      const dragFactor = 1.0 - dragRate * dt
      this.body.setLinvel({ x: vel.x * dragFactor, y: vel.y, z: vel.z * dragFactor }, true)
    }

    // ── Natural Drag ─────────────────────────────────────────────────────────
    if (input.throttle === 0 && input.brake === 0 && speed > 0.1) {
      const vel = this.body.linvel()
      const drag = Math.max(0, 1.0 - (NATURAL_DRAG / (speed + 0.1)) * dt)
      this.body.setLinvel({ x: vel.x * drag, y: vel.y, z: vel.z * drag }, true)
    }

    // ── Lateral Friction / Grip (Arcade Drift Feel) ──────────────────────────
    // gripFactor blends velocity toward the nose: 1.0 = no lateral damping
    // (full slide), lower = velocity snaps to the nose (grippy). The
    // handbrake nearly frees the rear axle so the tail steps out and stays out.
    const right = this.getRightVector()
    const vel = this.body.linvel()
    const lateralSpeed = vel.x * right.x + vel.z * right.z
    const gripFactor = input.handbrake ? 0.985 : 0.94
    const lateralCorrection = -lateralSpeed * (1.0 - gripFactor)
    this.body.applyImpulse(
      { x: right.x * lateralCorrection * CAR_MASS, y: 0, z: right.z * lateralCorrection * CAR_MASS },
      true,
    )

    // ── Drift State + Nitro Recharge ─────────────────────────────────────────
    // Sliding sideways fast at speed = drifting (bridges don't spike lateral
    // velocity, so this stays quiet on straight decks).
    this.drifting = speed > DRIFT_SPEED_MIN && Math.abs(lateralSpeed) > DRIFT_LATERAL_MIN
    this.driftAngle = this.drifting && speed > 0.5 ? Math.atan2(lateralSpeed, Math.abs(forwardSpeed)) : 0
    if (!this.nitroBoosting) {
      const regen = (this.drifting ? NITRO_DRIFT_REGEN : NITRO_REGEN) * dt
      this.nitroCharge = Math.min(1, this.nitroCharge + regen)
    }

    // ── Aerodynamic Downforce: Keeps Tires Firmly Planted On Ground ──────────
    const downforce = 450 + speed * 160
    this.body.applyImpulse({ x: 0, y: -downforce * dt, z: 0 }, true)

    // Store inputs for visual suspension in syncMesh
    this._lastThrottle = input.throttle
    this._lastBrake = input.brake
    this._lastSteer = input.steering
    this._lastLateralSpeed = lateralSpeed

    // Refresh the UI-facing velocity cache (post-impulse state).
    this._refreshVelocityCache()
  }

  /**
   * Read the rigid body's velocity into the cache. Never throws: on a dead
   * or recycled body the last good values are kept.
   */
  private _refreshVelocityCache(): void {
    try {
      const v = this.body.linvel()
      this.cachedVel.x = v.x
      this.cachedVel.y = v.y
      this.cachedVel.z = v.z
      const r = this.body.rotation()
      this._cacheQuat.set(r.x, r.y, r.z, r.w)
      this._cacheFwd.set(0, 0, 1).applyQuaternion(this._cacheQuat)
      this.cachedForwardSpeed = this._cacheFwd.x * v.x + this._cacheFwd.z * v.z
      this.cachedSpeed = Math.sqrt(v.x * v.x + v.z * v.z)
    } catch {
      // Body unavailable (disposed world, teardown race): keep last values.
    }
  }

  /** Park the car: zero velocity, disable simulation, refresh the cache. */
  park(): void {
    try {
      this.body.setLinvel({ x: 0, y: 0, z: 0 }, false)
      this.body.setAngvel({ x: 0, y: 0, z: 0 }, false)
    } catch {
      // ignore teardown races
    }
    this.cachedVel.x = 0
    this.cachedVel.y = 0
    this.cachedVel.z = 0
    this.cachedSpeed = 0
    this.cachedForwardSpeed = 0
    this.nitroBoosting = false
    this.drifting = false
    this.driftAngle = 0
    this.prevLinVel = { x: 0, y: 0, z: 0 }
    try {
      this.body.setEnabled(false)
    } catch {
      // ignore teardown races
    }
  }

  private _lastThrottle = 0
  private _lastBrake = 0
  private _lastSteer = 0
  private _lastLateralSpeed = 0

  // ── Nitro & drift state (refreshed every physics tick) ───────────────────
  private nitroCharge = 1
  private nitroBoosting = false
  private drifting = false
  private driftAngle = 0

  /**
   * Sync the Three.js mesh with the Rapier body, apply visual suspension
   * pitch/roll, steer front wheels, and animate wheel spinning.
   */
  syncMesh(dt = 0.016): void {
    const pos = this.body.translation()
    const rot = this.body.rotation()
    this.mesh.position.set(pos.x, pos.y, pos.z)
    this.mesh.quaternion.set(rot.x, rot.y, rot.z, rot.w)

    const forwardSpeed = this.getForwardSpeed()
    const speed = this.getSpeed()

    // ── 1. Front Wheel Steering ──────────────────────────────────────────────
    const targetSteerAngle = -this._lastSteer * 0.42 // ~24 degrees
    this.steerAngle = THREE.MathUtils.lerp(this.steerAngle, targetSteerAngle, 0.24)
    this.wheelFLSteer.rotation.y = this.steerAngle
    this.wheelFRSteer.rotation.y = this.steerAngle

    // ── 2. All 4 Wheels Spin with Speed ──────────────────────────────────────
    const spinDelta = ((forwardSpeed * dt) / FERRARI_WHEEL_RADIUS) * this.wheelSpinSign
    for (const w of this.wheelMeshes) {
      w.rotation.x += spinDelta
    }

    // ── 3. Visual Suspension Dynamics (Pitch & Roll) ─────────────────────────
    // Pitch: Squat on acceleration, dive on braking
    const targetPitch = (this._lastThrottle * -0.028) + (this._lastBrake * 0.038)
    this.chassisPitch = THREE.MathUtils.lerp(this.chassisPitch, targetPitch, 0.16)

    // Roll: Lean outward from cornering and drifts (mirrored in reverse,
    // like the yaw response above).
    const travelDir = forwardSpeed >= 0 ? 1 : -1
    const steerRoll = (this._lastSteer * 0.040) * Math.min(1.0, speed / 12.0) * travelDir
    const driftRoll = (this._lastLateralSpeed / 16.0) * 0.045
    const targetRoll = -(steerRoll + driftRoll)
    this.chassisRoll = THREE.MathUtils.lerp(this.chassisRoll, targetRoll, 0.16)

    this.chassisGroup.rotation.x = this.chassisPitch
    this.chassisGroup.rotation.z = this.chassisRoll

    // ── 4. Nitro Exhaust Flames (only while boosting) ───────────────────────
    for (const flame of this.nitroFlames) {
      if (this.nitroBoosting) {
        const flicker = 0.85 + Math.random() * 0.35
        const intensity = Math.min(1.5, speed / 20.0) * flicker
        flame.scale.set(intensity, intensity, intensity * (1.0 + Math.random() * 0.4))
        flame.visible = true
      } else {
        flame.scale.set(0.001, 0.001, 0.001)
        flame.visible = false
      }
    }

    // ── 5. Invincibility State Tracking ─────────────────────────────────────
    const remaining = this.getInvincibilityRemaining()
    const currentlyInvincible = remaining > 0
    if (currentlyInvincible !== this.wasInvincible) {
      this.wasInvincible = currentlyInvincible
      this.onInvincibilityChanged?.(currentlyInvincible)
    }

    if (currentlyInvincible && remaining <= 5.0) {
      if (!this.lastWarningPlayed) {
        this.lastWarningPlayed = true
        this.onInvincibilityWarning?.()
      }
    }
  }

  getPosition(): WorldPosition {
    try {
      const t = this.body.translation()
      return { x: t.x, y: t.y, z: t.z }
    } catch {
      // Body unavailable (disposed world): fall back to the synced mesh pose.
      const p = this.mesh.position
      return { x: p.x, y: p.y, z: p.z }
    }
  }

  /** Cached velocity (refreshed every physics tick): safe to call from any thread. */
  getVelocity(): { x: number; y: number; z: number } {
    return { x: this.cachedVel.x, y: this.cachedVel.y, z: this.cachedVel.z }
  }

  /** Cached horizontal speed: safe to call from any thread. */
  getSpeed(): number {
    return this.cachedSpeed
  }

  /** Cached signed forward speed: safe to call from any thread. */
  getForwardSpeed(): number {
    return this.cachedForwardSpeed
  }

  /** Nitro gauge 0..1 plus whether the boost is currently firing. */
  getNitro(): { charge: number; boosting: boolean } {
    return { charge: this.nitroCharge, boosting: this.nitroBoosting }
  }

  /** True while sliding sideways fast (burnout / handbrake slide). */
  isDrifting(): boolean {
    return this.drifting
  }

  /** Signed slide angle (radians) for HUD/effects. 0 when not drifting. */
  getDriftAngle(): number {
    return this.driftAngle
  }

  /**
   * World positions of the two rear wheels (drift-smoke emitters).
   * Falls back to the car centre when the body is unavailable.
   */
  getRearWheelPositions(): [{ x: number; y: number; z: number }, { x: number; y: number; z: number }] {
    try {
      const t = this.body.translation()
      const r = this.body.rotation()
      const q = new THREE.Quaternion(r.x, r.y, r.z, r.w)
      const left = new THREE.Vector3(-0.85, 0.05, -2.1).applyQuaternion(q)
      const right = new THREE.Vector3(0.85, 0.05, -2.1).applyQuaternion(q)
      return [
        { x: t.x + left.x, y: t.y + left.y, z: t.z + left.z },
        { x: t.x + right.x, y: t.y + right.y, z: t.z + right.z },
      ]
    } catch {
      const p = this.getPosition()
      return [
        { x: p.x, y: p.y, z: p.z },
        { x: p.x, y: p.y, z: p.z },
      ]
    }
  }

  getGeoPosition(): { lat: number; lon: number; latitude: number; longitude: number } {
    const pos = this.getPosition()
    const g = worldToGeo(pos)
    return { lat: g.latitude, lon: g.longitude, latitude: g.latitude, longitude: g.longitude }
  }

  getQuaternion(): THREE.Quaternion {
    const r = this.body.rotation()
    return new THREE.Quaternion(r.x, r.y, r.z, r.w)
  }

  getForwardVector(): THREE.Vector3 {
    return new THREE.Vector3(0, 0, 1).applyQuaternion(this.getQuaternion())
  }

  getHeadingVector(): THREE.Vector3 {
    return this.getForwardVector()
  }

  getYaw(): number {
    const rot = this.body.rotation()
    const q = new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w)
    const euler = new THREE.Euler().setFromQuaternion(q, 'YXZ')
    return euler.y
  }

  getRightVector(): THREE.Vector3 {
    return new THREE.Vector3(1, 0, 0).applyQuaternion(this.getQuaternion())
  }

  getMesh(): THREE.Group {
    return this.mesh
  }

  getRigidBody(): RAPIER.RigidBody {
    return this.body
  }

  dispose(): void {
    this.scene.remove(this.mesh)
    this.carModel?.dispose()
  }

  /**
   * Teleport the car to a new world position and heading.
   * `preserveVelocity` (origin rebase) keeps the current linear/angular
   * velocity instead of stopping: the move stays seamless mid-drive.
   */
  teleport(pos: WorldPosition, headingRad = 0, opts?: { preserveVelocity?: boolean }): void {
    const preserve = opts?.preserveVelocity === true
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), headingRad)
    this.body.setTranslation({ x: pos.x, y: pos.y + 0.48, z: pos.z }, true)
    this.body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true)
    if (preserve) {
      // Velocity untouched (setTranslation preserves it in Rapier): just
      // re-sync the caches so no phantom impact is detected next tick.
      this._refreshVelocityCache()
      this.prevLinVel = { x: this.cachedVel.x, y: this.cachedVel.y, z: this.cachedVel.z }
    } else {
      this.body.setLinvel({ x: 0, y: 0, z: 0 }, true)
      this.body.setAngvel({ x: 0, y: 0, z: 0 }, true)
      this.cachedVel.x = 0
      this.cachedVel.y = 0
      this.cachedVel.z = 0
      this.cachedSpeed = 0
      this.cachedForwardSpeed = 0
      this.prevLinVel = { x: 0, y: 0, z: 0 }
    }
    this.triggerInvincibility(30_000)
    this.syncMesh()
  }
}
