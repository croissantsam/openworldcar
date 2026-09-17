/**
 * LODManager — generic Level-of-Detail controller.
 *
 * Objects register themselves with a world position.
 * Each frame, the manager updates their LOD state based on distance to the camera.
 */

import type { WorldPosition } from '@world-drive/math'

export const LOD_LEVELS = {
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW',
  HIDDEN: 'HIDDEN',
} as const

export type LODLevel = keyof typeof LOD_LEVELS

/** Configurable distance thresholds. */
export const LOD_DISTANCES = {
  HIGH: 200,    // 0 – 200 m
  MEDIUM: 800,  // 200 – 800 m
  LOW: 1500,    // 800 – 1500 m
  // beyond 1500 m → HIDDEN
}

export type LODObject = {
  position: WorldPosition
  onLODChange: (level: LODLevel) => void
}

export class LODManager {
  private objects = new Map<string, LODObject & { currentLevel: LODLevel }>()

  register(id: string, obj: LODObject): void {
    this.objects.set(id, { ...obj, currentLevel: 'HIGH' })
  }

  unregister(id: string): void {
    this.objects.delete(id)
  }

  update(viewerPosition: WorldPosition): void {
    for (const [, obj] of this.objects) {
      const dx = obj.position.x - viewerPosition.x
      const dz = obj.position.z - viewerPosition.z
      const dist = Math.sqrt(dx * dx + dz * dz)

      let level: LODLevel
      if (dist < LOD_DISTANCES.HIGH) {
        level = 'HIGH'
      } else if (dist < LOD_DISTANCES.MEDIUM) {
        level = 'MEDIUM'
      } else if (dist < LOD_DISTANCES.LOW) {
        level = 'LOW'
      } else {
        level = 'HIDDEN'
      }

      if (level !== obj.currentLevel) {
        obj.currentLevel = level
        obj.onLODChange(level)
      }
    }
  }

  clear(): void {
    this.objects.clear()
  }
}
