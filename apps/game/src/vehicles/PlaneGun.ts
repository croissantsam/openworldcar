/**
 * PlaneGun — twin cowling machine guns for the player's plane.
 *
 * Hitscan: one Rapier ray per round from the firing muzzle along the nose
 * axis (the visible tracer then travels at 850 m/s toward the impact point,
 * so the sound and the feel stay honest without a projectile simulation).
 *
 * Everything visual is pooled (an InstancedMesh for the tracers, two muzzle
 * flashes, a ring of impact puffs) and every temporary vector is a field:
 * update() allocates nothing. The shot sound is synthesised with WebAudio on
 * a lazily-created context (same unlock pattern as ImpactFX) and is silent
 * when audio is unavailable.
 *
 * The gun owns no damage logic: every round that hits something is reported
 * through `onHit` with its collider handle, and the engine decides whether it
 * was the world or another player.
 */

import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'

export type GunHit = {
  point: THREE.Vector3
  normal: THREE.Vector3
  distance: number
  colliderHandle: number | null
}

// ─── Ballistics ──────────────────────────────────────────────────────────────

/** Rounds per second, both guns together (they alternate). */
const FIRE_RATE = 11
const FIRE_INTERVAL = 1 / FIRE_RATE
/** Tracer travel speed, m/s (visual only — the ray is instantaneous). */
const MUZZLE_SPEED = 850
/** Maximum useful range, metres. */
const RANGE = 1200
const MAX_AMMO = 900
/**
 * Heat added per round (0..1 scale) and cooling per second (while not firing:
 * 11 rounds/s add 17.6 %/s, so cooling during a burst would make overheating
 * unreachable).
 */
const HEAT_PER_SHOT = 0.016
const COOL_RATE = 0.22
/** Once overheated the guns stay blocked until the heat falls back under this. */
const OVERHEAT_RESET = 0.35
/** Barrel dispersion, radians (≈ 1.7 mrad ≈ 2 m at 1200 m). */
const SPREAD = 0.0017
/** At most this many rounds per frame, so a 1 s stall never dumps the magazine. */
const MAX_SHOTS_PER_FRAME = 4

// ─── Visuals ─────────────────────────────────────────────────────────────────

const MAX_TRACERS = 120
/** Every third round is a bright tracer. */
const TRACER_BRIGHT_EVERY = 3
const TRACER_LENGTH = 26
const TRACER_LENGTH_DIM = 14
const FLASH_TIME = 0.045
const MAX_PUFFS = 20
const PUFF_TIME = 0.28

const DIM = new THREE.Color(0.68, 0.5, 0.2)
const BRIGHT = new THREE.Color(1, 0.86, 0.45)

type Tracer = {
  active: boolean
  travelled: number
  maxDist: number
  length: number
  origin: THREE.Vector3
  dir: THREE.Vector3
  quat: THREE.Quaternion
}

type Puff = {
  mesh: THREE.Mesh
  mat: THREE.MeshBasicMaterial
  life: number
}

// ─── Procedural shot sound ───────────────────────────────────────────────────

class GunAudio {
  private ctx: AudioContext | null = null
  private noise: AudioBuffer | null = null
  private master: GainNode | null = null
  private tried = false
  private last = -1
  private readonly resume = (): void => {
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume()
  }

