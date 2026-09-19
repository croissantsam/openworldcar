/**
 * RoadMeshGenerator — Burnout Paradise arcade racing aesthetic.
 *
 * Features:
 *   - Sleek dark asphalt with PBR specular sheen and roughness
 *   - Rubber tire wear tracks embedded in every lane
 *   - Bold double yellow continuous lines on 4-lane avenues
 *   - Crisp, long white dashed lane dividers (racing speed ratio)
 *   - Solid white edge lines framing the road
 *   - Directional arrows painted flat on the asphalt
 *   - Wide zebra pedestrian crossings near junctions
 *   - Smooth, clean beveled curbs & raised sidewalks
 *   - NO vertical poles, traffic lights or signs blocking the driving path!
 */

import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import type { Road, RoadSurface } from '@world-drive/shared'
import { CHUNK_SIZE } from '@world-drive/math'
import { buildParkedCars } from './ParkedCarGenerator.js'

/** Per-chunk options passed by the loader. */
export type RoadGenerateOptions = {
  /** Chunk cell being built: only this cell's portions of the way are generated. */
  cell?: { x: number; z: number }
  /** false when the chunk has real street lamps (OSM nodes): skip the procedural ones. */
  syntheticLamps?: boolean
}

const LANE_WIDTH = 3.6 // metres per lane
const SIDEWALK_HEIGHT = 0.12 // 12cm curb elevation above road
const CURB_WIDTH = 0.18 // 18cm beveled granite curb
const DEFAULT_SIDEWALK_WIDTH = 2.0 // Realistic 2.0m wide sidewalk

// ── 1. Materials (Burnout Paradise PBR Palette) ─────────────────────────────

// Realistic weathered asphalt texture (warm charcoal slate + mineral flecks)
function createAsphaltTexture(): THREE.CanvasTexture {
  if (typeof document === 'undefined') {
    return new THREE.CanvasTexture({} as HTMLCanvasElement)
  }
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 512
  const ctx = canvas.getContext('2d')!

  // Medium charcoal grey asphalt base (realistic slate tone)
  ctx.fillStyle = '#42454c'
  ctx.fillRect(0, 0, 512, 512)

  const idata = ctx.getImageData(0, 0, 512, 512)
  const d = idata.data
  for (let i = 0; i < d.length; i += 4) {
    const grain = (Math.random() - 0.5) * 36
    d[i] = Math.min(255, Math.max(0, 66 + grain))
    d[i + 1] = Math.min(255, Math.max(0, 69 + grain))
    d[i + 2] = Math.min(255, Math.max(0, 76 + grain))
    d[i + 3] = 255
  }
  ctx.putImageData(idata, 0, 0)

  // Subtle mineral aggregate speckles
  ctx.fillStyle = 'rgba(200, 205, 215, 0.12)'
  for (let k = 0; k < 300; k++) {
    ctx.fillRect(Math.random() * 512, Math.random() * 512, 2, 2)
  }
  ctx.fillStyle = 'rgba(25, 25, 30, 0.15)'
  for (let k = 0; k < 300; k++) {
    ctx.fillRect(Math.random() * 512, Math.random() * 512, 2, 2)
  }

  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(2, 6)
  return tex
}

const ASPHALT_TEX = createAsphaltTexture()

// High-performance dark asphalt with slight specular sheen
// Negative polygonOffset pulls road forward so it cleanly occludes park lawns & terrain
const ASPHALT_MATS: Record<string, THREE.MeshStandardMaterial> = {
  motorway:    new THREE.MeshStandardMaterial({ color: 0x32353c, map: ASPHALT_TEX, roughness: 0.74, metalness: 0.10, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2.0, polygonOffsetUnits: -2.0 }),
  trunk:       new THREE.MeshStandardMaterial({ color: 0x2e3138, map: ASPHALT_TEX, roughness: 0.74, metalness: 0.10, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2.0, polygonOffsetUnits: -2.0 }),
  primary:     new THREE.MeshStandardMaterial({ color: 0x2b2e34, map: ASPHALT_TEX, roughness: 0.76, metalness: 0.08, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2.0, polygonOffsetUnits: -2.0 }),
  secondary:   new THREE.MeshStandardMaterial({ color: 0x282b30, map: ASPHALT_TEX, roughness: 0.78, metalness: 0.06, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2.0, polygonOffsetUnits: -2.0 }),
  tertiary:    new THREE.MeshStandardMaterial({ color: 0x26282e, map: ASPHALT_TEX, roughness: 0.80, metalness: 0.05, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2.0, polygonOffsetUnits: -2.0 }),
  residential: new THREE.MeshStandardMaterial({ color: 0x24272c, map: ASPHALT_TEX, roughness: 0.82, metalness: 0.04, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2.0, polygonOffsetUnits: -2.0 }),
  service:     new THREE.MeshStandardMaterial({ color: 0x222428, map: ASPHALT_TEX, roughness: 0.84, metalness: 0.03, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2.0, polygonOffsetUnits: -2.0 }),
  default:     new THREE.MeshStandardMaterial({ color: 0x26282e, map: ASPHALT_TEX, roughness: 0.80, metalness: 0.05, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2.0, polygonOffsetUnits: -2.0 }),
}

// Granite gutter border along the road edge
const GUTTER_MAT = new THREE.MeshStandardMaterial({
  color: 0x50545c,
  roughness: 0.82,
  metalness: 0.05,
  side: THREE.DoubleSide,
  polygonOffset: true,
  polygonOffsetFactor: -2.0,
  polygonOffsetUnits: -2.0,
})

// Rubber tire wear tracks along the lanes
const TIRE_RUBBER_MAT = new THREE.MeshStandardMaterial({
  color: 0x121316,
  roughness: 0.60,
  metalness: 0.06,
  transparent: true,
  opacity: 0.35,
  depthWrite: false,
  side: THREE.DoubleSide,
})

// Sharp, vibrant markings
const WHITE_MARK = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  roughness: 0.35,
  metalness: 0.0,
  emissive: 0xffffff,
  emissiveIntensity: 0.22,
  side: THREE.DoubleSide,
  polygonOffset: true,
  polygonOffsetFactor: -3.0,
  polygonOffsetUnits: -3.0,
})

const YELLOW_MARK = new THREE.MeshStandardMaterial({
  color: 0xffb800,
  roughness: 0.35,
  metalness: 0.0,
  emissive: 0xe6a000,
  emissiveIntensity: 0.25,
  side: THREE.DoubleSide,
  polygonOffset: true,
  polygonOffsetFactor: -3.0,
  polygonOffsetUnits: -3.0,
})

// ── Bridge structural materials ─────────────────────────────────────────────
const BRIDGE_DECK_MAT = new THREE.MeshStandardMaterial({
  color: 0x6e7074,
  roughness: 0.88,
  metalness: 0.08,
  side: THREE.DoubleSide,
})

const BRIDGE_PARAPET_STONE_MAT = new THREE.MeshStandardMaterial({
  color: 0x9e9a90,
  roughness: 0.84,
  metalness: 0.04,
  side: THREE.DoubleSide,
})

const BRIDGE_RAILING_METAL_MAT = new THREE.MeshStandardMaterial({
  color: 0x242830,
  roughness: 0.45,
  metalness: 0.65,
  side: THREE.DoubleSide,
})

const BRIDGE_PIER_MAT = new THREE.MeshStandardMaterial({
  color: 0x787a7e,
  roughness: 0.90,
  metalness: 0.05,
})

// ── Tunnel structural materials ─────────────────────────────────────────────
const TUNNEL_WALL_MAT = new THREE.MeshStandardMaterial({
  color: 0x3e4248,
  roughness: 0.92,
  metalness: 0.04,
  side: THREE.DoubleSide,
})

const TUNNEL_PORTAL_MAT = new THREE.MeshStandardMaterial({
  color: 0x585a60,
  roughness: 0.85,
  metalness: 0.06,
  side: THREE.DoubleSide,
})

const TUNNEL_LIGHT_MAT = new THREE.MeshStandardMaterial({
  color: 0xfff6c0,
  emissive: 0xffe890,
  emissiveIntensity: 1.4,
  roughness: 0.2,
})

const TRENCH_MASK_MAT = new THREE.MeshBasicMaterial({
  colorWrite: false,
  depthWrite: false,
  stencilWrite: true,
  stencilRef: 1,
  stencilFunc: THREE.AlwaysStencilFunc,
  stencilZPass: THREE.ReplaceStencilOp,
  side: THREE.DoubleSide,
})

function resamplePolyline(pts: { x: number; y: number; z: number }[], maxStep = 1.6): { x: number; y: number; z: number }[] {
  if (pts.length < 2) return pts
  const res: { x: number; y: number; z: number }[] = []
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

// ── Bridge & Tunnel 3D Elevation Solvers (pont.txt) ──────────────────────────

/**
 * Compute smooth 3D elevation profile for an elevated bridge (pont.txt section 11 & 24):
 * - Starts flush with ground at start (Y = 0.028m)
 * - Smooth cubic/cosine transition ramp rising to bridgeHeight (e.g. 4.5m)
 * - Elevated central span with subtle graceful crown arch (+0.2m)
 * - Smooth descending exit ramp back to ground
 */
export function computeElevatedBridgePoints(
  rawPts: { x: number; y: number; z: number }[],
  bridgeHeight = 4.5,
  connectsStart = false,
  connectsEnd = false,
): { points: { x: number; y: number; z: number }[]; totalLength: number; rampLength: number } {
  const pts = resamplePolyline(rawPts, 2.0)
  const N = pts.length
  if (N < 2) return { points: rawPts, totalLength: 0, rampLength: 0 }

  const dists = [0]
  let totalL = 0
  for (let i = 0; i < N - 1; i++) {
    const d = Math.hypot(pts[i + 1]!.x - pts[i]!.x, pts[i + 1]!.z - pts[i]!.z)
    totalL += d
    dists.push(totalL)
  }

  const rampL = Math.max(6.0, Math.min(22.0, totalL * 0.28))
  const GROUND_Y = 0.028

  const elevated = pts.map((p, i) => {
    const s = dists[i]!
    let y = GROUND_Y

    if (connectsStart && connectsEnd) {
      y = bridgeHeight
    } else if (connectsStart) {
      if (s > totalL - rampL) {
        const t = (totalL - s) / rampL
        const factor = 0.5 * (1 - Math.cos(Math.PI * t))
        y = GROUND_Y + (bridgeHeight - GROUND_Y) * factor
      } else {
        y = bridgeHeight
      }
    } else if (connectsEnd) {
      if (s < rampL) {
        const t = s / rampL
        const factor = 0.5 * (1 - Math.cos(Math.PI * t))
        y = GROUND_Y + (bridgeHeight - GROUND_Y) * factor
      } else {
        y = bridgeHeight
      }
    } else {
      if (totalL <= rampL * 2) {
        const t = s / totalL
        const arch = Math.sin(Math.PI * t)
        y = GROUND_Y + (bridgeHeight - GROUND_Y) * arch
      } else if (s < rampL) {
        const t = s / rampL
        const factor = 0.5 * (1 - Math.cos(Math.PI * t))
        y = GROUND_Y + (bridgeHeight - GROUND_Y) * factor
      } else if (s > totalL - rampL) {
        const t = (totalL - s) / rampL
        const factor = 0.5 * (1 - Math.cos(Math.PI * t))
        y = GROUND_Y + (bridgeHeight - GROUND_Y) * factor
      } else {
        const spanT = (s - rampL) / (totalL - rampL * 2)
        const crown = Math.sin(Math.PI * spanT) * 0.20
        y = bridgeHeight + crown
      }
    }

    return { x: p.x, y, z: p.z }
  })

  return { points: elevated, totalLength: totalL, rampLength: rampL }
}

/**
 * Compute smooth 3D elevation profile for an underground tunnel (pont.txt section 14):
 * - Slopes down from ground level (Y = 0.028m) at entrance down to tunnelDepth
 * - Constant depth along underground tube
 * - Slopes back up to ground level at exit portal
 */
export function computeTunnelPoints(
  rawPts: { x: number; y: number; z: number }[],
  tunnelDepth = -4.8,
  connectsStart = false,
  connectsEnd = false,
): { points: { x: number; y: number; z: number }[]; totalLength: number; rampLength: number } {
  const pts = resamplePolyline(rawPts, 2.0)
  const N = pts.length
  if (N < 2) return { points: rawPts, totalLength: 0, rampLength: 0 }

  const dists = [0]
  let totalL = 0
  for (let i = 0; i < N - 1; i++) {
    const d = Math.hypot(pts[i + 1]!.x - pts[i]!.x, pts[i + 1]!.z - pts[i]!.z)
    totalL += d
    dists.push(totalL)
  }

  // Smooth urban underpass ramp transition (16m - 34m)
  const rampL = Math.max(14.0, Math.min(34.0, totalL * 0.28))
  const GROUND_Y = 0.028

  const tunnelPoints = pts.map((p, i) => {
    const s = dists[i]!
    let y = GROUND_Y

    if (connectsStart && connectsEnd) {
      y = tunnelDepth
    } else if (connectsStart) {
      if (s > totalL - rampL) {
        const t = (totalL - s) / rampL
        const factor = 0.5 * (1 - Math.cos(Math.PI * t))
        y = GROUND_Y + (tunnelDepth - GROUND_Y) * factor
      } else {
        y = tunnelDepth
      }
    } else if (connectsEnd) {
      if (s < rampL) {
        const t = s / rampL
        const factor = 0.5 * (1 - Math.cos(Math.PI * t))
        y = GROUND_Y + (tunnelDepth - GROUND_Y) * factor
      } else {
        y = tunnelDepth
      }
    } else {
      if (totalL <= rampL * 2) {
        const t = s / totalL
        const dip = Math.sin(Math.PI * t)
        y = GROUND_Y + (tunnelDepth - GROUND_Y) * dip
      } else if (s < rampL) {
        // Descending entrance ramp (smooth cosine ease down into the ground)
        const t = s / rampL
        const factor = 0.5 * (1 - Math.cos(Math.PI * t))
        y = GROUND_Y + (tunnelDepth - GROUND_Y) * factor
      } else if (s > totalL - rampL) {
        // Ascending exit ramp (smooth cosine ease back up to surface)
        const t = (totalL - s) / rampL
        const factor = 0.5 * (1 - Math.cos(Math.PI * t))
        y = GROUND_Y + (tunnelDepth - GROUND_Y) * factor
      } else {
        // Horizontal subterranean depth
        y = tunnelDepth
      }
    }

    return { x: p.x, y, z: p.z }
  })

  return { points: tunnelPoints, totalLength: totalL, rampLength: rampL }
}

// Procedural Parisian granite paving tile texture for sidewalks
function createSidewalkTileTexture(): THREE.CanvasTexture {
  if (typeof document === 'undefined') {
    return new THREE.CanvasTexture({} as HTMLCanvasElement)
  }
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const ctx = canvas.getContext('2d')!

  // Warm Parisian granite tone (natural stone, not blinding white!)
  ctx.fillStyle = '#8a867e'
  ctx.fillRect(0, 0, 256, 256)

  // 4x4 paving stone slabs with distinct stone variation
  const tileSize = 64
  for (let y = 0; y < 256; y += tileSize) {
    for (let x = 0; x < 256; x += tileSize) {
      const shade = (Math.random() - 0.5) * 18
      const r = Math.min(255, Math.max(0, 138 + shade))
      const g = Math.min(255, Math.max(0, 134 + shade))
      const b = Math.min(255, Math.max(0, 126 + shade))
      ctx.fillStyle = `rgb(${r},${g},${b})`
      ctx.fillRect(x + 2, y + 2, tileSize - 4, tileSize - 4)

      // Fine stone flecks
      ctx.fillStyle = 'rgba(40, 35, 30, 0.10)'
      for (let k = 0; k < 8; k++) {
        ctx.fillRect(x + Math.random() * tileSize, y + Math.random() * tileSize, 2, 2)
      }
    }
  }

  // Dark joints between sidewalk paving slabs
  ctx.strokeStyle = '#4a463e'
  ctx.lineWidth = 3
  for (let x = 0; x <= 256; x += tileSize) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 256); ctx.stroke()
  }
  for (let y = 0; y <= 256; y += tileSize) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(256, y); ctx.stroke()
  }

  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(1, 4)
  return tex
}

// Clean beveled curb & raised sidewalk (with DoubleSide to guarantee visibility)
const CURB_MAT = new THREE.MeshStandardMaterial({
  color: 0x6e6a62, // Distinct darker cut granite curb stone
  roughness: 0.70,
  metalness: 0.08,
  side: THREE.DoubleSide,
})

const SIDEWALK_MAT = new THREE.MeshStandardMaterial({
  color: 0xdcd8d0, // Warm Parisian granite paving
  map: createSidewalkTileTexture(),
  roughness: 0.84,
  metalness: 0.04,
  side: THREE.DoubleSide,
})

// ── Surface textures ──────────────────────────────────────────────────────────

function createCobblestoneTexture(): THREE.CanvasTexture {
  if (typeof document === 'undefined') return new THREE.CanvasTexture({} as HTMLCanvasElement)
  const canvas = document.createElement('canvas')
  canvas.width = 256; canvas.height = 256
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#7a7870'
  ctx.fillRect(0, 0, 256, 256)
  // Irregular cobblestone shapes
  const rng = (n: bigint, s = 0) => ((n * 6364136223846793005n + 1442695040888963407n) >> 33n) % BigInt(s || 100)
  for (let i = 0; i < 120; i++) {
    const x = Number(rng(BigInt(i * 7 + 1), 240))
    const y = Number(rng(BigInt(i * 13 + 3), 240))
    const w = 14 + Number(rng(BigInt(i * 17), 12))
    const h = 10 + Number(rng(BigInt(i * 19), 8))
    const gray = 104 + Number(rng(BigInt(i * 23 + 7), 40)) - 20
    ctx.fillStyle = `rgb(${gray},${gray - 4},${gray - 8})`
    ctx.beginPath()
    ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'
    ctx.lineWidth = 1.5
    ctx.stroke()
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(3, 8)
  return tex
}

function createConcreteTexture(): THREE.CanvasTexture {
  if (typeof document === 'undefined') return new THREE.CanvasTexture({} as HTMLCanvasElement)
  const canvas = document.createElement('canvas')
  canvas.width = 256; canvas.height = 256
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#b8bab5'
  ctx.fillRect(0, 0, 256, 256)
  // Concrete panel joints
  ctx.strokeStyle = '#929590'
  ctx.lineWidth = 4
  for (let x = 0; x <= 256; x += 64) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 256); ctx.stroke() }
  for (let y = 0; y <= 256; y += 64) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(256, y); ctx.stroke() }
  const idata = ctx.getImageData(0, 0, 256, 256)
  for (let i = 0; i < idata.data.length; i += 4) {
    const g = (Math.random() - 0.5) * 12
    idata.data[i]! = Math.min(255, Math.max(0, idata.data[i]! + g))
    idata.data[i + 1]! = Math.min(255, Math.max(0, idata.data[i + 1]! + g))
    idata.data[i + 2]! = Math.min(255, Math.max(0, idata.data[i + 2]! + g))
  }
  ctx.putImageData(idata, 0, 0)
  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(2, 6)
  return tex
}

