import * as THREE from 'three'
import { CURB_WIDTH, SIDEWALK_HEIGHT, CURB_MAT, SIDEWALK_MAT, sideSign, isUrbanWay, sidewalkWidthOf } from './materials.js'
import { computeRoadWidth } from './road-width.js'
import { computePolylineNormals, type Pt, type PolylineNormal } from './geometry.js'
import { buildRoadObstacles, type RoadObstacleSeg, isPointInRoadAsphalt } from './junction.js'
import { analyseJunctions, type JunctionInfo } from './junction.js'
import { elevClass } from './materials.js'
import { resamplePolyline, type Vec2 } from './geometry.js'

type TrimSeg = {
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

interface SidewalkSlice {
  blocked: boolean
  trim: TrimSeg | null
  bx: number; by: number; bz: number
  nx: number; nz: number; miter: number
  gX: number; gY: number; gZ: number
  cX: number; cY: number; cZ: number
  wX: number; wY: number; wZ: number
  dX: number; dY: number; dZ: number
  dist: number
}

export function buildCleanSidewalk(
  pts: Pt[],
  normals: PolylineNormal[],
  roadHalfW: number,
  sidewalkW: number,
  side: 'left' | 'right',
  obstacles: RoadObstacleSeg[],
  capStart = true,
  capEnd = true,
  trims: TrimSeg[] = [],
  arcOffset = 0,
  junctionEnds: [boolean, boolean] = [false, false],
  orphanTrims?: Set<TrimSeg>,
): THREE.Group {
  const group = new THREE.Group()
  if (pts.length < 2) return group
  const MIN_WALK_W = 0.6

  const trimAt = (arc: number): TrimSeg | null => {
    for (let i = 0; i < trims.length; i++) {
      const t = trims[i]!
      if (arc >= t.a0 && arc <= t.a1) return t
    }
    return null
  }

  const nearTrim = (arc: number): boolean => {
    for (let i = 0; i < trims.length; i++) {
      const t = trims[i]!
      if ((arc > t.a1 && arc < t.a1 + 4) || (arc < t.a0 && arc > t.a0 - 4)) return true
    }
    return false
  }

  const sign = sideSign(side)
  const curbBevelW = CURB_WIDTH

  const makeSlice = (bx: number, by: number, bz: number, nx0: number, nz0: number, miter: number, dist: number): SidewalkSlice => {
    const nx = nx0 * sign
    const nz = nz0 * sign

    const gX = bx + nx * (roadHalfW * miter)
    const gY = by + 0.028
    const gZ = bz + nz * (roadHalfW * miter)

    const cX = bx + nx * ((roadHalfW + curbBevelW) * miter)
    const cY = by + SIDEWALK_HEIGHT
    const cZ = bz + nz * ((roadHalfW + curbBevelW) * miter)

    const trim = trimAt(dist)
    let blocked = trim !== null
    if (!blocked && obstacles.length > 0) {
      blocked = isPointInRoadAsphalt(cX, cZ, obstacles, -0.05, !nearTrim(dist))
    }

    let effW = sidewalkW
    if (!blocked && obstacles.length > 0 && !nearTrim(dist)) {
      const outerFree = (w: number): boolean =>
        !isPointInRoadAsphalt(bx + nx * ((roadHalfW + curbBevelW + w) * miter), bz + nz * ((roadHalfW + curbBevelW + w) * miter), obstacles, 0.20)
      if (!outerFree(effW)) {
        if (!outerFree(MIN_WALK_W)) {
          blocked = true
        } else {
          let lo = MIN_WALK_W
          let hi = effW
          for (let k = 0; k < 6; k++) {
            const mid = (lo + hi) / 2
            if (outerFree(mid)) lo = mid
            else hi = mid
          }
          effW = lo
        }
      }
    }

    const wX = bx + nx * ((roadHalfW + curbBevelW + effW) * miter)
    const wY = by + SIDEWALK_HEIGHT
    const wZ = bz + nz * ((roadHalfW + curbBevelW + effW) * miter)

    return {
      blocked,
      trim,
      bx, by, bz, nx: nx0, nz: nz0, miter,
      gX, gY, gZ,
      cX, cY, cZ,
      wX, wY, wZ,
      dX: wX, dY: by - 0.05, dZ: wZ,
      dist,
    }
  }

  const raw: SidewalkSlice[] = []
  let totalDist = 0
  for (let i = 0; i < pts.length; i++) {
    const curr = pts[i]!
    const norm = normals[i]!
    if (i > 0) totalDist += Math.hypot(curr.x - pts[i - 1]!.x, curr.z - pts[i - 1]!.z)
    raw.push(makeSlice(curr.x, curr.y, curr.z, norm.nx, norm.nz, norm.miter, totalDist))
  }

  const slices: SidewalkSlice[] = []
  for (const s of raw) {
    const last = slices[slices.length - 1]
    if (last) {
      const ddx = s.bx - last.bx
      const ddz = s.bz - last.bz
      if ((s.wX - last.wX) * ddx + (s.wZ - last.wZ) * ddz <= 0) continue
    }
    slices.push(s)
  }
  if (slices.length < 2) return group

  const lerpSlices = (a: SidewalkSlice, b: SidewalkSlice, t: number): SidewalkSlice => {
    let nx = a.nx + (b.nx - a.nx) * t
    let nz = a.nz + (b.nz - a.nz) * t
    const l = Math.hypot(nx, nz)
    if (l > 1e-6) { nx /= l; nz /= l } else { nx = a.nx; nz = a.nz }
    return makeSlice(
      a.bx + (b.bx - a.bx) * t, a.by + (b.by - a.by) * t, a.bz + (b.bz - a.bz) * t,
      nx, nz, a.miter + (b.miter - a.miter) * t, a.dist + (b.dist - a.dist) * t,
    )
  }

  const boundary = (a: SidewalkSlice, b: SidewalkSlice, aFree: boolean): SidewalkSlice => {
    let lo = 0
    let hi = 1
    for (let k = 0; k < 8; k++) {
      const mid = (lo + hi) / 2
      if (!lerpSlices(a, b, mid).blocked === aFree) lo = mid
      else hi = mid
    }
    return lerpSlices(a, b, aFree ? lo : hi)
  }

  const curbVerts: number[] = []
  const curbIndices: number[] = []
  const walkVerts: number[] = []
  const walkUvs: number[] = []
  const walkIndices: number[] = []
  const dropVerts: number[] = []
  const dropIndices: number[] = []
  let curbQuadCount = 0
  let walkQuadCount = 0
  let dropQuadCount = 0

  function addEndCap(s: SidewalkSlice, isStart: boolean): void {
    const cb = curbQuadCount * 4
    curbVerts.push(
      s.cX, s.cY, s.cZ,
      s.wX, s.wY, s.wZ,
      s.cX, s.gY, s.cZ,
      s.wX, s.gY, s.wZ,
    )
    if (isStart) {
      curbIndices.push(cb, cb + 1, cb + 2, cb + 1, cb + 3, cb + 2)
    } else {
      curbIndices.push(cb + 2, cb + 1, cb, cb + 2, cb + 3, cb + 1)
    }
    curbQuadCount++
  }

  function addBand(s1: SidewalkSlice, s2: SidewalkSlice): void {
    const cb = curbQuadCount * 4
    curbVerts.push(
      s1.gX, s1.gY, s1.gZ,
      s1.cX, s1.cY, s1.cZ,
      s2.gX, s2.gY, s2.gZ,
      s2.cX, s2.cY, s2.cZ,
    )
    curbIndices.push(cb, cb + 1, cb + 2, cb + 1, cb + 3, cb + 2)
    curbQuadCount++

    const wb = walkQuadCount * 4
    walkVerts.push(
      s1.cX, s1.cY, s1.cZ,
      s1.wX, s1.wY, s1.wZ,
      s2.cX, s2.cY, s2.cZ,
      s2.wX, s2.wY, s2.wZ,
    )
    const v1 = (s1.dist + arcOffset) / 3.0
    const v2 = (s2.dist + arcOffset) / 3.0
    walkUvs.push(0, v1, 1, v1, 0, v2, 1, v2)
    walkIndices.push(wb, wb + 1, wb + 2, wb + 1, wb + 3, wb + 2)
    walkQuadCount++

    const db = dropQuadCount * 4
    dropVerts.push(
      s1.wX, s1.wY, s1.wZ,
      s1.dX, s1.dY, s1.dZ,
      s2.wX, s2.wY, s2.wZ,
      s2.dX, s2.dY, s2.dZ,
    )
    dropIndices.push(db, db + 1, db + 2, db + 1, db + 3, db + 2)
    dropQuadCount++
  }

  type Run = { slices: SidewalkSlice[]; weakStart: boolean; weakEnd: boolean; atStart: boolean; atEnd: boolean; trimStart: TrimSeg | null; trimEnd: TrimSeg | null }
  const runs: Run[] = []
  let cur: Run | null = null
  const last = slices.length - 1
  const newRun = (first: SidewalkSlice, i: number): Run =>
    ({ slices: [first], weakStart: i === 0 && junctionEnds[0] && capStart, weakEnd: false, atStart: i === 0, atEnd: false, trimStart: null, trimEnd: null })
  for (let i = 0; i < last; i++) {
    const s1 = slices[i]!
    const s2 = slices[i + 1]!
    if (!s1.blocked && !s2.blocked) {
      if (!cur) cur = newRun(s1, i)
      cur.slices.push(s2)
    } else if (!s1.blocked && s2.blocked) {
      if (!cur) cur = newRun(s1, i)
      cur.slices.push(boundary(s1, s2, true))
      cur.trimEnd = s2.trim
      cur.weakEnd = s2.trim === null || s2.trim.weak
      runs.push(cur)
      cur = null
    } else if (s1.blocked && !s2.blocked) {
      cur = { slices: [boundary(s1, s2, false), s2], weakStart: s1.trim === null || s1.trim.weak, weakEnd: false, atStart: false, atEnd: false, trimStart: s1.trim, trimEnd: null }
    }
  }
  if (cur) {
    cur.atEnd = true
    cur.weakEnd = junctionEnds[1] && capEnd
    runs.push(cur)
  }
  for (const run of runs) {
    const len = run.slices[run.slices.length - 1]!.dist - run.slices[0]!.dist
    const orphan = (run.weakStart && run.weakEnd && len < 6.0) || ((run.weakStart || run.weakEnd) && len < 1.2)
    if (orphan) {
      if (orphanTrims) {
        if (run.trimStart?.weak) orphanTrims.add(run.trimStart)
        if (run.trimEnd?.weak) orphanTrims.add(run.trimEnd)
      }
      continue
    }
    const first = run.slices[0]!
    const end = run.slices[run.slices.length - 1]!
    if (!run.atStart || capStart) addEndCap(first, true)
    for (let i = 0; i < run.slices.length - 1; i++) addBand(run.slices[i]!, run.slices[i + 1]!)
    if (!run.atEnd || capEnd) addEndCap(end, false)
  }

  if (curbVerts.length > 0) {
    const curbGeo = new THREE.BufferGeometry()
    curbGeo.setAttribute('position', new THREE.Float32BufferAttribute(curbVerts, 3))
    curbGeo.setIndex(curbIndices)
    curbGeo.computeVertexNormals()
    const curbMesh = new THREE.Mesh(curbGeo, CURB_MAT)
    curbMesh.receiveShadow = true
    curbMesh.renderOrder = 5
    group.add(curbMesh)
  }

  if (walkVerts.length > 0) {
    const walkGeo = new THREE.BufferGeometry()
    walkGeo.setAttribute('position', new THREE.Float32BufferAttribute(walkVerts, 3))
    walkGeo.setAttribute('uv', new THREE.Float32BufferAttribute(walkUvs, 2))
    walkGeo.setIndex(walkIndices)
    walkGeo.computeVertexNormals()
    const walkMesh = new THREE.Mesh(walkGeo, SIDEWALK_MAT)
    walkMesh.receiveShadow = true
    walkMesh.renderOrder = 5
    group.add(walkMesh)
  }

  if (dropVerts.length > 0) {
    const dropGeo = new THREE.BufferGeometry()
    dropGeo.setAttribute('position', new THREE.Float32BufferAttribute(dropVerts, 3))
    dropGeo.setIndex(dropIndices)
    dropGeo.computeVertexNormals()
    const dropMesh = new THREE.Mesh(dropGeo, CURB_MAT)
    dropMesh.receiveShadow = true
    dropMesh.renderOrder = 5
    group.add(dropMesh)
  }

  return group
}