/**
 * PlayerPlane — the player's light two-seat aircraft ("Alizé").
 *
 * Flight model (fixed 60 Hz, semi-implicit Euler, quaternion orientation,
 * body rates):
 *  - Forces come from a pure function (`computeAeroForces`): lift ⟂ velocity in
 *    the body's up/forward plane (CL(α) with a smooth stall past 14.3°), drag
 *    CD0 + k·CL² (+ post-stall / sideslip / idle-propeller terms), fuselage
 *    side force opposing sideslip, thrust fading with airspeed, gravity.
 *  - Rotations are body-rate commands with a first-order response: stick →
 *    rate (scaled by control effectiveness), plus weathervane stability toward
 *    a trim α (pitch) and zero sideslip (yaw), automatic turn coordination
 *    (the body turns with the velocity's heading rate) and a stall latch that
 *    drops the nose until α is a few degrees under the critical angle.
 *  - Hands-off, the trim α is the one that holds the flight path the pilot
 *    left (stability augmentation), with a PI speed protection (too slow →
 *    lower the held path, never into the ground near it; too fast → raise
 *    it). Roll is neutral up to 30° of bank. Full back stick settles just
 *    under the critical angle; the stall comes with low speed / power off.
 *  - Ground: tricycle gear on three wheel rays (slopes, bridge decks), rotation
 *    above Vr with back pressure, rolling friction, brakes, car-like
 *    nose-wheel steering + pivot when stopped, lift-off when lift > weight.
 *    Touchdown is a landing (sink < 4 m/s, |bank| < 15°, pitch −5°…15°) or a
 *    crash. Obstacles: swept spheres (fuselage, nose, wingtips in the air) and
 *    a walls-only building test; a crash freezes the plane 1.2 s, then it
 *    respawns where it was spawned.
 *
 * Everything but the scene queries and the mesh lives in `FlightSim` (no
 * Rapier, no scene) so it can be simulated headless; the game backs it with
 * Rapier queries (`RapierFlightEnvironment`).
 *
 * Frames. World: metres, y up. Body: +Z forward (nose), +Y up, +X = LEFT wing.
 * The reference point is the point between the main wheels at ground level.
 * Heading follows PlayerCar.getYaw(): forward = (sin h, 0, cos h).
 */

import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import type { WorldPosition } from '@world-drive/math'
import {
  createTwoSeatAirplane,
  AIRPLANE_MAIN_WHEEL_X,
  AIRPLANE_MAIN_WHEEL_Z,
  AIRPLANE_NOSE_WHEEL_Z,
  AIRPLANE_PROPELLER_POSITION,
  AIRPLANE_PROPELLER_RADIUS,
  type TwoSeatAirplane,
} from './AirplaneModel.js'

// ─── Public contract types ──────────────────────────────────────────────────

export type FlightInput = {
  /** Increase throttle (held). */
  throttleUp: boolean
  /** Decrease throttle (held). */
  throttleDown: boolean
  /** -1..1, +1 = pull = nose UP. */
  pitch: number
  /** -1..1, +1 = roll RIGHT (on the ground: steer nose wheel right). */
  roll: number
  /** -1..1, +1 = yaw right (rudder; optional, 0 on keyboard). */
  yaw: number
  /** Wheel brakes on the ground. */
  brake: boolean
  /** Optional absolute throttle 0..1 (touch auto-throttle); overrides up/down when defined. */
  throttleSet?: number
}

export type PlaneState = {
  airspeed: number
  groundSpeed: number
  altitudeAGL: number
  altitudeMSL: number
  verticalSpeed: number
  throttle: number
  onGround: boolean
  stall: boolean
  crashed: boolean
  heading: number
  pitchDeg: number
  bankDeg: number
}

export type PlaneSpawnOptions = {
  airborne?: boolean
  /** Height above the ground point, metres (default 150). */
  altitude?: number
  /** Initial airspeed, m/s (default 50). */
  speed?: number
}

export type PlaneCrashCallback = (intensity: number, point: WorldPosition, direction: WorldPosition) => void

// ─── Parameters ──────────────────────────────────────────────────────────────

const DEG = Math.PI / 180

export const PLANE_PARAMS = {
  // Airframe
  mass: 760,
  wingArea: 12,
  span: 9.5,
  rho: 1.225,
  gravity: 9.81,
  // Engine / propeller: T = throttle · T0 · max(minFactor, 1 − V / fadeSpeed)
  thrustStatic: 3200,
  thrustFadeSpeed: 100,
  thrustMinFactor: 0.15,
  throttleRate: 0.4, // lever travel per second while throttleUp/Down is held (0 → 1 in 2.5 s)
  throttleTau: 0.35, // engine response time constant (s)
  // Lift
  CL0: 0.25,
  CLalpha: 5.2,
  CLmax: 1.55,
  CLmin: -1.0,
  CLpost: 0.9, // at alphaPost
  CLpostNeg: -0.6,
  alphaPost: 22 * DEG,
  // Drag / side force
  CD0: 0.03,
  CDk: 0.055,
  CDflat: 1.15, // post-stall flat-plate drag · sin²α
  CDbeta: 0.5,
  CDprop: 0.008, // windmilling propeller drag at idle (× (1 − throttle))
  CYbeta: -1.2,
  // Control rates (rad/s at full effectiveness)
  rollRate: 1.8,
  pitchRate: 0.9,
  yawRate: 0.4,
  rateTau: 0.25,
  // Stability
  alphaTrim: 2 * DEG, // fixed trim (on the ground, knife-edge / inverted)
  // Hands-off flight-path hold (stability augmentation): the trim α is the α
  // that keeps the flight path the pilot left (γ captured when the stick is
  // released), with speed protection: too slow → the held path is lowered,
  // too fast → raised. Up to holdMaxBank the lift also carries the turn.
  holdGain: 0.8, // 1/s, path error → path rate
  holdAlphaMin: -4 * DEG,
  holdAlphaMax: 10 * DEG,
  stallTrimMax: 6 * DEG, // while stalled the hold gives up: trim α capped here
  stickTrimBlend: 1, // stick deflection measured from the fixed trim (see stepAir)
  holdMaxBank: 50 * DEG,
  holdMaxClimb: 40 * DEG,
  holdMaxDive: -60 * DEG,
  takeoffClimb: 6 * DEG, // hands-off right after lift-off, the held path is at least this climb
  takeoffAssistTime: 10, // s after lift-off
  protectLowSpeed: 32, // m/s (≈ 1.25 · stall speed): below it the held path is lowered
  protectHighSpeed: 66, // above it the held path is raised
  protectKp: 0.06, // rad of path per m/s of speed error
  protectKi: 0.03, // rad/s of path per m/s of speed error
  kAlpha: 2.4, // pitch weathervane (rad/s per rad of α − αtrim)
  alphaSoft: 11 * DEG, // above it the pitch stiffness rises (soft α limiter):
  kAlphaSoft: 6, //       full back stick settles just under the critical angle

  kBeta: 3, // yaw weathervane (rad/s per rad of β)
  rollLevel: 0.35, // rad/s per unit sin: steep banks ease back toward rollNeutralBank
  rollNeutralBank: 30 * DEG, // up to this bank the roll is neutral (a turn is held hands-off)
  stallDrop: 0.7, // nose-drop rate while stalled (rad/s)
  stallExitMargin: 3.5 * DEG, // the stall ends below αstall − margin
  maxBodyRate: 2.5,
  // Ground
  Vr: 26,
  rollFriction: 0.02,
  brakeDecel: 0.6, // × g
  lateralGrip: 0.9, // × g
  maxSteer: 30 * DEG,
  wheelBase: 2.1,
  steerLatAccel: 0.45, // × g, nose-wheel steering lateral acceleration limit
  pivotRate: 0.55, // rad/s turn in place (differential braking) when nearly stopped
  tailStrikePitch: 14 * DEG,
  // Landing
  landingMaxSink: 4,
  landingMaxBank: 15 * DEG,
  landingMinPitch: -5 * DEG,
  landingMaxPitch: 15 * DEG,
  // Misc
  crashFreeze: 1.2,
  maxSpeed: 110,
  maxAltitude: 3000,
} as const

export type PlaneParams = typeof PLANE_PARAMS

