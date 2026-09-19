/**
 * StreetFurnitureGenerator — real street objects from OSM tagged nodes
 * (trees, lamps, benches, bollards, bike racks, bins, bus stops, hydrants,
 * post boxes, fountains, advertising, subway entrances…), instanced per chunk.
 *
 * Everything comes from the chunk's own POIs (OSM tags); nothing is
 * city-specific. One THREE.InstancedMesh per archetype (one draw call),
 * shared materials, geometry built once per archetype and shared by chunks.
 *
 * Called from ChunkLoader.buildGroupIncremental() for each chunk (or delivery
 * delta) with that chunk's POIs; colliders from ChunkManager._runJob().
 */

import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { PointOfInterest, Road, Building } from '@world-drive/shared'
import {
  getPlataneTemplate,
  getLindenTemplate,
  getOrnamentalTemplate,
  getBenchTemplate,
} from './ParkMeshGenerator.js'

// ── Limits ────────────────────────────────────────────────────────────────

const MAX_PER_KIND = 400
const MAX_TREES = 600 // total real trees per chunk (all archetypes)
const ROAD_MARGIN = 1.0 // metres added to the half road width for the "on the road" test

// ── Hashing (deterministic per-node variation) ─────────────────────────────

function hash32(s: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return h
}

/** Uniform [0,1) from a hash and a salt. */
function unit(h: number, salt: number): number {
  let x = (h ^ Math.imul(salt + 1, 0x9e3779b1)) >>> 0
  x = Math.imul(x ^ (x >>> 15), 0x85ebca6b) >>> 0
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

function parseMetres(v: string | undefined): number | null {
  if (!v) return null
  const n = parseFloat(v.replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : null
}

// ── Road spatial index (ribbon test + nearest road orientation) ────────────

interface Seg {
  x1: number
  z1: number
  dx: number
  dz: number
  lenSq: number
  halfW: number
}

interface NearestRoad {
  d2: number
  /** unit direction along the road */
  dirX: number
  dirZ: number
  /** unit vector from the query point towards the road */
  toX: number
  toZ: number
}

const NON_VEHICLE = new Set(['footway', 'path', 'steps', 'pedestrian', 'cycleway', 'bridleway', 'corridor', 'platform'])
const CELL = 24

class RoadIndex {
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

// ── Shared materials ───────────────────────────────────────────────────────

/** All furniture geometry carries vertex colours → one material for every kind. */
const FURN_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.12 })
const CROWN_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.76, metalness: 0.02, flatShading: true })
const LAMP_HEAD_MAT = new THREE.MeshStandardMaterial({ color: 0xfff4d6, emissive: 0xffe2a0, emissiveIntensity: 1.4, roughness: 0.4 })
const WHITE = new THREE.Color(0xffffff)

// ── Geometry helpers (vertex-coloured, non-indexed, merged) ────────────────

function bakeColour(geo: THREE.BufferGeometry, c: THREE.Color): THREE.BufferGeometry {
  const n = geo.getAttribute('position')!.count
  const arr = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r
    arr[i * 3 + 1] = c.g
    arr[i * 3 + 2] = c.b
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3))
  return geo
}

function normalise(geo: THREE.BufferGeometry, matrix?: THREE.Matrix4): THREE.BufferGeometry {
  let g = geo.index ? geo.toNonIndexed() : geo.clone()
  if (matrix) g.applyMatrix4(matrix)
  for (const name of Object.keys(g.attributes)) {
    if (name !== 'position' && name !== 'normal' && name !== 'uv' && name !== 'color') g.deleteAttribute(name)
  }
  if (!g.getAttribute('normal')) g.computeVertexNormals()
  if (!g.getAttribute('uv')) {
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position')!.count * 2), 2))
  }
  return g
}

class GeoBuilder {
  private parts: THREE.BufferGeometry[] = []
  private readonly c = new THREE.Color()

  box(w: number, h: number, d: number, x: number, y: number, z: number, colour: number, rotY = 0): this {
    const g = new THREE.BoxGeometry(w, h, d)
    if (rotY) g.rotateY(rotY)
    g.translate(x, y, z)
    this.parts.push(bakeColour(normalise(g), this.c.set(colour)))
    g.dispose()
    return this
  }

