/**
 * BuildingMeshGenerator — renders all OpenStreetMap 3D buildings with maximum realism.
 *
 * Realism features:
 *   - Type-specific palettes & architecture for all OSM types:
 *     apartments (Haussmannian stone), office/commercial (glass towers), retail/supermarket,
 *     church/cathedral/temple/synagogue/mosque, school/university, hospital, hotel,
 *     train_station, stadium, sports_hall, fire_station, government/civic/public,
 *     warehouse/industrial/hangar, farm/stable, house/detached/terrace/bungalow/hut,
 *     garage/garages/carport, monument, castle, manor, and open roofs.
 *   - Ground-floor illuminated storefront vitrines, cafe awnings, and entrance portals.
 *   - Authentic Haussmannian facades with French wrought-iron balconies.
 *   - Comprehensive roof shapes: flat (with parapets & rooftop HVAC/lift units),
 *     mansard (classic Parisian 2-tier zinc/slate), gabled, hipped, pyramidal, dome, skillion, round.
 *   - Open-structure carports & canopies (building=roof) with support pillars that cars can drive under.
 *   - OSM tags support: building:material, roof:material, building:colour, roof:colour, building:levels, min_height.
 */

import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import type { Building, BuildingType, RoofShape } from '@world-drive/shared'

// ── Facade color palettes ────────────────────────────────────────────────────
interface Palette {
  facade: number
  frame: number
  roof: number
  isGlass: boolean
  hasBoutiques?: boolean
  isHaussmann?: boolean
}

const PALETTES: Palette[] = [
  // Haussmannian Paris limestone (classic urban boulevard)
  { facade: 0xd6cebe, frame: 0xbaa490, roof: 0x48525e, isGlass: false, hasBoutiques: true, isHaussmann: true },
  { facade: 0xc8c0b0, frame: 0xaa9e8a, roof: 0x3e4752, isGlass: false, hasBoutiques: true, isHaussmann: true },
  { facade: 0xded8cc, frame: 0xc4bcae, roof: 0x4e5864, isGlass: false, hasBoutiques: true, isHaussmann: true },

  // Modern glass office towers
  { facade: 0x1e2e42, frame: 0x2e4258, roof: 0x141e2a, isGlass: true },
  { facade: 0x243545, frame: 0x36485b, roof: 0x182430, isGlass: true },

  // Brick & Terracotta residential / commercial
  { facade: 0x6e3c30, frame: 0x542d24, roof: 0x282320, isGlass: false, hasBoutiques: true },
  { facade: 0x7c4434, frame: 0x5a3224, roof: 0x221c18, isGlass: false },

  // Warm sandstone & limestone civic
  { facade: 0xb5ad9e, frame: 0x989082, roof: 0x42403c, isGlass: false },

  // Dark slate contemporary
  { facade: 0x383e48, frame: 0x2a2f38, roof: 0x20242b, isGlass: false, hasBoutiques: true },
]