// ─── Geometry in the body frame (+Z forward, +X left, origin = main wheels on the ground)
const MAIN_X = AIRPLANE_MAIN_WHEEL_X
const NOSE_Z = AIRPLANE_MAIN_WHEEL_Z - AIRPLANE_NOSE_WHEEL_Z // 2.18
const FUSE_Y = 1.25
const FUSE_R = 0.9
const NOSE_SPHERE: Readonly<[number, number, number]> = [0, 1.2, 2.9]
const NOSE_R = 0.5
const TIP_X = 4.55
const TIP_Y = 1.33
const TIP_Z = -0.05
const TIP_R = 0.3

// ─── Environment (scene queries) ────────────────────────────────────────────

export interface FlightEnvironment {
  /**
   * Height of the rollable ground (ground slab, roads, bridge decks) found by
   * a ray going down from (x, fromY, z) over maxDist. null = nothing there.
   */
  groundHeight(x: number, fromY: number, z: number, maxDist: number): number | null
  /**
   * Sweep a sphere from a to b against static obstacles (buildings, trees,
   * bollards, barriers, road/bridge geometry; NOT the flat ground slab).
   * `ignorePosts`: skip thin posts (tree trunks, bollards) — used for the
   * wingtips, which already pass through trunks while taxiing.
   * Returns the hit fraction in [0, 1], or -1 for no hit.
   */
  sweepSphere(ax: number, ay: number, az: number, bx: number, by: number, bz: number, radius: number, ignorePosts?: boolean): number
  /** True when the point is enclosed by a building's walls (the colliders have no roof). */
  isEnclosed(x: number, y: number, z: number): boolean
  /** Like sweepSphere but against large static triangle meshes only (building walls, decks): camera arm. */
  sweepWalls?(ax: number, ay: number, az: number, bx: number, by: number, bz: number, radius: number): number
}

/** Flat infinite ground at y = groundY, no obstacles (tests). */
export class FlatFlightEnvironment implements FlightEnvironment {
  constructor(public groundY = 0) {}
  groundHeight(_x: number, fromY: number, _z: number, maxDist: number): number | null {
    if (fromY < this.groundY) return fromY // inside the ground: push up
    return fromY - maxDist <= this.groundY ? this.groundY : null
  }
  sweepSphere(): number {
    return -1
  }
  isEnclosed(): boolean {
    return false
  }
}

// ─── Small math helpers ──────────────────────────────────────────────────────

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}
function smooth01(x: number): number {
  const t = clamp(x, 0, 1)
  return t * t * (3 - 2 * t)
}
function finiteOr(v: number, fallback: number): number {
  return Number.isFinite(v) ? v : fallback
}
function wrapAngle(a: number): number {
  let x = a
  while (x > Math.PI) x -= Math.PI * 2
  while (x < -Math.PI) x += Math.PI * 2
  return x
}

const _euler = new THREE.Euler(0, 0, 0, 'YXZ')
/** Orientation from heading (about +Y), pitch (nose up +) and bank (right wing down +). */
export function quatFromHeadingPitchBank(out: THREE.Quaternion, heading: number, pitch: number, bank: number): THREE.Quaternion {
  _euler.set(-pitch, heading, bank, 'YXZ')
  return out.setFromEuler(_euler)
}

const _hF = new THREE.Vector3()
const _hU = new THREE.Vector3()
const _hL = new THREE.Vector3()
/** Bank (rad, + = right wing down) of an orientation, allocation-free. */
export function bankOf(q: THREE.Quaternion): number {
  _hU.set(0, 1, 0).applyQuaternion(q)
  _hL.set(1, 0, 0).applyQuaternion(q)
  return Math.atan2(_hL.y, _hU.y)
}

/** Heading / pitch / bank (radians) of an orientation, robust at steep pitch. */
export function headingPitchBank(q: THREE.Quaternion): { heading: number; pitch: number; bank: number } {
  _hF.set(0, 0, 1).applyQuaternion(q)
  _hU.set(0, 1, 0).applyQuaternion(q)
  _hL.set(1, 0, 0).applyQuaternion(q)
  const hx = _hF.x - _hU.x * _hF.y
  const hz = _hF.z - _hU.z * _hF.y
  return {
    heading: hx * hx + hz * hz > 1e-12 ? Math.atan2(hx, hz) : 0,
    pitch: Math.asin(clamp(_hF.y, -1, 1)),
    bank: Math.atan2(_hL.y, _hU.y),
  }
}

// ─── Pure aerodynamics ───────────────────────────────────────────────────────

/** Lift coefficient over the whole α range (−π, π]. */
export function liftCoefficient(alpha: number, p: PlaneParams = PLANE_PARAMS): number {
  const aStall = (p.CLmax - p.CL0) / p.CLalpha
  const aNeg = (p.CLmin - p.CL0) / p.CLalpha
  if (alpha >= aNeg && alpha <= aStall) return p.CL0 + p.CLalpha * alpha
  if (Math.abs(alpha) > Math.PI / 2) return 0.5 * Math.sin(2 * alpha) // tail first: weak flat plate
  if (alpha > aStall) {
    if (alpha <= p.alphaPost) return p.CLmax + (p.CLpost - p.CLmax) * smooth01((alpha - aStall) / (p.alphaPost - aStall))
    return p.CLpost * Math.cos(((alpha - p.alphaPost) / (Math.PI / 2 - p.alphaPost)) * (Math.PI / 2))
  }
  if (alpha >= -p.alphaPost) return p.CLmin + (p.CLpostNeg - p.CLmin) * smooth01((aNeg - alpha) / (aNeg + p.alphaPost))
  return p.CLpostNeg * Math.cos(((-alpha - p.alphaPost) / (Math.PI / 2 - p.alphaPost)) * (Math.PI / 2))
}

export function stallAlpha(p: PlaneParams = PLANE_PARAMS): number {
  return (p.CLmax - p.CL0) / p.CLalpha
}

export type AeroForces = {
  /** Aerodynamic + thrust force, world frame (N). Gravity NOT included. */
  force: THREE.Vector3
  airspeed: number
  /** Angle of attack (rad, + = relative wind from below). */
  alpha: number
  /** Sideslip (rad, + = velocity to the right of the nose). */
  beta: number
  CL: number
  CD: number
  lift: number
  drag: number
  thrust: number
  /** Past the critical angle (either sign). */
  stalled: boolean
  /** 0..1 how deep past the critical angle. */
  stallDepth: number
}

export function createAeroForces(): AeroForces {
  return { force: new THREE.Vector3(), airspeed: 0, alpha: 0, beta: 0, CL: 0, CD: 0, lift: 0, drag: 0, thrust: 0, stalled: false, stallDepth: 0 }
}

const _aF = new THREE.Vector3()
const _aU = new THREE.Vector3()
const _aL = new THREE.Vector3()
const _aDir = new THREE.Vector3()
const _aV = new THREE.Vector3()

/**
 * Pure force computation: lift ⟂ velocity in the body's up/forward plane,
 * drag along −velocity, fuselage side force opposing sideslip, thrust along
 * the nose. No allocation (writes into `out`).
 */
