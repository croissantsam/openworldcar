/**
 * PhysicsSimulation — server-side Rapier world for authoritative player physics.
 *
 * V1: one world per game server (single region).
 */

import RAPIER from '@dimforge/rapier3d-compat'
import type { PlayerInput } from '@world-drive/protocol'
import type { WorldPosition } from '@world-drive/math'

const FIXED_DT = 1 / 60

type PhysicsPlayer = {
  body: RAPIER.RigidBody
}

export class PhysicsSimulation {
  private world!: RAPIER.World
  private players = new Map<string, PhysicsPlayer>()
  private initialised = false

  async init(): Promise<void> {
    await RAPIER.init()
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })

    // Static ground
    const ground = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed())
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(5000, 0.1, 5000), ground)

    this.initialised = true
  }

  addPlayer(id: string, spawnPos: WorldPosition): void {
    if (!this.initialised) return
    const desc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(spawnPos.x, spawnPos.y + 1.5, spawnPos.z)
      .setLinearDamping(0.3)
      .setAngularDamping(4.0)
    const body = this.world.createRigidBody(desc)
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(1, 0.6, 2.25).setMass(1200), body)
    this.players.set(id, { body })
  }

  removePlayer(id: string): void {
    const p = this.players.get(id)
    if (p) {
      this.world.removeRigidBody(p.body)
      this.players.delete(id)
    }
  }

  applyInput(id: string, input: PlayerInput): void {
    const p = this.players.get(id)
    if (!p) return

    const vel = p.body.linvel()
    const speed = Math.sqrt(vel.x * vel.x + vel.z * vel.z)
    const rot = p.body.rotation()
    const q = new (class extends Float32Array {
      get x() { return this[0]! } get y() { return this[1]! }
      get z() { return this[2]! } get w() { return this[3]! }
    })(4)
    // Simple forward force along body Z
    const yaw = 2 * Math.asin(rot.y)
    const fz = Math.cos(yaw) * input.throttle * 120
    const fx = Math.sin(yaw) * input.throttle * 120
    if (speed < 60) p.body.applyImpulse({ x: fx, y: 0, z: fz }, true)
    // Reverse flips the yaw response (rear follows the wheel), like the client.
    const forwardSpeed = vel.x * Math.sin(yaw) + vel.z * Math.cos(yaw)
    const travelDir = forwardSpeed >= 0 ? 1 : -1
    p.body.applyTorqueImpulse({ x: 0, y: input.steering * 60 * (speed / 60 + 0.15) * travelDir, z: 0 }, true)
  }

  updatePlayerState(
    id: string,
    pos: WorldPosition,
    rot: { x: number; y: number; z: number; w?: number },
    vel: { x: number; y: number; z: number },
  ): void {
    const p = this.players.get(id)
    if (!p) return
    p.body.setTranslation({ x: pos.x, y: pos.y, z: pos.z }, true)
    if (rot.w !== undefined) {
      p.body.setRotation({ x: rot.x, y: rot.y, z: rot.z, w: rot.w }, true)
    }
    p.body.setLinvel({ x: vel.x, y: vel.y, z: vel.z }, true)
  }

  step(): void {
    if (!this.initialised) return
    this.world.step()
  }

  getPosition(id: string): WorldPosition | null {
    const p = this.players.get(id)
    if (!p) return null
    const t = p.body.translation()
    return { x: t.x, y: t.y, z: t.z }
  }

  getRotation(id: string): { x: number; y: number; z: number } {
    const p = this.players.get(id)
    if (!p) return { x: 0, y: 0, z: 0 }
    const r = p.body.rotation()
    return { x: r.x, y: r.y, z: r.z }
  }

  getVelocity(id: string): { x: number; y: number; z: number } {
    const p = this.players.get(id)
    if (!p) return { x: 0, y: 0, z: 0 }
    const v = p.body.linvel()
    return { x: v.x, y: v.y, z: v.z }
  }
}
