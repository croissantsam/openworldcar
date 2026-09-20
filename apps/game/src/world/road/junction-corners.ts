import * as THREE from 'three'
import { CURB_WIDTH, SIDEWALK_HEIGHT, SIDEWALK_MAT, CURB_MAT, sideSign, hasSidewalkSide, sidewalkWidthOf, elevClass, isDrivableWay } from './materials.js'
import { computeRoadWidth } from './road-width.js'
import { getAsphaltMaterial } from './materials.js'
import { computePolylineNormals, type Pt, type Vec2 } from './geometry.js'
import { outwardTangent, distToWay, unitBetween, endPoint } from './junction.js'
import { analyseJunctions, type JunctionInfo, type RoadObstacleSeg, isPointInRoadAsphalt } from './junction.js'
import type { RoadSurface } from '@world-drive/shared'

type CornerArm = {
  road: { id: string; points: Pt[]; highway: string; surface?: RoadSurface; sidewalkMode?: string; isLink?: boolean; oneway?: boolean; layer?: number; bridge?: boolean; tunnel?: boolean; elevationMode?: string; bridgeHeight?: number; lanes?: number; explicitWidth?: number; name?: string; cycleway?: string; hasBusLane?: boolean; parkingLane?: string; lit?: boolean }
  ox: number
  oz: number
  halfW: number
  mat: THREE.Material
  swWidth: number
  swPlus: boolean
  swMinus: boolean
  mine: { arc: number; dirSign: 1 | -1 } | null
}

export type TrimSeg = {
  a0: number
  a1: number
  weak: boolean
  meshes: THREE.Object3D[]
}
type SideTrims = { left: TrimSeg[]; right: TrimSeg[] }

export interface JunctionCorners {
  trims: SideTrims
  meshes: THREE.Object3D[]
  endTrim: [number, number]
}

function cornerArmOf(r: CornerArm['road'], end: 0 | 1, mine: CornerArm['mine']): CornerArm {
  const o = outwardTangent(r as any, end)
  const plusSide: 'left' | 'right' = end === 0 ? 'right' : 'left'
  const minusSide: 'left' | 'right' = end === 0 ? 'left' : 'right'
  return {
    road: r, ox: o.x, oz: o.z,
    halfW: computeRoadWidth(r as any).halfW,
    mat: getAsphaltMaterial(r.highway, r.surface),
    swWidth: sidewalkWidthOf(r as any),
    swPlus: hasSidewalkSide(r as any, plusSide),
    swMinus: hasSidewalkSide(r as any, minusSide),
    mine,
  }
}

