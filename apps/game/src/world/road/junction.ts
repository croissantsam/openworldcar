import type { Road, RoadSurface } from '@world-drive/shared'
import { CHUNK_SIZE } from '@world-drive/math'
import { computeRoadWidth } from './road-width.js'
import { computePolylineNormals, type Pt, type Vec2 } from './geometry.js'
import { elevClass, isDrivableWay, isUrbanWay, isMajorWay, sidewalkWidthOf, sidewalkFootprint } from './materials.js'

const NON_DRIVABLE = new Set(['path', 'footway', 'cycleway', 'track', 'steps', 'pedestrian'])

const HIGHWAY_RANK: Record<string, number> = {
  motorway: 8, trunk: 7, primary: 6, secondary: 5, tertiary: 4, unclassified: 3, residential: 3,
  living_street: 2, service: 1, pedestrian: 1,
}

function numericId(id: string): number {
  const n = Number(id)
  return Number.isFinite(n) ? n : Number.NaN
}

function idBefore(a: string, b: string): boolean {
  const na = numericId(a)
  const nb = numericId(b)
  if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na < nb
  return a < b
}

function outranks(a: Road, b: Road): boolean {
  const ra = (HIGHWAY_RANK[a.highway] ?? 0) - (a.isLink ? 0.5 : 0)
  const rb = (HIGHWAY_RANK[b.highway] ?? 0) - (b.isLink ? 0.5 : 0)
  if (ra !== rb) return ra > rb
  const wa = computeRoadWidth(a).roadW
  const wb = computeRoadWidth(b).roadW
  if (Math.abs(wa - wb) > 0.05) return wa > wb
  return idBefore(a.id, b.id)
}

export interface JunctionArm {
  road: Road
  end: 0 | 1
  ox: number
  oz: number
}

export interface RoadEndJunction {
  node: Pt
  arms: JunctionArm[]
  through: Road[]
  partner: Road | null
  partnerOut: Vec2 | null
  landsOn: Road | null
  isJunction: boolean
}

export interface JunctionInfo {
  ends: [RoadEndJunction, RoadEndJunction]
  yieldTo: Set<string>
  partnerIds: Set<string>
  others: Road[]
}

