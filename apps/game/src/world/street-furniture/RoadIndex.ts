/**
 * Road spatial index — ribbon test + nearest road orientation.
 */

import type { Road } from '@world-drive/shared'

const NON_VEHICLE = new Set([
  'footway', 'path', 'steps', 'pedestrian', 'cycleway',
  'bridleway', 'corridor', 'platform'
])
const CELL = 24
const ROAD_MARGIN = 1.0

interface Seg {
  x1: number
  z1: number
  dx: number
  dz: number
  lenSq: number
  halfW: number
}

export interface NearestRoad {
  d2: number
  dirX: number
  dirZ: number
  toX: number
  toZ: number
}

export class RoadIndex {
  private cells = new Map<number, Seg[]>()

  constructor(roads: Road[]) {
    for (const r of roads) {
      if (NON_VEHICLE.has(r.highway)) continue
      const lanes = Math.max(1, r.lanes || 1)
      const width = r.explicitWidth && r.explicitWidth >= 3 ? r.explicitWidth : lanes * 3.6
      const halfW = width / 2 + ROAD_MARGIN
      const pts = r.points
      for (let i = 0; i + 1 < pts.length; i++) {
        const a = pts[i]!
        const b = pts[i + 1]!
        const dx = b.x - a.x
        const dz = b.z - a.z
        const lenSq = dx * dx + dz * dz
        if (lenSq < 1e-4) continue
        const seg: Seg = { x1: a.x, z1: a.z, dx, dz, lenSq, halfW }
        const pad = halfW + 1.5
        const cx0 = Math.floor((Math.min(a.x, b.x) - pad) / CELL)
        const cx1 = Math.floor((Math.max(a.x, b.x) + pad) / CELL)
        const cz0 = Math.floor((Math.min(a.z, b.z) - pad) / CELL)
        const cz1 = Math.floor((Math.max(a.z, b.z) + pad) / CELL)
        for (let cx = cx0; cx <= cx1; cx++) {
          for (let cz = cz0; cz <= cz1; cz++) {
            const k = RoadIndex.key(cx, cz)
            let list = this.cells.get(k)
            if (!list) {
              list = []
              this.cells.set(k, list)
            }
            list.push(seg)
          }
        }
      }
    }
  }

  private static key(cx: number, cz: number): number {
    return (cx + 1048576) * 2097152 + (cz + 1048576)
  }

  /** True when (x,z) lies inside a road ribbon (half width + margin). */
  insideRoad(x: number, z: number): boolean {
    const list = this.cells.get(RoadIndex.key(Math.floor(x / CELL), Math.floor(z / CELL)))
    if (!list) return false
    for (let i = 0; i < list.length; i++) {
      const s = list[i]!
      let t = ((x - s.x1) * s.dx + (z - s.z1) * s.dz) / s.lenSq
      t = t < 0 ? 0 : t > 1 ? 1 : t
      const px = s.x1 + t * s.dx - x
      const pz = s.z1 + t * s.dz - z
      if (px * px + pz * pz < s.halfW * s.halfW) return true
    }
    return false
  }

  /** Nearest road within ~24 m, or null. */
  nearest(x: number, z: number): NearestRoad | null {
    const cx = Math.floor(x / CELL)
    const cz = Math.floor(z / CELL)
    let best: Seg | null = null
    let bestD2 = Infinity
    let bx = 0
    let bz = 0
    for (let ix = -1; ix <= 1; ix++) {
      for (let iz = -1; iz <= 1; iz++) {
        const list = this.cells.get(RoadIndex.key(cx + ix, cz + iz))
        if (!list) continue
        for (let i = 0; i < list.length; i++) {
          const s = list[i]!
          let t = ((x - s.x1) * s.dx + (z - s.z1) * s.dz) / s.lenSq
          t = t < 0 ? 0 : t > 1 ? 1 : t
          const px = s.x1 + t * s.dx - x
          const pz = s.z1 + t * s.dz - z
          const d2 = px * px + pz * pz
          if (d2 < bestD2) {
            bestD2 = d2
            best = s
            bx = px
            bz = pz
          }
        }
      }
    }
    if (!best) return null
    const len = Math.sqrt(best.lenSq)
    const d = Math.sqrt(bestD2)
    return {
      d2: bestD2,
      dirX: best.dx / len,
      dirZ: best.dz / len,
      toX: d > 1e-3 ? bx / d : 0,
      toZ: d > 1e-3 ? bz / d : 1,
    }
  }
}