/**
 * FacadeRelief — cheap depth for OSM buildings.
 *
 *  1. Height map → tangent-space normal map (Sobel) so window reveals, sills, lintels,
 *     string courses and plinths react to the sun without any extra geometry.
 *  2. Real ledges (cornice, plinth, balcony slabs + railings) built as per-edge boxes
 *     along a footprint ring, sharing 3 materials so the chunk merger keeps draw calls bounded.
 */

import * as THREE from 'three'

// ── Height → normal map ──────────────────────────────────────────────────────

/** Neutral height (no relief). Values above protrude, below recess. */
export const H_FLAT = 128

/**
 * Convert a greyscale height canvas into an OpenGL-convention tangent-space normal map
 * (R = +u, G = +v, B = out). A 3×3 box blur spreads 1-px steps over ~3 px so the relief
 * survives mipmapping; `strength` scales the slope (2.0 ≈ 50° tilt on a 40-level step).
 */
export function heightToNormalTexture(height: HTMLCanvasElement, strength = 2.0): THREE.CanvasTexture {
  const W = height.width
  const H = height.height
  const src = height.getContext('2d')!.getImageData(0, 0, W, H).data

  // Extract + blur the height channel (wrap horizontally: the texture repeats along the wall)
  const raw = new Float32Array(W * H)
  for (let i = 0; i < W * H; i++) raw[i] = src[i * 4]!
  const h = new Float32Array(W * H)
  for (let y = 0; y < H; y++) {
    const ym = Math.max(0, y - 1) * W
    const y0 = y * W
    const yp = Math.min(H - 1, y + 1) * W
    for (let x = 0; x < W; x++) {
      const xm = (x + W - 1) % W
      const xp = (x + 1) % W
      h[y0 + x] = (
        raw[ym + xm]! + raw[ym + x]! + raw[ym + xp]! +
        raw[y0 + xm]! + raw[y0 + x]! + raw[y0 + xp]! +
        raw[yp + xm]! + raw[yp + x]! + raw[yp + xp]!
      ) / 9
    }
  }

  const out = document.createElement('canvas')
  out.width = W
  out.height = H
  const octx = out.getContext('2d')!
  const img = octx.createImageData(W, H)
  const d = img.data
  const k = strength / 255

  for (let y = 0; y < H; y++) {
    const ym = Math.max(0, y - 1) * W
    const y0 = y * W
    const yp = Math.min(H - 1, y + 1) * W
    for (let x = 0; x < W; x++) {
      const xm = (x + W - 1) % W
      const xp = (x + 1) % W
      // Sobel gradients (canvas y grows downward)
      const gx = (h[ym + xp]! + 2 * h[y0 + xp]! + h[yp + xp]!) - (h[ym + xm]! + 2 * h[y0 + xm]! + h[yp + xm]!)
      const gy = (h[yp + xm]! + 2 * h[yp + x]! + h[yp + xp]!) - (h[ym + xm]! + 2 * h[ym + x]! + h[ym + xp]!)
      // Height field normal n = (-dh/du, -dh/dv, 1); v points to the image top (flipY), so dh/dv = -gy.
      let nx = -gx * k
      let ny = gy * k
      let nz = 1
      const inv = 1 / Math.hypot(nx, ny, nz)
      nx *= inv; ny *= inv; nz *= inv
      const o = (y0 + x) * 4
      d[o] = (nx * 0.5 + 0.5) * 255
      d[o + 1] = (ny * 0.5 + 0.5) * 255
      d[o + 2] = (nz * 0.5 + 0.5) * 255
      d[o + 3] = 255
    }
  }
  octx.putImageData(img, 0, 0)

  const tex = new THREE.CanvasTexture(out)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.anisotropy = 4
  tex.colorSpace = THREE.NoColorSpace
  return tex
}

// ── Shared ledge materials (3 draw calls per chunk at most) ──────────────────

