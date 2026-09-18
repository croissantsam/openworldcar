/**
 * PlayerCar — Hunter Cavalry Muscle Car with realistic physics,
 * ground-contact suspension, dynamic body roll/pitch, steerable front wheels,
 * downforce, and high-impact collision feedback.
 */

import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { worldToGeo, type WorldPosition, type GeoPosition } from '@world-drive/math'
import type { RawInput } from '../game/InputManager.js'

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
  private nitroFlames: THREE.Mesh[] = []

  // Dynamic visual suspension state
  private chassisPitch = 0
  private chassisRoll = 0
  private steerAngle = 0

  // Impact tracking
  private prevLinVel = { x: 0, y: 0, z: 0 }
  private hasPrevVel = false
  public onImpact?: ImpactCallback

  // ── Invincibility System ──────────────────────────────────────────────────
  private invincibleUntil: number = Date.now() + 30_000
  private shieldGroup!: THREE.Group
  private shieldInnerMat!: THREE.MeshStandardMaterial
  private shieldOuterMat!: THREE.MeshBasicMaterial
  private shieldOuterMesh!: THREE.Mesh
  private shieldTime = 0
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
    this.shieldGroup = this._buildShieldMesh()
    this.mesh.add(this.shieldGroup)
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

    // ── Materials ───────────────────────────────────────────────────────────
    const paintMat = new THREE.MeshStandardMaterial({
      color: 0x164ac8, // Burnout Paradise metallic royal blue
      metalness: 0.88,
      roughness: 0.18,
    })

    const stripeMat = new THREE.MeshStandardMaterial({
      color: 0x0a0c10, // matte black racing stripes
      metalness: 0.3,
      roughness: 0.4,
    })

    const chromeMat = new THREE.MeshStandardMaterial({
      color: 0xededed, // polished mirror chrome
      metalness: 0.96,
      roughness: 0.12,
    })

    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x08101d, // dark tinted privacy glass
      metalness: 0.95,
      roughness: 0.08,
      transparent: true,
      opacity: 0.88,
    })

    const grilleMat = new THREE.MeshStandardMaterial({
      color: 0x111215, // black front mesh
      metalness: 0.5,
      roughness: 0.7,
    })

    const tailLightMat = new THREE.MeshStandardMaterial({
      color: 0xff1500,
      emissive: 0xff0a00,
      emissiveIntensity: 2.2,
      roughness: 0.2,
    })

    const headLightMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xffeedd,
      emissiveIntensity: 1.6,
      roughness: 0.1,
    })

    const tireMat = new THREE.MeshStandardMaterial({
      color: 0x141518,
      roughness: 0.85,
      metalness: 0.05,
    })

    const rimMat = new THREE.MeshStandardMaterial({
      color: 0xcccccc,
      metalness: 0.92,
      roughness: 0.15,
    })

    const brakeMat = new THREE.MeshStandardMaterial({
      color: 0xd41111, // red sports brake caliper
      metalness: 0.3,
      roughness: 0.3,
    })

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

    // ── B. Dynamic Chassis Group (Pitch & Roll suspension) ─────────────────
    this.chassisGroup = new THREE.Group()
    car.add(this.chassisGroup)

    // 1. Lower Body & Floorpan
    const lowerBodyGeo = new THREE.BoxGeometry(CAR_W, 0.36, CAR_L)
    const lowerBody = new THREE.Mesh(lowerBodyGeo, paintMat)
    lowerBody.position.y = 0.04
    this.chassisGroup.add(lowerBody)

    // Side skirts
    for (const x of [-CAR_W / 2 + 0.02, CAR_W / 2 - 0.02]) {
      const skirtGeo = new THREE.BoxGeometry(0.08, 0.14, CAR_L * 0.6)
      const skirt = new THREE.Mesh(skirtGeo, stripeMat)
      skirt.position.set(x, -0.12, 0)
      this.chassisGroup.add(skirt)
    }

    // 2. Sculpted Front Hood with Power Bulge
    const hoodGeo = new THREE.BoxGeometry(CAR_W * 0.94, 0.20, 1.55)
    const hood = new THREE.Mesh(hoodGeo, paintMat)
    hood.position.set(0, 0.22, 1.45)
    this.chassisGroup.add(hood)

    // Hood scoop / air intake
    const scoopGeo = new THREE.BoxGeometry(0.55, 0.09, 0.65)
    const scoop = new THREE.Mesh(scoopGeo, stripeMat)
    scoop.position.set(0, 0.34, 1.35)
    this.chassisGroup.add(scoop)

    // Dual black racing stripes along hood & roof
    for (const sx of [-0.22, 0.22]) {
      const sGeo = new THREE.BoxGeometry(0.16, 0.02, 1.56)
      const stripe = new THREE.Mesh(sGeo, stripeMat)
      stripe.position.set(sx, 0.33, 1.45)
      this.chassisGroup.add(stripe)
    }

    // 3. Front Grille, Bumper, Splitter & Quad Headlights
    const grilleGeo = new THREE.BoxGeometry(CAR_W * 0.88, 0.22, 0.06)
    const grille = new THREE.Mesh(grilleGeo, grilleMat)
    grille.position.set(0, 0.10, CAR_L / 2 + 0.01)
    this.chassisGroup.add(grille)

    // Chrome front bumper bar
    const fvBumperGeo = new THREE.BoxGeometry(CAR_W * 0.94, 0.10, 0.12)
    const fvBumper = new THREE.Mesh(fvBumperGeo, chromeMat)
    fvBumper.position.set(0, -0.05, CAR_L / 2 + 0.04)
    this.chassisGroup.add(fvBumper)

    // Front chin splitter
    const splitterGeo = new THREE.BoxGeometry(CAR_W * 0.96, 0.04, 0.28)
    const splitter = new THREE.Mesh(splitterGeo, stripeMat)
    splitter.position.set(0, -0.14, CAR_L / 2 + 0.08)
    this.chassisGroup.add(splitter)

    // Quad round headlights with chrome bezels
    const headlights = [-0.65, -0.42, 0.42, 0.65] as const
    for (const x of headlights) {
      const bezelGeo = new THREE.CylinderGeometry(0.11, 0.11, 0.05, 14)
      bezelGeo.rotateX(Math.PI / 2)
      const bezel = new THREE.Mesh(bezelGeo, chromeMat)
      bezel.position.set(x, 0.12, CAR_L / 2 + 0.03)
      this.chassisGroup.add(bezel)

      const bulbGeo = new THREE.CylinderGeometry(0.085, 0.085, 0.055, 14)
      bulbGeo.rotateX(Math.PI / 2)
      const bulb = new THREE.Mesh(bulbGeo, headLightMat)
      bulb.position.set(x, 0.12, CAR_L / 2 + 0.04)
      this.chassisGroup.add(bulb)
    }

    // 4. Fastback Coupe Cockpit & Tinted Glass
    const roofGeo = new THREE.BoxGeometry(CAR_W * 0.82, 0.08, 1.4)
    const roof = new THREE.Mesh(roofGeo, paintMat)
    roof.position.set(0, 0.72, -0.32)
    this.chassisGroup.add(roof)

    const cabinGeo = new THREE.BoxGeometry(CAR_W * 0.80, 0.46, 1.95)
    const cabin = new THREE.Mesh(cabinGeo, glassMat)
    cabin.position.set(0, 0.48, -0.30)
    this.chassisGroup.add(cabin)

    const windshieldGeo = new THREE.BoxGeometry(CAR_W * 0.76, 0.06, 0.92)
    const windshield = new THREE.Mesh(windshieldGeo, glassMat)
    windshield.position.set(0, 0.54, 0.48)
    windshield.rotation.x = -0.58
    this.chassisGroup.add(windshield)

    const rearGlassGeo = new THREE.BoxGeometry(CAR_W * 0.74, 0.06, 1.15)
    const rearGlass = new THREE.Mesh(rearGlassGeo, glassMat)
    rearGlass.position.set(0, 0.52, -1.18)
    rearGlass.rotation.x = 0.50
    this.chassisGroup.add(rearGlass)

    // Side mirrors
    for (const x of [-CAR_W / 2 - 0.04, CAR_W / 2 + 0.04]) {
      const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.10, 0.12), paintMat)
      mirror.position.set(x, 0.38, 0.25)
      this.chassisGroup.add(mirror)
    }

    // 5. Rear Trunk & Ducktail Spoiler
    const trunkGeo = new THREE.BoxGeometry(CAR_W * 0.92, 0.18, 1.1)
    const trunk = new THREE.Mesh(trunkGeo, paintMat)
    trunk.position.set(0, 0.24, -1.75)
    this.chassisGroup.add(trunk)

    // Ducktail rear spoiler
    const spoilerGeo = new THREE.BoxGeometry(CAR_W * 0.86, 0.12, 0.22)
    const spoiler = new THREE.Mesh(spoilerGeo, stripeMat)
    spoiler.position.set(0, 0.36, -2.25)
    spoiler.rotation.x = 0.20
    this.chassisGroup.add(spoiler)

    // Rear fascia
    const rearPanel = new THREE.Mesh(new THREE.BoxGeometry(CAR_W * 0.90, 0.30, 0.08), grilleMat)
    rearPanel.position.set(0, 0.08, -CAR_L / 2 - 0.01)
    this.chassisGroup.add(rearPanel)

    // Chrome rear bumper
    const rBumper = new THREE.Mesh(new THREE.BoxGeometry(CAR_W * 0.98, 0.14, 0.16), chromeMat)
    rBumper.position.set(0, -0.06, -CAR_L / 2 - 0.04)
    this.chassisGroup.add(rBumper)

    // Quad horizontal red tail lights
    const taillights = [
      { x: -0.62, w: 0.28 },
      { x: -0.30, w: 0.28 },
      { x: 0.30, w: 0.28 },
      { x: 0.62, w: 0.28 },
    ] as const

    for (const t of taillights) {
      const housing = new THREE.Mesh(new THREE.BoxGeometry(t.w + 0.05, 0.14, 0.04), chromeMat)
      housing.position.set(t.x, 0.10, -CAR_L / 2 - 0.03)
      this.chassisGroup.add(housing)

      const tail = new THREE.Mesh(new THREE.BoxGeometry(t.w, 0.10, 0.05), tailLightMat)
      tail.position.set(t.x, 0.10, -CAR_L / 2 - 0.04)
      this.chassisGroup.add(tail)
    }

    // License plate
    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(0.38, 0.16, 0.03),
      new THREE.MeshStandardMaterial({ color: 0xe0e6ed, roughness: 0.4 }),
    )
    plate.position.set(0, 0.08, -CAR_L / 2 - 0.045)
    this.chassisGroup.add(plate)

    // Dual chrome exhaust pipes & nitro flames
    for (const x of [-0.45, 0.45]) {
      const pipeGeo = new THREE.CylinderGeometry(0.065, 0.065, 0.26, 12)
      pipeGeo.rotateX(Math.PI / 2)
      const pipe = new THREE.Mesh(pipeGeo, chromeMat)
      pipe.position.set(x, -0.16, -CAR_L / 2 - 0.08)
      this.chassisGroup.add(pipe)

      const flameGeo = new THREE.ConeGeometry(0.08, 0.50, 8)
      flameGeo.rotateX(-Math.PI / 2)
      flameGeo.translate(0, 0, -0.28)
      const flameMat = new THREE.MeshBasicMaterial({
        color: 0x00ff88,
        transparent: true,
        opacity: 0.85,
      })
      const flame = new THREE.Mesh(flameGeo, flameMat)
      flame.position.set(x, -0.16, -CAR_L / 2 - 0.18)
      flame.scale.set(0.001, 0.001, 0.001)
      this.chassisGroup.add(flame)
      this.nitroFlames.push(flame)
    }

    // ── C. 3D Wheels with Steerable Front Assemblies ────────────────────────
    function buildWheelMesh(isRight: boolean): THREE.Group {
      const g = new THREE.Group()

      // Tire (rubber cylinder)
      const tireGeo = new THREE.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, 0.28, 20)
      tireGeo.rotateZ(Math.PI / 2)
      const tire = new THREE.Mesh(tireGeo, tireMat)
      tire.castShadow = true
      g.add(tire)

      // Chrome rim
      const rimGeo = new THREE.CylinderGeometry(WHEEL_RADIUS * 0.70, WHEEL_RADIUS * 0.70, 0.29, 16)
      rimGeo.rotateZ(Math.PI / 2)
      const rim = new THREE.Mesh(rimGeo, rimMat)
      g.add(rim)

      // 5 Chrome spokes
      for (let s = 0; s < 5; s++) {
        const angle = (s * Math.PI * 2) / 5
        const spokeGeo = new THREE.BoxGeometry(0.05, WHEEL_RADIUS * 0.65, 0.04)
        spokeGeo.rotateZ(angle)
        spokeGeo.translate(isRight ? 0.13 : -0.13, 0, 0)
        const spoke = new THREE.Mesh(spokeGeo, chromeMat)
        g.add(spoke)
      }

      // Brake caliper
      const caliperGeo = new THREE.BoxGeometry(0.12, 0.15, 0.10)
      const caliper = new THREE.Mesh(caliperGeo, brakeMat)
      caliper.position.set(isRight ? 0.08 : -0.08, 0.14, 0)
      g.add(caliper)

      return g
    }

    const zFront = CAR_L / 2 - 0.95
    const zRear = -CAR_L / 2 + 0.95
    const xFL = -CAR_W / 2 - 0.06
    const xFR = CAR_W / 2 + 0.06
    const xRL = -CAR_W / 2 - 0.08
    const xRR = CAR_W / 2 + 0.08

    // 1. Front Left (Steering parent + Spinning child)
    this.wheelFLSteer = new THREE.Group()
    this.wheelFLSteer.position.set(xFL, WHEEL_Y, zFront)
    const wheelFL = buildWheelMesh(false)
    this.wheelFLSteer.add(wheelFL)
    car.add(this.wheelFLSteer)
    this.wheelMeshes.push(wheelFL)

    // 2. Front Right (Steering parent + Spinning child)
    this.wheelFRSteer = new THREE.Group()
    this.wheelFRSteer.position.set(xFR, WHEEL_Y, zFront)
    const wheelFR = buildWheelMesh(true)
    this.wheelFRSteer.add(wheelFR)
    car.add(this.wheelFRSteer)
    this.wheelMeshes.push(wheelFR)

    // 3. Rear Left (Fixed yaw + Spinning)
    const rearLGroup = new THREE.Group()
    rearLGroup.position.set(xRL, WHEEL_Y, zRear)
    const wheelRL = buildWheelMesh(false)
    rearLGroup.add(wheelRL)
    car.add(rearLGroup)
    this.wheelMeshes.push(wheelRL)

    // 4. Rear Right (Fixed yaw + Spinning)
    const rearRGroup = new THREE.Group()
    rearRGroup.position.set(xRR, WHEEL_Y, zRear)
    const wheelRR = buildWheelMesh(true)
    rearRGroup.add(wheelRR)
    car.add(rearRGroup)
    this.wheelMeshes.push(wheelRR)

    // Enable castShadow across all components
    car.traverse((child) => {
      if ((child as THREE.Mesh).isMesh && child !== shadowMesh) {
        child.castShadow = true
      }
    })

    return car
  }

  private _buildShieldMesh(): THREE.Group {
    const group = new THREE.Group()
    group.name = 'player_shield'

    // Inner glowing aerodynamic forcefield ellipsoid
    const innerGeo = new THREE.SphereGeometry(1, 32, 20)
    this.shieldInnerMat = new THREE.MeshStandardMaterial({
      color: 0x00d4ff,
      emissive: 0x0099ff,
      emissiveIntensity: 0.85,
      roughness: 0.1,
      metalness: 0.15,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
    const innerMesh = new THREE.Mesh(innerGeo, this.shieldInnerMat)
    innerMesh.scale.set(1.5, 1.1, 2.7)
    innerMesh.position.set(0, 0.65, 0)
    group.add(innerMesh)

    // Outer lattice wireframe shell with additive glow
    const outerGeo = new THREE.IcosahedronGeometry(1.02, 3)
    this.shieldOuterMat = new THREE.MeshBasicMaterial({
      color: 0x66f0ff,
      wireframe: true,
      transparent: true,
      opacity: 0.25,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    this.shieldOuterMesh = new THREE.Mesh(outerGeo, this.shieldOuterMat)
    this.shieldOuterMesh.scale.set(1.53, 1.13, 2.73)
    this.shieldOuterMesh.position.set(0, 0.65, 0)
    group.add(this.shieldOuterMesh)

    return group
  }

  triggerInvincibility(durationMs = 30_000): void {
    this.invincibleUntil = Date.now() + durationMs
    this.lastWarningPlayed = false
    this.wasInvincible = true
    this.onInvincibilityChanged?.(true)
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
      const steerTorque = -input.steering * STEER_RATE * speedFactor * highSpeedDamp * CAR_MASS * 2.2
      this.body.applyTorqueImpulse({ x: 0, y: steerTorque * dt, z: 0 }, true)
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

    // ── Handbrake Drift ──────────────────────────────────────────────────────
    if (input.handbrake) {
      const vel = this.body.linvel()
      const dragFactor = 1.0 - 1.8 * dt
      this.body.setLinvel({ x: vel.x * dragFactor, y: vel.y, z: vel.z * dragFactor }, true)
    }

    // ── Natural Drag ─────────────────────────────────────────────────────────
    if (input.throttle === 0 && input.brake === 0 && speed > 0.1) {
      const vel = this.body.linvel()
      const drag = Math.max(0, 1.0 - (NATURAL_DRAG / (speed + 0.1)) * dt)
      this.body.setLinvel({ x: vel.x * drag, y: vel.y, z: vel.z * drag }, true)
    }

    // ── Lateral Friction / Grip (Arcade Drift Feel) ──────────────────────────
    const right = this.getRightVector()
    const vel = this.body.linvel()
    const lateralSpeed = vel.x * right.x + vel.z * right.z
    const gripFactor = input.handbrake ? 0.82 : 0.94
    const lateralCorrection = -lateralSpeed * (1.0 - gripFactor)
    this.body.applyImpulse(
      { x: right.x * lateralCorrection * CAR_MASS, y: 0, z: right.z * lateralCorrection * CAR_MASS },
      true,
    )

    // ── Aerodynamic Downforce: Keeps Tires Firmly Planted On Ground ──────────
    const downforce = 450 + speed * 160
    this.body.applyImpulse({ x: 0, y: -downforce * dt, z: 0 }, true)

    // Store inputs for visual suspension in syncMesh
    this._lastThrottle = input.throttle
    this._lastBrake = input.brake
    this._lastSteer = input.steering
    this._lastLateralSpeed = lateralSpeed
  }

  private _lastThrottle = 0
  private _lastBrake = 0
  private _lastSteer = 0
  private _lastLateralSpeed = 0

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
    const spinDelta = (forwardSpeed * dt) / WHEEL_RADIUS
    for (const w of this.wheelMeshes) {
      w.rotation.x += spinDelta
    }

    // ── 3. Visual Suspension Dynamics (Pitch & Roll) ─────────────────────────
    // Pitch: Squat on acceleration, dive on braking
    const targetPitch = (this._lastThrottle * -0.028) + (this._lastBrake * 0.038)
    this.chassisPitch = THREE.MathUtils.lerp(this.chassisPitch, targetPitch, 0.16)

    // Roll: Lean outward from cornering and drifts
    const steerRoll = (this._lastSteer * 0.040) * Math.min(1.0, speed / 12.0)
    const driftRoll = (this._lastLateralSpeed / 16.0) * 0.045
    const targetRoll = -(steerRoll + driftRoll)
    this.chassisRoll = THREE.MathUtils.lerp(this.chassisRoll, targetRoll, 0.16)

    this.chassisGroup.rotation.x = this.chassisPitch
    this.chassisGroup.rotation.z = this.chassisRoll

    // ── 4. Burnout Green Nitro Exhaust Flames ────────────────────────────────
    const isAccelerating = forwardSpeed > 4.0
    for (const flame of this.nitroFlames) {
      if (isAccelerating) {
        const flicker = 0.85 + Math.random() * 0.35
        const intensity = Math.min(1.5, forwardSpeed / 20.0) * flicker
        flame.scale.set(intensity, intensity, intensity * (1.0 + Math.random() * 0.4))
        flame.visible = true
      } else {
        flame.scale.set(0.001, 0.001, 0.001)
        flame.visible = false
      }
    }

    // ── 5. Invincibility Forcefield Animation ────────────────────────────────
    const remaining = this.getInvincibilityRemaining()
    const currentlyInvincible = remaining > 0
    if (currentlyInvincible !== this.wasInvincible) {
      this.wasInvincible = currentlyInvincible
      this.onInvincibilityChanged?.(currentlyInvincible)
    }

    if (currentlyInvincible) {
      this.shieldGroup.visible = true
      this.shieldTime += dt
      this.shieldOuterMesh.rotation.y += dt * 0.45
      this.shieldOuterMesh.rotation.z += dt * 0.18

      if (remaining <= 5.0) {
        if (!this.lastWarningPlayed) {
          this.lastWarningPlayed = true
          this.onInvincibilityWarning?.()
        }
        const flash = Math.sin(this.shieldTime * 14) > 0
        this.shieldInnerMat.color.setHex(flash ? 0xff3b00 : 0xffaa00)
        this.shieldInnerMat.emissive.setHex(flash ? 0xff2200 : 0xff6600)
        this.shieldOuterMat.color.setHex(flash ? 0xff7700 : 0xffdd44)
        this.shieldInnerMat.opacity = flash ? 0.42 : 0.16
        this.shieldOuterMat.opacity = flash ? 0.35 : 0.12
      } else {
        const pulse = Math.sin(this.shieldTime * 3.5) * 0.08
        this.shieldInnerMat.color.setHex(0x00d4ff)
        this.shieldInnerMat.emissive.setHex(0x0088ff)
        this.shieldOuterMat.color.setHex(0x66f0ff)
        this.shieldInnerMat.opacity = 0.28 + pulse
        this.shieldOuterMat.opacity = 0.22 + pulse * 0.5
      }
    } else {
      this.shieldGroup.visible = false
    }
  }

  getPosition(): WorldPosition {
    const t = this.body.translation()
    return { x: t.x, y: t.y, z: t.z }
  }

  getVelocity(): { x: number; y: number; z: number } {
    const v = this.body.linvel()
    return { x: v.x, y: v.y, z: v.z }
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
  }

  /**
   * Teleport the car to a new world position and heading.
   */
  teleport(pos: WorldPosition, headingRad = 0): void {
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), headingRad)
    this.body.setTranslation({ x: pos.x, y: pos.y + 0.48, z: pos.z }, true)
    this.body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true)
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true)
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true)
    this.triggerInvincibility(30_000)
    this.syncMesh()
  }
}
