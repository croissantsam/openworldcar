/**
 * StorefrontGenerator — real shops on real facades: ground-floor storefront
 * band with the shop's real name, house-number plaques, street-name plaques.
 *
 * Called from ChunkLoader.buildGroupIncremental() for each chunk (or delivery
 * delta) with that chunk's POIs, buildings and roads.
 *
 * Everything is derived from the OSM data already in the chunk (names, brands,
 * shop/amenity tags, addr:housenumber, road names). One universal signage
 * style everywhere in the world — no city- or country-specific look.
 *
 * Output: ONE Group holding at most three meshes, each one draw call:
 *   - atlas mesh   : fascia boards + house-number plaques + street plaques,
 *                    one canvas atlas texture (≤ 2048²) → one material
 *   - vitrine mesh : interior-mapped glass (StorefrontInterior shader): a
 *                    virtual room per shop, chosen by category, seen through
 *                    tinted glass with fresnel reflections; door glass too
 *   - joinery mesh : real geometry, vertex-coloured — window frame, mullions,
 *                    stallriser + sill, glazed door with handle, cornice above
 *                    the fascia, awnings for food categories
 */

import * as THREE from 'three'
import type { PointOfInterest, Road, Building } from '@world-drive/shared'
import { getVitrineMaterial, interiorRowFor } from './StorefrontInterior.js'

// ─── Tunables ────────────────────────────────────────────────────────────────

const LANE_WIDTH = 3.6
const SHOP_MATCH_DIST = 6 // m — nearest facade edge for a shop outside any footprint
const HOUSENUMBER_MATCH_DIST = 8 // m
const STREET_PLAQUE_MATCH_DIST = 15 // m
const ROAD_FACING_DIST = 25 // m — an edge "faces a road" if a road centre-line is within this
const WALL_OFFSET = 0.03 // m in front of the wall
const PLAQUE_OFFSET = 0.05 // m (in front of a vitrine, avoids z-fighting)

const VITRINE_Y0 = 0.4
const VITRINE_Y1 = 3.0
const FASCIA_Y0 = 3.05
const FASCIA_Y1 = 3.75
const HOUSENUMBER_Y = 2.2
const HOUSENUMBER_W = 0.3
const HOUSENUMBER_H = 0.2
const STREET_PLAQUE_Y = 2.6
const STREET_PLAQUE_W = 0.9
const STREET_PLAQUE_H = 0.25

// Atlas layout (canvas pixels)
const ATLAS_W = 1024
const ATLAS_MAX_H = 1024
const CELL_SIGN_W = 320
const CELL_SIGN_H = 80
const CELL_NUM_W = 64
const CELL_NUM_H = 48

const SHOP_KINDS = new Set(['shop', 'amenity', 'office', 'craft', 'tourism'])
const AWNING_CATS = new Set(['cafe', 'restaurant', 'bakery', 'bar', 'ice_cream', 'fast_food', 'pub'])
const PLAQUE_HIGHWAYS = new Set([
  'motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'residential',
  'living_street', 'pedestrian', 'unclassified',
])

// ─── Types ───────────────────────────────────────────────────────────────────

type Edge = {
  bi: number // building index
  ei: number // edge index in footprint
  ax: number
  az: number
  len: number
  tx: number // unit tangent (a → b)
  tz: number
  nx: number // outward unit normal
  nz: number
  facesRoad: boolean | undefined // lazily computed
}

type BuildingRec = {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
  edges: Edge[]
  fp: readonly { x: number; z: number }[]
}

type Seg = { ax: number; az: number; bx: number; bz: number; halfW: number }

type Cell = { px: number; py: number; pw: number; ph: number; u0: number; v0: number; u1: number; v1: number }

type SignStyle = {
  bg: string
  fg: string
  cross?: boolean
  border?: string
  tint: number // 0xRRGGBB vitrine tint
  awning?: number
}

type StorefrontItem = {
  poi: PointOfInterest
  edge: Edge
  t: number // projection along the edge (m)
  label: string
  style: SignStyle
  category: string
}

// ─── Shared materials (module-level, reused across chunks) ───────────────────

let joineryMat: THREE.MeshStandardMaterial | null = null

/** Frames, mullions, stallrisers, doors, cornices and awnings: one vertex-coloured material. */
function getJoineryMat(): THREE.MeshStandardMaterial {
  if (!joineryMat) {
    joineryMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      vertexColors: true,
      roughness: 0.55,
      metalness: 0.08,
      side: THREE.DoubleSide, // awning undersides are seen from the street
    })
  }
  return joineryMat
}

// Joinery layout (metres)
const POST_W = 0.06 // outer frame posts / door post
const POST_D = 0.08 // how far the frame protrudes from the wall
const MULLION_W = 0.05
const MULLION_D = 0.06
const RISER_H = 0.4 // stallriser under the glass
const RISER_D = 0.07
const SILL_H = 0.04
const SILL_D = 0.09
const RAIL_Y0 = 2.94 // top rail of the frame, up to the fascia
const DOOR_W = 1.0 // door incl. its own frame
const DOOR_D = 0.05
const DOOR_KICK_H = 0.9
const DOOR_RAIL_Y = 2.3
const CORNICE_H = 0.07
const CORNICE_D = 0.12
const MIN_DOOR_FRONT = 2.4 // narrower storefronts get no door

const SILL_COLOR = 0xd6d0c2
const HANDLE_COLOR = 0xd0d2d6
const CORNICE_COLOR = 0x26262a

function hexColor(css: string): number {
  return parseInt(css.slice(1), 16) || 0x2b2b2e
}

/** mix(color, black, k) as 0xRRGGBB */
function darken(color: number, k: number): number {
  const r = Math.round(((color >> 16) & 255) * (1 - k))
  const g = Math.round(((color >> 8) & 255) * (1 - k))
  const b = Math.round((color & 255) * (1 - k))
  return (r << 16) | (g << 8) | b
}

// ─── Small geometry helpers ──────────────────────────────────────────────────