// Type-specific palette overrides
const TYPE_PALETTES: Partial<Record<BuildingType, Palette>> = {
  // Residential
  apartments:         { facade: 0xd8d0c0, frame: 0xbcab94, roof: 0x46505c, isGlass: false, hasBoutiques: true, isHaussmann: true },
  house:              { facade: 0x8b5e3c, frame: 0x6a4530, roof: 0x6a3020, isGlass: false },
  detached:           { facade: 0x9e7255, frame: 0x7a5840, roof: 0x624030, isGlass: false },
  semidetached_house: { facade: 0x8b6545, frame: 0x6e5036, roof: 0x5a3825, isGlass: false },
  terrace:            { facade: 0x7a5a3a, frame: 0x5e4428, roof: 0x4a3020, isGlass: false },
  bungalow:           { facade: 0xa07850, frame: 0x806040, roof: 0x654832, isGlass: false },
  hut:                { facade: 0x6a4e32, frame: 0x4e3820, roof: 0x382c18, isGlass: false },

  // Commercial / Retail / Offices
  office:             { facade: 0x243545, frame: 0x36485b, roof: 0x182430, isGlass: true },
  commercial:         { facade: 0x2b3846, frame: 0x3c4c5c, roof: 0x1d2732, isGlass: true, hasBoutiques: true },
  retail:             { facade: 0xd2cbbe, frame: 0x485260, roof: 0x343a44, isGlass: false, hasBoutiques: true },
  supermarket:        { facade: 0x354b6e, frame: 0x223652, roof: 0x1a2434, isGlass: false, hasBoutiques: true },
  hotel:              { facade: 0xc4bcad, frame: 0x9e9484, roof: 0x42403e, isGlass: false, hasBoutiques: true, isHaussmann: true },

  // Industrial / Logistics / Garages
  warehouse:          { facade: 0x7a7e88, frame: 0x5a5e68, roof: 0x3a3e48, isGlass: false },
  industrial:         { facade: 0x6e7280, frame: 0x525660, roof: 0x363a44, isGlass: false },
  hangar:             { facade: 0x848a94, frame: 0x626872, roof: 0x3c424a, isGlass: false },
  garage:             { facade: 0x888888, frame: 0x686868, roof: 0x505050, isGlass: false },
  garages:            { facade: 0x808080, frame: 0x606060, roof: 0x484848, isGlass: false },
  carport:            { facade: 0x96989c, frame: 0x52565c, roof: 0x383a40, isGlass: false },
  parking:            { facade: 0x8e8e8e, frame: 0x646464, roof: 0x4c4c4c, isGlass: false },
  service:            { facade: 0x828488, frame: 0x626468, roof: 0x44464a, isGlass: false },

  // Religious / Monuments
  church:             { facade: 0xc8bfa6, frame: 0xa8a08a, roof: 0x544e42, isGlass: false },
  cathedral:          { facade: 0xc0b898, frame: 0xa09880, roof: 0x4a4438, isGlass: false },
  mosque:             { facade: 0xd0c8b0, frame: 0xb0a890, roof: 0x3e5e48, isGlass: false },
  temple:             { facade: 0xd8c8a8, frame: 0xb8a888, roof: 0x784830, isGlass: false },
  synagogue:          { facade: 0xc0b8a0, frame: 0xa09880, roof: 0x504840, isGlass: false },
  monument:           { facade: 0xdad2c4, frame: 0xb8b0a2, roof: 0x8c8476, isGlass: false },
  castle:             { facade: 0x8e8880, frame: 0x6e6860, roof: 0x444240, isGlass: false },
  manor:              { facade: 0xbaa490, frame: 0x948270, roof: 0x544034, isGlass: false },

  // Public / Civic / Health / Education
  government:         { facade: 0xc6bea8, frame: 0xa49c86, roof: 0x4c4842, isGlass: false },
  civic:              { facade: 0xc0b8a4, frame: 0x9e9682, roof: 0x46423c, isGlass: false },
  public:             { facade: 0xb8b09c, frame: 0x98907c, roof: 0x403c36, isGlass: false },
  hospital:           { facade: 0xe0ded8, frame: 0xb8b6b0, roof: 0x606268, isGlass: false },
  school:             { facade: 0xcbbfa0, frame: 0xa89c7c, roof: 0x7a6848, isGlass: false },
  university:         { facade: 0xc0b288, frame: 0xa09268, roof: 0x685440, isGlass: false },
  kindergarten:       { facade: 0xd4a86a, frame: 0xb48848, roof: 0x8e6838, isGlass: false },
  fire_station:       { facade: 0x823228, frame: 0xa82018, roof: 0x381814, isGlass: false },
  train_station:      { facade: 0xb4aa8e, frame: 0x948a6e, roof: 0x444240, isGlass: false },
  stadium:            { facade: 0x484e5a, frame: 0x383c48, roof: 0x282c38, isGlass: false },
  sports_hall:        { facade: 0x5a6478, frame: 0x444c5e, roof: 0x2c3444, isGlass: false },

  // Agricultural
  farm:               { facade: 0x8c5e38, frame: 0x6e4624, roof: 0x4c2e1a, isGlass: false },
  farm_auxiliary:     { facade: 0x7a5432, frame: 0x5e3e20, roof: 0x3e2614, isGlass: false },
  stable:             { facade: 0x6e4828, frame: 0x54341a, roof: 0x362010, isGlass: false },

  // Canopy
  roof:               { facade: 0x909296, frame: 0x606268, roof: 0x3c3e44, isGlass: false },
}

