import * as THREE from 'three'
import { analyseJunctions, type JunctionInfo } from './junction.js'
import { computePolylineNormals, type Pt, type PolylineNormal, type EndNormals, type Vec2 } from './geometry.js'
import { outwardTangent, distToWay, unitBetween, endPoint, isPointInRoadAsphalt } from './junction.js'
import { computeRoadWidth } from './road-width.js'

export function extendArmEnds(pts: Pt[], junction: JunctionInfo): Pt[] {
  let out = pts
  for (const e of [0, 1] as const) {
    const je = junction.ends[e]
    if (!je.landsOn || je.partner) continue
    const N = e === 0 ? out[0]! : out[out.length - 1]!
    const q = distToWay(je.landsOn, N.x, N.z)
    if (q.d < 0.3 || q.d > computeRoadWidth(je.landsOn as any).halfW + 1.0) continue
    const p = { x: q.x, y: N.y, z: q.z }
    out = e === 0 ? [p, ...out] : [...out, p]
  }
  return out
}

export function continuationEndNormals(pts: Pt[], junction: JunctionInfo): EndNormals | undefined {
  const n = pts.length
  if (n < 2) return undefined
  const res: EndNormals = {}
  const s = junction.ends[0]
  if (s.partnerOut) {
    const d2 = unitBetween(pts[0]!, pts[1]!)
    res.start = { nx: -d2.z, nz: d2.x, miter: 1.0 }
  }
  const e = junction.ends[1]
  if (e.partnerOut) {
    const d1 = unitBetween(pts[n - 2]!, pts[n - 1]!)
    res.end = { nx: -d1.z, nz: d1.x, miter: 1.0 }
  }
  return res.start || res.end ? res : undefined
}

export function clampArmEndPoke(mesh: THREE.Mesh, pts: Pt[], junction: JunctionInfo, obstacles: any[], skip: [boolean, boolean]): void {
  const pos = mesh.geometry.attributes['position'] as THREE.BufferAttribute | undefined
  if (!pos) return
  const arr = pos.array as Float32Array
  const n = pts.length
  if (n < 2 || arr.length < n * 6) return
  let changed = false
  for (const e of [0, 1] as const) {
    const je = junction.ends[e]
    if (!je.landsOn || je.partner || skip[e]) continue
    const landsOnId = je.landsOn.id
    const segs = obstacles.filter((o) => o.roadId === landsOnId)
    if (segs.length === 0) continue
    const o = e === 0 ? unitBetween(pts[0]!, pts[1]!) : unitBetween(pts[n - 1]!, pts[n - 2]!)
    const base = e === 0 ? 0 : (n - 1) * 2
    for (let v = base; v < base + 2; v++) {
      const vi = v * 3
      const x = arr[vi]!
      const z = arr[vi + 2]!
      if (isPointInRoadAsphalt(x, z, segs, 0.0)) continue
      let found = -1
      for (let d = 0.1; d <= 1.7; d += 0.1) {
        if (isPointInRoadAsphalt(x + o.x * d, z + o.z * d, segs, 0.0)) { found = d; break }
      }
      if (found < 0) continue
      let lo = found - 0.1
      let hi = found
      for (let k = 0; k < 6; k++) {
        const mid = (lo + hi) / 2
        if (isPointInRoadAsphalt(x + o.x * mid, z + o.z * mid, segs, 0.0)) hi = mid
        else lo = mid
      }
      arr[vi] = x + o.x * hi
      arr[vi + 2] = z + o.z * hi
      changed = true
    }
  }
  if (changed) {
    pos.needsUpdate = true
    mesh.geometry.computeVertexNormals()
  }
}