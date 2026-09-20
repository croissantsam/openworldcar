import * as THREE from 'three'

export type Pt = { x: number; y: number; z: number }
export type Vec2 = { x: number; z: number }

export interface PolylineNormal {
  nx: number
  nz: number
  miter: number
}

export type EndNormals = { start?: PolylineNormal; end?: PolylineNormal }

export function resamplePolyline(pts: Pt[], maxStep = 1.6): Pt[] {
  if (pts.length < 2) return pts
  const res: Pt[] = []
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!
    const b = pts[i + 1]!
    const dx = b.x - a.x
    const dy = b.y - a.y
    const dz = b.z - a.z
    const len = Math.hypot(dx, dz)
    const steps = Math.max(1, Math.ceil(len / maxStep))
    for (let s = 0; s < steps; s++) {
      const t = s / steps
      res.push({
        x: a.x + dx * t,
        y: a.y + dy * t,
        z: a.z + dz * t,
      })
    }
  }
  res.push(pts[pts.length - 1]!)
  return res
}

function jointNormal(d1x: number, d1z: number, d2x: number, d2z: number): PolylineNormal {
  const n1x = -d1z
  const n1z = d1x
  const n2x = -d2z
  const n2z = d2x
  const bx = n1x + n2x
  const bz = n1z + n2z
  const bLen = Math.hypot(bx, bz)
  if (bLen > 1e-4) {
    const nx = bx / bLen
    const nz = bz / bLen
    const cosHalf = n1x * nx + n1z * nz
    const miter = cosHalf > 0.38 ? Math.min(1.42, 1.0 / cosHalf) : 1.42
    return { nx, nz, miter }
  }
  return { nx: n1x, nz: n1z, miter: 1.0 }
}

export function computePolylineNormals(points: Pt[], endNormals?: EndNormals): PolylineNormal[] {
  const N = points.length
  const normals: PolylineNormal[] = []
  if (N === 0) return normals
  if (N === 1) {
    normals.push({ nx: 0, nz: 1, miter: 1.0 })
    return normals
  }

  const segDx: number[] = []
  const segDz: number[] = []
  for (let i = 0; i < N - 1; i++) {
    const a = points[i]!
    const b = points[i + 1]!
    let dx = b.x - a.x
    let dz = b.z - a.z
    const len = Math.hypot(dx, dz)
    if (len > 1e-5) {
      dx /= len
      dz /= len
    } else {
      dx = 0
      dz = 1
    }
    segDx.push(dx)
    segDz.push(dz)
  }

  for (let i = 0; i < N; i++) {
    if (i === 0) {
      normals.push({ nx: -segDz[0]!, nz: segDx[0]!, miter: 1.0 })
    } else if (i === N - 1) {
      normals.push({ nx: -segDz[N - 2]!, nz: segDx[N - 2]!, miter: 1.0 })
    } else {
      normals.push(jointNormal(segDx[i - 1]!, segDz[i - 1]!, segDx[i]!, segDz[i]!))
    }
  }

  if (endNormals?.start) normals[0] = endNormals.start
  if (endNormals?.end) normals[N - 1] = endNormals.end
  return normals
}

type RibbonSlice = { x: number; y: number; z: number; nx: number; nz: number; miter: number; arc: number; uvArc: number }
type BlockedFn = (x: number, z: number, arc: number) => boolean

function ribbonSlices(points: Pt[], normals: PolylineNormal[], arcOffset = 0): RibbonSlice[] {
  const out: RibbonSlice[] = []
  let arc = 0
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!
    const n = normals[i]!
    if (i > 0) arc += Math.hypot(p.x - points[i - 1]!.x, p.z - points[i - 1]!.z)
    out.push({ x: p.x, y: p.y, z: p.z, nx: n.nx, nz: n.nz, miter: n.miter, arc, uvArc: arc + arcOffset })
  }
  return out
}

function lerpSlice(a: RibbonSlice, b: RibbonSlice, t: number): RibbonSlice {
  let nx = a.nx + (b.nx - a.nx) * t
  let nz = a.nz + (b.nz - a.nz) * t
  const l = Math.hypot(nx, nz)
  if (l > 1e-6) { nx /= l; nz /= l } else { nx = a.nx; nz = a.nz }
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
    nx, nz,
    miter: a.miter + (b.miter - a.miter) * t,
    arc: a.arc + (b.arc - a.arc) * t,
    uvArc: a.uvArc + (b.uvArc - a.uvArc) * t,
  }
}

