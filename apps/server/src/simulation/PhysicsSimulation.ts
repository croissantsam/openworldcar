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
    const fz = Math.cos(2 * Math.asin(rot.y)) * input.throttle * 120
    const fx = Math.sin(2 * Math.asin(rot.y)) * input.throttle * 120
    if (speed < 60) p.body.applyImpulse({ x: fx, y: 0, z: fz }, true)
    p.body.applyTorqueImpulse({ x: 0, y: input.steering * 60 * (speed / 60 + 0.15), z: 0 }, true)
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