  cyl(rTop: number, rBot: number, h: number, x: number, y: number, z: number, colour: number, segs = 8): this {
    const g = new THREE.CylinderGeometry(rTop, rBot, h, segs)
    g.translate(x, y, z)
    this.parts.push(bakeColour(normalise(g), this.c.set(colour)))
    g.dispose()
    return this
  }

  /** Merge the meshes of a template group, baking each mesh's material colour. */
  template(group: THREE.Group, keep?: (m: THREE.Mesh) => boolean): this {
    group.updateMatrixWorld(true)
    group.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh || !m.geometry) return
      if (keep && !keep(m)) return
      const mat = (Array.isArray(m.material) ? m.material[0] : m.material) as THREE.MeshStandardMaterial
      const colour = mat && mat.color ? mat.color : WHITE
      this.parts.push(bakeColour(normalise(m.geometry, m.matrixWorld), colour))
    })
    return this
  }

  build(): THREE.BufferGeometry {
    const merged = this.parts.length === 1 ? this.parts[0]! : mergeGeometries(this.parts, false)
    if (!merged) return new THREE.BufferGeometry()
    merged.computeBoundingBox()
    merged.computeBoundingSphere()
    return merged
  }
}

// ── Archetypes ─────────────────────────────────────────────────────────────

type ArchKey =
  | 'lamp' | 'lampHead' | 'bench' | 'benchNb' | 'bollard' | 'bike' | 'waste' | 'hydrant'
  | 'postbox' | 'fountain' | 'ad' | 'adColumn' | 'busStop' | 'subway'
  | 'trunk0' | 'trunk1' | 'trunk2' | 'crown0' | 'crown1' | 'crown2'

interface ArchDef {
  geo: () => THREE.BufferGeometry
  mat: () => THREE.Material
  shadow: boolean
}

interface TreeArch {
  trunk: THREE.BufferGeometry
  crown: THREE.BufferGeometry
  trunkMat: THREE.Material
  height: number
}

const _treeArch: (TreeArch | null)[] = [null, null, null]

function getTreeArch(i: 0 | 1 | 2): TreeArch {
  const cached = _treeArch[i]
  if (cached) return cached
  const tpl = i === 0 ? getPlataneTemplate() : i === 1 ? getLindenTemplate() : getOrnamentalTemplate()
  const isTrunk = (m: THREE.Mesh) => !!(m.material as THREE.MeshStandardMaterial).map
  tpl.updateMatrixWorld(true)
  const trunkParts: THREE.BufferGeometry[] = []
  let trunkMat: THREE.Material = FURN_MAT
  tpl.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh || !m.geometry || !isTrunk(m)) return
    trunkMat = m.material as THREE.Material
    trunkParts.push(normalise(m.geometry, m.matrixWorld))
  })
  const trunk = trunkParts.length === 1 ? trunkParts[0]! : (mergeGeometries(trunkParts, false) ?? new THREE.BufferGeometry())
  trunk.computeBoundingBox()
  trunk.computeBoundingSphere()
  const crown = new GeoBuilder().template(tpl, (m) => !isTrunk(m)).build()
  const height = Math.max(crown.boundingBox?.max.y ?? 8, trunk.boundingBox?.max.y ?? 3)
  const arch: TreeArch = { trunk, crown, trunkMat, height }
  _treeArch[i] = arch
  return arch
}

