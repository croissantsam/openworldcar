/**
 * Building facade texture generation & material caching.
 * Generates procedural window textures with normal maps per architectural style.
 */

import * as THREE from 'three'
import type { Palette } from './building-palettes'
import { heightToNormalTexture, H_FLAT } from '../FacadeRelief'
import { ROOF_MATERIAL_COLORS } from './building-palettes'

interface FacadeTextures {
  map: THREE.CanvasTexture
  normalMap: THREE.CanvasTexture
}

const textureCache = new Map<string, FacadeTextures>()

/** Distinct level variants: taller buildings repeat the texture every MAX_TEXTURE_ROWS floors. */
const MAX_TEXTURE_ROWS = 24
const ROW_PX = 64

// Relief levels for the height map (H_FLAT = wall plane; ± ≈ 0.4 cm per unit at 64 px / floor)
const H_RECESS = H_FLAT - 40      // window reveal ~15 cm back
const H_DOOR = H_FLAT - 30
const H_SILL = H_FLAT + 34        // sill / lintel protruding
const H_BAND = H_FLAT + 26        // string course / floor band
const H_PLINTH = H_FLAT + 14      // ground-floor plinth band
const H_JOINT = H_FLAT - 22       // rustication joint
const H_MULLION = H_FLAT + 16     // glass-curtain mullions
const H_GLASS = H_FLAT - 10

const matCache = new Map<string, THREE.MeshStandardMaterial>()
const roofMatCache = new Map<string, THREE.MeshStandardMaterial>()