function createGravelTexture(): THREE.CanvasTexture {
  if (typeof document === 'undefined') return new THREE.CanvasTexture({} as HTMLCanvasElement)
  const canvas = document.createElement('canvas')
  canvas.width = 256; canvas.height = 256
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#a89880'
  ctx.fillRect(0, 0, 256, 256)
  for (let i = 0; i < 600; i++) {
    const x = Math.random() * 256, y = Math.random() * 256
    const r = 1 + Math.random() * 3
    const v = 130 + (Math.random() - 0.5) * 50
    ctx.fillStyle = `rgb(${v},${v - 10},${v - 20})`
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(3, 8)
  return tex
}

const COBBLESTONE_TEX = createCobblestoneTexture()
const CONCRETE_TEX = createConcreteTexture()
const GRAVEL_TEX = createGravelTexture()

const COBBLESTONE_MAT = new THREE.MeshStandardMaterial({ map: COBBLESTONE_TEX, roughness: 0.92, metalness: 0.02, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2.0, polygonOffsetUnits: -2.0 })
const CONCRETE_MAT   = new THREE.MeshStandardMaterial({ map: CONCRETE_TEX,    roughness: 0.85, metalness: 0.04, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2.0, polygonOffsetUnits: -2.0 })
const GRAVEL_MAT     = new THREE.MeshStandardMaterial({ map: GRAVEL_TEX,      roughness: 0.96, metalness: 0.01, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2.0, polygonOffsetUnits: -2.0 })

// Cycleway / path surface (blue-tinted smooth concrete)
const CYCLEWAY_MAT = new THREE.MeshStandardMaterial({ color: 0x6080c0, roughness: 0.80, metalness: 0.04, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2.0, polygonOffsetUnits: -2.0 })

// Parisian emerald green painted cycle lane material
const PARIS_CYCLEWAY_MAT = new THREE.MeshStandardMaterial({
  color: 0x1d6d42,
  roughness: 0.78,
  metalness: 0.04,
  side: THREE.DoubleSide,
  polygonOffset: true,
  polygonOffsetFactor: -2.5,
  polygonOffsetUnits: -2.5,
})

// Dedicated bus lane tinted asphalt material (rich bordeaux tone)
const PARIS_BUSWAY_MAT = new THREE.MeshStandardMaterial({
  color: 0x4a2424,
  roughness: 0.80,
  metalness: 0.05,
  side: THREE.DoubleSide,
  polygonOffset: true,
  polygonOffsetFactor: -2.5,
  polygonOffsetUnits: -2.5,
})

// Pedestrian street surface (wide, same Parisian granite paving as sidewalk)
// UVs of pedestrian surfaces are in metres / 2.4 (square 60 cm slabs), so the tile texture repeats once
function createPavingTexture(): THREE.CanvasTexture {
  const tex = createSidewalkTileTexture()
  tex.repeat.set(1, 1)
  return tex
}
const PEDESTRIAN_ROAD_MAT = new THREE.MeshStandardMaterial({
  color: 0xc8c4bc,
  map: createPavingTexture(),
  roughness: 0.86,
  metalness: 0.04,
  side: THREE.DoubleSide,
  polygonOffset: true, polygonOffsetFactor: -2.0, polygonOffsetUnits: -2.0,
})

// Pedestrian plaza (closed pedestrian way): flat paving below the street asphalt, no offset so streets win
const PLAZA_MAT = new THREE.MeshStandardMaterial({
  color: 0xc8c4bc,
  map: createPavingTexture(),
  roughness: 0.86,
  metalness: 0.04,
  side: THREE.DoubleSide,
})

function getAsphaltMaterial(highway: string, surface?: RoadSurface): THREE.MeshStandardMaterial {
  // Surface override takes priority over highway type
  if (surface === 'cobblestone' || surface === 'sett') return COBBLESTONE_MAT
  if (surface === 'concrete') return CONCRETE_MAT
  if (surface === 'gravel' || surface === 'fine_gravel' || surface === 'unpaved' || surface === 'dirt' || surface === 'ground' || surface === 'sand') return GRAVEL_MAT
  if (highway === 'cycleway') return CYCLEWAY_MAT
  if (highway === 'track') return GRAVEL_MAT
  if (highway === 'living_street') return COBBLESTONE_MAT
  if (highway === 'pedestrian') return PEDESTRIAN_ROAD_MAT
  if (highway === 'footway' || highway === 'path') return PEDESTRIAN_ROAD_MAT
  return ASPHALT_MATS[highway] ?? ASPHALT_MATS['default']!
}

// ── 2. Geometric Ribbon & Marking Generators (Miter Joins & Resampling) ──────

type Pt = { x: number; y: number; z: number }
type Vec2 = { x: number; z: number }

export interface PolylineNormal {
  nx: number
  nz: number
  miter: number
}

/** Optional overrides for the first / last vertex normal (mitered joint with a continuation way). */
export type EndNormals = { start?: PolylineNormal; end?: PolylineNormal }

/** Mitered normal at the joint between two unit directions (d1 arriving, d2 leaving). */
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
    // Clamp miter scale to [0.7, 1.42] to avoid acute hairpin spikes while maintaining width
    const miter = cosHalf > 0.38 ? Math.min(1.42, 1.0 / cosHalf) : 1.42
    return { nx, nz, miter }
  }
  return { nx: n1x, nz: n1z, miter: 1.0 }
}

/**
 * Computes smoothed vertex normals and miter join factors along a 3D polyline.
 * Ensures that extruded ribbons (road asphalt, curbs, sidewalks, markings) maintain
 * perfectly constant lateral width across all turns without thinning or pinching.
 * `endNormals` replaces the square cut at the first/last vertex by the mitered joint
 * shared with the continuation way, so two ways meet without a wedge.
 */
export function computePolylineNormals(points: Pt[], endNormals?: EndNormals): PolylineNormal[] {
  const N = points.length
  const normals: PolylineNormal[] = []
  if (N === 0) return normals
  if (N === 1) {
    normals.push({ nx: 0, nz: 1, miter: 1.0 })
    return normals
  }

  // Precompute unit segment directions
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

// ── Strips (ribbons with lateral offset, exact clipping at junctions) ────────

type RibbonSlice = { x: number; y: number; z: number; nx: number; nz: number; miter: number; arc: number; uvArc: number }
/** (x, z, arc) → true when a marking / sidewalk point must not be drawn there. */
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

/** Boundary parameter t in [0,1] between slice a (state aFree) and slice b (opposite state). */
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
  /** Lateral shift of the strip centre (+ = +normal = right of the way direction). */
  lateral?: number
  /** Quads whose centre point is blocked are dropped, with exact ends (bisection). */
  blocked?: BlockedFn | null
  /** When set, UVs are in metres / uvMetres (square tiles); otherwise legacy 0..1 across. */
  uvMetres?: number
  /** Arc of the first point along the whole way (texture continuity across chunk cuts). */
  arcOffset?: number
  /** Free runs shorter than this (metres) that end on a blocked boundary are left out (no slivers). */
  minRun?: number
}

/**
 * Builds a ribbon mesh (road surface, edge lines, gutters, cycle lanes…) with miter joins.
 * Runs of blocked slices (inside another road's asphalt) are left out and each run ends
 * exactly on the blocked boundary, so markings stop at the crossing road's kerb line.
 */
function buildStrip(
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

  // Free runs of slices, each ending exactly on the blocked boundary
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

/**
 * Builds a ribbon mesh (e.g. road surface, edge lines, tire tracks) with miter joins.
 * Kept for the bridge / tunnel builders; ground roads use buildStrip directly.
 */
function buildRibbon(
  points: Pt[],
  halfW: number,
  yOffset: number,
  material: THREE.Material,
  normals?: PolylineNormal[],
): THREE.Mesh | null {
  return buildStrip(points, normals ?? computePolylineNormals(points), halfW, yOffset, material)
}

/**
 * Shift ribbon vertices laterally by `offset` metres along polyline miter perpendicular.
 */
function shiftRibbonLateral(
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

// ── Chunk-cell portions ──────────────────────────────────────────────────────
//
// The chunk pipeline puts a way into every chunk one of its points falls in and
// builds it once per chunk, each time with only that chunk's ways as context. A
// way is therefore built here in PORTIONS: the cell being built is inferred from
// the context (the one cell every context way touches) and only the pieces of the
// way that belong to that cell are generated, each junction node by the cell that
// contains it (whose context holds every way meeting there). Pieces of one way
// meet at the cell border with identical square cuts, so nothing is doubled and
// nothing is missing. Without an unambiguous cell the whole way is built.

function cellKeyOf(p: Pt): string {
  return `${Math.floor(p.x / CHUNK_SIZE)}:${Math.floor(p.z / CHUNK_SIZE)}`
}

const buildCellCache = new WeakMap<Road[], { x: number; z: number } | null>()

/** The chunk cell being built: the single cell every context way has a point in. */
export function inferBuildCell(allRoads?: Road[]): { x: number; z: number } | null {
  if (!allRoads || allRoads.length < 2) return null
  const cached = buildCellCache.get(allRoads)
  if (cached !== undefined) return cached
  let inter: Set<string> | null = null
  for (const r of allRoads) {
    if (r.points.length === 0) continue
    const cells = new Set<string>()
    for (const p of r.points) cells.add(cellKeyOf(p))
    if (!inter) inter = cells
    else for (const k of [...inter]) if (!cells.has(k)) inter.delete(k)
    if (inter.size === 0) break
  }
  let cell: { x: number; z: number } | null = null
  if (inter && inter.size === 1) {
    const [kx, kz] = [...inter][0]!.split(':').map(Number) as [number, number]
    cell = { x: kx, z: kz }
  } else if (inter && inter.size > 1) {
    // Every context way spans the same few cells (a chunk at the edge of the loaded data holds
    // only the tails of long ways): the chunk is the candidate holding most of their points
    const counts = new Map<string, number>()
    for (const r of allRoads) for (const p of r.points) {
      const k = cellKeyOf(p)
      if (inter.has(k)) counts.set(k, (counts.get(k) ?? 0) + 1)
    }
    let bestK: string | null = null
    let best = 0
    let tie = false
    for (const [k, n] of counts) {
      if (n > best) { best = n; bestK = k; tie = false }
      else if (n === best) tie = true
    }
    if (bestK && !tie) {
      const [kx, kz] = bestK.split(':').map(Number) as [number, number]
      cell = { x: kx, z: kz }
    }
  }
  buildCellCache.set(allRoads, cell)
  return cell
}

export type RoadPortion = {
  pts: Pt[]
  /** True when the extremity is a cut at a cell border (not a way end). */
  openStart: boolean
  openEnd: boolean
  /** Arc of the first point along the whole way. */
  arcStart: number
}

/** Parameter at which segment a→b enters the cell containing b (b is inside it). */
function cellEntryT(a: Pt, b: Pt): number {
  const cx = Math.floor(b.x / CHUNK_SIZE)
  const cz = Math.floor(b.z / CHUNK_SIZE)
  const x0 = cx * CHUNK_SIZE
  const x1 = x0 + CHUNK_SIZE
  const z0 = cz * CHUNK_SIZE
  const z1 = z0 + CHUNK_SIZE
  let t = 0
  const dx = b.x - a.x
  const dz = b.z - a.z
  if (a.x < x0 && dx > 1e-9) t = Math.max(t, (x0 - a.x) / dx)
  else if (a.x >= x1 && dx < -1e-9) t = Math.max(t, (x1 - a.x) / dx)
  if (a.z < z0 && dz > 1e-9) t = Math.max(t, (z0 - a.z) / dz)
  else if (a.z >= z1 && dz < -1e-9) t = Math.max(t, (z1 - a.z) / dz)
  return Math.max(0, Math.min(1, t))
}

/**
 * Pieces of a way built by `cell`: every segment belongs to the cell of its first point
 * up to the point where it enters the cell of its second point, which builds the rest.
 */
export function splitRoadForCell(points: Pt[], cell: { x: number; z: number }): RoadPortion[] {
  const inCell = (p: Pt): boolean => Math.floor(p.x / CHUNK_SIZE) === cell.x && Math.floor(p.z / CHUNK_SIZE) === cell.z
  const portions: RoadPortion[] = []
  let cur: RoadPortion | null = null
  let arc = 0
  const close = (openEnd: boolean): void => {
    if (cur && cur.pts.length >= 2) {
      let len = 0
      for (let i = 1; i < cur.pts.length; i++) len += Math.hypot(cur.pts[i]!.x - cur.pts[i - 1]!.x, cur.pts[i]!.z - cur.pts[i - 1]!.z)
      if (len > 0.05) { cur.openEnd = openEnd; portions.push(cur) }
    }
    cur = null
  }
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!
    const b = points[i + 1]!
    const segLen = Math.hypot(b.x - a.x, b.z - a.z)
    const ca = inCell(a)
    const cb = inCell(b)
    if (ca) {
      if (!cur) cur = { pts: [a], openStart: false, openEnd: false, arcStart: arc }
      if (cb) {
        cur.pts.push(b)
      } else {
        const t = cellEntryT(a, b)
        cur.pts.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t })
        close(true)
      }
    } else if (cb) {
      const t = cellEntryT(a, b)
      cur = { pts: [{ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t }], openStart: true, openEnd: false, arcStart: arc + segLen * t }
      cur.pts.push(b)
    }
    arc += segLen
  }
  close(false)
  return portions
}

/** The chunk cell being built: the loader's cell when given, else inferred from the context. */
function buildCellOf(allRoads?: Road[], opts?: RoadGenerateOptions): { x: number; z: number } | null {
  return opts?.cell ?? inferBuildCell(allRoads)
}

/** The portions of a way to build for the given context (the whole way when the cell is unknown). */
function roadPortions(road: Road, allRoads?: Road[], opts?: RoadGenerateOptions): RoadPortion[] {
  const cell = buildCellOf(allRoads, opts)
  if (!cell) return [{ pts: road.points, openStart: false, openEnd: false, arcStart: 0 }]
  return splitRoadForCell(road.points, cell)
}

/**
 * Features built from the whole way (bridges, tunnels, steps, plazas) are generated by every
 * chunk the way touches: keep only the triangles whose centroid lies in the cell being built,
 * so each triangle is drawn exactly once across the chunks (no gap, no double geometry).
 */
function clipGroupToCell(group: THREE.Group, cell: { x: number; z: number }): THREE.Group | null {
  const x0 = cell.x * CHUNK_SIZE
  const x1 = x0 + CHUNK_SIZE
  const z0 = cell.z * CHUNK_SIZE
  const z1 = z0 + CHUNK_SIZE
  group.updateMatrixWorld(true)
  const remove: THREE.Object3D[] = []
  const v = new THREE.Vector3()
  group.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh || !m.geometry || (m as THREE.InstancedMesh).isInstancedMesh) return
    const geo = m.geometry
    const pos = geo.getAttribute('position') as THREE.BufferAttribute | undefined
    if (!pos) return
    const idx = geo.getIndex()
    const triCount = Math.floor((idx ? idx.count : pos.count) / 3)
    const keep: number[] = []
    for (let t = 0; t < triCount; t++) {
      let cx = 0
      let cz = 0
      for (let k = 0; k < 3; k++) {
        const i = idx ? idx.getX(t * 3 + k) : t * 3 + k
        v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld)
        cx += v.x
        cz += v.z
      }
      cx /= 3
      cz /= 3
      if (cx >= x0 && cx < x1 && cz >= z0 && cz < z1) keep.push(t)
    }
    if (keep.length === triCount) return
    if (keep.length === 0) { remove.push(m); return }
    const newIdx: number[] = []
    for (const t of keep) {
      for (let k = 0; k < 3; k++) newIdx.push(idx ? idx.getX(t * 3 + k) : t * 3 + k)
    }
    // Geometries can be shared between meshes (templates): never edit them in place
    const clipped = geo.clone()
    clipped.setIndex(newIdx)
    m.geometry = clipped
  })
  for (const m of remove) m.parent?.remove(m)
  // Drop groups left empty
  let changed = true
  while (changed) {
    changed = false
    group.traverse((o) => {
      if (o !== group && !(o as THREE.Mesh).isMesh && o.children.length === 0 && o.parent) {
        o.parent.remove(o)
        changed = true
      }
    })
  }
  return group.children.length > 0 ? group : null
}

// ── Junction analysis & road obstacles ───────────────────────────────────────

export interface RoadObstacleSeg {
  x1: number; z1: number; x2: number; z2: number
  dx: number; dz: number; lenSq: number; halfW: number
  minX: number; maxX: number; minZ: number; maxZ: number
  /** Way this segment belongs to. */
  roadId: string
  /** Sidewalk footprint (curb + walkway) of that way on its +normal / −normal side, 0 when none. */
  fpPlus: number
  fpMinus: number
  /** True when the current road must stop at that way's sidewalk footprint (it yields the corner). */
  yieldCorner: boolean
  /** Flat cap at an extremity landing on the current road (no round cap beyond the node). */
  flatStart: boolean
  flatEnd: boolean
  /** Landing arms only count on their own side of the current road (half-plane through the landing point). */
  hasClip: boolean
  clipX: number
  clipZ: number
  clipNx: number
  clipNz: number
}

const NON_DRIVABLE = new Set(['path', 'footway', 'cycleway', 'track', 'steps', 'pedestrian'])

function isDrivableWay(r: Road): boolean {
  return !NON_DRIVABLE.has(r.highway) && r.points.length >= 2
}

function elevClass(r: Road): number {
  if (r.elevationMode === 'bridge' || r.bridge) return 1
  if (r.elevationMode === 'tunnel' || r.tunnel) return -1
  return 0
}

function isUrbanWay(r: Road): boolean {
  const hw = r.highway
  return hw !== 'motorway' && hw !== 'trunk' && !(r.isLink ?? false) && !NON_DRIVABLE.has(hw)
}

function isMajorWay(r: Road): boolean {
  return r.highway === 'primary' || r.highway === 'motorway' || r.highway === 'trunk'
}

function sidewalkWidthOf(r: Road): number {
  return isMajorWay(r) ? 2.8 : DEFAULT_SIDEWALK_WIDTH
}

/** Sidewalk footprint (curb + walkway) on the +normal (right) and −normal (left) side of a way. */
function sidewalkFootprint(r: Road): { plus: number; minus: number } {
  if (elevClass(r) !== 0) return { plus: 0, minus: 0 }
  const mode = r.sidewalkMode ?? (isUrbanWay(r) ? 'both' : 'none')
  const w = CURB_WIDTH + sidewalkWidthOf(r)
  return {
    plus: mode === 'both' || mode === 'right' ? w : 0,
    minus: mode === 'both' || mode === 'left' ? w : 0,
  }
}

const HIGHWAY_RANK: Record<string, number> = {
  motorway: 8, trunk: 7, primary: 6, secondary: 5, tertiary: 4, unclassified: 3, residential: 3,
  living_street: 2, service: 1, pedestrian: 1,
}

/** True when `a` should keep its corner against `b` (bigger class, then wider, then smaller id). */
function outranks(a: Road, b: Road): boolean {
  const ra = (HIGHWAY_RANK[a.highway] ?? 0) - (a.isLink ? 0.5 : 0)
  const rb = (HIGHWAY_RANK[b.highway] ?? 0) - (b.isLink ? 0.5 : 0)
  if (ra !== rb) return ra > rb
  const wa = computeRoadWidth(a).roadW
  const wb = computeRoadWidth(b).roadW
  if (Math.abs(wa - wb) > 0.05) return wa > wb
  return idBefore(a.id, b.id)
}

function numericId(id: string): number {
  const n = Number(id)
  return Number.isFinite(n) ? n : Number.NaN
}

/** Deterministic tie-break between two ways: numeric ids first, lexicographic otherwise. */
function idBefore(a: string, b: string): boolean {
  const na = numericId(a)
  const nb = numericId(b)
  if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na < nb
  return a < b
}

function unitBetween(a: Pt, b: Pt): Vec2 {
  const dx = b.x - a.x
  const dz = b.z - a.z
  const len = Math.hypot(dx, dz)
  return len > 1e-6 ? { x: dx / len, z: dz / len } : { x: 0, z: 1 }
}

function endPoint(r: Road, end: 0 | 1): Pt {
  return end === 0 ? r.points[0]! : r.points[r.points.length - 1]!
}

/** Unit tangent at an extremity pointing away from the node, along the way. */
function outwardTangent(r: Road, end: 0 | 1): Vec2 {
  const p = r.points
  const n = p.length
  return end === 0 ? unitBetween(p[0]!, p[1]!) : unitBetween(p[n - 1]!, p[n - 2]!)
}

