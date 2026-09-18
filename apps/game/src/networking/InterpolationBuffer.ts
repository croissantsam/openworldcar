/**
 * InterpolationBuffer — smooth rendering of remote player positions.
 *
 * Maintains a time-ordered buffer of server snapshots.
 * Renders the interpolated state at (serverTime - bufferDelay).
 */

import * as THREE from 'three'
import type { PlayerSnapshot } from '@world-drive/shared'

type BufferedSnapshot = {
  snap: PlayerSnapshot
  receivedAt: number
}

const BUFFER_DELAY_MS = 100 // ms behind current time for smooth interpolation

function toQuaternion(rot: { x: number; y: number; z: number; w?: number }): THREE.Quaternion {
  if (typeof rot.w === 'number') {
    return new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w)
  }
  return new THREE.Quaternion().setFromEuler(
    new THREE.Euler(rot.x, rot.y, rot.z, 'YXZ'),
  )
}

export class InterpolationBuffer {
  private snapshots: BufferedSnapshot[] = []

  addSnapshot(snap: PlayerSnapshot): void {
    const now = performance.now()
    this.snapshots.push({ snap, receivedAt: now })

    // Keep at most 32 snapshots
    if (this.snapshots.length > 32) {
      this.snapshots.shift()
    }
  }

  /**
   * Get the interpolated position at renderTime (performance.now()).
   */
  getInterpolated(renderTime: number): {
    position: THREE.Vector3
    quaternion: THREE.Quaternion
  } | null {
    if (this.snapshots.length === 0) return null

    if (this.snapshots.length === 1) {
      const s = this.snapshots[0]!.snap
      return {
        position: new THREE.Vector3(s.position.x, s.position.y, s.position.z),
        quaternion: toQuaternion(s.rotation),
      }
    }

    const targetTime = renderTime - BUFFER_DELAY_MS

    // Find two snapshots surrounding targetTime
    let before: BufferedSnapshot | null = null
    let after: BufferedSnapshot | null = null

    for (let i = 0; i < this.snapshots.length - 1; i++) {
      const a = this.snapshots[i]!
      const b = this.snapshots[i + 1]!
      if (a.receivedAt <= targetTime && b.receivedAt >= targetTime) {
        before = a
        after = b
        break
      }
    }

    if (!before || !after) {
      // Use latest snapshot
      const latest = this.snapshots[this.snapshots.length - 1]!.snap
      return {
        position: new THREE.Vector3(
          latest.position.x,
          latest.position.y,
          latest.position.z,
        ),
        quaternion: toQuaternion(latest.rotation),
      }
    }

    const span = after.receivedAt - before.receivedAt
    const t = span > 0 ? Math.max(0, Math.min(1, (targetTime - before.receivedAt) / span)) : 1

    const posA = before.snap.position
    const posB = after.snap.position

    const pos = new THREE.Vector3(
      posA.x + (posB.x - posA.x) * t,
      posA.y + (posB.y - posA.y) * t,
      posA.z + (posB.z - posA.z) * t,
    )

    const rotA = before.snap.rotation
    const rotB = after.snap.rotation

    const qA = toQuaternion(rotA)
    const qB = toQuaternion(rotB)
    const q = qA.slerp(qB, t)

    return { position: pos, quaternion: q }
  }

  clear(): void {
    this.snapshots = []
  }
}