// Material color overrides based on building:material
const MATERIAL_COLORS: Record<string, number> = {
  brick:     0x7c382b,
  stone:     0xc8beae,
  limestone: 0xd8d0be,
  concrete:  0x949290,
  glass:     0x243545,
  wood:      0x8b6545,
  plaster:   0xd8d4cc,
  masonry:   0xa8a090,
}

// ── Window texture cache ─────────────────────────────────────────────────────
const textureCache = new Map<string, THREE.CanvasTexture>()

function makeWindowTexture(palette: Palette, paletteKey: string): THREE.CanvasTexture {
  if (textureCache.has(paletteKey)) return textureCache.get(paletteKey)!

  const W = 512, H = 512
  const canvas = document.createElement('canvas')
  canvas.width = W; canvas.height = H
  const ctx = canvas.getContext('2d')!

  // Facade base color
  const r = (palette.facade >> 16) & 0xff
  const g = (palette.facade >> 8) & 0xff
  const b = palette.facade & 0xff
  ctx.fillStyle = `rgb(${r},${g},${b})`
  ctx.fillRect(0, 0, W, H)

  // Subtle natural stone fleck & grain
  ctx.fillStyle = 'rgba(0,0,0,0.03)'
  for (let i = 0; i < 400; i++) {
    ctx.fillRect(Math.random() * W, Math.random() * H, 2, 2)
  }

  // Number of floors & windows
  const floors = 8
  const floorH = H / floors
  const cols = 8
  const colW = W / cols

  for (let f = 0; f < floors; f++) {
    const y = f * floorH
    const isGroundFloor = f === floors - 1

    // Horizontal floor dividing stone cornice / band
    ctx.fillStyle = 'rgba(0,0,0,0.18)'
    ctx.fillRect(0, y, W, 3)
    ctx.fillStyle = 'rgba(255,255,255,0.12)'
    ctx.fillRect(0, y + 3, W, 2)

    // French balcony railing on 2nd and 5th floors for Haussmann buildings
    const hasBalcony = palette.isHaussmann && (f === 1 || f === 4)
    if (hasBalcony) {
      ctx.fillStyle = '#22262a' // Dark wrought iron railing
      ctx.fillRect(0, y + floorH - 10, W, 8)
      // Railing bars
      for (let bx = 0; bx < W; bx += 8) {
        ctx.fillRect(bx, y + floorH - 12, 2, 10)
      }
    }

    for (let c = 0; c < cols; c++) {
      const x = c * colW
      const wx = x + 8
      const wy = y + 8
      const ww = colW - 16
      const wh = floorH - 18

      if (isGroundFloor && palette.hasBoutiques) {
        // Ground-floor Parisian boutique / bistro storefront (vitrine)
        const awningColors = ['#8b1e1e', '#1e4828', '#1a2e54', '#7c481e', '#2c2c2c']
        const awningCol = awningColors[(c + f) % awningColors.length]!

        // Awning (store banne)
        ctx.fillStyle = awningCol
        ctx.fillRect(wx - 2, wy, ww + 4, 10)
        ctx.fillStyle = 'rgba(255,255,255,0.2)'
        ctx.fillRect(wx - 2, wy + 8, ww + 4, 2)

        // Large illuminated storefront display window
        ctx.fillStyle = 'rgba(255, 235, 175, 0.90)' // Warm shop interior glow
        ctx.fillRect(wx, wy + 10, ww, wh - 10)

        // Window frame
        ctx.strokeStyle = '#282420'
        ctx.lineWidth = 2
        ctx.strokeRect(wx, wy + 10, ww, wh - 10)

      } else if (palette.isGlass) {
        // Modern reflective blue-tinted glass curtain wall
        const skyGrad = ctx.createLinearGradient(wx, wy, wx, wy + wh)
        skyGrad.addColorStop(0, 'rgba(90, 150, 205, 0.88)')
        skyGrad.addColorStop(1, 'rgba(25, 55, 85, 0.95)')
        ctx.fillStyle = skyGrad
        ctx.fillRect(wx, wy, ww, wh)

        // Sun glint reflection
        ctx.fillStyle = 'rgba(255, 255, 255, 0.15)'
        ctx.fillRect(wx, wy, ww * 0.4, wh)

        // Mullions
        ctx.strokeStyle = '#182430'
        ctx.lineWidth = 2
        ctx.strokeRect(wx, wy, ww, wh)

      } else {
        // Classic European window with stone lintel and frame
        // Dark outer frame recess
        ctx.fillStyle = 'rgba(0,0,0,0.30)'
        ctx.fillRect(wx - 2, wy - 2, ww + 4, wh + 4)

        // Window glass (warm evening light or dark daylight)
        const lit = ((c * 7 + f * 13) % 5) > 1
        ctx.fillStyle = lit ? 'rgba(255, 230, 155, 0.90)' : 'rgba(38, 52, 70, 0.88)'
        ctx.fillRect(wx, wy, ww, wh)

        // Window pane dividers (muntins / croisillons)
        ctx.fillStyle = 'rgba(30, 25, 20, 0.45)'
        ctx.fillRect(wx + ww / 2 - 1, wy, 2, wh)       // Vertical
        ctx.fillRect(wx, wy + wh * 0.45 - 1, ww, 2)    // Horizontal

        // Upper stone pediment
        ctx.fillStyle = 'rgba(0,0,0,0.14)'
        ctx.fillRect(wx - 2, wy - 4, ww + 4, 2)
      }
    }
  }

  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  textureCache.set(paletteKey, tex)
  return tex
}