const ARCH: Record<ArchKey, ArchDef> = {
  lamp: {
    shadow: true,
    mat: () => FURN_MAT,
    geo: () => new GeoBuilder()
      .cyl(0.055, 0.09, 4.0, 0, 2.0, 0, 0x2f3236, 8)
      .cyl(0.16, 0.16, 0.06, 0, 0.03, 0, 0x2f3236, 8)
      .box(0.06, 0.06, 1.15, 0, 3.97, 0.55, 0x2f3236)
      .build(),
  },
  lampHead: {
    shadow: false,
    mat: () => LAMP_HEAD_MAT,
    geo: () => {
      const g = new THREE.BoxGeometry(0.42, 0.14, 0.32)
      g.translate(0, 3.9, 1.05)
      return g
    },
  },
  bench: {
    shadow: false,
    mat: () => FURN_MAT,
    geo: () => new GeoBuilder().template(getBenchTemplate()).build(),
  },
  benchNb: {
    shadow: false,
    mat: () => FURN_MAT,
    geo: () => new GeoBuilder().template(getBenchTemplate(), (m) => {
      m.geometry.computeBoundingBox()
      return (m.geometry.boundingBox?.max.y ?? 0) < 0.5
    }).build(),
  },
  bollard: {
    shadow: false,
    mat: () => FURN_MAT,
    geo: () => new GeoBuilder()
      .cyl(0.075, 0.085, 0.86, 0, 0.43, 0, 0x3a3d40, 8)
      .cyl(0.09, 0.09, 0.05, 0, 0.885, 0, 0x9a9da0, 8)
      .build(),
  },
  bike: {
    shadow: false,
    mat: () => FURN_MAT,
    geo: () => new GeoBuilder()
      .cyl(0.025, 0.025, 0.78, -0.36, 0.39, 0, 0x8c9094, 6)
      .cyl(0.025, 0.025, 0.78, 0.36, 0.39, 0, 0x8c9094, 6)
      .box(0.77, 0.05, 0.05, 0, 0.79, 0, 0x8c9094)
      .build(),
  },
  waste: {
    shadow: false,
    mat: () => FURN_MAT,
    geo: () => new GeoBuilder()
      .cyl(0.03, 0.03, 1.0, 0, 0.5, 0.2, 0x3b3f42, 6)
      .cyl(0.2, 0.17, 0.75, 0, 0.62, 0, 0x2f5f3b, 8)
      .cyl(0.21, 0.21, 0.04, 0, 1.0, 0, 0x1f1f1f, 8)
      .build(),
  },
  hydrant: {
    shadow: false,
    mat: () => FURN_MAT,
    geo: () => new GeoBuilder()
      .cyl(0.11, 0.13, 0.62, 0, 0.31, 0, 0xc0392b, 8)
      .cyl(0.09, 0.11, 0.1, 0, 0.66, 0, 0x8e8e8e, 8)
      .box(0.34, 0.09, 0.09, 0, 0.42, 0, 0x8e8e8e)
      .build(),
  },
  postbox: {
    shadow: false,
    mat: () => FURN_MAT,
    // white vertex colour → per-instance colour via instanceColor (tags.colour)
    geo: () => new GeoBuilder()
      .box(0.45, 0.95, 0.35, 0, 0.72, 0, 0xffffff)
      .box(0.36, 0.25, 0.28, 0, 0.125, 0, 0x4a4a4a)
      .build(),
  },
  fountain: {
    shadow: false,
    mat: () => FURN_MAT,
    geo: () => new GeoBuilder()
      .cyl(1.2, 1.25, 0.5, 0, 0.25, 0, 0x8d8d88, 16)
      .cyl(1.05, 1.05, 0.46, 0, 0.29, 0, 0x4a90c8, 16)
      .cyl(0.14, 0.2, 1.1, 0, 1.0, 0, 0x8d8d88, 8)
      .cyl(0.4, 0.42, 0.12, 0, 1.5, 0, 0x9a9a94, 12)
      .build(),
  },
  ad: {
    shadow: false,
    mat: () => FURN_MAT,
    geo: () => new GeoBuilder()
      .cyl(0.05, 0.06, 2.3, 0, 1.15, 0, 0x3a3d40, 8)
      .box(2.0, 1.5, 0.06, 0, 3.0, 0, 0x2a2d30)
      .box(1.9, 1.4, 0.04, 0, 3.0, 0.02, 0xe8e2d4)
      .build(),
  },
  adColumn: {
    shadow: false,
    mat: () => FURN_MAT,
    geo: () => new GeoBuilder()
      .cyl(0.6, 0.62, 2.9, 0, 1.45, 0, 0x2f5f3b, 12)
      .cyl(0.58, 0.58, 2.0, 0, 1.6, 0, 0xd8d0bf, 12)
      .cyl(0.05, 0.7, 0.5, 0, 3.15, 0, 0x2f5f3b, 12)
      .build(),
  },
  busStop: {
    shadow: false,
    mat: () => FURN_MAT,
    geo: () => new GeoBuilder()
      .cyl(0.04, 0.045, 3.0, 0, 1.5, 0, 0x3a3d40, 8)
      .box(0.6, 0.2, 0.03, 0, 2.72, 0, 0x1f3a93)
      .box(0.22, 0.22, 0.03, 0, 2.98, 0, 0xe8b400)
      .build(),
  },
  subway: {
    shadow: false,
    mat: () => FURN_MAT,
    geo: () => new GeoBuilder()
      .cyl(0.04, 0.04, 1.0, -1.0, 0.5, 0, 0x1f4d3a, 6)
      .cyl(0.04, 0.04, 1.0, 1.0, 0.5, 0, 0x1f4d3a, 6)
      .box(2.1, 0.05, 0.05, 0, 1.0, 0, 0x1f4d3a)
      .box(2.1, 0.04, 0.04, 0, 0.55, 0, 0x1f4d3a)
      .cyl(0.04, 0.045, 2.6, 1.2, 1.3, 0, 0x1f4d3a, 6)
      .box(0.7, 0.3, 0.04, 1.2, 2.45, 0, 0x145a32)
      .build(),
  },
  trunk0: { shadow: true, mat: () => getTreeArch(0).trunkMat, geo: () => getTreeArch(0).trunk },
  trunk1: { shadow: true, mat: () => getTreeArch(1).trunkMat, geo: () => getTreeArch(1).trunk },
  trunk2: { shadow: true, mat: () => getTreeArch(2).trunkMat, geo: () => getTreeArch(2).trunk },
  crown0: { shadow: true, mat: () => CROWN_MAT, geo: () => getTreeArch(0).crown },
  crown1: { shadow: true, mat: () => CROWN_MAT, geo: () => getTreeArch(1).crown },
  crown2: { shadow: true, mat: () => CROWN_MAT, geo: () => getTreeArch(2).crown },
}

