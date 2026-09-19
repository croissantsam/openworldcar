/**
 * RemotePlayerManager — manages 3D visual cars (or planes), nametags,
 * interpolation, and Rapier physical colliders for other multiplayer players.
 */

import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import type { PlayerSnapshot } from '@world-drive/shared'
import { InterpolationBuffer } from '../networking/InterpolationBuffer.js'
import {
  createTwoSeatAirplane,
  AIRPLANE_MAIN_WHEEL_Z,
  AIRPLANE_WINGTIP_X,
  AIRPLANE_LENGTH,
  AIRPLANE_FUSELAGE_Y,
} from './AirplaneModel.js'
import type { WorldPosition } from '@world-drive/math'

const MAX_HEALTH = 100
/** Health below which a remote vehicle trails smoke. */
const SMOKE_HEALTH = 40
/** How long a destroyed vehicle stays hidden (explosion + respawn). */
const DESTROYED_HIDE_MS = 1_200
/**
 * Membership bit of the gun hitboxes. Their interaction filter is 0, so they never
 * produce contacts (nor wheel-ray hits): they exist purely as ray-cast targets for
 * PlaneGun, which casts without filter groups.
 */
const HITBOX_GROUPS = (0x0008 << 16) | 0x0000

const MAX_SMOKE_PUFFS = 12
const SMOKE_INTERVAL = 0.085

type RemoteVehicle = 'car' | 'plane'
type AirplaneVisual = ReturnType<typeof createTwoSeatAirplane>

/**
 * The airplane model has its nose toward -Z and its main wheels at
 * z = AIRPLANE_MAIN_WHEEL_Z, on the ground at y = 0. A remote plane's position
 * is the point between its main wheels, on the ground, with forward = +Z (as
 * PlayerPlane): turn the model by π and shift it so the main wheels sit on the origin.
 */
const CAR_NAMETAG_Y = 2.2
const PLANE_NAMETAG_Y = 3.6

// Visual dimensions matching PlayerCar
const CAR_W = 2.0
const CAR_H = 1.2
const CAR_L = 4.5

const RIVAL_PALETTES = [
  { primary: 0xff3b00, secondary: 0xcc2200, hex: '#ff3b00', name: 'Inferno' },
  { primary: 0x0088ff, secondary: 0x0055cc, hex: '#0088ff', name: 'Velocity' },
  { primary: 0xffcc00, secondary: 0xcc9900, hex: '#ffcc00', name: 'Thunder' },
  { primary: 0x00e676, secondary: 0x00a854, hex: '#00e676', name: 'Viper' },
  { primary: 0xe0115f, secondary: 0xaa0e46, hex: '#e0115f', name: 'Ruby' },
  { primary: 0x9b51e0, secondary: 0x7030a0, hex: '#9b51e0', name: 'Phantom' },
  { primary: 0x00f2fe, secondary: 0x00a8cc, hex: '#00f2fe', name: 'Glacier' },
  { primary: 0xff1361, secondary: 0xcc0e4e, hex: '#ff1361', name: 'Apex' },
]

function hashId(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return h
}

function renderNametagToCanvas(
  canvas: HTMLCanvasElement,
  title: string,
  borderColor: string,
  isShielded = false,
): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  ctx.fillStyle = isShielded ? 'rgba(8, 22, 38, 0.92)' : 'rgba(12, 14, 18, 0.88)'
  ctx.beginPath()
  ctx.roundRect(10, 8, 236, 48, 24)
  ctx.fill()

  ctx.strokeStyle = isShielded ? '#00e5ff' : borderColor
  ctx.lineWidth = isShielded ? 3.5 : 2.5
  ctx.stroke()

  ctx.fillStyle = isShielded ? '#e0f7ff' : '#ffffff'
  ctx.font = 'bold 20px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(title, 128, 32)
}