export const LEDGE_MAT = new THREE.MeshStandardMaterial({ color: 0xd9d3c6, roughness: 0.9, metalness: 0.02 })
export const PLINTH_MAT = new THREE.MeshStandardMaterial({ color: 0x6b6660, roughness: 0.92, metalness: 0.02 })
export const IRON_MAT = new THREE.MeshStandardMaterial({ color: 0x1e2126, roughness: 0.55, metalness: 0.6 })

// ── Ledge geometry ───────────────────────────────────────────────────────────

/** Signed area of a ring in the (x, z) plane; > 0 means counter-clockwise when seen from above (+y). */
function signedArea(ring: THREE.Vector2[]): number {
  let a = 0
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i]!
    const q = ring[(i + 1) % ring.length]!
    a += p.x * q.y - q.x * p.y
  }
  return a / 2
}

/** Cap on ledge edges per ring so a 60-node curved facade does not explode the vertex budget. */
const MAX_LEDGE_EDGES = 20
const MIN_EDGE_LEN = 0.8

/**
 * Build a ledge band along `ring`: one open box per edge (front, top, bottom faces — the
 * back sits in the wall and the ends overlap at corners), whose outer face is `depth` m
 * outward from the wall and inner face `inner` m outward (0 = flush with the wall), `thick`
 * tall, with its bottom at `y`. A railing on the lip of a 0.3 m slab is (depth 0.3, inner 0.26).
 */
export function buildLedgeBand(
  ring: THREE.Vector2[],
  y: number,
  thick: number,
  depth: number,
  inner = 0,
  /** How far each band runs past its corners (default: `depth`, so adjacent slabs close the corner). */
  cornerExt: number = depth,
): THREE.BufferGeometry | null {
  const N = ring.length
  if (N < 3) return null
  // Outward normal: for a CCW ring (seen from +y, x right / z down) the outward side is (dz, -dx)
  const ccw = signedArea(ring) > 0
  const sign = ccw ? 1 : -1

  // Choose the edges to dress (longest first if over the cap)
  const edges: { i: number; len: number }[] = []
  for (let i = 0; i < N; i++) {
    const p = ring[i]!
    const q = ring[(i + 1) % N]!
    const len = Math.hypot(q.x - p.x, q.y - p.y)
    if (len >= MIN_EDGE_LEN) edges.push({ i, len })
  }
  if (edges.length === 0) return null
  if (edges.length > MAX_LEDGE_EDGES) {
    edges.sort((a, b) => b.len - a.len)
    edges.length = MAX_LEDGE_EDGES
  }

  const pos: number[] = []
  const nrm: number[] = []
  const idx: number[] = []
  const y0 = y
  const y1 = y + thick

  for (const e of edges) {
    const p = ring[e.i]!
    const q = ring[(e.i + 1) % N]!
    const dx = (q.x - p.x) / e.len
    const dz = (q.y - p.y) / e.len
    const ox = dz * sign
    const oz = -dx * sign
    // Extend past both corners so adjacent bands overlap at corners (rails use ~0)
    const ext = cornerExt
    const ax = p.x - dx * ext, az = p.y - dz * ext
    const bx = q.x + dx * ext, bz = q.y + dz * ext
    // Inner line and outer line, both measured outward from the wall face
    const iax = ax + ox * inner, iaz = az + oz * inner
    const ibx = bx + ox * inner, ibz = bz + oz * inner
    const oax = ax + ox * depth, oaz = az + oz * depth
    const obx = bx + ox * depth, obz = bz + oz * depth

    // Front face (outward)
    let b = pos.length / 3
    pos.push(oax, y0, oaz,  obx, y0, obz,  obx, y1, obz,  oax, y1, oaz)
    nrm.push(ox, 0, oz,  ox, 0, oz,  ox, 0, oz,  ox, 0, oz)
    idx.push(b, b + 1, b + 2,  b, b + 2, b + 3)
    // Top face
    b = pos.length / 3
    pos.push(iax, y1, iaz,  ibx, y1, ibz,  obx, y1, obz,  oax, y1, oaz)
    nrm.push(0, 1, 0,  0, 1, 0,  0, 1, 0,  0, 1, 0)
    idx.push(b, b + 2, b + 1,  b, b + 3, b + 2)
    // Bottom face
    b = pos.length / 3
    pos.push(iax, y0, iaz,  ibx, y0, ibz,  obx, y0, obz,  oax, y0, oaz)
    nrm.push(0, -1, 0,  0, -1, 0,  0, -1, 0,  0, -1, 0)
    idx.push(b, b + 1, b + 2,  b, b + 2, b + 3)
  }

  // Winding check: the front face must face outward. Our quads are pushed as (a0,b0,b1,a1) with
  // triangle (0,1,2): for a CCW ring the tangent × up ordering makes it outward; flip otherwise.
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3))
  geo.setIndex(idx)
  // Guarantee triangle winding agrees with the stored outward normals (lighting uses the
  // explicit normals; culling uses the winding).
  const ref = new THREE.BufferGeometry()
  ref.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  ref.setIndex(idx)
  ref.computeVertexNormals()
  const cn = ref.getAttribute('normal') as THREE.BufferAttribute
  const en = geo.getAttribute('normal') as THREE.BufferAttribute
  // Compare the first front face normal; if opposed, reverse every triangle.
  const dot = cn.getX(0) * en.getX(0) + cn.getY(0) * en.getY(0) + cn.getZ(0) * en.getZ(0)
  if (dot < 0) {
    for (let t = 0; t < idx.length; t += 3) {
      const tmp = idx[t + 1]!
      idx[t + 1] = idx[t + 2]!
      idx[t + 2] = tmp
    }
    geo.setIndex(idx)
  }
  ref.dispose()
  return geo
}