function pointInPolygon(px: number, pz: number, fp: readonly { x: number; z: number }[]): boolean {
  let inside = false
  const n = fp.length
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const pi = fp[i]!
    const pj = fp[j]!
    if ((pi.z > pz) !== (pj.z > pz) && px < ((pj.x - pi.x) * (pz - pi.z)) / (pj.z - pi.z) + pi.x) inside = !inside
  }
  return inside
}

/** Distance² from point to segment + parameter t (0..len along the tangent). */
function edgeDist2(e: Edge, px: number, pz: number): { d2: number; t: number } {
  const dx = px - e.ax
  const dz = pz - e.az
  let t = dx * e.tx + dz * e.tz
  if (t < 0) t = 0
  else if (t > e.len) t = e.len
  const cx = e.ax + e.tx * t - px
  const cz = e.az + e.tz * t - pz
  return { d2: cx * cx + cz * cz, t }
}

function segDist2(s: Seg, px: number, pz: number): number {
  const vx = s.bx - s.ax
  const vz = s.bz - s.az
  const l2 = vx * vx + vz * vz
  let t = l2 > 0 ? ((px - s.ax) * vx + (pz - s.az) * vz) / l2 : 0
  t = t < 0 ? 0 : t > 1 ? 1 : t
  const cx = s.ax + vx * t - px
  const cz = s.az + vz * t - pz
  return cx * cx + cz * cz
}

function hashStr(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function hslHex(h: number, s: number, l: number): number {
  return new THREE.Color().setHSL(h, s, l).getHex()
}

// ─── Category styling (global, tag-driven) ───────────────────────────────────

function categoryOf(poi: PointOfInterest): string {
  const t = poi.tags
  if (!t) return poi.category === 'restaurant' ? 'restaurant' : 'shop'
  return t['shop'] ?? t['amenity'] ?? t['craft'] ?? t['office'] ?? t['tourism'] ?? 'shop'
}

function categoryWord(cat: string): string {
  const w = cat.replace(/_/g, ' ')
  return w.charAt(0).toUpperCase() + w.slice(1)
}

function styleFor(cat: string, label: string): SignStyle {
  switch (cat) {
    case 'bakery':
    case 'pastry':
    case 'confectionery':
    case 'chocolate':
      return { bg: '#6b3f1d', fg: '#f6e7c8', tint: 0x4a3b22, awning: 0x8a4a22 }
    case 'pharmacy':
    case 'chemist':
      return { bg: '#0f8a3c', fg: '#ffffff', cross: true, tint: 0x1f4a2a }
    case 'cafe':
    case 'coffee':
    case 'ice_cream':
      return { bg: '#7a1f1f', fg: '#f3e6cf', tint: 0x4a2a1a, awning: 0x8c2a2a }
    case 'restaurant':
    case 'bar':
    case 'pub':
    case 'fast_food':
    case 'food_court':
    case 'biergarten':
      return { bg: '#1f4d33', fg: '#f3e6cf', tint: 0x2a3a24, awning: 0x2f6a45 }
    case 'bank':
    case 'atm':
    case 'bureau_de_change':
    case 'insurance':
      return { bg: '#16274d', fg: '#ffffff', tint: 0x1c2a44 }
    case 'supermarket':
    case 'convenience':
    case 'greengrocer':
    case 'deli':
    case 'frozen_food':
    case 'variety_store':
    case 'department_store': {
      const hue = (hashStr(label) % 360) / 360
      const bgHex = hslHex(hue, 0.78, 0.42)
      return { bg: `#${bgHex.toString(16).padStart(6, '0')}`, fg: '#ffffff', tint: hslHex(hue, 0.35, 0.2) }
    }
    case 'butcher':
      return { bg: '#8a1a1a', fg: '#ffffff', tint: 0x4a2222 }
    case 'clothes':
    case 'shoes':
    case 'boutique':
    case 'fashion':
    case 'jewelry':
    case 'optician':
    case 'perfumery':
    case 'cosmetics':
    case 'beauty':
    case 'hairdresser':
      return { bg: '#1b1b1f', fg: '#f0ece4', tint: 0x2e2e34 }
    case 'books':
    case 'stationery':
    case 'newsagent':
    case 'kiosk':
      return { bg: '#3a4a6a', fg: '#ffffff', tint: 0x2a3040 }
    case 'florist':
    case 'garden_centre':
      return { bg: '#2f6a3a', fg: '#ffffff', tint: 0x2a4a2a }
    case 'hotel':
    case 'guest_house':
    case 'hostel':
      return { bg: '#3b2a4d', fg: '#f3e6cf', tint: 0x30283a }
    case 'mobile_phone':
    case 'electronics':
    case 'computer':
      return { bg: '#0c5a8a', fg: '#ffffff', tint: 0x1c3444 }
    case 'tobacco':
    case 'e-cigarette':
    case 'lottery':
      return { bg: '#a83232', fg: '#ffffff', tint: 0x442222 }
    default:
      return { bg: '#2b2b2e', fg: '#f4f1ea', tint: 0x2a2c30 }
  }
}

const HOUSENUMBER_STYLE: SignStyle = { bg: '#f4f2ea', fg: '#1d1d1f', border: '#4a4a4a', tint: 0 }
const STREET_STYLE: SignStyle = { bg: '#2a2d33', fg: '#ffffff', border: '#e8e6df', tint: 0 }

// ─── Atlas (layout first, then draw) ─────────────────────────────────────────

type AtlasEntry = { x: number; y: number; w: number; h: number; text: string; style: SignStyle; kind: 'sign' | 'number' }

class AtlasLayout {
  private shelves: { y: number; h: number; x: number }[] = []
  private usedH = 0
  readonly entries: AtlasEntry[] = []
  private cache = new Map<string, Cell | null>()

  /** Returns UV cell or null when the atlas is full. Cached by text+style. */
  get(kind: 'sign' | 'number', text: string, style: SignStyle): Cell | null {
    const key = `${kind}|${style.bg}|${style.cross ? 1 : 0}|${text}`
    const hit = this.cache.get(key)
    if (hit !== undefined) return hit
    const w = kind === 'sign' ? CELL_SIGN_W : CELL_NUM_W
    const h = kind === 'sign' ? CELL_SIGN_H : CELL_NUM_H
    let shelf = this.shelves.find((s) => s.h === h && s.x + w <= ATLAS_W)
    if (!shelf) {
      if (this.usedH + h > ATLAS_MAX_H) {
        this.cache.set(key, null)
        return null
      }
      shelf = { y: this.usedH, h, x: 0 }
      this.usedH += h
      this.shelves.push(shelf)
    }
    const x = shelf.x
    shelf.x += w
    this.entries.push({ x, y: shelf.y, w, h, text, style, kind })
    // u/v are filled once the canvas height is known (finalize)
    const cell: Cell = { px: x, py: shelf.y, pw: w, ph: h, u0: 0, v0: 0, u1: 0, v1: 0 }
    this.cache.set(key, cell)
    return cell
  }

  /** Canvas height (power of two, ≥ 64). */
  height(): number {
    let h = 64
    while (h < this.usedH) h *= 2
    return h
  }

  finalize(canvasH: number): void {
    for (const c of this.cache.values()) {
      if (!c) continue
      const pad = 1.5
      c.u0 = (c.px + pad) / ATLAS_W
      c.u1 = (c.px + c.pw - pad) / ATLAS_W
      c.v1 = 1 - (c.py + pad) / canvasH
      c.v0 = 1 - (c.py + c.ph - pad) / canvasH
    }
  }
}

function fitFont(ctx: CanvasRenderingContext2D, text: string, maxW: number, basePx: number, minPx: number): number {
  let px = basePx
  ctx.font = `bold ${px}px "Arial Narrow", "Helvetica Neue", Helvetica, Arial, sans-serif`
  let w = ctx.measureText(text).width
  if (w > maxW) {
    px = Math.max(minPx, Math.floor((px * maxW) / w))
    ctx.font = `bold ${px}px "Arial Narrow", "Helvetica Neue", Helvetica, Arial, sans-serif`
    w = ctx.measureText(text).width
  }
  return w
}

function drawAtlas(layout: AtlasLayout, canvasH: number): HTMLCanvasElement | null {
  const canvas = document.createElement('canvas')
  canvas.width = ATLAS_W
  canvas.height = canvasH
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, ATLAS_W, canvasH)
  ctx.textBaseline = 'middle'

  for (const e of layout.entries) {
    const { x, y, w, h, style } = e
    ctx.fillStyle = style.bg
    ctx.fillRect(x, y, w, h)
    if (style.border) {
      ctx.strokeStyle = style.border
      ctx.lineWidth = e.kind === 'number' ? 3 : 4
      ctx.strokeRect(x + 3, y + 3, w - 6, h - 6)
    }
    let textX = x + w / 2
    let avail = w - 24
    if (style.cross) {
      // white cross emblem at the left of the fascia
      const s = h * 0.62
      const cx = x + 14 + s / 2
      const cy = y + h / 2
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(cx - s / 6, cy - s / 2, s / 3, s)
      ctx.fillRect(cx - s / 2, cy - s / 6, s, s / 3)
      textX = x + 24 + s + (w - 24 - s - 12) / 2
      avail = w - 24 - s - 24
    }
    let txt = e.text
    if (e.kind === 'sign' && !style.cross && txt.length > 34) txt = txt.slice(0, 33) + '…'
    if (e.kind === 'number') {
      fitFont(ctx, txt, w - 10, 34, 14)
    } else if (style === STREET_STYLE) {
      fitFont(ctx, txt, avail, 46, 16)
    } else {
      fitFont(ctx, txt, avail, 52, 16)
      // subtle lit underline on fascias
      ctx.fillStyle = 'rgba(255,255,255,0.12)'
      ctx.fillRect(x + 8, y + h - 7, w - 16, 3)
    }
    ctx.fillStyle = style.fg
    ctx.textAlign = 'center'
    ctx.fillText(txt, textX, y + h / 2 + 1)
  }
  return canvas
}