function createNametagSprite(title: string, borderColor: string): {
  sprite: THREE.Sprite
  canvas: HTMLCanvasElement | null
  texture: THREE.CanvasTexture | null
} {
  if (typeof document === 'undefined') {
    return { sprite: new THREE.Sprite(), canvas: null, texture: null }
  }
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 64
  renderNametagToCanvas(canvas, title, borderColor, false)

  const tex = new THREE.CanvasTexture(canvas)
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false })
  const sprite = new THREE.Sprite(mat)
  sprite.scale.set(2.4, 0.6, 1)
  sprite.position.set(0, 2.2, 0)
  sprite.renderOrder = 999
  return { sprite, canvas, texture: tex }
}

let smokeTexture: THREE.CanvasTexture | null = null
function getSmokeTexture(): THREE.CanvasTexture | null {
  if (smokeTexture) return smokeTexture
  if (typeof document === 'undefined') return null
  const c = document.createElement('canvas')
  c.width = 64
  c.height = 64
  const ctx = c.getContext('2d')
  if (!ctx) return null
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30)
  g.addColorStop(0, 'rgba(40, 40, 44, 0.85)')
  g.addColorStop(0.45, 'rgba(70, 70, 76, 0.45)')
  g.addColorStop(1, 'rgba(90, 90, 96, 0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 64, 64)
  smokeTexture = new THREE.CanvasTexture(c)
  return smokeTexture
}

function renderHealthBarToCanvas(canvas: HTMLCanvasElement, health: number): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const w = canvas.width
  const h = canvas.height
  ctx.clearRect(0, 0, w, h)
  const ratio = Math.max(0, Math.min(1, health / MAX_HEALTH))

  ctx.fillStyle = 'rgba(8, 10, 14, 0.85)'
  ctx.beginPath()
  ctx.roundRect(2, 2, w - 4, h - 4, 6)
  ctx.fill()
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)'
  ctx.lineWidth = 2
  ctx.stroke()

  const fillW = Math.max(0, (w - 10) * ratio)
  ctx.fillStyle = ratio > 0.6 ? '#3ddc84' : ratio > 0.3 ? '#ffcc00' : '#ff3b30'
  if (fillW > 0) {
    ctx.beginPath()
    ctx.roundRect(5, 5, fillW, h - 10, 4)
    ctx.fill()
  }
}

function createHealthBarSprite(): {
  sprite: THREE.Sprite
  canvas: HTMLCanvasElement
  texture: THREE.CanvasTexture
} | null {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 20
  renderHealthBarToCanvas(canvas, MAX_HEALTH)
  const texture = new THREE.CanvasTexture(canvas)
  const mat = new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true })
  const sprite = new THREE.Sprite(mat)
  sprite.scale.set(1.5, 0.23, 1)
  sprite.renderOrder = 998
  sprite.visible = false
  return { sprite, canvas, texture }
}

type SmokePuff = { sprite: THREE.Sprite; life: number; maxLife: number }

type RemotePlayer = {
  id: string
  mesh: THREE.Group
  /** Car body meshes (hidden while the player flies). */
  carVisual: THREE.Group
  /** Plane model, created the first time this player flies. */
  planeVisual: { container: THREE.Group; model: AirplaneVisual } | null
  vehicle: RemoteVehicle
  nametag: THREE.Sprite
  /** Last reported speed (m/s), for the propeller. */
  lastSpeed: number
  body: RAPIER.RigidBody | null
  collider: RAPIER.Collider | null
  /** Always-on ray-cast target for the guns (no physical interaction). */
  hitCollider: RAPIER.Collider | null
  health: number
  healthBar: { sprite: THREE.Sprite; canvas: HTMLCanvasElement; texture: THREE.CanvasTexture } | null
  lastHealthDrawn: number
  /** Hidden (destroyed) until this timestamp (ms, Date.now()). 0 = visible. */
  hiddenUntil: number
  smokePuffs: SmokePuff[]
  smokeTimer: number
  buffer: InterpolationBuffer
  lastSeen: number
  invincibleUntil: number
  nametagCanvas: HTMLCanvasElement | null
  nametagTexture: THREE.CanvasTexture | null
  paletteHex: string
  lastTagText: string
  colliderWasEnabled: boolean
}

export class RemotePlayerManager {
  private scene: THREE.Scene
  private world: RAPIER.World | undefined
  private players = new Map<string, RemotePlayer>()
  private isLocalInvincible = false
  private localPos: { x: number; y: number; z: number } | null = null
  /** Rapier collider handle → remote player id (chassis + gun hitbox). */
  private colliderToPlayer = new Map<number, string>()

