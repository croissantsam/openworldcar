/**
 * StorefrontInterior — fake shop interiors seen through the vitrine glass.
 *
 * Interior mapping: the glass quad stays flat, the fragment shader shoots the
 * view ray into a virtual room box behind the quad (width = storefront width,
 * floor 0.25 m, ceiling 2.85 m, depth 3.5–5 m) and samples the hit face from a
 * canvas-drawn INTERIOR ATLAS (one row per shop category, five faces per row:
 * back wall, left wall, right wall, floor, ceiling). A glass layer (tint,
 * fresnel sky reflection, sun highlight) sits on top. Self-lit → reads at night.
 *
 * Atlas: 2048 × (rows × 256) px, built once at module level (lazy).
 * Row layout (px): back 0..448 | left 448..768 | right 768..1088 | floor 1088..1568 | ceiling 1568..2048
 */

import * as THREE from 'three'

// ─── Atlas layout ────────────────────────────────────────────────────────────

export const ATLAS_W = 2048
export const ATLAS_H = 4096 // 16 rows of 256 px (12 used)
export const CELL_H = 256
const BACK_W = 448
const SIDE_W = 320
const FLOOR_W = 480
const CEIL_W = 480
const X_BACK = 0
const X_LEFT = BACK_W
const X_RIGHT = BACK_W + SIDE_W
const X_FLOOR = BACK_W + SIDE_W * 2
const X_CEIL = X_FLOOR + FLOOR_W

export const ROOM_FLOOR_Y = 0.25
export const ROOM_CEIL_Y = 2.85

/** Interior rows, in atlas order. */
export const INTERIOR_ROWS = [
  'generic', 'bakery', 'cafe', 'pharmacy', 'supermarket', 'fashion',
  'hairdresser', 'office', 'laundry', 'books', 'florist', 'butcher',
] as const
export type InteriorKind = (typeof INTERIOR_ROWS)[number]

const ROW_INDEX = new Map<string, number>(INTERIOR_ROWS.map((k, i) => [k, i]))

export function interiorRowFor(category: string): number {
  let kind: InteriorKind
  switch (category) {
    case 'bakery': case 'pastry': case 'confectionery': case 'chocolate':
      kind = 'bakery'; break
    case 'cafe': case 'coffee': case 'ice_cream': case 'restaurant': case 'bar': case 'pub':
    case 'fast_food': case 'food_court': case 'biergarten': case 'tea':
      kind = 'cafe'; break
    case 'pharmacy': case 'chemist': case 'medical_supply': case 'optician':
    case 'hospital': case 'clinic': case 'dentist': case 'doctors': case 'veterinary':
      kind = 'pharmacy'; break
    case 'supermarket': case 'convenience': case 'greengrocer': case 'frozen_food':
    case 'variety_store': case 'department_store': case 'general': case 'wholesale':
      kind = 'supermarket'; break
    case 'clothes': case 'shoes': case 'boutique': case 'fashion': case 'jewelry':
    case 'perfumery': case 'cosmetics': case 'bag': case 'fabric': case 'tailor':
      kind = 'fashion'; break
    case 'hairdresser': case 'beauty': case 'massage': case 'tattoo':
      kind = 'hairdresser'; break
    case 'bank': case 'atm': case 'bureau_de_change': case 'insurance': case 'estate_agent':
    case 'travel_agency': case 'hotel': case 'guest_house': case 'hostel': case 'company':
    case 'lawyer': case 'notary': case 'accountant': case 'it': case 'coworking': case 'post_office':
    case 'townhall': case 'courthouse': case 'government': case 'civic': case 'public':
    case 'school': case 'university': case 'college': case 'kindergarten':
    case 'police': case 'fire_station': case 'office': case 'commercial': case 'retail':
    case 'residential': case 'apartments':
      kind = 'office'; break
    case 'laundry': case 'dry_cleaning':
      kind = 'laundry'; break
    case 'books': case 'stationery': case 'newsagent': case 'kiosk': case 'tobacco':
    case 'lottery': case 'e-cigarette': case 'copyshop':
    case 'museum': case 'gallery': case 'library':
      kind = 'books'; break
    case 'theatre': case 'cinema': case 'arts_centre':
      kind = 'cafe'; break
    case 'florist': case 'garden_centre':
      kind = 'florist'; break
    case 'butcher': case 'deli': case 'cheese': case 'seafood': case 'charcuterie':
      kind = 'butcher'; break
    default:
      kind = 'generic'
  }
  return ROW_INDEX.get(kind) ?? 0
}

// ─── Drawing helpers (crisp, flat-shaded) ───────────────────────────────────

type Ctx = CanvasRenderingContext2D

function rect(c: Ctx, x: number, y: number, w: number, h: number, col: string): void {
  c.fillStyle = col
  c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h))
}

function circle(c: Ctx, cx: number, cy: number, r: number, col: string): void {
  c.fillStyle = col
  c.beginPath()
  c.arc(cx, cy, r, 0, Math.PI * 2)
  c.fill()
}

function poly(c: Ctx, pts: number[], col: string): void {
  c.fillStyle = col
  c.beginPath()
  c.moveTo(pts[0]!, pts[1]!)
  for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i]!, pts[i + 1]!)
  c.closePath()
  c.fill()
}

/** Deterministic PRNG so the atlas is identical on every load. */
function rng(seed: number): () => number {
  let s = seed >>> 0 || 1
  return () => {
    s ^= s << 13; s >>>= 0
    s ^= s >>> 17
    s ^= s << 5; s >>>= 0
    return (s >>> 0) / 4294967296
  }
}

const pick = <T,>(r: () => number, arr: readonly T[]): T => arr[Math.floor(r() * arr.length) % arr.length]!

// wall with skirting and cove line
function wall(c: Ctx, w: number, col: string, skirt = '#2b2b2f'): void {
  rect(c, 0, 0, w, CELL_H, col)
  rect(c, 0, 0, w, 3, 'rgba(255,255,255,0.35)')
  rect(c, 0, CELL_H - 10, w, 10, skirt)
}

function tileWall(c: Ctx, w: number, a: string, grout: string, size: number): void {
  rect(c, 0, 0, w, CELL_H, grout)
  for (let y = 0; y < CELL_H; y += size) {
    const off = (Math.floor(y / size) % 2) * (size / 2)
    for (let x = -size; x < w + size; x += size) rect(c, x + off + 1, y + 1, size - 2, size - 2, a)
  }
  rect(c, 0, CELL_H - 10, w, 10, '#3a3a3a')
}

type ItemFn = (c: Ctx, x: number, yb: number, w: number, i: number, r: () => number) => void