const _geoCache = new Map<ArchKey, THREE.BufferGeometry>()
function getGeo(key: ArchKey): THREE.BufferGeometry {
  let g = _geoCache.get(key)
  if (!g) {
    g = ARCH[key].geo()
    _geoCache.set(key, g)
  }
  return g
}

// ── Label atlas (bus stop / station names) — one canvas + material per chunk ─

const LABEL_W = 256
const LABEL_H = 64
const ATLAS_SIZE = 2048
const ATLAS_COLS = ATLAS_SIZE / LABEL_W
const MAX_LABELS = 256 // 8 cols × 32 rows at most (2048²)

interface LabelStyle { bg: string; fg: string }
const BUS_STYLE: LabelStyle = { bg: '#1f3a93', fg: '#ffffff' }
const SUBWAY_STYLE: LabelStyle = { bg: '#145a32', fg: '#ffffff' }

const _labelCache = new Map<string, HTMLCanvasElement>()

function renderLabel(text: string, style: LabelStyle): HTMLCanvasElement {
  const key = style.bg + '|' + text
  const cached = _labelCache.get(key)
  if (cached) return cached
  const c = document.createElement('canvas')
  c.width = LABEL_W
  c.height = LABEL_H
  const ctx = c.getContext('2d')!
  ctx.fillStyle = style.bg
  ctx.fillRect(0, 0, LABEL_W, LABEL_H)
  ctx.fillStyle = style.fg
  ctx.font = 'bold 34px system-ui, Helvetica, Arial, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, LABEL_W / 2, LABEL_H / 2 + 1, LABEL_W - 16)
  if (_labelCache.size > 2000) _labelCache.clear()
  _labelCache.set(key, c)
  return c
}

class LabelAtlas {
  private entries: { text: string; style: LabelStyle }[] = []
  private slots = new Map<string, number>()
  private height = 0

  /** Reserve a slot for the label; returns its index, or null when full / no DOM. */
  add(text: string, style: LabelStyle): number | null {
    if (typeof document === 'undefined') return null
    const key = style.bg + '|' + text
    const hit = this.slots.get(key)
    if (hit !== undefined) return hit
    if (this.entries.length >= MAX_LABELS) return null
    const i = this.entries.length
    this.entries.push({ text, style })
    this.slots.set(key, i)
    return i
  }