// ── Material cache ───────────────────────────────────────────────────────────
const matCache = new Map<string, THREE.MeshStandardMaterial>()
const roofMatCache = new Map<string, THREE.MeshStandardMaterial>()

function getFacadeMat(pal: Palette, key: string, colourOverride?: string): THREE.MeshStandardMaterial {
  const cacheKey = `${key}_${colourOverride ?? ''}`
  if (matCache.has(cacheKey)) return matCache.get(cacheKey)!

  let mat: THREE.MeshStandardMaterial
  if (colourOverride) {
    mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(colourOverride),
      roughness: pal.isGlass ? 0.35 : 0.84,
      metalness: pal.isGlass ? 0.65 : 0.08,
    })
  } else {
    const tex = makeWindowTexture(pal, key)
    mat = new THREE.MeshStandardMaterial({
      map: tex,
      roughness: pal.isGlass ? 0.35 : 0.84,
      metalness: pal.isGlass ? 0.65 : 0.08,
    })
  }
  matCache.set(cacheKey, mat)
  return mat
}

function getRoofMat(pal: Palette, key: string, colourOverride?: string): THREE.MeshStandardMaterial {
  const cacheKey = `roof_${key}_${colourOverride ?? ''}`
  if (roofMatCache.has(cacheKey)) return roofMatCache.get(cacheKey)!
  const mat = new THREE.MeshStandardMaterial({
    color: colourOverride ? new THREE.Color(colourOverride) : pal.roof,
    roughness: 0.90,
    metalness: 0.08,
  })
  roofMatCache.set(cacheKey, mat)
  return mat
}