export function computeAeroForces(
  vel: THREE.Vector3,
  quat: THREE.Quaternion,
  throttle: number,
  p: PlaneParams = PLANE_PARAMS,
  out: AeroForces = createAeroForces(),
): AeroForces {
  const F = _aF.set(0, 0, 1).applyQuaternion(quat)
  const U = _aU.set(0, 1, 0).applyQuaternion(quat)
  const L = _aL.set(1, 0, 0).applyQuaternion(quat)
  const V = vel.length()
  out.force.set(0, 0, 0)
  out.airspeed = V

  const thr = clamp(finiteOr(throttle, 0), 0, 1)
  const T = thr * p.thrustStatic * Math.max(p.thrustMinFactor, 1 - V / p.thrustFadeSpeed)
  out.thrust = T
  out.force.addScaledVector(F, T)

  if (V < 0.3) {
    out.alpha = 0
    out.beta = 0
    out.CL = 0
    out.CD = 0
    out.lift = 0
    out.drag = 0
    out.stalled = false
    out.stallDepth = 0
    return out
  }

  const vf = vel.dot(F)
  const vu = vel.dot(U)
  const vl = vel.dot(L)
  const alpha = Math.atan2(-vu, vf)
  const beta = Math.asin(clamp(-vl / V, -1, 1))
  out.alpha = alpha
  out.beta = beta

  const CL = liftCoefficient(alpha, p)
  const absA = Math.abs(alpha)
  const sinA = Math.sin(alpha)
  const sinB = Math.sin(beta)
  const flatBlend = absA > Math.PI / 2 ? 1 : smooth01((absA - 10 * DEG) / (15 * DEG))
  const CD = p.CD0 + p.CDprop * (1 - thr) + p.CDk * CL * CL + p.CDflat * sinA * sinA * flatBlend + p.CDbeta * sinB * sinB
  out.CL = CL
  out.CD = CD

  const S = p.wingArea
  const qDyn = 0.5 * p.rho * V * V
  const qSym = 0.5 * p.rho * (vu * vu + vf * vf)

  // Lift: ⟂ to the velocity and to the wing axis → lies in the body's up/forward plane
  const vHat = _aV.copy(vel).multiplyScalar(1 / V)
  const lDir = _aDir.crossVectors(vHat, L)
  const lLen = lDir.length()
  let lift = 0
  if (lLen > 1e-3) {
    lift = qSym * S * CL
    out.force.addScaledVector(lDir, lift / lLen)
  }
  out.lift = lift

  // Drag
  const drag = qDyn * S * CD
  out.force.addScaledVector(vHat, -drag)
  out.drag = drag

  // Side force (fuselage + fin), along the body lateral axis: CY·β toward the nose
  const CY = p.CYbeta * clamp(beta, -0.6, 0.6)
  // + beta = velocity to the right → force to the left (= +L)
  out.force.addScaledVector(L, -qDyn * S * CY)

  const aStall = stallAlpha(p)
  const aNeg = (p.CLmin - p.CL0) / p.CLalpha
  const over = alpha > aStall ? alpha - aStall : alpha < aNeg ? aNeg - alpha : 0
  out.stalled = over > 0 && absA < Math.PI / 2 + 0.5
  out.stallDepth = out.stalled ? smooth01(over / (6 * DEG)) : 0
  return out
}

/**
 * Trim α of the flight-path hold: the α whose lift gives the path rate that
 * brings γ back to γhold (bank-compensated up to holdMaxBank), fading to the
 * fixed trim toward knife-edge / inverted flight.
 */
export function holdTrimAlpha(airspeed: number, gamma: number, gammaHold: number, bank: number, p: PlaneParams = PLANE_PARAMS): number {
  const qS = 0.5 * p.rho * airspeed * airspeed * p.wingArea
  const ab = Math.abs(bank)
  if (qS < 1 || airspeed < 8 || ab >= 75 * DEG) return p.alphaTrim
  const gammaRate = p.holdGain * (gammaHold - gamma)
  const nz = Math.cos(gamma) + (airspeed * gammaRate) / p.gravity
  const lift = (p.mass * p.gravity * nz) / Math.cos(Math.min(ab, p.holdMaxBank))
  const sched = clamp((lift / qS - p.CL0) / p.CLalpha, p.holdAlphaMin, p.holdAlphaMax)
  const w = smooth01((ab - 60 * DEG) / (15 * DEG))
  return sched + (p.alphaTrim - sched) * w
}

/** Pitch weathervane: body pitch rate (+ = nose up) that turns the nose toward the trimmed α. */
export function pitchStability(alpha: number, p: PlaneParams = PLANE_PARAMS, trim: number = p.alphaTrim): number {
  let s = -p.kAlpha * (alpha - trim)
  if (alpha > p.alphaSoft) s -= p.kAlphaSoft * (alpha - p.alphaSoft)
  else if (alpha < -p.alphaSoft) s -= p.kAlphaSoft * (alpha + p.alphaSoft)
  return clamp(s, -p.maxBodyRate, p.maxBodyRate)
}

// ─── Flight simulation (pure: no Rapier / no rendering) ─────────────────────

export type SpawnArgs = {
  ground: WorldPosition
  heading: number
  airborne: boolean
  altitude: number
  speed: number
}

export type CrashEvent = { intensity: number; point: WorldPosition; direction: WorldPosition }

const _gravity = new THREE.Vector3()
const _acc = new THREE.Vector3()
const _omegaT = new THREE.Vector3()
const _tmp = new THREE.Vector3()
const _tmp2 = new THREE.Vector3()
const _qInv = new THREE.Quaternion()
const _dq = new THREE.Quaternion()
const _axis = new THREE.Vector3()
const _fG = new THREE.Vector3()
const _rH = new THREE.Vector3()
const _w0 = new THREE.Vector3()
const _w1 = new THREE.Vector3()
const _sA = new THREE.Vector3()
const _sB = new THREE.Vector3()
const _qA = new THREE.Quaternion()
const _qTilt = new THREE.Quaternion()

/**
 * The whole flight model, free of Rapier and Three.js scene objects so that it
 * can be simulated headless. PlayerPlane wraps it with scene queries + mesh.
 */
export class FlightSim {
  readonly p: PlaneParams
  env: FlightEnvironment

  // Physics state
  readonly pos = new THREE.Vector3()
  readonly vel = new THREE.Vector3()
  readonly quat = new THREE.Quaternion()
  /** Body-axis angular velocity (x = about the left wing, y = up, z = nose). */
  readonly omega = new THREE.Vector3()
  /** Previous step (render interpolation). */
  readonly prevPos = new THREE.Vector3()
  readonly prevQuat = new THREE.Quaternion()

  lever = 0 // commanded throttle
  throttle = 0 // engine (smoothed)
  onGround = true
  stall = false
  /** Stall latch: +1 positive stall, −1 negative stall, 0 flying. */
  stallDir = 0
  /** Flight path angle held hands-off (rad). */
  gammaHold = 0
  private sinceStall = 99
  private sinceLiftoff = 99
  private protLowI = 0
  private protHighI = 0
  crashed = false
  crashTimer = 0
  /** Ground height under the plane (last known). */
  groundY = 0
  altitudeAGL = 0
  readonly aero: AeroForces = createAeroForces()
  /** Last touchdown sink rate (m/s, for visual squash), reset by the reader. */
  lastTouchdownSink = 0
  /** Increments on every (re)spawn: renderers use it to reset interpolation / camera. */
  spawnCount = 0
  crashCount = 0
  pendingCrash: CrashEvent | null = null

  // Ground-mode state
  private gHeading = 0
  private gPitchRot = 0 // rotation above the ground attitude (rad)
  private gPitchRate = 0
  private gGroundPitch = 0 // attitude with the nose wheel on the ground (slopes)
  private gBank = 0 // residual bank right after touchdown, decays
  private gYawRate = 0
  private gSteer = 0
  private gSpeed = 0 // along the ground heading
  private gLat = 0 // lateral (right +)
  private gSettle = 0 // s after a touchdown during which the plane stays down unless the pilot pulls

  private spawnArgs: SpawnArgs = { ground: { x: 0, y: 0, z: 0 }, heading: 0, airborne: false, altitude: 150, speed: 50 }

  constructor(env: FlightEnvironment, params: PlaneParams = PLANE_PARAMS) {
    this.env = env
    this.p = params
  }

  // ── Spawn / reset ──────────────────────────────────────────────────────────

  spawn(ground: WorldPosition, heading: number, opts: PlaneSpawnOptions = {}): void {
    const h = finiteOr(heading, 0)
    this.spawnArgs = {
      ground: { x: finiteOr(ground.x, 0), y: finiteOr(ground.y, 0), z: finiteOr(ground.z, 0) },
      heading: h,
      airborne: opts.airborne === true,
      altitude: clamp(finiteOr(opts.altitude ?? 150, 150), 5, this.p.maxAltitude - 10),
      speed: clamp(finiteOr(opts.speed ?? 50, 50), 20, 90),
    }
    this.respawn()
  }