/** Shelving unit: two uprights, n boards, items drawn on each board (baseline = board top). */
function shelves(c: Ctx, x: number, w: number, yTop: number, yBot: number, n: number, wood: string, items: ItemFn, r: () => number, back?: string): void {
  if (back) rect(c, x, yTop, w, yBot - yTop, back)
  rect(c, x, yTop, 5, yBot - yTop, wood)
  rect(c, x + w - 5, yTop, 5, yBot - yTop, wood)
  const step = (yBot - yTop) / n
  for (let i = 0; i < n; i++) {
    const y = yTop + (i + 1) * step
    items(c, x + 6, y - 5, w - 12, i, r)
    rect(c, x, y - 5, w, 5, wood)
    rect(c, x, y, w, 2, 'rgba(0,0,0,0.25)')
  }
}

const loaves: ItemFn = (c, x, yb, w, i, r) => {
  let px = x + 2
  while (px < x + w - 14) {
    const kind = (i + Math.floor(px / 23)) % 3
    const col = pick(r, ['#d09045', '#c07c34', '#e3a85c'])
    if (kind === 0) { // baguette
      rect(c, px, yb - 9, 22, 9, col)
      rect(c, px + 3, yb - 9, 4, 2, '#f0c88a'); rect(c, px + 11, yb - 9, 4, 2, '#f0c88a')
      px += 25
    } else if (kind === 1) { // round loaf
      circle(c, px + 9, yb - 8, 9, col)
      rect(c, px + 5, yb - 11, 8, 2, '#f0c88a')
      px += 21
    } else { // stacked buns
      circle(c, px + 5, yb - 5, 5, '#e8b46a'); circle(c, px + 14, yb - 5, 5, '#e8b46a'); circle(c, px + 9, yb - 12, 5, '#e8b46a')
      px += 22
    }
  }
}

const boxes = (cols: readonly string[]): ItemFn => (c, x, yb, w, _i, r) => {
  let px = x + 1
  while (px < x + w - 8) {
    const bw = 9 + Math.floor(r() * 12)
    const bh = 16 + Math.floor(r() * 14)
    if (px + bw > x + w) break
    const col = pick(r, cols)
    rect(c, px, yb - bh, bw, bh, col)
    rect(c, px + 2, yb - bh + 3, bw - 4, 4, 'rgba(255,255,255,0.8)')
    rect(c, px + 2, yb - 6, bw - 4, 2, 'rgba(0,0,0,0.3)')
    px += bw + 2
  }
}

const bottles = (cols: readonly string[]): ItemFn => (c, x, yb, w, _i, r) => {
  let px = x + 2
  while (px < x + w - 8) {
    const col = pick(r, cols)
    const h = 22 + Math.floor(r() * 10)
    rect(c, px, yb - h + 8, 7, h - 8, col)
    rect(c, px + 2, yb - h, 3, 9, col)
    rect(c, px + 1, yb - h + 12, 5, 6, 'rgba(255,255,255,0.75)')
    px += 10
  }
}

const books: ItemFn = (c, x, yb, w, _i, r) => {
  let px = x
  const cols = ['#b83a3a', '#2d5a8a', '#3a7a4a', '#d8a030', '#6b3f8a', '#e0e0d8', '#2a2a2a', '#c86a2a', '#4aa0b8', '#8a2a5a']
  while (px < x + w - 4) {
    const bw = 4 + Math.floor(r() * 5)
    const bh = 26 + Math.floor(r() * 10)
    rect(c, px, yb - bh, bw, bh, pick(r, cols))
    rect(c, px + 1, yb - bh + 4, bw - 2, 1, 'rgba(255,255,255,0.6)')
    px += bw + 1
  }
}

const pharma: ItemFn = (c, x, yb, w, _i, r) => {
  let px = x + 1
  const stripes = ['#1f8a4a', '#2a5ab8', '#d83a3a', '#e8a020', '#20a0b0']
  while (px < x + w - 8) {
    const bw = 9 + Math.floor(r() * 8)
    const bh = 16 + Math.floor(r() * 10)
    rect(c, px, yb - bh, bw, bh, '#f8f8f8')
    rect(c, px, yb - bh, bw, 1, '#c8c8c8'); rect(c, px, yb - bh, 1, bh, '#c8c8c8')
    rect(c, px + 1, yb - bh + 4, bw - 2, 5, pick(r, stripes))
    px += bw + 2
  }
}

const groceries: ItemFn = (c, x, yb, w, i, r) => {
  const cols = ['#e03a3a', '#f0c020', '#2a80d0', '#40a840', '#f07a20', '#f0f0f0', '#8a3ab8', '#20b0a0']
  let px = x + 1
  const bh = 20 + (i % 2) * 6
  while (px < x + w - 6) {
    const bw = 6 + Math.floor(r() * 6)
    const col = pick(r, cols)
    rect(c, px, yb - bh, bw, bh, col)
    rect(c, px + 1, yb - bh + 5, bw - 2, 3, 'rgba(255,255,255,0.7)')
    px += bw + 1
  }
  // price tags along the shelf edge
  for (let t = x + 6; t < x + w - 10; t += 34) rect(c, t, yb + 1, 12, 3, '#ffe040')
}

const produce: ItemFn = (c, x, yb, w, _i, r) => {
  const cols = ['#d84a5a', '#c83a3a', '#f0c060', '#e8d890', '#f0a0a8', '#a04040', '#f8e8b0']
  let px = x + 2
  while (px < x + w - 20) {
    const col = pick(r, cols)
    const kind = Math.floor(r() * 3)
    if (kind === 0) { rect(c, px, yb - 10, 24, 10, col); rect(c, px + 2, yb - 10, 20, 2, 'rgba(255,255,255,0.4)') }
    else if (kind === 1) { for (let k = 0; k < 3; k++) circle(c, px + 5 + k * 8, yb - 5, 5, col) }
    else { poly(c, [px, yb, px + 24, yb, px + 20, yb - 12, px + 4, yb - 12], col) }
    rect(c, px + 6, yb + 1, 12, 5, '#ffffff'); rect(c, px + 8, yb + 3, 8, 1, '#c03030')
    px += 28
  }
}

const flowers: ItemFn = (c, x, yb, w, _i, r) => {
  const cols = ['#f04a6a', '#ffd23a', '#ffffff', '#f08ac0', '#e83a3a', '#c070f0', '#ff9a30']
  let px = x + 2
  while (px < x + w - 18) {
    // bucket
    poly(c, [px + 2, yb, px + 16, yb, px + 18, yb - 16, px, yb - 16], '#7a8088')
    rect(c, px, yb - 17, 18, 2, '#9aa0a8')
    const col = pick(r, cols)
    for (let k = 0; k < 4; k++) {
      const fx = px + 3 + k * 4, fy = yb - 22 - Math.floor(r() * 10)
      rect(c, fx + 1, fy, 1, yb - 16 - fy, '#3a8a3a')
      circle(c, fx + 1, fy, 3, col)
    }
    px += 22
  }
}