  /** A remote player was just destroyed (health dropped to 0 then reset by the server). */
  onPlayerDestroyed?: (id: string, position: WorldPosition) => void

  constructor(scene: THREE.Scene, world?: RAPIER.World | undefined) {
    this.scene = scene
    this.world = world
  }

  setPhysicsWorld(world: RAPIER.World): void {
    this.world = world
  }

  setLocalPlayerState(pos: { x: number; y: number; z: number }, isInvincible: boolean): void {
    this.localPos = pos
    this.isLocalInvincible = isInvincible
  }

  /**
   * Called when a world_snapshot message is received from the server.
   */
  handleSnapshot(snapshots: PlayerSnapshot[], localPlayerId: string): void {
    const now = performance.now()

    for (const snap of snapshots) {
      if (snap.id === localPlayerId) continue // Don't render local car twice

      let player = this.players.get(snap.id)
      if (!player) {
        player = this._createRemotePlayer(snap.id, snap)
        this.players.set(snap.id, player)
      } else if (snap.invincibleUntil !== undefined) {
        player.invincibleUntil = snap.invincibleUntil
      }

      // ── Health (absent = full health: older servers) ────────────────────
      if (snap.health !== undefined && Number.isFinite(snap.health)) {
        const next = Math.max(0, Math.min(MAX_HEALTH, snap.health))
        const prev = player.health
        // Destroyed: health hit 0, or jumped back to full after a heavy drop
        // (the server resets a destroyed player to MAX_HEALTH immediately).
        const destroyed = next <= 0 || (prev <= SMOKE_HEALTH && next >= MAX_HEALTH && next > prev)
        player.health = next
        if (destroyed) this._onDestroyed(player)
      }

      // Absent = car (older clients / servers)
      const vehicle: RemoteVehicle = snap.vehicle === 'plane' ? 'plane' : 'car'
      if (vehicle !== player.vehicle) this._setVehicle(player, vehicle)
      const v = snap.velocity
      const speed = v ? Math.hypot(v.x, v.y, v.z) : 0
      player.lastSpeed = Number.isFinite(speed) ? speed : 0

      player.buffer.addSnapshot(snap)
      player.lastSeen = now
    }
  }

  /**
   * Called every frame in the render loop.
   */
  update(dt: number): void {
    const now = performance.now()
    const nowMs = Date.now()

    for (const [id, player] of this.players) {
      // Remove stale players that haven't been seen for 5 seconds
      if (now - player.lastSeen > 5000) {
        this.removePlayer(id)
        continue
      }

      const interp = player.buffer.getInterpolated(now)
      if (interp) {
        player.mesh.position.copy(interp.position)
        player.mesh.quaternion.copy(interp.quaternion)

        // Keep Rapier kinematic rigid body in exact sync so local car can physically collide with it
        if (player.body) {
          player.body.setNextKinematicTranslation({
            x: interp.position.x,
            y: interp.position.y,
            z: interp.position.z,
          })
          player.body.setNextKinematicRotation({
            x: interp.quaternion.x,
            y: interp.quaternion.y,
            z: interp.quaternion.z,
            w: interp.quaternion.w,
          })
        }
      }

      // ── Plane propeller ─────────────────────────────────────────────────
      if (player.vehicle === 'plane' && player.planeVisual) {
        const rpm = 520 + Math.min(70, player.lastSpeed) * 13
        player.planeVisual.model.update(Math.min(0.1, Math.max(0, dt)), rpm)
      }

      // ── Invincibility & Collision Filtering ─────────────────────────────
      const remoteInvincible = nowMs < player.invincibleUntil
      const eitherInvincible = this.isLocalInvincible || remoteInvincible

      // Anti-stuck safety check: keep disabled if overlapping until safely separated
      // (a flying player has no car collider at all)
      let canCollide = !eitherInvincible && player.vehicle === 'car'
      if (canCollide && !player.colliderWasEnabled && this.localPos) {
        const dx = player.mesh.position.x - this.localPos.x
        const dz = player.mesh.position.z - this.localPos.z
        if (dx * dx + dz * dz < 8.0) {
          canCollide = false // Still overlapping, wait until separated
        } else {
          player.colliderWasEnabled = true
        }
      } else if (!canCollide) {
        player.colliderWasEnabled = false
      }

      if (player.collider) {
        player.collider.setEnabled(canCollide)
      }
      // The gun hitbox stays on whatever the physical collider does — except
      // while the vehicle is hidden after a destruction.
      player.hitCollider?.setEnabled(player.hiddenUntil <= nowMs)

      // ── Health bar / smoke / destruction hide ───────────────────────────
      this._updateDamageVisuals(player, dt, nowMs)

      // ── Nametag Badge Update ────────────────────────────────────────────
      if (remoteInvincible) {
        const remainingSec = Math.max(0, (player.invincibleUntil - nowMs) / 1000)
        const ceilSec = Math.ceil(remainingSec)
        const tagText = `🛡️ RIVAL #${id.slice(0, 4).toUpperCase()} [${ceilSec}s]`
        if (tagText !== player.lastTagText) {
          player.lastTagText = tagText
          if (player.nametagCanvas && player.nametagTexture) {
            renderNametagToCanvas(player.nametagCanvas, tagText, player.paletteHex, true)
            player.nametagTexture.needsUpdate = true
          }
        }
      } else {
        const normalTag = `RIVAL #${id.slice(0, 4).toUpperCase()}`
        if (player.lastTagText !== normalTag) {
          player.lastTagText = normalTag
          if (player.nametagCanvas && player.nametagTexture) {
            renderNametagToCanvas(player.nametagCanvas, normalTag, player.paletteHex, false)
            player.nametagTexture.needsUpdate = true
          }
        }
      }
    }
  }