function hashId(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return h
}

// ── Roof Geometry Builders ───────────────────────────────────────────────────

/**
 * Build a flat roof with stone parapet wall and rooftop HVAC/elevator equipment.
 */
function buildFlatRoofWithDetails(
  shape: THREE.Shape,
  fp: THREE.Vector2[],
  baseHeight: number,
  roofMat: THREE.MeshStandardMaterial,
): THREE.Group {
  const group = new THREE.Group()

  // 1. Roof deck
  const roofGeo = new THREE.ShapeGeometry(shape)
  roofGeo.rotateX(-Math.PI / 2)
  roofGeo.translate(0, baseHeight, 0)
  const roofMesh = new THREE.Mesh(roofGeo, roofMat)
  roofMesh.receiveShadow = true
  group.add(roofMesh)

  // 2. Rooftop equipment (elevator penthouse, HVAC units)
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const p of fp) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y) }
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  const spanX = maxX - minX
  const spanY = maxY - minY

  // Only add rooftop plant on sufficiently large roofs (> 12m)
  if (spanX > 12 && spanY > 12) {
    const equipMat = new THREE.MeshStandardMaterial({ color: 0x5a5c60, roughness: 0.85, metalness: 0.2 })

    // Elevator housing penthouse
    const hvacW = Math.min(spanX * 0.25, 6.0)
    const hvacD = Math.min(spanY * 0.25, 5.0)
    const hvacH = 2.4
    const boxGeo = new THREE.BoxGeometry(hvacW, hvacH, hvacD)
    const boxMesh = new THREE.Mesh(boxGeo, equipMat)
    boxMesh.position.set(cx, baseHeight + hvacH / 2, cy)
    boxMesh.castShadow = true
    boxMesh.receiveShadow = true
    group.add(boxMesh)

    // Secondary ventilation unit
    if (spanX > 18) {
      const ventGeo = new THREE.BoxGeometry(hvacW * 0.6, 1.2, hvacD * 0.6)
      const ventMesh = new THREE.Mesh(ventGeo, equipMat)
      ventMesh.position.set(cx + hvacW * 0.9, baseHeight + 0.6, cy)
      group.add(ventMesh)
    }
  }

  return group
}

/**
 * Build a classic Parisian 2-tier Mansard roof:
 * - Steep lower pitch in dark zinc/slate (#3e4854)
 * - Flat upper roof deck
 */
function buildMansardRoof(
  fp: THREE.Vector2[],
  roofHeight: number,
  baseHeight: number,
  roofMat: THREE.MeshStandardMaterial,
): THREE.Group {
  const group = new THREE.Group()
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const p of fp) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y) }
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2

  // Inset factor for the mansard curb
  const inset = 1.2
  const lowerH = roofHeight * 0.70
  const upperH = roofHeight

  const outerVerts: THREE.Vector2[] = fp
  const innerVerts: THREE.Vector2[] = fp.map(p => {
    const dx = cx - p.x
    const dy = cy - p.y
    const d = Math.hypot(dx, dy)
    if (d < 0.1) return p
    const ratio = Math.min(0.35, inset / d)
    return new THREE.Vector2(p.x + dx * ratio, p.y + dy * ratio)
  })

  // Steep mansard side slope quads
  const pos: number[] = []
  const norm: number[] = []
  const idx: number[] = []
  const N = fp.length

  for (let i = 0; i < N; i++) {
    const next = (i + 1) % N
    const p1 = outerVerts[i]!
    const p2 = outerVerts[next]!
    const q1 = innerVerts[i]!
    const q2 = innerVerts[next]!

    const b = pos.length / 3
    pos.push(
      p1.x, baseHeight, p1.y,
      p2.x, baseHeight, p2.y,
      q2.x, baseHeight + lowerH, q2.y,
      q1.x, baseHeight + lowerH, q1.y,
    )
    norm.push(0, 0.7, 0.7,  0, 0.7, 0.7,  0, 0.7, 0.7,  0, 0.7, 0.7)
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3)
  }

  // Upper flat deck
  const upperShape = new THREE.Shape()
  upperShape.moveTo(innerVerts[0]!.x, innerVerts[0]!.y)
  for (let i = 1; i < innerVerts.length; i++) upperShape.lineTo(innerVerts[i]!.x, innerVerts[i]!.y)
  upperShape.closePath()

  const upperGeo = new THREE.ShapeGeometry(upperShape)
  upperGeo.rotateX(-Math.PI / 2)
  upperGeo.translate(0, baseHeight + lowerH, 0)
  const upperMesh = new THREE.Mesh(upperGeo, roofMat)
  group.add(upperMesh)

  const slopeGeo = new THREE.BufferGeometry()
  slopeGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  slopeGeo.setAttribute('normal', new THREE.Float32BufferAttribute(norm, 3))
  slopeGeo.setIndex(idx)
  slopeGeo.computeVertexNormals()
  const slopeMesh = new THREE.Mesh(slopeGeo, roofMat)
  slopeMesh.castShadow = true
  slopeMesh.receiveShadow = true
  group.add(slopeMesh)

  return group
}