function pendant(c: Ctx, x: number, len: number, shade: string): void {
  rect(c, x, 0, 2, len, '#3a3a3a')
  poly(c, [x - 9, len + 12, x + 11, len + 12, x + 6, len, x - 4, len], shade)
  circle(c, x + 1, len + 15, 4, '#fff2c0')
  circle(c, x + 1, len + 15, 8, 'rgba(255,230,160,0.25)')
}

function spotTrack(c: Ctx, w: number, n: number): void {
  rect(c, 8, 6, w - 16, 3, '#2a2a2a')
  for (let i = 0; i < n; i++) {
    const x = 16 + ((w - 32) * i) / (n - 1)
    rect(c, x - 4, 9, 8, 10, '#2a2a2a')
    circle(c, x, 20, 3, '#fff6d8')
  }
}

function chalkboard(c: Ctx, x: number, y: number, w: number, h: number, r: () => number): void {
  rect(c, x - 3, y - 3, w + 6, h + 6, '#6b4a2a')
  rect(c, x, y, w, h, '#1f2e26')
  const rows = Math.floor((h - 10) / 9)
  for (let i = 0; i < rows; i++) {
    const lw = 12 + Math.floor(r() * (w * 0.6))
    rect(c, x + 6, y + 6 + i * 9, lw, 2, i === 0 ? '#ffe28a' : '#e8e8e0')
    if (i > 0) rect(c, x + w - 16, y + 6 + i * 9, 9, 2, '#e8e8e0')
  }
}

function poster(c: Ctx, x: number, y: number, w: number, h: number, bg: string, accent: string): void {
  rect(c, x - 2, y - 2, w + 4, h + 4, '#2a2a2a')
  rect(c, x, y, w, h, bg)
  circle(c, x + w * 0.5, y + h * 0.42, Math.min(w, h) * 0.22, accent)
  rect(c, x + 6, y + h - 14, w - 12, 3, accent)
  rect(c, x + 10, y + h - 8, w - 20, 2, 'rgba(0,0,0,0.35)')
}

function counter(c: Ctx, x: number, w: number, h: number, body: string, top: string): void {
  rect(c, x, CELL_H - h, w, h, body)
  rect(c, x, CELL_H - h, w, 5, top)
  rect(c, x, CELL_H - h + 5, w, 2, 'rgba(0,0,0,0.3)')
  for (let px = x + 6; px < x + w - 6; px += 40) rect(c, px, CELL_H - h + 12, 30, h - 24, 'rgba(0,0,0,0.12)')
}

function glassCounter(c: Ctx, x: number, w: number, h: number, frame: string, items: ItemFn, r: () => number): void {
  rect(c, x, CELL_H - h, w, h, frame)
  rect(c, x + 3, CELL_H - h + 6, w - 6, h - 16, '#dfe9ee')
  // two internal shelves with items
  const sh = (h - 16) / 2
  for (let i = 0; i < 2; i++) {
    const yb = CELL_H - h + 6 + (i + 1) * sh - 2
    items(c, x + 6, yb - 6, w - 12, i, r)
    rect(c, x + 3, yb - 2, w - 6, 3, '#f4f8fa')
  }
  rect(c, x + 3, CELL_H - h + 6, w - 6, 2, 'rgba(255,255,255,0.9)')
  rect(c, x, CELL_H - 10, w, 10, '#2a2a2a')
}

function fridge(c: Ctx, x: number, w: number, r: () => number): void {
  rect(c, x, 22, w, CELL_H - 32, '#3a3d42')
  rect(c, x + 2, 24, w - 4, 8, '#e8f4ff') // lit header
  const doors = Math.max(1, Math.floor(w / 46))
  const dw = (w - 4) / doors
  for (let d = 0; d < doors; d++) {
    const dx = x + 2 + d * dw
    rect(c, dx + 2, 34, dw - 4, CELL_H - 54, '#cfe4f0')
    for (let s = 0; s < 4; s++) {
      const yb = 34 + (s + 1) * ((CELL_H - 54) / 4) - 3
      groceries(c, dx + 4, yb, dw - 8, s, r)
      rect(c, dx + 2, yb, dw - 4, 2, '#f0f6f8')
    }
    rect(c, dx + dw - 8, 90, 3, 60, '#8a8f96') // handle
  }
}

function mannequin(c: Ctx, x: number, yb: number, col: string): void {
  rect(c, x - 10, yb - 4, 20, 4, '#4a4a4a')
  rect(c, x - 1, yb - 30, 2, 26, '#4a4a4a')
  poly(c, [x - 12, yb - 30, x + 12, yb - 30, x + 9, yb - 84, x - 9, yb - 84], col)
  circle(c, x, yb - 92, 7, '#d9c4b0')
}

function rack(c: Ctx, x: number, w: number, y: number, cols: readonly string[], r: () => number): void {
  rect(c, x, y, w, 3, '#5a5a5e')
  rect(c, x, y, 3, CELL_H - 10 - y, '#5a5a5e'); rect(c, x + w - 3, y, 3, CELL_H - 10 - y, '#5a5a5e')
  for (let px = x + 6; px < x + w - 16; px += 15) {
    const col = pick(r, cols)
    rect(c, px + 5, y + 3, 2, 6, '#c8c8c8')
    poly(c, [px, y + 9, px + 12, y + 9, px + 14, y + 52, px - 2, y + 52], col)
  }
}

function washer(c: Ctx, x: number, y: number, s: number): void {
  rect(c, x, y, s, s, '#f0f0f0')
  rect(c, x, y, s, 1, '#c8c8c8'); rect(c, x, y, 1, s, '#c8c8c8')
  rect(c, x + 4, y + 4, s - 8, 8, '#d8d8d8')
  circle(c, x + s - 8, y + 8, 2, '#3a8ad8')
  circle(c, x + s / 2, y + s / 2 + 5, s * 0.34, '#9aa0a8')
  circle(c, x + s / 2, y + s / 2 + 5, s * 0.27, '#2a3a48')
  circle(c, x + s / 2 - 3, y + s / 2 + 2, s * 0.1, 'rgba(255,255,255,0.35)')
}

function mirrorStation(c: Ctx, x: number, w: number): void {
  rect(c, x, 34, w, 120, '#2a2a2e')
  rect(c, x + 4, 38, w - 8, 112, '#c9dbe6')
  rect(c, x + 8, 44, 6, 100, 'rgba(255,255,255,0.5)')
  for (let i = 0; i < 5; i++) { circle(c, x + 6 + (i * (w - 12)) / 4, 36, 3, '#fff2c8'); circle(c, x + 6 + (i * (w - 12)) / 4, 152, 3, '#fff2c8') }
  rect(c, x - 2, 156, w + 4, 6, '#f4f4f4') // shelf
  rect(c, x + 6, 146, 5, 10, '#e05070'); rect(c, x + 14, 144, 5, 12, '#3a7ad8'); rect(c, x + 22, 148, 5, 8, '#f0d040')
  // chair
  rect(c, x + w / 2 - 14, 190, 28, 18, '#2a2a2a')
  rect(c, x + w / 2 - 14, 176, 28, 14, '#4a4a4a')
  rect(c, x + w / 2 - 2, 208, 4, 28, '#7a7a7a')
  rect(c, x + w / 2 - 14, 234, 28, 4, '#7a7a7a')
}

