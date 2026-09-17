/**
 * NPCManager — spawn/despawn NPC vehicles around the player.
 *
 * For V1, NPCs patrol small random circuits on simple road-like paths.
 * Will use the RoadGraph in Phase 5.
 */

import * as THREE from 'three'
import type { WorldPosition } from '@world-drive/math'
import type { Road } from '@world-drive/shared'
import { NPCCar } from './NPCCar.js'

const MAX_NPCS = 25
const SPAWN_RADIUS = 350 // spawn within this radius of player
const DESPAWN_RADIUS = 500

let _npcCounter = 0

export class NPCManager {
  private scene: THREE.Scene
  private npcs = new Map<string, NPCCar>()

  constructor(scene: THREE.Scene) {
    this.scene = scene
  }

  /**
   * Tick all active NPCs.
   * Called once per physics tick (fixed dt).
   */
  tick(dt: number): void {
    for (const [, npc] of this.npcs) {
      npc.tick(dt)
    }
  }

  /**
   * Called by GameClient when server sends NPC snapshots.
   */
  spawnOrUpdate(
    id: string,
    position: WorldPosition,
    waypoints?: WorldPosition[],
  ): void {
    if (this.npcs.has(id)) {
      return
    }
    if (this.npcs.size >= MAX_NPCS) return

    const npc = new NPCCar(id, this.scene, position)
    if (waypoints) npc.setWaypoints(waypoints)
    this.npcs.set(id, npc)
  }

  despawn(id: string): void {
    const npc = this.npcs.get(id)
    if (npc) {
      npc.dispose()
      this.npcs.delete(id)
    }
  }

  /**
   * Ensure NPCs are spawned on real roads near the player.
   */
  ensurePopulated(playerPos: WorldPosition, activeRoads?: Road[]): void {
    if (this.npcs.size >= MAX_NPCS) return

    if (activeRoads && activeRoads.length > 0) {
      // Find roads near the player
      const candidates = activeRoads.filter((r) => {
        if (r.points.length < 2) return false
        const p = r.points[0]!
        const dx = p.x - playerPos.x
        const dz = p.z - playerPos.z
        const d = Math.sqrt(dx * dx + dz * dz)
        return d > 30 && d < SPAWN_RADIUS
      })

      if (candidates.length > 0) {
        const road = candidates[Math.floor(Math.random() * candidates.length)]!
        const waypoints: WorldPosition[] = road.points.map((p) => ({
          x: p.x,
          y: p.y + 0.1,
          z: p.z,
        }))

        // Allow bidirectional flow
        if (Math.random() > 0.5 && road.highway !== 'motorway') {
          waypoints.reverse()
        }

        const id = `npc_${_npcCounter++}`
        this.spawnOrUpdate(id, waypoints[0]!, waypoints)
        return
      }
    }

    // Fallback if roads are still loading
    const id = `npc_${_npcCounter++}`
    const angle = Math.random() * Math.PI * 2
    const r = 80 + Math.random() * 150
    const spawnPos: WorldPosition = {
      x: playerPos.x + Math.cos(angle) * r,
      y: 0,
      z: playerPos.z + Math.sin(angle) * r,
    }

    const waypoints: WorldPosition[] = Array.from({ length: 6 }, (_, i) => {
      const a = (i / 6) * Math.PI * 2
      const routeR = 40 + Math.random() * 60
      return {
        x: spawnPos.x + Math.cos(a) * routeR,
        y: 0,
        z: spawnPos.z + Math.sin(a) * routeR,
      }
    })

    this.spawnOrUpdate(id, spawnPos, waypoints)
  }

  despawnDistant(playerPos: WorldPosition): void {
    for (const [id, npc] of this.npcs) {
      const p = npc.getPosition()
      const dx = p.x - playerPos.x
      const dz = p.z - playerPos.z
      if (Math.sqrt(dx * dx + dz * dz) > DESPAWN_RADIUS) {
        this.despawn(id)
      }
    }
  }

  get activeCount(): number {
    return this.npcs.size
  }

  processMessages(
    _npcSnapshots: Array<{ id: string; position: WorldPosition }>,
  ): void {
    // Phase 6: apply server NPC snapshots
  }

  getNPCPositions(): WorldPosition[] {
    const list: WorldPosition[] = []
    for (const [, npc] of this.npcs) {
      list.push(npc.getPosition())
    }
    return list
  }
}