/** Distance from a point to a way's centre-line, with the arc of the closest point. */
function distToWay(r: Road, px: number, pz: number): { d: number; arc: number; len: number; x: number; z: number } {
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

/** Unit tangent of a way at an arc position along it. */
function tangentAtArc(r: Road, arc: number): Vec2 {
  const p = r.points
  let acc = 0
  for (let i = 0; i < p.length - 1; i++) {
    const len = Math.hypot(p[i + 1]!.x - p[i]!.x, p[i + 1]!.z - p[i]!.z)
    if (acc + len >= arc || i === p.length - 2) return unitBetween(p[i]!, p[i + 1]!)
    acc += len
  }
  return unitBetween(p[0]!, p[1]!)
}

function dedupeRoads(roads: Road[]): Road[] {
  const seen = new Set<string>()
  const out: Road[] = []
  for (const r of roads) {
    if (seen.has(r.id)) continue
    seen.add(r.id)
    out.push(r)
  }
  return out
}

export type JunctionArm = { road: Road; end: 0 | 1; ox: number; oz: number }

export type RoadEndJunction = {
  node: Pt
  /** Other ways with an extremity on this node (continuation included). */
  arms: JunctionArm[]
  /** Other ways passing through this node (node on their interior). */
  through: Road[]
  /** Way continuing this street through the node (mutually most collinear arm), if any. */
  partner: Road | null
  /** Unit direction of the partner leaving the node. */
  partnerOut: Vec2 | null
  /** Through road this end lands on (this way is an arm of it), if any. */
  landsOn: Road | null
  /** Other drivable ways meet at this node (besides the continuation). */
  isJunction: boolean
}

export type JunctionInfo = {
  ends: [RoadEndJunction, RoadEndJunction]
  /** Ways whose sidewalk footprint this road must stop at (they own the corner). */
  yieldTo: Set<string>
  /** Continuation ways (never obstacles). */
  partnerIds: Set<string>
  /** Deduplicated drivable ways other than this one. */
  others: Road[]
}

/**
 * Classifies both extremities of a way against the other ways of the area:
 * continuation (same street split at the node: mitered joint, no clipping),
 * arm landing on a through road (sidewalks stop at the through road's sidewalk,
 * markings at its asphalt) or through road (its sidewalks are interrupted by the arms).
 */
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

    // Mutually most collinear pair = continuation of the same street (bend < ~53°)
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
    // The mutually most collinear pair continues the street; two ways of the same street
    // alone at a node continue each other whatever the bend (an L-bend is mitered).
    let cont: Arm | null = mutual(0) ? arms[best[0]!]! : null
    const myName = road.name?.trim().toLowerCase()
    if (!cont && arms.length === 2 && through.length === 0 && arms[1]!.road !== road &&
      elevClass(arms[1]!.road) === elevClass(road) && myName && arms[1]!.road.name?.trim().toLowerCase() === myName) cont = arms[1]!
    const curThrough = cont !== null
    if (cont && cont.road !== road) partnerIds.add(cont.road.id)

    // Which ways keep the corner: a through road over an arm, else the bigger street
    // (class, width, id) so that the decision does not depend on which ways this chunk sees
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

/**
 * Obstacle segments (other ways' asphalt) used to clip this road's sidewalks, markings,
 * lamps and parked cars. Continuation ways are excluded; arms that end on this road are
 * extended 0.3 m past its centre-line with a flat cap so they interrupt this road's
 * near-side features only (the far sidewalk stays continuous).
 */
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
    // Continuation way: the ribbons share a mitered joint, so only its asphalt clearly past the
    // joint cut is an obstacle (a wider continuation covers the end of this road's sidewalk;
    // beyond the joint it is an ordinary way, it may even land on this road again).
    const isPartner = info.partnerIds.has(r.id)
    let jointClip: { x: number; z: number; nx: number; nz: number } | null = null
    let jointEnd: 0 | 1 = 0
    if (isPartner) {
      const e: 0 | 1 = info.ends[0].partner === r ? 0 : 1
      const je = info.ends[e]
      const N = je.node
      const po = je.partnerOut ?? outwardTangent(r, 0)
      const away = outwardTangent(cur, e)
      const jn = jointNormal(-away.x, -away.z, po.x, po.z)
      let hx = -jn.nz
      let hz = jn.nx
      if (hx * po.x + hz * po.z < 0) { hx = -hx; hz = -hz }
      // Points less than 0.5 m past the cut stay free (the -0.35 test below): the joint itself
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

    // Extremities landing on this road (arms at an interior node or at this road's own end
    // node): reach 0.3 m past this road's centre-line with a flat cap, so only the near-side
    // features of this road are interrupted (the far sidewalk stays continuous).
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
    // Half-plane through the landing point along this road's tangent, facing the arm: the
    // arm's interior vertices (round caps) must not reach the far side of this road
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

/**
 * True when (px, pz) lies on another way's asphalt (+ margin). With `footprint`, ways this
 * road yields to also count their sidewalk footprint on the side of the point.
 */
function isPointInRoadAsphalt(px: number, pz: number, obs: RoadObstacleSeg[], margin = 0.20, footprint = false): boolean {
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

/** +normal is the right-hand side of the way direction (x = east, z = −north). */
function sideSign(side: 'left' | 'right'): number {
  return side === 'right' ? 1 : -1
}

interface SidewalkSlice {
  blocked: boolean
  /** Junction corner trim blocking this slice (the fillet continues the band), if any. */
  trim: TrimSeg | null
  bx: number; by: number; bz: number
  nx: number; nz: number; miter: number
  gX: number; gY: number; gZ: number
  cX: number; cY: number; cZ: number
  wX: number; wY: number; wZ: number
  dX: number; dY: number; dZ: number
  dist: number
}

/**
 * Builds clean, beveled curbs & raised sidewalks on the left or right with miter normals.
 * The road sits at y = 0.028, the curb rises to y = 0.12 (stone curb), the walkway extends
 * outward at y = 0.12. Bands stop exactly where the curb enters another road's asphalt
 * (through road) or the through road's sidewalk footprint (arm), with a vertical end cap.
 * No end cap is drawn at an extremity continued by the same street (`capStart`/`capEnd`).
 */
function buildCleanSidewalk(
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
  /** Narrowest walkway still built; below it the band stops (the space belongs to the other way). */
  const MIN_WALK_W = 0.6
  const trimAt = (arc: number): TrimSeg | null => {
    for (let i = 0; i < trims.length; i++) {
      const t = trims[i]!
      if (arc >= t.a0 && arc <= t.a1) return t
    }
    return null
  }
  // Right after a fillet the band must reach the fillet's tangent point: no footprint test there
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

    // 1. Gutter: where road meets curb bottom
    const gX = bx + nx * (roadHalfW * miter)
    const gY = by + 0.028
    const gZ = bz + nz * (roadHalfW * miter)

    // 2. Curb top outer corner (elevated 12cm)
    const cX = bx + nx * ((roadHalfW + curbBevelW) * miter)
    const cY = by + SIDEWALK_HEIGHT
    const cZ = bz + nz * ((roadHalfW + curbBevelW) * miter)

    // Blocked when the curb sits on an intersecting street (or on the through road's sidewalk)
    const trim = trimAt(dist)
    let blocked = trim !== null
    if (!blocked && obstacles.length > 0) {
      blocked = isPointInRoadAsphalt(cX, cZ, obstacles, -0.05, !nearTrim(dist))
    }

    // 3. Sidewalk outer walkway edge: exactly as wide as the free space allows (never over
    // another way's asphalt); when not even MIN_WALK_W fits the band stops here. Right after
    // a fillet the band keeps its full width so that it meets the fillet's tangent quad.
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
      dX: wX, dY: by - 0.05, dZ: wZ, // 4. Skirt bottom (drops to foundation)
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

  // Drop slices whose outer edge folds back on sharp inner corners
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
  /** Exact free/blocked boundary between a (state aFree) and b. */
  const boundary = (a: SidewalkSlice, b: SidewalkSlice, aFree: boolean): SidewalkSlice => {
    let lo = 0 // state of a
    let hi = 1 // state of b
    for (let k = 0; k < 8; k++) {
      const mid = (lo + hi) / 2
      if (!lerpSlices(a, b, mid).blocked === aFree) lo = mid
      else hi = mid
    }
    // the slice on the free side of the boundary
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
    // 1. Beveled Curb Quad
    const cb = curbQuadCount * 4
    curbVerts.push(
      s1.gX, s1.gY, s1.gZ,
      s1.cX, s1.cY, s1.cZ,
      s2.gX, s2.gY, s2.gZ,
      s2.cX, s2.cY, s2.cZ,
    )
    curbIndices.push(cb, cb + 1, cb + 2, cb + 1, cb + 3, cb + 2)
    curbQuadCount++

    // 2. Walkway Tile Quad
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

    // 3. Drop Skirt Quad
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

  // Free runs of consecutive slices; each run ends exactly on the blocked boundary.
  // An end is "weak" when the band is cut there by another way's asphalt (not by a fillet
  // trim, which continues it) or when it is a way extremity that is itself a junction with
  // no continuation: short runs between weak ends are orphan stubs (merge areas, overlapping
  // ribbons of an interchange) and are left out, the asphalt joins there instead.
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

/**
 * Builds dashed lines along a polyline. Dashes touching another road's asphalt are skipped.
 */
function buildDashedLine(
  points: Pt[],
  lateralOffset: number,
  halfMarkW: number,
  yOffset: number,
  dashLen: number,
  gapLen: number,
  material: THREE.MeshStandardMaterial,
  normals?: PolylineNormal[],
  blocked?: BlockedFn | null,
  arcOffset = 0,
): THREE.Mesh | null {
  if (points.length < 2) return null

  const norms = normals ?? computePolylineNormals(points)
  const strip: { x: number; y: number; z: number; nx: number; nz: number }[] = []
  for (let i = 0; i < points.length; i++) {
    const norm = norms[i]!
    const effLat = lateralOffset * norm.miter
    strip.push({
      x: points[i]!.x + norm.nx * effLat,
      y: points[i]!.y,
      z: points[i]!.z + norm.nz * effLat,
      nx: norm.nx,
      nz: norm.nz,
    })
  }

  const vertices: number[] = []
  const indices: number[] = []
  let arcLen = 0
  let quadIdx = 0

  for (let i = 0; i < strip.length - 1; i++) {
    const a = strip[i]!
    const b = strip[i + 1]!
    const segLen = Math.hypot(b.x - a.x, b.z - a.z)
    const cycleLen = dashLen + gapLen
    let t = 0
    while (t < segLen) {
      const phase = (arcOffset + arcLen + t) % cycleLen
      if (phase < dashLen) {
        const dashRemain = Math.min(dashLen - phase, segLen - t)
        const tA = t / segLen
        const tB = Math.min((t + dashRemain) / segLen, 1.0)
        const nxA = THREE.MathUtils.lerp(a.nx, b.nx, tA)
        const nzA = THREE.MathUtils.lerp(a.nz, b.nz, tA)
        const nxB = THREE.MathUtils.lerp(a.nx, b.nx, tB)
        const nzB = THREE.MathUtils.lerp(a.nz, b.nz, tB)
        const pA = { x: a.x + (b.x - a.x) * tA, y: a.y, z: a.z + (b.z - a.z) * tA, nx: nxA, nz: nzA }
        const pB = { x: a.x + (b.x - a.x) * tB, y: a.y, z: a.z + (b.z - a.z) * tB, nx: nxB, nz: nzB }
        // A dash split by a polyline vertex or a junction boundary: leave out the remainder
        // pieces too short to read as a dash (a speck is never a marking)
        const keep = dashRemain >= 0.6 && (!blocked || (!blocked(pA.x, pA.z, arcLen + t) && !blocked(pB.x, pB.z, arcLen + t + dashRemain) && !blocked((pA.x + pB.x) / 2, (pA.z + pB.z) / 2, arcLen + t + dashRemain / 2)))
        if (keep) {
          const base = quadIdx * 4
          vertices.push(
            pA.x + pA.nx * halfMarkW, pA.y + yOffset, pA.z + pA.nz * halfMarkW,
            pA.x - pA.nx * halfMarkW, pA.y + yOffset, pA.z - pA.nz * halfMarkW,
            pB.x + pB.nx * halfMarkW, pB.y + yOffset, pB.z + pB.nz * halfMarkW,
            pB.x - pB.nx * halfMarkW, pB.y + yOffset, pB.z - pB.nz * halfMarkW,
          )
          indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3)
          quadIdx++
        }
        t += dashRemain
      } else {
        t += cycleLen - phase
      }
    }
    arcLen += segLen
  }

  if (vertices.length === 0) return null

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  return new THREE.Mesh(geo, material)
}

/**
 * Builds directional arrows painted flat on the asphalt.
 */
function buildRoadArrow(
  centerPt: Pt,
  dir: { dx: number; dz: number },
): THREE.Mesh {
  const norm = { nx: -dir.dz, nz: dir.dx }
  const cy = centerPt.y + 0.040

  const stemHalfW = 0.18
  const headHalfW = 0.65

  // Stem back & front
  const p1 = { x: centerPt.x - dir.dx * 2.2 - norm.nx * stemHalfW, z: centerPt.z - dir.dz * 2.2 - norm.nz * stemHalfW }
  const p2 = { x: centerPt.x - dir.dx * 2.2 + norm.nx * stemHalfW, z: centerPt.z - dir.dz * 2.2 + norm.nz * stemHalfW }
  const p3 = { x: centerPt.x + dir.dx * 0.4 - norm.nx * stemHalfW, z: centerPt.z + dir.dz * 0.4 - norm.nz * stemHalfW }
  const p4 = { x: centerPt.x + dir.dx * 0.4 + norm.nx * stemHalfW, z: centerPt.z + dir.dz * 0.4 + norm.nz * stemHalfW }

  // Arrowhead wings & tip
  const p5 = { x: centerPt.x + dir.dx * 0.4 - norm.nx * headHalfW, z: centerPt.z + dir.dz * 0.4 - norm.nz * headHalfW }
  const p6 = { x: centerPt.x + dir.dx * 0.4 + norm.nx * headHalfW, z: centerPt.z + dir.dz * 0.4 + norm.nz * headHalfW }
  const p7 = { x: centerPt.x + dir.dx * 2.4, z: centerPt.z + dir.dz * 2.4 }

  const verts = [
    p1.x, cy, p1.z,
    p2.x, cy, p2.z,
    p3.x, cy, p3.z,
    p4.x, cy, p4.z,
    p5.x, cy, p5.z,
    p6.x, cy, p6.z,
    p7.x, cy, p7.z,
  ]

  const indices = [
    0, 1, 2, 1, 3, 2, // Stem
    4, 5, 6,          // Head triangle
  ]

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  const arrowMesh = new THREE.Mesh(geo, WHITE_MARK)
  arrowMesh.renderOrder = 4
  return arrowMesh
}

/**
 * Builds zebra stripes (passages piétons) at an intersection or cross point.
 */
function buildCrosswalk(
  centerPt: Pt,
  dir: { dx: number; dz: number },
  roadHalfW: number,
): THREE.Mesh | null {
  const norm = { nx: -dir.dz, nz: dir.dx }
  const stripeWidth = 0.50
  const stripeGap = 0.45
  const stripeLength = 3.6
  const halfLen = stripeLength / 2

  const vertices: number[] = []
  const indices: number[] = []
  let quadIdx = 0

  const totalCrossW = roadHalfW * 2 - 0.8
  const startOffset = -totalCrossW / 2
  const numStripes = Math.floor(totalCrossW / (stripeWidth + stripeGap))

  for (let s = 0; s < numStripes; s++) {
    const lat = startOffset + s * (stripeWidth + stripeGap) + stripeWidth / 2
    const cx = centerPt.x + norm.nx * lat
    const cz = centerPt.z + norm.nz * lat
    const cy = centerPt.y + 0.040

    const p1x = cx + norm.nx * (stripeWidth / 2) - dir.dx * halfLen
    const p1z = cz + norm.nz * (stripeWidth / 2) - dir.dz * halfLen

    const p2x = cx - norm.nx * (stripeWidth / 2) - dir.dx * halfLen
    const p2z = cz - norm.nz * (stripeWidth / 2) - dir.dz * halfLen

    const p3x = cx + norm.nx * (stripeWidth / 2) + dir.dx * halfLen
    const p3z = cz + norm.nz * (stripeWidth / 2) + dir.dz * halfLen

    const p4x = cx - norm.nx * (stripeWidth / 2) + dir.dx * halfLen
    const p4z = cz - norm.nz * (stripeWidth / 2) + dir.dz * halfLen

    const base = quadIdx * 4
    vertices.push(
      p1x, cy, p1z,
      p2x, cy, p2z,
      p3x, cy, p3z,
      p4x, cy, p4z,
    )
    indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2)
    quadIdx++
  }

  if (vertices.length === 0) return null
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  const crossMesh = new THREE.Mesh(geo, WHITE_MARK)
  crossMesh.renderOrder = 4
  return crossMesh
}

/**
 * Builds a continuous stop line across the approach lanes: the right-hand half of a
 * two-way road, the whole carriageway of a one-way road (`fullWidth`).
 */
function buildStopLine(
  centerPt: Pt,
  dir: { dx: number; dz: number },
  roadHalfW: number,
  fullWidth = false,
): THREE.Mesh | null {
  const norm = { nx: -dir.dz, nz: dir.dx }
  const barThick = 0.45
  const halfThick = barThick / 2
  const span = roadHalfW - 0.4
  const from = fullWidth ? -span : 0

  const cy = centerPt.y + 0.040
  const base = 0
  const vertices = [
    centerPt.x + norm.nx * from - dir.dx * halfThick, cy, centerPt.z + norm.nz * from - dir.dz * halfThick,
    centerPt.x + norm.nx * span - dir.dx * halfThick, cy, centerPt.z + norm.nz * span - dir.dz * halfThick,
    centerPt.x + norm.nx * from + dir.dx * halfThick, cy, centerPt.z + norm.nz * from + dir.dz * halfThick,
    centerPt.x + norm.nx * span + dir.dx * halfThick, cy, centerPt.z + norm.nz * span + dir.dz * halfThick,
  ]
  const indices = [base, base + 1, base + 2, base + 1, base + 3, base + 2]

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  const stopMesh = new THREE.Mesh(geo, WHITE_MARK)
  stopMesh.renderOrder = 4
  return stopMesh
}

/**
 * Builds white bicycle silhouette pictogramme stencil painted flat on cycle lane.
 */
function buildBicycleMarking(
  pos: Pt,
  dir: { dx: number; dz: number },
): THREE.Group {
  const g = new THREE.Group()
  const q = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 0, 1),
    new THREE.Vector3(dir.dx, 0, dir.dz),
  )
  g.position.set(pos.x, pos.y + 0.040, pos.z)
  g.rotation.setFromQuaternion(q)

  const wheelGeo = new THREE.RingGeometry(0.12, 0.17, 10)
  wheelGeo.rotateX(-Math.PI / 2)
  const w1 = new THREE.Mesh(wheelGeo, WHITE_MARK)
  w1.position.set(0, 0, -0.35)
  w1.renderOrder = 5
  g.add(w1)

  const w2 = new THREE.Mesh(wheelGeo, WHITE_MARK)
  w2.position.set(0, 0, 0.35)
  w2.renderOrder = 5
  g.add(w2)

  const frameGeo = new THREE.BoxGeometry(0.04, 0.005, 0.5)
  const frame = new THREE.Mesh(frameGeo, WHITE_MARK)
  frame.renderOrder = 5
  g.add(frame)

  return g
}

/**
 * Builds white "BUS" stencil lettering painted on dedicated bus lane.
 */
function buildBusLaneMarking(
  pos: Pt,
  dir: { dx: number; dz: number },
): THREE.Group {
  const g = new THREE.Group()
  const q = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 0, 1),
    new THREE.Vector3(dir.dx, 0, dir.dz),
  )
  g.position.set(pos.x, pos.y + 0.040, pos.z)
  g.rotation.setFromQuaternion(q)

  // 'B'
  const bGeo = new THREE.BoxGeometry(0.35, 0.005, 0.9)
  const bMesh = new THREE.Mesh(bGeo, WHITE_MARK)
  bMesh.position.set(-0.5, 0, 0)
  bMesh.renderOrder = 5
  g.add(bMesh)

  // 'U'
  const uGeo = new THREE.BoxGeometry(0.35, 0.005, 0.9)
  const uMesh = new THREE.Mesh(uGeo, WHITE_MARK)
  uMesh.position.set(0, 0, 0)
  uMesh.renderOrder = 5
  g.add(uMesh)

  // 'S'
  const sGeo = new THREE.BoxGeometry(0.35, 0.005, 0.9)
  const sMesh = new THREE.Mesh(sGeo, WHITE_MARK)
  sMesh.position.set(0.5, 0, 0)
  sMesh.renderOrder = 5
  g.add(sMesh)

  return g
}

/**
 * Builds the white dashed line separating the roadside parking bays from the driving lane.
 */
function buildParkingBays(
  points: Pt[],
  normals: PolylineNormal[],
  halfW: number,
  side: 'left' | 'right',
  roadLen: number,
  blocked: BlockedFn | null,
  arcOffset = 0,
): THREE.Group | null {
  if (points.length < 2 || roadLen < 15) return null
  const group = new THREE.Group()
  const bayW = 2.0
  const bayL = 5.0

  const numBays = Math.min(8, Math.floor(roadLen / bayL))
  if (numBays < 1) return null

  // Outer boundary dashed line separating parking bay from driving lane
  const lineOffset = sideSign(side) * (halfW - bayW)
  const pLine = buildDashedLine(points, lineOffset, 0.05, 0.040, 2.0, 2.0, WHITE_MARK, normals, blocked, arcOffset)
  if (pLine) {
    pLine.renderOrder = 4
    group.add(pLine)
  }

  return group.children.length > 0 ? group : null
}