  /** Draw the atlas (2048 × smallest power-of-two height that fits) → one material per chunk. */
  build(): THREE.MeshBasicMaterial | null {
    const n = this.entries.length
    if (n === 0) return null
    const rows = Math.ceil(n / ATLAS_COLS)
    let height = LABEL_H
    while (height < rows * LABEL_H) height *= 2
    this.height = height
    const canvas = document.createElement('canvas')
    canvas.width = ATLAS_SIZE
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    for (let i = 0; i < n; i++) {
      const e = this.entries[i]!
      ctx.drawImage(renderLabel(e.text, e.style), (i % ATLAS_COLS) * LABEL_W, Math.floor(i / ATLAS_COLS) * LABEL_H)
    }
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 4
    return new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })
  }

  /** [u0, v0, u1, v1] of a slot — valid after build() (flipY texture: v = 1 - y/height). */
  uv(i: number): [number, number, number, number] {
    const px = (i % ATLAS_COLS) * LABEL_W
    const py = Math.floor(i / ATLAS_COLS) * LABEL_H
    const hgt = this.height || LABEL_H
    return [px / ATLAS_SIZE, 1 - (py + LABEL_H) / hgt, (px + LABEL_W) / ATLAS_SIZE, 1 - py / hgt]
  }
}

// ── Placement collection ───────────────────────────────────────────────────

interface Placement {
  x: number
  y: number
  z: number
  yaw: number
  sx: number
  sy: number
  sz: number
  colour?: THREE.Color
}

interface LabelPlacement {
  x: number
  y: number
  z: number
  yaw: number
  w: number
  h: number
  slot: number
}

const _m = new THREE.Matrix4()
const _p = new THREE.Vector3()
const _q = new THREE.Quaternion()
const _s = new THREE.Vector3()
const _Y = new THREE.Vector3(0, 1, 0)

function treeArchetypeFor(tags: Record<string, string> | undefined): 0 | 1 | 2 {
  const g = ((tags?.['genus'] ?? '') + ' ' + (tags?.['species'] ?? '') + ' ' + (tags?.['taxon'] ?? '')).toLowerCase()
  if (!g.trim()) return 2
  if (/platan|aesculus|marronnier|chestnut|plane/.test(g)) return 0
  if (/tilia|acer|carpinus|quercus|fraxinus|ulmus|populus|fagus|robinia|celtis|sophora|styphnolobium|linden|oak|maple/.test(g)) return 1
  return 2
}

function faceYaw(n: NearestRoad | null, h: number): number {
  // Rotation about Y by yaw maps local +z to (sin yaw, 0, cos yaw): local +z faces the road.
  return n ? Math.atan2(n.toX, n.toZ) : unit(h, 3) * Math.PI * 2
}