export function analyseJunctions(road: Road, allRoads?: Road[]): JunctionInfo {
  const others = allRoads ? dedupeRoads(allRoads).filter((r) => r.id !== road.id && isDrivableWay(r)) : []
  const yieldTo = new Set<string>()
  const partnerIds = new Set<string>()
  const n = road.points.length
  const closed = n >= 3 && Math.hypot(road.points[0]!.x - road.points[n - 1]!.x, road.points[0]!.z - road.points[n - 1]!.z) < 0.8

  type Arm = { road: Road; end: 0 | 1; o: Vec2 }
  const analyseEnd = (e: 0 | 1): RoadEndJunction => {
    const N = endPoint(road, e)
    const arms: Arm[] = [{ road, end: e, o: outwardTangent(road, e) }]
    if (closed) arms.push({ road, end: e === 0 ? 1 : 0, o: outwardTangent(road, e === 0 ? 1 : 0) })
    const through: Road[] = []
    for (const r of others) {
      const s = r.points[0]!
      const t = r.points[r.points.length - 1]!
      if (Math.hypot(N.x - s.x, N.z - s.z) < 0.8) {
        arms.push({ road: r, end: 0, o: outwardTangent(r, 0) })
      } else if (Math.hypot(N.x - t.x, N.z - t.z) < 0.8) {
        arms.push({ road: r, end: 1, o: outwardTangent(r, 1) })
      } else {
        const q = distToWay(r, N.x, N.z)
        if (q.d < 0.6 && q.arc > 1.0 && q.arc < q.len - 1.0) through.push(r)
      }
    }

    const best: number[] = arms.map((a, i) => {
      let bi = -1
      let bd = -0.6
      for (let j = 0; j < arms.length; j++) {
        if (j === i) continue
        const b = arms[j]!
        if (elevClass(b.road) !== elevClass(a.road)) continue
        const d = a.o.x * b.o.x + a.o.z * b.o.z
        if (d < bd) { bd = d; bi = j }
      }
      return bi
    })
    const mutual = (i: number): boolean => best[i]! >= 0 && best[best[i]!] === i
    let cont: Arm | null = mutual(0) ? arms[best[0]!]! : null
    const myName = road.name?.trim().toLowerCase()
    if (!cont && arms.length === 2 && through.length === 0 && arms[1]!.road !== road &&
      elevClass(arms[1]!.road) === elevClass(road) && myName && arms[1]!.road.name?.trim().toLowerCase() === myName) cont = arms[1]!
    const curThrough = cont !== null
    if (cont && cont.road !== road) partnerIds.add(cont.road.id)

    let landsOn: Road | null = null
    for (const r of through) {
      if (curThrough) {
        if (outranks(r, road)) yieldTo.add(r.id)
      } else {
        yieldTo.add(r.id)
        if (!landsOn) landsOn = r
      }
    }
    for (let i = 1; i < arms.length; i++) {
      const a = arms[i]!
      if (a === cont || a.road === road) continue
      const aThrough = mutual(i)
      let yields: boolean
      if (curThrough && !aThrough) yields = false
      else if (!curThrough && aThrough) yields = true
      else yields = outranks(a.road, road)
      if (yields) {
        yieldTo.add(a.road.id)
        if (!curThrough && !landsOn) landsOn = a.road
      }
    }
    const otherArms = arms.length - 1 - (closed ? 1 : 0) - (cont && cont.road !== road ? 1 : 0)
    return {
      node: N,
      arms: arms.filter((a) => a.road !== road).map((a) => ({ road: a.road, end: a.end, ox: a.o.x, oz: a.o.z })),
      through,
      partner: cont ? cont.road : null,
      partnerOut: cont ? cont.o : null,
      landsOn,
      isJunction: otherArms + through.length > 0,
    }
  }

  return { ends: [analyseEnd(0), analyseEnd(1)], yieldTo, partnerIds, others }
}

export interface RoadObstacleSeg {
  x1: number; z1: number; x2: number; z2: number
  dx: number; dz: number; lenSq: number; halfW: number
  minX: number; maxX: number; minZ: number; maxZ: number
  roadId: string
  fpPlus: number
  fpMinus: number
  yieldCorner: boolean
  flatStart: boolean
  flatEnd: boolean
  hasClip: boolean
  clipX: number
  clipZ: number
  clipNx: number
  clipNz: number
}

