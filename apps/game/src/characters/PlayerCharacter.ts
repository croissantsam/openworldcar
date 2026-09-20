/**
 * PlayerCharacter — the player on foot.
 *
 * Like PlayerPlane, this does not hand the body to the Rapier solver: it
 * integrates its own state and only *queries* the world, reusing
 * RapierFlightEnvironment so the collision-group and 0.12 filter-flag
 * knowledge lives in one place. A solver body would need the pedestrian to be
 * in the ground slab's narrow filter mask and would fight the kerbs.
 *
 * The state position is the FEET, on the ground, matching the character rig
 * (its feet sit at y = 0). Walk and Run are in-place clips, so the controller
 * owns translation and rescales the clip so the feet do not slide.
 */

import * as THREE from 'three'
import type RAPIER from '@dimforge/rapier3d-compat'
import type { WorldPosition } from '@world-drive/math'
import { RapierFlightEnvironment } from '../vehicles/PlayerPlane.js'
import { createActionCharacter, type ActionCharacter, type CharacterType } from './ActionCharacter.js'

export type CharacterInput = {
  /** -1 (back) to 1 (forward), in the character's own frame. */
  forward: number
  /** -1 (left) to 1 (right), strafing. */
  right: number
  /** Turn rate, -1 (left) to 1 (right). */
  turn: number
  /** Hold to run. */
  run: boolean
}

export type CharacterState = {
  /** Horizontal speed, m/s. */
  speed: number
  grounded: boolean
  running: boolean
  /** Height of the feet above the ground below, m (0 when standing). */
  airborne: number
}

// ─── Gait ────────────────────────────────────────────────────────────────────

/** Comfortable walking pace, m/s. */
const WALK_SPEED = 1.7
/** Flat-out run, m/s. */
const RUN_SPEED = 5.6
/** Sideways is slower than forward, as it should be. */
const STRAFE_FACTOR = 0.72
/** Backwards is slower still. */
const BACK_FACTOR = 0.55
/** How fast the horizontal velocity reaches the commanded one, 1/s. */
const ACCEL = 12
/** Deceleration when nothing is commanded, 1/s. */
const BRAKE = 16
/** Turn rate from the keys, rad/s. */
const TURN_RATE = 3.0
/** How fast the body yaws toward the direction it is actually moving, 1/s. */
const FACE_RATE = 10

/** Speed the Walk clip was authored for; the mixer is rescaled around it. */
const WALK_CLIP_SPEED = 1.45
/** Speed the Run clip was authored for. */
const RUN_CLIP_SPEED = 4.5
/** Below this the character is standing still. */
const IDLE_SPEED = 0.12
/** Above this fraction of RUN_SPEED the Run clip takes over from Walk. */
const RUN_BLEND_SPEED = 3.2

// ─── Body ────────────────────────────────────────────────────────────────────

/** Radius of the capsule used for wall sweeps, m. */
const BODY_RADIUS = 0.3
/** Height at which the wall sweep is done (chest), m above the feet. */
const CHEST_Y = 1.0
/** A step this tall is climbed without leaving the ground: kerbs, low steps. */
const STEP_UP = 0.42
/** Below this drop the feet stay glued to the ground instead of falling. */
const STEP_DOWN = 0.55
/** Gravity while airborne, m/s². */
const GRAVITY = 18
/** Terminal fall speed, m/s. */
const MAX_FALL = 45
/** Landing faster than this kills: about a four-storey drop. */
const FATAL_FALL_SPEED = 17
/** How far up the ground ray starts, m. */
const PROBE_UP = 1.2
/** How far down the ground ray looks, m. */
const PROBE_DOWN = 6

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v)

export class PlayerCharacter {
  private scene: THREE.Scene
  private env: RapierFlightEnvironment
  private character: ActionCharacter | null = null
  private _type: CharacterType

  /** Feet position, authoritative between physics steps. */
  private pos = new THREE.Vector3()
  private vel = new THREE.Vector3()
  private yaw = 0
  private grounded = true
  private airborne = 0
  private running = false

  /** Previous physics state, for render interpolation. */
  private prevPos = new THREE.Vector3()
  private prevYaw = 0

  private spawned = false
  private disposed = false

  /** Fired once when the character lands hard enough to die. */
  onFatalFall?: (() => void) | undefined

  // Scratch, so stepping allocates nothing
  private readonly want = new THREE.Vector3()
  private readonly next = new THREE.Vector3()
  private readonly renderPos = new THREE.Vector3()

  constructor(world: RAPIER.World, scene: THREE.Scene, type: CharacterType = 'woman') {
    this.scene = scene
    this.env = new RapierFlightEnvironment(world)
    this._type = type
  }

  get type(): CharacterType {
    return this._type
  }