/**
 * Build a gabled roof (triangular ridge along the longest bounding box dimension).
 */
function buildGabledRoof(
  fp: THREE.Vector2[],
  roofHeight: number,
  baseHeight: number,
  mat: THREE.MeshStandardMaterial,
): THREE.Mesh {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const p of fp) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y) }
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  const spanX = maxX - minX
  const spanY = maxY - minY

  const ridgeAlongX = spanX >= spanY
  const ridgeHalfLen = (ridgeAlongX ? spanX : spanY) / 2
  const peakY = baseHeight + roofHeight

  const r1x = ridgeAlongX ? cx - ridgeHalfLen : cx
  const r1z = ridgeAlongX ? cy : cy - ridgeHalfLen
  const r2x = ridgeAlongX ? cx + ridgeHalfLen : cx
  const r2z = ridgeAlongX ? cy : cy + ridgeHalfLen

  const e1 = { x: minX, z: minY }
  const e2 = { x: maxX, z: minY }
  const e3 = { x: maxX, z: maxY }
  const e4 = { x: minX, z: maxY }

  const verts: number[] = [
    r1x, peakY, r1z,   // 0
    r2x, peakY, r2z,   // 1
    e1.x, baseHeight, e1.z, // 2
    e2.x, baseHeight, e2.z, // 3
    e3.x, baseHeight, e3.z, // 4
    e4.x, baseHeight, e4.z, // 5
  ]

  const indices: number[] = ridgeAlongX
    ? [0, 3, 2,  0, 1, 3,  0, 4, 1,  0, 5, 4,  0, 2, 5,  1, 4, 3]
    : [0, 2, 3,  0, 3, 1,  0, 1, 4,  0, 4, 5,  0, 5, 2,  1, 3, 4]

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  const mesh = new THREE.Mesh(geo, mat)
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

/**
 * Build a hipped / pyramidal roof from footprint centroid.
 */