function bisectBoundary(a: RibbonSlice, b: RibbonSlice, lateral: number, blocked: BlockedFn, aFree: boolean): number {
  let lo = 0
  let hi = 1
  for (let k = 0; k < 8; k++) {
    const mid = (lo + hi) / 2
    const s = lerpSlice(a, b, mid)
    const off = lateral * s.miter
    const free = !blocked(s.x + s.nx * off, s.z + s.nz * off, s.arc)
    if (free === aFree) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

type StripOptions = {
  lateral?: number
  blocked?: BlockedFn | null
  uvMetres?: number
  arcOffset?: number
  minRun?: number
}

export function buildStrip(
  points: Pt[],
  normals: PolylineNormal[],
  halfW: number,
  yOffset: number,
  material: THREE.Material,
  opts: StripOptions = {},
): THREE.Mesh | null {
  if (points.length < 2) return null
  const lateral = opts.lateral ?? 0
  const blocked = opts.blocked ?? null
  const slices = ribbonSlices(points, normals, opts.arcOffset ?? 0)
  const free: boolean[] = slices.map((s) => {
    if (!blocked) return true
    const off = lateral * s.miter
    return !blocked(s.x + s.nx * off, s.z + s.nz * off, s.arc)
  })

  const vertices: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  let vCount = 0

  const pushSlice = (s: RibbonSlice): number => {
    const off = lateral * s.miter
    const hw = halfW * s.miter
    vertices.push(
      s.x + s.nx * (off + hw), s.y + yOffset, s.z + s.nz * (off + hw),
      s.x + s.nx * (off - hw), s.y + yOffset, s.z + s.nz * (off - hw),
    )
    if (opts.uvMetres) {
      const m = opts.uvMetres
      uvs.push((lateral + halfW) / m, s.uvArc / m, (lateral - halfW) / m, s.uvArc / m)
    } else {
      const u = s.uvArc / (halfW * 2 * 4)
      uvs.push(0, u, 1, u)
    }
    return vCount++
  }
  const quad = (i0: number, i1: number): void => {
    const a = i0 * 2
    const b = i1 * 2
    indices.push(a, b, a + 1, a + 1, b, b + 1)
  }

  type Run = { slices: RibbonSlice[]; cut: boolean }
  const runs: Run[] = []
  let cur: Run | null = null
  for (let i = 0; i < slices.length - 1; i++) {
    const a = slices[i]!
    const b = slices[i + 1]!
    const fa = free[i]!
    const fb = free[i + 1]!
    if (fa && fb) {
      if (!cur) cur = { slices: [a], cut: false }
      cur.slices.push(b)
    } else if (fa && !fb) {
      const t = bisectBoundary(a, b, lateral, blocked!, true)
      if (!cur) cur = { slices: [a], cut: false }
      if (t > 0.02) cur.slices.push(lerpSlice(a, b, t))
      cur.cut = true
      if (cur.slices.length >= 2) runs.push(cur)
      cur = null
    } else if (!fa && fb) {
      const t = bisectBoundary(a, b, lateral, blocked!, false)
      cur = { slices: t < 0.98 ? [lerpSlice(a, b, t), b] : [b], cut: true }
    } else {
      cur = null
    }
  }
  if (cur && cur.slices.length >= 2) runs.push(cur)
  const minRun = opts.minRun ?? 0
  for (const run of runs) {
    const first = run.slices[0]!
    const end = run.slices[run.slices.length - 1]!
    if (minRun > 0 && run.cut && end.arc - first.arc < minRun) continue
    let prevIdx = pushSlice(first)
    for (let i = 1; i < run.slices.length; i++) {
      const bi = pushSlice(run.slices[i]!)
      quad(prevIdx, bi)
      prevIdx = bi
    }
  }

  if (indices.length === 0) return null
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geo.setIndex(indices)
  geo.computeVertexNormals()

  const mesh = new THREE.Mesh(geo, material)
  mesh.receiveShadow = true
  return mesh
}

export function buildRibbon(
  points: Pt[],
  halfW: number,
  yOffset: number,
  material: THREE.Material,
  normals?: PolylineNormal[],
): THREE.Mesh | null {
  return buildStrip(points, normals ?? computePolylineNormals(points), halfW, yOffset, material)
}

export function shiftRibbonLateral(
  mesh: THREE.Mesh,
  pts: Pt[],
  offset: number,
  normals?: PolylineNormal[],
): void {
  const pos = mesh.geometry.attributes['position'] as THREE.BufferAttribute
  if (!pos) return
  const arr = pos.array as Float32Array
  const norms = normals ?? computePolylineNormals(pts)

  for (let i = 0; i < pts.length && i < norms.length; i++) {
    const norm = norms[i]!
    const effOffset = offset * norm.miter
    for (let side = 0; side < 2; side++) {
      const vi = (i * 2 + side) * 3
      arr[vi]!     += norm.nx * effOffset
      arr[vi + 2]! += norm.nz * effOffset
    }
  }
  pos.needsUpdate = true
  mesh.geometry.computeVertexNormals()
}