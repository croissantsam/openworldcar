/**
 * BuildingMeshGenerator — realistic urban buildings with diverse palettes.
 *
 * Features:
 *   - Rich architectural variety (modern glass towers, brownstone brick,
 *     warm sandstone, and dark slate office buildings)
 *   - Procedural window textures without harsh bump artifacts
 *   - Realistic contrasting rooftop parapets
 *   - Varied colors seeded by building id
 */

import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import type { Building } from '@world-drive/shared'

// ── Facade color palettes (Burnout Paradise urban variety) ─────────────────
// Each palette: [facade_hex, window_frame_hex, roof_hex, isGlassTower]
interface Palette {
  facade: number
  frame: number
  roof: number
  isGlass: boolean
}

const PALETTES: Palette[] = [
  // Modern glass office towers (Burnout Paradise downtown style)
  { facade: 0x1e2e42, frame: 0x2e4258, roof: 0x141e2a, isGlass: true },
  { facade: 0x243545, frame: 0x36485b, roof: 0x182430, isGlass: true },
  { facade: 0x2b3846, frame: 0x3c4c5c, roof: 0x1d2732, isGlass: true },

  // Brick & Terracotta commercial/residential
  { facade: 0x6e3c30, frame: 0x542d24, roof: 0x282320, isGlass: false },
  { facade: 0x5a342a, frame: 0x442720, roof: 0x221c18, isGlass: false },

  // Muted grey stone & Haussmannian limestone
  { facade: 0x9e9484, frame: 0x867c6c, roof: 0x4a4845, isGlass: false },
  { facade: 0x8a8478, frame: 0x746e62, roof: 0x3d3c3a, isGlass: false },
  { facade: 0xa8a294, frame: 0x908a7c, roof: 0x545250, isGlass: false },

  // Dark slate modern commercial
  { facade: 0x383e48, frame: 0x2a2f38, roof: 0x20242b, isGlass: false },
  { facade: 0x2d323a, frame: 0x20242a, roof: 0x16181d, isGlass: false },
]

// ── Window texture cache ───────────────────────────────────────────────────
const textureCache = new Map<string, THREE.CanvasTexture>()

function makeWindowTexture(palette: Palette, paletteIdx: number): THREE.CanvasTexture {
  const key = `${paletteIdx}`
  if (textureCache.has(key)) return textureCache.get(key)!

  const W = 256, H = 512
  const canvas = document.createElement('canvas')
  canvas.width = W; canvas.height = H
  const ctx = canvas.getContext('2d')!

  // Facade background
  const r = (palette.facade >> 16) & 0xff
  const g = (palette.facade >> 8) & 0xff
  const b = palette.facade & 0xff
  ctx.fillStyle = `rgb(${r},${g},${b})`
  ctx.fillRect(0, 0, W, H)

  // Floors & window grid
  const floors = 12
  const floorH = H / floors
  const cols = 6
  const colW = W / cols

  for (let f = 0; f < floors; f++) {
    const y = f * floorH

    // Horizontal floor dividing cornice
    ctx.fillStyle = 'rgba(0,0,0,0.18)'
    ctx.fillRect(0, y, W, 2)

    for (let c = 0; c < cols; c++) {
      const x = c * colW
      const wx = x + 6
      const wy = y + 7
      const ww = colW - 12
      const wh = floorH - 14

      if (palette.isGlass) {
        // Reflective glass facade with sky reflection & vertical mullions
        const skyGrad = ctx.createLinearGradient(wx, wy, wx, wy + wh)
        skyGrad.addColorStop(0, 'rgba(80, 140, 190, 0.85)')
        skyGrad.addColorStop(1, 'rgba(30, 60, 95, 0.95)')
        ctx.fillStyle = skyGrad
        ctx.fillRect(wx, wy, ww, wh)

        // Glass reflection highlight
        ctx.fillStyle = 'rgba(255, 255, 255, 0.12)'
        ctx.fillRect(wx, wy, ww * 0.35, wh)
      } else {
        // Standard window with frame & tinted pane
        ctx.fillStyle = 'rgba(0,0,0,0.25)'
        ctx.fillRect(wx - 2, wy - 2, ww + 4, wh + 4)

        const lit = Math.random() > 0.4
        if (lit) {
          ctx.fillStyle = 'rgba(255, 225, 150, 0.85)' // warm office/room light
        } else {
          ctx.fillStyle = 'rgba(40, 60, 80, 0.9)' // dark tinted window
        }
        ctx.fillRect(wx, wy, ww, wh)

        // Window mullion divider
        ctx.fillStyle = 'rgba(0,0,0,0.35)'
        ctx.fillRect(wx + ww / 2 - 1, wy, 2, wh)
      }
    }
  }

  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  textureCache.set(key, tex)
  return tex
}

