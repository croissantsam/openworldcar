import * as THREE from 'three'

export const LANE_WIDTH = 3.6
export const SIDEWALK_HEIGHT = 0.12
export const CURB_WIDTH = 0.18
export const DEFAULT_SIDEWALK_WIDTH = 2.0

function createAsphaltTexture(): THREE.CanvasTexture {
  if (typeof document === 'undefined') {
    return new THREE.CanvasTexture({} as HTMLCanvasElement)
  }
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 512
  const ctx = canvas.getContext('2d')!

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

const POFF = { polygonOffset: true, polygonOffsetFactor: -2.0, polygonOffsetUnits: -2.0 }

export const ASPHALT_MATS: Record<string, THREE.MeshStandardMaterial> = {
  motorway:    new THREE.MeshStandardMaterial({ color: 0x32353c, map: ASPHALT_TEX, roughness: 0.74, metalness: 0.10, side: THREE.DoubleSide, ...POFF }),
  trunk:       new THREE.MeshStandardMaterial({ color: 0x2e3138, map: ASPHALT_TEX, roughness: 0.74, metalness: 0.10, side: THREE.DoubleSide, ...POFF }),
  primary:     new THREE.MeshStandardMaterial({ color: 0x2b2e34, map: ASPHALT_TEX, roughness: 0.76, metalness: 0.08, side: THREE.DoubleSide, ...POFF }),
  secondary:   new THREE.MeshStandardMaterial({ color: 0x282b30, map: ASPHALT_TEX, roughness: 0.78, metalness: 0.06, side: THREE.DoubleSide, ...POFF }),
  tertiary:    new THREE.MeshStandardMaterial({ color: 0x26282e, map: ASPHALT_TEX, roughness: 0.80, metalness: 0.05, side: THREE.DoubleSide, ...POFF }),
  residential: new THREE.MeshStandardMaterial({ color: 0x24272c, map: ASPHALT_TEX, roughness: 0.82, metalness: 0.04, side: THREE.DoubleSide, ...POFF }),
  service:     new THREE.MeshStandardMaterial({ color: 0x222428, map: ASPHALT_TEX, roughness: 0.84, metalness: 0.03, side: THREE.DoubleSide, ...POFF }),
  default:     new THREE.MeshStandardMaterial({ color: 0x26282e, map: ASPHALT_TEX, roughness: 0.80, metalness: 0.05, side: THREE.DoubleSide, ...POFF }),
}

export const GUTTER_MAT = new THREE.MeshStandardMaterial({
  color: 0x50545c, roughness: 0.82, metalness: 0.05, side: THREE.DoubleSide, ...POFF,
})

export const TIRE_RUBBER_MAT = new THREE.MeshStandardMaterial({
  color: 0x121316, roughness: 0.60, metalness: 0.06, transparent: true, opacity: 0.35,
  depthWrite: false, side: THREE.DoubleSide,
})

export const WHITE_MARK = new THREE.MeshStandardMaterial({
  color: 0xffffff, roughness: 0.35, metalness: 0.0,
  emissive: 0xffffff, emissiveIntensity: 0.22, side: THREE.DoubleSide,
  polygonOffset: true, polygonOffsetFactor: -3.0, polygonOffsetUnits: -3.0,
})

export const YELLOW_MARK = new THREE.MeshStandardMaterial({
  color: 0xffb800, roughness: 0.35, metalness: 0.0,
  emissive: 0xe6a000, emissiveIntensity: 0.25, side: THREE.DoubleSide,
  polygonOffset: true, polygonOffsetFactor: -3.0, polygonOffsetUnits: -3.0,
})

export const BRIDGE_DECK_MAT = new THREE.MeshStandardMaterial({
  color: 0x6e7074, roughness: 0.88, metalness: 0.08, side: THREE.DoubleSide,
})

export const BRIDGE_PARAPET_STONE_MAT = new THREE.MeshStandardMaterial({
  color: 0x9e9a90, roughness: 0.84, metalness: 0.04, side: THREE.DoubleSide,
})

export const BRIDGE_RAILING_METAL_MAT = new THREE.MeshStandardMaterial({
  color: 0x242830, roughness: 0.45, metalness: 0.65, side: THREE.DoubleSide,
})

export const BRIDGE_PIER_MAT = new THREE.MeshStandardMaterial({
  color: 0x787a7e, roughness: 0.90, metalness: 0.05,
})

export const TUNNEL_WALL_MAT = new THREE.MeshStandardMaterial({
  color: 0x3e4248, roughness: 0.92, metalness: 0.04, side: THREE.DoubleSide,
})

export const TUNNEL_PORTAL_MAT = new THREE.MeshStandardMaterial({
  color: 0x585a60, roughness: 0.85, metalness: 0.06, side: THREE.DoubleSide,
})

export const TUNNEL_LIGHT_MAT = new THREE.MeshStandardMaterial({
  color: 0xfff6c0, emissive: 0xffe890, emissiveIntensity: 1.4, roughness: 0.2,
})

export const TRENCH_MASK_MAT = new THREE.MeshBasicMaterial({
  colorWrite: false, depthWrite: false, stencilWrite: true, stencilRef: 1,
  stencilFunc: THREE.AlwaysStencilFunc, stencilZPass: THREE.ReplaceStencilOp,
  side: THREE.DoubleSide,
})

function createSidewalkTileTexture(): THREE.CanvasTexture {
  if (typeof document === 'undefined') {
    return new THREE.CanvasTexture({} as HTMLCanvasElement)
  }
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const ctx = canvas.getContext('2d')!

  ctx.fillStyle = '#8a867e'
  ctx.fillRect(0, 0, 256, 256)

  const tileSize = 64
  for (let y = 0; y < 256; y += tileSize) {
    for (let x = 0; x < 256; x += tileSize) {
      const shade = (Math.random() - 0.5) * 18
      const r = Math.min(255, Math.max(0, 138 + shade))
      const g = Math.min(255, Math.max(0, 134 + shade))
      const b = Math.min(255, Math.max(0, 126 + shade))
      ctx.fillStyle = `rgb(${r},${g},${b})`
      ctx.fillRect(x + 2, y + 2, tileSize - 4, tileSize - 4)

      ctx.fillStyle = 'rgba(40, 35, 30, 0.10)'
      for (let k = 0; k < 8; k++) {
        ctx.fillRect(x + Math.random() * tileSize, y + Math.random() * tileSize, 2, 2)
      }
    }
  }

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

export const CURB_MAT = new THREE.MeshStandardMaterial({
  color: 0x6e6a62, roughness: 0.70, metalness: 0.08, side: THREE.DoubleSide,
})

export const SIDEWALK_MAT = new THREE.MeshStandardMaterial({
  color: 0xdcd8d0, map: createSidewalkTileTexture(), roughness: 0.84, metalness: 0.04, side: THREE.DoubleSide,
})

function createCobblestoneTexture(): THREE.CanvasTexture {
  if (typeof document === 'undefined') return new THREE.CanvasTexture({} as HTMLCanvasElement)
  const canvas = document.createElement('canvas')
  canvas.width = 256; canvas.height = 256
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#7a7870'
  ctx.fillRect(0, 0, 256, 256)
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

export const COBBLESTONE_MAT = new THREE.MeshStandardMaterial({ map: COBBLESTONE_TEX, roughness: 0.92, metalness: 0.02, side: THREE.DoubleSide, ...POFF })
export const CONCRETE_MAT   = new THREE.MeshStandardMaterial({ map: CONCRETE_TEX,    roughness: 0.85, metalness: 0.04, side: THREE.DoubleSide, ...POFF })
export const GRAVEL_MAT     = new THREE.MeshStandardMaterial({ map: GRAVEL_TEX,      roughness: 0.96, metalness: 0.01, side: THREE.DoubleSide, ...POFF })

export const CYCLEWAY_MAT = new THREE.MeshStandardMaterial({ color: 0x6080c0, roughness: 0.80, metalness: 0.04, side: THREE.DoubleSide, ...POFF })

export const PARIS_CYCLEWAY_MAT = new THREE.MeshStandardMaterial({
  color: 0x1d6d42, roughness: 0.78, metalness: 0.04, side: THREE.DoubleSide,
  polygonOffset: true, polygonOffsetFactor: -2.5, polygonOffsetUnits: -2.5,
})

export const PARIS_BUSWAY_MAT = new THREE.MeshStandardMaterial({
  color: 0x4a2424, roughness: 0.80, metalness: 0.05, side: THREE.DoubleSide,
  polygonOffset: true, polygonOffsetFactor: -2.5, polygonOffsetUnits: -2.5,
})

function createPavingTexture(): THREE.CanvasTexture {
  const tex = createSidewalkTileTexture()
  tex.repeat.set(1, 1)
  return tex
}

export const PEDESTRIAN_ROAD_MAT = new THREE.MeshStandardMaterial({
  color: 0xc8c4bc, map: createPavingTexture(), roughness: 0.86, metalness: 0.04,
  side: THREE.DoubleSide, ...POFF,
})

export const PLAZA_MAT = new THREE.MeshStandardMaterial({
  color: 0xc8c4bc, map: createPavingTexture(), roughness: 0.86, metalness: 0.04,
  side: THREE.DoubleSide,
})

export const NON_DRIVABLE = new Set(['path', 'footway', 'cycleway', 'track', 'steps', 'pedestrian'])

export function elevClass(r: { elevationMode?: string; bridge?: boolean; tunnel?: boolean; layer?: number }): number {
  if (r.elevationMode === 'bridge' || r.bridge) return 1
  if (r.elevationMode === 'tunnel' || r.tunnel) return -1
  return 0
}

export function isDrivableWay(r: { highway: string; points: any[] }): boolean {
  return !NON_DRIVABLE.has(r.highway) && r.points.length >= 2
}

export function isUrbanWay(r: { highway: string; isLink?: boolean }): boolean {
  const hw = r.highway
  return hw !== 'motorway' && hw !== 'trunk' && !(r.isLink ?? false) && !NON_DRIVABLE.has(hw)
}

export function isMajorWay(r: { highway: string }): boolean {
  return r.highway === 'primary' || r.highway === 'motorway' || r.highway === 'trunk'
}

export function sidewalkWidthOf(r: { highway: string; isLink?: boolean }): number {
  return isMajorWay(r) ? 2.8 : DEFAULT_SIDEWALK_WIDTH
}

export function sidewalkFootprint(r: { elevationMode?: string; bridge?: boolean; tunnel?: boolean; sidewalkMode?: string; highway: string; isLink?: boolean }): { plus: number; minus: number } {
  if (elevClass(r) !== 0) return { plus: 0, minus: 0 }
  const mode = r.sidewalkMode ?? (isUrbanWay(r) ? 'both' : 'none')
  const w = CURB_WIDTH + sidewalkWidthOf(r)
  return {
    plus: mode === 'both' || mode === 'right' ? w : 0,
    minus: mode === 'both' || mode === 'left' ? w : 0,
  }
}

export function sideSign(side: 'left' | 'right'): number {
  return side === 'right' ? 1 : -1
}

export function hasSidewalkSide(r: { elevationMode?: string; bridge?: boolean; tunnel?: boolean; sidewalkMode?: string; highway: string; isLink?: boolean }, side: 'left' | 'right'): boolean {
  if (elevClass(r) !== 0) return false
  const mode = r.sidewalkMode ?? (isUrbanWay(r) ? 'both' : 'none')
  return mode === 'both' || mode === side
}

export function checkElevationConnections(road: { points: { x: number; z: number }[]; elevationMode?: string; bridge?: boolean; tunnel?: boolean; layer?: number; id?: string }, allRoads?: { id?: string; points: { x: number; z: number }[]; elevationMode?: string; bridge?: boolean; tunnel?: boolean }[]): { connectsStart: boolean; connectsEnd: boolean } {
  if (!allRoads || allRoads.length === 0 || road.points.length < 2) {
    return { connectsStart: false, connectsEnd: false }
  }
  const isTargetElevation = (r: any) => {
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

export function getAsphaltMaterial(highway: string, surface?: string): THREE.MeshStandardMaterial {
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