function desk(c: Ctx, x: number, w: number): void {
  rect(c, x, 168, w, 6, '#8a7a66')
  rect(c, x + 3, 174, 5, 70, '#5a5048'); rect(c, x + w - 8, 174, 5, 70, '#5a5048')
  rect(c, x + w / 2 - 20, 134, 40, 30, '#1e2228')
  rect(c, x + w / 2 - 18, 136, 36, 26, '#5ab0f0')
  rect(c, x + w / 2 - 6, 138, 20, 4, '#ffffff'); rect(c, x + w / 2 - 14, 146, 24, 3, '#dff'); rect(c, x + w / 2 - 14, 152, 18, 3, '#dff')
  rect(c, x + w / 2 - 3, 164, 6, 4, '#1e2228')
  rect(c, x + 12, 162, 20, 4, '#3a3a3a') // keyboard
  // chair
  rect(c, x + w / 2 - 12, 196, 24, 16, '#2a2a30'); rect(c, x + w / 2 - 12, 178, 24, 18, '#3c3c44')
  rect(c, x + w / 2 - 2, 212, 4, 26, '#6a6a6a'); rect(c, x + w / 2 - 14, 236, 28, 4, '#6a6a6a')
}

function plant(c: Ctx, x: number, yb: number, s: number): void {
  poly(c, [x - s * 0.35, yb, x + s * 0.35, yb, x + s * 0.4, yb - s * 0.5, x - s * 0.4, yb - s * 0.5], '#8a5a3a')
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 2 + (i - 2.5) * 0.45
    const lx = x + Math.cos(a) * s * 0.6, ly = yb - s * 0.5 + Math.sin(a) * s * 0.7
    poly(c, [x, yb - s * 0.5, lx - 5, ly + 4, lx, ly - 4, lx + 6, ly + 2], i % 2 ? '#3a8a3a' : '#2a6a2a')
  }
}

function table(c: Ctx, x: number, w: number): void {
  rect(c, x, 178, w, 5, '#8a5a3a')
  rect(c, x + w / 2 - 2, 183, 4, 52, '#3a3a3a'); rect(c, x + w / 2 - 12, 233, 24, 4, '#3a3a3a')
  circle(c, x + 10, 174, 4, '#ffffff'); rect(c, x + w - 16, 170, 8, 8, '#ffe8a0')
  // chairs
  for (const cx of [x - 16, x + w + 4]) {
    rect(c, cx, 168, 12, 30, '#2a2a30'); rect(c, cx, 196, 14, 5, '#2a2a30')
    rect(c, cx + 1, 201, 2, 36, '#2a2a30'); rect(c, cx + 11, 201, 2, 36, '#2a2a30')
  }
}

function cross(c: Ctx, x: number, y: number, s: number): void {
  rect(c, x - s / 2 - 3, y - s / 2 - 3, s + 6, s + 6, '#0b6b2e')
  rect(c, x - s / 6, y - s / 2, s / 3, s, '#8cff9c')
  rect(c, x - s / 2, y - s / 6, s, s / 3, '#8cff9c')
}

// floors
function tileFloor(c: Ctx, w: number, h: number, size: number, a: string, b: string, grout: string): void {
  rect(c, 0, 0, w, h, grout)
  for (let y = 0, j = 0; y < h; y += size, j++) for (let x = 0, i = 0; x < w; x += size, i++) rect(c, x + 1, y + 1, size - 2, size - 2, (i + j) % 2 ? a : b)
}

function plankFloor(c: Ctx, w: number, h: number, ph: number, cols: readonly string[], r: () => number): void {
  rect(c, 0, 0, w, h, '#2a1e14')
  for (let y = 0; y < h; y += ph) {
    let x = -Math.floor(r() * 60)
    while (x < w) {
      const pl = 60 + Math.floor(r() * 80)
      rect(c, x + 1, y + 1, pl - 2, ph - 2, pick(r, cols))
      x += pl
    }
  }
}

function carpetFloor(c: Ctx, w: number, h: number, col: string, dot: string): void {
  rect(c, 0, 0, w, h, col)
  for (let y = 4; y < h; y += 8) for (let x = (y / 8) % 2 ? 4 : 0; x < w; x += 8) rect(c, x, y, 2, 2, dot)
}

// ceilings
function ceilingStrips(c: Ctx, w: number, h: number, base: string, n: number, warm: boolean): void {
  rect(c, 0, 0, w, h, base)
  for (let y = 16; y < h; y += 32) rect(c, 0, y, w, 1, 'rgba(0,0,0,0.06)')
  for (let x = 32; x < w; x += 32) rect(c, x, 0, 1, h, 'rgba(0,0,0,0.06)')
  const col = warm ? '#fff1cf' : '#f4faff'
  const glow = warm ? 'rgba(255,235,190,0.35)' : 'rgba(220,240,255,0.35)'
  for (let i = 0; i < n; i++) {
    const y = ((i + 0.5) * h) / n
    rect(c, 24, y - 12, w - 48, 24, glow)
    rect(c, 30, y - 6, w - 60, 12, col)
    rect(c, 30, y - 6, w - 60, 2, '#ffffff')
  }
}

function ceilingPendants(c: Ctx, w: number, h: number, base: string, cols: number, rows: number): void {
  rect(c, 0, 0, w, h, base)
  for (let y = 16; y < h; y += 40) rect(c, 0, y, w, 2, 'rgba(0,0,0,0.25)') // beams
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const x = ((i + 0.5) * w) / cols, y = ((j + 0.5) * h) / rows
    circle(c, x, y, 22, 'rgba(255,220,150,0.28)')
    circle(c, x, y, 13, '#5a3a2a')
    circle(c, x, y, 8, '#fff0c0')
  }
}

function ceilingSpots(c: Ctx, w: number, h: number, base: string, tracks: number, per: number): void {
  rect(c, 0, 0, w, h, base)
  for (let t = 0; t < tracks; t++) {
    const y = ((t + 0.5) * h) / tracks
    rect(c, 16, y - 2, w - 32, 4, '#1a1a1a')
    for (let i = 0; i < per; i++) {
      const x = 24 + ((w - 48) * i) / (per - 1)
      circle(c, x, y, 9, 'rgba(255,245,220,0.35)')
      circle(c, x, y, 5, '#2a2a2a'); circle(c, x, y, 3, '#fff8e0')
    }
  }
}