  /** Swap the model without losing where the player is standing. */
  setType(type: CharacterType): void {
    if (type === this._type && this.character) return
    this._type = type
    if (!this.spawned) return
    this._destroyModel()
    this._buildModel()
    this.syncMesh(1, 0)
  }

  private _buildModel(): void {
    if (this.character || this.disposed) return
    const c = createActionCharacter({ type: this._type, name: this._type === 'woman' ? 'Nova' : 'Atlas' })
    c.group.visible = true
    this.scene.add(c.group)
    this.character = c
  }

  private _destroyModel(): void {
    const c = this.character
    if (!c) return
    this.character = null
    c.group.removeFromParent()
    c.dispose()
  }

  /** Put the character on the ground at `ground`, facing `heading`. */
  spawn(ground: WorldPosition, heading: number): void {
    if (this.disposed) return
    this._buildModel()
    const y = this.env.groundHeight(ground.x, ground.y + PROBE_UP + 1, ground.z, PROBE_DOWN + 2)
    this.pos.set(ground.x, y ?? Math.max(0, ground.y), ground.z)
    this.prevPos.copy(this.pos)
    this.vel.set(0, 0, 0)
    this.yaw = Number.isFinite(heading) ? heading : 0
    this.prevYaw = this.yaw
    this.grounded = true
    this.airborne = 0
    this.running = false
    this.spawned = true
    this.character?.play('Idle', 0)
    this.syncMesh(1, 0)
  }

  /** Take the character out of the scene; the state is kept for the next spawn. */
  despawn(): void {
    this.spawned = false
    this._destroyModel()
  }

  get isSpawned(): boolean {
    return this.spawned
  }

  getPosition(): WorldPosition {
    return { x: this.pos.x, y: this.pos.y, z: this.pos.z }
  }

  getVelocity(): WorldPosition {
    return { x: this.vel.x, y: this.vel.y, z: this.vel.z }
  }

  getYaw(): number {
    return this.yaw
  }

  getState(): CharacterState {
    return {
      speed: Math.hypot(this.vel.x, this.vel.z),
      grounded: this.grounded,
      running: this.running,
      airborne: this.airborne,
    }
  }

  /** Feet position plus eye height, for the camera to look at. */
  getHeadPosition(out: THREE.Vector3): THREE.Vector3 {
    return out.set(this.renderPos.x, this.renderPos.y + 1.5, this.renderPos.z)
  }

  getObject(): THREE.Object3D | null {
    return this.character?.group ?? null
  }

  /**
   * Free fraction of the segment a → b for a sphere of `radius`, so the chase
   * camera can pull in. -1 when nothing blocks.
   *
   * Uses the obstacle sweep, not sweepWalls: buildings in this world are convex
   * polyhedra, and sweepWalls only accepts triangle meshes, of which the world
   * currently holds none — it would never report anything.
   */
  sweepCameraArm(a: THREE.Vector3, b: THREE.Vector3, radius: number): number {
    return this.env.sweepSphere(a.x, a.y, a.z, b.x, b.y, b.z, radius, true)
  }