  /** Back to the remembered spawn point (on the ground, stopped — or airborne if spawned so). */
  respawn(): void {
    const a = this.spawnArgs
    const p = this.p
    this.crashed = false
    this.crashTimer = 0
    this.stall = false
    this.stallDir = 0
    this.pendingCrash = null
    this.omega.set(0, 0, 0)
    this.gammaHold = 0
    this.protLowI = 0
    this.protHighI = 0
    this.sinceLiftoff = 99
    this.sinceStall = 99
    this.gPitchRate = 0
    this.gYawRate = 0
    this.gSteer = 0
    this.gBank = 0
    this.gLat = 0
    this.gSettle = 0
    this.lastTouchdownSink = 0
    if (a.airborne) {
      // Level flight: pitch = the α whose lift equals the weight at that speed.
      const V = a.speed
      const CL = (p.mass * p.gravity) / (0.5 * p.rho * V * V * p.wingArea)
      const alpha = clamp((CL - p.CL0) / p.CLalpha, -2 * DEG, 10 * DEG)
      this.pos.set(a.ground.x, a.ground.y + a.altitude, a.ground.z)
      quatFromHeadingPitchBank(this.quat, a.heading, alpha, 0)
      this.vel.set(Math.sin(a.heading) * V, 0, Math.cos(a.heading) * V)
      this.lever = 0.65
      this.throttle = 0.65
      this.onGround = false
      this.groundY = a.ground.y
      this.altitudeAGL = a.altitude
    } else {
      this.pos.set(a.ground.x, a.ground.y, a.ground.z)
      const gy = this.env.groundHeight(a.ground.x, a.ground.y + 1.5, a.ground.z, 4)
      if (gy !== null && Number.isFinite(gy)) this.pos.y = gy
      this.vel.set(0, 0, 0)
      this.lever = 0
      this.throttle = 0
      this.onGround = true
      this.gHeading = a.heading
      this.gPitchRot = 0
      this.gGroundPitch = 0
      this.gSpeed = 0
      quatFromHeadingPitchBank(this.quat, a.heading, 0, 0)
      this.groundY = this.pos.y
      this.altitudeAGL = 0
    }
    this.prevPos.copy(this.pos)
    this.prevQuat.copy(this.quat)
    this.spawnCount++
  }

  // ── Fixed step ─────────────────────────────────────────────────────────────

  step(rawInput: FlightInput, dtIn: number): void {
    const dt = clamp(finiteOr(dtIn, 1 / 60), 1e-4, 0.05)
    this.prevPos.copy(this.pos)
    this.prevQuat.copy(this.quat)

    if (this.crashed) {
      this.crashTimer -= dt
      this.throttle = 0
      this.lever = 0
      if (this.crashTimer <= 0) this.respawn()
      return
    }

    // Sanitised input
    const pitchIn = clamp(finiteOr(rawInput.pitch, 0), -1, 1)
    const rollIn = clamp(finiteOr(rawInput.roll, 0), -1, 1)
    const yawIn = clamp(finiteOr(rawInput.yaw, 0), -1, 1)

    // Throttle lever + engine lag
    const set = rawInput.throttleSet
    if (set !== undefined && Number.isFinite(set)) {
      this.lever = clamp(set, 0, 1)
    } else {
      const d = (rawInput.throttleUp ? 1 : 0) - (rawInput.throttleDown ? 1 : 0)
      this.lever = clamp(this.lever + d * this.p.throttleRate * dt, 0, 1)
    }
    this.throttle += (this.lever - this.throttle) * (1 - Math.exp(-dt / this.p.throttleTau))

    if (this.onGround) {
      const liftedOff = this.stepGround(pitchIn, rollIn, yawIn, rawInput.brake, dt)
      if (!liftedOff) {
        this.finishStep()
        return
      }
    }
    this.stepAir(pitchIn, rollIn, yawIn, dt)
    this.finishStep()
  }

  /** Bounds, NaN guard. */
  private finishStep(): void {
    const p = this.p
    if (this.crashed) return
    const sp = this.vel.length()
    if (sp > p.maxSpeed) this.vel.multiplyScalar(p.maxSpeed / sp)
    if (this.pos.y > p.maxAltitude) {
      this.pos.y = p.maxAltitude
      if (this.vel.y > 0) this.vel.y = 0
    }
    const ok =
      Number.isFinite(this.pos.x) && Number.isFinite(this.pos.y) && Number.isFinite(this.pos.z) &&
      Number.isFinite(this.vel.x) && Number.isFinite(this.vel.y) && Number.isFinite(this.vel.z) &&
      Number.isFinite(this.quat.x) && Number.isFinite(this.quat.y) && Number.isFinite(this.quat.z) && Number.isFinite(this.quat.w) &&
      Number.isFinite(this.omega.x) && Number.isFinite(this.omega.y) && Number.isFinite(this.omega.z) &&
      Number.isFinite(this.throttle)
    if (!ok || this.pos.y < -60) {
      if (!ok) console.warn('[PlayerPlane] non-finite state, respawning')
      this.respawn()
    }
  }

  // ── Air ────────────────────────────────────────────────────────────────────