export function buildRoadObstacles(roads?: Road[], currentRoad?: Road | string, junction?: JunctionInfo): RoadObstacleSeg[] {
  if (!roads || roads.length === 0) return []
  const currentRoadId = typeof currentRoad === 'string' ? currentRoad : currentRoad?.id
  const cur = typeof currentRoad === 'object' ? currentRoad : roads.find((r) => r.id === currentRoadId)
  if (!cur || cur.points.length < 2) return []
  const info = junction ?? analyseJunctions(cur, roads)
  const curHalfW = computeRoadWidth(cur).halfW
  const curCls = elevClass(cur)

  let cMinX = Infinity, cMaxX = -Infinity, cMinZ = Infinity, cMaxZ = -Infinity
  for (const p of cur.points) {
    if (p.x < cMinX) cMinX = p.x
    if (p.x > cMaxX) cMaxX = p.x
    if (p.z < cMinZ) cMinZ = p.z
    if (p.z > cMaxZ) cMaxZ = p.z
  }
  const reach = 16

  const obs: RoadObstacleSeg[] = []
  for (const r of info.others) {
    const isPartner = info.partnerIds.has(r.id)
    let jointClip: { x: number; z: number; nx: number; nz: number } | null = null
    let jointEnd: 0 | 1 = 0
    if (isPartner) {
      const e: 0 | 1 = info.ends[0].partner === r ? 0 : 1
      const je = info.ends[e]
      const N = je.node
      const po = je.partnerOut ?? outwardTangent(r, 0)
      const away = outwardTangent(cur, e)
      const jn = { nx: -away.z + po.x, nz: away.x - po.z } 
      let hx = -jn.nz
      let hz = jn.nx
      if (hx * po.x + hz * po.z < 0) { hx = -hx; hz = -hz }
      jointClip = { x: N.x + hx * 0.85, z: N.z + hz * 0.85, nx: hx, nz: hz }
      jointEnd = Math.hypot(r.points[0]!.x - N.x, r.points[0]!.z - N.z) < 0.8 ? 0 : 1
    }
    let rMinX = Infinity, rMaxX = -Infinity, rMinZ = Infinity, rMaxZ = -Infinity
    for (const p of r.points) {
      if (p.x < rMinX) rMinX = p.x
      if (p.x > rMaxX) rMaxX = p.x
      if (p.z < rMinZ) rMinZ = p.z
      if (p.z > rMaxZ) rMaxZ = p.z
    }
    if (rMaxX < cMinX - reach || rMinX > cMaxX + reach || rMaxZ < cMinZ - reach || rMinZ > cMaxZ + reach) continue

    const halfW = computeRoadWidth(r).halfW
    const fp = sidewalkFootprint(r)
    const yieldCorner = info.yieldTo.has(r.id)

    const pts: Pt[] = r.points.slice()
    const last = pts.length - 1
    const qs = distToWay(cur, pts[0]!.x, pts[0]!.z)
    const qe = distToWay(cur, pts[last]!.x, pts[last]!.z)
    const landsStart = !(isPartner && jointEnd === 0) && qs.d < curHalfW + 1.0
    const landsEnd = !(isPartner && jointEnd === 1) && qe.d < curHalfW + 1.0
    if (elevClass(r) !== curCls && !landsStart && !landsEnd) continue
    if (landsStart) {
      const o = outwardTangent(r, 0)
      const ext = qs.d + 0.3
      pts[0] = { x: pts[0]!.x - o.x * ext, y: pts[0]!.y, z: pts[0]!.z - o.z * ext }
    }
    if (landsEnd) {
      const o = outwardTangent(r, 1)
      const ext = qe.d + 0.3
      pts[last] = { x: pts[last]!.x - o.x * ext, y: pts[last]!.y, z: pts[last]!.z - o.z * ext }
    }
    let clip: { x: number; z: number; nx: number; nz: number } | null = null
    if (landsStart !== landsEnd) {
      const q = landsStart ? qs : qe
      const t = tangentAtArc(cur, q.arc)
      const o = outwardTangent(r, landsStart ? 0 : 1)
      const dot = o.x * t.x + o.z * t.z
      let nx = o.x - dot * t.x
      let nz = o.z - dot * t.z
      const nl = Math.hypot(nx, nz)
      if (nl > 0.3) {
        nx /= nl
        nz /= nl
        clip = { x: q.x, z: q.z, nx, nz }
      }
    }

    for (let i = 0; i < last; i++) {
      const p1 = pts[i]!
      const p2 = pts[i + 1]!
      const dx = p2.x - p1.x
      const dz = p2.z - p1.z
      const lenSq = dx * dx + dz * dz
      if (lenSq < 1e-4) continue
      const adjacent = jointClip !== null && (jointEnd === 0 ? i === 0 : i === last - 1)
      const segClip = adjacent ? jointClip : clip !== null &&
        Math.min(Math.hypot(p1.x - clip.x, p1.z - clip.z), Math.hypot(p2.x - clip.x, p2.z - clip.z)) < 30 ? clip : null
      obs.push({
        x1: p1.x, z1: p1.z,
        x2: p2.x, z2: p2.z,
        dx, dz, lenSq,
        halfW,
        minX: Math.min(p1.x, p2.x),
        maxX: Math.max(p1.x, p2.x),
        minZ: Math.min(p1.z, p2.z),
        maxZ: Math.max(p1.z, p2.z),
        roadId: r.id,
        fpPlus: fp.plus,
        fpMinus: fp.minus,
        yieldCorner,
        flatStart: i === 0 && landsStart,
        flatEnd: i === last - 1 && landsEnd,
        hasClip: segClip !== null,
        clipX: segClip?.x ?? 0,
        clipZ: segClip?.z ?? 0,
        clipNx: segClip?.nx ?? 0,
        clipNz: segClip?.nz ?? 0,
      })
    }
  }
  return obs
}

