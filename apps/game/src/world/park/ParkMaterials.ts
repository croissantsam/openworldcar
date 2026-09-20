/**
 * Park Materials — Procedural textures and PBR materials for parks.
 */

import * as THREE from 'three'

// ── Procedural Textures ───────────────────────────────────────────────────

let _grassTexture: THREE.CanvasTexture | null = null
export function getGrassTexture(): THREE.CanvasTexture {
  if (_grassTexture) return _grassTexture
  if (typeof document === 'undefined') {
    return new THREE.CanvasTexture({} as HTMLCanvasElement)
  }

  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 512
  const ctx = canvas.getContext('2d')!

  // Vibrant, rich Parisian lawn green base
  ctx.fillStyle = '#4c9a3e'
  ctx.fillRect(0, 0, 512, 512)

  const idata = ctx.getImageData(0, 0, 512, 512)
  const d = idata.data
  for (let i = 0; i < d.length; i += 4) {
    const noise = (Math.random() - 0.5) * 32
    d[i] = Math.min(255, Math.max(0, 76 + noise * 0.7))      // R
    d[i + 1] = Math.min(255, Math.max(0, 154 + noise))       // G (vibrant lush green)
    d[i + 2] = Math.min(255, Math.max(0, 62 + noise * 0.6))  // B
    d[i + 3] = 255
  }
  ctx.putImageData(idata, 0, 0)

  // Grass blade strokes
  ctx.fillStyle = 'rgba(92, 175, 76, 0.40)'
  for (let k = 0; k < 1500; k++) {
    const x = Math.random() * 512
    const y = Math.random() * 512
    const h = 2.5 + Math.random() * 5
    ctx.fillRect(x, y, 1.5, h)
  }

  // Organic shade specks
  ctx.fillStyle = 'rgba(45, 95, 38, 0.35)'
  for (let k = 0; k < 1000; k++) {
    const x = Math.random() * 512
    const y = Math.random() * 512
    ctx.fillRect(x, y, 2, 2)
  }

  // Very subtle earth speckles
  ctx.fillStyle = 'rgba(102, 82, 52, 0.10)'
  for (let k = 0; k < 250; k++) {
    ctx.fillRect(Math.random() * 512, Math.random() * 512, 2, 2)
  }

  _grassTexture = new THREE.CanvasTexture(canvas)
  _grassTexture.wrapS = THREE.RepeatWrapping
  _grassTexture.wrapT = THREE.RepeatWrapping
  _grassTexture.repeat.set(1, 1)
  return _grassTexture
}

let _barkTexture: THREE.CanvasTexture | null = null
export function getBarkTexture(): THREE.CanvasTexture {
  if (_barkTexture) return _barkTexture
  if (typeof document === 'undefined') {
    return new THREE.CanvasTexture({} as HTMLCanvasElement)
  }

  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const ctx = canvas.getContext('2d')!

  ctx.fillStyle = '#3a2719'
  ctx.fillRect(0, 0, 256, 256)

  // Vertical bark fissures and grain
  for (let x = 0; x < 256; x += 3) {
    const shade = Math.floor(35 + Math.random() * 30)
    ctx.fillStyle = `rgb(${shade + 15}, ${shade}, ${Math.floor(shade * 0.65)})`
    ctx.fillRect(x, 0, 2 + Math.random() * 2, 256)
  }

  _barkTexture = new THREE.CanvasTexture(canvas)
  _barkTexture.wrapS = THREE.RepeatWrapping
  _barkTexture.wrapT = THREE.RepeatWrapping
  _barkTexture.repeat.set(1, 2)
  return _barkTexture
}

// ── Materials ─────────────────────────────────────────────────────────────

const grassTex = getGrassTexture()
const barkTex = getBarkTexture()

