/**
 * RemotePlayerManager — manages 3D visual cars, nametags, interpolation,
 * and Rapier physical colliders for other multiplayer players.
 */

import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import type { PlayerSnapshot } from '@world-drive/shared'
import { InterpolationBuffer } from '../networking/InterpolationBuffer.js'

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

function createNametagSprite(title: string, borderColor: string): THREE.Sprite {
  if (typeof document === 'undefined') {
    return new THREE.Sprite()
  }
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 64
  const ctx = canvas.getContext('2d')!

  ctx.fillStyle = 'rgba(12, 14, 18, 0.88)'
  ctx.beginPath()
  ctx.roundRect(12, 10, 232, 44, 22)
  ctx.fill()

  ctx.strokeStyle = borderColor
  ctx.lineWidth = 3
  ctx.stroke()

  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 22px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(title, 128, 32)

  const tex = new THREE.CanvasTexture(canvas)
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false })
  const sprite = new THREE.Sprite(mat)
  sprite.scale.set(2.4, 0.6, 1)
  sprite.position.set(0, 2.2, 0)
  sprite.renderOrder = 999
  return sprite
}

type RemotePlayer = {
  id: string
  mesh: THREE.Group
  body: RAPIER.RigidBody | null
  buffer: InterpolationBuffer
  lastSeen: number
}

export class RemotePlayerManager {
  private scene: THREE.Scene
  private world: RAPIER.World | undefined
  private players = new Map<string, RemotePlayer>()

  constructor(scene: THREE.Scene, world?: RAPIER.World | undefined) {
    this.scene = scene
    this.world = world
  }

  setPhysicsWorld(world: RAPIER.World): void {
    this.world = world
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
      }

      player.buffer.addSnapshot(snap)
      player.lastSeen = now
    }
  }

  /**
   * Called every frame in the render loop.
   */
  update(_dt: number): void {
    const now = performance.now()

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
    }
  }

  removePlayer(id: string): void {
    const player = this.players.get(id)
    if (player) {
      this.scene.remove(player.mesh)
      if (player.body && this.world) {
        this.world.removeRigidBody(player.body)
      }
      this.players.delete(id)
    }
  }

  private _createRemotePlayer(id: string, snap: PlayerSnapshot): RemotePlayer {
    const group = new THREE.Group()
    group.name = `remote_player_${id}`

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
    const nametag = createNametagSprite(shortTag, palette.hex)
    group.add(nametag)

    group.position.set(snap.position.x, snap.position.y, snap.position.z)
    this.scene.add(group)

    // 7. Rapier Kinematic Rigid Body with Chassis Collider
    let body: RAPIER.RigidBody | null = null
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
      this.world.createCollider(chassisDesc, body)
    }

    const buffer = new InterpolationBuffer()
    buffer.addSnapshot(snap)

    return {
      id,
      mesh: group,
      body,
      buffer,
      lastSeen: performance.now(),
    }
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
      if (player.body && this.world) {
        this.world.removeRigidBody(player.body)
      }
    }
    this.players.clear()
  }
}