export function isPointInRoadAsphalt(px: number, pz: number, obs: RoadObstacleSeg[], margin = 0.20, footprint = false): boolean {
  for (let i = 0; i < obs.length; i++) {
    const ob = obs[i]!
    const useFp = footprint && ob.yieldCorner
    const rMax = ob.halfW + margin + (useFp ? Math.max(ob.fpPlus, ob.fpMinus) : 0)
    if (px < ob.minX - rMax || px > ob.maxX + rMax || pz < ob.minZ - rMax || pz > ob.maxZ + rMax) continue
    if (ob.hasClip && (px - ob.clipX) * ob.clipNx + (pz - ob.clipZ) * ob.clipNz < -0.35) continue
    let t = ((px - ob.x1) * ob.dx + (pz - ob.z1) * ob.dz) / ob.lenSq
    if (ob.flatStart && t < 0) continue
    if (ob.flatEnd && t > 1) continue
    t = Math.max(0, Math.min(1, t))
    const projX = ob.x1 + t * ob.dx
    const projZ = ob.z1 + t * ob.dz
    let r = ob.halfW + margin
    if (useFp) {
      const sideDot = -ob.dz * (px - ob.x1) + ob.dx * (pz - ob.z1)
      r += sideDot >= 0 ? ob.fpPlus : ob.fpMinus
    }
    if ((px - projX) ** 2 + (pz - projZ) ** 2 < r * r) return true
  }
  return false
}

export function unitBetween(a: Pt, b: Pt): Vec2 {
  const dx = b.x - a.x
  const dz = b.z - a.z
  const len = Math.hypot(dx, dz)
  return len > 1e-6 ? { x: dx / len, z: dz / len } : { x: 0, z: 1 }
}

export function endPoint(r: Road, end: 0 | 1): Pt {
  return end === 0 ? r.points[0]! : r.points[r.points.length - 1]!
}

export function outwardTangent(r: Road, end: 0 | 1): Vec2 {
  const p = r.points
  const n = p.length
  return end === 0 ? unitBetween(p[0]!, p[1]!) : unitBetween(p[n - 1]!, p[n - 2]!)
}

export function distToWay(r: Road, px: number, pz: number): { d: number; arc: number; len: number; x: number; z: number } {
  const p = r.points
  let best = Infinity
  let bestArc = 0
  let bx = p[0]!.x
  let bz = p[0]!.z
  let arc = 0
  for (let i = 0; i < p.length - 1; i++) {
    const a = p[i]!
    const b = p[i + 1]!
    const dx = b.x - a.x
    const dz = b.z - a.z
    const lenSq = dx * dx + dz * dz
    const len = Math.sqrt(lenSq)
    let t = lenSq > 1e-9 ? ((px - a.x) * dx + (pz - a.z) * dz) / lenSq : 0
    t = Math.max(0, Math.min(1, t))
    const qx = a.x + dx * t
    const qz = a.z + dz * t
    const d = Math.hypot(px - qx, pz - qz)
    if (d < best) { best = d; bestArc = arc + len * t; bx = qx; bz = qz }
    arc += len
  }
  return { d: best, arc: bestArc, len: arc, x: bx, z: bz }
}

export function tangentAtArc(r: Road, arc: number): Vec2 {
  const p = r.points
  let acc = 0
  for (let i = 0; i < p.length - 1; i++) {
    const len = Math.hypot(p[i + 1]!.x - p[i]!.x, p[i + 1]!.z - p[i]!.z)
    if (acc + len >= arc || i === p.length - 2) return unitBetween(p[i]!, p[i + 1]!)
    acc += len
  }
  return unitBetween(p[0]!, p[1]!)
}

export function dedupeRoads(roads: Road[]): Road[] {
  const seen = new Set<string>()
  const out: Road[] = []
  for (const r of roads) {
    if (seen.has(r.id)) continue
    seen.add(r.id)
    out.push(r)
  }
  return out
}