/**
 * RemotePlayerManager — manages 3D visual cars (or planes), nametags,
 * interpolation, and Rapier physical colliders for other multiplayer players.
 */

import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import type { PlayerSnapshot } from '@world-drive/shared'
import { InterpolationBuffer } from '../networking/InterpolationBuffer.js'
import { createTwoSeatAirplane, AIRPLANE_MAIN_WHEEL_Z } from './AirplaneModel.js'

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
      if (player.body && this.world) {
        this.world.removeRigidBody(player.body)
      }
      this.players.delete(id)
    }
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
      buffer,
      lastSeen: performance.now(),
      invincibleUntil,
      nametagCanvas,
      nametagTexture,
      paletteHex: palette.hex,
      lastTagText: shortTag,
      colliderWasEnabled: true,
    }
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
      if (player.body && this.world) {
        this.world.removeRigidBody(player.body)
      }
    }
    this.players.clear()
  }
}

