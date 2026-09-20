import { computePolylineNormals, type Pt, type PolylineNormal, type EndNormals, type Vec2 } from './geometry.js'
import { distToWay, unitBetween, outwardTangent, isPointInRoadAsphalt } from './junction.js'
import type { JunctionInfo, RoadObstacleSeg } from './junction.js'
import { computeRoadWidth } from './road-width.js'
import { getAsphaltMaterial } from './materials.js'

export function armAsphaltGeometry(
  pts: Pt[],
  junction: JunctionInfo,
  halfW: number,
  obstacles: RoadObstacleSeg[],
  endNormals: EndNormals | undefined,
): { pts: Pt[]; normals: PolylineNormal[]; trapezoid: [boolean, boolean] } {
  let work = pts.slice()
  const trapezoid: [boolean, boolean] = [false, false]
  const overrides: { start?: PolylineNormal; end?: PolylineNormal } = {}

  for (const e of [1, 0] as const) {
    const je = junction.ends[e]
    if (!je.landsOn || je.partner || work.length < 3) continue
    const T = je.landsOn
    const n = work.length
    const N = e === 0 ? work[0]! : work[n - 1]!
    const segs = obstacles.filter((o) => {
      if (o.roadId === T.id) return true
      let t = ((N.x - o.x1) * o.dx + (N.z - o.z1) * o.dz) / o.lenSq
      t = Math.max(0, Math.min(1, t))
      return Math.hypot(N.x - (o.x1 + o.dx * t), N.z - (o.z1 + o.dz * t)) < 1.0
    })
    if (segs.length === 0) continue
    const q = distToWay(T as any, N.x, N.z)
    let i = 0
    let acc = 0
    for (; i < T.points.length - 2; i++) {
      const segL = Math.hypot(T.points[i + 1]!.x - T.points[i]!.x, T.points[i + 1]!.z - T.points[i]!.z)
      if (acc + segL >= q.arc) break
      acc += segL
    }
    const dT = unitBetween(T.points[i]!, T.points[i + 1]!)
    const hT = computeRoadWidth(T as any).halfW
    const d = e === 0 ? unitBetween(work[0]!, work[1]!) : unitBetween(work[n - 2]!, work[n - 1]!)
    const sinTheta = Math.abs(d.x * dT.z - d.z * dT.x)
    if (sinTheta < 0.42) continue
    const armDir: Vec2 = e === 0 ? d : { x: -d.x, z: -d.z }
    const nT: Vec2 = { x: -dT.z, z: dT.x }
    const sigma = armDir.x * nT.x + armDir.z * nT.z >= 0 ? 1 : -1
    const P0: Vec2 = { x: q.x + nT.x * sigma * (hT - 0.08), z: q.z + nT.z * sigma * (hT - 0.08) }
    const nA: Vec2 = { x: -d.z, z: d.x }
    const hits: { t: number; x: number; z: number }[] = []
    for (const s of [1, -1]) {
      const Q0: Vec2 = { x: N.x + nA.x * s * halfW, z: N.z + nA.z * s * halfW }
      const h = lineIntersect(Q0, d, P0, dT)
      if (!h) break
      hits.push({ t: h.t, x: h.x, z: h.z })
    }
    if (hits.length < 2) continue
    const [hp, hm] = hits as [{ t: number; x: number; z: number }, { t: number; x: number; z: number }]
    if (!isPointInRoadAsphalt(hp.x, hp.z, segs, 0.3) || !isPointInRoadAsphalt(hm.x, hm.z, segs, 0.3)) continue

    const arcs: number[] = [0]
    for (let k = 1; k < n; k++) arcs.push(arcs[k - 1]! + Math.hypot(work[k]!.x - work[k - 1]!.x, work[k]!.z - work[k - 1]!.z))
    const L = arcs[n - 1]!
    const base: Pt = { x: (hp.x + hm.x) / 2, y: N.y, z: (hp.z + hm.z) / 2 }
    const span = Math.hypot(hp.x - hm.x, hp.z - hm.z)
    if (span < halfW) continue
    const endN: PolylineNormal = { nx: (hp.x - hm.x) / span, nz: (hp.z - hm.z) / span, miter: span / (2 * halfW) }

    if (e === 1) {
      if (hp.t > 0.05 || hm.t > 0.05) continue
      const cutArc = L + Math.min(hp.t, hm.t) - 0.2
      if (cutArc < 1.0) continue
      let k = 0
      while (k < n - 1 && arcs[k + 1]! < cutArc) k++
      const a = work[k]!; const b = work[k + 1]!
      const segL = arcs[k + 1]! - arcs[k]!
      const t = segL > 1e-6 ? (cutArc - arcs[k]!) / segL : 0
      const cut: Pt = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t }
      work = work.slice(0, k + 1)
      work.push(cut, base)
      overrides.end = endN
      trapezoid[1] = true
    } else {
      if (hp.t < -0.05 || hm.t < -0.05) continue
      const cutArc = Math.max(hp.t, hm.t) + 0.2
      if (cutArc > L - 1.0) continue
      let k = 0
      while (k < n - 1 && arcs[k + 1]! < cutArc) k++
      const a = work[k]!; const b = work[k + 1]!
      const segL = arcs[k + 1]! - arcs[k]!
      const t = segL > 1e-6 ? (cutArc - arcs[k]!) / segL : 0
      const cut: Pt = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t }
      work = [base, cut, ...work.slice(k + 1)]
      overrides.start = endN
      trapezoid[0] = true
    }
  }

  const merged: EndNormals = {}
  const st = overrides.start ?? endNormals?.start
  const en = overrides.end ?? endNormals?.end
  if (st) merged.start = st
  if (en) merged.end = en
  return { pts: work, normals: computePolylineNormals(work, merged), trapezoid }
}

function lineIntersect(P: Vec2, a: Vec2, Q: Vec2, b: Vec2): { t: number; u: number; x: number; z: number } | null {
  const det = a.x * (-b.z) - (-b.x) * a.z
  if (Math.abs(det) < 1e-6) return null
  const rx = Q.x - P.x
  const rz = Q.z - P.z
  const t = (rx * (-b.z) - (-b.x) * rz) / det
  const u = (a.x * rz - a.z * rx) / det
  return { t, u, x: P.x + a.x * t, z: P.z + a.z * t }
}