export const PARK_MATS: Record<string, THREE.MeshStandardMaterial> = {
  park:        new THREE.MeshStandardMaterial({ map: grassTex, color: 0xffffff, roughness: 0.85, metalness: 0.0, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1.0, polygonOffsetUnits: -1.0 }),
  garden:      new THREE.MeshStandardMaterial({ map: grassTex, color: 0xf5fff0, roughness: 0.82, metalness: 0.0, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1.0, polygonOffsetUnits: -1.0 }),
  grass:       new THREE.MeshStandardMaterial({ map: grassTex, color: 0xffffff, roughness: 0.88, metalness: 0.0, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1.0, polygonOffsetUnits: -1.0 }),
  forest:      new THREE.MeshStandardMaterial({ map: grassTex, color: 0x90b888, roughness: 0.90, metalness: 0.0, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1.0, polygonOffsetUnits: -1.0 }),
  recreation:  new THREE.MeshStandardMaterial({ map: grassTex, color: 0xf0fff0, roughness: 0.82, metalness: 0.0, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1.0, polygonOffsetUnits: -1.0 }),
  // Other types
  cemetery:    new THREE.MeshStandardMaterial({ color: 0x8a8880, roughness: 0.95, metalness: 0.0, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1.0, polygonOffsetUnits: -1.0 }),
  farmland:    new THREE.MeshStandardMaterial({ color: 0x9a7c48, roughness: 0.98, metalness: 0.0, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1.0, polygonOffsetUnits: -1.0 }),
  parking_lot: new THREE.MeshStandardMaterial({ color: 0x909498, roughness: 0.85, metalness: 0.04, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1.0, polygonOffsetUnits: -1.0 }),
  pitch:       new THREE.MeshStandardMaterial({ color: 0x2e8540, roughness: 0.95, metalness: 0.0, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1.0, polygonOffsetUnits: -1.0 }),
  beach:       new THREE.MeshStandardMaterial({ color: 0xe8d898, roughness: 0.98, metalness: 0.0, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1.0, polygonOffsetUnits: -1.0 }),
  cliff:       new THREE.MeshStandardMaterial({ color: 0x8c7a6a, roughness: 0.96, metalness: 0.02, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1.0, polygonOffsetUnits: -1.0 }),
  scrub:       new THREE.MeshStandardMaterial({ color: 0x6e8e54, roughness: 0.96, metalness: 0.0, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1.0, polygonOffsetUnits: -1.0 }),
}

// Tree bark
export const TRUNK_MAT = new THREE.MeshStandardMaterial({
  map: barkTex,
  color: 0x4a3220,
  roughness: 0.90,
  metalness: 0.05,
})

// Rich organic foliage tones
export const FOLIAGE_MATS = [
  new THREE.MeshStandardMaterial({ color: 0x2d6829, roughness: 0.76, metalness: 0.02, flatShading: true }), // Deep chestnut / plane green
  new THREE.MeshStandardMaterial({ color: 0x3a7833, roughness: 0.74, metalness: 0.02, flatShading: true }), // Summer oak green
  new THREE.MeshStandardMaterial({ color: 0x488c3a, roughness: 0.72, metalness: 0.02, flatShading: true }), // Sunlit linden green
  new THREE.MeshStandardMaterial({ color: 0x245422, roughness: 0.78, metalness: 0.02, flatShading: true }), // Shaded forest crown
]

// Parisian bench materials (Davioud style)
export const BENCH_IRON_MAT = new THREE.MeshStandardMaterial({
  color: 0x182c20, // Parisian park dark green cast iron
  roughness: 0.45,
  metalness: 0.55,
})

export const BENCH_WOOD_MAT = new THREE.MeshStandardMaterial({
  color: 0x7c4928, // Varnished oak slats
  roughness: 0.65,
  metalness: 0.05,
})

// Park walking path material (sable de Paris / compacted limestone gravel)
export const PATH_GRAVEL_MAT = new THREE.MeshStandardMaterial({
  color: 0xd2c4a4,
  roughness: 0.96,
  metalness: 0.0,
  polygonOffset: true,
  polygonOffsetFactor: 0.5,
  polygonOffsetUnits: 0.5,
})

// Shrub and flowerbed materials
export const SHRUB_MAT = new THREE.MeshStandardMaterial({
  color: 0x2e6628,
  roughness: 0.80,
  flatShading: true,
})

export const FLOWER_BLOSSOM_MATS = [
  new THREE.MeshStandardMaterial({ color: 0xf4f0dc, roughness: 0.7 }), // Cream white
  new THREE.MeshStandardMaterial({ color: 0xdf6f88, roughness: 0.7 }), // Rose pink
  new THREE.MeshStandardMaterial({ color: 0x8a66c4, roughness: 0.7 }), // Lavender purple
]