// ─── Quad builder (positions / normals / uvs / colours) ──────────────────────

class QuadBuffer {
  pos: number[] = []
  nor: number[] = []
  uv: number[] = []
  col: number[] = []
  idx: number[] = []
  private n = 0
  /** Cell-textured quads whose UVs are resolved at geometry build time (atlas finalized late). */
  private pending: { at: number; cell: Cell }[] = []

  /**
   * Adds a vertical quad centred at (cx, cz) along tangent (tx,tz) with width w,
   * from y0 to y1, facing +normal. Optional per-quad colour and UV cell.
   */
  addWallQuad(
    cx: number, cz: number, tx: number, tz: number, nx: number, nz: number,
    w: number, y0: number, y1: number, cell: Cell | null, color: number | null,
  ): void {
    const hx = (tx * w) / 2
    const hz = (tz * w) / 2
    const x0 = cx - hx, z0 = cz - hz, x1 = cx + hx, z1 = cz + hz
    // Winding: the default order (−t end → +t end, bottom → top) has face normal
    // t × up = (−tz, 0, tx). Flip it when the outward normal is the other side.
    const cross = tx * nz - tz * nx // +1 when n = (−tz, tx), −1 when n = (tz, −tx)
    const flip = cross < 0
    this.push4(
      flip ? [x1, y0, z1, x0, y0, z0, x0, y1, z0, x1, y1, z1] : [x0, y0, z0, x1, y0, z1, x1, y1, z1, x0, y1, z0],
      nx, nz, cell, color,
    )
  }

  /** Sloped awning: attached along the wall at y=yTop, projecting `depth` out and dropping to yLow. */
  addAwning(
    cx: number, cz: number, tx: number, tz: number, nx: number, nz: number,
    w: number, yTop: number, yLow: number, depth: number, color: number,
  ): void {
    const hx = (tx * w) / 2
    const hz = (tz * w) / 2
    const ox = nx * depth
    const oz = nz * depth
    const p = [
      cx - hx, yTop, cz - hz,
      cx + hx, yTop, cz + hz,
      cx + hx + ox, yLow, cz + hz + oz,
      cx - hx + ox, yLow, cz - hz + oz,
    ]
    // normal ≈ up-ish, tilted outward
    const len = Math.hypot(depth, yTop - yLow)
    const uy = depth / len
    const un = (yTop - yLow) / len
    const b = this.n
    for (let i = 0; i < 4; i++) {
      this.pos.push(p[i * 3]!, p[i * 3 + 1]!, p[i * 3 + 2]!)
      this.nor.push(nx * un, uy, nz * un)
      this.uv.push(i === 1 || i === 2 ? 1 : 0, i >= 2 ? 1 : 0)
      const r = ((color >> 16) & 255) / 255, g = ((color >> 8) & 255) / 255, bl = (color & 255) / 255
      this.col.push(r, g, bl)
    }
    this.idx.push(b, b + 1, b + 2, b, b + 2, b + 3)
    this.n += 4
  }