  removePlayer(id: string): void {
    const player = this.players.get(id)
    if (player) {
      this.scene.remove(player.mesh)
      player.planeVisual?.model.dispose()
      player.planeVisual = null
      this._disposeDamageVisuals(player)
      if (player.collider) this.colliderToPlayer.delete(player.collider.handle)
      if (player.hitCollider) this.colliderToPlayer.delete(player.hitCollider.handle)
      player.hitCollider = null
      if (player.body && this.world) {
        this.world.removeRigidBody(player.body)
      }
      this.players.delete(id)
    }
  }

  /** Free the smoke sprites and the health-bar texture of one player. */
  private _disposeDamageVisuals(player: RemotePlayer): void {
    for (const puff of player.smokePuffs) {
      this.scene.remove(puff.sprite)
      ;(puff.sprite.material as THREE.SpriteMaterial).dispose()
    }
    player.smokePuffs.length = 0
    if (player.healthBar) {
      player.healthBar.sprite.removeFromParent()
      ;(player.healthBar.sprite.material as THREE.SpriteMaterial).dispose()
      player.healthBar.texture.dispose()
      player.healthBar = null
    }
  }

  /** Which remote player owns this Rapier collider handle, if any (gun ray hits). */
  getPlayerIdForCollider(handle: number): string | null {
    return this.colliderToPlayer.get(handle) ?? null
  }

  /** Position of a remote player (for explosions), or null. */
  getPlayerPosition(id: string): WorldPosition | null {
    const player = this.players.get(id)
    if (!player) return null
    const p = player.mesh.position
    return { x: p.x, y: p.y, z: p.z }
  }

  /** Current health of a remote player (MAX_HEALTH when unknown). */
  getPlayerHealth(id: string): number {
    return this.players.get(id)?.health ?? MAX_HEALTH
  }

  /** True while that player is spawn-protected (no damage can be dealt to them). */
  isPlayerInvincible(id: string): boolean {
    const player = this.players.get(id)
    if (!player) return false
    return Date.now() < player.invincibleUntil || player.hiddenUntil > Date.now()
  }

