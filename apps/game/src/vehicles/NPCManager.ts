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

const MAX_NPCS = 0
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
  tick(_dt: number): void {
    // NPCs completely disabled per user request
    if (this.npcs.size > 0) {
      this.clear()
    }
  }

  /**
   * Called by GameClient when server sends NPC snapshots.
   */
  spawnOrUpdate(
    _id: string,
    _position: WorldPosition,
    _waypoints?: WorldPosition[],
  ): void {
    // NPCs disabled
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
  ensurePopulated(_playerPos: WorldPosition, _activeRoads?: Road[]): void {
    // NPCs disabled
  }

  despawnDistant(_playerPos: WorldPosition): void {
    // NPCs disabled
  }

  clear(): void {
    for (const [, npc] of this.npcs) {
      npc.dispose()
    }
    this.npcs.clear()
  }

  get activeCount(): number {
    return 0
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