  /** One fixed physics step. */
  step(input: CharacterInput, dt: number): void {
    if (!this.spawned || this.disposed || !(dt > 0)) return

    this.prevPos.copy(this.pos)
    this.prevYaw = this.yaw
    const wasGrounded = this.grounded
    const fallSpeed = this.grounded ? 0 : -this.vel.y

    // ── Facing ───────────────────────────────────────────────────────────
    const turn = clamp(input.turn, -1, 1)
    if (turn !== 0) this.yaw += -turn * TURN_RATE * dt

    // ── Commanded velocity, in the character's frame ─────────────────────
    const fwd = clamp(input.forward, -1, 1)
    const side = clamp(input.right, -1, 1)
    const wantsRun = input.run && fwd > 0.1
    const base = wantsRun ? RUN_SPEED : WALK_SPEED
    const along = fwd >= 0 ? fwd * base : fwd * base * BACK_FACTOR
    const across = side * base * STRAFE_FACTOR

    const sy = Math.sin(this.yaw)
    const cy = Math.cos(this.yaw)
    // Forward is +Z in the character frame, matching the rig.
    this.want.set(along * sy + across * cy, 0, along * cy - across * sy)

    const commanded = this.want.lengthSq() > 1e-6
    const rate = commanded ? ACCEL : BRAKE
    const k = 1 - Math.exp(-rate * dt)
    this.vel.x += (this.want.x - this.vel.x) * k
    this.vel.z += (this.want.z - this.vel.z) * k
    if (!commanded && Math.hypot(this.vel.x, this.vel.z) < 0.02) {
      this.vel.x = 0
      this.vel.z = 0
    }
    this.running = wantsRun && Math.hypot(this.vel.x, this.vel.z) > RUN_BLEND_SPEED * 0.5

    // Face the direction actually travelled, so strafing reads correctly.
    const planarSpeed = Math.hypot(this.vel.x, this.vel.z)
    if (planarSpeed > IDLE_SPEED && turn === 0) {
      const target = Math.atan2(this.vel.x, this.vel.z)
      let d = target - this.yaw
      while (d > Math.PI) d -= Math.PI * 2
      while (d < -Math.PI) d += Math.PI * 2
      this.yaw += d * (1 - Math.exp(-FACE_RATE * dt))
    }

    // ── Horizontal move, blocked by walls ────────────────────────────────
    this.next.set(this.pos.x + this.vel.x * dt, this.pos.y, this.pos.z + this.vel.z * dt)
    if (planarSpeed > 1e-4) {
      const fromY = this.pos.y + CHEST_Y
      const toi = this.env.sweepSphere(
        this.pos.x,
        fromY,
        this.pos.z,
        this.next.x,
        fromY,
        this.next.z,
        BODY_RADIUS,
      )
      if (toi >= 0) {
        // Stop just short of the obstacle and kill the velocity into it.
        const f = Math.max(0, toi - 0.05)
        this.next.x = this.pos.x + (this.next.x - this.pos.x) * f
        this.next.z = this.pos.z + (this.next.z - this.pos.z) * f
        this.vel.x *= 0.15
        this.vel.z *= 0.15
      }
    }

    // ── Ground ───────────────────────────────────────────────────────────
    const ground = this.env.groundHeight(this.next.x, this.next.y + PROBE_UP, this.next.z, PROBE_DOWN)

    if (ground === null) {
      // Nothing below: fall, and keep falling until a chunk streams in.
      this.grounded = false
      this.vel.y = Math.max(-MAX_FALL, this.vel.y - GRAVITY * dt)
      this.next.y += this.vel.y * dt
      this.airborne = 0
    } else {
      const rise = ground - this.next.y
      if (rise > 0 && rise <= STEP_UP) {
        // A kerb or a step: climb it without leaving the ground.
        this.next.y = ground
        this.vel.y = 0
        this.grounded = true
        this.airborne = 0
      } else if (rise > STEP_UP) {
        // Too tall to step onto: refuse the move and stay put.
        this.next.x = this.pos.x
        this.next.z = this.pos.z
        this.vel.x = 0
        this.vel.z = 0
        this.grounded = true
        this.airborne = 0
      } else if (-rise <= STEP_DOWN && this.vel.y <= 0) {
        // Small drop: stay glued so we do not bounce down every kerb.
        this.next.y = ground
        this.vel.y = 0
        this.grounded = true
        this.airborne = 0
      } else {
        this.vel.y = Math.max(-MAX_FALL, this.vel.y - GRAVITY * dt)
        this.next.y += this.vel.y * dt
        if (this.next.y <= ground) {
          this.next.y = ground
          this.vel.y = 0
          this.grounded = true
          this.airborne = 0
        } else {
          this.grounded = false
          this.airborne = this.next.y - ground
        }
      }
    }

    this.pos.copy(this.next)

    if (!wasGrounded && this.grounded && fallSpeed >= FATAL_FALL_SPEED) {
      this.onFatalFall?.()
    }
  }

  /**
   * Render interpolation between the last two physics states, plus the
   * animation. `alpha` is the fraction of the way into the current step.
   */
  syncMesh(alpha: number, dt: number): void {
    const c = this.character
    if (!c || !this.spawned) return

    const a = clamp(alpha, 0, 1)
    this.renderPos.lerpVectors(this.prevPos, this.pos, a)

    let dy = this.yaw - this.prevYaw
    while (dy > Math.PI) dy -= Math.PI * 2
    while (dy < -Math.PI) dy += Math.PI * 2

    c.group.position.copy(this.renderPos)
    c.group.rotation.set(0, this.prevYaw + dy * a, 0)

    // Pick the clip from the speed actually travelled, and rescale it so the
    // stride matches: an in-place clip played at the wrong rate slides.
    const speed = Math.hypot(this.vel.x, this.vel.z)
    if (speed < IDLE_SPEED) {
      c.play('Idle')
      c.mixer.timeScale = 1
    } else if (speed < RUN_BLEND_SPEED) {
      c.play('Walk')
      c.mixer.timeScale = clamp(speed / WALK_CLIP_SPEED, 0.45, 1.9)
    } else {
      c.play('Run')
      c.mixer.timeScale = clamp(speed / RUN_CLIP_SPEED, 0.55, 1.7)
    }

    c.update(dt)
  }

  /** Play the one-shot punch, for a bit of life on the streets. */
  punch(): void {
    this.character?.play('Punch')
    if (this.character) this.character.mixer.timeScale = 1
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.spawned = false
    this._destroyModel()
  }
}