// ─── Per-category painters ───────────────────────────────────────────────────

type Painter = {
  back: (c: Ctx, r: () => number) => void
  side: (c: Ctx, r: () => number) => void // drawn with the FRONT (window) at x=0; mirrored for the right wall
  floor: (c: Ctx, r: () => number) => void
  ceil: (c: Ctx, r: () => number) => void
}

const BW = BACK_W, SW = SIDE_W, FW = FLOOR_W, CW = CEIL_W

const staffDoor = (c: Ctx, x: number, col: string): void => {
  rect(c, x, 60, 44, CELL_H - 70, col)
  rect(c, x + 3, 63, 38, CELL_H - 76, 'rgba(0,0,0,0.12)')
  rect(c, x + 36, 150, 5, 2, '#d0d0d0')
}

const PAINTERS: Record<InteriorKind, Painter> = {
  generic: {
    back: (c, r) => {
      wall(c, BW, '#d8d3c6')
      shelves(c, 10, 250, 30, 200, 4, '#6a5a48', boxes(['#c9a06a', '#9ab0c8', '#e8e8e8', '#b86a4a', '#7aa07a']), r, '#cfc9ba')
      counter(c, 280, 150, 82, '#5a4a3c', '#8a7a66')
      rect(c, 330, 140, 34, 26, '#1e2228'); rect(c, 332, 142, 30, 22, '#5ab0f0')
      poster(c, 300, 30, 110, 80, '#e8e0cc', '#c8503a')
      pendant(c, 140, 10, '#3a3a3a'); pendant(c, 360, 10, '#3a3a3a')
    },
    side: (c, r) => { wall(c, SW, '#d0cbbf'); shelves(c, 120, 180, 40, 200, 4, '#6a5a48', boxes(['#c9a06a', '#9ab0c8', '#e8e8e8']), r); poster(c, 30, 50, 60, 80, '#e8e0cc', '#3a6ab8') },
    floor: (c) => tileFloor(c, FW, CELL_H, 40, '#c2bfb6', '#b6b3aa', '#8f8c84'),
    ceil: (c) => ceilingStrips(c, CW, CELL_H, '#e8e6e0', 2, false),
  },
  bakery: {
    back: (c, r) => {
      wall(c, BW, '#efdcbb', '#4a3020')
      shelves(c, 12, 220, 22, 150, 3, '#6b4423', loaves, r, '#e2c89c')
      chalkboard(c, 260, 26, 160, 92, r)
      glassCounter(c, 0, BW, 96, '#6b4423', produce, r)
      pendant(c, 246, 0, '#c8742a'); pendant(c, 200, 0, '#c8742a'); pendant(c, 400, 0, '#c8742a')
    },
    side: (c, r) => { wall(c, SW, '#eadbb8', '#4a3020'); shelves(c, 100, 200, 30, 160, 3, '#6b4423', loaves, r, '#e2c89c'); poster(c, 24, 40, 56, 76, '#f4e4c4', '#c8742a') },
    floor: (c) => tileFloor(c, FW, CELL_H, 40, '#b8663a', '#a85a30', '#6a3a22'),
    ceil: (c) => ceilingPendants(c, CW, CELL_H, '#e6d8c4', 3, 2),
  },
  cafe: {
    back: (c, r) => {
      rect(c, 0, 0, BW, CELL_H, '#3a2a22')
      rect(c, 0, 0, BW, 120, '#5a3a2e')
      rect(c, 0, 118, BW, 4, '#2a1a12')
      // back bar with mirror and bottle shelves
      rect(c, 40, 14, 250, 100, '#1c1410'); rect(c, 44, 18, 242, 92, '#8a9aa6')
      rect(c, 50, 22, 10, 84, 'rgba(255,255,255,0.35)')
      shelves(c, 40, 250, 14, 114, 3, '#8a6a3a', bottles(['#3a8a3a', '#c89a2a', '#8a2a2a', '#e8e8e8', '#2a4a8a', '#d86a2a']), r)
      chalkboard(c, 310, 20, 120, 90, r)
      counter(c, 0, BW, 110, '#4a2e22', '#c8a060')
      for (let x = 20; x < BW - 20; x += 60) { rect(c, x, 168, 10, 10, '#f0e0c0'); rect(c, x + 2, 160, 6, 8, '#f0e0c0') }
      rect(c, 0, 146, BW, 4, '#a08050')
      pendant(c, 120, 0, '#2a2a2a'); pendant(c, 230, 0, '#2a2a2a'); pendant(c, 340, 0, '#2a2a2a')
    },
    side: (c, r) => {
      rect(c, 0, 0, SW, CELL_H, '#3a2a22'); rect(c, 0, 0, SW, 120, '#5a3a2e'); rect(c, 0, 118, SW, 4, '#2a1a12')
      table(c, 40, 60); table(c, 200, 60)
      poster(c, 60, 30, 70, 70, '#f0e2c8', '#8a2a2a'); poster(c, 200, 34, 60, 60, '#2a2a2a', '#c8a060')
      void r
    },
    floor: (c, r) => plankFloor(c, FW, CELL_H, 24, ['#4a3324', '#553b2a', '#3f2c1f', '#5d4230'], r),
    ceil: (c) => ceilingPendants(c, CW, CELL_H, '#3a2e28', 3, 2),
  },
  pharmacy: {
    back: (c, r) => {
      wall(c, BW, '#f4f6f4', '#c8d0cc')
      rect(c, 0, 0, BW, 12, '#1f8a4a')
      shelves(c, 8, 260, 28, 210, 5, '#ffffff', pharma, r, '#e4ebe6')
      cross(c, 340, 60, 46)
      counter(c, 280, 168, 84, '#ffffff', '#1f8a4a')
      rect(c, 300, 150, 30, 22, '#1e2228'); rect(c, 302, 152, 26, 18, '#5ab0f0')
      plant(c, 420, 246, 40)
    },
    side: (c, r) => { wall(c, SW, '#eef2ef', '#c8d0cc'); rect(c, 0, 0, SW, 12, '#1f8a4a'); shelves(c, 90, 220, 30, 210, 5, '#ffffff', pharma, r, '#e4ebe6'); poster(c, 20, 50, 56, 80, '#ffffff', '#1f8a4a') },
    floor: (c) => tileFloor(c, FW, CELL_H, 48, '#e6e8e6', '#dcdfdd', '#c4c8c6'),
    ceil: (c) => ceilingStrips(c, CW, CELL_H, '#f4f6f6', 3, false),
  },
  supermarket: {
    back: (c, r) => {
      wall(c, BW, '#ececea', '#8a8a8a')
      rect(c, 0, 0, BW, 14, '#e03a3a')
      shelves(c, 6, 240, 20, 236, 5, '#9a9ea4', groceries, r, '#d8dadc')
      fridge(c, 256, 186, r)
    },
    side: (c, r) => { wall(c, SW, '#e6e6e4', '#8a8a8a'); rect(c, 0, 0, SW, 14, '#e03a3a'); shelves(c, 60, 250, 20, 236, 5, '#9a9ea4', groceries, r, '#d8dadc') },
    floor: (c) => tileFloor(c, FW, CELL_H, 48, '#dcdad4', '#d2d0ca', '#b8b6b0'),
    ceil: (c) => ceilingStrips(c, CW, CELL_H, '#eeeeec', 3, false),
  },
  fashion: {
    back: (c, r) => {
      wall(c, BW, '#f2eee6', '#d0c8bc')
      spotTrack(c, BW, 5)
      rack(c, 20, 200, 60, ['#1a1a1a', '#b8302a', '#2a4a8a', '#e8e0d0', '#8a6a3a', '#3a7a5a'], r)
      rack(c, 20, 200, 150, ['#d8a0a0', '#2a2a2a', '#5a8ad8', '#f0f0f0', '#c89a2a'], r)
      poster(c, 250, 30, 90, 130, '#1a1a1a', '#e8d0b0')
      mannequin(c, 380, 246, '#b8302a'); mannequin(c, 420, 246, '#1a1a1a')
      rect(c, 350, 176, 90, 4, '#c8c0b0')
      for (let x = 356; x < 436; x += 18) rect(c, x, 164, 12, 10, ['#1a1a1a', '#8a3a2a', '#e8e0d0', '#5a4a3a'][(x / 18) % 4 | 0]!)
    },
    side: (c, r) => { wall(c, SW, '#eee9e0', '#d0c8bc'); spotTrack(c, SW, 3); rack(c, 60, 240, 60, ['#1a1a1a', '#b8302a', '#2a4a8a', '#e8e0d0'], r); rack(c, 60, 240, 150, ['#d8a0a0', '#2a2a2a', '#5a8ad8', '#f0f0f0'], r); rect(c, 10, 30, 40, 130, '#c9dbe6') },
    floor: (c, r) => plankFloor(c, FW, CELL_H, 26, ['#c9a878', '#bf9c6c', '#d2b284', '#b89466'], r),
    ceil: (c) => ceilingSpots(c, CW, CELL_H, '#f0ede6', 2, 5),
  },
  hairdresser: {
    back: (c, r) => {
      wall(c, BW, '#efe9e2', '#2a2a2a')
      mirrorStation(c, 20, 100); mirrorStation(c, 150, 100)
      shelves(c, 290, 140, 30, 150, 3, '#f4f4f4', bottles(['#e05070', '#3a7ad8', '#f0d040', '#f0f0f0', '#20b0a0']), r, '#e8e2da')
      counter(c, 290, 140, 76, '#2a2a2e', '#f4f4f4')
      spotTrack(c, BW, 4)
    },
    side: (c, r) => { wall(c, SW, '#ebe5de', '#2a2a2a'); mirrorStation(c, 40, 100); poster(c, 190, 40, 90, 110, '#2a2a2a', '#f0c0c0'); void r },
    floor: (c) => tileFloor(c, FW, CELL_H, 40, '#f2f2f0', '#2a2a2e', '#8a8a8a'),
    ceil: (c) => ceilingSpots(c, CW, CELL_H, '#f6f4f0', 2, 4),
  },
  office: {
    back: (c, r) => {
      wall(c, BW, '#e9edf2', '#7a8090')
      rect(c, 0, 0, BW, 10, '#16274d')
      desk(c, 30, 110); desk(c, 180, 110)
      rect(c, 320, 30, 100, 60, '#16274d'); rect(c, 334, 48, 72, 8, '#ffffff'); rect(c, 334, 62, 50, 6, '#8fb3ff')
      poster(c, 330, 110, 80, 60, '#ffffff', '#16274d')
      plant(c, 400, 246, 54)
      void r
    },
    side: (c, r) => { wall(c, SW, '#e3e7ed', '#7a8090'); rect(c, 0, 0, SW, 10, '#16274d'); poster(c, 30, 40, 100, 70, '#ffffff', '#3a6ab8'); shelves(c, 160, 140, 40, 200, 4, '#ffffff', boxes(['#ffffff', '#dfe6f0', '#16274d', '#8fb3ff']), r, '#dfe3ea') },
    floor: (c) => carpetFloor(c, FW, CELL_H, '#5a6070', '#66708a'),
    ceil: (c) => ceilingStrips(c, CW, CELL_H, '#f2f4f6', 3, false),
  },
  laundry: {
    back: (c) => {
      wall(c, BW, '#e4eef2', '#6a7a86')
      rect(c, 0, 0, BW, 12, '#2a7ad8')
      for (let row = 0; row < 2; row++) for (let i = 0; i < 6; i++) washer(c, 8 + i * 74, 40 + row * 100, 66)
      rect(c, 0, CELL_H - 18, BW, 8, '#c8d0d8')
    },
    side: (c) => { wall(c, SW, '#dfe9ee', '#6a7a86'); rect(c, 0, 0, SW, 12, '#2a7ad8'); for (let i = 0; i < 3; i++) washer(c, 90 + i * 74, 40, 66); rect(c, 60, 170, 230, 6, '#f0f0f0'); rect(c, 66, 176, 6, 70, '#8a8a8a'); rect(c, 278, 176, 6, 70, '#8a8a8a'); poster(c, 14, 40, 50, 70, '#ffffff', '#2a7ad8') },
    floor: (c) => tileFloor(c, FW, CELL_H, 40, '#c0ccd4', '#b4c0c8', '#8a96a0'),
    ceil: (c) => ceilingStrips(c, CW, CELL_H, '#eef2f4', 2, false),
  },
  books: {
    back: (c, r) => {
      wall(c, BW, '#d9c9a6', '#3a2a1a')
      shelves(c, 6, 300, 14, 246, 6, '#5a3a22', books, r, '#c9b48c')
      // magazine rack
      rect(c, 316, 60, 126, 186, '#4a3220')
      for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
        rect(c, 322 + i * 30, 66 + j * 45, 24, 36, ['#e8e0d0', '#d0402a', '#2a6ab0', '#e8b820', '#3a8a3a', '#a03070'][(i + j * 4) % 6]!)
        rect(c, 324 + i * 30, 70 + j * 45, 20, 5, 'rgba(0,0,0,0.45)')
        rect(c, 326 + i * 30, 80 + j * 45, 16, 14, 'rgba(255,255,255,0.4)')
      }
      pendant(c, 160, 0, '#2a5a3a'); pendant(c, 380, 0, '#2a5a3a')
    },
    side: (c, r) => { wall(c, SW, '#d2c29e', '#3a2a1a'); shelves(c, 40, 274, 14, 246, 6, '#5a3a22', books, r, '#c9b48c') },
    floor: (c, r) => plankFloor(c, FW, CELL_H, 22, ['#8a5a34', '#7a4e2c', '#94643c', '#70462a'], r),
    ceil: (c) => ceilingPendants(c, CW, CELL_H, '#e0d4c0', 3, 2),
  },
  florist: {
    back: (c, r) => {
      wall(c, BW, '#e1e9dc', '#4a5a4a')
      shelves(c, 8, 300, 40, 236, 3, '#8a9a8a', flowers, r, '#d3ddcc')
      plant(c, 350, 246, 90); plant(c, 410, 246, 70)
      rect(c, 320, 40, 120, 90, '#8fb08a'); poster(c, 330, 50, 100, 70, '#f4f8f0', '#f04a6a')
      pendant(c, 160, 0, '#4a6a4a')
    },
    side: (c, r) => { wall(c, SW, '#dae4d4', '#4a5a4a'); shelves(c, 60, 250, 40, 236, 3, '#8a9a8a', flowers, r, '#d3ddcc'); plant(c, 30, 246, 60) },
    floor: (c) => tileFloor(c, FW, CELL_H, 48, '#a8a49a', '#9c988e', '#6c6860'),
    ceil: (c) => ceilingStrips(c, CW, CELL_H, '#eef2ea', 2, true),
  },
  butcher: {
    back: (c, r) => {
      tileWall(c, BW, '#f4f4f2', '#c8c8c4', 24)
      rect(c, 0, 0, BW, 14, '#8a1a1a')
      // hooks with sausages / hams
      rect(c, 20, 26, 300, 4, '#5a5a5a')
      for (let x = 30; x < 310; x += 28) {
        rect(c, x + 5, 30, 2, 14, '#3a3a3a')
        if ((x / 28) % 2 | 0) { for (let k = 0; k < 4; k++) rect(c, x + 3, 44 + k * 9, 6, 8, '#8a3a3a') }
        else poly(c, [x + 1, 46, x + 11, 46, x + 13, 80, x - 1, 80], '#c86060')
      }
      chalkboard(c, 340, 30, 96, 70, r)
      glassCounter(c, 0, BW, 110, '#8a1a1a', produce, r)
      rect(c, 380, 118, 30, 18, '#d8d8d8'); rect(c, 384, 108, 22, 10, '#2a2a2a') // scale
    },
    side: (c, r) => { tileWall(c, SW, '#f4f4f2', '#c8c8c4', 24); rect(c, 0, 0, SW, 14, '#8a1a1a'); fridge(c, 100, 200, r); poster(c, 20, 40, 60, 80, '#ffffff', '#8a1a1a') },
    floor: (c) => tileFloor(c, FW, CELL_H, 24, '#f0f0ee', '#2a2a2e', '#a0a0a0'),
    ceil: (c) => ceilingStrips(c, CW, CELL_H, '#f4f4f4', 3, false),
  },
}

