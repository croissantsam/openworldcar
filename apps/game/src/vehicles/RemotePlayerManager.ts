/**
 * RemotePlayerManager — manages 3D visual cars and interpolation for other multiplayer players.
 */

import * as THREE from 'three'
import type { PlayerSnapshot } from '@world-drive/shared'
import { InterpolationBuffer } from '../networking/InterpolationBuffer.js'

// Visual dimensions matching PlayerCar
const CAR_W = 2.0
const CAR_H = 1.2
const CAR_L = 4.5

type RemotePlayer = {
  id: string
  mesh: THREE.Group
  buffer: InterpolationBuffer
  lastSeen: number
}

export class RemotePlayerManager {
  private scene: THREE.Scene
  private players = new Map<string, RemotePlayer>()

  constructor(scene: THREE.Scene) {
    this.scene = scene
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
      }
    }
  }

  removePlayer(id: string): void {
    const player = this.players.get(id)
    if (player) {
      this.scene.remove(player.mesh)
      this.players.delete(id)
    }
  }

  private _createRemotePlayer(id: string, snap: PlayerSnapshot): RemotePlayer {
    const group = new THREE.Group()
    group.name = `remote_player_${id}`

    // Distinct orange/red sports body for other players
    const bodyGeo = new THREE.BoxGeometry(CAR_W, CAR_H, CAR_L)
    const bodyMat = new THREE.MeshPhongMaterial({
      color: 0xff5500, // Vibrant orange for multiplayer rivals
      shininess: 100,
      specular: 0xffaa44,
    })
    const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat)
    bodyMesh.castShadow = true
    group.add(bodyMesh)

    // Cabin
    const roofGeo = new THREE.BoxGeometry(CAR_W * 0.85, CAR_H * 0.6, CAR_L * 0.55)
    const roofMat = new THREE.MeshPhongMaterial({ color: 0xcc3300, shininess: 80 })
    const roofMesh = new THREE.Mesh(roofGeo, roofMat)
    roofMesh.position.y = CAR_H * 0.8
    roofMesh.position.z = -0.3
    group.add(roofMesh)

    // Headlights
    const lightGeo = new THREE.BoxGeometry(0.4, 0.2, 0.05)
    const lightMat = new THREE.MeshPhongMaterial({ color: 0xffffcc, emissive: 0xffffcc, emissiveIntensity: 0.9 })
    for (const x of [-0.6, 0.6]) {
      const light = new THREE.Mesh(lightGeo, lightMat)
      light.position.set(x, 0, CAR_L / 2)
      group.add(light)
    }

    // Tail lights
    const tailMat = new THREE.MeshPhongMaterial({ color: 0xff1100, emissive: 0xff1100, emissiveIntensity: 0.7 })
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
      group.add(wheel)
    }

    group.position.set(snap.position.x, snap.position.y, snap.position.z)
    this.scene.add(group)

    const buffer = new InterpolationBuffer()
    buffer.addSnapshot(snap)

    return {
      id,
      mesh: group,
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
    }
    this.players.clear()
  }
}