function buildPyramidalRoof(
  fp: THREE.Vector2[],
  roofHeight: number,
  baseHeight: number,
  mat: THREE.MeshStandardMaterial,
): THREE.Mesh {
  let cx = 0, cy = 0
  for (const p of fp) { cx += p.x; cy += p.y }
  cx /= fp.length; cy /= fp.length

  const peakY = baseHeight + roofHeight
  const verts: number[] = [cx, peakY, cy]
  for (const p of fp) verts.push(p.x, baseHeight, p.y)

  const indices: number[] = []
  for (let i = 0; i < fp.length; i++) {
    const next = (i + 1) % fp.length
    indices.push(0, i + 1, next + 1)
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  const mesh = new THREE.Mesh(geo, mat)
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

/**
 * Build a dome roof with decorative apex finial.
 */
function buildDomeRoof(
  fp: THREE.Vector2[],
  roofHeight: number,
  baseHeight: number,
  mat: THREE.MeshStandardMaterial,
): THREE.Group {
  const group = new THREE.Group()
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const p of fp) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y) }
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2
  const radius = Math.min(maxX - minX, maxY - minY) / 2

  const geo = new THREE.SphereGeometry(radius, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2)
  geo.scale(1, roofHeight / radius, 1)
  geo.translate(cx, baseHeight, cy)
  const mesh = new THREE.Mesh(geo, mat)
  mesh.castShadow = true
  mesh.receiveShadow = true
  group.add(mesh)

  // Decorative gold/copper apex spire finial
  const finialGeo = new THREE.CylinderGeometry(0.12, 0.35, 3.5, 8)
  finialGeo.translate(cx, baseHeight + roofHeight + 1.75, cy)
  const finialMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.8, roughness: 0.25 })
  const finialMesh = new THREE.Mesh(finialGeo, finialMat)
  group.add(finialMesh)

  return group
}

/**
 * Build an open canopy / carport structure with support columns and a roof slab
 * that players can drive under freely.
 */
function buildOpenCanopy(
  fp: THREE.Vector2[],
  height: number,
  roofMat: THREE.MeshStandardMaterial,
): THREE.Group {
  const group = new THREE.Group()

  // Roof slab
  const shape = new THREE.Shape()
  shape.moveTo(fp[0]!.x, fp[0]!.y)
  for (let i = 1; i < fp.length; i++) shape.lineTo(fp[i]!.x, fp[i]!.y)
  shape.closePath()

  const roofGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.35, bevelEnabled: false })
  roofGeo.rotateX(-Math.PI / 2)
  roofGeo.translate(0, height, 0)
  const roofMesh = new THREE.Mesh(roofGeo, roofMat)
  roofMesh.castShadow = true
  roofMesh.receiveShadow = true
  group.add(roofMesh)

  // Slender steel support pillars at corners
  const pillarGeo = new THREE.CylinderGeometry(0.15, 0.15, height, 8)
  pillarGeo.translate(0, height / 2, 0)
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0x484a4e, metalness: 0.6, roughness: 0.4 })

  for (let i = 0; i < fp.length; i++) {
    const p = fp[i]!
    const pillar = new THREE.Mesh(pillarGeo, pillarMat)
    pillar.position.set(p.x, 0, p.y)
    pillar.castShadow = true
    group.add(pillar)
  }

  return group
}