  private stepAir(pitchIn: number, rollIn: number, yawIn: number, dt: number): void {
    const p = this.p
    const aero = computeAeroForces(this.vel, this.quat, this.throttle, p, this.aero)
    const V = aero.airspeed

    // Translational acceleration
    _acc.copy(aero.force).multiplyScalar(1 / p.mass)
    _acc.y -= p.gravity

    // Rate targets (body): roll right +, pitch up +, yaw right +
    // Control power and aerodynamic stability both scale with the airflow, so a
    // stick position maps to the same α at any speed (a full pull can stall).
    const eff = clamp((V - 6) / 28, 0.08, 1)
    const effW = Math.min(eff, clamp((V - 2) / 8, 0, 1))
    const bank = bankOf(this.quat)
    let rollT = rollIn * p.rollRate * eff
    // No full self-levelling: banks up to rollNeutralBank are held; steeper
    // ones (short of knife-edge) ease back toward it.
    const ab = Math.abs(bank)
    if (ab > p.rollNeutralBank && ab < Math.PI / 2) {
      rollT -= Math.sign(bank) * p.rollLevel * (Math.sin(ab) - Math.sin(p.rollNeutralBank)) * eff
    }
    // Flight-path hold: capture γ while the pilot flies, hold it hands-off,
    // with a PI speed protection that lowers (too slow) / raises (too fast)
    // the held path and gives it back once the speed has recovered.
    const vh2a = this.vel.x * this.vel.x + this.vel.z * this.vel.z
    const gamma = V > 0.5 ? Math.atan2(this.vel.y, Math.sqrt(vh2a)) : 0
    let gammaTarget = gamma
    if (Math.abs(pitchIn) > 0.05 || V < 8) {
      // While the pilot flies, the held path is where the nose points minus the
      // α that sustains the current path: on release the path settles there,
      // so a short tap changes it as much as it visibly moved the nose.
      const pitchAtt = Math.asin(clamp(_tmp.set(0, 0, 1).applyQuaternion(this.quat).y, -1, 1))
      const alphaNeed = holdTrimAlpha(V, gamma, gamma, bank, p)
      this.gammaHold = V < 8 || Math.abs(bank) > 60 * DEG ? gamma : clamp(pitchAtt - alphaNeed, p.holdMaxDive, p.holdMaxClimb)
      this.protLowI = 0
      this.protHighI = 0
    } else {
      // A stall cancels the held path: recover toward level flight (also
      // right after one, so a mushing descent is not held).
      if (this.stallDir !== 0 || (this.sinceStall < 3 && this.gammaHold < 0)) this.gammaHold = 0
      // Post-take-off: a short pull then hands-off still climbs away gently.
      else if (this.sinceLiftoff < p.takeoffAssistTime && this.gammaHold > -1 * DEG) this.gammaHold = Math.max(this.gammaHold, p.takeoffClimb)
      this.gammaHold = clamp(this.gammaHold, p.holdMaxDive, p.holdMaxClimb)
      const eLow = V - p.protectLowSpeed
      this.protLowI = clamp(this.protLowI + p.protectKi * eLow * dt, -1.2, 0)
      const eHigh = V - p.protectHighSpeed
      this.protHighI = clamp(this.protHighI + p.protectKi * eHigh * dt, 0, 1.2)
      let protLow = Math.min(0, p.protectKp * eLow + this.protLowI)
      // Near the ground the low-speed protection may flatten a climb but never
      // turn it into a descent (e.g. a short pull at take-off, then hands-off).
      const floor = Math.min(0, this.gammaHold) - clamp((this.altitudeAGL - 10) / 50, 0, 1) * 0.35
      if (this.gammaHold + protLow < floor) protLow = floor - this.gammaHold
      const prot = protLow + Math.max(0, p.protectKp * eHigh + this.protHighI)
      gammaTarget = clamp(this.gammaHold + prot, p.holdMaxDive, p.holdMaxClimb)
    }
    let trim = holdTrimAlpha(V, gamma, gammaTarget, bank, p)
    // Stick deflection is measured from the fixed trim: full back stick then
    // means the same α at every speed (just under the critical angle).
    trim += (p.alphaTrim - trim) * Math.abs(pitchIn) * p.stickTrimBlend
    if (this.stallDir !== 0) trim = Math.min(trim, p.stallTrimMax)
    let pitchT = pitchIn * p.pitchRate * eff + effW * pitchStability(aero.alpha, p, trim)

    // Stall (with hysteresis): past the critical angle the nose drops by itself
    // until α is back a few degrees under it.
    const aS = stallAlpha(p)
    const aN = (p.CLmin - p.CL0) / p.CLalpha
    const alpha = aero.alpha
    if (this.stallDir === 0) {
      if (V > 3 && alpha > aS && alpha < Math.PI / 2) this.stallDir = 1
      else if (V > 3 && alpha < aN && alpha > -Math.PI / 2) this.stallDir = -1
    } else if (
      V <= 3 ||
      (this.stallDir > 0 && (alpha < aS - p.stallExitMargin || alpha > Math.PI / 2)) ||
      (this.stallDir < 0 && (alpha > aN + p.stallExitMargin || alpha < -Math.PI / 2))
    ) {
      this.stallDir = 0
    }
    if (this.stallDir !== 0) pitchT -= this.stallDir * p.stallDrop * effW

    const yawT = yawIn * p.yawRate * eff + effW * p.kBeta * aero.beta
    pitchT = clamp(pitchT, -p.maxBodyRate, p.maxBodyRate)
    rollT = clamp(rollT, -p.maxBodyRate, p.maxBodyRate)
    const yawTc = clamp(yawT, -p.maxBodyRate, p.maxBodyRate)
    // body vector: x (left) = −pitch-up, y (up) = −yaw-right, z (nose) = roll-right
    _omegaT.set(-pitchT, -yawTc, rollT)

    // Automatic turn coordination: rotate with the velocity's heading rate
    // (about the world vertical) so the nose follows the turn without slip.
    const vh2 = this.vel.x * this.vel.x + this.vel.z * this.vel.z
    const vh = Math.sqrt(vh2)
    if (vh > 5) {
      const w = clamp((vh - 5) / 10, 0, 1)
      const psiDot = clamp((this.vel.z * _acc.x - this.vel.x * _acc.z) / vh2, -1.5, 1.5) * w
      _qInv.copy(this.quat).invert()
      _tmp.set(0, psiDot, 0).applyQuaternion(_qInv)
      _omegaT.add(_tmp)
    }

    // First-order response of the body rates
    const k = 1 - Math.exp(-dt / p.rateTau)
    this.omega.x += (_omegaT.x - this.omega.x) * k
    this.omega.y += (_omegaT.y - this.omega.y) * k
    this.omega.z += (_omegaT.z - this.omega.z) * k

    // Semi-implicit Euler
    this.vel.addScaledVector(_acc, dt)
    this.pos.addScaledVector(this.vel, dt)
    integrateBodyRates(this.quat, this.omega, dt)

    this.stall = this.stallDir !== 0
    this.sinceStall = this.stall ? 0 : this.sinceStall + dt
    this.sinceLiftoff += dt

    // Obstacles (sweeps from the previous pose)
    if (this.sweepObstacles(true)) return

    // Ground under the fuselage (AGL) — ray from the fuselage centre
    _tmp.set(0, FUSE_Y, 0).applyQuaternion(this.quat).add(this.pos)
    const fuseY = _tmp.y
    const gBelow = this.env.groundHeight(_tmp.x, fuseY, _tmp.z, Math.max(10, fuseY + 80))
    if (gBelow !== null && Number.isFinite(gBelow)) this.groundY = gBelow
    this.altitudeAGL = Math.max(0, this.pos.y - this.groundY)

    // Descended into a building (walls-only colliders)
    if (fuseY - this.groundY < 150 && this.env.isEnclosed(_tmp.x, fuseY, _tmp.z)) {
      this.crash(this.pos.x, fuseY, this.pos.z)
      return
    }

    // Wheels: touchdown?
    if (this.pos.y - this.groundY < 8) {
      const reach = 1.0 + Math.max(0, -this.vel.y * dt)
      let touch = false
      let maxPen = 0
      for (let i = 0; i < 3; i++) {
        wheelLocal(i, _tmp2)
        _tmp2.applyQuaternion(this.quat).add(this.pos)
        const gh = this.env.groundHeight(_tmp2.x, _tmp2.y + reach, _tmp2.z, reach + 0.6)
        if (gh === null || !Number.isFinite(gh)) continue
        const pen = gh - _tmp2.y
        if (pen >= 0) {
          touch = true
          if (pen > maxPen) maxPen = pen
        }
      }
      if (touch) {
        this.touchdown(maxPen)
        return
      }
    }

    // Fuselage into the ground (nose-dive, inverted, belly)
    if (fuseY < this.groundY + 0.4) {
      this.crash(_tmp.x, fuseY, _tmp.z)
    }
  }

  private touchdown(penetration: number): void {
    const p = this.p
    const hpb = headingPitchBank(this.quat)
    const sink = -this.vel.y
    const ok =
      sink < p.landingMaxSink &&
      Math.abs(hpb.bank) < p.landingMaxBank &&
      hpb.pitch > p.landingMinPitch &&
      hpb.pitch < p.landingMaxPitch
    if (!ok) {
      this.pos.y += penetration
      this.crash(this.pos.x, this.pos.y + 0.3, this.pos.z)
      return
    }
    // Landing: switch to the ground model, keeping the attitude continuous.
    this.onGround = true
    this.lastTouchdownSink = Math.max(0, sink)
    this.gHeading = hpb.heading
    this.gGroundPitch = 0
    this.gPitchRot = hpb.pitch
    this.gBank = hpb.bank
    this.gPitchRate = clamp(-this.omega.x, -0.5, 0.5)
    this.gYawRate = 0
    this.gSteer = 0
    _fG.set(Math.sin(this.gHeading), 0, Math.cos(this.gHeading))
    _rH.set(-Math.cos(this.gHeading), 0, Math.sin(this.gHeading))
    this.gSpeed = this.vel.dot(_fG)
    this.gLat = this.vel.dot(_rH)
    this.gSettle = 0.6 // let the nose wheel come down: no hands-off skip back into the air
    this.vel.y = 0
    this.omega.set(0, 0, 0)
    this.stall = false
    this.stallDir = 0
    this.placeOnGround(true)
  }

  // ── Ground ─────────────────────────────────────────────────────────────────