  /** Show the player's car or plane (the plane model is built once, then cached). */
  private _setVehicle(player: RemotePlayer, vehicle: RemoteVehicle): void {
    player.vehicle = vehicle
    if (vehicle === 'plane' && !player.planeVisual) {
      try {
        const model = createTwoSeatAirplane()
        model.setColor(player.paletteHex)
        const container = new THREE.Group()
        container.name = `remote_plane_${player.id}`
        container.rotation.y = Math.PI
        container.position.z = AIRPLANE_MAIN_WHEEL_Z
        container.add(model.group)
        player.mesh.add(container)
        player.planeVisual = { container, model }
      } catch (err) {
        console.warn('[RemotePlayerManager] Could not build the plane model:', err)
      }
    }
    const flying = vehicle === 'plane' && player.planeVisual !== null
    player.carVisual.visible = !flying
    if (player.planeVisual) player.planeVisual.container.visible = flying
    player.nametag.position.y = flying ? PLANE_NAMETAG_Y : CAR_NAMETAG_Y
    // No car collider while flying
    if (vehicle === 'plane') {
      player.collider?.setEnabled(false)
      player.colliderWasEnabled = false
    }
    if (player.healthBar) {
      player.healthBar.sprite.position.y = (flying ? PLANE_NAMETAG_Y : CAR_NAMETAG_Y) - 0.42
    }
    this._rebuildHitCollider(player)
  }

  /**
   * (Re)build the gun hitbox: a solid collider sized for the current vehicle,
   * with an interaction filter of 0 so it never collides with anything — it only
   * answers ray casts (PlaneGun) so bullets can identify the player they hit.
   */
  private _rebuildHitCollider(player: RemotePlayer): void {
    if (!this.world || !player.body) return
    if (player.hitCollider) {
      this.colliderToPlayer.delete(player.hitCollider.handle)
      this.world.removeCollider(player.hitCollider, false)
      player.hitCollider = null
    }
    const desc =
      player.vehicle === 'plane'
        ? RAPIER.ColliderDesc.cuboid(AIRPLANE_WINGTIP_X + 0.1, 1.35, AIRPLANE_LENGTH / 2)
            .setTranslation(0, AIRPLANE_FUSELAGE_Y, 0)
        : RAPIER.ColliderDesc.cuboid(CAR_W / 2 + 0.05, CAR_H / 2 + 0.1, CAR_L / 2 + 0.05)
            .setTranslation(0, CAR_H / 2, 0)
    desc.setCollisionGroups(HITBOX_GROUPS).setSolverGroups(HITBOX_GROUPS)
    const col = this.world.createCollider(desc, player.body)
    player.hitCollider = col
    this.colliderToPlayer.set(col.handle, player.id)
  }

  /** Health bar under the nametag, smoke trail, and post-destruction hiding. */
  private _updateDamageVisuals(player: RemotePlayer, dt: number, nowMs: number): void {
    // Destroyed: hide the vehicle for a short while
    const hidden = player.hiddenUntil > nowMs
    const flying = player.vehicle === 'plane' && player.planeVisual !== null
    player.carVisual.visible = !hidden && !flying
    if (player.planeVisual) player.planeVisual.container.visible = !hidden && flying

    // Health bar (only below full health, and never while hidden)
    if (player.healthBar) {
      const show = !hidden && player.health < MAX_HEALTH
      player.healthBar.sprite.visible = show
      const rounded = Math.round(player.health)
      if (show && rounded !== player.lastHealthDrawn) {
        player.lastHealthDrawn = rounded
        renderHealthBarToCanvas(player.healthBar.canvas, rounded)
        player.healthBar.texture.needsUpdate = true
      }
    }

    // Smoke trail below 40 HP
    const smoking = !hidden && player.health < SMOKE_HEALTH
    if (smoking) {
      player.smokeTimer -= dt
      if (player.smokeTimer <= 0) {
        player.smokeTimer = SMOKE_INTERVAL
        this._emitSmoke(player)
      }
    }
    if (player.smokePuffs.length > 0) {
      for (const puff of player.smokePuffs) {
        if (puff.life <= 0) continue
        puff.life -= dt
        if (puff.life <= 0) {
          puff.sprite.visible = false
          continue
        }
        const t = 1 - puff.life / puff.maxLife
        puff.sprite.position.y += dt * 1.6
        const scale = 0.9 + t * 3.2
        puff.sprite.scale.set(scale, scale, 1)
        const mat = puff.sprite.material as THREE.SpriteMaterial
        mat.opacity = (1 - t) * 0.6
      }
    }
  }