function tagTemplateGroup(group: THREE.Group): THREE.Group {
  group.traverse((c) => {
    c.userData['isTemplate'] = true
  })
  return group
}

// ── Reusable Street Lamp Template (Style Haussmann / Paris) ─────────────────
let _streetLampTemplate: THREE.Group | null = null
function getStreetLampTemplate(): THREE.Group {
  if (_streetLampTemplate) return _streetLampTemplate
  const group = new THREE.Group()
  const lampMat = new THREE.MeshStandardMaterial({ color: 0x1c2420, roughness: 0.52, metalness: 0.55 })
  const baseGeo = new THREE.CylinderGeometry(0.24, 0.32, 0.7, 8)
  baseGeo.translate(0, 0.35, 0)
  group.add(new THREE.Mesh(baseGeo, lampMat))

  const shaftGeo = new THREE.CylinderGeometry(0.09, 0.14, 3.2, 8)
  shaftGeo.translate(0, 2.3, 0)
  group.add(new THREE.Mesh(shaftGeo, lampMat))

  const armGeo = new THREE.CylinderGeometry(0.06, 0.08, 1.2, 6)
  armGeo.rotateZ(-0.45)
  armGeo.translate(0, 3.8, 0.35)
  group.add(new THREE.Mesh(armGeo, lampMat))

  const headMat = new THREE.MeshStandardMaterial({
    color: 0xfff0c8,
    emissive: 0xffe299,
    emissiveIntensity: 0.9,
    roughness: 0.2,
  })
  const lanternGeo = new THREE.CylinderGeometry(0.14, 0.20, 0.32, 6)
  lanternGeo.translate(0, 4.2, 0.6)
  group.add(new THREE.Mesh(lanternGeo, headMat))

  _streetLampTemplate = tagTemplateGroup(group)
  return _streetLampTemplate
}

// ── Reusable 3D Traffic Light Template ──────────────────────────────────────
let _trafficLightTemplate: THREE.Group | null = null
function getTrafficLightTemplate(): THREE.Group {
  if (_trafficLightTemplate) return _trafficLightTemplate
  const group = new THREE.Group()

  const poleMat = new THREE.MeshStandardMaterial({ color: 0x22262a, roughness: 0.6, metalness: 0.4 })
  const poleGeo = new THREE.CylinderGeometry(0.08, 0.10, 4.2, 8)
  poleGeo.translate(0, 2.1, 0)
  group.add(new THREE.Mesh(poleGeo, poleMat))

  const armGeo = new THREE.BoxGeometry(0.07, 0.07, 1.8)
  armGeo.translate(0, 4.1, 0.9)
  group.add(new THREE.Mesh(armGeo, poleMat))

  const boxMat = new THREE.MeshStandardMaterial({ color: 0x16181a, roughness: 0.75 })
  const boxGeo = new THREE.BoxGeometry(0.22, 0.65, 0.18)
  boxGeo.translate(0, 3.2, 0.15)
  group.add(new THREE.Mesh(boxGeo, boxMat))

  // Red light
  const redMat = new THREE.MeshStandardMaterial({ color: 0xff2200, emissive: 0xff1100, emissiveIntensity: 2.0 })
  const redLight = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 8), redMat)
  redLight.position.set(0, 3.42, 0.24)
  group.add(redLight)

  // Amber light
  const amberMat = new THREE.MeshStandardMaterial({ color: 0xffaa00, roughness: 0.3 })
  const amberLight = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 8), amberMat)
  amberLight.position.set(0, 3.20, 0.24)
  group.add(amberLight)

  // Green light
  const greenMat = new THREE.MeshStandardMaterial({ color: 0x00cc44, emissive: 0x00bb33, emissiveIntensity: 1.2 })
  const greenLight = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 8), greenMat)
  greenLight.position.set(0, 2.98, 0.24)
  group.add(greenLight)

  _trafficLightTemplate = tagTemplateGroup(group)
  return _trafficLightTemplate
}

// ── 3. Main RoadMeshGenerator ──────────────────────────────────────────────

// ── Bridge & Tunnel Structural Builders ─────────────────────────────────────

function buildBridgeDeckMesh(
  pts: { x: number; y: number; z: number }[],
  halfW: number,
  deckThickness = 0.85,
): THREE.Mesh | null {
  if (pts.length < 2) return null
  const verts: number[] = []
  const norm: number[] = []
  const idx: number[] = []
  const N = pts.length

  type CrossSec = { tlX: number; tlY: number; tlZ: number; trX: number; trY: number; trZ: number; blX: number; blY: number; blZ: number; brX: number; brY: number; brZ: number }
  const sections: CrossSec[] = []

  for (let i = 0; i < N; i++) {
    const curr = pts[i]!
    const prev = pts[Math.max(0, i - 1)]!
    const next = pts[Math.min(N - 1, i + 1)]!
    let dx = next.x - prev.x
    let dz = next.z - prev.z
    const len = Math.hypot(dx, dz)
    const nx = len > 0 ? -dz / len : 0
    const nz = len > 0 ? dx / len : 1

    const bW = halfW + 0.18
    const botW = halfW * 0.78

    sections.push({
      tlX: curr.x + nx * bW, tlY: curr.y, tlZ: curr.z + nz * bW,
      trX: curr.x - nx * bW, trY: curr.y, trZ: curr.z - nz * bW,
      blX: curr.x + nx * botW, blY: curr.y - deckThickness, blZ: curr.z + nz * botW,
      brX: curr.x - nx * botW, brY: curr.y - deckThickness, brZ: curr.z - nz * botW,
    })
  }

  for (let i = 0; i < N - 1; i++) {
    const s0 = sections[i]!
    const s1 = sections[i + 1]!

    // Bottom deck face (-Y)
    const b0 = verts.length / 3
    verts.push(
      s0.blX, s0.blY, s0.blZ,
      s0.brX, s0.brY, s0.brZ,
      s1.brX, s1.brY, s1.brZ,
      s1.blX, s1.blY, s1.blZ,
    )
    norm.push(0, -1, 0,  0, -1, 0,  0, -1, 0,  0, -1, 0)
    idx.push(b0, b0 + 1, b0 + 2, b0, b0 + 2, b0 + 3)

    // Left side girder face (+N)
    const b1 = verts.length / 3
    verts.push(
      s0.tlX, s0.tlY, s0.tlZ,
      s0.blX, s0.blY, s0.blZ,
      s1.blX, s1.blY, s1.blZ,
      s1.tlX, s1.tlY, s1.tlZ,
    )
    norm.push(0, 0.4, 0.9,  0, 0.4, 0.9,  0, 0.4, 0.9,  0, 0.4, 0.9)
    idx.push(b1, b1 + 1, b1 + 2, b1, b1 + 2, b1 + 3)

    // Right side girder face (-N)
    const b2 = verts.length / 3
    verts.push(
      s0.trX, s0.trY, s0.trZ,
      s1.trX, s1.trY, s1.trZ,
      s1.brX, s1.brY, s1.brZ,
      s0.brX, s0.brY, s0.brZ,
    )
    norm.push(0, 0.4, -0.9,  0, 0.4, -0.9,  0, 0.4, -0.9,  0, 0.4, -0.9)
    idx.push(b2, b2 + 1, b2 + 2, b2, b2 + 2, b2 + 3)
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(norm, 3))
  geo.setIndex(idx)
  geo.computeVertexNormals()
  const mesh = new THREE.Mesh(geo, BRIDGE_DECK_MAT)
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

function buildBridgeParapet(
  pts: { x: number; y: number; z: number }[],
  offset: number,
  height = 1.1,
): THREE.Group {
  const group = new THREE.Group()
  const N = pts.length
  if (N < 2) return group

  // 1. Solid stone parapet base
  const baseRibbon = buildRibbon(pts, 0.16, 0.175, BRIDGE_PARAPET_STONE_MAT)
  if (baseRibbon) {
    shiftRibbonLateral(baseRibbon, pts, offset)
    baseRibbon.renderOrder = 5
    group.add(baseRibbon)
  }

  // 2. Metal top safety rail
  const railRibbon = buildRibbon(pts, 0.06, height - 0.05, BRIDGE_RAILING_METAL_MAT)
  if (railRibbon) {
    shiftRibbonLateral(railRibbon, pts, offset)
    railRibbon.renderOrder = 5
    group.add(railRibbon)
  }

  // 3. Regular vertical metal safety posts
  const postGeo = new THREE.BoxGeometry(0.10, height, 0.10)
  let dist = 0
  let nextPost = 2.0
  for (let i = 0; i < N - 1; i++) {
    const a = pts[i]!
    const b = pts[i + 1]!
    const segL = Math.hypot(b.x - a.x, b.z - a.z)

    let dx = b.x - a.x
    let dz = b.z - a.z
    const len = Math.hypot(dx, dz)
    const nx = len > 0 ? -dz / len : 0
    const nz = len > 0 ? dx / len : 1

    while (dist + segL >= nextPost) {
      const t = (nextPost - dist) / segL
      const px = a.x + (b.x - a.x) * t + nx * offset
      const py = a.y + (b.y - a.y) * t + height / 2
      const pz = a.z + (b.z - a.z) * t + nz * offset

      const post = new THREE.Mesh(postGeo, BRIDGE_RAILING_METAL_MAT)
      post.position.set(px, py, pz)
      post.rotation.y = Math.atan2(dx, dz)
      group.add(post)

      nextPost += 3.0
    }
    dist += segL
  }

  return group
}

function buildBridgePiers(
  pts: { x: number; y: number; z: number }[],
  halfW: number,
  totalL: number,
  rampL: number,
): THREE.Group | null {
  const group = new THREE.Group()
  const N = pts.length
  if (N < 2) return null

  const pierSpacing = 24.0
  let dist = 0
  let nextPierDist = rampL + 6.0

  for (let i = 0; i < N - 1; i++) {
    const a = pts[i]!
    const b = pts[i + 1]!
    const segL = Math.hypot(b.x - a.x, b.z - a.z)

    while (dist + segL >= nextPierDist && nextPierDist <= totalL - rampL - 6.0) {
      const t = (nextPierDist - dist) / segL
      const px = a.x + (b.x - a.x) * t
      const py = a.y + (b.y - a.y) * t
      const pz = a.z + (b.z - a.z) * t

      let dx = b.x - a.x
      let dz = b.z - a.z
      const len = Math.hypot(dx, dz)
      const nx = len > 0 ? -dz / len : 0
      const nz = len > 0 ? dx / len : 1

      const deckBottomY = py - 0.85
      const pierHeight = Math.max(1.0, deckBottomY)

      // Twin concrete cylindrical columns
      const colRadius = 0.45
      const colGeo = new THREE.CylinderGeometry(colRadius, colRadius * 1.15, pierHeight, 10)
      colGeo.translate(0, pierHeight / 2, 0)

      const leftCol = new THREE.Mesh(colGeo, BRIDGE_PIER_MAT)
      leftCol.position.set(px + nx * (halfW * 0.6), 0, pz + nz * (halfW * 0.6))
      leftCol.castShadow = true
      leftCol.receiveShadow = true
      group.add(leftCol)

      const rightCol = new THREE.Mesh(colGeo, BRIDGE_PIER_MAT)
      rightCol.position.set(px - nx * (halfW * 0.6), 0, pz - nz * (halfW * 0.6))
      rightCol.castShadow = true
      rightCol.receiveShadow = true
      group.add(rightCol)

      // Pier cap crossbeam underneath girder
      const capGeo = new THREE.BoxGeometry(halfW * 1.5, 0.5, 1.2)
      const capMesh = new THREE.Mesh(capGeo, BRIDGE_PIER_MAT)
      capMesh.position.set(px, deckBottomY - 0.25, pz)
      capMesh.rotation.y = Math.atan2(dx, dz)
      capMesh.castShadow = true
      group.add(capMesh)

      nextPierDist += pierSpacing
    }
    dist += segL
  }

  return group.children.length > 0 ? group : null
}

function buildTunnelTrenchWalls(
  pts: { x: number; y: number; z: number }[],
  halfW: number,
  totalL: number,
  rampL: number,
): THREE.Group | null {
  const group = new THREE.Group()
  const N = pts.length
  if (N < 2) return null

  const wallOffset = halfW + 0.22
  const STREET_Y = 0.14
  let dist = 0

  const wallVerts: number[] = []
  const wallNorm: number[] = []
  const wallIdx: number[] = []

  const copingVerts: number[] = []
  const copingIdx: number[] = []

  // Guardrail at street level along trench edges
  const railPtsLeft: { x: number; y: number; z: number }[] = []
  const railPtsRight: { x: number; y: number; z: number }[] = []

  for (let i = 0; i < N - 1; i++) {
    const p0 = pts[i]!
    const p1 = pts[i + 1]!
    const segL = Math.hypot(p1.x - p0.x, p1.z - p0.z)
    const midDist = dist + segL / 2

    const isEntryRamp = midDist <= rampL + 0.5
    const isExitRamp = midDist >= totalL - rampL - 0.5

    if (isEntryRamp || isExitRamp) {
      let dx = p1.x - p0.x
      let dz = p1.z - p0.z
      const len = Math.hypot(dx, dz)
      const nx = len > 0 ? -dz / len : 0
      const nz = len > 0 ? dx / len : 1

      // Left Retaining Wall
      const bL = wallVerts.length / 3
      wallVerts.push(
        p0.x + nx * wallOffset, p0.y, p0.z + nz * wallOffset,
        p1.x + nx * wallOffset, p1.y, p1.z + nz * wallOffset,
        p1.x + nx * wallOffset, STREET_Y, p1.z + nz * wallOffset,
        p0.x + nx * wallOffset, STREET_Y, p0.z + nz * wallOffset,
      )
      wallNorm.push(-nx, 0, -nz,  -nx, 0, -nz,  -nx, 0, -nz,  -nx, 0, -nz)
      wallIdx.push(bL, bL + 1, bL + 2, bL, bL + 2, bL + 3)

      // Right Retaining Wall
      const bR = wallVerts.length / 3
      wallVerts.push(
        p0.x - nx * wallOffset, STREET_Y, p0.z - nz * wallOffset,
        p1.x - nx * wallOffset, STREET_Y, p1.z - nz * wallOffset,
        p1.x - nx * wallOffset, p1.y, p1.z - nz * wallOffset,
        p0.x - nx * wallOffset, p0.y, p0.z - nz * wallOffset,
      )
      wallNorm.push(nx, 0, nz,  nx, 0, nz,  nx, 0, nz,  nx, 0, nz)
      wallIdx.push(bR, bR + 1, bR + 2, bR, bR + 2, bR + 3)

      // Granite coping along top of left wall (width 0.35m at street level)
      const bCL = copingVerts.length / 3
      copingVerts.push(
        p0.x + nx * wallOffset, STREET_Y + 0.02, p0.z + nz * wallOffset,
        p1.x + nx * wallOffset, STREET_Y + 0.02, p1.z + nz * wallOffset,
        p1.x + nx * (wallOffset + 0.35), STREET_Y + 0.02, p1.z + nz * (wallOffset + 0.35),
        p0.x + nx * (wallOffset + 0.35), STREET_Y + 0.02, p0.z + nz * (wallOffset + 0.35),
      )
      copingIdx.push(bCL, bCL + 1, bCL + 2, bCL, bCL + 2, bCL + 3)

      // Granite coping along top of right wall
      const bCR = copingVerts.length / 3
      copingVerts.push(
        p0.x - nx * (wallOffset + 0.35), STREET_Y + 0.02, p0.z - nz * (wallOffset + 0.35),
        p1.x - nx * (wallOffset + 0.35), STREET_Y + 0.02, p1.z - nz * (wallOffset + 0.35),
        p1.x - nx * wallOffset, STREET_Y + 0.02, p1.z - nz * wallOffset,
        p0.x - nx * wallOffset, STREET_Y + 0.02, p0.z - nz * wallOffset,
      )
      copingIdx.push(bCR, bCR + 1, bCR + 2, bCR, bCR + 2, bCR + 3)

      // Collect points for safety railing
      if (Math.abs(p0.y - STREET_Y) > 0.6) {
        railPtsLeft.push({ x: p0.x + nx * (wallOffset + 0.18), y: STREET_Y, z: p0.z + nz * (wallOffset + 0.18) })
        railPtsRight.push({ x: p0.x - nx * (wallOffset + 0.18), y: STREET_Y, z: p0.z - nz * (wallOffset + 0.18) })
      }
    }

    dist += segL
  }

  if (wallVerts.length > 0) {
    const wallGeo = new THREE.BufferGeometry()
    wallGeo.setAttribute('position', new THREE.Float32BufferAttribute(wallVerts, 3))
    wallGeo.setAttribute('normal', new THREE.Float32BufferAttribute(wallNorm, 3))
    wallGeo.setIndex(wallIdx)
    wallGeo.computeVertexNormals()
    const wallMesh = new THREE.Mesh(wallGeo, TUNNEL_PORTAL_MAT)
    wallMesh.castShadow = true
    wallMesh.receiveShadow = true
    group.add(wallMesh)
  }

  if (copingVerts.length > 0) {
    const copingGeo = new THREE.BufferGeometry()
    copingGeo.setAttribute('position', new THREE.Float32BufferAttribute(copingVerts, 3))
    copingGeo.setIndex(copingIdx)
    copingGeo.computeVertexNormals()
    const copingMesh = new THREE.Mesh(copingGeo, CURB_MAT)
    group.add(copingMesh)
  }

  // Safety railings at street level along trench edges
  if (railPtsLeft.length >= 2) {
    const leftRail = buildRibbon(railPtsLeft, 0.05, 0.85, BRIDGE_RAILING_METAL_MAT)
    if (leftRail) group.add(leftRail)
  }
  if (railPtsRight.length >= 2) {
    const rightRail = buildRibbon(railPtsRight, 0.05, 0.85, BRIDGE_RAILING_METAL_MAT)
    if (rightRail) group.add(rightRail)
  }

  return group.children.length > 0 ? group : null
}

function buildTunnelTrenchMask(
  pts: { x: number; y: number; z: number }[],
  halfW: number,
  totalL: number,
  rampL: number,
): THREE.Mesh | null {
  const N = pts.length
  if (N < 2) return null

  const wallOffset = halfW + 0.30
  const MASK_Y = 0.005
  let dist = 0

  const maskVerts: number[] = []
  const maskIdx: number[] = []

  for (let i = 0; i < N - 1; i++) {
    const p0 = pts[i]!
    const p1 = pts[i + 1]!
    const segL = Math.hypot(p1.x - p0.x, p1.z - p0.z)
    const midDist = dist + segL / 2

    const isEntryRamp = midDist <= rampL + 0.3
    const isExitRamp = midDist >= totalL - rampL - 0.3

    if (isEntryRamp || isExitRamp) {
      let dx = p1.x - p0.x
      let dz = p1.z - p0.z
      const len = Math.hypot(dx, dz)
      const nx = len > 0 ? -dz / len : 0
      const nz = len > 0 ? dx / len : 1

      const b = maskVerts.length / 3
      maskVerts.push(
        p0.x + nx * wallOffset, MASK_Y, p0.z + nz * wallOffset,
        p0.x - nx * wallOffset, MASK_Y, p0.z - nz * wallOffset,
        p1.x + nx * wallOffset, MASK_Y, p1.z + nz * wallOffset,
        p1.x - nx * wallOffset, MASK_Y, p1.z - nz * wallOffset,
      )
      maskIdx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2)
      maskIdx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3)
    }

    dist += segL
  }

  if (maskVerts.length === 0) return null

  const maskGeo = new THREE.BufferGeometry()
  maskGeo.setAttribute('position', new THREE.Float32BufferAttribute(maskVerts, 3))
  maskGeo.setIndex(maskIdx)
  const maskMesh = new THREE.Mesh(maskGeo, TRENCH_MASK_MAT)
  maskMesh.renderOrder = -1
  return maskMesh
}