  /** Returns true when the plane leaves the ground this step (then the air step runs). */
  private stepGround(pitchIn: number, rollIn: number, yawIn: number, brake: boolean, dt: number): boolean {
    const p = this.p
    const W = p.mass * p.gravity

    const pitchNow = this.gGroundPitch + this.gPitchRot
    quatFromHeadingPitchBank(this.quat, this.gHeading, pitchNow, this.gBank)
    const aero = computeAeroForces(this.vel, this.quat, this.throttle, p, this.aero)
    const V = aero.airspeed
    _gravity.set(0, -W, 0)
    _tmp.copy(aero.force).add(_gravity) // net non-ground force
    const Fy = _tmp.y

    // Lift-off: the wing carries the weight
    if (this.gSettle > 0) this.gSettle -= dt
    if (Fy > 0 && V > 8 && (this.gSettle <= 0 || pitchIn > 0.05)) {
      this.onGround = false
      // Body rates continuous with the ground motion
      this.omega.set(-this.gPitchRate, this.gYawRate, 0)
      this.gammaHold = Math.max(Math.atan2(this.vel.y, Math.hypot(this.vel.x, this.vel.z)), p.takeoffClimb)
      this.sinceLiftoff = 0
      this.stall = false
      this.stallDir = 0
      return true
    }
    const N = Math.max(0, -Fy) // normal force

    const cg = Math.cos(this.gGroundPitch)
    _fG.set(Math.sin(this.gHeading) * cg, Math.sin(this.gGroundPitch), Math.cos(this.gHeading) * cg)
    _rH.set(-Math.cos(this.gHeading), 0, Math.sin(this.gHeading))

    // Longitudinal
    let u = this.gSpeed + (_tmp.dot(_fG) / p.mass) * dt
    const dec = (p.rollFriction + (brake ? p.brakeDecel : 0)) * (N / p.mass) * dt
    if (Math.abs(u) <= dec) u = 0
    else u -= Math.sign(u) * dec
    this.gSpeed = u

    // Lateral: tyres kill the side slip (skid limited)
    const lat = this.gLat
    const latDec = Math.min(Math.abs(lat) * 10, p.lateralGrip * p.gravity * Math.max(N / W, 0.35)) * dt
    this.gLat = Math.abs(lat) <= latDec ? 0 : lat - Math.sign(lat) * latDec

    // Nose-wheel steering (+ rudder), car-like, with a lateral-acceleration cap
    const steerCmd = clamp(rollIn + yawIn, -1, 1)
    const au = Math.abs(u)
    const maxSteer = p.maxSteer / (1 + (au / 10) * (au / 10))
    this.gSteer += (steerCmd * maxSteer - this.gSteer) * (1 - Math.exp(-dt / 0.12))
    let yawRate = (-u * Math.tan(this.gSteer)) / p.wheelBase // right steer → heading decreases
    if (au > 1) {
      const cap = (p.steerLatAccel * p.gravity) / au
      yawRate = clamp(yawRate, -cap, cap)
    }
    if (au < 2) yawRate += -steerCmd * p.pivotRate * (1 - au / 2) // turn in place
    this.gYawRate += (yawRate - this.gYawRate) * (1 - Math.exp(-dt / 0.1))
    this.gHeading = wrapAngle(this.gHeading + this.gYawRate * dt)

    // Rotation: nose up only above Vr with back pressure; the nose weight brings it down.
    const eff = clamp((V - 6) / 28, 0.08, 1)
    const effW = Math.min(eff, clamp((V - 2) / 8, 0, 1))
    const noseWeight = 0.25 + 0.5 * (1 - clamp(V / p.Vr, 0, 1))
    let pitchT = pitchIn * p.pitchRate * eff + effW * pitchStability(aero.alpha, p) - noseWeight
    const canRotate = V >= p.Vr && pitchIn > 0.05
    if (!canRotate && pitchT > 0) pitchT = 0
    this.gPitchRate += (pitchT - this.gPitchRate) * (1 - Math.exp(-dt / p.rateTau))
    this.gPitchRot += this.gPitchRate * dt
    if (this.gPitchRot > p.tailStrikePitch) {
      this.gPitchRot = p.tailStrikePitch
      if (this.gPitchRate > 0) this.gPitchRate = 0
    }
    if (this.gPitchRot < 0) {
      // nose wheel on the ground (a nose-low touchdown settles in ~0.1 s)
      this.gPitchRot += (0 - this.gPitchRot) * (1 - Math.exp(-dt / 0.08))
      if (this.gPitchRot > -1e-4) this.gPitchRot = 0
      if (this.gPitchRate < 0) this.gPitchRate = 0
    }

    // Residual touchdown bank settles
    this.gBank *= Math.exp(-dt / 0.12)
    if (Math.abs(this.gBank) < 1e-4) this.gBank = 0

    // Horizontal move
    this.vel.set(_fG.x * u + _rH.x * this.gLat, _fG.y * u, _fG.z * u + _rH.z * this.gLat)
    const prevY = this.pos.y
    this.pos.x += this.vel.x * dt
    this.pos.z += this.vel.z * dt

    const stillOnGround = this.placeOnGround(false, prevY)
    this.stall = false
    this.stallDir = 0
    this.omega.set(-this.gPitchRate, this.gYawRate, 0)

    if (this.crashed) return false
    if (this.sweepObstacles(false)) return false
    if (!stillOnGround) {
      // Rolled off an edge (bridge end / roof): continue as a flying body.
      this.onGround = false
      return false
    }
    return false
  }

  /**
   * Ground contact from three wheel rays: height + slope attitude, then the
   * orientation / reference height. Returns false when the ground fell away.
   */
  private placeOnGround(fromAir: boolean, prevY = this.pos.y): boolean {
    const p = this.p
    const h = this.gHeading
    const sh = Math.sin(h)
    const ch = Math.cos(h)
    const up = fromAir ? 1.0 : 0.6
    const reach = fromAir ? 2.0 : 1.2
    let hMain: number | null = null
    for (let side = -1; side <= 1; side += 2) {
      // left wing = +X body = (cos h, 0, −sin h) world
      const wx = this.pos.x + side * MAIN_X * ch
      const wz = this.pos.z - side * MAIN_X * sh
      const gh = this.env.groundHeight(wx, this.pos.y + up, wz, up + reach)
      if (gh !== null && Number.isFinite(gh) && (hMain === null || gh > hMain)) hMain = gh
    }
    if (hMain === null) {
      if (!fromAir) return false
      hMain = this.pos.y
    }
    if (!fromAir && hMain < prevY - 0.35) return false // ground dropped away
    const nx = this.pos.x + sh * NOSE_Z
    const nz = this.pos.z + ch * NOSE_Z
    const gn = this.env.groundHeight(nx, hMain + up + NOSE_Z * 0.15, nz, up + reach + NOSE_Z * 0.3)
    const hNose = gn !== null && Number.isFinite(gn) ? gn : hMain
    // Dead zone: a wheel on the road (y ≈ 0.028) and another on the ground slab
    // (y = 0) must not tilt the plane; only real slopes (ramps, decks) do.
    const dh = hNose - hMain
    const dhz = Math.abs(dh) < 0.06 ? 0 : dh - Math.sign(dh) * 0.06
    const gp = clamp(Math.atan2(dhz, NOSE_Z), -0.3, 0.3)
    if (fromAir) {
      // keep the absolute pitch continuous: rotation = pitch − ground attitude
      this.gPitchRot = this.gPitchRot - gp
      this.gGroundPitch = gp
      if (this.gPitchRot > p.tailStrikePitch) this.gPitchRot = p.tailStrikePitch
    } else {
      this.gGroundPitch += (gp - this.gGroundPitch) * 0.5
    }
    const pitch = this.gGroundPitch + this.gPitchRot
    let y = hMain + MAIN_X * Math.abs(Math.sin(this.gBank))
    if (pitch < this.gGroundPitch) y += NOSE_Z * (Math.sin(this.gGroundPitch) - Math.sin(pitch))
    this.pos.y = y
    this.groundY = hMain
    this.altitudeAGL = Math.max(0, y - hMain)
    quatFromHeadingPitchBank(this.quat, h, pitch, this.gBank)
    return true
  }

  // ── Obstacles & crash ──────────────────────────────────────────────────────

  /** Sweep the fuselage / nose (and wingtips in the air) spheres from the previous pose. */
  private sweepObstacles(air: boolean): boolean {
    const n = air ? 4 : 2
    let best = 2
    for (let i = 0; i < n; i++) {
      let r: number
      if (i === 0) { _w0.set(0, FUSE_Y, 0); r = FUSE_R }
      else if (i === 1) { _w0.set(NOSE_SPHERE[0], NOSE_SPHERE[1], NOSE_SPHERE[2]); r = NOSE_R }
      else { _w0.set(i === 2 ? TIP_X : -TIP_X, TIP_Y, TIP_Z); r = TIP_R }
      _w1.copy(_w0)
      _sA.copy(_w0).applyQuaternion(this.prevQuat).add(this.prevPos)
      _sB.copy(_w1).applyQuaternion(this.quat).add(this.pos)
      const t = this.env.sweepSphere(_sA.x, _sA.y, _sA.z, _sB.x, _sB.y, _sB.z, r, i >= 2)
      if (t >= 0 && t < best) best = t
    }
    if (best > 1) return false

    const speed = this.vel.length()
    if (!air && speed < 5) {
      // Taxi bump: stop and bounce back a little instead of a crash (the
      // heading is restored too, so steering away from the obstacle works).
      this.pos.copy(this.prevPos)
      this.quat.copy(this.prevQuat)
      this.gHeading = headingPitchBank(this.prevQuat).heading
      this.gYawRate = 0
      this.gSpeed = -0.3 * this.gSpeed
      this.gLat = 0
      this.vel.multiplyScalar(-0.3)
      return true
    }
    // Crash at the contact pose
    const t = Math.max(0, best - 0.02)
    this.pos.lerpVectors(this.prevPos, this.pos, t)
    this.quat.slerpQuaternions(this.prevQuat, this.quat, t)
    _tmp.set(0, FUSE_Y, 0).applyQuaternion(this.quat).add(this.pos)
    this.crash(_tmp.x, _tmp.y, _tmp.z)
    return true
  }