  private push4(p: number[], nx: number, nz: number, cell: Cell | null, color: number | null): void {
    const b = this.n
    for (let i = 0; i < 4; i++) {
      this.pos.push(p[i * 3]!, p[i * 3 + 1]!, p[i * 3 + 2]!)
      this.nor.push(nx, 0, nz)
      if (color !== null) {
        this.col.push(((color >> 16) & 255) / 255, ((color >> 8) & 255) / 255, (color & 255) / 255)
      }
    }
    // UVs: vertices 0,1 = bottom, 2,3 = top; `flip` says which end is the viewer's left.
    // Cell UVs are only known after the atlas is finalized → resolved in toGeometry().
    if (cell) this.pending.push({ at: this.uv.length, cell })
    this.uv.push(0, 0, 1, 0, 1, 1, 0, 1)
    this.idx.push(b, b + 1, b + 2, b, b + 2, b + 3)
    this.n += 4
  }

  get count(): number {
    return this.n
  }

  toGeometry(withColor: boolean): THREE.BufferGeometry {
    for (const p of this.pending) {
      const c = p.cell
      // both windings start at the viewer's bottom-left corner (CCW seen from outside)
      const uL = c.u0
      const uR = c.u1
      const a = p.at
      this.uv[a] = uL; this.uv[a + 1] = c.v0
      this.uv[a + 2] = uR; this.uv[a + 3] = c.v0
      this.uv[a + 4] = uR; this.uv[a + 5] = c.v1
      this.uv[a + 6] = uL; this.uv[a + 7] = c.v1
    }
    this.pending.length = 0
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3))
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2))
    if (withColor) g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3))
    g.setIndex(this.idx)
    g.computeBoundingSphere()
    return g
  }
}

// ─── Storefront frame: room-local coordinates ────────────────────────────────
//
// A storefront is laid out in a local frame: origin = the left end of the frame
// as seen from the street, x along `r` (rightward for the viewer), y = world
// height, d along the outward normal `n` (in front of the wall).

type Frame = { ox: number; oz: number; rx: number; rz: number; nx: number; nz: number }

/** Interior-mapped glass panes (custom attributes → skipMerge). */
class GlassBuffer {
  private pos: number[] = []
  private nor: number[] = []
  private uv: number[] = []
  private tan: number[] = []
  private room: number[] = []
  private idx: number[] = []
  private n = 0

  /**
   * One pane of a room. Room = width W (frame-local x 0..W), depth D, atlas row,
   * flags (bit 0 = mirrored). The pane covers xa..xb × y0..y1, `off` in front of the wall.
   */
  addPane(f: Frame, W: number, D: number, row: number, flags: number, xa: number, xb: number, y0: number, y1: number, off: number): void {
    const b = this.n
    const c: [number, number][] = [[xa, y0], [xb, y0], [xb, y1], [xa, y1]]
    for (const [x, y] of c) {
      this.pos.push(f.ox + f.rx * x + f.nx * off, y, f.oz + f.rz * x + f.nz * off)
      this.nor.push(f.nx, 0, f.nz)
      this.uv.push(x / W, (y - y0) / (y1 - y0))
      this.tan.push(f.rx, 0, f.rz)
      this.room.push(W, D, row, flags)
    }
    this.idx.push(b, b + 1, b + 2, b, b + 2, b + 3)
    this.n += 4
  }

  get count(): number {
    return this.n
  }

  toGeometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3))
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2))
    g.setAttribute('aTangent', new THREE.Float32BufferAttribute(this.tan, 3))
    g.setAttribute('aRoom', new THREE.Float32BufferAttribute(this.room, 4))
    g.setIndex(this.idx)
    g.computeBoundingSphere()
    return g
  }
}

/** Vertex-coloured boxes (frames, doors, sills…) and awnings. */
class JoineryBuffer {
  private pos: number[] = []
  private nor: number[] = []
  private col: number[] = []
  private idx: number[] = []
  private n = 0

  private quad(p: number[], nx: number, ny: number, nz: number, color: number): void {
    const b = this.n
    const r = ((color >> 16) & 255) / 255, g = ((color >> 8) & 255) / 255, bl = (color & 255) / 255
    for (let i = 0; i < 4; i++) {
      this.pos.push(p[i * 3]!, p[i * 3 + 1]!, p[i * 3 + 2]!)
      this.nor.push(nx, ny, nz)
      this.col.push(r, g, bl)
    }
    this.idx.push(b, b + 1, b + 2, b, b + 2, b + 3)
    this.n += 4
  }

  /**
   * Box in the storefront frame: x xa..xb, y y0..y1, depth d0..d1 along the
   * normal. The back face (against the wall) is omitted. CCW windings derived
   * for r = (nz, −nx): r × n = −y, r × y = n.
   */
  addBox(f: Frame, xa: number, xb: number, y0: number, y1: number, d0: number, d1: number, color: number): void {
    const P = (x: number, y: number, d: number): [number, number, number] => [f.ox + f.rx * x + f.nx * d, y, f.oz + f.rz * x + f.nz * d]
    const { nx, nz, rx, rz } = f
    // front (+n)
    this.quad([...P(xa, y0, d1), ...P(xb, y0, d1), ...P(xb, y1, d1), ...P(xa, y1, d1)], nx, 0, nz, color)
    // right (+r): on-screen right is −n
    this.quad([...P(xb, y0, d1), ...P(xb, y0, d0), ...P(xb, y1, d0), ...P(xb, y1, d1)], rx, 0, rz, color)
    // left (−r): on-screen right is +n
    this.quad([...P(xa, y0, d0), ...P(xa, y0, d1), ...P(xa, y1, d1), ...P(xa, y1, d0)], -rx, 0, -rz, color)
    // top (+y)
    this.quad([...P(xa, y1, d1), ...P(xb, y1, d1), ...P(xb, y1, d0), ...P(xa, y1, d0)], 0, 1, 0, color)
    // bottom (−y)
    this.quad([...P(xa, y0, d0), ...P(xb, y0, d0), ...P(xb, y0, d1), ...P(xa, y0, d1)], 0, -1, 0, color)
  }