function buildTunnelPortals(
  pts: { x: number; y: number; z: number }[],
  halfW: number,
  totalL: number,
  rampL: number,
): THREE.Group | null {
  const group = new THREE.Group()
  const N = pts.length
  if (N < 2) return null

  const targetDistances = [rampL, totalL - rampL]

  for (const targetD of targetDistances) {
    let dist = 0
    for (let i = 0; i < N - 1; i++) {
      const a = pts[i]!
      const b = pts[i + 1]!
      const segL = Math.hypot(b.x - a.x, b.z - a.z)

      if (dist + segL >= targetD) {
        const t = (targetD - dist) / segL
        const px = a.x + (b.x - a.x) * t
        const py = a.y + (b.y - a.y) * t
        const pz = a.z + (b.z - a.z) * t

        let dx = b.x - a.x
        let dz = b.z - a.z
        const len = Math.hypot(dx, dz)
        const nx = len > 0 ? -dz / len : 0
        const nz = len > 0 ? dx / len : 1

        const STREET_Y = 0.14
        const portalH = STREET_Y - py // e.g. 0.14 - (-4.8) = 4.94m
        const portalW = halfW * 2 + 2.0
        const portalD = 2.4

        // Arch header (concrete lintel flush with street level on top)
        const headerH = 1.2
        const headerGeo = new THREE.BoxGeometry(portalW, headerH, portalD)
        const headerMesh = new THREE.Mesh(headerGeo, TUNNEL_PORTAL_MAT)
        headerMesh.position.set(px, STREET_Y - headerH / 2, pz)
        headerMesh.rotation.y = Math.atan2(dx, dz)
        headerMesh.castShadow = true
        headerMesh.receiveShadow = true
        group.add(headerMesh)

        // Left jamb pillar
        const jambW = 1.0
        const jambH = portalH
        const jambGeo = new THREE.BoxGeometry(jambW, jambH, portalD)
        const leftJamb = new THREE.Mesh(jambGeo, TUNNEL_PORTAL_MAT)
        leftJamb.position.set(px + nx * (halfW + jambW / 2), py + jambH / 2, pz + nz * (halfW + jambW / 2))
        leftJamb.rotation.y = Math.atan2(dx, dz)
        leftJamb.castShadow = true
        leftJamb.receiveShadow = true
        group.add(leftJamb)

        // Right jamb pillar
        const rightJamb = new THREE.Mesh(jambGeo, TUNNEL_PORTAL_MAT)
        rightJamb.position.set(px - nx * (halfW + jambW / 2), py + jambH / 2, pz - nz * (halfW + jambW / 2))
        rightJamb.rotation.y = Math.atan2(dx, dz)
        rightJamb.castShadow = true
        rightJamb.receiveShadow = true
        group.add(rightJamb)

        break
      }
      dist += segL
    }
  }

  return group.children.length > 0 ? group : null
}

function buildTunnelTube(
  pts: { x: number; y: number; z: number }[],
  halfW: number,
  totalL: number,
  rampL: number,
): THREE.Mesh | null {
  const N = pts.length
  if (N < 2) return null

  const tubeHalfW = halfW + 0.35
  const CEILING_TOP_Y = 0.0 // flush with surface ground!
  const CEILING_BOT_Y = -0.45 // bottom of ceiling slab inside tunnel

  const verts: number[] = []
  const norm: number[] = []
  const idx: number[] = []

  let dist = 0
  for (let i = 0; i < N - 1; i++) {
    const p0 = pts[i]!
    const p1 = pts[i + 1]!
    const segL = Math.hypot(p1.x - p0.x, p1.z - p0.z)
    const midDist = dist + segL / 2

    // ONLY generate the covered tube for the underground section between the two portals!
    if (midDist >= rampL - 0.5 && midDist <= totalL - rampL + 0.5) {
      let dx = p1.x - p0.x
      let dz = p1.z - p0.z
      const len = Math.hypot(dx, dz)
      const nx = len > 0 ? -dz / len : 0
      const nz = len > 0 ? dx / len : 1

      // 1. Left Interior Concrete Wall
      const bL = verts.length / 3
      verts.push(
        p0.x + nx * tubeHalfW, p0.y, p0.z + nz * tubeHalfW,
        p1.x + nx * tubeHalfW, p1.y, p1.z + nz * tubeHalfW,
        p1.x + nx * tubeHalfW, CEILING_BOT_Y, p1.z + nz * tubeHalfW,
        p0.x + nx * tubeHalfW, CEILING_BOT_Y, p0.z + nz * tubeHalfW,
      )
      norm.push(-nx, 0, -nz,  -nx, 0, -nz,  -nx, 0, -nz,  -nx, 0, -nz)
      idx.push(bL, bL + 1, bL + 2, bL, bL + 2, bL + 3)

      // 2. Right Interior Concrete Wall
      const bR = verts.length / 3
      verts.push(
        p0.x - nx * tubeHalfW, CEILING_BOT_Y, p0.z - nz * tubeHalfW,
        p1.x - nx * tubeHalfW, CEILING_BOT_Y, p1.z - nz * tubeHalfW,
        p1.x - nx * tubeHalfW, p1.y, p1.z - nz * tubeHalfW,
        p0.x - nx * tubeHalfW, p0.y, p0.z - nz * tubeHalfW,
      )
      norm.push(nx, 0, nz,  nx, 0, nz,  nx, 0, nz,  nx, 0, nz)
      idx.push(bR, bR + 1, bR + 2, bR, bR + 2, bR + 3)

      // 3. Interior Ceiling Slab Face (looking up from inside)
      const bC = verts.length / 3
      verts.push(
        p0.x + nx * tubeHalfW, CEILING_BOT_Y, p0.z + nz * tubeHalfW,
        p1.x + nx * tubeHalfW, CEILING_BOT_Y, p1.z + nz * tubeHalfW,
        p1.x - nx * tubeHalfW, CEILING_BOT_Y, p1.z - nz * tubeHalfW,
        p0.x - nx * tubeHalfW, CEILING_BOT_Y, p0.z - nz * tubeHalfW,
      )
      norm.push(0, -1, 0,  0, -1, 0,  0, -1, 0,  0, -1, 0)
      idx.push(bC, bC + 1, bC + 2, bC, bC + 2, bC + 3)

      // 4. Exterior Ceiling Top Slab Face (ground level y = 0.0, occludes underground)
      const bTop = verts.length / 3
      verts.push(
        p0.x - nx * tubeHalfW, CEILING_TOP_Y, p0.z - nz * tubeHalfW,
        p1.x - nx * tubeHalfW, CEILING_TOP_Y, p1.z - nz * tubeHalfW,
        p1.x + nx * tubeHalfW, CEILING_TOP_Y, p1.z + nz * tubeHalfW,
        p0.x + nx * tubeHalfW, CEILING_TOP_Y, p0.z + nz * tubeHalfW,
      )
      norm.push(0, 1, 0,  0, 1, 0,  0, 1, 0,  0, 1, 0)
      idx.push(bTop, bTop + 1, bTop + 2, bTop, bTop + 2, bTop + 3)
    }

    dist += segL
  }

  if (verts.length === 0) return null

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(norm, 3))
  geo.setIndex(idx)
  geo.computeVertexNormals()
  const mesh = new THREE.Mesh(geo, TUNNEL_WALL_MAT)
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

function buildTunnelLighting(
  pts: { x: number; y: number; z: number }[],
  totalL: number,
  rampL: number,
): THREE.Group | null {
  const group = new THREE.Group()
  const N = pts.length
  if (N < 2) return null

  const lightSpacing = 12.0
  let dist = 0
  let nextLightDist = rampL + 4.0

  const stripGeo = new THREE.BoxGeometry(0.28, 0.12, 1.8)

  for (let i = 0; i < N - 1; i++) {
    const a = pts[i]!
    const b = pts[i + 1]!
    const segL = Math.hypot(b.x - a.x, b.z - a.z)

    while (dist + segL >= nextLightDist && nextLightDist <= totalL - rampL - 4.0) {
      const t = (nextLightDist - dist) / segL
      const px = a.x + (b.x - a.x) * t
      const py = -0.55 // Suspended right below the underground ceiling (-0.45m)
      const pz = a.z + (b.z - a.z) * t

      const mesh = new THREE.Mesh(stripGeo, TUNNEL_LIGHT_MAT)
      mesh.position.set(px, py, pz)
      mesh.rotation.y = Math.atan2(b.x - a.x, b.z - a.z)
      group.add(mesh)

      nextLightDist += lightSpacing
    }
    dist += segL
  }

  return group.children.length > 0 ? group : null
}

// ── 3. Main RoadMeshGenerator ──────────────────────────────────────────────

function checkElevationConnections(road: Road, allRoads?: Road[]): { connectsStart: boolean; connectsEnd: boolean } {
  if (!allRoads || allRoads.length === 0 || road.points.length < 2) {
    return { connectsStart: false, connectsEnd: false }
  }
  const isTargetElevation = (r: Road) => {
    if (road.elevationMode === 'bridge' || road.bridge) {
      return r.elevationMode === 'bridge' || !!r.bridge
    }
    if (road.elevationMode === 'tunnel' || road.tunnel) {
      return r.elevationMode === 'tunnel' || !!r.tunnel
    }
    return false
  }

  const pStart = road.points[0]!
  const pEnd = road.points[road.points.length - 1]!
  let connectsStart = false
  let connectsEnd = false

  for (const other of allRoads) {
    if (other.id === road.id || other.points.length < 2) continue
    if (!isTargetElevation(other)) continue

    const oStart = other.points[0]!
    const oEnd = other.points[other.points.length - 1]!

    if (!connectsStart) {
      if (Math.hypot(oStart.x - pStart.x, oStart.z - pStart.z) < 1.0 ||
          Math.hypot(oEnd.x - pStart.x, oEnd.z - pStart.z) < 1.0) {
        connectsStart = true
      }
    }
    if (!connectsEnd) {
      if (Math.hypot(oStart.x - pEnd.x, oStart.z - pEnd.z) < 1.0 ||
          Math.hypot(oEnd.x - pEnd.x, oEnd.z - pEnd.z) < 1.0) {
        connectsEnd = true
      }
    }
    if (connectsStart && connectsEnd) break
  }

  return { connectsStart, connectsEnd }
}

export function computeRoadWidth(road: Road): { roadW: number; lanes: number; halfW: number } {
  const hw = road.highway
  const isHighway = hw === 'motorway' || hw === 'trunk'
  const isMajor = hw === 'primary' || isHighway

  // Default lanes if unspecified
  let lanes = road.lanes
  if (!lanes) {
    if (road.isLink) {
      lanes = 1
    } else if (hw === 'service' || hw === 'track') {
      lanes = 1
    } else if (road.oneway) {
      lanes = 1
    } else if (isMajor) {
      lanes = 4
    } else if (hw === 'pedestrian') {
      lanes = 3
    } else {
      lanes = 2
    }
  }

  // Width determination honoring OSM guidelines
  let roadW: number
  if (road.isLink) {
    const baseW = lanes >= 2 ? 6.4 : 4.8
    roadW = road.explicitWidth && road.explicitWidth >= 3.2 ? road.explicitWidth : baseW
  } else if (hw === 'service' || hw === 'track') {
    const baseW = lanes >= 2 ? 5.4 : 3.8
    roadW = road.explicitWidth && road.explicitWidth >= 3.0 ? road.explicitWidth : baseW
  } else if (hw === 'pedestrian') {
    // Pedestrian streets: modest paved width unless mapped (lanes are meaningless here)
    roadW = road.explicitWidth && road.explicitWidth >= 2.0 ? road.explicitWidth : 5.0
  } else if (road.oneway && lanes === 1) {
    const baseW = 4.6
    roadW = road.explicitWidth && road.explicitWidth >= 3.2 ? road.explicitWidth : baseW
  } else {
    roadW = road.explicitWidth && road.explicitWidth >= 3.2 ? road.explicitWidth : lanes * LANE_WIDTH
  }

  return { roadW, lanes, halfW: roadW / 2 }
}

export class RoadMeshGenerator {
  /**
   * Main entry point: dispatches road generation according to the 3 elevation
   * modes defined in pont.txt (ground, bridge, tunnel).
   */
  static generate(road: Road, allRoads?: Road[], opts?: RoadGenerateOptions): THREE.Group | null {
    const pts = road.points
    if (pts.length < 2) return null

    // Bridges and tunnels are built from the whole way (elevation profile); each chunk keeps its part
    if (road.elevationMode === 'bridge' || road.bridge) {
      const g = RoadMeshGenerator.generateBridgeRoad(road, allRoads)
      const cell = buildCellOf(allRoads, opts)
      return g && cell ? clipGroupToCell(g, cell) : g
    }

    if (road.elevationMode === 'tunnel' || road.tunnel) {
      const g = RoadMeshGenerator.generateTunnelRoad(road, allRoads)
      const cell = buildCellOf(allRoads, opts)
      return g && cell ? clipGroupToCell(g, cell) : g
    }

    return RoadMeshGenerator.generateGroundRoad(road, allRoads, opts)
  }

  /**
   * Generates static Rapier collider descriptions for elevated bridges, tunnels, and ground roads.
   * - Bridges: Elevated road deck trimesh + left and right safety parapets.
   * - Tunnels: Left and right tunnel wall trimeshes + underground floor.
   * - Ground: Surface trimesh matching mitered road boundaries.
   */
  static createColliderDescs(road: Road, allRoads?: Road[]): RAPIER.ColliderDesc[] {
    const descs: RAPIER.ColliderDesc[] = []
    const pts = road.points
    if (pts.length < 2) return descs

    if (road.elevationMode === 'bridge' || road.bridge) {
      const { halfW } = computeRoadWidth(road)
      const bridgeHeight = road.bridgeHeight ?? (road.layer > 1 ? road.layer * 4.5 : 4.5)
      const { connectsStart, connectsEnd } = checkElevationConnections(road, allRoads)

      const { points: raisedPts } = computeElevatedBridgePoints(pts, bridgeHeight, connectsStart, connectsEnd)
      const N = raisedPts.length
      if (N < 2) return descs
      const normals = computePolylineNormals(raisedPts)

      // 1. Elevated Road Surface Deck Trimesh (double-sided collision)
      const deckVerts: number[] = []
      const deckIdx: number[] = []

      for (let i = 0; i < N; i++) {
        const curr = raisedPts[i]!
        const norm = normals[i]!
        const nx = norm.nx
        const nz = norm.nz
        const miter = norm.miter
        const w = halfW * miter

        deckVerts.push(
          curr.x + nx * w, curr.y, curr.z + nz * w,
          curr.x - nx * w, curr.y, curr.z - nz * w,
        )

        if (i < N - 1) {
          const b = i * 2
          deckIdx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2)
          deckIdx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3)
        }
      }

      if (deckVerts.length >= 9 && deckIdx.length >= 3) {
        const deckCol = RAPIER.ColliderDesc.trimesh(
          new Float32Array(deckVerts),
          new Uint32Array(deckIdx),
        ).setFriction(0.3).setRestitution(0.0)
        descs.push(deckCol)
      }

      // 2. Parapet Guardrails (left and right walls, height 1.2m)
      const parapetVerts: number[] = []
      const parapetIdx: number[] = []
      const parapetH = 1.2

      for (let i = 0; i < N; i++) {
        const curr = raisedPts[i]!
        const norm = normals[i]!
        const nx = norm.nx
        const nz = norm.nz
        const miter = norm.miter
        const pW = (halfW + 0.15) * miter

        // Left parapet
        parapetVerts.push(
          curr.x + nx * pW, curr.y, curr.z + nz * pW,
          curr.x + nx * pW, curr.y + parapetH, curr.z + nz * pW,
        )
        // Right parapet
        parapetVerts.push(
          curr.x - nx * pW, curr.y, curr.z - nz * pW,
          curr.x - nx * pW, curr.y + parapetH, curr.z - nz * pW,
        )

        if (i < N - 1) {
          const lb = i * 4
          parapetIdx.push(lb, lb + 1, lb + 4, lb + 1, lb + 5, lb + 4)
          parapetIdx.push(lb, lb + 4, lb + 1, lb + 1, lb + 4, lb + 5)
          const rb = i * 4 + 2
          parapetIdx.push(rb, rb + 1, rb + 4, rb + 1, rb + 5, rb + 4)
          parapetIdx.push(rb, rb + 4, rb + 1, rb + 1, rb + 4, rb + 5)
        }
      }