  private crash(px: number, py: number, pz: number): void {
    if (this.crashed) return
    const speed = this.vel.length()
    const dir = speed > 0.1 ? { x: this.vel.x / speed, y: this.vel.y / speed, z: this.vel.z / speed } : { x: 0, y: -1, z: 0 }
    this.crashed = true
    this.crashTimer = this.p.crashFreeze
    this.crashCount++
    this.stall = false
    this.stallDir = 0
    // Visibly stopped at the impact point, slightly tilted (nose down, a wing low)
    _qTilt.setFromEuler(_euler.set(0.14, 0, this.omega.z >= 0 ? 0.2 : -0.2, 'YXZ'))
    _qA.copy(this.quat).multiply(_qTilt)
    this.quat.copy(_qA)
    this.vel.set(0, 0, 0)
    this.omega.set(0, 0, 0)
    this.throttle = 0
    this.lever = 0
    this.prevPos.copy(this.pos)
    this.prevQuat.copy(this.quat)
    this.pendingCrash = { intensity: clamp(speed / 40, 0.35, 1), point: { x: px, y: py, z: pz }, direction: dir }
  }
}

/** Wheel contact points in the body frame: 0 = left main, 1 = right main, 2 = nose. */
function wheelLocal(i: number, out: THREE.Vector3): THREE.Vector3 {
  if (i === 0) return out.set(MAIN_X, 0, 0)
  if (i === 1) return out.set(-MAIN_X, 0, 0)
  return out.set(0, 0, NOSE_Z)
}

/** q ← q ⊗ exp(ω·dt/2) with ω in body axes. */
function integrateBodyRates(q: THREE.Quaternion, omega: THREE.Vector3, dt: number): void {
  const w = omega.length()
  if (w > 1e-9) {
    _axis.copy(omega).multiplyScalar(1 / w)
    _dq.setFromAxisAngle(_axis, w * dt)
    q.multiply(_dq)
  }
  q.normalize()
}

// ─── Rapier-backed environment ───────────────────────────────────────────────

/** Collision-group membership bit of the ground slab (GameEngine._createGroundPlane). */
const GROUP_GROUND = 0x0002

export class RapierFlightEnvironment implements FlightEnvironment {
  private world: RAPIER.World
  private ray: RAPIER.Ray
  private balls = new Map<number, RAPIER.Ball>()
  private readonly identity = { x: 0, y: 0, z: 0, w: 1 }
  private readonly sPos = { x: 0, y: 0, z: 0 }
  private readonly sVel = { x: 0, y: 0, z: 0 }
  // NB: with rapier3d-compat 0.12 the ONLY_FIXED / EXCLUDE_KINEMATIC|DYNAMIC
  // flags also drop fixed colliders (measured in the game): the body type is
  // filtered in the predicates instead.
  private readonly flags = RAPIER.QueryFilterFlags.EXCLUDE_SENSORS

  constructor(world: RAPIER.World) {
    this.world = world
    this.ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 })
  }

  /** Static world geometry only (the parked car, remote players and NPCs are ignored). */
  private static isStatic(c: RAPIER.Collider): boolean {
    const b = c.parent()
    return b === null || b.isFixed()
  }

  /** The ground slab is the only collider whose membership is exactly GROUND (others use the default all-bits groups). */
  private static isGroundSlab(c: RAPIER.Collider): boolean {
    return c.collisionGroups() >>> 16 === GROUP_GROUND
  }

  /** Rollable ground = triangle meshes (roads, decks) + the ground slab. Trees, bollards, barriers are obstacles. */
  private readonly groundPredicate = (c: RAPIER.Collider): boolean => {
    if (!RapierFlightEnvironment.isStatic(c)) return false
    const t = c.shapeType()
    if (t === RAPIER.ShapeType.TriMesh || t === RAPIER.ShapeType.HeightField) return true
    return RapierFlightEnvironment.isGroundSlab(c)
  }

  /** Obstacles: every static collider but the ground slab. */
  private readonly obstaclePredicate = (c: RAPIER.Collider): boolean => {
    return RapierFlightEnvironment.isStatic(c) && !RapierFlightEnvironment.isGroundSlab(c)
  }

  /** Obstacles for the wingtips: no thin posts (tree trunks and bollards are cylinders). */
  private readonly wingPredicate = (c: RAPIER.Collider): boolean =>
    this.obstaclePredicate(c) && c.shapeType() !== RAPIER.ShapeType.Cylinder

  /** Walls: static triangle meshes (buildings, bridge geometry) — not trees / bollards. */
  private readonly wallPredicate = (c: RAPIER.Collider): boolean =>
    RapierFlightEnvironment.isStatic(c) && c.shapeType() === RAPIER.ShapeType.TriMesh

  groundHeight(x: number, fromY: number, z: number, maxDist: number): number | null {
    const r = this.ray
    r.origin.x = x
    r.origin.y = fromY
    r.origin.z = z
    r.dir.x = 0
    r.dir.y = -1
    r.dir.z = 0
    const hit = this.world.castRay(r, maxDist, true, this.flags, undefined, undefined, undefined, this.groundPredicate)
    return hit ? fromY - hit.toi : null
  }

  private ball(radius: number): RAPIER.Ball {
    let b = this.balls.get(radius)
    if (!b) {
      b = new RAPIER.Ball(radius)
      this.balls.set(radius, b)
    }
    return b
  }

  sweepSphere(ax: number, ay: number, az: number, bx: number, by: number, bz: number, radius: number, ignorePosts = false): number {
    this.sPos.x = ax
    this.sPos.y = ay
    this.sPos.z = az
    this.sVel.x = bx - ax
    this.sVel.y = by - ay
    this.sVel.z = bz - az
    const pred = ignorePosts ? this.wingPredicate : this.obstaclePredicate
    const hit = this.world.castShape(this.sPos, this.identity, this.sVel, this.ball(radius), 1, false, this.flags, undefined, undefined, undefined, pred)
    return hit ? clamp(hit.toi, 0, 1) : -1
  }

  sweepWalls(ax: number, ay: number, az: number, bx: number, by: number, bz: number, radius: number): number {
    this.sPos.x = ax
    this.sPos.y = ay
    this.sPos.z = az
    this.sVel.x = bx - ax
    this.sVel.y = by - ay
    this.sVel.z = bz - az
    const hit = this.world.castShape(this.sPos, this.identity, this.sVel, this.ball(radius), 1, false, this.flags, undefined, undefined, undefined, this.wallPredicate)
    return hit ? clamp(hit.toi, 0, 1) : -1
  }

  isEnclosed(x: number, y: number, z: number): boolean {
    // Building colliders are wall rings without a roof: a point inside one sees
    // the same collider in the four horizontal directions.
    const r = this.ray
    r.origin.x = x
    r.origin.y = y
    r.origin.z = z
    let first: number | null = null
    for (let i = 0; i < 4; i++) {
      r.dir.x = i === 0 ? 1 : i === 1 ? -1 : 0
      r.dir.y = 0
      r.dir.z = i === 2 ? 1 : i === 3 ? -1 : 0
      const hit = this.world.castRay(r, 120, false, this.flags, undefined, undefined, undefined, this.obstaclePredicate)
      if (!hit) return false
      const c = hit.collider
      if (c.shapeType() !== RAPIER.ShapeType.TriMesh) return false
      if (first === null) first = c.handle
      else if (c.handle !== first) return false
    }
    return true
  }
}

// ─── PlayerPlane (scene object + contract API) ──────────────────────────────

const PROP_IDLE_RPM = 900
const PROP_MAX_RPM = 2600
const PROP_DISC_ANGLE = 0.6 // rad per frame above which blades are drawn as a disc