export function makeWindowTexture(palette: Palette, cacheKey: string, rows: number): FacadeTextures {
  const cached = textureCache.get(cacheKey)
  if (cached) return cached

  const floors = Math.max(1, Math.min(MAX_TEXTURE_ROWS, Math.round(rows)))
  const W = 512
  const H = floors * ROW_PX
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!

  // Matching height map: drawn in lockstep with the colour canvas, turned into a normal map at the end.
  const hcanvas = document.createElement('canvas')
  hcanvas.width = W
  hcanvas.height = H
  const hctx = hcanvas.getContext('2d')!
  hctx.fillStyle = `rgb(${H_FLAT},${H_FLAT},${H_FLAT})`
  hctx.fillRect(0, 0, W, H)
  const hfill = (x: number, y: number, w: number, h: number, level: number) => {
    const l = Math.max(0, Math.min(255, Math.round(level)))
    hctx.fillStyle = `rgb(${l},${l},${l})`
    hctx.fillRect(x, y, w, h)
  }
  // Baked ambient occlusion: dark gradient fading downward (under lintels / balconies) or upward (wall base)
  const aoBand = (y: number, h: number, alpha: number, fadeDown: boolean) => {
    const g = ctx.createLinearGradient(0, y, 0, y + h)
    g.addColorStop(0, `rgba(0,0,0,${fadeDown ? alpha : 0})`)
    g.addColorStop(1, `rgba(0,0,0,${fadeDown ? 0 : alpha})`)
    ctx.fillStyle = g
    ctx.fillRect(0, y, W, h)
  }

  const style = palette.style

  // 1. Facade base color
  const r = (palette.facade >> 16) & 0xff
  const g = (palette.facade >> 8) & 0xff
  const b = palette.facade & 0xff
  ctx.fillStyle = `rgb(${r},${g},${b})`
  ctx.fillRect(0, 0, W, H)

  // 2. Surface material grain & subtle bonding
  if (style === 'brick') {
    ctx.strokeStyle = 'rgba(230, 220, 210, 0.25)'
    ctx.lineWidth = 1
    const brickH = 8
    const brickW = 16
    for (let by = 0; by < H; by += brickH) {
      ctx.beginPath(); ctx.moveTo(0, by); ctx.lineTo(W, by); ctx.stroke()
      const offset = (by / brickH) % 2 === 0 ? 0 : brickW / 2
      for (let bx = offset; bx < W; bx += brickW) {
        ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx, by + brickH); ctx.stroke()
      }
    }
  } else if (style === 'industrial') {
    for (let x = 0; x < W; x += 6) {
      ctx.fillStyle = (x % 12 === 0) ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.08)'
      ctx.fillRect(x, 0, 2, H)
    }
  } else if (style === 'agricultural') {
    ctx.strokeStyle = 'rgba(0,0,0,0.2)'
    ctx.lineWidth = 2
    for (let y = 0; y < H; y += 16) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke()
    }
  } else if (style !== 'glass_curtain') {
    // Subtle natural stone / render fleck
    ctx.fillStyle = 'rgba(0,0,0,0.03)'
    const flecks = 50 * floors
    for (let i = 0; i < flecks; i++) {
      ctx.fillRect(Math.random() * W, Math.random() * H, 2, 2)
    }
  }

  // 3. Floors & windows: row 0 is the top floor, the last row is the ground floor
  const floorH = ROW_PX
  const cols = style === 'residential_house' ? 6 : 8
  const colW = W / cols
  const hasCornice = style === 'haussmann' || style === 'civic_classical'
  const hasStringcourse = style === 'render' || style === 'commercial_boutique' || style === 'brick'

  for (let f = 0; f < floors; f++) {
    const y = f * floorH
    const isGroundFloor = f === floors - 1
    const floorFromGround = floors - 1 - f

    // Horizontal floor dividing band
    if (hasCornice) {
      ctx.fillStyle = 'rgba(0,0,0,0.22)'
      ctx.fillRect(0, y, W, 3)
      ctx.fillStyle = 'rgba(255,255,255,0.18)'
      ctx.fillRect(0, y + 3, W, 2)
      hfill(0, y, W, 5, H_BAND)
      if (f > 0) aoBand(y + 5, 5, 0.18, true)
    } else if (hasStringcourse && f > 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.10)'
      ctx.fillRect(0, y, W, 2)
      hfill(0, y, W, 3, H_BAND)
      aoBand(y + 3, 4, 0.12, true)
    }

    // Ground-floor plinth (soubassement): darker base band + rustication for stone facades
    if (isGroundFloor && style !== 'industrial' && style !== 'garage' && style !== 'glass_curtain' && style !== 'religious' && style !== 'greenhouse') {
      ctx.fillStyle = 'rgba(0,0,0,0.16)'
      ctx.fillRect(0, y + floorH - 6, W, 6)
      hfill(0, y + floorH - 6, W, 6, H_PLINTH)
      if (style === 'haussmann' || style === 'civic_classical') {
        ctx.fillStyle = 'rgba(0,0,0,0.12)'
        for (let gy = y + 2; gy < H; gy += 14) {
          ctx.fillRect(0, gy, W, 2)
          hfill(0, gy, W, 2, H_JOINT)
        }
      }
    }

    // Wrought-iron balcony railings on the 2nd and 5th floors counted from the ground
    const hasBalcony = style === 'haussmann' && floors >= 4 && (floorFromGround === 2 || floorFromGround === 5)
    if (hasBalcony) {
      // Bars reach the geometric handrail (0.86 m ≈ 16 px of a 64 px floor)
      ctx.fillStyle = '#1c1f24'
      ctx.fillRect(0, y + floorH - 10, W, 8)
      for (let bx = 0; bx < W; bx += 8) ctx.fillRect(bx, y + floorH - 18, 2, 16)
      ctx.fillStyle = 'rgba(255, 215, 0, 0.4)'
      ctx.fillRect(0, y + floorH - 18, W, 2)
      hfill(0, y + floorH - 3, W, 3, H_SILL)
      // Occlusion on the wall under the balcony slab (top of the floor below)
      if (f + 1 < floors) aoBand(y + floorH, 7, 0.28, true)
    }

    for (let c = 0; c < cols; c++) {
      const x = c * colW
      const wx = x + 8
      const wy = y + 8
      const ww = colW - 16
      const wh = floorH - 18

      if (isGroundFloor && (style === 'industrial' || style === 'garage')) {
        // ── Industrial segmented roll-up garage door ─────────────────────────
        ctx.fillStyle = '#4a5058'
        ctx.fillRect(wx, wy, ww, wh)
        hfill(wx, wy, ww, wh, H_DOOR)
        ctx.fillStyle = 'rgba(0,0,0,0.2)'
        for (let sy = wy; sy < wy + wh; sy += 6) ctx.fillRect(wx, sy, ww, 1.5)
        ctx.fillStyle = '#f1c40f'
        ctx.fillRect(wx, wy, ww, 4)
        ctx.fillStyle = '#1e1e1e'
        for (let hx = wx; hx < wx + ww; hx += 8) ctx.fillRect(hx, wy, 4, 4)

      } else if (isGroundFloor && style !== 'glass_curtain' && style !== 'religious' && style !== 'greenhouse') {
        // ── Neutral ground floor: entrance door in the middle bay, taller windows elsewhere ──
        // (real shops are drawn on top of this band by the storefront generator)
        const gwy = y + 6
        const gwh = floorH - 14
        const isCenterDoor = c === Math.floor(cols / 2)
        // Recessed reveal + protruding lintel for the whole ground-floor bay
        hfill(wx - 2, gwy - 2, ww + 4, gwh + 2, isCenterDoor ? H_DOOR : H_RECESS)
        hfill(wx - 3, gwy - 5, ww + 6, 3, H_SILL)
        if (isCenterDoor) {
          ctx.fillStyle = '#2d1e16'
          ctx.fillRect(wx, gwy, ww, gwh)
          ctx.fillStyle = 'rgba(255, 230, 160, 0.85)'
          ctx.fillRect(wx + 4, gwy + 2, ww - 8, 8)
          ctx.strokeStyle = '#180e08'
          ctx.lineWidth = 2
          ctx.strokeRect(wx + 3, gwy + 12, ww / 2 - 4, gwh - 14)
          ctx.strokeRect(wx + ww / 2 + 1, gwy + 12, ww / 2 - 4, gwh - 14)
          ctx.fillStyle = '#d4af37'
          ctx.fillRect(wx + ww / 2 - 2, gwy + gwh * 0.55, 4, 6)
        } else {
          ctx.fillStyle = 'rgba(0,0,0,0.3)'
          ctx.fillRect(wx - 2, gwy - 2, ww + 4, gwh + 4)
          const lit = ((c * 5 + floors) % 3) !== 0
          ctx.fillStyle = lit ? 'rgba(240, 220, 160, 0.75)' : 'rgba(40, 52, 68, 0.85)'
          ctx.fillRect(wx, gwy, ww, gwh)
          if (style === 'residential_house' || style === 'haussmann') {
            ctx.fillStyle = '#222'
            for (let gx = wx + 4; gx < wx + ww; gx += 6) ctx.fillRect(gx, gwy, 1.5, gwh)
          } else {
            ctx.fillStyle = 'rgba(28, 24, 20, 0.50)'
            ctx.fillRect(wx + ww / 2 - 1, gwy, 2, gwh)
          }
        }

      } else if (style === 'glass_curtain') {
        // ── Modern reflective blue-tinted glass curtain wall ─────────────────
        const skyGrad = ctx.createLinearGradient(wx, wy, wx, wy + wh)
        skyGrad.addColorStop(0, 'rgba(80, 150, 210, 0.90)')
        skyGrad.addColorStop(1, 'rgba(20, 48, 76, 0.95)')
        ctx.fillStyle = skyGrad
        ctx.fillRect(wx, wy, ww, wh)
        ctx.fillStyle = 'rgba(255, 255, 255, 0.18)'
        ctx.fillRect(wx, wy, ww * 0.35, wh)
        const isOfficeLit = ((c * 5 + f * 11) % 4) !== 0
        if (isOfficeLit) {
          ctx.fillStyle = 'rgba(255, 245, 205, 0.35)'
          ctx.fillRect(wx + 2, wy + 2, ww - 4, 3)
          ctx.fillRect(wx + 2, wy + 8, ww - 4, 3)
        }
        ctx.strokeStyle = '#141e28'
        ctx.lineWidth = 2
        ctx.strokeRect(wx, wy, ww, wh)
        hfill(wx - 3, wy - 3, ww + 6, wh + 6, H_MULLION)
        hfill(wx + 1, wy + 1, ww - 2, wh - 2, H_GLASS)

      } else if (style === 'religious') {
        // ── Gothic / Romanesque lancet arched window with stained glass ──────
        ctx.fillStyle = 'rgba(0,0,0,0.45)'
        ctx.fillRect(wx, wy, ww, wh)
        hfill(wx, wy, ww, wh, H_RECESS)
        hfill(wx - 2, wy + wh, ww + 4, 3, H_SILL)
        const lit = ((c * 3 + f * 7) % 3) !== 0
        ctx.fillStyle = lit ? 'rgba(255, 200, 100, 0.85)' : 'rgba(180, 60, 40, 0.70)'
        ctx.fillRect(wx + 2, wy + 4, ww - 4, wh - 6)
        ctx.fillStyle = '#3a3832'
        ctx.fillRect(wx + ww / 2 - 1, wy, 2, wh)

      } else {
        // ── Classic window with lintel, sill, and frame ──────────────────────
        ctx.fillStyle = 'rgba(0,0,0,0.32)'
        ctx.fillRect(wx - 2, wy - 2, ww + 4, wh + 4)
        const isWindowLit = ((c * 7 + f * 13) % 5) > 1
        ctx.fillStyle = isWindowLit ? 'rgba(255, 230, 155, 0.92)' : 'rgba(38, 52, 70, 0.88)'
        ctx.fillRect(wx, wy, ww, wh)
        ctx.fillStyle = 'rgba(28, 24, 20, 0.50)'
        ctx.fillRect(wx + ww / 2 - 1, wy, 2, wh)
        ctx.fillRect(wx, wy + wh * 0.45 - 1, ww, 2)
        ctx.fillStyle = 'rgba(0,0,0,0.20)'
        ctx.fillRect(wx - 3, wy - 4, ww + 6, 2)
        ctx.fillStyle = 'rgba(255,255,255,0.15)'
        ctx.fillRect(wx - 3, wy - 2, ww + 6, 1)
        ctx.fillStyle = 'rgba(0,0,0,0.25)'
        ctx.fillRect(wx - 3, wy + wh + 1, ww + 6, 3)
        // Relief: recessed reveal, protruding lintel above and sill below; AO just under the lintel
        hfill(wx - 2, wy - 2, ww + 4, wh + 4, H_RECESS)
        hfill(wx - 3, wy - 5, ww + 6, 3, H_SILL)
        hfill(wx - 3, wy + wh + 1, ww + 6, 3, H_SILL)
        const lg = ctx.createLinearGradient(0, wy - 2, 0, wy + 4)
        lg.addColorStop(0, 'rgba(0,0,0,0.30)')
        lg.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = lg
        ctx.fillRect(wx - 2, wy - 2, ww + 4, 6)
      }
    }
  }

  // Baked AO at the base of the wall (bottom ~0.5 m of the ground floor)
  aoBand(H - 11, 11, 0.30, false)

  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.anisotropy = 4
  const normalMap = heightToNormalTexture(hcanvas, style === 'glass_curtain' ? 1.4 : 2.0)
  const result: FacadeTextures = { map: tex, normalMap }
  textureCache.set(cacheKey, result)
  return result
}

