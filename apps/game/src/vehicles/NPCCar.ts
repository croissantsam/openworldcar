/**
 * NPCCar — a simple traffic vehicle that follows the road graph.
 *
 * For V1, NPCs use direct position interpolation (not Rapier physics)
 * to keep simulation cost low for many vehicles.
 */

import * as THREE from 'three'
import type { WorldPosition } from '@world-drive/math'

// Shared NPC geometry and materials (instancing benefit)
const NPC_GEO = new THREE.BoxGeometry(2.0, 1.2, 4.0)
const NPC_MATS = [
  new THREE.MeshLambertMaterial({ color: 0xe03030 }),
  new THREE.MeshLambertMaterial({ color: 0x30a030 }),
  new THREE.MeshLambertMaterial({ color: 0xe0e030 }),
  new THREE.MeshLambertMaterial({ color: 0xe07030 }),
  new THREE.MeshLambertMaterial({ color: 0xffffff }),
]

export class NPCCar {
  readonly id: string
  mesh: THREE.Mesh
  private scene: THREE.Scene

  /** Road waypoints this NPC follows. */
  private waypoints: WorldPosition[] = []
  private waypointIndex = 0
  private speed: number

  constructor(id: string, scene: THREE.Scene, startPos: WorldPosition) {
    this.id = id
    this.scene = scene
    this.speed = 8 + Math.random() * 10 // 8–18 m/s

    const mat = NPC_MATS[Math.floor(Math.random() * NPC_MATS.length)]!
    this.mesh = new THREE.Mesh(NPC_GEO, mat)
    this.mesh.position.set(startPos.x, startPos.y + 0.7, startPos.z)
    this.mesh.castShadow = true
    scene.add(this.mesh)
  }

  setWaypoints(waypoints: WorldPosition[]): void {
    this.waypoints = waypoints
    this.waypointIndex = 0
  }

  tick(dt: number): void {
    if (this.waypoints.length === 0) return

    const target = this.waypoints[this.waypointIndex]
    if (!target) return

    const dx = target.x - this.mesh.position.x
    const dz = target.z - this.mesh.position.z
    const dist = Math.sqrt(dx * dx + dz * dz)

    if (dist < 1.0) {
      // Reached waypoint — advance
      this.waypointIndex = (this.waypointIndex + 1) % this.waypoints.length
      return
    }

    // Move toward target
    const step = this.speed * dt
    const nx = (dx / dist) * step
    const nz = (dz / dist) * step

    this.mesh.position.x += nx
    this.mesh.position.z += nz

    // Face direction of travel
    this.mesh.rotation.y = Math.atan2(dx, dz)
  }

  getPosition(): WorldPosition {
    return {
      x: this.mesh.position.x,
      y: this.mesh.position.y,
      z: this.mesh.position.z,
    }
  }

  dispose(): void {
    this.scene.remove(this.mesh)
  }
}