  private init(): void {
    if (this.tried) return
    this.tried = true
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!AudioCtx) return
      const ctx = new AudioCtx()
      const sampleRate = ctx.sampleRate
      const buffer = ctx.createBuffer(1, Math.floor(sampleRate * 0.25), sampleRate)
      const data = buffer.getChannelData(0)
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
      const master = ctx.createGain()
      master.gain.value = 0.22
      master.connect(ctx.destination)
      this.ctx = ctx
      this.noise = buffer
      this.master = master
      window.addEventListener('keydown', this.resume)
      window.addEventListener('pointerdown', this.resume)
    } catch {
      // No WebAudio: the guns stay silent.
    }
  }

  shot(): void {
    this.init()
    const ctx = this.ctx
    const master = this.master
    if (!ctx || !master || ctx.state === 'suspended') return
    const now = ctx.currentTime
    // Never more than ~12 reports per second, whatever the frame rate.
    if (this.last > 0 && now - this.last < 1 / 12) return
    this.last = now

    const pitch = 0.9 + Math.random() * 0.2

    // Crack: short band-passed noise burst.
    if (this.noise) {
      const src = ctx.createBufferSource()
      src.buffer = this.noise
      src.playbackRate.value = pitch
      const bp = ctx.createBiquadFilter()
      bp.type = 'bandpass'
      bp.frequency.setValueAtTime(1500 * pitch, now)
      bp.Q.setValueAtTime(0.9, now)
      const g = ctx.createGain()
      g.gain.setValueAtTime(0.55, now)
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.075)
      src.connect(bp)
      bp.connect(g)
      g.connect(master)
      src.start(now)
      src.stop(now + 0.09)
    }

    // Thump: the breech.
    const osc = ctx.createOscillator()
    const og = ctx.createGain()
    osc.type = 'square'
    osc.frequency.setValueAtTime(190 * pitch, now)
    osc.frequency.exponentialRampToValueAtTime(58, now + 0.06)
    og.gain.setValueAtTime(0.3, now)
    og.gain.exponentialRampToValueAtTime(0.001, now + 0.08)
    osc.connect(og)
    og.connect(master)
    osc.start(now)
    osc.stop(now + 0.1)
  }

  dispose(): void {
    window.removeEventListener('keydown', this.resume)
    window.removeEventListener('pointerdown', this.resume)
    const ctx = this.ctx
    this.ctx = null
    this.master = null
    this.noise = null
    if (ctx) {
      try {
        void ctx.close()
      } catch {
        // already closed
      }
    }
  }
}

// ─── Gun ─────────────────────────────────────────────────────────────────────

export class PlaneGun {
  private scene: THREE.Scene
  private world: RAPIER.World

  private ammoLeft = MAX_AMMO
  private heatLevel = 0
  private isOverheated = false
  private isFiring = false
  private timer = FIRE_INTERVAL
  private shotIndex = 0
  private disposed = false

  private readonly group = new THREE.Group()
  private readonly tracers: Tracer[] = []
  private readonly tracerMesh: THREE.InstancedMesh
  private readonly flashes: THREE.Mesh[] = []
  private readonly flashMat: THREE.MeshBasicMaterial
  private flashLife = [0, 0]
  private readonly puffs: Puff[] = []
  private nextPuff = 0
  private readonly puffGeo: THREE.PlaneGeometry
  private readonly audio = new GunAudio()

  // Scratch — update() must not allocate.
  private readonly ray: RAPIER.Ray
  private readonly dir = new THREE.Vector3()
  private readonly fwd = new THREE.Vector3(0, 0, 1)
  private readonly head = new THREE.Vector3()
  private readonly pos = new THREE.Vector3()
  private readonly scale = new THREE.Vector3()
  private readonly matrix = new THREE.Matrix4()
  /** Local axis the tracer box and the flash cone are built along. */
  private readonly axisZ = new THREE.Vector3(0, 0, 1)
  private readonly hitPoint = new THREE.Vector3()
  private readonly hitNormal = new THREE.Vector3()
  private readonly hitEvent: GunHit

  private readonly rayFlags = RAPIER.QueryFilterFlags.EXCLUDE_SENSORS
  /**
   * Skip anything attached to a dynamic body: the only one in the world is the
   * player's own (parked) car, which would otherwise eat every round.
   */
  private readonly rayPredicate = (c: RAPIER.Collider): boolean => {
    const b = c.parent()
    return b === null || !b.isDynamic()
  }

  /** Called for each round that hits something (world or player). */
  onHit?: ((hit: GunHit) => void) | undefined