  /** Sloped awning attached along the wall at yTop, projecting `depth` out and dropping to yLow (DoubleSide material). */
  addAwning(f: Frame, xa: number, xb: number, yTop: number, yLow: number, depth: number, color: number): void {
    const P = (x: number, y: number, d: number): [number, number, number] => [f.ox + f.rx * x + f.nx * d, y, f.oz + f.rz * x + f.nz * d]
    const len = Math.hypot(depth, yTop - yLow)
    const uy = depth / len
    const un = (yTop - yLow) / len
    // top face: winding (p0, p3, p2, p1) → normal up-ish, tilted outward
    this.quad([...P(xa, yTop, 0), ...P(xa, yLow, depth), ...P(xb, yLow, depth), ...P(xb, yTop, 0)], f.nx * un, uy, f.nz * un, color)
    // valance: short vertical flap at the outer edge
    this.quad([...P(xa, yLow - 0.18, depth), ...P(xb, yLow - 0.18, depth), ...P(xb, yLow, depth), ...P(xa, yLow, depth)], f.nx, 0, f.nz, darken(color, 0.12))
  }

  get count(): number {
    return this.n
  }

  toGeometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3))
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3))
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3))
    g.setIndex(this.idx)
    g.computeBoundingSphere()
    return g
  }
}

// ─── Generator ───────────────────────────────────────────────────────────────