// ─── Atlas texture (module-level, built once) ───────────────────────────────

let atlasTex: THREE.CanvasTexture | null = null
let atlasCanvas: HTMLCanvasElement | null = null

export function getInteriorAtlas(): THREE.CanvasTexture | null {
  if (atlasTex) return atlasTex
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  const H = ATLAS_H // power of two: NPOT mip chains sample noisily on some GPUs
  canvas.width = ATLAS_W
  canvas.height = H
  const c = canvas.getContext('2d')
  if (!c) return null
  c.fillStyle = '#101010'
  c.fillRect(0, 0, ATLAS_W, H)
  c.imageSmoothingEnabled = false
  const t0 = performance.now()
  for (let row = 0; row < INTERIOR_ROWS.length; row++) {
    const key = INTERIOR_ROWS[row]!
    const p = PAINTERS[key]
    const y = row * CELL_H
    const cell = (x: number, w: number, fn: (c: Ctx) => void, mirror = false): void => {
      c.save()
      c.beginPath()
      c.rect(x, y, w, CELL_H)
      c.clip()
      c.translate(x, y)
      if (mirror) { c.translate(w, 0); c.scale(-1, 1) }
      fn(c)
      c.restore()
    }
    cell(X_BACK, BACK_W, (cc) => p.back(cc, rng(0x9e37 + row * 131)))
    cell(X_LEFT, SIDE_W, (cc) => p.side(cc, rng(0x51f1 + row * 977)))
    cell(X_RIGHT, SIDE_W, (cc) => p.side(cc, rng(0x51f1 + row * 977)), true)
    cell(X_FLOOR, FLOOR_W, (cc) => p.floor(cc, rng(0x2c3d + row * 431)))
    cell(X_CEIL, CEIL_W, (cc) => p.ceil(cc, rng(0x7b11 + row * 59)))
  }
  atlasCanvas = canvas
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.generateMipmaps = true
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.anisotropy = 4
  tex.wrapS = THREE.ClampToEdgeWrapping
  tex.wrapT = THREE.ClampToEdgeWrapping
  atlasTex = tex
  console.debug(`[StorefrontInterior] atlas ${ATLAS_W}x${H} (${INTERIOR_ROWS.length} interiors) drawn in ${(performance.now() - t0).toFixed(1)} ms`)
  return tex
}