function createPropDiscTexture(): THREE.Texture | null {
  if (typeof document === 'undefined') return null
  const c = document.createElement('canvas')
  c.width = 128
  c.height = 128
  const ctx = c.getContext('2d')
  if (!ctx) return null
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
  g.addColorStop(0.0, 'rgba(40,46,48,0)')
  g.addColorStop(0.22, 'rgba(40,46,48,0.05)')
  g.addColorStop(0.55, 'rgba(38,52,56,0.30)')
  g.addColorStop(0.8, 'rgba(34,58,62,0.42)')
  g.addColorStop(0.86, 'rgba(183,146,92,0.55)') // brass tips
  g.addColorStop(0.96, 'rgba(183,146,92,0.25)')
  g.addColorStop(1.0, 'rgba(183,146,92,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 128, 128)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

export class PlayerPlane {
  private scene: THREE.Scene
  private sim: FlightSim
  private env: RapierFlightEnvironment

  private root = new THREE.Group()
  private visual = new THREE.Group()
  private model: TwoSeatAirplane
  private blades: THREE.Object3D[] = []
  private disc: THREE.Mesh
  private discMat: THREE.MeshBasicMaterial
  private discTex: THREE.Texture | null

  private isActive = false
  private rpm = 0
  private visualTime = 0
  private stallVisual = 0
  private squash = 0
  private seenSpawn = -1

  onCrash?: PlaneCrashCallback

  constructor(world: RAPIER.World, scene: THREE.Scene) {
    this.scene = scene
    this.env = new RapierFlightEnvironment(world)
    this.sim = new FlightSim(this.env)

    // Mesh: root (interpolated pose) → visual (buffet / squash) → holder (model turned
    // so its nose (−Z) points +Z, main wheels at the reference point) → model.
    this.model = createTwoSeatAirplane()
    const holder = new THREE.Group()
    holder.rotation.y = Math.PI
    holder.position.z = AIRPLANE_MAIN_WHEEL_Z
    holder.add(this.model.group)
    this.visual.add(holder)
    this.root.add(this.visual)
    this.root.name = 'PlayerPlane'
    this.blades = [...this.model.propeller.children]

    this.discTex = createPropDiscTexture()
    this.discMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
      ...(this.discTex ? { map: this.discTex } : { color: 0x2c3436 }),
    })
    this.disc = new THREE.Mesh(new THREE.CircleGeometry(AIRPLANE_PROPELLER_RADIUS + 0.02, 48), this.discMat)
    this.disc.name = 'Disque d’hélice'
    const [px, py, pz] = AIRPLANE_PROPELLER_POSITION
    this.disc.position.set(px, py, pz - 0.01)
    this.disc.visible = false
    this.disc.renderOrder = 3
    this.model.group.add(this.disc)

    this.root.visible = false
    scene.add(this.root)
  }

  get active(): boolean {
    return this.isActive
  }

  /** Direct access to the flight simulation (tests, HUD extras). */
  get simulation(): FlightSim {
    return this.sim
  }

  spawn(ground: WorldPosition, headingRad: number, opts: PlaneSpawnOptions = {}): void {
    this.sim.spawn(ground, headingRad, opts)
    this.isActive = true
    this.root.visible = true
    this.rpm = opts.airborne ? PROP_IDLE_RPM + (PROP_MAX_RPM - PROP_IDLE_RPM) * this.sim.throttle : 0
    this.stallVisual = 0
    this.squash = 0
    this.seenSpawn = this.sim.spawnCount
    this.syncMesh(1, 0)
  }

  despawn(): void {
    this.isActive = false
    this.root.visible = false
  }

  step(input: FlightInput, dt: number): void {
    if (!this.isActive) return
    this.sim.step(input, dt)
    const ev = this.sim.pendingCrash
    if (ev) {
      this.sim.pendingCrash = null
      this.onCrash?.(ev.intensity, ev.point, ev.direction)
    }
    if (this.sim.lastTouchdownSink > 0) {
      this.squash = Math.max(this.squash, clamp(this.sim.lastTouchdownSink / 4, 0.15, 1))
      this.sim.lastTouchdownSink = 0
    }
  }

  syncMesh(alpha: number, frameDt: number): void {
    const s = this.sim
    const a = clamp(finiteOr(alpha, 1), 0, 1)
    const dt = clamp(finiteOr(frameDt, 0), 0, 0.25)
    if (s.spawnCount !== this.seenSpawn) {
      // Respawned inside the sim (after a crash): no interpolation smear, restart the engine.
      this.seenSpawn = s.spawnCount
      this.rpm = s.onGround ? 0 : PROP_IDLE_RPM
    }
    this.root.position.lerpVectors(s.prevPos, s.pos, a)
    this.root.quaternion.slerpQuaternions(s.prevQuat, s.quat, a)

    // Propeller: smoothed visual rpm, disc above the strobe threshold
    const target = s.crashed ? 0 : PROP_IDLE_RPM + (PROP_MAX_RPM - PROP_IDLE_RPM) * s.throttle
    const tau = s.crashed ? 0.25 : target > this.rpm ? 0.9 : 0.6
    this.rpm += (target - this.rpm) * (1 - Math.exp(-dt / tau))
    if (this.rpm < 1) this.rpm = 0
    const perFrame = (this.rpm * Math.PI * 2 * Math.max(dt, 1 / 144)) / 60
    this.model.update(dt, this.rpm)
    const discOn = perFrame > PROP_DISC_ANGLE
    for (const b of this.blades) b.visible = !discOn
    this.disc.visible = discOn
    this.discMat.opacity = discOn ? 0.55 + 0.45 * clamp((this.rpm - PROP_IDLE_RPM) / (PROP_MAX_RPM - PROP_IDLE_RPM), 0, 1) : 0

    // Stall buffet + touchdown squash (visual only, deterministic)
    this.visualTime += dt
    const stallTarget = s.stall ? Math.max(0.35, s.aero.stallDepth) : 0
    this.stallVisual += (stallTarget - this.stallVisual) * (1 - Math.exp(-dt / 0.15))
    const t = this.visualTime
    const b = this.stallVisual
    this.visual.rotation.set(
      b * (0.012 * Math.sin(t * 71) + 0.008 * Math.sin(t * 113)),
      0,
      b * (0.018 * Math.sin(t * 83) + 0.01 * Math.sin(t * 131)),
    )
    this.squash *= Math.exp(-dt / 0.14)
    this.visual.position.y = -0.07 * this.squash // gear compression after a touchdown
  }

  getPosition(): WorldPosition {
    return { x: this.sim.pos.x, y: this.sim.pos.y, z: this.sim.pos.z }
  }

  getRenderPosition(): THREE.Vector3 {
    return this.root.position.clone()
  }

  getVelocity(): { x: number; y: number; z: number } {
    return { x: this.sim.vel.x, y: this.sim.vel.y, z: this.sim.vel.z }
  }

  /** Allocation-free velocity read. */
  readVelocity(out: THREE.Vector3): THREE.Vector3 {
    return out.copy(this.sim.vel)
  }

  getQuaternion(): THREE.Quaternion {
    return this.sim.quat.clone()
  }

  getForwardVector(): THREE.Vector3 {
    return new THREE.Vector3(0, 0, 1).applyQuaternion(this.sim.quat)
  }

  getYaw(): number {
    return headingPitchBank(this.sim.quat).heading
  }

  getAltitudeAGL(): number {
    return this.sim.altitudeAGL
  }

  /** Ground height under the plane (last known). */
  getGroundY(): number {
    return this.sim.groundY
  }

  isOnGround(): boolean {
    return this.sim.onGround
  }

  isCrashed(): boolean {
    return this.sim.crashed
  }

  /** Bank angle (rad, + = right wing down) of the physics orientation. */
  getBank(): number {
    return bankOf(this.sim.quat)
  }

  getState(): PlaneState {
    const s = this.sim
    const hpb = headingPitchBank(s.quat)
    const v = s.vel
    return {
      airspeed: v.length(),
      groundSpeed: Math.sqrt(v.x * v.x + v.z * v.z),
      altitudeAGL: s.altitudeAGL,
      altitudeMSL: s.pos.y,
      verticalSpeed: v.y,
      throttle: s.throttle,
      onGround: s.onGround,
      stall: s.stall,
      crashed: s.crashed,
      heading: hpb.heading,
      pitchDeg: hpb.pitch / DEG,
      bankDeg: hpb.bank / DEG,
    }
  }

  getMesh(): THREE.Group {
    return this.root
  }

  /**
   * Camera arm: free fraction [0, 1] of the segment a → b for a sphere of
   * `radius` against building walls (1 = clear).
   */
  probeCameraArm(ax: number, ay: number, az: number, bx: number, by: number, bz: number, radius: number): number {
    if (!this.env.sweepWalls) return 1
    const t = this.env.sweepWalls(ax, ay, az, bx, by, bz, radius)
    return t < 0 ? 1 : t
  }

  dispose(): void {
    this.isActive = false
    this.scene.remove(this.root)
    this.model.dispose() // also disposes the disc geometry + material (child of the model group)
    this.discTex?.dispose()
  }
}