export class StorefrontGenerator {
  static generate(pois: PointOfInterest[], buildings: Building[], roads: Road[]): THREE.Group | null {
    if (typeof document === 'undefined') return null
    if (buildings.length === 0) return null

    // ── Candidate POIs ──────────────────────────────────────────────────────
    const shops: PointOfInterest[] = []
    const numbers: PointOfInterest[] = []
    for (const p of pois) {
      const k = p.kind
      if (!k) continue
      const tags = p.tags
      if (SHOP_KINDS.has(k)) {
        if (tags) {
          const lvl = tags['level']
          if (lvl !== undefined && lvl !== '0' && Number(lvl) !== 0) continue
          if (tags['indoor'] !== undefined) continue
          if (tags['addr:housenumber']) numbers.push(p)
        }
        shops.push(p)
      } else if (k === 'housenumber') {
        if (tags?.['addr:housenumber']) numbers.push(p)
      }
    }
    const namedRoads = roads.filter((r) => !!r.name && PLAQUE_HIGHWAYS.has(r.highway) && r.points.length >= 2)
    if (shops.length === 0 && numbers.length === 0 && namedRoads.length === 0) return null

    // ── Building facade edges ───────────────────────────────────────────────
    const recs: BuildingRec[] = []
    const allEdges: Edge[] = []
    let gMinX = Infinity, gMaxX = -Infinity, gMinZ = Infinity, gMaxZ = -Infinity
    for (let bi = 0; bi < buildings.length; bi++) {
      const b = buildings[bi]!
      const fp = b.footprint
      if (fp.length < 3) continue
      if ((b.minHeight ?? 0) > 0.5) continue
      if (b.buildingType === 'roof' || b.buildingType === 'carport') continue
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
      let area = 0
      for (let i = 0; i < fp.length; i++) {
        const a = fp[i]!
        const c = fp[(i + 1) % fp.length]!
        area += a.x * c.z - c.x * a.z
        if (a.x < minX) minX = a.x
        if (a.x > maxX) maxX = a.x
        if (a.z < minZ) minZ = a.z
        if (a.z > maxZ) maxZ = a.z
      }
      const ccw = area > 0 // CCW in the (x, z) plane
      const edges: Edge[] = []
      for (let i = 0; i < fp.length; i++) {
        const a = fp[i]!
        const c = fp[(i + 1) % fp.length]!
        const dx = c.x - a.x
        const dz = c.z - a.z
        const len = Math.hypot(dx, dz)
        if (len < 1.2) continue
        const tx = dx / len
        const tz = dz / len
        // outward normal: for CCW (in x,z) polygons the outward side is (tz, -tx)
        const nx = ccw ? tz : -tz
        const nz = ccw ? -tx : tx
        const e: Edge = { bi, ei: i, ax: a.x, az: a.z, len, tx, tz, nx, nz, facesRoad: undefined }
        edges.push(e)
        allEdges.push(e)
      }
      recs[bi] = { minX, maxX, minZ, maxZ, edges, fp }
      if (minX < gMinX) gMinX = minX
      if (maxX > gMaxX) gMaxX = maxX
      if (minZ < gMinZ) gMinZ = minZ
      if (maxZ > gMaxZ) gMaxZ = maxZ
    }
    if (allEdges.length === 0) return null

    // ── Road segments near this chunk's buildings (ribbon half-widths) ─────
    const segs: Seg[] = []
    const pad = ROAD_FACING_DIST + 5
    for (const r of roads) {
      const pts = r.points
      if (pts.length < 2) continue
      const halfW = (r.explicitWidth && r.explicitWidth >= 3 ? r.explicitWidth : Math.max(1, r.lanes) * LANE_WIDTH) / 2 + 1
      for (let i = 0; i + 1 < pts.length; i++) {
        const a = pts[i]!
        const c = pts[i + 1]!
        const sMinX = Math.min(a.x, c.x), sMaxX = Math.max(a.x, c.x)
        const sMinZ = Math.min(a.z, c.z), sMaxZ = Math.max(a.z, c.z)
        if (sMaxX < gMinX - pad || sMinX > gMaxX + pad || sMaxZ < gMinZ - pad || sMinZ > gMaxZ + pad) continue
        segs.push({ ax: a.x, az: a.z, bx: c.x, bz: c.z, halfW })
      }
    }

    const edgeFacesRoad = (e: Edge): boolean => {
      if (e.facesRoad !== undefined) return e.facesRoad
      // Probe a point 2 m in front of the edge midpoint, look for a road centre-line ahead.
      const mx = e.ax + e.tx * e.len * 0.5
      const mz = e.az + e.tz * e.len * 0.5
      const px = mx + e.nx * 2
      const pz = mz + e.nz * 2
      const maxD2 = ROAD_FACING_DIST * ROAD_FACING_DIST
      let faces = false
      for (const s of segs) {
        const d2 = segDist2(s, px, pz)
        if (d2 > maxD2) continue
        // direction to the nearest point on the segment must be roughly along the normal
        const vx = s.bx - s.ax, vz = s.bz - s.az
        const l2 = vx * vx + vz * vz
        let t = l2 > 0 ? ((px - s.ax) * vx + (pz - s.az) * vz) / l2 : 0
        t = t < 0 ? 0 : t > 1 ? 1 : t
        const qx = s.ax + vx * t - mx
        const qz = s.az + vz * t - mz
        const ql = Math.hypot(qx, qz)
        if (ql < 0.5 || (qx * e.nx + qz * e.nz) / ql > 0.35) {
          faces = true
          break
        }
      }
      e.facesRoad = faces
      return faces
    }

    /** Best edge for a point: nearest within maxDist, road-facing edges preferred. */
    const pickEdge = (px: number, pz: number, maxDist: number, only?: Edge[]): { edge: Edge; t: number } | null => {
      let best: Edge | null = null
      let bestT = 0
      let bestScore = Infinity
      const maxD2 = maxDist * maxDist
      const consider = (e: Edge): void => {
        const { d2, t } = edgeDist2(e, px, pz)
        if (d2 > maxD2) return
        const d = Math.sqrt(d2)
        if (d > bestScore) return
        const score = d + (edgeFacesRoad(e) ? 0 : maxDist)
        if (score < bestScore) {
          bestScore = score
          best = e
          bestT = t
        }
      }
      if (only) {
        for (const e of only) consider(e)
      } else {
        for (let bi = 0; bi < recs.length; bi++) {
          const r = recs[bi]
          if (!r) continue
          if (px < r.minX - maxDist || px > r.maxX + maxDist || pz < r.minZ - maxDist || pz > r.maxZ + maxDist) continue
          for (const e of r.edges) consider(e)
        }
      }
      return best ? { edge: best, t: bestT } : null
    }

    const buildingAt = (px: number, pz: number): BuildingRec | null => {
      for (let bi = 0; bi < recs.length; bi++) {
        const r = recs[bi]
        if (!r) continue
        if (px < r.minX || px > r.maxX || pz < r.minZ || pz > r.maxZ) continue
        if (pointInPolygon(px, pz, r.fp)) return r
      }
      return null
    }

    // ── 1. Match shops to facades ──────────────────────────────────────────
    const layout = new AtlasLayout()
    const perEdge = new Map<Edge, StorefrontItem[]>()
    for (const poi of shops) {
      const px = poi.position.x
      const pz = poi.position.z
      const inside = buildingAt(px, pz)
      const picked = inside
        ? pickEdge(px, pz, 1e6, inside.edges)
        : pickEdge(px, pz, SHOP_MATCH_DIST)
      if (!picked) continue
      if (picked.edge.len < 2.5) continue
      const cat = categoryOf(poi)
      const tags = poi.tags
      const label = (tags?.['name'] ?? poi.name ?? tags?.['brand'] ?? poi.brand ?? categoryWord(cat)).trim()
      if (!label) continue
      const item: StorefrontItem = { poi, edge: picked.edge, t: picked.t, label, style: styleFor(cat, label), category: cat }
      let list = perEdge.get(picked.edge)
      if (!list) {
        list = []
        perEdge.set(picked.edge, list)
      }
      list.push(item)
    }

    // ── 2. Storefront geometry ─────────────────────────────────────────────
    const atlasQ = new QuadBuffer()
    const glassQ = new GlassBuffer()
    const joinQ = new JoineryBuffer()
    let storefrontCount = 0
    const occupied = new Map<Edge, { t0: number; t1: number }[]>()

    for (const [edge, items] of perEdge) {
      items.sort((a, b) => a.t - b.t)
      const n = items.length
      let w = Math.min(edge.len, Math.max(4, Math.min(12, edge.len / n)))
      const centres: number[] = []
      if (n * w > edge.len + 1e-6) {
        w = edge.len / n
        for (let i = 0; i < n; i++) centres.push((i + 0.5) * w)
      } else {
        const lo = w / 2
        const hi = edge.len - w / 2
        for (let i = 0; i < n; i++) {
          let c = Math.min(hi, Math.max(lo, items[i]!.t))
          const prev = centres[i - 1]
          if (prev !== undefined && c < prev + w) c = prev + w
          centres.push(c)
        }
        // push back if the last one overflowed
        const last = centres[n - 1]!
        if (last > hi) {
          const shift = last - hi
          for (let i = 0; i < n; i++) centres[i] = centres[i]! - shift
        }
      }
      const occ: { t0: number; t1: number }[] = []
      occupied.set(edge, occ)
      for (let i = 0; i < n; i++) {
        const it = items[i]!
        const c = centres[i]!
        occ.push({ t0: c - w / 2, t1: c + w / 2 })
        const wx = edge.ax + edge.tx * c
        const wz = edge.az + edge.tz * c
        const { nx, nz, tx, tz } = edge
        // fascia with the real name (unchanged)
        const cell = layout.get('sign', it.label, it.style)
        atlasQ.addWallQuad(wx + nx * WALL_OFFSET, wz + nz * WALL_OFFSET, tx, tz, nx, nz, w, FASCIA_Y0, FASCIA_Y1, cell, null)

        // ── shopfront frame: rightward vector for a viewer on the street
        const Wf = w - 0.3
        const rx = nz, rz = -nx
        const f: Frame = { ox: wx - rx * Wf / 2, oz: wz - rz * Wf / 2, rx, rz, nx, nz }
        const h = hashStr(`${it.label}|${it.category}|${Math.round(wx)}|${Math.round(wz)}`)
        const doorLeft = (h & 1) === 0
        const mirror = (h >> 1) & 1
        const D = 3.5 + ((h >> 2) % 16) / 10 // room depth 3.5–5.0 m
        const row = interiorRowFor(it.category)
        const bg = hexColor(it.style.bg)
        const frameCol = darken(bg, 0.55)
        const riserCol = darken(bg, 0.3)
        const hasDoor = Wf >= MIN_DOOR_FRONT + DOOR_W
        let vx0 = POST_W, vx1 = Wf - POST_W
        let dx0 = 0, dx1 = 0
        if (hasDoor) {
          if (doorLeft) { dx0 = POST_W; dx1 = POST_W + DOOR_W; vx0 = dx1 + POST_W }
          else { dx1 = Wf - POST_W; dx0 = dx1 - DOOR_W; vx1 = dx0 - POST_W }
        }
        const glassY0 = RISER_H + SILL_H
        // outer posts + top rail (closes the gap to the fascia)
        joinQ.addBox(f, 0, POST_W, 0, FASCIA_Y0, 0, POST_D, frameCol)
        joinQ.addBox(f, Wf - POST_W, Wf, 0, FASCIA_Y0, 0, POST_D, frameCol)
        joinQ.addBox(f, POST_W, Wf - POST_W, RAIL_Y0, FASCIA_Y0, 0, POST_D, frameCol)
        // stallriser + stone sill under the vitrine
        joinQ.addBox(f, vx0, vx1, 0, RISER_H, 0, RISER_D, riserCol)
        joinQ.addBox(f, vx0 - 0.01, vx1 + 0.01, RISER_H, glassY0, 0, SILL_D, SILL_COLOR)
        // mullions
        const vw = vx1 - vx0
        const mullions = vw > 5 ? 2 : vw > 2.4 ? 1 : 0
        for (let k = 1; k <= mullions; k++) {
          const mx = vx0 + (vw * k) / (mullions + 1)
          joinQ.addBox(f, mx - MULLION_W / 2, mx + MULLION_W / 2, glassY0, RAIL_Y0, 0, MULLION_D, frameCol)
        }
        // vitrine glass: one interior-mapped pane (edges tucked into the frame)
        glassQ.addPane(f, Wf, D, row, mirror, vx0 - 0.02, vx1 + 0.02, glassY0 - 0.02, RAIL_Y0 + 0.02, WALL_OFFSET)
        // glazed door: post, stiles, kick panel, mid rail, handle, two glass panels
        if (hasDoor) {
          if (doorLeft) joinQ.addBox(f, dx1, dx1 + POST_W, 0, RAIL_Y0, 0, POST_D, frameCol)
          else joinQ.addBox(f, dx0 - POST_W, dx0, 0, RAIL_Y0, 0, POST_D, frameCol)
          const la = dx0 + 0.02, lb = dx1 - 0.02 // leaf
          joinQ.addBox(f, la, la + 0.05, 0, RAIL_Y0, 0, DOOR_D, frameCol)
          joinQ.addBox(f, lb - 0.05, lb, 0, RAIL_Y0, 0, DOOR_D, frameCol)
          joinQ.addBox(f, la, lb, 0, DOOR_KICK_H, 0, DOOR_D, riserCol)
          joinQ.addBox(f, la, lb, DOOR_RAIL_Y, DOOR_RAIL_Y + 0.08, 0, DOOR_D, frameCol)
          const hx = doorLeft ? lb - 0.12 : la + 0.12
          joinQ.addBox(f, hx - 0.015, hx + 0.015, 1.0, 1.3, DOOR_D, DOOR_D + 0.05, HANDLE_COLOR)
          glassQ.addPane(f, Wf, D, row, mirror, la + 0.04, lb - 0.04, DOOR_KICK_H - 0.01, DOOR_RAIL_Y + 0.01, WALL_OFFSET)
          glassQ.addPane(f, Wf, D, row, mirror, la + 0.04, lb - 0.04, DOOR_RAIL_Y + 0.07, RAIL_Y0 + 0.02, WALL_OFFSET)
        }
        // cornice above the fascia
        joinQ.addBox(f, -0.15, Wf + 0.15, FASCIA_Y1, FASCIA_Y1 + CORNICE_H, 0, CORNICE_D, CORNICE_COLOR)
        // awning for cafés / restaurants / bakeries (below the fascia, never hides it)
        if (it.style.awning !== undefined && AWNING_CATS.has(it.category)) {
          joinQ.addAwning(f, 0.05, Wf - 0.05, RAIL_Y0 + 0.04, 2.55, 1.1, it.style.awning)
        }
        console.debug(`[Storefront] ${it.label} ${it.category} at (${wx.toFixed(1)},${wz.toFixed(1)}) facing (${nx.toFixed(2)},${nz.toFixed(2)})`)
        storefrontCount++
      }
    }

    // ── 3. House-number plaques ───────────────────────────────────────────
    let numberCount = 0
    const numberSeen = new Set<string>()
    for (const poi of numbers) {
      const num = poi.tags?.['addr:housenumber']?.trim()
      if (!num) continue
      const px = poi.position.x
      const pz = poi.position.z
      const inside = buildingAt(px, pz)
      const picked = inside ? pickEdge(px, pz, 1e6, inside.edges) : pickEdge(px, pz, HOUSENUMBER_MATCH_DIST)
      if (!picked) continue
      const { edge } = picked
      const t = Math.min(edge.len - 0.4, Math.max(0.4, picked.t))
      const key = `${edge.bi}|${edge.ei}|${num}|${Math.round(t)}`
      if (numberSeen.has(key)) continue
      numberSeen.add(key)
      const cell = layout.get('number', num, HOUSENUMBER_STYLE)
      if (!cell) break // atlas full
      const wx = edge.ax + edge.tx * t + edge.nx * PLAQUE_OFFSET
      const wz = edge.az + edge.tz * t + edge.nz * PLAQUE_OFFSET
      atlasQ.addWallQuad(wx, wz, edge.tx, edge.tz, edge.nx, edge.nz, HOUSENUMBER_W, HOUSENUMBER_Y - HOUSENUMBER_H / 2, HOUSENUMBER_Y + HOUSENUMBER_H / 2, cell, null)
      numberCount++
    }

    // ── 4. Street-name plaques at corners ────────────────────────────────
    let plaqueCount = 0
    if (namedRoads.length > 0) {
      // endpoint grid (2 m cells) of ALL roads, to detect T-junctions on interior points
      const endGrid = new Map<string, { x: number; z: number; id: string }[]>()
      const gk = (x: number, z: number): string => `${Math.floor(x / 2)}|${Math.floor(z / 2)}`
      for (const r of roads) {
        const pts = r.points
        if (pts.length < 2) continue
        for (const p of [pts[0]!, pts[pts.length - 1]!]) {
          const k = gk(p.x, p.z)
          let l = endGrid.get(k)
          if (!l) {
            l = []
            endGrid.set(k, l)
          }
          l.push({ x: p.x, z: p.z, id: r.id })
        }
      }
      const otherEndpointNear = (x: number, z: number, id: string): boolean => {
        const cx = Math.floor(x / 2), cz = Math.floor(z / 2)
        for (let i = -1; i <= 1; i++) {
          for (let j = -1; j <= 1; j++) {
            const l = endGrid.get(`${cx + i}|${cz + j}`)
            if (!l) continue
            for (const e of l) {
              if (e.id === id) continue
              const dx = e.x - x, dz = e.z - z
              if (dx * dx + dz * dz <= 4) return true
            }
          }
        }
        return false
      }

      const plaqueSeen = new Set<string>()
      const facadeSlots = new Map<Edge, number[]>()
      for (const r of namedRoads) {
        const name = r.name!.toUpperCase()
        const pts = r.points
        for (let i = 0; i < pts.length; i++) {
          const p = pts[i]!
          const isEnd = i === 0 || i === pts.length - 1
          if (!isEnd && !otherEndpointNear(p.x, p.z, r.id)) continue
          // only corners inside/near this chunk's buildings
          if (p.x < gMinX - STREET_PLAQUE_MATCH_DIST || p.x > gMaxX + STREET_PLAQUE_MATCH_DIST ||
              p.z < gMinZ - STREET_PLAQUE_MATCH_DIST || p.z > gMaxZ + STREET_PLAQUE_MATCH_DIST) continue
          const dk = `${name}|${Math.round(p.x / 6)}|${Math.round(p.z / 6)}`
          if (plaqueSeen.has(dk)) continue
          plaqueSeen.add(dk)
          const picked = pickEdge(p.x, p.z, STREET_PLAQUE_MATCH_DIST)
          if (!picked) continue
          const { edge } = picked
          let t = Math.min(edge.len - 0.6, Math.max(0.6, picked.t))
          if (t < 0.6) continue
          // keep plaques from overlapping on the same facade
          let slots = facadeSlots.get(edge)
          if (!slots) {
            slots = []
            facadeSlots.set(edge, slots)
          }
          let tries = 0
          while (slots.some((s) => Math.abs(s - t) < STREET_PLAQUE_W + 0.15) && tries < 4) {
            t += STREET_PLAQUE_W + 0.2
            tries++
          }
          if (t > edge.len - 0.6) continue
          slots.push(t)
          const cell = layout.get('sign', name, STREET_STYLE)
          if (!cell) break
          const wx = edge.ax + edge.tx * t + edge.nx * PLAQUE_OFFSET
          const wz = edge.az + edge.tz * t + edge.nz * PLAQUE_OFFSET
          atlasQ.addWallQuad(wx, wz, edge.tx, edge.tz, edge.nx, edge.nz, STREET_PLAQUE_W, STREET_PLAQUE_Y - STREET_PLAQUE_H / 2, STREET_PLAQUE_Y + STREET_PLAQUE_H / 2, cell, null)
          plaqueCount++
        }
      }
    }

    if (atlasQ.count === 0 && glassQ.count === 0) return null

    // ── Assemble ─────────────────────────────────────────────────────────
    const group = new THREE.Group()
    group.name = 'storefronts'

    if (atlasQ.count > 0 && layout.entries.length > 0) {
      const canvasH = layout.height()
      layout.finalize(canvasH)
      const canvas = drawAtlas(layout, canvasH)
      if (canvas) {
        const tex = new THREE.CanvasTexture(canvas)
        tex.colorSpace = THREE.SRGBColorSpace
        tex.anisotropy = 4
        tex.generateMipmaps = true
        tex.minFilter = THREE.LinearMipmapLinearFilter
        const mat = new THREE.MeshStandardMaterial({
          map: tex,
          emissive: 0xffffff,
          emissiveMap: tex,
          emissiveIntensity: 0.35,
          roughness: 0.6,
          metalness: 0,
        })
        const geo = atlasQ.toGeometry(false)
        const mesh = new THREE.Mesh(geo, mat)
        mesh.name = 'storefront_signage'
        mesh.userData['skipMerge'] = true
        mesh.castShadow = false
        mesh.receiveShadow = false
        mesh.renderOrder = 2
        group.add(mesh)
      }
    }
    if (glassQ.count > 0) {
      const mat = getVitrineMaterial()
      if (mat) {
        const mesh = new THREE.Mesh(glassQ.toGeometry(), mat)
        mesh.name = 'storefront_vitrines'
        mesh.userData['skipMerge'] = true
        mesh.receiveShadow = false
        mesh.renderOrder = 2
        group.add(mesh)
      }
    }
    if (joinQ.count > 0) {
      const mesh = new THREE.Mesh(joinQ.toGeometry(), getJoineryMat())
      mesh.name = 'storefront_joinery'
      mesh.userData['skipMerge'] = true
      mesh.castShadow = true
      mesh.receiveShadow = true
      mesh.renderOrder = 2
      group.add(mesh)
    }

    console.debug(
      `[StorefrontGenerator] storefronts=${storefrontCount} housenumbers=${numberCount} streetPlaques=${plaqueCount} atlasCells=${layout.entries.length}`,
    )
    return group
  }
}
