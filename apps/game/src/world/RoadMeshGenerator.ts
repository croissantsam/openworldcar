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
const PEDESTRIAN_ROAD_MAT = new THREE.MeshStandardMaterial({
  color: 0xc8c4bc,
  map: createSidewalkTileTexture(),
  roughness: 0.86,
  metalness: 0.04,
  side: THREE.DoubleSide,
  polygonOffset: true, polygonOffsetFactor: -2.0, polygonOffsetUnits: -2.0,
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

export interface PolylineNormal {
  nx: number
  nz: number
  miter: number
}

/**
 * Computes smoothed vertex normals and miter join factors along a 3D polyline.
 * Ensures that extruded ribbons (road asphalt, curbs, sidewalks, markings) maintain
 * perfectly constant lateral width across all turns without thinning or pinching.
 */
export function computePolylineNormals(points: { x: number; y: number; z: number }[]): PolylineNormal[] {
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
      const dx = segDx[0]!
      const dz = segDz[0]!
      normals.push({ nx: -dz, nz: dx, miter: 1.0 })
    } else if (i === N - 1) {
      const dx = segDx[N - 2]!
      const dz = segDz[N - 2]!
      normals.push({ nx: -dz, nz: dx, miter: 1.0 })
    } else {
      const dx1 = segDx[i - 1]!
      const dz1 = segDz[i - 1]!
      const dx2 = segDx[i]!
      const dz2 = segDz[i]!

      const n1x = -dz1
      const n1z = dx1
      const n2x = -dz2
      const n2z = dx2

      const bx = n1x + n2x
      const bz = n1z + n2z
      const bLen = Math.hypot(bx, bz)

      if (bLen > 1e-4) {
        const nx = bx / bLen
        const nz = bz / bLen
        const cosHalf = n1x * nx + n1z * nz
        // Clamp miter scale to [0.7, 1.42] to avoid acute hairpin spikes while maintaining width
        const miter = cosHalf > 0.38 ? Math.min(1.42, 1.0 / cosHalf) : 1.42
        normals.push({ nx, nz, miter })
      } else {
        normals.push({ nx: n1x, nz: n1z, miter: 1.0 })
      }
    }
  }

  return normals
}

/**
 * Builds a ribbon mesh (e.g. road surface, edge lines, tire tracks) with miter joins.
 */