      if (parapetVerts.length >= 9 && parapetIdx.length >= 3) {
        const parapetCol = RAPIER.ColliderDesc.trimesh(
          new Float32Array(parapetVerts),
          new Uint32Array(parapetIdx),
        ).setFriction(0.1).setRestitution(0.1)
        descs.push(parapetCol)
      }
    } else if (road.elevationMode === 'tunnel' || road.tunnel) {
      const { halfW } = computeRoadWidth(road)
      const depth = road.layer && road.layer < 0 ? Math.min(-4.5, road.layer * 4.5) : -4.8
      const { connectsStart, connectsEnd } = checkElevationConnections(road, allRoads)

      const { points: tunnelPts } = computeTunnelPoints(pts, depth, connectsStart, connectsEnd)
      const N = tunnelPts.length
      if (N < 2) return descs
      const normals = computePolylineNormals(tunnelPts)

      // 1. Underground Road Surface Floor Collider (double-sided)
      const floorVerts: number[] = []
      const floorIdx: number[] = []

      for (let i = 0; i < N; i++) {
        const curr = tunnelPts[i]!
        const norm = normals[i]!
        const nx = norm.nx
        const nz = norm.nz
        const miter = norm.miter
        const w = halfW * miter

        floorVerts.push(
          curr.x + nx * w, curr.y, curr.z + nz * w,
          curr.x - nx * w, curr.y, curr.z - nz * w,
        )

        if (i < N - 1) {
          const b = i * 2
          floorIdx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2)
          floorIdx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3)
        }
      }

      if (floorVerts.length >= 9 && floorIdx.length >= 3) {
        const floorCol = RAPIER.ColliderDesc.trimesh(
          new Float32Array(floorVerts),
          new Uint32Array(floorIdx),
        ).setFriction(0.3).setRestitution(0.0)
        descs.push(floorCol)
      }

      // 2. Retaining Walls & Tunnel Walls Collider (from curr.y up to 0.14m)
      const wallVerts: number[] = []
      const wallIdx: number[] = []

      for (let i = 0; i < N; i++) {
        const curr = tunnelPts[i]!
        const norm = normals[i]!
        const nx = norm.nx
        const nz = norm.nz
        const miter = norm.miter
        const tW = (halfW + 0.22) * miter
        const topY = 0.14

        wallVerts.push(
          curr.x + nx * tW, curr.y, curr.z + nz * tW,
          curr.x + nx * tW, topY, curr.z + nz * tW,
        )
        wallVerts.push(
          curr.x - nx * tW, curr.y, curr.z - nz * tW,
          curr.x - nx * tW, topY, curr.z - nz * tW,
        )

        if (i < N - 1) {
          const lb = i * 4
          wallIdx.push(lb, lb + 1, lb + 4, lb + 1, lb + 5, lb + 4)
          wallIdx.push(lb, lb + 4, lb + 1, lb + 1, lb + 4, lb + 5)
          const rb = i * 4 + 2
          wallIdx.push(rb, rb + 1, rb + 4, rb + 1, rb + 5, rb + 4)
          wallIdx.push(rb, rb + 4, rb + 1, rb + 1, rb + 4, rb + 5)
        }
      }

      if (wallVerts.length >= 9 && wallIdx.length >= 3) {
        const wallCol = RAPIER.ColliderDesc.trimesh(
          new Float32Array(wallVerts),
          new Uint32Array(wallIdx),
        ).setFriction(0.1).setRestitution(0.05)
        descs.push(wallCol)
      }
    } else {
      // Ground-level road surface collider at y = 0.028m (seamless connection to bridge & tunnel ramps),
      // one trimesh per chunk-cell portion so border-crossing ways are not doubled
      const { halfW } = computeRoadWidth(road)
      for (const portion of roadPortions(road, allRoads)) {
      const smoothPts = resamplePolyline(portion.pts, 1.8)
      const N = smoothPts.length
      if (N >= 2) {
        const normals = computePolylineNormals(smoothPts)
        const roadVerts: number[] = []
        const roadIdx: number[] = []
        const ROAD_Y = 0.028
        for (let i = 0; i < N; i++) {
          const curr = smoothPts[i]!
          const norm = normals[i]!
          const nx = norm.nx
          const nz = norm.nz
          const miter = norm.miter
          const w = halfW * miter

          roadVerts.push(
            curr.x + nx * w, ROAD_Y, curr.z + nz * w,
            curr.x - nx * w, ROAD_Y, curr.z - nz * w,
          )
          if (i < N - 1) {
            const b = i * 2
            roadIdx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2)
            roadIdx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3)
          }
        }
        if (roadVerts.length >= 9 && roadIdx.length >= 3) {
          const roadCol = RAPIER.ColliderDesc.trimesh(
            new Float32Array(roadVerts),
            new Uint32Array(roadIdx),
          ).setFriction(0.35).setRestitution(0.0)
          descs.push(roadCol)
        }
      }
      }
    }

    return descs
  }

  /**
   * Generates an elevated 3D bridge infrastructure (pont.txt sections 5, 8, 11, 12):
   * - Smooth transition entry/exit ramps rising from ground to deck (omitted if adjacent bridge connected)
   * - Elevated asphalt surface with accurate lane markings
   * - Solid concrete box girder deck underside
   * - Heavy stone parapet base with metal safety railings
   * - Structural concrete bridge piers/pillars reaching down to ground/riverbed
   */
  static generateBridgeRoad(road: Road, allRoads?: Road[]): THREE.Group | null {
    const pts = road.points
    if (pts.length < 2) return null

    const group = new THREE.Group()
    group.userData['roadId'] = road.id

    const hw = road.highway
    const surf = road.surface
    const { roadW, lanes, halfW } = computeRoadWidth(road)
    const bridgeHeight = road.bridgeHeight ?? (road.layer > 1 ? road.layer * 4.5 : 4.5)
    const { connectsStart, connectsEnd } = checkElevationConnections(road, allRoads)

    // Compute smooth 3D elevation profile (entry ramp -> elevated span -> exit ramp)
    const { points: raisedPts, totalLength: L, rampLength: R } = computeElevatedBridgePoints(
      pts,
      bridgeHeight,
      connectsStart,
      connectsEnd,
    )

    // 1. Elevated asphalt road surface
    const surface = buildRibbon(raisedPts, halfW, 0.0, getAsphaltMaterial(hw, surf))
    if (surface) {
      surface.userData['roadId'] = road.id
      surface.renderOrder = 4
      group.add(surface)
    }

    // 2. White edge lines framing the bridge deck
    const leftEdge = buildRibbon(raisedPts, 0.09, 0.005, WHITE_MARK)
    if (leftEdge) {
      shiftRibbonLateral(leftEdge, raisedPts, halfW - 0.15)
      leftEdge.renderOrder = 5
      group.add(leftEdge)
    }
    const rightEdge = buildRibbon(raisedPts, 0.09, 0.005, WHITE_MARK)
    if (rightEdge) {
      shiftRibbonLateral(rightEdge, raisedPts, -(halfW - 0.15))
      rightEdge.renderOrder = 5
      group.add(rightEdge)
    }

    // 3. Central lane dividers / markings
    if (road.isLink || road.oneway) {
      if (lanes >= 2) {
        for (let l = 1; l < lanes; l++) {
          const divOffset = -halfW + l * (roadW / lanes)
          const div = buildDashedLine(raisedPts, divOffset, 0.08, 0.005, 4.0, 4.0, WHITE_MARK)
          if (div) {
            div.renderOrder = 5
            group.add(div)
          }
        }
      }
    } else if (lanes >= 4) {
      const yellowDiv = buildRibbon(raisedPts, 0.10, 0.005, YELLOW_MARK)
      if (yellowDiv) {
        yellowDiv.renderOrder = 5
        group.add(yellowDiv)
      }
    } else if (lanes >= 2) {
      const dashedCenter = buildDashedLine(raisedPts, 0.0, 0.08, 0.005, 5.0, 4.0, WHITE_MARK)
      if (dashedCenter) {
        dashedCenter.renderOrder = 5
        group.add(dashedCenter)
      }
    }

    // 4. Solid Bridge Deck underside (concrete box girder)
    const deckMesh = buildBridgeDeckMesh(raisedPts, halfW, 0.85)
    if (deckMesh) group.add(deckMesh)

    // 5. Heavy stone parapet base + steel safety railings along both sides
    const parapetH = 1.1
    const leftParapet = buildBridgeParapet(raisedPts, halfW + 0.18, parapetH)
    group.add(leftParapet)
    const rightParapet = buildBridgeParapet(raisedPts, -(halfW + 0.18), parapetH)
    group.add(rightParapet)

    // 6. Structural bridge piers/pillars reaching down to ground/riverbed
    const piers = buildBridgePiers(raisedPts, halfW, L, R)
    if (piers) group.add(piers)

    return group
  }

  /**
   * Generates an underground 3D tunnel (pont.txt section 14 & 25):
   * - Entrance and exit descending/ascending ramps
   * - Underground asphalt road surface
   * - Arched concrete tunnel tube (walls and ceiling)
   * - Monumental concrete portal arches at entrance and exit
   * - Fluorescent ceiling strip lighting along the tunnel tube
   */
  static generateTunnelRoad(road: Road, allRoads?: Road[]): THREE.Group | null {
    const pts = road.points
    if (pts.length < 2) return null

    const group = new THREE.Group()
    group.userData['roadId'] = road.id

    const hw = road.highway
    const surf = road.surface
    const { roadW, lanes, halfW } = computeRoadWidth(road)
    const depth = road.layer && road.layer < 0 ? Math.min(-4.5, road.layer * 4.5) : -4.8
    const { connectsStart, connectsEnd } = checkElevationConnections(road, allRoads)

    // Compute underground 3D elevation profile (ramps down + underground tube)
    const { points: tunnelPts, totalLength: L, rampLength: R } = computeTunnelPoints(
      pts,
      depth,
      connectsStart,
      connectsEnd,
    )

    // 0. Stencil mask over open ramp trenches (clips out chunk urban slab cleanly)
    const trenchMask = buildTunnelTrenchMask(tunnelPts, halfW, L, R)
    if (trenchMask) group.add(trenchMask)

    // 1. Underground asphalt road surface
    const surface = buildRibbon(tunnelPts, halfW, 0.0, getAsphaltMaterial(hw, surf))
    if (surface) {
      surface.userData['roadId'] = road.id
      surface.renderOrder = 3
      group.add(surface)
    }

    // 2. White edge lines & lane dividers
    const leftEdge = buildRibbon(tunnelPts, 0.09, 0.005, WHITE_MARK)
    if (leftEdge) {
      shiftRibbonLateral(leftEdge, tunnelPts, halfW - 0.15)
      leftEdge.renderOrder = 4
      group.add(leftEdge)
    }
    const rightEdge = buildRibbon(tunnelPts, 0.09, 0.005, WHITE_MARK)
    if (rightEdge) {
      shiftRibbonLateral(rightEdge, tunnelPts, -(halfW - 0.15))
      rightEdge.renderOrder = 4
      group.add(rightEdge)
    }

    if (road.isLink || road.oneway) {
      if (lanes >= 2) {
        for (let l = 1; l < lanes; l++) {
          const divOffset = -halfW + l * (roadW / lanes)
          const div = buildDashedLine(tunnelPts, divOffset, 0.08, 0.005, 4.0, 4.0, WHITE_MARK)
          if (div) {
            div.renderOrder = 4
            group.add(div)
          }
        }
      }
    } else if (lanes >= 4) {
      const yellowDiv = buildRibbon(tunnelPts, 0.10, 0.005, YELLOW_MARK)
      if (yellowDiv) {
        yellowDiv.renderOrder = 4
        group.add(yellowDiv)
      }
    } else if (lanes >= 2) {
      const dashedCenter = buildDashedLine(tunnelPts, 0.0, 0.08, 0.005, 5.0, 4.0, WHITE_MARK)
      if (dashedCenter) {
        dashedCenter.renderOrder = 4
        group.add(dashedCenter)
      }
    }

    // 3. Open Trench Retaining Walls along entrance & exit ramps
    const trenchWalls = buildTunnelTrenchWalls(tunnelPts, halfW, L, R)
    if (trenchWalls) group.add(trenchWalls)

    // 4. Subterranean Covered Tunnel Tube (flush with ground surface at y = 0)
    const tube = buildTunnelTube(tunnelPts, halfW, L, R)
    if (tube) group.add(tube)

    // 5. Massive Tunnel Portals (têtes de tunnel) at entry and exit
    const portals = buildTunnelPortals(tunnelPts, halfW, L, R)
    if (portals) group.add(portals)

    // 6. Fluorescent Tunnel Lighting along ceiling
    const lights = buildTunnelLighting(tunnelPts, L, R)
    if (lights) group.add(lights)

    return group
  }

  /**
   * Generates a ground-level road with sidewalks, pedestrian crossings and markings.
   */
  static generateGroundRoad(road: Road, allRoads?: Road[], opts?: RoadGenerateOptions): THREE.Group | null {
    if (road.points.length < 2) return null
    const whole = RoadMeshGenerator.generateWholeWayFeatures(road)
    if (whole) {
      const cell = buildCellOf(allRoads, opts)
      return cell ? clipGroupToCell(whole, cell) : whole
    }
    const portions = roadPortions(road, allRoads, opts)
    if (portions.length === 0) return null
    if (portions.length === 1 && !portions[0]!.openStart && !portions[0]!.openEnd) {
      return RoadMeshGenerator.generateGroundPortion(road, portions[0]!, allRoads, opts)
    }
    const group = new THREE.Group()
    group.userData['roadId'] = road.id
    for (const portion of portions) {
      const sub = RoadMeshGenerator.generateGroundPortion(road, portion, allRoads, opts)
      if (sub) group.add(sub)
    }
    return group.children.length > 0 ? group : null
  }

  /** Steps and pedestrian plazas are built from the whole way (never split by chunk cell). */
  private static generateWholeWayFeatures(road: Road): THREE.Group | null {
    const rawPts0 = road.points
    const hw = road.highway

    const surf = road.surface
    const isHighway = hw === 'motorway' || hw === 'trunk'
    const isMajor = hw === 'primary' || isHighway
    const isLink = road.isLink ?? false
    const isUrbanStreet = !isHighway && !isLink && hw !== 'path' && hw !== 'footway' && hw !== 'cycleway' && hw !== 'steps' && hw !== 'pedestrian' && hw !== 'track'

    // ── Steps — render as stacked horizontal slabs ───────────────────────────
    if (hw === 'steps') {
      const group = new THREE.Group()
      group.userData['roadId'] = road.id
      const stepW = 2.5
      const stepH = 0.16
      const stepD = 0.35
      const stepMat = new THREE.MeshStandardMaterial({ color: 0x8a867e, roughness: 0.88, metalness: 0.04 })
      let dist = 0
      for (let i = 0; i < rawPts0.length - 1; i++) {
        const a = rawPts0[i]!; const b = rawPts0[i + 1]!
        const dx = b.x - a.x; const dz = b.z - a.z
        const segLen = Math.hypot(dx, dz)
        const steps = Math.max(1, Math.floor(segLen / stepD))
        for (let s = 0; s < steps; s++) {
          const t = s / steps
          const geo = new THREE.BoxGeometry(stepW, stepH, stepD)
          const mesh = new THREE.Mesh(geo, stepMat)
          mesh.position.set(a.x + dx * t, dist * stepH * 0.5, a.z + dz * t)
          mesh.rotation.y = Math.atan2(dx, dz)
          dist++
          group.add(mesh)
        }
      }
      return group
    }

    // Closed way (start and end touch < 3.0m): roundabout ring or pedestrian plaza outline
    const isClosedLoop = Math.hypot(
      rawPts0[0]!.x - rawPts0[rawPts0.length - 1]!.x,
      rawPts0[0]!.z - rawPts0[rawPts0.length - 1]!.z,
    ) < 3.0

    // ── Pedestrian plaza (closed pedestrian way = area): flat paving, no ribbon, no margins ──
    if (hw === 'pedestrian' && isClosedLoop && rawPts0.length >= 4) {
      const group = new THREE.Group()
      group.userData['roadId'] = road.id
      const shape = new THREE.Shape()
      shape.moveTo(rawPts0[0]!.x, -rawPts0[0]!.z)
      for (let i = 1; i < rawPts0.length - 1; i++) shape.lineTo(rawPts0[i]!.x, -rawPts0[i]!.z)
      shape.closePath()
      const geo = new THREE.ShapeGeometry(shape)
      geo.rotateX(-Math.PI / 2)
      const uv = geo.getAttribute('uv') as THREE.BufferAttribute
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 2.4, uv.getY(i) / 2.4)
      geo.computeVertexNormals()
      const plaza = new THREE.Mesh(geo, PLAZA_MAT)
      plaza.position.y = 0.02
      plaza.receiveShadow = true
      plaza.renderOrder = 2
      group.add(plaza)
      return group
    }
    return null
  }

  /**
   * Generates one chunk-cell portion of a ground-level road with sidewalks, junction
   * corners, pedestrian crossings and markings.
   */
  private static generateGroundPortion(wholeRoad: Road, portion: RoadPortion, allRoads?: Road[], opts?: RoadGenerateOptions): THREE.Group | null {
    const rawPts0 = portion.pts
    if (rawPts0.length < 2) return null
    const road: Road = rawPts0 === wholeRoad.points ? wholeRoad : { ...wholeRoad, points: rawPts0 }
    const open: [boolean, boolean] = [portion.openStart, portion.openEnd]
    const arcOffset = portion.arcStart

    // Highway classification
    const hw = road.highway
    const surf = road.surface
    const isHighway = hw === 'motorway' || hw === 'trunk'
    const isMajor = hw === 'primary' || isHighway
    const isLink = road.isLink ?? false
    const isUrbanStreet = !isHighway && !isLink && hw !== 'path' && hw !== 'footway' && hw !== 'cycleway' && hw !== 'steps' && hw !== 'pedestrian' && hw !== 'track'

    const { roadW, lanes, halfW } = computeRoadWidth(road)
    const group = new THREE.Group()
    group.userData['roadId'] = road.id
    const isClosedLoop = Math.hypot(
      rawPts0[0]!.x - rawPts0[rawPts0.length - 1]!.x,
      rawPts0[0]!.z - rawPts0[rawPts0.length - 1]!.z,
    ) < 3.0

    // ── Junction context: continuation ways, arms, through roads, obstacles ──
    const junction = analyseJunctions(road, allRoads)
    let obstacleCache: RoadObstacleSeg[] | null = null
    const getObstacles = (): RoadObstacleSeg[] => {
      if (!obstacleCache) obstacleCache = buildRoadObstacles(allRoads, road, junction)
      return obstacleCache
    }
    // Arms that stop short of their through road reach its centre-line; resample for a
    // consistent resolution across asphalt, gutters, tire tracks, and sidewalks
    const rawPts = extendArmEnds(rawPts0, junction)
    const smoothPts = resamplePolyline(rawPts, 1.8)
    const endNormals = continuationEndNormals(smoothPts, junction)
    const normals = computePolylineNormals(smoothPts, endNormals)
    const raisedPts = smoothPts

    // Arc-length table over the resampled centre-line (corners, crossings, stencils, parking, arrows)
    const arcTable: number[] = [0]
    for (let i = 1; i < smoothPts.length; i++) {
      arcTable.push(arcTable[i - 1]! + Math.hypot(smoothPts[i]!.x - smoothPts[i - 1]!.x, smoothPts[i]!.z - smoothPts[i - 1]!.z))
    }
    const roadLength = arcTable[arcTable.length - 1]!
    const pointAtArc = (s: number): { x: number; y: number; z: number; dx: number; dz: number } => {
      let i = 0
      while (i < smoothPts.length - 2 && arcTable[i + 1]! < s) i++
      const a = smoothPts[i]!; const b = smoothPts[i + 1]!
      const segL = arcTable[i + 1]! - arcTable[i]!
      const t = segL > 1e-6 ? Math.max(0, Math.min(1, (s - arcTable[i]!) / segL)) : 0
      let dx = b.x - a.x; let dz = b.z - a.z
      if (segL > 1e-6) { dx /= segL; dz /= segL } else { dx = 0; dz = 1 }
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t, dx, dz }
    }

    // Kerb fillets at every junction this road takes part in (drivable ways only)
    const asphaltMat = getAsphaltMaterial(hw, surf)
    const corners: JunctionCorners = junction.others.length > 0 && isDrivableWay(road)
      ? buildJunctionCorners(road, junction, smoothPts, arcTable, halfW, getObstacles())
      : { trims: { left: [], right: [] }, meshes: [], endTrim: [0, 0] }
    const inTrim = (side: 'left' | 'right', arc: number): boolean => {
      const list = corners.trims[side]
      for (let i = 0; i < list.length; i++) {
        const t = list[i]!
        if (arc >= t.a0 && arc <= t.a1) return true
      }
      return false
    }
    /** Half-corner trims whose band turned out to be an orphan stub: their fills are dropped too. */
    const orphanTrims = new Set<TrimSeg>()
    const addCornerMeshes = (): void => {
      for (const m of corners.meshes) {
        let orphan = false
        for (const t of orphanTrims) if (t.meshes.includes(m)) { orphan = true; break }
        if (!orphan) group.add(m)
      }
    }
    // Junction box around each extremity that meets other ways (no continuation): no marking,
    // painted lane, gutter or object inside it, whatever arms this chunk's context holds
    const endDisc: [number, number] = [0, 0]
    for (const e of [0, 1] as const) {
      const je = junction.ends[e]
      if (!je.isJunction || je.partner) continue
      let r = 0
      for (const a of je.arms) r = Math.max(r, computeRoadWidth(a.road).halfW)
      for (const t of je.through) r = Math.max(r, computeRoadWidth(t).halfW)
      endDisc[e] = r > 0 ? r + 0.5 : 0
    }
    const inEndDisc = (arc: number): boolean =>
      (endDisc[0] > 0 && arc < endDisc[0]) || (endDisc[1] > 0 && arc > roadLength - endDisc[1])
    /**
     * Point test against other ways' asphalt (+ margin); `footprint` = also the sidewalks of ways
     * we yield to (sidewalk use; the junction-end discs are skipped so bands reach the corner);
     * `side` = also this road's corner trims on that side (features stop at the fillet).
     */
    const blockedAt = (margin: number, footprint = false, side?: 'left' | 'right'): BlockedFn | null =>
      junction.others.length === 0 ? null : (x: number, z: number, arc: number) =>
        (side !== undefined && inTrim(side, arc)) || (!footprint && inEndDisc(arc)) ||
        isPointInRoadAsphalt(x, z, getObstacles(), margin, footprint)

    // ── 1. Road Surface (material depends on surface tag and highway type) ────
    // Arms end on the through road's asphalt edge (trapezoid), not on its centre-line
    const asphaltGeo = junction.others.length > 0 && isDrivableWay(road)
      ? armAsphaltGeometry(smoothPts, junction, halfW, getObstacles(), endNormals)
      : { pts: smoothPts, normals, trapezoid: [false, false] as [boolean, boolean] }
    const surface = buildStrip(asphaltGeo.pts, asphaltGeo.normals, halfW, 0.028, asphaltMat, hw === 'pedestrian' ? { uvMetres: 2.4, arcOffset } : { arcOffset })
    if (surface) {
      if (junction.others.length > 0 && !(asphaltGeo.trapezoid[0] && asphaltGeo.trapezoid[1])) {
        clampArmEndPoke(surface, asphaltGeo.pts, junction, getObstacles(), asphaltGeo.trapezoid)
      }
      surface.userData['roadId'] = road.id
      surface.renderOrder = 3
      group.add(surface)
    }

    // ── Highway: Dedicated Cycleway ──────────────────────────────────────────
    if (hw === 'cycleway') {
      const cyclewayMat = new THREE.MeshStandardMaterial({
        color: 0x1f5c38, // Parisian / European cycling green
        roughness: 0.85,
        metalness: 0.02,
        polygonOffset: true,
        polygonOffsetFactor: -2.0,
        polygonOffsetUnits: -2.0,
      })
      const cycleSurface = buildStrip(raisedPts, normals, halfW, 0.028, cyclewayMat, { arcOffset })
      if (cycleSurface) group.add(cycleSurface)
      const cycleEdge = buildStrip(raisedPts, normals, 0.06, 0.038, WHITE_MARK, { lateral: halfW - 0.1, arcOffset })
      if (cycleEdge) group.add(cycleEdge)
      return group
    }

    if (hw === 'path' || hw === 'footway') {
      return group
    }

    // ── Roundabout Central Island ────────────────────────────────────────────
    // Only generate island if the way is a closed loop (start and end touch < 3.0m)
    // Avoids generating displaced islands for multi-way roundabout arcs
    if (road.isRoundabout && rawPts0.length >= 4 && isClosedLoop) {
      let sumX = 0, sumZ = 0
      for (const p of rawPts0) { sumX += p.x; sumZ += p.z }
      const cX = sumX / rawPts0.length
      const cZ = sumZ / rawPts0.length

      let avgR = 0
      for (const p of rawPts0) {
        avgR += Math.hypot(p.x - cX, p.z - cZ)
      }
      avgR /= rawPts0.length

      const innerR = Math.max(2.0, avgR - halfW)
      const islandGeo = new THREE.CylinderGeometry(innerR, innerR + 0.2, 0.28, 32)
      const grassMat = new THREE.MeshStandardMaterial({
        color: 0x2e6b2c,
        roughness: 0.95,
        metalness: 0.0,
      })
      const islandMesh = new THREE.Mesh(islandGeo, grassMat)
      islandMesh.position.set(cX, 0.14, cZ)
      islandMesh.receiveShadow = true
      group.add(islandMesh)

      const innerDecorGeo = new THREE.CylinderGeometry(innerR * 0.35, innerR * 0.4, 0.6, 24)
      const stoneMat = new THREE.MeshStandardMaterial({
        color: 0xd0cbc0,
        roughness: 0.85,
        metalness: 0.05,
      })
      const decorMesh = new THREE.Mesh(innerDecorGeo, stoneMat)
      decorMesh.position.set(cX, 0.35, cZ)
      decorMesh.castShadow = true
      group.add(decorMesh)
    }

    // Pedestrian streets: paved but no car markings, with thin raised margins
    if (hw === 'pedestrian') {
      const swWidth = 1.5
      const capStart = !junction.ends[0].partner && !open[0]
      const capEnd = !junction.ends[1].partner && !open[1]
      const jEnds: [boolean, boolean] = [junction.ends[0].isJunction, junction.ends[1].isJunction]
      group.add(buildCleanSidewalk(raisedPts, normals, halfW, swWidth, 'left', getObstacles(), capStart, capEnd, [], arcOffset, jEnds))
      group.add(buildCleanSidewalk(raisedPts, normals, halfW, swWidth, 'right', getObstacles(), capStart, capEnd, [], arcOffset, jEnds))
      addCornerMeshes()
      return group
    }

    // ── Painted lanes on this carriageway (cycle / bus) and the resulting car-lane extent ──
    // Side convention everywhere: +normal = right-hand side of the way direction.
    const CW_W = 1.6
    const CW_GAP = 0.25
    const CW_FOOT = CW_W + CW_GAP
    const BUS_W = 3.0
    const MIN_CAR_W = 2.6
    const cw = road.cycleway
    let cycleRight = false
    let cycleLeft = false
    if (isUrbanStreet && cw && cw !== 'none' && cw !== 'shared_lane') {
      if (cw === 'both') { cycleRight = true; cycleLeft = true }
      else if (cw === 'left') cycleLeft = true
      else if (cw === 'right') cycleRight = true
      else { cycleRight = true; cycleLeft = !road.oneway } // 'lane' / 'track': both sides of a two-way street
    }
    // Keep at least one drivable car lane: drop the left lane first, then both
    if (cycleLeft && cycleRight && roadW - 2 * CW_FOOT < MIN_CAR_W) cycleLeft = false
    if (cycleLeft && roadW - CW_FOOT < MIN_CAR_W) cycleLeft = false
    if (cycleRight && roadW - CW_FOOT < MIN_CAR_W) cycleRight = false
    let busLane = !!road.hasBusLane && isUrbanStreet
    if (busLane && roadW - BUS_W - (cycleRight ? CW_FOOT : 0) - (cycleLeft ? CW_FOOT : 0) < MIN_CAR_W) busLane = false
    const carMinus = -halfW + (cycleLeft ? CW_FOOT : 0)
    const carPlus = halfW - (cycleRight ? CW_FOOT : 0) - (busLane ? BUS_W : 0)
    const carW = Math.max(MIN_CAR_W, carPlus - carMinus)
    const carCenter = (carMinus + carPlus) / 2
    const carLanes = Math.max(1, Math.min(lanes, Math.floor(carW / MIN_CAR_W + 1e-6)))
    const laneW = carW / carLanes

    // ── 2. Paved Granite Gutter (Caniveau de bordure de 24cm pour rues urbaines) ──
    if (isUrbanStreet) {
      const gutterW = 0.24
      const gutterOffset = halfW - gutterW / 2
      const leftGutter = buildStrip(raisedPts, normals, gutterW / 2, 0.029, GUTTER_MAT, { lateral: -gutterOffset, blocked: blockedAt(0.0, false, 'left'), arcOffset, minRun: 1.0 })
      const rightGutter = buildStrip(raisedPts, normals, gutterW / 2, 0.029, GUTTER_MAT, { lateral: gutterOffset, blocked: blockedAt(0.0, false, 'right'), arcOffset, minRun: 1.0 })
      if (leftGutter)  { leftGutter.renderOrder = 3; group.add(leftGutter) }
      if (rightGutter) { rightGutter.renderOrder = 3; group.add(rightGutter) }
    }

    // ── 3. Rubber Tire Tracks (Traces de pneus / gommage au sol) ──────
    const tireTrackHalfW = 0.22
    const trackBlocked = blockedAt(0.3)
    for (let l = 0; l < carLanes; l++) {
      const laneCenter = carMinus + (l + 0.5) * laneW
      const wheel = Math.min(0.75, laneW / 2 - 0.4)
      const trackL = buildStrip(raisedPts, normals, tireTrackHalfW, 0.032, TIRE_RUBBER_MAT, { lateral: laneCenter - wheel, blocked: trackBlocked, arcOffset, minRun: 1.5 })
      const trackR = buildStrip(raisedPts, normals, tireTrackHalfW, 0.032, TIRE_RUBBER_MAT, { lateral: laneCenter + wheel, blocked: trackBlocked, arcOffset, minRun: 1.5 })
      if (trackL) { trackL.renderOrder = 3; group.add(trackL) }
      if (trackR) { trackR.renderOrder = 3; group.add(trackR) }
    }

    // ── 4. Solid White Edge Lines (Bandes de rive nettes & visibles) ───
    // Stop ~1 m before the junction box; none beside a painted cycle / bus lane
    const edgeHalfW = 0.07 // 14cm wide solid line
    const edgeOffset = isUrbanStreet ? halfW - 0.35 : halfW - 0.18
    if (!cycleLeft) {
      const leftEdge = buildStrip(raisedPts, normals, edgeHalfW, 0.040, WHITE_MARK, { lateral: -edgeOffset, blocked: blockedAt(1.0, false, 'left'), arcOffset, minRun: 1.0 })
      if (leftEdge) { leftEdge.renderOrder = 4; group.add(leftEdge) }
    }
    if (!cycleRight && !busLane) {
      const rightEdge = buildStrip(raisedPts, normals, edgeHalfW, 0.040, WHITE_MARK, { lateral: edgeOffset, blocked: blockedAt(1.0, false, 'right'), arcOffset, minRun: 1.0 })
      if (rightEdge) { rightEdge.renderOrder = 4; group.add(rightEdge) }
    }

    // ── 5. Ground Lane Markings (Ligne centrale & séparateurs de voies) ─
    const markBlocked = blockedAt(0.5)
    if (isLink || road.oneway) {
      // One-way / ramp: no centre line; dashed white dividers between the car lanes
      for (let l = 1; l < carLanes; l++) {
        const dividerOffset = carMinus + l * laneW
        const div = buildDashedLine(raisedPts, dividerOffset, 0.07, 0.040, isLink ? 4.0 : 3.0, 5.0, WHITE_MARK, normals, markBlocked, arcOffset)
        if (div) { div.renderOrder = 4; group.add(div) }
      }
    } else if (lanes >= 4) {
      // GROSSE AVENUE (Double sens) :
      // A. Double ligne jaune continue centrale
      const doubleSep = 0.14
      const leftCenterLine = buildStrip(raisedPts, normals, 0.06, 0.040, YELLOW_MARK, { lateral: carCenter - doubleSep, blocked: markBlocked, arcOffset, minRun: 1.0 })
      const rightCenterLine = buildStrip(raisedPts, normals, 0.06, 0.040, YELLOW_MARK, { lateral: carCenter + doubleSep, blocked: markBlocked, arcOffset, minRun: 1.0 })
      if (leftCenterLine)  { leftCenterLine.renderOrder = 4; group.add(leftCenterLine) }
      if (rightCenterLine) { rightCenterLine.renderOrder = 4; group.add(rightCenterLine) }

      // B. Lignes blanches discontinues séparant les voies de chaque sens
      const divLeft = buildDashedLine(raisedPts, carCenter - carW / 4, 0.07, 0.040, 4.0, 5.0, WHITE_MARK, normals, markBlocked, arcOffset)
      const divRight = buildDashedLine(raisedPts, carCenter + carW / 4, 0.07, 0.040, 4.0, 5.0, WHITE_MARK, normals, markBlocked, arcOffset)
      if (divLeft)  { divLeft.renderOrder = 4; group.add(divLeft) }
      if (divRight) { divRight.renderOrder = 4; group.add(divRight) }
    } else if (lanes >= 2) {
      // RUE DE VILLE (2 voies à double sens) :
      // Ligne blanche discontinue centrale (pointillés réguliers 3m / 3m)
      const centerDivider = buildDashedLine(raisedPts, carCenter, 0.07, 0.040, 3.0, 3.0, WHITE_MARK, normals, markBlocked, arcOffset)
      if (centerDivider) { centerDivider.renderOrder = 4; group.add(centerDivider) }
    }

    // ── 6. Clean Elevated Sidewalks & Beveled Curbs (Respecting sidewalkMode) ─
    const swMode = road.sidewalkMode ?? (isUrbanStreet ? 'both' : 'none')
    if (swMode !== 'none') {
      const swWidth = sidewalkWidthOf(road)
      const capStart = !junction.ends[0].partner && !open[0]
      const capEnd = !junction.ends[1].partner && !open[1]
      const jEnds: [boolean, boolean] = [junction.ends[0].isJunction, junction.ends[1].isJunction]
      if (swMode === 'both' || swMode === 'left') {
        group.add(buildCleanSidewalk(raisedPts, normals, halfW, swWidth, 'left', getObstacles(), capStart, capEnd, corners.trims.left, arcOffset, jEnds, orphanTrims))
      }
      if (swMode === 'both' || swMode === 'right') {
        group.add(buildCleanSidewalk(raisedPts, normals, halfW, swWidth, 'right', getObstacles(), capStart, capEnd, corners.trims.right, arcOffset, jEnds, orphanTrims))
      }
    }
    addCornerMeshes()


    // ── 7. Cycleway Infrastructure (Infrastructure cyclable OSM) ──────────────
    if (cycleRight || cycleLeft) {
      const cwHalf = CW_W / 2
      const cwRightOffset = halfW - CW_GAP - cwHalf - (busLane ? BUS_W : 0)
      const cwLeftOffset = halfW - CW_GAP - cwHalf

      const addCycleLane = (side: 'right' | 'left', offset: number) => {
        const lat = sideSign(side) * offset
        const laneBlocked = blockedAt(0.5, false, side)
        const cycleRibbon = buildStrip(raisedPts, normals, cwHalf, 0.038, PARIS_CYCLEWAY_MAT, { lateral: lat, blocked: laneBlocked, arcOffset, minRun: 1.5 })
        if (cycleRibbon) {
          cycleRibbon.renderOrder = 4
          group.add(cycleRibbon)
        }

        // White dashed border separating the cycle lane from the car lanes (inner edge)
        const divOffset = sideSign(side) * (offset - cwHalf)
        const whiteBorder = buildDashedLine(raisedPts, divOffset, 0.05, 0.039, 1.5, 1.5, WHITE_MARK, normals, laneBlocked, arcOffset)
        if (whiteBorder) {
          whiteBorder.renderOrder = 4
          group.add(whiteBorder)
        }

        // Bicycle stencil markings along the lane every ~25m
        if (roadLength >= 20) {
          const numIcons = Math.max(1, Math.floor(roadLength / 25))
          for (let k = 1; k <= numIcons; k++) {
            const sIcon = k * (roadLength / (numIcons + 1))
            const p = pointAtArc(sIcon)
            const nx = -p.dz; const nz = p.dx
            const ix = p.x + nx * lat
            const iz = p.z + nz * lat
            if (laneBlocked && laneBlocked(ix, iz, sIcon)) continue
            group.add(buildBicycleMarking({ x: ix, y: p.y, z: iz }, { dx: p.dx, dz: p.dz }))
          }
        }
      }

      if (cycleRight) addCycleLane('right', cwRightOffset)
      if (cycleLeft) addCycleLane('left', cwLeftOffset)
    }

    // ── 8. Dedicated Bus Lane (Couloir de bus réservé OSM) ───────────────────
    if (busLane) {
      const busHalf = BUS_W / 2
      const busOffset = halfW - 0.25 - busHalf
      const busBlocked = blockedAt(0.5, false, 'right')
      const busRibbon = buildStrip(raisedPts, normals, busHalf, 0.035, PARIS_BUSWAY_MAT, { lateral: busOffset, blocked: busBlocked, arcOffset, minRun: 1.5 })
      if (busRibbon) {
        busRibbon.renderOrder = 3
        group.add(busRibbon)
      }

      // Continuous wide white separator line on the inner edge
      const busSepOffset = halfW - 0.25 - BUS_W
      const busSep = buildStrip(raisedPts, normals, 0.12, 0.039, WHITE_MARK, { lateral: busSepOffset, blocked: busBlocked, arcOffset, minRun: 1.0 })
      if (busSep) {
        busSep.renderOrder = 4
        group.add(busSep)
      }

      // "BUS" lettering stencils on the asphalt
      if (roadLength >= 25) {
        const numBusMarks = Math.max(1, Math.floor(roadLength / 35))
        for (let k = 1; k <= numBusMarks; k++) {
          const sMark = k * (roadLength / (numBusMarks + 1))
          const p = pointAtArc(sMark)
          const nx = -p.dz; const nz = p.dx
          const bx = p.x + nx * busOffset
          const bz = p.z + nz * busOffset
          if (busBlocked && busBlocked(bx, bz, sMark)) continue
          group.add(buildBusLaneMarking({ x: bx, y: p.y, z: bz }, { dx: p.dx, dz: p.dz }))
        }
      }
    }

    // ── 9a. Pedestrian crossings & signals at their REAL OSM node positions ──
    type CrossingPlacement = { x: number; y: number; z: number; dx: number; dz: number; arc: number; signals: boolean; markings: boolean; stopLine: boolean }
    type CrossingRec = NonNullable<Road['crossings']>[number]
    const crossingPlacements: CrossingPlacement[] = []
    const realCrossings = road.crossings ?? []
    const ZEBRA_HALF = 1.8
    const fpBlocked = blockedAt(0.3, true)
    /** Distance from the node along the way until the centre-line leaves every other way's footprint. */
    const extentFrom = (sNode: number, dirSign: number): number => {
      if (!fpBlocked) return 0
      const lat = Math.max(0.5, halfW - 0.4)
      let d = sNode < 1 ? Math.max(corners.endTrim[0], endDisc[0]) : sNode > roadLength - 1 ? Math.max(corners.endTrim[1], endDisc[1]) : 0
      while (d < 40) {
        const s = sNode + dirSign * d
        if (s < 0 || s > roadLength) break
        const p = pointAtArc(s)
        const nx = -p.dz; const nz = p.dx
        if (!fpBlocked(p.x, p.z, s) && !fpBlocked(p.x + nx * lat, p.z + nz * lat, s) && !fpBlocked(p.x - nx * lat, p.z - nz * lat, s)) break
        d += 0.25
      }
      return d
    }
    /** `forward`: direction of the traffic that stops at this crossing (stop line & pole side). */
    const addPlacement = (s: number, forward: boolean, signals: boolean, markings: boolean, stopLine: boolean): void => {
      if ((s < ZEBRA_HALF + 0.2 && !open[0]) || (s > roadLength - ZEBRA_HALF - 0.2 && !open[1])) return
      if (s < -ZEBRA_HALF || s > roadLength + ZEBRA_HALF) return
      const p = pointAtArc(s)
      crossingPlacements.push({
        x: p.x, y: p.y, z: p.z,
        dx: forward ? p.dx : -p.dx, dz: forward ? p.dz : -p.dz,
        arc: s, signals, markings, stopLine,
      })
    }
    const crossingIsDrawn = (c: CrossingRec): boolean => {
      const m = c.markings
      const no = m === 'no' || m === 'unmarked' || m === 'informal'
      return c.signals || (m !== undefined && !no)
    }

    if (isUrbanStreet && realCrossings.length > 0 && roadLength >= 8) {
      for (const c of realCrossings) {
        const m = c.markings
        const noMarkings = m === 'no' || m === 'unmarked' || m === 'informal'
        const drawMarkings = m === undefined ? c.signals : !noMarkings
        if (!drawMarkings && !c.signals) continue

        // Snap the node to the nearest point of the way polyline
        let bestArc = 0
        let bestD = Infinity
        for (let i = 0; i < smoothPts.length - 1; i++) {
          const a = smoothPts[i]!; const b = smoothPts[i + 1]!
          const sdx = b.x - a.x; const sdz = b.z - a.z
          const lenSq = sdx * sdx + sdz * sdz
          if (lenSq < 1e-6) continue
          let t = ((c.position.x - a.x) * sdx + (c.position.z - a.z) * sdz) / lenSq
          t = Math.max(0, Math.min(1, t))
          const d = Math.hypot(c.position.x - (a.x + sdx * t), c.position.z - (a.z + sdz * t))
          if (d < bestD) { bestD = d; bestArc = arcTable[i]! + Math.sqrt(lenSq) * t }
        }
        if (bestD > 6) continue

        // Nodes beyond a chunk cut belong to the neighbouring portion of the way
        if ((open[0] && bestArc < 0.05) || (open[1] && bestArc > roadLength - 0.05)) continue
        const atStart = bestArc < 1.5 && !open[0]
        const atEnd = bestArc > roadLength - 1.5 && !open[1]
        // A bare traffic-signal node (no crossing tag) only means a crossing where no tagged
        // crossing of this way sits close to it; the signal itself stays (stop line, pole).
        let markingsHere = drawMarkings
        if (m === undefined && realCrossings.some((oc) => oc !== c && oc.markings !== undefined &&
          Math.hypot(oc.position.x - c.position.x, oc.position.z - c.position.z) < 20)) markingsHere = false
        if (atStart || atEnd) {
          const je = junction.ends[atStart ? 0 : 1]
          const partner = je.partner && je.partner !== road ? je.partner : null
          // A bare signal on a way end that meets no other street is a junction whose other
          // ways are not in this chunk's context: leave it to the builds that see the junction.
          // A tagged crossing at an end that meets nothing at all is left out likewise.
          if (m === undefined && !je.isJunction) continue
          if (!je.isJunction && !partner) continue
          // The crossing itself is mapped a few metres into this way: that node represents it
          if (realCrossings.some((oc) => oc !== c && crossingIsDrawn(oc) && (() => {
            const d = Math.hypot(oc.position.x - je.node.x, oc.position.z - je.node.z)
            return d > 1.5 && d < 8
          })())) continue
          if (partner) {
            // Way split at the crossing node: drawn once, by the way whose traffic ends on it
            if (partner.crossings?.some((oc) => oc.nodeId === c.nodeId)) {
              const pEnd = partner.points[partner.points.length - 1]!
              const pEndsHere = Math.hypot(pEnd.x - je.node.x, pEnd.z - je.node.z) < 0.8
              const myScore = atEnd ? (road.oneway ? 2 : 1) : 0
              const pScore = pEndsHere ? (partner.oneway ? 2 : 1) : 0
              if (pScore > myScore || (pScore === myScore && idBefore(partner.id, road.id))) continue
            }
            // The partner carries the crossing a few metres behind the node: that one represents it
            if (partner.crossings?.some((oc) => oc.nodeId !== c.nodeId && crossingIsDrawn(oc) && (() => {
              const d = Math.hypot(oc.position.x - je.node.x, oc.position.z - je.node.z)
              return d > 1.5 && d < 8
            })())) continue
          }
          if (!je.isJunction) {
            // Plain split or dead end: the crossing sits on the node itself
            const s = atStart ? ZEBRA_HALF + 0.3 : roadLength - ZEBRA_HALF - 0.3
            addPlacement(s, true, c.signals, markingsHere, c.signals)
            if (c.signals && !road.oneway) addPlacement(s, false, true, false, true)
            continue
          }
          // Junction node at this way's end: the crossing goes on the arm, clear of the box.
          // Traffic enters the node on two-way arms and on one-way arms ending there; a one-way
          // arm starting at the node only gets the exit-side zebra (no stop line, no pole).
          const extent = extentFrom(atStart ? 0 : roadLength, atStart ? 1 : -1)
          const s = atStart ? extent + ZEBRA_HALF + 1.0 : roadLength - extent - ZEBRA_HALF - 1.0
          const approaches = atEnd || !road.oneway
          addPlacement(s, atEnd || !!road.oneway, c.signals, markingsHere, c.signals && approaches)
          continue
        }

        // Node inside the way: junction (other ways end here) or mid-block crossing
        const nodeIsJunction = junction.others.some((r) => {
          const s0 = r.points[0]!; const s1 = r.points[r.points.length - 1]!
          return Math.hypot(s0.x - c.position.x, s0.z - c.position.z) < 0.8 || Math.hypot(s1.x - c.position.x, s1.z - c.position.z) < 0.8
        })
        if (!nodeIsJunction) {
          const s = Math.max(open[0] ? -Infinity : ZEBRA_HALF + 0.3, Math.min(open[1] ? Infinity : roadLength - ZEBRA_HALF - 0.3, bestArc))
          addPlacement(s, true, c.signals, drawMarkings, c.signals)
          if (c.signals && !road.oneway) addPlacement(s, false, true, false, true)
        } else {
          // One crossing on each side of the junction box
          const before = extentFrom(bestArc, -1)
          const after = extentFrom(bestArc, 1)
          addPlacement(bestArc - before - ZEBRA_HALF - 1.0, true, c.signals, markingsHere, c.signals)
          addPlacement(bestArc + after + ZEBRA_HALF + 1.0, !!road.oneway, c.signals, markingsHere, c.signals && !road.oneway)
        }
      }
    } else if (isUrbanStreet && realCrossings.length === 0 && roadLength >= 60 && !open[0] &&
      (hw === 'primary' || hw === 'secondary' || hw === 'tertiary') &&
      !(allRoads && allRoads.some((r) => r.crossings && r.crossings.length > 0))) {
      // Area without any crossing data at all: one heuristic crossing near the start of major roads
      const extent = extentFrom(0, 1)
      const s = Math.max(extent + ZEBRA_HALF + 1.0, Math.min(14, roadLength * 0.35))
      const signals = junction.ends[0].isJunction
      addPlacement(s, !!road.oneway, signals, true, signals && !road.oneway)
    }

    // Merge placements closer than 4 m for the same traffic direction
    crossingPlacements.sort((a, b) => a.arc - b.arc)
    for (let i = crossingPlacements.length - 1; i > 0; i--) {
      const a = crossingPlacements[i - 1]!
      const b = crossingPlacements[i]!
      if (b.arc - a.arc < 4 && a.dx * b.dx + a.dz * b.dz > 0) {
        a.signals = a.signals || b.signals
        a.markings = a.markings || b.markings
        a.stopLine = a.stopLine || b.stopLine
        crossingPlacements.splice(i, 1)
      }
    }

    // ── 9b. Roadside parking (bays + parked cars, only on urban streets) ──────
    if (isUrbanStreet && road.parkingLane && road.parkingLane !== 'none' && roadLength >= 15) {
      if (road.parkingLane === 'both' || road.parkingLane === 'right') {
        const baysR = buildParkingBays(raisedPts, normals, halfW, 'right', roadLength, blockedAt(1.0, false, 'right'), arcOffset)
        if (baysR) group.add(baysR)
      }
      if (road.parkingLane === 'both' || road.parkingLane === 'left') {
        const baysL = buildParkingBays(raisedPts, normals, halfW, 'left', roadLength, blockedAt(1.0, false, 'left'), arcOffset)
        if (baysL) group.add(baysL)
      }

      // Parked cars (one InstancedMesh, visual only): 'right' = +normal, 'left' = −normal
      const sideFree = (side: 'left' | 'right'): boolean =>
        side === 'right' ? !cycleRight && !busLane : !cycleLeft
      const carSides: number[] = []
      if ((road.parkingLane === 'both' || road.parkingLane === 'right') && sideFree('right')) carSides.push(1)
      if ((road.parkingLane === 'both' || road.parkingLane === 'left') && sideFree('left')) carSides.push(-1)
      // Keep a drivable lane: no cars on roads narrower than 5.4 m, one side only under 7.4 m
      if (roadW < 5.4) carSides.length = 0
      else if (carSides.length === 2 && roadW < 7.4) carSides.length = 1
      if (carSides.length > 0) {
        const cars = buildParkedCars({
          roadId: road.id,
          points: smoothPts,
          halfW,
          sides: carSides,
          crossingArcs: crossingPlacements.map((c) => c.arc),
          oneway: road.oneway ?? false,
          isOnOtherRoad: (x, z) => junction.others.length > 0 && isPointInRoadAsphalt(x, z, getObstacles(), 2.6),
        })
        if (cars) group.add(cars)
      }
    }

    // ── 9c. Draw the crossings: zebra, stop line + signal pole (kerb side, facing traffic)
    const poleBlocked = blockedAt(0.5)
    for (const cp of crossingPlacements) {
      const dir = { dx: cp.dx, dz: cp.dz }
      const norm = { nx: -cp.dz, nz: cp.dx }

      if (cp.markings) {
        const crosswalk = buildCrosswalk(cp, dir, halfW)
        if (crosswalk) {
          crosswalk.renderOrder = 4
          crosswalk.userData['crossing'] = { arc: cp.arc, x: cp.x, z: cp.z, signals: cp.signals, stopLine: cp.stopLine }
          group.add(crosswalk)
        }
      }

      if (cp.signals && cp.stopLine) {
        // Stop line 2.5m before the crossing on the approach lanes (whole width on one-way streets)
        const stopPt = { x: cp.x - dir.dx * 2.5, y: cp.y, z: cp.z - dir.dz * 2.5 }
        const stopLine = buildStopLine(stopPt, dir, halfW, !!road.oneway || isLink)
        if (stopLine) { stopLine.renderOrder = 4; group.add(stopLine) }

        // One 3D traffic-light pole per crossing on the right-hand kerb, arm over the road
        const px = cp.x + norm.nx * (halfW + 0.8)
        const pz = cp.z + norm.nz * (halfW + 0.8)
        if (!poleBlocked || !poleBlocked(px, pz, cp.arc)) {
          const signalPole = getTrafficLightTemplate().clone()
          signalPole.position.set(px, cp.y, pz)
          signalPole.rotation.y = Math.atan2(dir.dx, dir.dz) + Math.PI / 2
          group.add(signalPole)
        }
      }
    }

    // Directional arrows painted flat on asphalt (never inside a junction box)
    if (!isLink && roadLength >= 35) {
      const arrowBlocked = blockedAt(1.0)
      // Nominal spot at 65 % of the way; slide it clear of any zebra / stop line
      // (arrow ≈ 5 m long + stop line 2 m before the stripes).
      const ARROW_CLEAR = ZEBRA_HALF + 4.5
      const clearOfCrossings = (s: number): boolean =>
        crossingPlacements.every((cp) => Math.abs(s - cp.arc) >= ARROW_CLEAR)
      let sArrow = roadLength * 0.65
      if (!clearOfCrossings(sArrow)) {
        const candidates = [0.5, 0.8, 0.35, 0.9, 0.25].map((f) => roadLength * f)
        sArrow = candidates.find((s) => clearOfCrossings(s)) ?? -1
      }
      if (sArrow < 0) sArrow = Number.NaN
      const p = pointAtArc(Number.isNaN(sArrow) ? 0 : sArrow)
      const norm = { nx: -p.dz, nz: p.dx }
      const putArrow = (lat: number, forward: boolean): void => {
        if (Number.isNaN(sArrow)) return // no spot clear of crossings on this way
        const pt = { x: p.x + norm.nx * lat, y: p.y, z: p.z + norm.nz * lat }
        if (arrowBlocked && arrowBlocked(pt.x, pt.z, sArrow)) return
        group.add(buildRoadArrow(pt, forward ? { dx: p.dx, dz: p.dz } : { dx: -p.dx, dz: -p.dz }))
      }
      if (road.oneway) {
        // One-way street: all car lanes point forward
        for (let l = 0; l < carLanes; l++) putArrow(carMinus + (l + 0.5) * laneW, true)
      } else if (lanes >= 4) {
        // Two-way avenue: right forward, left reverse
        putArrow(carCenter + carW / 4, true)
        putArrow(carCenter - carW / 4, false)
      }
    }

    // ── 10. Procedural street lamps along the sidewalk (skipped when the chunk has real OSM lamp nodes) ──
    if (opts?.syntheticLamps !== false && swMode !== 'none' && !isHighway && !isLink && (road.lit || isUrbanStreet) && roadLength >= 35) {
      const lampTmpl = getStreetLampTemplate()
      const lampBlocked = blockedAt(1.0)
      const lampSpacing = 32
      const numLamps = Math.min(8, Math.max(1, Math.floor(roadLength / lampSpacing)))
      for (let k = 1; k <= numLamps; k++) {
        const sLamp = k * (roadLength / (numLamps + 1))
        const p = pointAtArc(sLamp)
        const nx = -p.dz; const nz = p.dx
        const lampSide = k % 2 === 0 ? 1 : -1
        if (lampSide > 0 ? swMode === 'left' : swMode === 'right') continue
        const lx = p.x + nx * (halfW + 0.8) * lampSide
        const lz = p.z + nz * (halfW + 0.8) * lampSide
        if (lampBlocked && lampBlocked(lx, lz, sLamp)) continue
        if (inTrim(lampSide > 0 ? 'right' : 'left', sLamp)) continue
        const lamp = lampTmpl.clone()
        lamp.position.set(lx, p.y, lz)
        lamp.rotation.y = Math.atan2(p.dx, p.dz) + (lampSide > 0 ? Math.PI / 2 : -Math.PI / 2)
        group.add(lamp)
      }
    }

    return group
  }
}