function throughArmsOf(r: CornerArm['road'], dx: number, dz: number, arc: number, own: boolean): CornerArm[] {
  const halfW = computeRoadWidth(r as any).halfW
  const mat = getAsphaltMaterial(r.highway, r.surface)
  const swWidth = sidewalkWidthOf(r as any)
  const right = hasSidewalkSide(r as any, 'right')
  const left = hasSidewalkSide(r as any, 'left')
  return [
    { road: r, ox: dx, oz: dz, halfW, mat, swWidth, swPlus: right, swMinus: left, mine: own ? { arc, dirSign: 1 } : null },
    { road: r, ox: -dx, oz: -dz, halfW, mat, swWidth, swPlus: left, swMinus: right, mine: own ? { arc, dirSign: -1 } : null },
  ]
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

export function buildJunctionCorners(
  road: { id: string; points: Pt[]; highway: string; surface?: RoadSurface; sidewalkMode?: string; isLink?: boolean; oneway?: boolean; layer?: number; bridge?: boolean; tunnel?: boolean; elevationMode?: string; bridgeHeight?: number; lanes?: number; explicitWidth?: number; name?: string; cycleway?: string; hasBusLane?: boolean; parkingLane?: string; lit?: boolean; crossings?: any[]; roadId?: string },
  junction: JunctionInfo,
  smoothPts: Pt[],
  arcTable: number[],
  halfW: number,
  obstacles: RoadObstacleSeg[],
): JunctionCorners {
  const trims: SideTrims = { left: [], right: [] }
  const meshes: THREE.Object3D[] = []
  const endTrim: [number, number] = [0, 0]
  const L = arcTable[arcTable.length - 1]!
  if (smoothPts.length < 2 || L < 2) return { trims, meshes, endTrim }

  const onThirdWay = (pts: Vec2[], a: CornerArm['road'], b: CornerArm['road']): boolean => {
    const segs = obstacles.filter((o) => o.roadId !== a.id && o.roadId !== b.id)
    if (segs.length === 0) return false
    for (const p of pts) if (isPointInRoadAsphalt(p.x, p.z, segs, 0.0)) return true
    return false
  }

  const dirAt = (arc: number): Vec2 => {
    let i = 0
    while (i < smoothPts.length - 2 && arcTable[i + 1]! < arc) i++
    return unitBetween(smoothPts[i]!, smoothPts[i + 1]!)
  }
  const ptAt = (arc: number): Pt => {
    let i = 0
    while (i < smoothPts.length - 2 && arcTable[i + 1]! < arc) i++
    const a = smoothPts[i]!; const b = smoothPts[i + 1]!
    const segL = arcTable[i + 1]! - arcTable[i]!
    const t = segL > 1e-6 ? Math.max(0, Math.min(1, (arc - arcTable[i]!) / segL)) : 0
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t }
  }

  type Node = { x: number; z: number; y: number; arms: CornerArm[]; endIdx: 0 | 1 | -1 }
  const nodes: Node[] = []

  for (const e of [0, 1] as const) {
    const je = junction.ends[e]
    if (!je.isJunction) continue
    const N = je.node
    const arms: CornerArm[] = [cornerArmOf(road, e, { arc: e === 0 ? 0 : L, dirSign: e === 0 ? 1 : -1 })]
    if (je.partner === road) {
      const oe: 0 | 1 = e === 0 ? 1 : 0
      arms.push(cornerArmOf(road, oe, { arc: oe === 0 ? 0 : L, dirSign: oe === 0 ? 1 : -1 }))
    }
    for (const a of je.arms) arms.push(cornerArmOf(a.road, a.end, null))
    for (const r of je.through) {
      const q = distToWay(r as any, N.x, N.z)
      let i = 0
      let acc = 0
      for (; i < r.points.length - 2; i++) {
        const segL = Math.hypot(r.points[i + 1]!.x - r.points[i]!.x, r.points[i + 1]!.z - r.points[i]!.z)
        if (acc + segL >= q.arc) break
        acc += segL
      }
      const d = unitBetween(r.points[i]!, r.points[i + 1]!)
      arms.push(...throughArmsOf(r, d.x, d.z, 0, false))
    }
    nodes.push({ x: N.x, z: N.z, y: N.y, arms, endIdx: e })
  }

  type Landing = { arc: number; road: CornerArm['road']; end: 0 | 1 }
  const landings: Landing[] = []
  for (const r of junction.others) {
    for (const end of [0, 1] as const) {
      if (junction.partnerIds.has(r.id) && (junction.ends[0].partner === r || junction.ends[1].partner === r) &&
        [0, 1].some((e) => Math.hypot(endPoint(r, end).x - junction.ends[e]!.node.x, endPoint(r, end).z - junction.ends[e]!.node.z) < 0.8)) continue
      const p = endPoint(r, end)
      const q = distToWay(road as any, p.x, p.z)
      if (q.d < halfW + 1.0 && q.arc > 1.5 && q.arc < L - 1.5) landings.push({ arc: q.arc, road: r, end })
    }
  }
  landings.sort((a, b) => a.arc - b.arc)
  for (let i = 0; i < landings.length;) {
    let j = i + 1
    while (j < landings.length && landings[j]!.arc - landings[i]!.arc < 1.5) j++
    const grp = landings.slice(i, j)
    const arc = grp.reduce((a, l) => a + l.arc, 0) / grp.length
    const P = ptAt(arc)
    const d = dirAt(arc)
    const arms: CornerArm[] = throughArmsOf(road, d.x, d.z, arc, true)
    for (const l of grp) arms.push(cornerArmOf(l.road, l.end, null))
    nodes.push({ x: P.x, z: P.z, y: P.y, arms, endIdx: -1 })
    i = j
  }

  const addTrim = (arm: CornerArm, side: 'left' | 'right', along: number, weak = false): TrimSeg | null => {
    if (!arm.mine || along < 0.3) return null
    const a0 = arm.mine.dirSign > 0 ? arm.mine.arc : arm.mine.arc - along
    const a1 = arm.mine.dirSign > 0 ? arm.mine.arc + along : arm.mine.arc
    const seg: TrimSeg = { a0: Math.max(0, a0), a1: Math.min(L, a1), weak, meshes: [] }
    trims[side].push(seg)
    if (a0 <= 0.01) endTrim[0] = Math.max(endTrim[0], a1)
    if (a1 >= L - 0.01) endTrim[1] = Math.max(endTrim[1], L - a0)
    return seg
  }

  const DEG = Math.PI / 180
  for (const node of nodes) {
    const arms = node.arms.slice().sort((a, b) => Math.atan2(a.oz, a.ox) - Math.atan2(b.oz, b.ox))
    const n = arms.length
    if (n < 2) continue
    const N: Vec2 = { x: node.x, z: node.z }
    for (let i = 0; i < n; i++) {
      const A = arms[i]!
      const B = arms[(i + 1) % n]!
      let phi = Math.atan2(B.oz, B.ox) - Math.atan2(A.oz, A.ox)
      if (phi <= 1e-6) phi += Math.PI * 2
      const oA: Vec2 = { x: A.ox, z: A.oz }
      const oB: Vec2 = { x: B.ox, z: B.oz }
      const pA: Vec2 = { x: -A.oz, z: A.ox }
      const pB: Vec2 = { x: -B.oz, z: B.ox }

      if (phi > Math.PI + 5 * DEG) {
        if (!A.mine || A.road === B.road) continue
        const cA: Vec2 = { x: N.x + pA.x * A.halfW, z: N.z + pA.z * A.halfW }
        const cB: Vec2 = { x: N.x - pB.x * B.halfW, z: N.z - pB.z * B.halfW }
        const X = lineIntersect(cA, oA, cB, oB)
        if (!X || X.t < 0 || X.u < 0 || Math.hypot(X.x - N.x, X.z - N.z) > 12) continue
        const y = node.y + 0.028
        const geo = new THREE.BufferGeometry()
        geo.setAttribute('position', new THREE.Float32BufferAttribute([cA.x, y, cA.z, X.x, y, X.z, cB.x, y, cB.z], 3))
        geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1], 2))
        geo.setIndex([0, 1, 2])
        geo.computeVertexNormals()
        const m = new THREE.Mesh(geo, B.halfW > A.halfW ? B.mat : A.mat)
        m.renderOrder = 3
        m.receiveShadow = true
        meshes.push(m)
        continue
      }
      if (phi < 15 * DEG || phi > 150 * DEG) continue
      if (!A.swPlus && !B.swMinus) continue
      if (A.swPlus !== B.swMinus) {
        const sIsA = A.swPlus
        const S = sIsA ? A : B
        const O = sIsA ? B : A
        const oS: Vec2 = sIsA ? oA : oB
        const oO: Vec2 = sIsA ? oB : oA
        const pS: Vec2 = sIsA ? pA : { x: -pB.x, z: -pB.z }
        const pO: Vec2 = sIsA ? { x: -pB.x, z: -pB.z } : pA
        const wS = S.halfW + CURB_WIDTH
        const wO = O.halfW + CURB_WIDTH
        const KS: Vec2 = { x: N.x + pS.x * wS, z: N.z + pS.z * wS }
        const OS: Vec2 = { x: N.x + pS.x * (wS + S.swWidth), z: N.z + pS.z * (wS + S.swWidth) }
        const KO: Vec2 = { x: N.x + pO.x * wO, z: N.z + pO.z * wO }
        const X = lineIntersect(KS, oS, KO, oO)
        const XO = lineIntersect(OS, oS, KO, oO)
        if (!X || !XO || Math.min(X.u, XO.u) < -1.0) continue
        const along = Math.max(X.t, XO.t) + 0.05
        if (along < 0.3 || along > 14) continue
        const seg = S.mine ? addTrim(S, sIsA ? (S.mine.dirSign > 0 ? 'right' : 'left') : (S.mine.dirSign > 0 ? 'left' : 'right'), along, true) : null
        if (!S.mine || !seg) continue
        const yWalk = node.y + SIDEWALK_HEIGHT
        const yRoad = node.y + 0.028
        const Kt: Vec2 = { x: KS.x + oS.x * along, z: KS.z + oS.z * along }
        const Ot: Vec2 = { x: OS.x + oS.x * along, z: OS.z + oS.z * along }
        const xk: Vec2 = { x: X.x, z: X.z }
        const xo: Vec2 = { x: XO.x, z: XO.z }
        if (onThirdWay([xk, Kt, Ot, xo, { x: (xk.x + Ot.x) / 2, z: (xk.z + Ot.z) / 2 }], A.road, B.road)) continue
        const fillGeo = new THREE.BufferGeometry()
        fillGeo.setAttribute('position', new THREE.Float32BufferAttribute([xk.x, yWalk, xk.z, Kt.x, yWalk, Kt.z, Ot.x, yWalk, Ot.z, xo.x, yWalk, xo.z], 3))
        fillGeo.setAttribute('uv', new THREE.Float32BufferAttribute([xk.x / 3, xk.z / 3, Kt.x / 3, Kt.z / 3, Ot.x / 3, Ot.z / 3, xo.x / 3, xo.z / 3], 2))
        fillGeo.setIndex([0, 1, 2, 0, 2, 3])
        fillGeo.computeVertexNormals()
        const fill = new THREE.Mesh(fillGeo, SIDEWALK_MAT)
        fill.renderOrder = 5
        fill.receiveShadow = true
        meshes.push(fill)
        seg.meshes.push(fill)
        const g0: Vec2 = { x: xk.x - pO.x * CURB_WIDTH, z: xk.z - pO.z * CURB_WIDTH }
        const g1: Vec2 = { x: xo.x - pO.x * CURB_WIDTH, z: xo.z - pO.z * CURB_WIDTH }
        const bevGeo = new THREE.BufferGeometry()
        bevGeo.setAttribute('position', new THREE.Float32BufferAttribute([g0.x, yRoad, g0.z, xk.x, yWalk, xk.z, xo.x, yWalk, xo.z, g1.x, yRoad, g1.z], 3))
        bevGeo.setIndex([0, 1, 2, 0, 2, 3])
        bevGeo.computeVertexNormals()
        const bev = new THREE.Mesh(bevGeo, CURB_MAT)
        bev.renderOrder = 5
        bev.receiveShadow = true
        meshes.push(bev)
        seg.meshes.push(bev)
        continue
      }

      const wA = A.halfW + CURB_WIDTH
      const wB = B.halfW + CURB_WIDTH
      const KA: Vec2 = { x: N.x + pA.x * wA, z: N.z + pA.z * wA }
      const KB: Vec2 = { x: N.x - pB.x * wB, z: N.z - pB.z * wB }
      const X = lineIntersect(KA, oA, KB, oB)
      if (!X) continue
      let R = Math.min(A.swWidth, B.swWidth, 3.0)
      const tanHalf = Math.tan(phi / 2)
      if (R / tanHalf > 12) R = 12 * tanHalf
      const tDist = R / tanHalf
      const alongA = X.t + tDist
      const alongB = X.u + tDist
      if (alongA < 0.3 || alongB < 0.3) continue
      const TA: Vec2 = { x: X.x + oA.x * tDist, z: X.z + oA.z * tDist }
      const TB: Vec2 = { x: X.x + oB.x * tDist, z: X.z + oB.z * tDist }
      const bl = Math.hypot(oA.x + oB.x, oA.z + oB.z)
      const bis: Vec2 = { x: (oA.x + oB.x) / bl, z: (oA.z + oB.z) / bl }
      const cDist = R / Math.sin(phi / 2)
      const C: Vec2 = { x: X.x + bis.x * cDist, z: X.z + bis.z * cDist }

      if (A.mine) addTrim(A, A.mine.dirSign > 0 ? 'right' : 'left', alongA)
      if (B.mine) addTrim(B, B.mine.dirSign > 0 ? 'left' : 'right', alongB)
      if (!A.mine) continue

      const yWalk = node.y + SIDEWALK_HEIGHT
      const yRoad = node.y + 0.028
      const a0 = Math.atan2(TA.z - C.z, TA.x - C.x)
      let dAng = Math.atan2(TB.z - C.z, TB.x - C.x) - a0
      while (dAng > Math.PI) dAng -= Math.PI * 2
      while (dAng < -Math.PI) dAng += Math.PI * 2
      const segs = Math.max(4, Math.ceil(Math.abs(dAng) / (Math.PI / 12)))
      const arcPt = (k: number, radius: number): Vec2 => {
        const ang = a0 + dAng * (k / segs)
        return { x: C.x + Math.cos(ang) * radius, z: C.z + Math.sin(ang) * radius }
      }
      const AOut: Vec2 = { x: TA.x + pA.x * A.swWidth, z: TA.z + pA.z * A.swWidth }
      const BOut: Vec2 = { x: TB.x - pB.x * B.swWidth, z: TB.z - pB.z * B.swWidth }
      if (onThirdWay([TA, TB, AOut, BOut, arcPt(Math.floor(segs / 2), R), arcPt(Math.floor(segs / 2), R + CURB_WIDTH)], A.road, B.road)) continue

      const walkV: number[] = []
      const walkUv: number[] = []
      const walkI: number[] = []
      const pushWalk = (p: Vec2): number => { walkV.push(p.x, yWalk, p.z); walkUv.push(p.x / 3, p.z / 3); return walkV.length / 3 - 1 }
      const q0 = pushWalk(TA); const q1 = pushWalk(AOut); const q2 = pushWalk(BOut); const q3 = pushWalk(TB)
      walkI.push(q0, q1, q2, q0, q2, q3)
      const arcIdx: number[] = []
      for (let k = 0; k <= segs; k++) arcIdx.push(pushWalk(arcPt(k, R)))
      for (let k = 1; k < segs; k++) walkI.push(arcIdx[0]!, arcIdx[k]!, arcIdx[k + 1]!)
      const walkGeo = new THREE.BufferGeometry()
      walkGeo.setAttribute('position', new THREE.Float32BufferAttribute(walkV, 3))
      walkGeo.setAttribute('uv', new THREE.Float32BufferAttribute(walkUv, 2))
      walkGeo.setIndex(walkI)
      walkGeo.computeVertexNormals()
      const walk = new THREE.Mesh(walkGeo, SIDEWALK_MAT)
      walk.renderOrder = 5
      walk.receiveShadow = true
      meshes.push(walk)

      const curbV: number[] = []
      const curbI: number[] = []
      for (let k = 0; k <= segs; k++) {
        const top = arcPt(k, R)
        const bot = arcPt(k, R + CURB_WIDTH)
        curbV.push(top.x, yWalk, top.z, bot.x, yRoad, bot.z)
        if (k > 0) {
          const b = (k - 1) * 2
          curbI.push(b, b + 2, b + 1, b + 1, b + 2, b + 3)
        }
      }
      const curbGeo = new THREE.BufferGeometry()
      curbGeo.setAttribute('position', new THREE.Float32BufferAttribute(curbV, 3))
      curbGeo.setIndex(curbI)
      curbGeo.computeVertexNormals()
      const curb = new THREE.Mesh(curbGeo, CURB_MAT)
      curb.renderOrder = 5
      curb.receiveShadow = true
      meshes.push(curb)

      const EA: Vec2 = { x: N.x + pA.x * (A.halfW - 0.1), z: N.z + pA.z * (A.halfW - 0.1) }
      const EB: Vec2 = { x: N.x - pB.x * (B.halfW - 0.1), z: N.z - pB.z * (B.halfW - 0.1) }
      const XA = lineIntersect(EA, oA, EB, oB)
      if (XA) {
        const aspV: number[] = [XA.x, yRoad, XA.z]
        const aspUv: number[] = [XA.x / 8, XA.z / 8]
        const aspI: number[] = []
        for (let k = 0; k <= segs; k++) {
          const g = arcPt(k, R + CURB_WIDTH)
          aspV.push(g.x, yRoad, g.z)
          aspUv.push(g.x / 8, g.z / 8)
          if (k > 0) aspI.push(0, k, k + 1)
        }
        const aspGeo = new THREE.BufferGeometry()
        aspGeo.setAttribute('position', new THREE.Float32BufferAttribute(aspV, 3))
        aspGeo.setAttribute('uv', new THREE.Float32BufferAttribute(aspUv, 2))
        aspGeo.setIndex(aspI)
        aspGeo.computeVertexNormals()
        const asp = new THREE.Mesh(aspGeo, B.halfW > A.halfW ? B.mat : A.mat)
        asp.renderOrder = 3
        asp.receiveShadow = true
        meshes.push(asp)
      }
    }
  }

  return { trims, meshes, endTrim }
}