  private _emitSmoke(player: RemotePlayer): void {
    const tex = getSmokeTexture()
    if (!tex) return
    let puff = player.smokePuffs.find((p) => p.life <= 0)
    if (!puff) {
      if (player.smokePuffs.length >= MAX_SMOKE_PUFFS) return
      const mat = new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        depthWrite: false,
        opacity: 0.6,
      })
      const sprite = new THREE.Sprite(mat)
      sprite.renderOrder = 900
      this.scene.add(sprite)
      puff = { sprite, life: 0, maxLife: 1.1 }
      player.smokePuffs.push(puff)
    }
    puff.maxLife = 0.9 + Math.random() * 0.5
    puff.life = puff.maxLife
    puff.sprite.visible = true
    puff.sprite.scale.set(0.9, 0.9, 1)
    const p = player.mesh.position
    const y = player.vehicle === 'plane' ? AIRPLANE_FUSELAGE_Y : CAR_H * 0.6
    puff.sprite.position.set(
      p.x + (Math.random() - 0.5) * 0.4,
      p.y + y + (Math.random() - 0.5) * 0.3,
      p.z + (Math.random() - 0.5) * 0.4,
    )
  }

  private _onDestroyed(player: RemotePlayer): void {
    player.hiddenUntil = Date.now() + DESTROYED_HIDE_MS
    player.health = MAX_HEALTH
    player.lastHealthDrawn = -1
    player.collider?.setEnabled(false)
    player.colliderWasEnabled = false
    player.hitCollider?.setEnabled(false)
    const p = player.mesh.position
    this.onPlayerDestroyed?.(player.id, { x: p.x, y: p.y, z: p.z })
  }

  private _createRemotePlayer(id: string, snap: PlayerSnapshot): RemotePlayer {
    const root = new THREE.Group()
    root.name = `remote_player_${id}`
    // Car meshes live in their own group so they can be swapped for a plane
    const group = new THREE.Group()
    group.name = `remote_car_${id}`
    root.add(group)

    const palIdx = hashId(id) % RIVAL_PALETTES.length
    const palette = RIVAL_PALETTES[palIdx]!

    // 1. Aerodynamic Sports Body
    const bodyGeo = new THREE.BoxGeometry(CAR_W, CAR_H * 0.7, CAR_L)
    const bodyMat = new THREE.MeshStandardMaterial({
      color: palette.primary,
      roughness: 0.25,
      metalness: 0.85,
    })
    const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat)
    bodyMesh.position.y = CAR_H * 0.35
    bodyMesh.castShadow = true
    group.add(bodyMesh)

    // 2. Cabin / Greenhouse
    const roofGeo = new THREE.BoxGeometry(CAR_W * 0.82, CAR_H * 0.55, CAR_L * 0.52)
    const roofMat = new THREE.MeshStandardMaterial({
      color: 0x181a20,
      roughness: 0.15,
      metalness: 0.9,
    })
    const roofMesh = new THREE.Mesh(roofGeo, roofMat)
    roofMesh.position.y = CAR_H * 0.82
    roofMesh.position.z = -0.2
    roofMesh.castShadow = true
    group.add(roofMesh)

    // 3. Headlights (Bright Xenon LEDs)
    const lightGeo = new THREE.BoxGeometry(0.38, 0.18, 0.05)
    const lightMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xddeeff,
      emissiveIntensity: 1.2,
    })
    for (const x of [-0.65, 0.65]) {
      const light = new THREE.Mesh(lightGeo, lightMat)
      light.position.set(x, CAR_H * 0.4, CAR_L / 2 + 0.01)
      group.add(light)
    }

    // 4. Tail lights (Neon LED Bar)
    const tailMat = new THREE.MeshStandardMaterial({
      color: 0xff1100,
      emissive: 0xff0000,
      emissiveIntensity: 1.5,
    })
    for (const x of [-0.65, 0.65]) {
      const tail = new THREE.Mesh(lightGeo, tailMat)
      tail.position.set(x, CAR_H * 0.45, -CAR_L / 2 - 0.01)
      group.add(tail)
    }

    // 5. Wheels
    const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 16)
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x151618, roughness: 0.7 })
    const wheelPositions = [
      [-CAR_W / 2 - 0.08, 0.36, CAR_L / 2 - 0.95],
      [CAR_W / 2 + 0.08, 0.36, CAR_L / 2 - 0.95],
      [-CAR_W / 2 - 0.08, 0.36, -CAR_L / 2 + 0.95],
      [CAR_W / 2 + 0.08, 0.36, -CAR_L / 2 + 0.95],
    ] as const

    for (const [wx, wy, wz] of wheelPositions) {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat)
      wheel.rotation.z = Math.PI / 2
      wheel.position.set(wx, wy, wz)
      group.add(wheel)
    }

    // 6. Floating Rival Nametag Badge
    const shortTag = `RIVAL #${id.slice(0, 4).toUpperCase()}`
    const { sprite: nametag, canvas: nametagCanvas, texture: nametagTexture } = createNametagSprite(shortTag, palette.hex)
    nametag.position.y = CAR_NAMETAG_Y
    root.add(nametag)

    // Health bar, just under the nametag (hidden while at full health)
    const healthBar = createHealthBarSprite()
    if (healthBar) {
      healthBar.sprite.position.y = CAR_NAMETAG_Y - 0.42
      root.add(healthBar.sprite)
    }

    root.position.set(snap.position.x, snap.position.y, snap.position.z)
    this.scene.add(root)

    // 7. Rapier Kinematic Rigid Body with Chassis Collider
    let body: RAPIER.RigidBody | null = null
    let collider: RAPIER.Collider | null = null
    if (this.world) {
      const bDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
        .setTranslation(snap.position.x, snap.position.y, snap.position.z)
      body = this.world.createRigidBody(bDesc)

      // Solid chassis box collider matching car shape and elevation
      const chassisDesc = RAPIER.ColliderDesc.cuboid(
        CAR_W / 2 - 0.04,
        0.28,
        CAR_L / 2 - 0.08,
      )
        .setTranslation(0, 0.16, 0)
        .setFriction(0.35)
        .setRestitution(0.3)
      collider = this.world.createCollider(chassisDesc, body)
      this.colliderToPlayer.set(collider.handle, id)
    }

    const buffer = new InterpolationBuffer()
    buffer.addSnapshot(snap)

    const invincibleUntil = snap.invincibleUntil ?? (Date.now() + 30_000)

    const player: RemotePlayer = {
      id,
      mesh: root,
      carVisual: group,
      planeVisual: null,
      vehicle: 'car',
      nametag,
      lastSpeed: 0,
      body,
      collider,
      hitCollider: null,
      health: snap.health !== undefined && Number.isFinite(snap.health)
        ? Math.max(0, Math.min(MAX_HEALTH, snap.health))
        : MAX_HEALTH,
      healthBar,
      lastHealthDrawn: MAX_HEALTH,
      hiddenUntil: 0,
      smokePuffs: [],
      smokeTimer: 0,
      buffer,
      lastSeen: performance.now(),
      invincibleUntil,
      nametagCanvas,
      nametagTexture,
      paletteHex: palette.hex,
      lastTagText: shortTag,
      colliderWasEnabled: true,
    }
    this._rebuildHitCollider(player)
    if (snap.vehicle === 'plane') this._setVehicle(player, 'plane')
    return player
  }

  getPlayerPositions(): Array<{ id: string; x: number; z: number }> {
    const list: Array<{ id: string; x: number; z: number }> = []
    for (const [id, player] of this.players) {
      list.push({ id, x: player.mesh.position.x, z: player.mesh.position.z })
    }
    return list
  }

  dispose(): void {
    for (const [, player] of this.players) {
      this.scene.remove(player.mesh)
      player.planeVisual?.model.dispose()
      player.planeVisual = null
      this._disposeDamageVisuals(player)
      player.hitCollider = null
      if (player.body && this.world) {
        this.world.removeRigidBody(player.body)
      }
    }
    this.players.clear()
    this.colliderToPlayer.clear()
    delete this.onPlayerDestroyed
  }
}