export interface LedgeOptions {
  /** Ring in footprint (x, z) coordinates. */
  ring: THREE.Vector2[]
  bottomY: number
  topY: number
  /** Floor height in metres (for balcony placement). */
  floorH: number
  levels: number
  cornice: boolean
  plinth: boolean
  balconies: boolean
}

/**
 * Add cornice / plinth / balcony meshes for one ring to `group`. Every mesh casts and
 * receives shadows with the same flags so the chunk merger buckets them into ≤ 3 draw calls.
 */
export function addLedges(group: THREE.Group, o: LedgeOptions): number {
  let verts = 0
  const add = (geo: THREE.BufferGeometry | null, mat: THREE.MeshStandardMaterial) => {
    if (!geo) return
    const m = new THREE.Mesh(geo, mat)
    m.castShadow = true
    m.receiveShadow = true
    group.add(m)
    verts += geo.getAttribute('position').count
  }

  if (o.cornice) {
    // Roofline cornice: 0.28 m deep, 0.22 m tall, top flush with the roof base.
    add(buildLedgeBand(o.ring, o.topY - 0.22, 0.22, 0.28), LEDGE_MAT)
  }
  if (o.plinth) {
    add(buildLedgeBand(o.ring, o.bottomY, 0.6, 0.08), PLINTH_MAT)
  }
  if (o.balconies && o.levels >= 4) {
    for (const floor of [2, 5]) {
      if (floor >= o.levels) continue
      const y = o.bottomY + floor * o.floorH
      add(buildLedgeBand(o.ring, y - 0.12, 0.12, 0.3), LEDGE_MAT)          // slab
      // Wrought-iron railing on the lip: a handrail and a low kick rail (the bars are in the texture);
      // a solid 0.9 m box would read as a heavy black band from the street.
      add(buildLedgeBand(o.ring, y + 0.86, 0.06, 0.3, 0.25, 0.02), IRON_MAT) // handrail (no corner hooks)
      add(buildLedgeBand(o.ring, y, 0.05, 0.3, 0.25, 0.02), IRON_MAT)        // kick rail
    }
  }
  return verts
}