  constructor(scene: THREE.Scene, world: RAPIER.World) {
    this.scene = scene
    this.world = world
    this.ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 })
    this.hitEvent = { point: this.hitPoint, normal: this.hitNormal, distance: 0, colliderHandle: null }

    this.group.name = 'PlaneGunFX'
    this.group.frustumCulled = false

    // Tracers: one unit box stretched along its local +Z, instanced.
    const tracerGeo = new THREE.BoxGeometry(0.1, 0.1, 1)
    const tracerMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    })
    this.tracerMesh = new THREE.InstancedMesh(tracerGeo, tracerMat, MAX_TRACERS)
    this.tracerMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.tracerMesh.frustumCulled = false
    this.tracerMesh.renderOrder = 4
    this.matrix.makeScale(0, 0, 0)
    for (let i = 0; i < MAX_TRACERS; i++) {
      this.tracerMesh.setMatrixAt(i, this.matrix)
      this.tracerMesh.setColorAt(i, DIM)
      this.tracers.push({
        active: false,
        travelled: 0,
        maxDist: 0,
        length: TRACER_LENGTH,
        origin: new THREE.Vector3(),
        dir: new THREE.Vector3(0, 0, 1),
        quat: new THREE.Quaternion(),
      })
    }
    this.tracerMesh.instanceMatrix.needsUpdate = true
    if (this.tracerMesh.instanceColor) this.tracerMesh.instanceColor.needsUpdate = true
    this.group.add(this.tracerMesh)

    // Muzzle flashes: two small additive blobs, ~45 ms each.
    this.flashMat = new THREE.MeshBasicMaterial({
      color: 0xffd27a,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    })
    const flashGeo = new THREE.SphereGeometry(0.22, 8, 6)
    for (let i = 0; i < 2; i++) {
      const m = new THREE.Mesh(flashGeo, this.flashMat)
      m.visible = false
      m.frustumCulled = false
      m.renderOrder = 5
      this.flashes.push(m)
      this.group.add(m)
    }

    // Impact puffs: expanding, fading quads facing the surface normal.
    this.puffGeo = new THREE.PlaneGeometry(1, 1)
    for (let i = 0; i < MAX_PUFFS; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xd9cbb4,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      })
      const mesh = new THREE.Mesh(this.puffGeo, mat)
      mesh.visible = false
      mesh.frustumCulled = false
      this.puffs.push({ mesh, mat, life: 0 })
      this.group.add(mesh)
    }

    scene.add(this.group)
  }

  getState(): { ammo: number; maxAmmo: number; heat: number; overheated: boolean; firing: boolean } {
    return {
      ammo: this.ammoLeft,
      maxAmmo: MAX_AMMO,
      heat: this.heatLevel,
      overheated: this.isOverheated,
      firing: this.isFiring,
    }
  }

  /**
   * One frame of gun: cooling, firing, tracer / flash / puff animation.
   * `muzzleA` / `muzzleB` are the two muzzles in world space, `forward` the
   * (normalised) nose axis. Safe for any dt.
   */
  update(
    dt: number,
    muzzleA: THREE.Vector3,
    muzzleB: THREE.Vector3,
    forward: THREE.Vector3,
    firing: boolean,
  ): void {
    if (this.disposed) return
    const step = Number.isFinite(dt) ? Math.min(Math.max(dt, 0), 0.25) : 0
    // One normalised nose axis for the whole frame (flashes + rays).
    const fwdLen2 = forward.lengthSq()
    if (Number.isFinite(fwdLen2) && fwdLen2 > 1e-6) this.fwd.copy(forward).normalize()

    const wantFire =
      firing && !this.isOverheated && this.ammoLeft > 0 && Number.isFinite(fwdLen2) && fwdLen2 > 1e-6
    this.isFiring = false

    // The barrels only cool when they are not firing: held down, the trigger
    // takes ≈ 5.7 s to reach the overheat limit, and the guns are usable again
    // (back under OVERHEAT_RESET) ≈ 3 s after it is released.
    if (!wantFire && this.heatLevel > 0) {
      this.heatLevel = Math.max(0, this.heatLevel - COOL_RATE * step)
      if (this.isOverheated && this.heatLevel <= OVERHEAT_RESET) this.isOverheated = false
    }

    if (wantFire) {
      this.timer += step
      let shots = 0
      while (this.timer >= FIRE_INTERVAL && shots < MAX_SHOTS_PER_FRAME && this.ammoLeft > 0 && !this.isOverheated) {
        this.timer -= FIRE_INTERVAL
        const left = this.shotIndex % 2 === 0
        this.fireOne(left ? muzzleA : muzzleB, left ? 0 : 1)
        shots++
      }
      // Never build a backlog of rounds after a long frame.
      if (this.timer > FIRE_INTERVAL) this.timer = FIRE_INTERVAL
      // Reported as firing for the whole burst, not only on the frames that
      // happen to contain a round.
      this.isFiring = true
    } else {
      // Trigger released (or blocked): the next press fires instantly.
      this.timer = FIRE_INTERVAL
    }

    this.stepFlashes(step, muzzleA, muzzleB)
    this.stepTracers(step)
    this.stepPuffs(step)
  }

  private fireOne(muzzle: THREE.Vector3, side: 0 | 1): void {
    this.ammoLeft--
    this.heatLevel += HEAT_PER_SHOT
    if (this.heatLevel >= 1) {
      this.heatLevel = 1
      this.isOverheated = true
    }
    const bright = this.shotIndex % TRACER_BRIGHT_EVERY === 0
    this.shotIndex++

    // Barrel dispersion around the nose axis.
    this.dir.set(
      this.fwd.x + (Math.random() - 0.5) * SPREAD * 2,
      this.fwd.y + (Math.random() - 0.5) * SPREAD * 2,
      this.fwd.z + (Math.random() - 0.5) * SPREAD * 2,
    )
    this.dir.normalize()

    const r = this.ray
    r.origin.x = muzzle.x
    r.origin.y = muzzle.y
    r.origin.z = muzzle.z
    r.dir.x = this.dir.x
    r.dir.y = this.dir.y
    r.dir.z = this.dir.z

    let distance = RANGE
    let handle: number | null = null
    let hit = false
    try {
      const res = this.world.castRayAndGetNormal(
        r,
        RANGE,
        true,
        this.rayFlags,
        undefined,
        undefined,
        undefined,
        this.rayPredicate,
      )
      if (res && Number.isFinite(res.toi)) {
        hit = true
        distance = Math.max(0.1, res.toi)
        handle = res.collider?.handle ?? null
        this.hitNormal.set(res.normal.x, res.normal.y, res.normal.z)
        if (this.hitNormal.lengthSq() < 1e-6) this.hitNormal.copy(this.dir).negate()
      }
    } catch {
      // A query on a disposed world: keep the visuals, drop the hit.
    }

    this.spawnTracer(muzzle, this.dir, distance, bright)
    this.flashLife[side] = FLASH_TIME
    this.audio.shot()

    if (hit) {
      this.hitPoint.copy(muzzle).addScaledVector(this.dir, distance)
      this.spawnPuff(this.hitPoint, this.hitNormal)
      this.hitEvent.distance = distance
      this.hitEvent.colliderHandle = handle
      this.onHit?.(this.hitEvent)
    }
  }

  private spawnTracer(from: THREE.Vector3, dir: THREE.Vector3, distance: number, bright: boolean): void {
    let slot = -1
    for (let i = 0; i < this.tracers.length; i++) {
      if (!this.tracers[i]!.active) {
        slot = i
        break
      }
    }
    // Pool full: recycle the oldest-looking one (the furthest along its flight).
    if (slot < 0) {
      let best = 0
      for (let i = 1; i < this.tracers.length; i++) {
        if (this.tracers[i]!.travelled > this.tracers[best]!.travelled) best = i
      }
      slot = best
    }
    const t = this.tracers[slot]!
    t.active = true
    t.travelled = 0
    t.maxDist = distance
    t.length = bright ? TRACER_LENGTH : TRACER_LENGTH_DIM
    t.origin.copy(from)
    t.dir.copy(dir)
    t.quat.setFromUnitVectors(this.axisZ, t.dir)
    this.tracerMesh.setColorAt(slot, bright ? BRIGHT : DIM)
    if (this.tracerMesh.instanceColor) this.tracerMesh.instanceColor.needsUpdate = true
  }

  private stepTracers(dt: number): void {
    let dirty = false
    for (let i = 0; i < this.tracers.length; i++) {
      const t = this.tracers[i]!
      if (!t.active) continue
      t.travelled += MUZZLE_SPEED * dt
      if (t.travelled >= t.maxDist) {
        t.active = false
        this.matrix.makeScale(0, 0, 0)
        this.tracerMesh.setMatrixAt(i, this.matrix)
        dirty = true
        continue
      }
      // Streak: from the round's head back toward the muzzle.
      const len = Math.max(1, Math.min(t.length, t.travelled))
      this.head.copy(t.origin).addScaledVector(t.dir, t.travelled)
      this.pos.copy(this.head).addScaledVector(t.dir, -len * 0.5)
      this.scale.set(1, 1, len)
      this.matrix.compose(this.pos, t.quat, this.scale)
      this.tracerMesh.setMatrixAt(i, this.matrix)
      dirty = true
    }
    if (dirty) this.tracerMesh.instanceMatrix.needsUpdate = true
  }

  private stepFlashes(dt: number, muzzleA: THREE.Vector3, muzzleB: THREE.Vector3): void {
    for (let i = 0; i < 2; i++) {
      const life = this.flashLife[i]!
      const mesh = this.flashes[i]!
      if (life <= 0) {
        if (mesh.visible) mesh.visible = false
        continue
      }
      const next = Math.max(0, life - dt)
      this.flashLife[i] = next
      // Glued to the live muzzle: the plane moves 3-4 m during the flash.
      const muzzle = i === 0 ? muzzleA : muzzleB
      mesh.position.copy(muzzle).addScaledVector(this.fwd, 0.25)
      const k = next / FLASH_TIME
      mesh.scale.set(0.7 + 0.6 * k, 0.7 + 0.6 * k, 1.5 + 2.2 * k)
      mesh.quaternion.setFromUnitVectors(this.axisZ, this.fwd)
      mesh.visible = true
    }
  }

  private spawnPuff(point: THREE.Vector3, normal: THREE.Vector3): void {
    const p = this.puffs[this.nextPuff % MAX_PUFFS]!
    this.nextPuff = (this.nextPuff + 1) % MAX_PUFFS
    p.life = PUFF_TIME
    p.mesh.position.copy(point).addScaledVector(normal, 0.05)
    p.mesh.quaternion.setFromUnitVectors(this.axisZ, normal)
    p.mesh.scale.set(0.5, 0.5, 1)
    p.mat.opacity = 0.85
    p.mesh.visible = true
  }

  private stepPuffs(dt: number): void {
    for (const p of this.puffs) {
      if (p.life <= 0) continue
      p.life = Math.max(0, p.life - dt)
      if (p.life === 0) {
        p.mesh.visible = false
        p.mat.opacity = 0
        continue
      }
      const k = 1 - p.life / PUFF_TIME
      const s = 0.5 + k * 2.4
      p.mesh.scale.set(s, s, 1)
      p.mat.opacity = 0.85 * (1 - k)
    }
  }

  /** Full magazine, cold barrels, no leftover visuals. */
  reset(): void {
    if (this.disposed) return
    this.ammoLeft = MAX_AMMO
    this.heatLevel = 0
    this.isOverheated = false
    this.isFiring = false
    this.timer = FIRE_INTERVAL
    this.matrix.makeScale(0, 0, 0)
    for (let i = 0; i < this.tracers.length; i++) {
      this.tracers[i]!.active = false
      this.tracerMesh.setMatrixAt(i, this.matrix)
    }
    this.tracerMesh.instanceMatrix.needsUpdate = true
    this.flashLife[0] = 0
    this.flashLife[1] = 0
    for (const f of this.flashes) f.visible = false
    for (const p of this.puffs) {
      p.life = 0
      p.mat.opacity = 0
      p.mesh.visible = false
    }
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.onHit = undefined
    this.scene.remove(this.group)
    this.tracerMesh.geometry.dispose()
    ;(this.tracerMesh.material as THREE.Material).dispose()
    this.tracerMesh.dispose()
    if (this.flashes[0]) this.flashes[0].geometry.dispose()
    this.flashMat.dispose()
    this.puffGeo.dispose()
    for (const p of this.puffs) p.mat.dispose()
    this.audio.dispose()
  }
}