// ── Junction helpers for ground roads ────────────────────────────────────────

/** Arms that stop short of the through road they land on are extended to its centre-line. */
function extendArmEnds(pts: Pt[], junction: JunctionInfo): Pt[] {
  let out = pts
  for (const e of [0, 1] as const) {
    const je = junction.ends[e]
    if (!je.landsOn || je.partner) continue
    const N = e === 0 ? out[0]! : out[out.length - 1]!
    const q = distToWay(je.landsOn, N.x, N.z)
    if (q.d < 0.3 || q.d > computeRoadWidth(je.landsOn).halfW + 1.0) continue
    const p = { x: q.x, y: N.y, z: q.z }
    out = e === 0 ? [p, ...out] : [...out, p]
  }
  return out
}

/** Mitered joint normals shared with the continuation ways at the extremities (no wedge at bends). */
function continuationEndNormals(pts: Pt[], junction: JunctionInfo): EndNormals | undefined {
  const n = pts.length
  if (n < 2) return undefined
  const res: EndNormals = {}
  const s = junction.ends[0]
  if (s.partnerOut) {
    const d2 = unitBetween(pts[0]!, pts[1]!)
    res.start = jointNormal(-s.partnerOut.x, -s.partnerOut.z, d2.x, d2.z)
  }
  const e = junction.ends[1]
  if (e.partnerOut) {
    const d1 = unitBetween(pts[n - 2]!, pts[n - 1]!)
    res.end = jointNormal(d1.x, d1.z, e.partnerOut.x, e.partnerOut.z)
  }
  return res.start || res.end ? res : undefined
}