/** Debug helper (dev tools): the raw atlas canvas. */
export function getInteriorAtlasCanvas(): HTMLCanvasElement | null {
  if (!atlasCanvas) getInteriorAtlas()
  return atlasCanvas
}

// ─── Shader material (module-level, shared by every chunk) ──────────────────

const VERT = /* glsl */ `
#include <common>
attribute vec3 aTangent;
attribute vec4 aRoom;
varying vec3 vWorldPos;
varying vec3 vT;
varying vec3 vN;
varying vec2 vUv;
varying vec4 vRoom;
#include <fog_pars_vertex>
#include <logdepthbuf_pars_vertex>
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  vT = normalize(mat3(modelMatrix) * aTangent);
  vN = normalize(mat3(modelMatrix) * normal);
  vUv = uv;
  vRoom = aRoom;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <logdepthbuf_vertex>
  #include <fog_vertex>
}
`

const FRAG = /* glsl */ `
uniform sampler2D uAtlas;
uniform vec2 uAtlasSize;
uniform float uFloorY;
uniform float uCeilY;
uniform vec3 uSunDir;
uniform float uPixelAngle; // metres per pixel at 1 m (≈ 2·tan(fov/2) / viewport height)
uniform float uNightFactor;
varying vec3 vWorldPos;
varying vec3 vT;
varying vec3 vN;
varying vec2 vUv;
varying vec4 vRoom;
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>

const float CELL_H = ${CELL_H}.0;
// face cells: x0, width (px)
const vec2 CELL_BACK  = vec2(${X_BACK}.0, ${BACK_W}.0);
const vec2 CELL_LEFT  = vec2(${X_LEFT}.0, ${SIDE_W}.0);
const vec2 CELL_RIGHT = vec2(${X_RIGHT}.0, ${SIDE_W}.0);
const vec2 CELL_FLOOR = vec2(${X_FLOOR}.0, ${FLOOR_W}.0);
const vec2 CELL_CEIL  = vec2(${X_CEIL}.0, ${CEIL_W}.0);

void main() {
  #include <logdepthbuf_fragment>
  vec3 V = vWorldPos - cameraPosition;
  float dist = length(V);
  vec3 Vn = V / max(dist, 1e-4);
  vec3 N = normalize(vN);
  vec3 T = normalize(vT);
  float W = max(vRoom.x, 0.5);
  float D = max(vRoom.y, 1.0);
  float row = vRoom.z;
  bool mirror = mod(vRoom.w, 2.0) >= 1.0;

  // ray in room space: x right, y up (world), z into the room
  vec3 d = vec3(dot(Vn, T), Vn.y, -dot(Vn, N));
  vec3 o = vec3(vUv.x * W, vWorldPos.y, 0.0);
  if (mirror) { o.x = W - o.x; d.x = -d.x; }
  d.z = max(d.z, 1e-3);

  float tx = d.x > 1e-5 ? (W - o.x) / d.x : (d.x < -1e-5 ? -o.x / d.x : 1e9);
  float ty = d.y > 1e-5 ? (uCeilY - o.y) / d.y : (d.y < -1e-5 ? (uFloorY - o.y) / d.y : 1e9);
  float tz = D / d.z;
  float t = min(tx, min(ty, tz));
  vec3 hit = o + d * t;
  float H = uCeilY - uFloorY;
  float repX = max(1.0, floor(W / 4.5 + 0.5));

  // continuous face coordinates for all faces (derivatives must stay in uniform flow)
  vec2 stBack  = vec2(hit.x / W * repX, (hit.y - uFloorY) / H);
  vec2 stLeft  = vec2(hit.z / D, (hit.y - uFloorY) / H);
  vec2 stRight = vec2(1.0 - hit.z / D, (hit.y - uFloorY) / H);
  vec2 stFloor = vec2(hit.x / W * repX, hit.z / D);
  vec2 stCeil  = vec2(hit.x / W * repX, 1.0 - hit.z / D);

  bool isBack = t >= tz;
  bool isSide = !isBack && t >= tx;
  bool isLeft = isSide && d.x < 0.0;
  bool isFloor = !isBack && !isSide && d.y < 0.0;

  vec2 st = isBack ? stBack : (isSide ? (isLeft ? stLeft : stRight) : (isFloor ? stFloor : stCeil));
  vec2 cell = isBack ? CELL_BACK : (isSide ? (isLeft ? CELL_LEFT : CELL_RIGHT) : (isFloor ? CELL_FLOOR : CELL_CEIL));
  vec2 cellPx = vec2(cell.y, CELL_H);
  vec2 inset = vec2(2.5) / cellPx;
  vec2 f = clamp(vec2(fract(st.x), st.y), inset, 1.0 - inset);
  vec2 uv = vec2((cell.x + f.x * cell.y) / uAtlasSize.x, 1.0 - (row * CELL_H + (1.0 - f.y) * CELL_H) / uAtlasSize.y);
  // Explicit, smooth LOD from the ray length and the face's texel density
  // (per-quad implicit gradients are unreliable across the face selects).
  float faceM = isBack ? (W / repX) : (isSide ? D : (W / repX));
  float texelsPerPx = (cell.y / faceM) * (dist + t) * uPixelAngle;
  // +0.75 bias: the atlas has 2-px hairlines (chalkboards, shelf edges) that moiré at LOD ≈ 0
  float lod = clamp(log2(max(texelsPerPx, 1e-3)) + 0.75, 0.0, 7.0);
  vec3 interior = textureLod(uAtlas, uv, lod).rgb;

  // corner occlusion + depth falloff (keeps the box reading as a room)
  vec3 e = min(hit - vec3(0.0, uFloorY, 0.0), vec3(W, uCeilY, D) - hit);
  float eMin = min(e.x, min(e.y, e.z));
  float eMax = max(e.x, max(e.y, e.z));
  float eMid = e.x + e.y + e.z - eMin - eMax;
  float ao = 1.0 - 0.45 * (1.0 - smoothstep(0.0, 0.35, max(eMid, 0.0)));
  float depthFade = 1.0 - 0.22 * clamp(hit.z / D, 0.0, 1.0);
  // ceiling lights: brighten the room towards the ceiling a touch
  float lightGrad = 0.92 + 0.16 * clamp((hit.y - uFloorY) / H, 0.0, 1.0);
  // Soften interior lighting at night so shop windows don't glow aggressively
  float nightDim = mix(1.0, 0.60, uNightFactor);
  interior *= ao * depthFade * lightGrad * nightDim;

  // glass: tint, fresnel sky reflection, sun highlight
  float cosT = clamp(dot(-Vn, N), 0.0, 1.0);
  float F = 0.06 + 0.5 * pow(1.0 - cosT, 4.0);
  vec3 R = reflect(Vn, N);
  vec3 refl = mix(vec3(0.16, 0.17, 0.19), vec3(0.50, 0.66, 0.90), smoothstep(-0.2, 0.55, R.y));
  refl = mix(refl, vec3(0.30, 0.33, 0.36), 0.35 * smoothstep(0.1, 0.5, abs(fract(vUv.x * 3.0 + 0.1) - 0.5)));
  float spec = pow(max(dot(R, uSunDir), 0.0), 160.0) * 0.9;
  vec3 tint = vec3(0.88, 0.93, 0.97);
  vec3 col = interior * tint * (1.0 - F) + refl * F + vec3(spec);

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`

let vitrineMat: THREE.ShaderMaterial | null = null

export function getVitrineMaterial(): THREE.ShaderMaterial | null {
  if (vitrineMat) return vitrineMat
  const tex = getInteriorAtlas()
  if (!tex) return null
  const sun = new THREE.Vector3(120, 180, 80).normalize()
  vitrineMat = new THREE.ShaderMaterial({
    name: 'StorefrontVitrine',
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib['fog']),
      uAtlas: { value: tex },
      uAtlasSize: { value: new THREE.Vector2(ATLAS_W, ATLAS_H) },
      uFloorY: { value: ROOM_FLOOR_Y },
      uCeilY: { value: ROOM_CEIL_Y },
      uSunDir: { value: sun },
      uPixelAngle: { value: (2 * Math.tan((60 * Math.PI) / 360)) / 900 },
      uNightFactor: { value: 0 },
    },
    fog: true,
    side: THREE.FrontSide,
  })
  return vitrineMat
}

export function setVitrineNightFactor(nf: number): void {
  if (vitrineMat && vitrineMat.uniforms['uNightFactor']) {
    vitrineMat.uniforms['uNightFactor'].value = nf
  }
}