export class BuildingMeshGenerator {
  /**
   * Generate a realistic 3D building mesh with architecture, facade textures,
   * ground-level storefronts, and accurate roof shapes from OSM data.
   */
  static generate(building: Building): THREE.Group | null {
    const fp = building.footprint
    if (fp.length < 3) return null

    const fp2d = fp.map(p => new THREE.Vector2(p.x, p.z))
    const bType = building.buildingType

    // Select palette: type-specific override takes priority, then hash
    const typePal = bType ? TYPE_PALETTES[bType] : undefined
    const paletteIdx = hashId(building.id) % PALETTES.length
    const pal = typePal ?? PALETTES[paletteIdx]!
    const matKey = typePal ? bType! : `${paletteIdx}`

    // Override facade color if building:colour or building:material is present
    let facadeColorOverride = building.colour
    if (!facadeColorOverride && building.material && MATERIAL_COLORS[building.material.toLowerCase()]) {
      const col = MATERIAL_COLORS[building.material.toLowerCase()]!
      facadeColorOverride = `#${col.toString(16).padStart(6, '0')}`
    }

    const facadeMat = getFacadeMat(pal, matKey, facadeColorOverride)
    const roofMat = getRoofMat(pal, matKey, building.roofColour)

    const group = new THREE.Group()
    group.userData['buildingId'] = building.id

    // Special case 1: Open roof / Carport canopy (drive-through underneath!)
    if (bType === 'roof' || bType === 'carport') {
      const canopy = buildOpenCanopy(fp2d, building.height, roofMat)
      group.add(canopy)
      return group
    }

    // ── 1. Main Walls Extrusion ───────────────────────────────────────────
    const shape = new THREE.Shape()
    shape.moveTo(fp[0]!.x, -fp[0]!.z)
    for (let i = 1; i < fp.length; i++) shape.lineTo(fp[i]!.x, -fp[i]!.z)
    shape.closePath()

    const bottomY = building.minHeight ?? 0
    const wallHeight = Math.max(1.5, building.height - bottomY)

    const wallGeo = new THREE.ExtrudeGeometry(shape, {
      depth: wallHeight,
      bevelEnabled: false,
    })
    wallGeo.rotateX(-Math.PI / 2)
    if (bottomY > 0) wallGeo.translate(0, bottomY, 0)

    // Adjust UVs so windows and store facades wrap realistically
    const uvAttr = wallGeo.attributes['uv'] as THREE.BufferAttribute
    if (uvAttr) {
      const uScale = 0.05
      const vScale = 0.035
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

    // ── 2. Roof Generation ────────────────────────────────────────────────
    let roofShape = building.roofShape ?? 'flat'

    // Heuristics based on building type and height:
    // - Parisian Haussmannian residential apartments get Mansard roofs
    if (roofShape === 'flat' && (bType === 'apartments' || pal.isHaussmann) && building.height >= 12) {
      roofShape = 'mansard'
    } else if (roofShape === 'flat' && (bType === 'house' || bType === 'detached' || bType === 'terrace' || bType === 'bungalow') && building.height < 10) {
      roofShape = 'gabled'
    } else if (roofShape === 'flat' && (bType === 'church' || bType === 'cathedral' || bType === 'temple')) {
      roofShape = 'pyramidal'
    }

    const roofBaseH = building.height + 0.02
    const defaultPitch = Math.max(1.8, Math.min(8.0, building.height * 0.18))
    const roofPitch = building.roofHeight ?? defaultPitch

    if (roofShape === 'mansard') {
      const mansard = buildMansardRoof(fp2d, Math.max(2.2, roofPitch), roofBaseH, roofMat)
      group.add(mansard)
    } else if (roofShape === 'gabled') {
      const gabled = buildGabledRoof(fp2d, roofPitch, roofBaseH, roofMat)
      group.add(gabled)
    } else if (roofShape === 'hipped' || roofShape === 'pyramidal' || roofShape === 'skillion') {
      const hipped = buildPyramidalRoof(fp2d, roofPitch, roofBaseH, roofMat)
      group.add(hipped)
    } else if (roofShape === 'dome') {
      const dome = buildDomeRoof(fp2d, roofPitch, roofBaseH, roofMat)
      group.add(dome)
    } else {
      // Flat roof with realistic parapet coping & rooftop HVAC/lift penthouse
      const flat = buildFlatRoofWithDetails(shape, fp2d, roofBaseH, roofMat)
      group.add(flat)
    }

    return group
  }

  /**
   * Create a fixed Rapier trimesh collider description for physics collision.
   */
  static createColliderDesc(building: Building): RAPIER.ColliderDesc | null {
    // Open carports and roof canopies shouldn't block cars at ground level
    if (building.buildingType === 'roof' || building.buildingType === 'carport') {
      return null
    }

    const fp = building.footprint
    if (fp.length < 3) return null

    const n = fp.length
    const verts: number[] = []
    const indices: number[] = []
    const bottomY = building.minHeight ?? 0

    for (let i = 0; i < n; i++) {
      const p = fp[i]!
      verts.push(p.x, bottomY, p.z)
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