/**
 * The square cut of an arm's asphalt at the node can poke past the far edge of the road it
 * lands on (wide arm, narrow road, oblique angle): pull such end vertices back along the arm
 * until they sit on the through road's asphalt.
 */
function clampArmEndPoke(mesh: THREE.Mesh, pts: Pt[], junction: JunctionInfo, obstacles: RoadObstacleSeg[], skip: [boolean, boolean]): void {
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

// ── Junction corners (kerb fillets) & arm asphalt ends ───────────────────────

type CornerArm = {
  road: Road
  ox: number
  oz: number
  halfW: number
  mat: THREE.Material
  swWidth: number
  /** Sidewalk on the +perp(o) / −perp(o) side of the outward tangent o. */
  swPlus: boolean
  swMinus: boolean
  /** This road's own arm: arc of the node on its centre-line, o = dirSign · way direction. */
  mine: { arc: number; dirSign: 1 | -1 } | null
}

/** Blocked arc interval of one way side at a junction corner. */
export type TrimSeg = {
  a0: number
  a1: number
  /** Half corner against a way without sidewalk: a short band ending here is an orphan stub. */
  weak: boolean
  /** Corner meshes that only make sense with the band leading to this trim. */
  meshes: THREE.Object3D[]
}
type SideTrims = { left: TrimSeg[]; right: TrimSeg[] }

export type JunctionCorners = {
  /** Blocked arc intervals per way side (sidewalk, gutter, edge line, painted lanes stop there). */
  trims: SideTrims
  /** Fillet meshes (walkway, kerb bevel, asphalt corner patch) owned by this road. */
  meshes: THREE.Object3D[]
  /** Longest trim measured from each extremity (crossings are placed beyond it). */
  endTrim: [number, number]
}

function hasSidewalkSide(r: Road, side: 'left' | 'right'): boolean {
  if (elevClass(r) !== 0) return false
  const mode = r.sidewalkMode ?? (isUrbanWay(r) ? 'both' : 'none')
  return mode === 'both' || mode === side
}

/** Arm of way r whose extremity `end` sits on the node (outward tangent, sidewalk sides in the o frame). */
function cornerArmOf(r: Road, end: 0 | 1, mine: CornerArm['mine']): CornerArm {
  const o = outwardTangent(r, end)
  // end 0: o = way direction → +perp(o) = right; end 1: o = −direction → +perp(o) = left
  const plusSide: 'left' | 'right' = end === 0 ? 'right' : 'left'
  const minusSide: 'left' | 'right' = end === 0 ? 'left' : 'right'
  return {
    road: r, ox: o.x, oz: o.z,
    halfW: computeRoadWidth(r).halfW,
    mat: getAsphaltMaterial(r.highway, r.surface),
    swWidth: sidewalkWidthOf(r),
    swPlus: hasSidewalkSide(r, plusSide),
    swMinus: hasSidewalkSide(r, minusSide),
    mine,
  }
}

/** The two virtual arms of a way passing through a node (direction d at the node). */
function throughArmsOf(r: Road, dx: number, dz: number, arc: number, own: boolean): CornerArm[] {
  const halfW = computeRoadWidth(r).halfW
  const mat = getAsphaltMaterial(r.highway, r.surface)
  const swWidth = sidewalkWidthOf(r)
  const right = hasSidewalkSide(r, 'right')
  const left = hasSidewalkSide(r, 'left')
  return [
    { road: r, ox: dx, oz: dz, halfW, mat, swWidth, swPlus: right, swMinus: left, mine: own ? { arc, dirSign: 1 } : null },
    { road: r, ox: -dx, oz: -dz, halfW, mat, swWidth, swPlus: left, swMinus: right, mine: own ? { arc, dirSign: -1 } : null },
  ]
}

/** Intersection of lines P + a·t and Q + b·u; null when parallel. */
function lineIntersect(P: Vec2, a: Vec2, Q: Vec2, b: Vec2): { t: number; u: number; x: number; z: number } | null {
  const det = a.x * (-b.z) - (-b.x) * a.z
  if (Math.abs(det) < 1e-6) return null
  const rx = Q.x - P.x
  const rz = Q.z - P.z
  const t = (rx * (-b.z) - (-b.x) * rz) / det
  const u = (a.x * rz - a.z * rx) / det
  return { t, u, x: P.x + a.x * t, z: P.z + a.z * t }
}

/**
 * Kerb fillets between adjacent arms of every junction this road takes part in.
 * Each corner (arm A → next arm B counter-clockwise) is owned by A: A draws the rounded
 * walkway, its kerb bevel and the asphalt patch under the old sharp corner; both arms cut
 * their sidewalk / gutter / edge line / painted lanes at the tangent points.
 */
function buildJunctionCorners(
  road: Road,
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
  /** True when a corner point lies on the asphalt of a way other than the two arms of the corner. */
  const onThirdWay = (pts: Vec2[], a: Road, b: Road): boolean => {
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

  // Extremities that are junctions
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
      const q = distToWay(r, N.x, N.z)
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

  // Interior nodes: extremities of other ways landing on this road
  type Landing = { arc: number; road: Road; end: 0 | 1 }
  const landings: Landing[] = []
  for (const r of junction.others) {
    for (const end of [0, 1] as const) {
      // The continuation node itself is an extremity (arc 0 / L): never a landing
      if (junction.partnerIds.has(r.id) && (junction.ends[0].partner === r || junction.ends[1].partner === r) &&
        [0, 1].some((e) => Math.hypot(endPoint(r, end).x - junction.ends[e]!.node.x, endPoint(r, end).z - junction.ends[e]!.node.z) < 0.8)) continue
      const p = endPoint(r, end)
      const q = distToWay(road, p.x, p.z)
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
      const pA: Vec2 = { x: -A.oz, z: A.ox } // +perp(oA): towards the corner
      const pB: Vec2 = { x: -B.oz, z: B.ox } // corner is on B's −perp side

      // Reflex outer corner between the last and first arm: fill the asphalt wedge left by the square cuts
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
        // Half corner: only one arm has a sidewalk on the corner side. Its band ends flush
        // against the other arm's kerb line: a walkway fill between the band end, the
        // sidewalk's own lines and that kerb line, plus a kerb bevel along it.
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
        // No fill where a third way's asphalt covers the corner (interchanges, merge areas)
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

      // Kerb-top lines of both arms and their intersection (the sharp corner)
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

      // Sidewalk / side-feature trims for the arms of this road
      if (A.mine) addTrim(A, A.mine.dirSign > 0 ? 'right' : 'left', alongA)
      if (B.mine) addTrim(B, B.mine.dirSign > 0 ? 'left' : 'right', alongB)
      if (!A.mine) continue

      // ── Fillet meshes (owner = A) ──
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
      // No fillet where a third way's asphalt covers the corner (the bands are cut there anyway)
      const AOut: Vec2 = { x: TA.x + pA.x * A.swWidth, z: TA.z + pA.z * A.swWidth }
      const BOut: Vec2 = { x: TB.x - pB.x * B.swWidth, z: TB.z - pB.z * B.swWidth }
      if (onThirdWay([TA, TB, AOut, BOut, arcPt(Math.floor(segs / 2), R), arcPt(Math.floor(segs / 2), R + CURB_WIDTH)], A.road, B.road)) continue

      // Walkway: quad between the two band ends + circular segment between the chord and the arc
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

      // Kerb bevel ring along the arc (kerb top at R, gutter at R + CURB_WIDTH)
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

      // Asphalt patch under the old sharp corner (between the gutter arc and the asphalt edges)
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

/**
 * Asphalt geometry of an arm: instead of running to the through road's centre-line with a
 * square cut, the ribbon ends on the through road's asphalt edge (8 cm inside it) along a
 * trapezoid whose corners are the intersections of the arm's edges with that edge line.
 * Returns the (possibly truncated) points and their normals for the asphalt strip only.
 */
function armAsphaltGeometry(
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
    // Asphalt of every other way passing the node (a through road split at the node has two ways)
    const segs = obstacles.filter((o) => {
      if (o.roadId === T.id) return true
      let t = ((N.x - o.x1) * o.dx + (N.z - o.z1) * o.dz) / o.lenSq
      t = Math.max(0, Math.min(1, t))
      return Math.hypot(N.x - (o.x1 + o.dx * t), N.z - (o.z1 + o.dz * t)) < 1.0
    })
    if (segs.length === 0) continue
    const q = distToWay(T, N.x, N.z)
    // Direction of the through road at the landing point
    let i = 0
    let acc = 0
    for (; i < T.points.length - 2; i++) {
      const segL = Math.hypot(T.points[i + 1]!.x - T.points[i]!.x, T.points[i + 1]!.z - T.points[i]!.z)
      if (acc + segL >= q.arc) break
      acc += segL
    }
    const dT = unitBetween(T.points[i]!, T.points[i + 1]!)
    const hT = computeRoadWidth(T).halfW
    const d = e === 0 ? unitBetween(work[0]!, work[1]!) : unitBetween(work[n - 2]!, work[n - 1]!)
    const sinTheta = Math.abs(d.x * dT.z - d.z * dT.x)
    if (sinTheta < 0.42) continue
    const armDir: Vec2 = e === 0 ? d : { x: -d.x, z: -d.z } // from the node into the arm
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

    // Arc table of the working polyline
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