function parseColourTag(v: string | undefined): THREE.Color | null {
  if (!v) return null
  const s = v.trim().toLowerCase()
  if (/^#[0-9a-f]{6}$/.test(s)) return new THREE.Color(s)
  const names = THREE.Color.NAMES as Record<string, number>
  const hex = names[s]
  return hex !== undefined ? new THREE.Color(hex) : null
}

const DEFAULT_POSTBOX = new THREE.Color(0xd4a017)

// ─────────────────────────────────────────────────────────────────────────────

export class StreetFurnitureGenerator {
  static generate(pois: PointOfInterest[], roads: Road[], _buildings: Building[]): THREE.Group | null {
    if (pois.length === 0) return null
    const t0 = performance.now()

    const index = new RoadIndex(roads)
    const lists = new Map<ArchKey, Placement[]>()
    const labels: LabelPlacement[] = []
    const atlas = new LabelAtlas()
    let treeCount = 0

    const push = (key: ArchKey, p: Placement, cap = MAX_PER_KIND): boolean => {
      let list = lists.get(key)
      if (!list) {
        list = []
        lists.set(key, list)
      }
      if (list.length >= cap) return false
      list.push(p)
      return true
    }
    const simple = (key: ArchKey, x: number, z: number, yaw: number, s = 1, colour?: THREE.Color): boolean => {
      const p: Placement = { x, y: 0, z, yaw, sx: s, sy: s, sz: s }
      if (colour) p.colour = colour
      return push(key, p)
    }

    for (const poi of pois) {
      const kind = poi.kind
      if (!kind) continue
      const x = poi.position.x
      const z = poi.position.z
      const tags = poi.tags
      const h = hash32(poi.id)

      switch (kind) {
        case 'tree': {
          if (treeCount >= MAX_TREES) break
          if (index.insideRoad(x, z)) break
          const arch = treeArchetypeFor(tags)
          const ta = getTreeArch(arch)
          let height = parseMetres(tags?.['height']) ?? 9
          height = clamp(height, 3, 25) * (0.9 + 0.2 * unit(h, 2))
          height = clamp(height, 3, 25)
          const sy = height / ta.height
          const sxz = Math.pow(sy, 0.8)
          const yaw = unit(h, 1) * Math.PI * 2
          const p: Placement = { x, y: 0, z, yaw, sx: sxz, sy, sz: sxz }
          const tk = ('trunk' + arch) as ArchKey
          const ck = ('crown' + arch) as ArchKey
          if (push(tk, p, MAX_TREES) && push(ck, p, MAX_TREES)) treeCount++
          break
        }
        case 'street_lamp': {
          if (index.insideRoad(x, z)) break
          const near = index.nearest(x, z)
          const yaw = faceYaw(near, h)
          const lh = clamp(parseMetres(tags?.['height']) ?? 4, 3, 10) / 4
          const p: Placement = { x, y: 0, z, yaw, sx: 1, sy: lh, sz: 1 }
          if (push('lamp', p)) push('lampHead', p)
          break
        }
        case 'bench': {
          if (index.insideRoad(x, z)) break
          const yaw = faceYaw(index.nearest(x, z), h)
          const noBack = tags?.['backrest'] === 'no'
          simple(noBack ? 'benchNb' : 'bench', x, z, yaw)
          break
        }
        case 'bollard': {
          if (index.insideRoad(x, z)) break
          simple('bollard', x, z, 0)
          break
        }
        case 'bicycle_parking': {
          if (index.insideRoad(x, z)) break
          const near = index.nearest(x, z)
          const cap = parseInt(tags?.['capacity'] ?? '', 10)
          const n = Number.isFinite(cap) && cap > 0 ? clamp(Math.ceil(cap / 2), 1, 6) : 3
          let dx = 1
          let dz = 0
          let yaw: number
          if (near) {
            dx = near.dirX
            dz = near.dirZ
            // local +x → road normal (perpendicular to the row)
            yaw = Math.atan2(-near.toZ, near.toX)
          } else {
            const a = unit(h, 3) * Math.PI * 2
            dx = Math.cos(a)
            dz = Math.sin(a)
            yaw = Math.atan2(-dx, -dz)
          }
          const spacing = 0.9
          for (let i = 0; i < n; i++) {
            const off = (i - (n - 1) / 2) * spacing
            if (!simple('bike', x + dx * off, z + dz * off, yaw)) break
          }
          break
        }
        case 'waste_basket': {
          if (index.insideRoad(x, z)) break
          simple('waste', x, z, faceYaw(index.nearest(x, z), h) + Math.PI)
          break
        }
        case 'fire_hydrant': {
          if (index.insideRoad(x, z)) break
          simple('hydrant', x, z, faceYaw(index.nearest(x, z), h))
          break
        }
        case 'post_box': {
          if (index.insideRoad(x, z)) break
          const colour = parseColourTag(tags?.['colour'] ?? tags?.['color']) ?? DEFAULT_POSTBOX
          simple('postbox', x, z, faceYaw(index.nearest(x, z), h), 1, colour)
          break
        }
        case 'fountain': {
          if (index.insideRoad(x, z)) break
          simple('fountain', x, z, 0, 0.85 + 0.3 * unit(h, 2))
          break
        }
        case 'advertising': {
          if (index.insideRoad(x, z)) break
          const isColumn = tags?.['advertising'] === 'column' || tags?.['advertising'] === 'totem'
          simple(isColumn ? 'adColumn' : 'ad', x, z, faceYaw(index.nearest(x, z), h))
          break
        }
        case 'bus_stop': {
          if (index.insideRoad(x, z)) break
          const yaw = faceYaw(index.nearest(x, z), h)
          if (!simple('busStop', x, z, yaw)) break
          const name = tags?.['name'] ?? poi.name
          if (name) {
            const slot = atlas.add(name, BUS_STYLE)
            if (slot !== null) labels.push({ x, y: 2.72, z, yaw, w: 0.58, h: 0.145, slot })
          }
          break
        }
        case 'subway_entrance': {
          if (index.insideRoad(x, z)) break
          const yaw = faceYaw(index.nearest(x, z), h)
          if (!simple('subway', x, z, yaw)) break
          const name = tags?.['name'] ?? poi.name ?? 'M'
          const slot = atlas.add(name, SUBWAY_STYLE)
          if (slot !== null) {
            // sign board sits at local (1.2, 2.45, 0); front face at z = +0.02
            const sin = Math.sin(yaw)
            const cos = Math.cos(yaw)
            labels.push({ x: x + cos * 1.2 + sin * 0.025, y: 2.45, z: z - sin * 1.2 + cos * 0.025, yaw, w: 0.68, h: 0.17, slot })
          }
          break
        }
        default:
          break
      }
    }

    if (lists.size === 0) return null

    const group = new THREE.Group()
    group.name = 'street-furniture'
    let total = 0

    for (const [key, list] of lists) {
      if (list.length === 0) continue
      const def = ARCH[key]
      const mesh = new THREE.InstancedMesh(getGeo(key), def.mat(), list.length)
      mesh.name = 'sf-' + key
      const wantsColour = key === 'postbox'
      for (let i = 0; i < list.length; i++) {
        const p = list[i]!
        _p.set(p.x, p.y, p.z)
        _q.setFromAxisAngle(_Y, p.yaw)
        _s.set(p.sx, p.sy, p.sz)
        _m.compose(_p, _q, _s)
        mesh.setMatrixAt(i, _m)
        if (wantsColour) mesh.setColorAt(i, p.colour ?? DEFAULT_POSTBOX)
      }
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
      mesh.castShadow = def.shadow
      mesh.receiveShadow = false
      mesh.userData['skipMerge'] = true
      mesh.computeBoundingSphere()
      group.add(mesh)
      total += list.length
    }

    // Text labels: small planes sharing this chunk's atlas material (merged by ChunkOptimizer)
    const labelMat = labels.length > 0 ? atlas.build() : null
    if (labelMat) {
      for (const l of labels) {
        const g = new THREE.PlaneGeometry(l.w, l.h)
        const uv = g.getAttribute('uv') as THREE.BufferAttribute
        const [u0, v0, u1, v1] = atlas.uv(l.slot)
        for (let i = 0; i < uv.count; i++) {
          uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0))
        }
        // front face of the board: local z = +0.02 (bus stop board is 0.03 thick at z = 0)
        _p.set(l.x, l.y, l.z)
        _q.setFromAxisAngle(_Y, l.yaw)
        _s.set(1, 1, 1)
        _m.compose(_p, _q, _s)
        g.translate(0, 0, 0.02)
        g.applyMatrix4(_m)
        const mesh = new THREE.Mesh(g, labelMat)
        mesh.castShadow = false
        mesh.receiveShadow = false
        group.add(mesh)
      }
    }

    const ms = performance.now() - t0
    console.debug(`[StreetFurniture] ${total} instances in ${lists.size} draw calls, ${labels.length} labels — ${ms.toFixed(1)} ms`)
    return group
  }

  /** Cylinders for tree trunks and bollards only (same filters/caps as generate()). */
  static createColliderDescs(pois: PointOfInterest[], roads: Road[]): RAPIER.ColliderDesc[] {
    const out: RAPIER.ColliderDesc[] = []
    if (pois.length === 0) return out
    const index = new RoadIndex(roads)
    let trees = 0
    let bollards = 0
    for (const poi of pois) {
      const kind = poi.kind
      if (kind !== 'tree' && kind !== 'bollard') continue
      const x = poi.position.x
      const z = poi.position.z
      if (index.insideRoad(x, z)) continue
      if (kind === 'tree') {
        if (trees >= MAX_TREES) continue
        trees++
        out.push(RAPIER.ColliderDesc.cylinder(1.0, 0.25).setTranslation(x, 1.0, z))
      } else {
        if (bollards >= MAX_PER_KIND) continue
        bollards++
        out.push(RAPIER.ColliderDesc.cylinder(0.45, 0.08).setTranslation(x, 0.45, z))
      }
    }
    return out
  }
}