function buildRibbon(
  points: { x: number; y: number; z: number }[],
  halfW: number,
  yOffset: number,
  material: THREE.Material,
): THREE.Mesh | null {
  if (points.length < 2) return null
  const normals = computePolylineNormals(points)
  const vertices: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  let totalLen = 0

  for (let i = 0; i < points.length; i++) {
    const curr = points[i]!
    const norm = normals[i]!
    const effHalfW = halfW * norm.miter

    vertices.push(
      curr.x + norm.nx * effHalfW, curr.y + yOffset, curr.z + norm.nz * effHalfW,
      curr.x - norm.nx * effHalfW, curr.y + yOffset, curr.z - norm.nz * effHalfW,
    )

    if (i > 0) {
      totalLen += Math.hypot(curr.x - points[i - 1]!.x, curr.z - points[i - 1]!.z)
    }
    const u = totalLen / (halfW * 2 * 4)
    uvs.push(0, u, 1, u)

    if (i < points.length - 1) {
      const b = i * 2
      indices.push(b, b + 2, b + 1, b + 1, b + 2, b + 3)
    }
  }

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
 * Shift ribbon vertices laterally by `offset` metres along polyline miter perpendicular.
 */
function shiftRibbonLateral(
  mesh: THREE.Mesh,
  pts: { x: number; y: number; z: number }[],
  offset: number,
): void {
  const pos = mesh.geometry.attributes['position'] as THREE.BufferAttribute
  if (!pos) return
  const arr = pos.array as Float32Array
  const normals = computePolylineNormals(pts)

  for (let i = 0; i < pts.length && i < normals.length; i++) {
    const norm = normals[i]!
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

export interface RoadObstacleSeg {
  x1: number; z1: number; x2: number; z2: number
  dx: number; dz: number; lenSq: number; halfW: number
  minX: number; maxX: number; minZ: number; maxZ: number
}

export function buildRoadObstacles(roads?: Road[], currentRoad?: Road | string): RoadObstacleSeg[] {
  if (!roads || roads.length === 0) return []
  const currentRoadId = typeof currentRoad === 'string' ? currentRoad : currentRoad?.id
  const currentRoadObj = typeof currentRoad === 'object' ? currentRoad : roads.find((r) => r.id === currentRoadId)
  const currentName = currentRoadObj?.name?.trim().toLowerCase()
  const cStart = currentRoadObj?.points[0]
  const cEnd = currentRoadObj?.points[currentRoadObj.points.length - 1]

  const obs: RoadObstacleSeg[] = []
  for (const r of roads) {
    if (r.id === currentRoadId) continue
    if (r.highway === 'path' || r.highway === 'footway' || r.highway === 'cycleway' || r.highway === 'track') continue

    // If both segments belong to the same named street, don't cut the sidewalk between them
    if (currentName && r.name && r.name.trim().toLowerCase() === currentName) {
      continue
    }

    // If roads connect end-to-end in a continuous way chain, do not treat as an obstacle
    if (cStart && cEnd && r.points.length >= 2) {
      const rStart = r.points[0]!
      const rEnd = r.points[r.points.length - 1]!
      const touchesStart = Math.hypot(cStart.x - rStart.x, cStart.z - rStart.z) < 0.6 || Math.hypot(cStart.x - rEnd.x, cStart.z - rEnd.z) < 0.6
      const touchesEnd = Math.hypot(cEnd.x - rStart.x, cEnd.z - rStart.z) < 0.6 || Math.hypot(cEnd.x - rEnd.x, cEnd.z - rEnd.z) < 0.6
      if (touchesStart || touchesEnd) {
        if (r.highway === currentRoadObj?.highway && r.bridge === currentRoadObj?.bridge && r.tunnel === currentRoadObj?.tunnel) {
          continue
        }
      }
    }

    const isLink = r.isLink ?? false
    const isMajor = (r.highway === 'primary' || r.highway === 'motorway' || r.highway === 'trunk') && !isLink
    let lanes = r.lanes
    if (isLink || r.oneway) lanes = Math.max(1, r.lanes || 1)
    else if (isMajor) lanes = Math.max(4, r.lanes)
    else lanes = Math.max(2, r.lanes)

    let rWidth: number
    if (r.explicitWidth && r.explicitWidth > 0) rWidth = r.explicitWidth
    else if (isLink) rWidth = lanes === 1 ? 4.8 : 6.4
    else if (r.highway === 'service') rWidth = lanes === 1 ? 3.8 : 5.4
    else if (r.oneway && lanes === 1) rWidth = 4.6
    else rWidth = lanes * LANE_WIDTH

    const halfW = rWidth / 2
    const pts = r.points
    for (let i = 0; i < pts.length - 1; i++) {
      const p1 = pts[i]!
      const p2 = pts[i + 1]!
      const dx = p2.x - p1.x
      const dz = p2.z - p1.z
      const lenSq = dx * dx + dz * dz
      if (lenSq < 1e-4) continue
      obs.push({
        x1: p1.x, z1: p1.z,
        x2: p2.x, z2: p2.z,
        dx, dz, lenSq,
        halfW,
        minX: Math.min(p1.x, p2.x),
        maxX: Math.max(p1.x, p2.x),
        minZ: Math.min(p1.z, p2.z),
        maxZ: Math.max(p1.z, p2.z),
      })
    }
  }
  return obs
}

function isPointInRoadAsphalt(px: number, pz: number, obs: RoadObstacleSeg[], margin = 0.20): boolean {
  for (let i = 0; i < obs.length; i++) {
    const ob = obs[i]!
    const r = ob.halfW + margin
    if (px < ob.minX - r || px > ob.maxX + r || pz < ob.minZ - r || pz > ob.maxZ + r) continue
    let t = ((px - ob.x1) * ob.dx + (pz - ob.z1) * ob.dz) / ob.lenSq
    t = Math.max(0, Math.min(1, t))
    const projX = ob.x1 + t * ob.dx
    const projZ = ob.z1 + t * ob.dz
    if ((px - projX) ** 2 + (pz - projZ) ** 2 < r * r) return true
  }
  return false
}

interface SidewalkSlice {
  blocked: boolean
  gX: number; gY: number; gZ: number
  cX: number; cY: number; cZ: number
  wX: number; wY: number; wZ: number
  dX: number; dY: number; dZ: number
  dist: number
}

/**
 * Builds clean, beveled curbs & raised sidewalks on left or right with miter normals.
 * The road sits at y = 0.028.
 * The curb rises from y = 0.028 to y = 0.14 (stone curb).
 * The sidewalk surface extends outward at y = 0.14 up to 7.5m to reach building facades.
 */
function buildCleanSidewalk(
  rawPts: { x: number; y: number; z: number }[],
  roadHalfW: number,
  sidewalkW: number,
  side: 'left' | 'right',
  obstacles: RoadObstacleSeg[],
): THREE.Group {
  const group = new THREE.Group()
  if (rawPts.length < 2) return group

  const pts = resamplePolyline(rawPts, 1.8)
  const normals = computePolylineNormals(pts)
  const sign = side === 'left' ? 1 : -1
  const curbBevelW = CURB_WIDTH

  const slices: SidewalkSlice[] = []
  let totalDist = 0

  for (let i = 0; i < pts.length; i++) {
    const curr = pts[i]!
    const norm = normals[i]!
    const nx = norm.nx * sign
    const nz = norm.nz * sign
    const miter = norm.miter

    if (i > 0) totalDist += Math.hypot(curr.x - pts[i - 1]!.x, curr.z - pts[i - 1]!.z)

    // 1. Gutter: where road meets curb bottom
    const gX = curr.x + nx * (roadHalfW * miter)
    const gY = curr.y + 0.028
    const gZ = curr.z + nz * (roadHalfW * miter)

    // 2. Curb top outer corner (elevated 14cm)
    const cX = curr.x + nx * ((roadHalfW + curbBevelW) * miter)
    const cY = curr.y + SIDEWALK_HEIGHT
    const cZ = curr.z + nz * ((roadHalfW + curbBevelW) * miter)

    // Check if curb itself is inside an intersecting street's asphalt
    let blocked = false
    if (obstacles.length > 0) {
      if (isPointInRoadAsphalt(cX, cZ, obstacles, 0.20) || isPointInRoadAsphalt(gX, gZ, obstacles, 0.20)) {
        blocked = true
      }
    }

    // 3. Sidewalk outer walkway edge (clamped so outer edge doesn't poke into intersecting roads)
    let effW = sidewalkW
    if (!blocked && obstacles.length > 0) {
      while (effW > 1.2 && isPointInRoadAsphalt(curr.x + nx * ((roadHalfW + curbBevelW + effW) * miter), curr.z + nz * ((roadHalfW + curbBevelW + effW) * miter), obstacles, 0.20)) {
        effW -= 0.8
      }
    }

    const wX = curr.x + nx * ((roadHalfW + curbBevelW + effW) * miter)
    const wY = curr.y + SIDEWALK_HEIGHT
    const wZ = curr.z + nz * ((roadHalfW + curbBevelW + effW) * miter)

    // 4. Skirt bottom (drops to foundation)
    const dX = wX
    const dY = curr.y - 0.05
    const dZ = wZ

    slices.push({
      blocked,
      gX, gY, gZ,
      cX, cY, cZ,
      wX, wY, wZ,
      dX, dY, dZ,
      dist: totalDist,
    })
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

  // Connect consecutive unblocked slices
  for (let i = 0; i < slices.length - 1; i++) {
    const s1 = slices[i]!
    const s2 = slices[i + 1]!

    if (s1.blocked && !s2.blocked) {
      addEndCap(s2, true)
    } else if (!s1.blocked && s2.blocked) {
      addEndCap(s1, false)
    }

    if (s1.blocked || s2.blocked) {
      continue
    }

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
    const v1 = s1.dist / 3.0
    const v2 = s2.dist / 3.0
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

  // End cap at road extremities if unblocked
  if (slices.length > 1) {
    if (!slices[0]!.blocked && !slices[1]!.blocked) addEndCap(slices[0]!, true)
    const last = slices.length - 1
    if (!slices[last]!.blocked && !slices[last - 1]!.blocked) addEndCap(slices[last]!, false)
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
 * Builds dashed lines along a polyline.
 */
function buildDashedLine(
  points: { x: number; y: number; z: number }[],
  lateralOffset: number,
  halfMarkW: number,
  yOffset: number,
  dashLen: number,
  gapLen: number,
  material: THREE.MeshStandardMaterial,
): THREE.Mesh | null {
  if (points.length < 2) return null

  const normals = computePolylineNormals(points)
  const strip: { x: number; y: number; z: number; nx: number; nz: number }[] = []
  for (let i = 0; i < points.length; i++) {
    const norm = normals[i]!
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
      const phase = (arcLen + t) % cycleLen
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
        const base = quadIdx * 4
        vertices.push(
          pA.x + pA.nx * halfMarkW, pA.y + yOffset, pA.z + pA.nz * halfMarkW,
          pA.x - pA.nx * halfMarkW, pA.y + yOffset, pA.z - pA.nz * halfMarkW,
          pB.x + pB.nx * halfMarkW, pB.y + yOffset, pB.z + pB.nz * halfMarkW,
          pB.x - pB.nx * halfMarkW, pB.y + yOffset, pB.z - pB.nz * halfMarkW,
        )
        indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3)
        quadIdx++
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
  centerPt: { x: number; y: number; z: number },
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
  centerPt: { x: number; y: number; z: number },
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
 * Builds a continuous stop line across the approach lanes.
 */
function buildStopLine(
  centerPt: { x: number; y: number; z: number },
  dir: { dx: number; dz: number },
  roadHalfW: number,
): THREE.Mesh | null {
  const norm = { nx: -dir.dz, nz: dir.dx }
  const barThick = 0.45
  const halfThick = barThick / 2
  const span = roadHalfW - 0.4

  const cy = centerPt.y + 0.040
  const base = 0
  const vertices = [
    centerPt.x - dir.dx * halfThick, cy, centerPt.z - dir.dz * halfThick,
    centerPt.x + norm.nx * span - dir.dx * halfThick, cy, centerPt.z + norm.nz * span - dir.dz * halfThick,
    centerPt.x + dir.dx * halfThick, cy, centerPt.z + dir.dz * halfThick,
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
  pos: { x: number; y: number; z: number },
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
  pos: { x: number; y: number; z: number },
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
 * Builds white dashed roadside parking bays along the curb.
 */
function buildParkingBays(
  points: { x: number; y: number; z: number }[],
  halfW: number,
  side: 'left' | 'right',
  roadLen: number,
): THREE.Group | null {
  if (points.length < 2 || roadLen < 15) return null
  const group = new THREE.Group()
  const bayW = 2.0
  const bayL = 5.0

  const numBays = Math.min(8, Math.floor(roadLen / bayL))
  if (numBays < 1) return null

  // Outer boundary dashed line separating parking bay from driving lane
  const lineOffset = side === 'right' ? -(halfW - bayW) : (halfW - bayW)
  const pLine = buildDashedLine(points, lineOffset, 0.05, 0.040, 2.0, 2.0, WHITE_MARK)
  if (pLine) {
    pLine.renderOrder = 4
    group.add(pLine)
  }

  return group
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
  static generate(road: Road, allRoads?: Road[]): THREE.Group | null {
    const pts = road.points
    if (pts.length < 2) return null

    if (road.elevationMode === 'bridge' || road.bridge) {
      return RoadMeshGenerator.generateBridgeRoad(road, allRoads)
    }

    if (road.elevationMode === 'tunnel' || road.tunnel) {
      return RoadMeshGenerator.generateTunnelRoad(road, allRoads)
    }

    return RoadMeshGenerator.generateGroundRoad(road, allRoads)
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
      // Ground-level road surface collider at y = 0.028m (seamless connection to bridge & tunnel ramps)
      const { halfW } = computeRoadWidth(road)
      const smoothPts = resamplePolyline(pts, 1.8)
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
  static generateGroundRoad(road: Road, allRoads?: Road[]): THREE.Group | null {
    const rawPts = road.points
    if (rawPts.length < 2) return null

    // Resample polyline to ensure consistent resolution across asphalt, gutters, tire tracks, and sidewalks
    const smoothPts = resamplePolyline(rawPts, 1.8)
    const raisedPts = smoothPts

    // Highway classification
    const hw = road.highway
    const surf = road.surface
    const isHighway = hw === 'motorway' || hw === 'trunk'
    const isMajor = hw === 'primary' || isHighway
    const isLink = road.isLink ?? false
    const isUrbanStreet = !isHighway && !isLink && hw !== 'path' && hw !== 'footway' && hw !== 'cycleway' && hw !== 'steps' && hw !== 'pedestrian'

    // ── Steps — render as stacked horizontal slabs ───────────────────────────
    if (hw === 'steps') {
      const group = new THREE.Group()
      group.userData['roadId'] = road.id
      const stepW = 2.5
      const stepH = 0.16
      const stepD = 0.35
      const stepMat = new THREE.MeshStandardMaterial({ color: 0x8a867e, roughness: 0.88, metalness: 0.04 })
      let dist = 0
      for (let i = 0; i < rawPts.length - 1; i++) {
        const a = rawPts[i]!; const b = rawPts[i + 1]!
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

    const { roadW, lanes, halfW } = computeRoadWidth(road)
    const group = new THREE.Group()
    group.userData['roadId'] = road.id

    // ── 1. Road Surface (material depends on surface tag and highway type) ────
    const surface = buildRibbon(smoothPts, halfW, 0.028, getAsphaltMaterial(hw, surf))
    if (surface) {
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
      const cycleSurface = buildRibbon(raisedPts, halfW, 0.028, cyclewayMat)
      if (cycleSurface) group.add(cycleSurface)
      const cycleEdge = buildRibbon(raisedPts, 0.06, 0.038, WHITE_MARK)
      if (cycleEdge) {
        shiftRibbonLateral(cycleEdge, raisedPts, halfW - 0.1)
        group.add(cycleEdge)
      }
      return group
    }

    if (hw === 'path' || hw === 'footway') {
      return group
    }

    // ── Roundabout Central Island ────────────────────────────────────────────
    // Only generate island if the way is a closed loop (start and end touch < 3.0m)
    // Avoids generating displaced islands for multi-way roundabout arcs
    const isClosedLoop = Math.hypot(
      rawPts[0]!.x - rawPts[rawPts.length - 1]!.x,
      rawPts[0]!.z - rawPts[rawPts.length - 1]!.z,
    ) < 3.0

    if (road.isRoundabout && rawPts.length >= 4 && isClosedLoop) {
      let sumX = 0, sumZ = 0
      for (const p of rawPts) { sumX += p.x; sumZ += p.z }
      const cX = sumX / rawPts.length
      const cZ = sumZ / rawPts.length

      let avgR = 0
      for (const p of rawPts) {
        avgR += Math.hypot(p.x - cX, p.z - cZ)
      }
      avgR /= rawPts.length

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

    // Pedestrian streets: paved but no car markings, with sidewalks
    if (hw === 'pedestrian') {
      const obstacles = buildRoadObstacles(allRoads, road)
      const swWidth = 1.5 // thin margin
      const leftSidewalk = buildCleanSidewalk(raisedPts, halfW, swWidth, 'left', obstacles)
      const rightSidewalk = buildCleanSidewalk(raisedPts, halfW, swWidth, 'right', obstacles)
      group.add(leftSidewalk)
      group.add(rightSidewalk)
      return group
    }

    // ── 2. Paved Granite Gutter (Caniveau de bordure de 24cm pour rues urbaines) ──
    if (isUrbanStreet) {
      const gutterW = 0.24
      const gutterOffset = halfW - gutterW / 2
      const leftGutter = buildRibbon(raisedPts, gutterW / 2, 0.029, GUTTER_MAT)
      const rightGutter = buildRibbon(raisedPts, gutterW / 2, 0.029, GUTTER_MAT)
      if (leftGutter)  { leftGutter.renderOrder = 3; shiftRibbonLateral(leftGutter, raisedPts, gutterOffset); group.add(leftGutter) }
      if (rightGutter) { rightGutter.renderOrder = 3; shiftRibbonLateral(rightGutter, raisedPts, -gutterOffset); group.add(rightGutter) }
    }

    // ── 3. Rubber Tire Tracks (Traces de pneus / gommage au sol) ──────
    const tireTrackHalfW = 0.22
    if (lanes === 1) {
      const trackL = buildRibbon(raisedPts, tireTrackHalfW, 0.032, TIRE_RUBBER_MAT)
      const trackR = buildRibbon(raisedPts, tireTrackHalfW, 0.032, TIRE_RUBBER_MAT)
      if (trackL) { trackL.renderOrder = 3; shiftRibbonLateral(trackL, raisedPts, -0.75); group.add(trackL) }
      if (trackR) { trackR.renderOrder = 3; shiftRibbonLateral(trackR, raisedPts, 0.75); group.add(trackR) }
    } else {
      for (let l = 0; l < lanes; l++) {
        const laneCenter = -halfW + (l + 0.5) * (roadW / lanes)
        const leftWheelOffset = laneCenter - 0.75
        const rightWheelOffset = laneCenter + 0.75

        const trackL = buildRibbon(raisedPts, tireTrackHalfW, 0.032, TIRE_RUBBER_MAT)
        const trackR = buildRibbon(raisedPts, tireTrackHalfW, 0.032, TIRE_RUBBER_MAT)
        if (trackL) { trackL.renderOrder = 3; shiftRibbonLateral(trackL, raisedPts, leftWheelOffset); group.add(trackL) }
        if (trackR) { trackR.renderOrder = 3; shiftRibbonLateral(trackR, raisedPts, rightWheelOffset); group.add(trackR) }
      }
    }

    // ── 4. Solid White Edge Lines (Bandes de rive nettes & visibles) ───
    const edgeHalfW = 0.07 // 14cm wide solid line
    const edgeOffset = isUrbanStreet ? halfW - 0.35 : halfW - 0.18
    const leftEdge = buildRibbon(raisedPts, edgeHalfW, 0.040, WHITE_MARK)
    const rightEdge = buildRibbon(raisedPts, edgeHalfW, 0.040, WHITE_MARK)
    if (leftEdge)  { leftEdge.renderOrder = 4; shiftRibbonLateral(leftEdge,  raisedPts,  edgeOffset); group.add(leftEdge)  }
    if (rightEdge) { rightEdge.renderOrder = 4; shiftRibbonLateral(rightEdge, raisedPts, -edgeOffset); group.add(rightEdge) }

    // ── 5. Ground Lane Markings (Ligne centrale & séparateurs de voies) ─
    if (isLink) {
      // Ramp/Link: no yellow double lines, dashed divider only if 2+ lanes
      if (lanes >= 2) {
        for (let l = 1; l < lanes; l++) {
          const dividerOffset = -halfW + l * (roadW / lanes)
          const div = buildDashedLine(raisedPts, dividerOffset, 0.07, 0.040, 4.0, 5.0, WHITE_MARK)
          if (div) { div.renderOrder = 4; group.add(div) }
        }
      }
    } else if (road.oneway) {
      // One-way street: no center line if 1 lane; dashed white lines between lanes if multiple
      if (lanes >= 2) {
        for (let l = 1; l < lanes; l++) {
          const dividerOffset = -halfW + l * (roadW / lanes)
          const div = buildDashedLine(raisedPts, dividerOffset, 0.07, 0.040, 3.0, 5.0, WHITE_MARK)
          if (div) { div.renderOrder = 4; group.add(div) }
        }
      }
    } else if (lanes >= 4) {
      // GROSSE AVENUE (Double sens) :
      // A. Double ligne jaune continue centrale
      const doubleSep = 0.14
      const leftCenterLine = buildRibbon(raisedPts, 0.06, 0.040, YELLOW_MARK)
      const rightCenterLine = buildRibbon(raisedPts, 0.06, 0.040, YELLOW_MARK)
      if (leftCenterLine)  { leftCenterLine.renderOrder = 4; shiftRibbonLateral(leftCenterLine,  raisedPts,  doubleSep); group.add(leftCenterLine) }
      if (rightCenterLine) { rightCenterLine.renderOrder = 4; shiftRibbonLateral(rightCenterLine, raisedPts, -doubleSep); group.add(rightCenterLine) }

      // B. Lignes blanches discontinues séparant les voies de chaque sens
      const dividerOffset = halfW / 2
      const divLeft = buildDashedLine(raisedPts, dividerOffset, 0.07, 0.040, 4.0, 5.0, WHITE_MARK)
      const divRight = buildDashedLine(raisedPts, -dividerOffset, 0.07, 0.040, 4.0, 5.0, WHITE_MARK)
      if (divLeft)  { divLeft.renderOrder = 4; group.add(divLeft) }
      if (divRight) { divRight.renderOrder = 4; group.add(divRight) }
    } else if (lanes >= 2) {
      // RUE DE VILLE (2 voies à double sens) :
      // Ligne blanche discontinue centrale (pointillés réguliers 3m / 3m)
      const centerDivider = buildDashedLine(raisedPts, 0, 0.07, 0.040, 3.0, 3.0, WHITE_MARK)
      if (centerDivider) { centerDivider.renderOrder = 4; group.add(centerDivider) }
    }

    // ── 6. Clean Elevated Sidewalks & Beveled Curbs (Respecting sidewalkMode) ─
    const swMode = road.sidewalkMode ?? (isUrbanStreet ? 'both' : 'none')
    let swObstacles: RoadObstacleSeg[] | null = null
    const getObstacles = () => {
      if (!swObstacles) swObstacles = buildRoadObstacles(allRoads, road)
      return swObstacles
    }

    if (swMode !== 'none') {
      const swWidth = isMajor ? 2.8 : DEFAULT_SIDEWALK_WIDTH
      if (swMode === 'both' || swMode === 'left') {
        const leftSidewalk = buildCleanSidewalk(raisedPts, halfW, swWidth, 'left', getObstacles())
        group.add(leftSidewalk)
      }
      if (swMode === 'both' || swMode === 'right') {
        const rightSidewalk = buildCleanSidewalk(raisedPts, halfW, swWidth, 'right', getObstacles())
        group.add(rightSidewalk)
      }
    }

    // ── 7. Cycleway Infrastructure (Infrastructure cyclable OSM) ──────────────
    if (road.cycleway && road.cycleway !== 'none') {
      const cwWidth = 1.6
      const cwHalf = cwWidth / 2
      const cwRightOffset = halfW - 0.25 - cwHalf
      const cwLeftOffset = -(halfW - 0.25 - cwHalf)

      const addCycleLane = (side: 'right' | 'left', offset: number) => {
        const cycleRibbon = buildRibbon(raisedPts, cwHalf, 0.038, PARIS_CYCLEWAY_MAT)
        if (cycleRibbon) {
          cycleRibbon.renderOrder = 4
          shiftRibbonLateral(cycleRibbon, raisedPts, side === 'right' ? -offset : offset)
          group.add(cycleRibbon)
        }

        // White border line separating cycleway from car lanes
        const divOffset = side === 'right' ? -(halfW - 0.25 - cwWidth) : (halfW - 0.25 - cwWidth)
        const whiteBorder = buildDashedLine(raisedPts, divOffset, 0.05, 0.039, 1.5, 1.5, WHITE_MARK)
        if (whiteBorder) {
          whiteBorder.renderOrder = 4
          group.add(whiteBorder)
        }

        // Bicycle stencil markings along the lane every ~25m
        let roadLen = 0
        for (let i = 0; i < smoothPts.length - 1; i++) {
          roadLen += Math.hypot(smoothPts[i + 1]!.x - smoothPts[i]!.x, smoothPts[i + 1]!.z - smoothPts[i]!.z)
        }
        if (roadLen >= 20) {
          const numIcons = Math.max(1, Math.floor(roadLen / 25))
          for (let k = 1; k <= numIcons; k++) {
            const iconDist = k * (roadLen / (numIcons + 1))
            let acc = 0
            for (let i = 0; i < smoothPts.length - 1; i++) {
              const a = smoothPts[i]!; const b = smoothPts[i + 1]!
              const segL = Math.hypot(b.x - a.x, b.z - a.z)
              if (acc + segL >= iconDist) {
                const t = (iconDist - acc) / segL
                let dx = b.x - a.x; let dz = b.z - a.z
                if (segL > 0) { dx /= segL; dz /= segL }
                const nx = -dz; const nz = dx
                const latOff = side === 'right' ? -offset : offset
                const p = {
                  x: a.x + dx * (iconDist - acc) + nx * latOff,
                  y: a.y + (b.y - a.y) * t,
                  z: a.z + dz * (iconDist - acc) + nz * latOff,
                }
                const bIcon = buildBicycleMarking(p, { dx, dz })
                group.add(bIcon)
                break
              }
              acc += segL
            }
          }
        }
      }

      if (road.cycleway === 'both') {
        addCycleLane('right', cwRightOffset)
        addCycleLane('left', cwLeftOffset)
      } else if (road.cycleway === 'left') {
        addCycleLane('left', cwLeftOffset)
      } else {
        addCycleLane('right', cwRightOffset)
      }
    }

    // ── 8. Dedicated Bus Lane (Couloir de bus réservé OSM) ───────────────────
    if (road.hasBusLane) {
      const busW = 3.0
      const busHalf = busW / 2
      const busOffset = halfW - 0.25 - busHalf
      const busRibbon = buildRibbon(raisedPts, busHalf, 0.035, PARIS_BUSWAY_MAT)
      if (busRibbon) {
        busRibbon.renderOrder = 3
        shiftRibbonLateral(busRibbon, raisedPts, -busOffset)
        group.add(busRibbon)
      }

      // Continuous wide white separator line
      const busSepOffset = -(halfW - 0.25 - busW)
      const busSep = buildRibbon(raisedPts, 0.12, 0.039, WHITE_MARK)
      if (busSep) {
        busSep.renderOrder = 4
        shiftRibbonLateral(busSep, raisedPts, busSepOffset)
        group.add(busSep)
      }

      // "BUS" lettering stencils on the asphalt
      let roadLen = 0
      for (let i = 0; i < smoothPts.length - 1; i++) {
        roadLen += Math.hypot(smoothPts[i + 1]!.x - smoothPts[i]!.x, smoothPts[i + 1]!.z - smoothPts[i]!.z)
      }
      if (roadLen >= 25) {
        const numBusMarks = Math.max(1, Math.floor(roadLen / 35))
        for (let k = 1; k <= numBusMarks; k++) {
          const mDist = k * (roadLen / (numBusMarks + 1))
          let acc = 0
          for (let i = 0; i < smoothPts.length - 1; i++) {
            const a = smoothPts[i]!; const b = smoothPts[i + 1]!
            const segL = Math.hypot(b.x - a.x, b.z - a.z)
            if (acc + segL >= mDist) {
              const t = (mDist - acc) / segL
              let dx = b.x - a.x; let dz = b.z - a.z
              if (segL > 0) { dx /= segL; dz /= segL }
              const nx = -dz; const nz = dx
              const p = {
                x: a.x + dx * (mDist - acc) - nx * busOffset,
                y: a.y + (b.y - a.y) * t,
                z: a.z + dz * (mDist - acc) - nz * busOffset,
              }
              const busMark = buildBusLaneMarking(p, { dx, dz })
              group.add(busMark)
              break
            }
            acc += segL
          }
        }
      }
    }

    // ── 9. Directional Road Arrows & Crosswalks (Marquages au sol) ───────────
    let roadLength = 0
    for (let i = 0; i < smoothPts.length - 1; i++) {
      const a = smoothPts[i]!
      const b = smoothPts[i + 1]!
      roadLength += Math.hypot(b.x - a.x, b.z - a.z)
    }

    // Roadside parking bays (only on urban streets)
    if (isUrbanStreet && road.parkingLane && road.parkingLane !== 'none' && roadLength >= 15) {
      if (road.parkingLane === 'both' || road.parkingLane === 'right') {
        const baysR = buildParkingBays(raisedPts, halfW, 'right', roadLength)
        if (baysR) group.add(baysR)
      }
      if (road.parkingLane === 'both' || road.parkingLane === 'left') {
        const baysL = buildParkingBays(raisedPts, halfW, 'left', roadLength)
        if (baysL) group.add(baysL)
      }
    }

    // Crosswalks and traffic lights (NEVER on motorways, trunks or link ramps)
    if (isUrbanStreet && roadLength >= 25) {
      // Place crosswalk near junction/start
      const crossDist = Math.min(14, roadLength * 0.35)
      let accum = 0

      for (let i = 0; i < smoothPts.length - 1; i++) {
        const a = smoothPts[i]!; const b = smoothPts[i + 1]!
        const segLen = Math.hypot(b.x - a.x, b.z - a.z)
        if (accum + segLen >= crossDist) {
          const t = (crossDist - accum) / segLen
          let dx = b.x - a.x; let dz = b.z - a.z
          if (segLen > 0) { dx /= segLen; dz /= segLen; }
          const norm = { nx: -dz, nz: dx }
          const crosswalkPt = {
            x: a.x + dx * (crossDist - accum),
            y: a.y + (b.y - a.y) * t,
            z: a.z + dz * (crossDist - accum),
          }

          // Zebra stripes
          const crosswalk = buildCrosswalk(crosswalkPt, { dx, dz }, halfW)
          if (crosswalk) { crosswalk.renderOrder = 4; group.add(crosswalk) }

          // Stop line 2.5m before crosswalk
          const stopPt = {
            x: crosswalkPt.x - dx * 2.5,
            y: crosswalkPt.y,
            z: crosswalkPt.z - dz * 2.5,
          }
          const stopLine = buildStopLine(stopPt, { dx, dz }, halfW)
          if (stopLine) { stopLine.renderOrder = 4; group.add(stopLine) }

          // 3D Traffic Light signal pole at the crosswalk
          const signalTmpl = getTrafficLightTemplate()
          const signalPole = signalTmpl.clone()
          signalPole.position.set(
            crosswalkPt.x + norm.nx * (halfW + 0.8),
            crosswalkPt.y,
            crosswalkPt.z + norm.nz * (halfW + 0.8),
          )
          signalPole.rotation.y = Math.atan2(dx, dz) + Math.PI / 2
          group.add(signalPole)
          break
        }
        accum += segLen
      }
    }

    // Directional arrows painted flat on asphalt
    if (!isLink && roadLength >= 35) {
      const arrowDist = roadLength * 0.65
      let accum = 0
      for (let i = 0; i < smoothPts.length - 1; i++) {
        const a = smoothPts[i]!; const b = smoothPts[i + 1]!
        const segLen = Math.hypot(b.x - a.x, b.z - a.z)
        if (accum + segLen >= arrowDist) {
          const t = (arrowDist - accum) / segLen
          let dx = b.x - a.x; let dz = b.z - a.z
          if (segLen > 0) { dx /= segLen; dz /= segLen; }
          const norm = { nx: -dz, nz: dx }

          if (road.oneway) {
            // One-way street: all lanes point forward
            for (let l = 0; l < lanes; l++) {
              const laneOffset = -halfW + (l + 0.5) * (roadW / lanes)
              const pt = {
                x: a.x + dx * (arrowDist - accum) + norm.nx * laneOffset,
                y: a.y + (b.y - a.y) * t,
                z: a.z + dz * (arrowDist - accum) + norm.nz * laneOffset,
              }
              const arrow = buildRoadArrow(pt, { dx, dz })
              group.add(arrow)
            }
          } else if (lanes >= 4) {
            // Two-way avenue: right forward, left reverse
            const arrowCenterRight = {
              x: a.x + dx * (arrowDist - accum) + norm.nx * (halfW * 0.5),
              y: a.y + (b.y - a.y) * t,
              z: a.z + dz * (arrowDist - accum) + norm.nz * (halfW * 0.5),
            }
            const rightArrow = buildRoadArrow(arrowCenterRight, { dx, dz })
            group.add(rightArrow)

            const arrowCenterLeft = {
              x: a.x + dx * (arrowDist - accum) - norm.nx * (halfW * 0.5),
              y: a.y + (b.y - a.y) * t,
              z: a.z + dz * (arrowDist - accum) - norm.nz * (halfW * 0.5),
            }
            const leftArrow = buildRoadArrow(arrowCenterLeft, { dx: -dx, dz: -dz })
            group.add(leftArrow)
          }
          break
        }
        accum += segLen
      }
    }

    // ── 10. Parisian Street Lamps along the Sidewalk (highway=street_lamp / lit=yes) ──
    if (swMode !== 'none' && !isHighway && !isLink && (road.lit || isUrbanStreet) && roadLength >= 35) {
      const lampTmpl = getStreetLampTemplate()
      const lampSpacing = 32
      const numLamps = Math.min(8, Math.max(1, Math.floor(roadLength / lampSpacing)))
      for (let k = 1; k <= numLamps; k++) {
        const lDist = k * (roadLength / (numLamps + 1))
        let acc = 0
        for (let i = 0; i < smoothPts.length - 1; i++) {
          const a = smoothPts[i]!; const b = smoothPts[i + 1]!
          const segL = Math.hypot(b.x - a.x, b.z - a.z)
          if (acc + segL >= lDist) {
            const t = (lDist - acc) / segL
            let dx = b.x - a.x; let dz = b.z - a.z
            if (segL > 0) { dx /= segL; dz /= segL }
            const nx = -dz; const nz = dx
            const lampSide = k % 2 === 0 ? 1 : -1
            const lamp = lampTmpl.clone()
            lamp.position.set(
              a.x + dx * (lDist - acc) + nx * (halfW + 0.8) * lampSide,
              a.y + (b.y - a.y) * t,
              a.z + dz * (lDist - acc) + nz * (halfW + 0.8) * lampSide,
            )
            lamp.rotation.y = Math.atan2(dx, dz) + (lampSide > 0 ? Math.PI / 2 : -Math.PI / 2)
            group.add(lamp)
            break
          }
          acc += segL
        }
      }
    }

    return group
  }
}