// ── Material cache ─────────────────────────────────────────────────────────
const matCache = new Map<number, THREE.MeshStandardMaterial>()
const roofMatCache = new Map<number, THREE.MeshStandardMaterial>()

function getFacadeMat(paletteIdx: number): THREE.MeshStandardMaterial {
  if (matCache.has(paletteIdx)) return matCache.get(paletteIdx)!
  const pal = PALETTES[paletteIdx]!
  const tex = makeWindowTexture(pal, paletteIdx)

  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    roughness: pal.isGlass ? 0.35 : 0.82,
    metalness: pal.isGlass ? 0.65 : 0.10,
  })
  matCache.set(paletteIdx, mat)
  return mat
}

function getRoofMat(paletteIdx: number): THREE.MeshStandardMaterial {
  if (roofMatCache.has(paletteIdx)) return roofMatCache.get(paletteIdx)!
  const pal = PALETTES[paletteIdx]!
  const mat = new THREE.MeshStandardMaterial({
    color: pal.roof,
    roughness: 0.92,
    metalness: 0.05,
  })
  roofMatCache.set(paletteIdx, mat)
  return mat
}

function hashId(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return h
}

export class BuildingMeshGenerator {
  /**
   * Generate a building mesh (extruded footprint + roof) from a Building.
   */
  static generate(building: Building): THREE.Group | null {
    const fp = building.footprint
    if (fp.length < 3) return null

    const paletteIdx = hashId(building.id) % PALETTES.length
    const facadeMat = getFacadeMat(paletteIdx)
    const roofMat = getRoofMat(paletteIdx)

    const group = new THREE.Group()

    // ── Walls (ExtrudeGeometry) ──────────────────────────────────────
    const shape = new THREE.Shape()
    shape.moveTo(fp[0]!.x, -fp[0]!.z)
    for (let i = 1; i < fp.length; i++) shape.lineTo(fp[i]!.x, -fp[i]!.z)
    shape.closePath()

    const wallGeo = new THREE.ExtrudeGeometry(shape, {
      depth: building.height,
      bevelEnabled: false,
    })
    wallGeo.rotateX(-Math.PI / 2)

    // Adjust UVs so texture wraps with realistic scale (~16m width, ~24m height per tile)
    const uvAttr = wallGeo.attributes['uv'] as THREE.BufferAttribute
    if (uvAttr) {
      const uScale = 0.06
      const vScale = 0.04
      for (let i = 0; i < uvAttr.count; i++) {
        uvAttr.setXY(i, uvAttr.getX(i) * uScale, uvAttr.getY(i) * vScale)
      }
      uvAttr.needsUpdate = true
    }

    const wallMesh = new THREE.Mesh(wallGeo, facadeMat)
    wallMesh.castShadow = true
    wallMesh.receiveShadow = true
    wallMesh.userData['buildingId'] = building.id
    group.add(wallMesh)

    // ── Flat roof with parapet ─────────────────────────────────────────
    const roofGeo = new THREE.ShapeGeometry(shape)
    roofGeo.rotateX(-Math.PI / 2)
    roofGeo.translate(0, building.height + 0.02, 0)
    const roofMesh = new THREE.Mesh(roofGeo, roofMat)
    roofMesh.receiveShadow = true
    group.add(roofMesh)

    return group
  }

  /**
   * Create a fixed Rapier trimesh collider description for a building.
   */
  static createColliderDesc(building: Building): RAPIER.ColliderDesc | null {
    const fp = building.footprint
    if (fp.length < 3) return null

    const n = fp.length
    const verts: number[] = []
    const indices: number[] = []

    for (let i = 0; i < n; i++) {
      const p = fp[i]!
      verts.push(p.x, 0, p.z)
      verts.push(p.x, building.height, p.z)
    }

    for (let i = 0; i < n; i++) {
      const next = (i + 1) % n
      const b0 = i * 2
      const t0 = i * 2 + 1
      const b1 = next * 2
      const t1 = next * 2 + 1

      indices.push(b0, b1, t0)
      indices.push(b1, t1, t0)
    }

    return RAPIER.ColliderDesc.trimesh(
      new Float32Array(verts),
      new Uint32Array(indices),
    )
  }
}