export function getFacadeMat(pal: Palette, key: string, rows: number, colourOverride?: string): THREE.MeshStandardMaterial {
  const cacheKey = `${key}_L${rows}_${colourOverride ?? ''}`
  if (matCache.has(cacheKey)) return matCache.get(cacheKey)!

  // A building:colour / building:material tint keeps the window rows: tint the base palette.
  let effective = pal
  if (colourOverride) {
    const hex = new THREE.Color(colourOverride).getHex()
    effective = { ...pal, facade: hex, frame: (hex >> 1) & 0x7f7f7f }
  }
  const { map, normalMap } = makeWindowTexture(effective, cacheKey, rows)
  const mat = new THREE.MeshStandardMaterial({
    map,
    normalMap,
    normalScale: new THREE.Vector2(0.7, 0.7),
    roughness: pal.isGlass ? 0.35 : 0.84,
    metalness: pal.isGlass ? 0.65 : 0.08,
  })
  matCache.set(cacheKey, mat)
  return mat
}

export function getRoofMat(pal: Palette, key: string, colourOverride?: string, materialOverride?: string): THREE.MeshStandardMaterial {
  const cacheKey = `roof_${key}_${colourOverride ?? ''}_${materialOverride ?? ''}`
  if (roofMatCache.has(cacheKey)) return roofMatCache.get(cacheKey)!

  let roofColor = pal.roof
  if (colourOverride) {
    roofColor = new THREE.Color(colourOverride).getHex()
  } else if (materialOverride && ROOF_MATERIAL_COLORS[materialOverride.toLowerCase()]) {
    roofColor = ROOF_MATERIAL_COLORS[materialOverride.toLowerCase()]!
  }

  const isMetal = materialOverride === 'zinc' || materialOverride === 'copper' || materialOverride === 'metal'
  const mat = new THREE.MeshStandardMaterial({
    color: roofColor,
    roughness: isMetal ? 0.45 : 0.88,
    metalness: isMetal ? 0.55 : 0.08,
  })
  roofMatCache.set(cacheKey, mat)
  return mat
}

export function hashId(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return h
}