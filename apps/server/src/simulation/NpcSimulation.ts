/**
 * NpcSimulation — lightweight server-side NPC tick.
 * V1: simple circular patrol, no pathfinding.
 */

import type { WorldPosition } from '@world-drive/math'
import type { NPCSnapshot } from '@world-drive/shared'

type NpcState = {
  id: string
  position: WorldPosition
  rotation: number
  speed: number
  waypoints: WorldPosition[]
  waypointIndex: number
}

export class NpcSimulation {
  private npcs = new Map<string, NpcState>()
  private counter = 0

  spawn(near: WorldPosition): string {
    const id = `npc_${this.counter++}`
    const angle = Math.random() * Math.PI * 2
    const r = 50 + Math.random() * 200
    const pos: WorldPosition = {
      x: near.x + Math.cos(angle) * r,
      y: 0,
      z: near.z + Math.sin(angle) * r,
    }
    const waypoints: WorldPosition[] = Array.from({ length: 6 }, (_, i) => {
      const a = (i / 6) * Math.PI * 2
      const routeR = 30 + Math.random() * 80
      return { x: pos.x + Math.cos(a) * routeR, y: 0, z: pos.z + Math.sin(a) * routeR }
    })
    this.npcs.set(id, { id, position: pos, rotation: 0, speed: 8 + Math.random() * 8, waypoints, waypointIndex: 0 })
    return id
  }

  tick(dt: number): void {
    for (const [, npc] of this.npcs) {
      const target = npc.waypoints[npc.waypointIndex]
      if (!target) continue
      const dx = target.x - npc.position.x
      const dz = target.z - npc.position.z
      const dist = Math.sqrt(dx * dx + dz * dz)
      if (dist < 2) {
        npc.waypointIndex = (npc.waypointIndex + 1) % npc.waypoints.length
        continue
      }
      const step = npc.speed * dt
      npc.position = {
        x: npc.position.x + (dx / dist) * step,
        y: 0,
        z: npc.position.z + (dz / dist) * step,
      }
      npc.rotation = Math.atan2(dx, dz)
    }
  }

  getSnapshots(): NPCSnapshot[] {
    return Array.from(this.npcs.values()).map((n) => ({
      id: n.id,
      position: n.position,
      rotation: { x: 0, y: n.rotation, z: 0 },
      speed: n.speed,
    }))
  }

  get count(): number { return this.npcs.size }
}
