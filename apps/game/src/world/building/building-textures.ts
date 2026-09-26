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
  /** Lit windows only (black elsewhere) — multiplied by material.emissive at night. */
  emissiveMap: THREE.CanvasTexture
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
/** Last night-glow level, applied to materials created between solar ticks. */
let currentGlow = 0

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

  // Night windows: same lit rects as the colour canvas, warm on black.
  // The material's emissiveIntensity (0 by day) fades them in after dusk.
  const ecanvas = document.createElement('canvas')
  ecanvas.width = W
  ecanvas.height = H
  const ectx = ecanvas.getContext('2d')!
  ectx.fillStyle = '#000000'
  ectx.fillRect(0, 0, W, H)
  const elit = (x: number, y: number, w: number, h: number) => {
    ectx.fillStyle = '#8a6838'
    ectx.fillRect(x, y, w, h)
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
  } else if (style === 'religious') {
    // Medieval / Gothic ashlar stone blocks (appareil de pierre de taille régulier)
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.16)'
    ctx.lineWidth = 1
    const blockH = 16
    const blockW = 32
    for (let by = 0; by < H; by += blockH) {
      ctx.beginPath(); ctx.moveTo(0, by); ctx.lineTo(W, by); ctx.stroke()
      hfill(0, by, W, 1, H_JOINT)
      const offset = (by / blockH) % 2 === 0 ? 0 : blockW / 2
      for (let bx = offset; bx < W; bx += blockW) {
        ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx, by + blockH); ctx.stroke()
        hfill(bx, by, 1, blockH, H_JOINT)
      }
    }
  } else if (style === 'synagogue') {
    // Jerusalem limestone blocks with subtle alternating warm stone bands
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.14)'
    ctx.lineWidth = 1
    const blockH = 14
    const blockW = 28
    for (let by = 0; by < H; by += blockH) {
      if ((by / blockH) % 2 === 0) {
        ctx.fillStyle = 'rgba(215, 195, 160, 0.18)'
        ctx.fillRect(0, by, W, blockH)
      }
      ctx.beginPath(); ctx.moveTo(0, by); ctx.lineTo(W, by); ctx.stroke()
      hfill(0, by, W, 1, H_JOINT)
      const offset = (by / blockH) % 2 === 0 ? 0 : blockW / 2
      for (let bx = offset; bx < W; bx += blockW) {
        ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx, by + blockH); ctx.stroke()
        hfill(bx, by, 1, blockH, H_JOINT)
      }
    }
  } else if (style === 'academic_school') {
    // Academic brickwork with light stone quoins & courses
    ctx.strokeStyle = 'rgba(235, 225, 215, 0.22)'
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
  } else if (style === 'academic_university') {
    // Monumental ashlar stone blocks (appareil de pierre de taille noble)
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.16)'
    ctx.lineWidth = 1
    const blockH = 16
    const blockW = 32
    for (let by = 0; by < H; by += blockH) {
      ctx.beginPath(); ctx.moveTo(0, by); ctx.lineTo(W, by); ctx.stroke()
      hfill(0, by, W, 1, H_JOINT)
      const offset = (by / blockH) % 2 === 0 ? 0 : blockW / 2
      for (let bx = offset; bx < W; bx += blockW) {
        ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx, by + blockH); ctx.stroke()
        hfill(bx, by, 1, blockH, H_JOINT)
      }
    }
  } else if (style === 'townhall') {
    // Noble French limestone ashlar masonry with fine joints & classical rustication
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)'
    ctx.lineWidth = 1
    const blockH = 16
    const blockW = 32
    for (let by = 0; by < H; by += blockH) {
      ctx.beginPath(); ctx.moveTo(0, by); ctx.lineTo(W, by); ctx.stroke()
      hfill(0, by, W, 1, H_JOINT)
      const offset = (by / blockH) % 2 === 0 ? 0 : blockW / 2
      for (let bx = offset; bx < W; bx += blockW) {
        ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx, by + blockH); ctx.stroke()
        hfill(bx, by, 1, blockH, H_JOINT)
      }
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
  const cols = style === 'residential_house' ? 6 : (style === 'religious' || style === 'synagogue' ? 4 : (style === 'academic_university' || style === 'townhall' ? 6 : 8))
  const colW = W / cols
  const hasCornice = style === 'haussmann' || style === 'civic_classical' || style === 'academic_school' || style === 'academic_university' || style === 'hotel' || style === 'townhall'
  const hasStringcourse = style === 'render' || style === 'commercial_boutique' || style === 'brick' || style === 'academic_school' || style === 'academic_university' || style === 'hotel' || style === 'hospital' || style === 'townhall'

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
      if (style === 'haussmann' || style === 'civic_classical' || style === 'academic_university' || style === 'hotel' || style === 'townhall') {
        ctx.fillStyle = 'rgba(0,0,0,0.12)'
        for (let gy = y + 2; gy < H; gy += 14) {
          ctx.fillRect(0, gy, W, 2)
          hfill(0, gy, W, 2, H_JOINT)
        }
      }
    }

    // Wrought-iron balcony railings on the 2nd and 5th floors counted from the ground
    const hasBalcony = (style === 'haussmann' && floors >= 4 && (floorFromGround === 2 || floorFromGround === 5)) ||
      (style === 'hotel' && floors >= 3 && floorFromGround >= 1 && (floorFromGround % 2 === 1 || floorFromGround === 2))
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

      } else if (isGroundFloor && style === 'hotel') {
        // ── Grand Hotel Lobby: Floor-to-ceiling glass bays, crystal chandelier silhouettes & warm palace glow ──
        const gwy = y + 4
        const gwh = floorH - 10
        const isCenterDoor = c === Math.floor(cols / 2) || (cols >= 6 && c === Math.floor(cols / 2) - 1)
        hfill(wx - 2, gwy - 2, ww + 4, gwh + 2, isCenterDoor ? H_DOOR : H_RECESS)
        hfill(wx - 3, gwy - 5, ww + 6, 3, H_SILL)

        if (isCenterDoor) {
          // Grand revolving door / brass glazed entrance
          ctx.fillStyle = 'rgba(0,0,0,0.45)'
          ctx.fillRect(wx - 2, gwy - 2, ww + 4, gwh + 4)
          ctx.fillStyle = 'rgba(255, 235, 170, 0.95)'
          ctx.fillRect(wx, gwy, ww, gwh)
          elit(wx, gwy, ww, gwh)

          // Polished brass frame
          ctx.strokeStyle = '#c5a059'
          ctx.lineWidth = 2
          ctx.strokeRect(wx + 1, gwy + 1, ww - 2, gwh - 2)

          // Revolving door drum center shaft & rotating wings
          const rdcx = wx + ww / 2
          ctx.fillStyle = '#1c1b18'
          ctx.fillRect(rdcx - 1, gwy + 6, 2, gwh - 6)
          ctx.beginPath()
          ctx.moveTo(rdcx - ww * 0.35, gwy + gwh * 0.6)
          ctx.lineTo(rdcx + ww * 0.35, gwy + gwh * 0.4)
          ctx.strokeStyle = '#b8860b'
          ctx.lineWidth = 1.5
          ctx.stroke()

          // Golden illuminated sign "HOTEL" above door
          ctx.fillStyle = '#181410'
          ctx.fillRect(wx + 4, gwy + 2, ww - 8, 6)
          ctx.fillStyle = '#ffd700'
          ctx.fillRect(wx + 6, gwy + 3, ww - 12, 4)
          elit(wx + 6, gwy + 3, ww - 12, 4)
        } else {
          // Hotel lobby lounge panoramic window with warm crystal chandelier
          ctx.fillStyle = 'rgba(0,0,0,0.35)'
          ctx.fillRect(wx - 2, gwy - 2, ww + 4, gwh + 4)
          ctx.fillStyle = 'rgba(205, 178, 120, 0.80)'
          ctx.fillRect(wx, gwy, ww, gwh)
          elit(wx, gwy, ww, gwh)

          // Crystal chandelier silhouette hanging in lobby lounge
          const lcx = wx + ww / 2
          const lcy = gwy + 12
          ctx.fillStyle = '#221910'
          ctx.fillRect(lcx - 0.75, gwy, 1.5, 8)
          ctx.beginPath()
          ctx.arc(lcx, lcy, 7, 0, Math.PI)
          ctx.strokeStyle = '#c5a059'
          ctx.lineWidth = 1.5
          ctx.stroke()
          ctx.fillStyle = '#fff4cc'
          ctx.fillRect(lcx - 6, lcy + 2, 2, 3)
          ctx.fillRect(lcx - 2, lcy + 4, 4, 3)
          ctx.fillRect(lcx + 4, lcy + 2, 2, 3)

          // High brass mullions
          ctx.strokeStyle = '#8a6e35'
          ctx.lineWidth = 1.5
          ctx.strokeRect(wx, gwy, ww, gwh)
          ctx.fillRect(wx + ww / 2 - 0.75, gwy, 1.5, gwh)
          // Polished dark marble stallriser at bottom
          ctx.fillStyle = '#1c1c1f'
          ctx.fillRect(wx, gwy + gwh - 4, ww, 4)
        }

      } else if (isGroundFloor && style === 'hospital') {
        // ── Hospital Emergency & Admissions Ground Floor: Automatic Sliding Doors & Medical Cross ──
        const gwy = y + 4
        const gwh = floorH - 10
        const isCenterDoor = c === Math.floor(cols / 2) || (cols >= 6 && c === Math.floor(cols / 2) - 1)
        hfill(wx - 2, gwy - 2, ww + 4, gwh + 2, isCenterDoor ? H_DOOR : H_RECESS)
        hfill(wx - 3, gwy - 5, ww + 6, 3, H_SILL)

        if (isCenterDoor) {
          // Automatic sliding glass doors to Emergency & Admissions
          ctx.fillStyle = 'rgba(0,0,0,0.4)'
          ctx.fillRect(wx - 2, gwy - 2, ww + 4, gwh + 4)
          // Bright clinical reception illumination
          ctx.fillStyle = 'rgba(180, 205, 218, 0.80)'
          ctx.fillRect(wx, gwy, ww, gwh)
          elit(wx, gwy, ww, gwh)

          // Aluminium frame & sliding door central gap
          ctx.strokeStyle = '#5a6874'
          ctx.lineWidth = 2
          ctx.strokeRect(wx + 1, gwy + 1, ww - 2, gwh - 2)
          ctx.fillStyle = '#2c353e'
          ctx.fillRect(wx + ww / 2 - 1, gwy + 8, 2, gwh - 8)

          // Red / White Emergency Sign Bar above door
          ctx.fillStyle = '#c8102e'
          ctx.fillRect(wx + 2, gwy + 2, ww - 4, 6)
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(wx + 4, gwy + 3, ww - 8, 4)
          elit(wx + 2, gwy + 2, ww - 4, 6)

          // Glowing medical cross icon in center
          const mcx = wx + ww / 2
          const mcy = gwy + gwh * 0.45
          ctx.fillStyle = '#ff1133'
          ctx.fillRect(mcx - 1.5, mcy - 6, 3, 12)
          ctx.fillRect(mcx - 6, mcy - 1.5, 12, 3)
          elit(mcx - 6, mcy - 6, 12, 12)
        } else {
          // Clinical reception / triage panoramic window
          ctx.fillStyle = 'rgba(0,0,0,0.32)'
          ctx.fillRect(wx - 2, gwy - 2, ww + 4, gwh + 4)
          // Cool clinical lighting
          ctx.fillStyle = 'rgba(170, 195, 208, 0.78)'
          ctx.fillRect(wx, gwy, ww, gwh)
          elit(wx, gwy, ww, gwh)

          // Interior triage desk / waiting room silhouettes
          ctx.fillStyle = 'rgba(38, 54, 70, 0.55)'
          ctx.fillRect(wx + 4, gwy + gwh - 8, ww - 8, 5)

          // Medical green / red accent stripe along middle transom
          ctx.fillStyle = '#00a86b'
          ctx.fillRect(wx, gwy + Math.round(gwh * 0.45), ww, 1.5)
          elit(wx, gwy + Math.round(gwh * 0.45), ww, 1.5)

          // Modern clean aluminium mullions
          ctx.strokeStyle = '#4e5c68'
          ctx.lineWidth = 1.5
          ctx.strokeRect(wx, gwy, ww, gwh)
          ctx.fillRect(wx + ww / 2 - 0.75, gwy, 1.5, gwh)
          // Hospital baseboard
          ctx.fillStyle = '#7a8894'
          ctx.fillRect(wx, gwy + gwh - 3, ww, 3)
        }

      } else if (isGroundFloor && style === 'townhall') {
        // ── Town Hall Ground Floor: Grand Ceremonial Entrance & Salle des Mariages / Conseil Municipal ──
        const gwy = y + 4
        const gwh = floorH - 10
        const isCenterDoor = c === Math.floor(cols / 2) || (cols >= 6 && c === Math.floor(cols / 2) - 1)
        hfill(wx - 2, gwy - 2, ww + 4, gwh + 2, isCenterDoor ? H_DOOR : H_RECESS)
        hfill(wx - 3, gwy - 5, ww + 6, 3, H_SILL)

        if (isCenterDoor) {
          // Monumental sculpted double oak door with fanlight transom
          ctx.fillStyle = 'rgba(0,0,0,0.45)'
          ctx.fillRect(wx - 2, gwy - 2, ww + 4, gwh + 4)
          // Dark noble oak door
          ctx.fillStyle = '#261b12'
          ctx.fillRect(wx, gwy, ww, gwh)
          hfill(wx, gwy, ww, gwh, H_DOOR)

          // Fanlight transom above the door (semi-circular glazed arch)
          const archH = Math.round(gwh * 0.28)
          ctx.fillStyle = 'rgba(255, 230, 160, 0.95)'
          ctx.fillRect(wx + 2, gwy + 2, ww - 4, archH)
          elit(wx + 2, gwy + 2, ww - 4, archH)
          // Wrought-iron sunburst rays in fanlight
          ctx.strokeStyle = '#18120c'
          ctx.lineWidth = 1.5
          const fxCenter = wx + ww / 2
          const fyBase = gwy + archH + 2
          for (let a = Math.PI; a <= 2 * Math.PI; a += Math.PI / 6) {
            ctx.beginPath()
            ctx.moveTo(fxCenter, fyBase)
            ctx.lineTo(fxCenter + Math.cos(a) * (ww * 0.44), fyBase + Math.sin(a) * archH)
            ctx.stroke()
          }

          // Double door molded panels
          const doorTop = gwy + archH + 3
          const doorH = gwh - archH - 3
          const leafW = (ww - 4) / 2
          ctx.strokeStyle = '#181008'
          ctx.lineWidth = 2
          // Left leaf & right leaf
          ctx.strokeRect(wx + 2, doorTop, leafW, doorH)
          ctx.strokeRect(wx + 2 + leafW, doorTop, leafW, doorH)
          // Inner molded panels
          ctx.strokeRect(wx + 4, doorTop + 3, leafW - 4, doorH * 0.42)
          ctx.strokeRect(wx + 4, doorTop + doorH * 0.48, leafW - 4, doorH * 0.46)
          ctx.strokeRect(wx + 4 + leafW, doorTop + 3, leafW - 4, doorH * 0.42)
          ctx.strokeRect(wx + 4 + leafW, doorTop + doorH * 0.48, leafW - 4, doorH * 0.46)

          // Bronze door handles / lions heads
          ctx.fillStyle = '#c5a059'
          ctx.fillRect(wx + leafW - 1, doorTop + doorH * 0.5 - 2, 2.5, 5)
          ctx.fillRect(wx + leafW + 3, doorTop + doorH * 0.5 - 2, 2.5, 5)

          // Carved stone lintel above door with civic cartouche
          ctx.fillStyle = '#e4dacb'
          ctx.fillRect(wx - 2, gwy - 3, ww + 4, 4)
        } else {
          // Salle des Mariages / Conseil Municipal: panoramic arched window with crystal chandeliers
          ctx.fillStyle = 'rgba(0,0,0,0.36)'
          ctx.fillRect(wx - 2, gwy - 2, ww + 4, gwh + 4)
          // Warm opulent republican interior illumination
          ctx.fillStyle = 'rgba(210, 185, 130, 0.82)'
          ctx.fillRect(wx, gwy, ww, gwh)
          elit(wx, gwy, ww, gwh)

          // Classical round arched stone frame at top of window
          const r = ww / 2
          ctx.beginPath()
          ctx.moveTo(wx, gwy + gwh)
          ctx.lineTo(wx, gwy + r)
          ctx.arc(wx + r, gwy + r, r, Math.PI, 0, false)
          ctx.lineTo(wx + ww, gwy + gwh)
          ctx.strokeStyle = '#2d251d'
          ctx.lineWidth = 2
          ctx.stroke()

          // Carved keystone (clef de voûte) at top of arch
          ctx.fillStyle = '#dcd2be'
          ctx.fillRect(wx + r - 3, gwy - 2, 6, 5)

          // Hanging crystal chandelier silhouette inside
          const lcx = wx + ww / 2
          const lcy = gwy + 13
          ctx.fillStyle = '#261e16'
          ctx.fillRect(lcx - 0.75, gwy + 2, 1.5, 7)
          ctx.beginPath()
          ctx.arc(lcx, lcy, 7, 0, Math.PI)
          ctx.strokeStyle = '#c5a059'
          ctx.lineWidth = 1.5
          ctx.stroke()
          // sparkling crystals
          ctx.fillStyle = '#fff6db'
          ctx.fillRect(lcx - 6, lcy + 2, 2.5, 3)
          ctx.fillRect(lcx - 1.5, lcy + 4, 3, 3)
          ctx.fillRect(lcx + 4, lcy + 2, 2.5, 3)

          // French window mullions & transoms
          ctx.fillStyle = '#2d251d'
          ctx.fillRect(wx + ww / 2 - 0.75, gwy + r, 1.5, gwh - r)
          ctx.fillRect(wx, gwy + Math.round(gwh * 0.65), ww, 1.5)

          // Base stone balustrade panel / allège sculptée
          ctx.fillStyle = '#ded4c0'
          ctx.fillRect(wx, gwy + gwh - 5, ww, 5)
        }

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
          elit(wx + 4, gwy + 2, ww - 8, 8)
          ctx.strokeStyle = '#180e08'
          ctx.lineWidth = 2
          ctx.strokeRect(wx + 3, gwy + 12, ww / 2 - 4, gwh - 14)
          ctx.strokeRect(wx + ww / 2 + 1, gwy + 12, ww / 2 - 4, gwh - 14)
          ctx.fillStyle = '#d4af37'
          ctx.fillRect(wx + ww / 2 - 2, gwy + gwh * 0.55, 4, 6)
        } else {
          ctx.fillStyle = 'rgba(0,0,0,0.3)'
          ctx.fillRect(wx - 2, gwy - 2, ww + 4, gwh + 4)
          const lit = ((c * 5 + floors) % 3) === 0
          ctx.fillStyle = lit ? 'rgba(200, 175, 125, 0.70)' : 'rgba(40, 52, 68, 0.85)'
          ctx.fillRect(wx, gwy, ww, gwh)
          if (lit) elit(wx, gwy, ww, gwh)
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
        const isOfficeLit = ((c * 5 + f * 11) % 4) === 0
        if (isOfficeLit) {
          ctx.fillStyle = 'rgba(220, 205, 165, 0.28)'
          ctx.fillRect(wx + 2, wy + 2, ww - 4, 3)
          ctx.fillRect(wx + 2, wy + 8, ww - 4, 3)
          elit(wx + 2, wy + 2, ww - 4, 3)
          elit(wx + 2, wy + 8, ww - 4, 3)
        }
        ctx.strokeStyle = '#141e28'
        ctx.lineWidth = 2
        ctx.strokeRect(wx, wy, ww, wh)
        hfill(wx - 3, wy - 3, ww + 6, wh + 6, H_MULLION)
        hfill(wx + 1, wy + 1, ww - 2, wh - 2, H_GLASS)

      } else if (style === 'religious') {
        // ── Gothic / Romanesque lancet arched window or rose window with stained glass ──
        const isRose = (c % 2 === 1 && f === 0) || (cols === 4 && c === 2 && floors === 1)
        const winW = Math.min(ww, 68)
        const winX = Math.round(wx + (ww - winW) / 2)
        const winY = wy
        const winH = wh

        // Recessed reveal in heightmap
        hfill(winX - 2, winY, winW + 4, winH + 2, H_RECESS)
        hfill(winX - 3, winY + winH, winW + 6, 3, H_SILL)

        const isLit = ((c * 3 + f * 5) % 2) === 0

        if (isRose) {
          // ── Circular Gothic Rose Window (Rosace à remplage rayonnant) ──
          const rcx = winX + winW / 2
          const rcy = winY + winH / 2
          const rr = Math.min(winW, winH) * 0.44

          // Outer shadow & stone frame
          ctx.beginPath()
          ctx.arc(rcx, rcy, rr + 2, 0, Math.PI * 2)
          ctx.fillStyle = 'rgba(0,0,0,0.45)'
          ctx.fill()

          ctx.beginPath()
          ctx.arc(rcx, rcy, rr, 0, Math.PI * 2)
          ctx.fillStyle = isLit ? 'rgba(30, 60, 120, 0.95)' : 'rgba(20, 35, 70, 0.9)'
          ctx.fill()

          // Stained glass colored segments
          const numSlices = 8
          const colors = ['#8a1824', '#143d78', '#c88218', '#166838', '#8a1824', '#143d78', '#c88218', '#166838']
          for (let s = 0; s < numSlices; s++) {
            const a0 = (s * Math.PI * 2) / numSlices
            const a1 = ((s + 1) * Math.PI * 2) / numSlices
            ctx.beginPath()
            ctx.moveTo(rcx, rcy)
            ctx.arc(rcx, rcy, rr - 2, a0, a1)
            ctx.closePath()
            ctx.fillStyle = colors[s % colors.length]!
            ctx.fill()
          }

          // Central stone boss + radial stone mullions
          ctx.strokeStyle = '#2c2822'
          ctx.lineWidth = 2
          for (let s = 0; s < numSlices; s++) {
            const a = (s * Math.PI * 2) / numSlices
            ctx.beginPath()
            ctx.moveTo(rcx, rcy)
            ctx.lineTo(rcx + Math.cos(a) * rr, rcy + Math.sin(a) * rr)
            ctx.stroke()
          }
          ctx.beginPath()
          ctx.arc(rcx, rcy, 4, 0, Math.PI * 2)
          ctx.fillStyle = '#3a342c'
          ctx.fill()

          // Night illumination
          if (isLit) {
            elit(rcx - rr + 4, rcy - rr + 4, (rr - 4) * 2, (rr - 4) * 2)
          }

        } else {
          // ── Grand Gothic Pointed Lancet Window (Baie ogivale géminée) ──
          const traceArch = (targetCtx: CanvasRenderingContext2D, ox: number, oy: number, w: number, h: number) => {
            const sy = oy + h * 0.42
            const ax = ox + w / 2
            const ay = oy + 2
            targetCtx.beginPath()
            targetCtx.moveTo(ox, oy + h)
            targetCtx.lineTo(ox, sy)
            targetCtx.quadraticCurveTo(ox, ay, ax, ay)
            targetCtx.quadraticCurveTo(ox + w, ay, ox + w, sy)
            targetCtx.lineTo(ox + w, oy + h)
            targetCtx.closePath()
          }

          // Dark embrasure shadow
          traceArch(ctx, winX - 2, winY - 1, winW + 4, winH + 1)
          ctx.fillStyle = 'rgba(0,0,0,0.5)'
          ctx.fill()

          // Stained glass background
          traceArch(ctx, winX, winY, winW, winH)
          ctx.fillStyle = isLit ? 'rgba(40, 20, 60, 0.95)' : 'rgba(20, 15, 30, 0.9)'
          ctx.fill()

          // 2 sub-lancets with stained glass
          const subW = (winW - 8) / 2
          const colorsA = ['#164282', '#8c1624', '#c6841a']
          const colorsB = ['#8c1624', '#164282', '#186438']
          const subColorA = colorsA[c % colorsA.length]!
          const subColorB = colorsB[(c + 1) % colorsB.length]!

          // Left lancet
          traceArch(ctx, winX + 2, winY + 8, subW, winH - 8)
          ctx.fillStyle = subColorA
          ctx.fill()

          // Right lancet
          traceArch(ctx, winX + subW + 6, winY + 8, subW, winH - 8)
          ctx.fillStyle = subColorB
          ctx.fill()

          // Leaded glass diamond lattice (calmes de plomb)
          ctx.strokeStyle = 'rgba(0,0,0,0.40)'
          ctx.lineWidth = 1
          for (let ly = winY + 12; ly < winY + winH; ly += 6) {
            ctx.beginPath()
            ctx.moveTo(winX + 2, ly)
            ctx.lineTo(winX + 2 + subW, ly)
            ctx.stroke()
            ctx.beginPath()
            ctx.moveTo(winX + subW + 6, ly)
            ctx.lineTo(winX + winW - 2, ly)
            ctx.stroke()
          }

          // Central stone mullion
          ctx.fillStyle = '#2d2822'
          ctx.fillRect(winX + subW + 2, winY + 8, 4, winH - 8)

          // Top stone trefoil / oculus medallion
          ctx.beginPath()
          const apexX = winX + winW / 2
          ctx.arc(apexX, winY + 8, 4.5, 0, Math.PI * 2)
          ctx.fillStyle = '#c6841a'
          ctx.fill()
          ctx.strokeStyle = '#2d2822'
          ctx.lineWidth = 1.5
          ctx.stroke()

          // Stone outer arch moulding
          traceArch(ctx, winX, winY, winW, winH)
          ctx.strokeStyle = '#2c2720'
          ctx.lineWidth = 2.5
          ctx.stroke()

          // Stone sill
          ctx.fillStyle = '#221e19'
          ctx.fillRect(winX - 3, winY + winH, winW + 6, 3)

          // Night stained-glass luminescence
          if (isLit) {
            elit(winX + 3, winY + 6, winW - 6, winH - 8)
          }
        }

      } else if (style === 'synagogue') {
        // ── Synagogue: Romanesque/Moorish round arched twin windows or Star of David rose window ──
        const isRose = (c % 2 === 1 && f === 0) || (cols === 4 && c === 2 && floors === 1)
        const winW = Math.min(ww, 68)
        const winX = Math.round(wx + (ww - winW) / 2)
        const winY = wy
        const winH = wh

        // Recessed reveal in heightmap
        hfill(winX - 2, winY, winW + 4, winH + 2, H_RECESS)
        hfill(winX - 3, winY + winH, winW + 6, 3, H_SILL)

        const isLit = ((c * 3 + f * 5) % 2) === 0

        if (isRose) {
          // ── Circular Star of David Rose Window (Rosace au Magen David) ──
          const rcx = winX + winW / 2
          const rcy = winY + winH / 2
          const rr = Math.min(winW, winH) * 0.44

          // Outer shadow & carved stone rim
          ctx.beginPath()
          ctx.arc(rcx, rcy, rr + 2, 0, Math.PI * 2)
          ctx.fillStyle = 'rgba(0,0,0,0.45)'
          ctx.fill()

          ctx.beginPath()
          ctx.arc(rcx, rcy, rr, 0, Math.PI * 2)
          ctx.fillStyle = isLit ? 'rgba(20, 50, 110, 0.95)' : 'rgba(15, 30, 65, 0.90)'
          ctx.fill()

          // Concentric gold band
          ctx.beginPath()
          ctx.arc(rcx, rcy, rr * 0.88, 0, Math.PI * 2)
          ctx.strokeStyle = '#c5a059'
          ctx.lineWidth = 1.5
          ctx.stroke()

          // 6-pointed Star of David (Magen David) in golden tracery
          const starR = rr * 0.72
          const drawStarTriangle = (startAngle: number, fillCol: string) => {
            ctx.beginPath()
            for (let i = 0; i < 3; i++) {
              const a = startAngle + (i * 2 * Math.PI / 3)
              const px = rcx + Math.cos(a) * starR
              const py = rcy + Math.sin(a) * starR
              if (i === 0) ctx.moveTo(px, py)
              else ctx.lineTo(px, py)
            }
            ctx.closePath()
            ctx.fillStyle = fillCol
            ctx.fill()
            ctx.strokeStyle = '#d4af37'
            ctx.lineWidth = 2
            ctx.stroke()
          }

          // Two intersecting triangles: one pointing UP, one pointing DOWN
          drawStarTriangle(-Math.PI / 2, 'rgba(212, 175, 55, 0.28)')
          drawStarTriangle(Math.PI / 2, 'rgba(212, 175, 55, 0.28)')

          // Central hexagonal jewel medallion
          ctx.beginPath()
          ctx.arc(rcx, rcy, starR * 0.30, 0, Math.PI * 2)
          ctx.fillStyle = '#144688'
          ctx.fill()
          ctx.strokeStyle = '#d4af37'
          ctx.lineWidth = 1.5
          ctx.stroke()

          // Outer stone frame
          ctx.beginPath()
          ctx.arc(rcx, rcy, rr, 0, Math.PI * 2)
          ctx.strokeStyle = '#2d2720'
          ctx.lineWidth = 3
          ctx.stroke()

          // Night sacred illumination
          if (isLit) {
            elit(rcx - rr + 4, rcy - rr + 4, (rr - 4) * 2, (rr - 4) * 2)
          }

        } else {
          // ── Twin Romanesque / Horseshoe Arched Windows (Baies géminées en plein cintre) ──
          const traceRoundArch = (targetCtx: CanvasRenderingContext2D, ox: number, oy: number, w: number, h: number) => {
            const r = w / 2
            const straightH = Math.max(0, h - r)
            targetCtx.beginPath()
            targetCtx.moveTo(ox, oy + h)
            targetCtx.lineTo(ox, oy + h - straightH)
            targetCtx.arc(ox + r, oy + h - straightH, r, Math.PI, 0, false)
            targetCtx.lineTo(ox + w, oy + h)
            targetCtx.closePath()
          }

          // Dark embrasure reveal
          traceRoundArch(ctx, winX - 2, winY - 1, winW + 4, winH + 1)
          ctx.fillStyle = 'rgba(0,0,0,0.48)'
          ctx.fill()

          // Semicircular tympanum background
          traceRoundArch(ctx, winX, winY, winW, winH)
          ctx.fillStyle = isLit ? 'rgba(30, 24, 40, 0.95)' : 'rgba(20, 16, 26, 0.90)'
          ctx.fill()

          // Two sub-arches (twin arched lights)
          const subW = (winW - 8) / 2
          const colBlue = '#143c72'
          const colGold = '#c89228'
          const subColA = (c % 2 === 0) ? colBlue : colGold
          const subColB = (c % 2 === 0) ? colGold : colBlue

          // Left arch
          traceRoundArch(ctx, winX + 2, winY + 8, subW, winH - 8)
          ctx.fillStyle = subColA
          ctx.fill()

          // Right arch
          traceRoundArch(ctx, winX + subW + 6, winY + 8, subW, winH - 8)
          ctx.fillStyle = subColB
          ctx.fill()

          // Leaded diamond glass lattice
          ctx.strokeStyle = 'rgba(0,0,0,0.38)'
          ctx.lineWidth = 1
          for (let ly = winY + 12; ly < winY + winH; ly += 6) {
            ctx.beginPath()
            ctx.moveTo(winX + 2, ly)
            ctx.lineTo(winX + 2 + subW, ly)
            ctx.stroke()
            ctx.beginPath()
            ctx.moveTo(winX + subW + 6, ly)
            ctx.lineTo(winX + winW - 2, ly)
            ctx.stroke()
          }

          // Central stone colonnette dividing the twin bays
          ctx.fillStyle = '#2c2620'
          ctx.fillRect(winX + subW + 2, winY + 6, 4, winH - 6)
          // Colonnette capital
          ctx.fillRect(winX + subW + 1, winY + 6, 6, 2)

          // Upper roundel / rosette in tympanum
          const apexX = winX + winW / 2
          ctx.beginPath()
          ctx.arc(apexX, winY + 7, 4.5, 0, Math.PI * 2)
          ctx.fillStyle = '#d4af37'
          ctx.fill()
          ctx.strokeStyle = '#2c2620'
          ctx.lineWidth = 1.5
          ctx.stroke()

          // Stone outer arch moulding
          traceRoundArch(ctx, winX, winY, winW, winH)
          ctx.strokeStyle = '#2c2620'
          ctx.lineWidth = 2.5
          ctx.stroke()

          // Stone sill
          ctx.fillStyle = '#221d18'
          ctx.fillRect(winX - 3, winY + winH, winW + 6, 3)

          // Night luminescence
          if (isLit) {
            elit(winX + 3, winY + 6, winW - 6, winH - 8)
          }
        }

      } else if (style === 'academic_school') {
        // ── Grand School Classroom Multi-Pane Window (Baie scolaire quadrillée) ──
        ctx.fillStyle = 'rgba(0,0,0,0.38)'
        ctx.fillRect(wx - 2, wy - 2, ww + 4, wh + 4)
        const isWindowLit = ((c * 5 + f * 11) % 3) !== 0
        // Warm interior school light or daytime soft reflection
        ctx.fillStyle = isWindowLit ? 'rgba(210, 190, 135, 0.82)' : 'rgba(42, 54, 68, 0.88)'
        ctx.fillRect(wx, wy, ww, wh)
        if (isWindowLit) elit(wx, wy, ww, wh)

        // Blackboard/chalkboard silhouette on the back wall of lit classrooms!
        if (isWindowLit && (c % 2 === 0)) {
          ctx.fillStyle = '#163020' // dark chalkboard green
          ctx.fillRect(wx + 4, wy + 4, ww - 8, Math.round(wh * 0.45))
          // faint chalk scribble lines
          ctx.fillStyle = 'rgba(240, 240, 240, 0.45)'
          ctx.fillRect(wx + 6, wy + 8, ww - 16, 1)
          ctx.fillRect(wx + 6, wy + 12, ww - 20, 1)
        }

        // Window grid: 3 vertical panes x 3 horizontal panes with fine muntins
        ctx.fillStyle = '#222822'
        const paneW = ww / 3
        const paneH = wh / 3
        ctx.fillRect(wx + Math.round(paneW) - 1, wy, 2, wh)
        ctx.fillRect(wx + Math.round(paneW * 2) - 1, wy, 2, wh)
        ctx.fillRect(wx, wy + Math.round(paneH) - 1, ww, 2)
        ctx.fillRect(wx, wy + Math.round(paneH * 2) - 1, ww, 2)

        // Stone lintel & heavy stone sill
        ctx.fillStyle = '#dcd4c2'
        ctx.fillRect(wx - 3, wy - 4, ww + 6, 3) // stone lintel
        ctx.fillStyle = '#b8aa92'
        ctx.fillRect(wx - 4, wy + wh + 1, ww + 8, 3.5) // protruding stone sill

        // Relief
        hfill(wx - 2, wy - 2, ww + 4, wh + 4, H_RECESS)
        hfill(wx - 3, wy - 5, ww + 6, 3, H_SILL)
        hfill(wx - 4, wy + wh + 1, ww + 8, 3, H_SILL)

      } else if (style === 'academic_university') {
        // ── Monumental University / Amphitheater Arched or 12-Pane Window ──
        ctx.fillStyle = 'rgba(0,0,0,0.42)'
        ctx.fillRect(wx - 2, wy - 2, ww + 4, wh + 4)
        const isWindowLit = ((c * 3 + f * 7) % 3) !== 0
        // Rich amber library/lecture hall light
        ctx.fillStyle = isWindowLit ? 'rgba(205, 175, 115, 0.82)' : 'rgba(34, 46, 62, 0.90)'
        ctx.fillRect(wx, wy, ww, wh)
        if (isWindowLit) elit(wx, wy, ww, wh)

        // Bookshelf / Library silhouettes inside university windows!
        if (isWindowLit && (c % 2 === 1)) {
          ctx.fillStyle = 'rgba(40, 25, 15, 0.75)'
          for (let sy = wy + 3; sy < wy + wh - 4; sy += 7) {
            ctx.fillRect(wx + 3, sy, ww - 6, 2)
            // books
            for (let bx = wx + 5; bx < wx + ww - 8; bx += 3) {
              if ((bx + sy) % 5 !== 0) ctx.fillRect(bx, sy - 4, 2, 4)
            }
          }
        }

        // Classical collegiate window mullions and transom
        ctx.fillStyle = '#1c1b18'
        ctx.fillRect(wx + ww / 2 - 1, wy, 2, wh)
        ctx.fillRect(wx, wy + Math.round(wh * 0.38) - 1, ww, 2)
        ctx.fillRect(wx, wy + Math.round(wh * 0.72) - 1, ww, 2)

        // Classical moulded architrave / pediment lintel
        ctx.fillStyle = '#e2dacf'
        ctx.fillRect(wx - 3, wy - 5, ww + 6, 3)
        ctx.fillStyle = '#a89c8a'
        ctx.fillRect(wx - 4, wy + wh + 1, ww + 8, 4) // heavy stone sill

        // Relief
        hfill(wx - 2, wy - 2, ww + 4, wh + 4, H_RECESS)
        hfill(wx - 3, wy - 5, ww + 6, 3, H_SILL)
        hfill(wx - 4, wy + wh + 1, ww + 8, 4, H_SILL)

      } else if (style === 'hotel') {
        // ── Grand Hotel Guest Room Window with Rich Curtains & Dynamic Night Lighting ──
        ctx.fillStyle = 'rgba(0,0,0,0.35)'
        ctx.fillRect(wx - 2, wy - 2, ww + 4, wh + 4)

        // Varied night occupancy:
        const roomHash = (c * 7 + f * 17 + floors * 13) % 10
        let roomBg = 'rgba(32, 42, 54, 0.92)' // dark room (asleep or out)
        let isLit = false
        let isTv = false
        let isSlit = false

        if (roomHash === 0 || roomHash === 3 || roomHash === 6 || roomHash === 8) {
          // Warm bedside / vanity lamp glow
          roomBg = 'rgba(210, 185, 130, 0.82)'
          isLit = true
        } else if (roomHash === 1 || roomHash === 5) {
          // Blue TV flicker glow
          roomBg = 'rgba(135, 170, 205, 0.78)'
          isLit = true
          isTv = true
        } else if (roomHash === 2) {
          // Drawn blackout drapes with narrow warm slit of light
          roomBg = 'rgba(38, 44, 52, 0.92)'
          isSlit = true
        }

        ctx.fillStyle = roomBg
        ctx.fillRect(wx, wy, ww, wh)
        if (isLit) elit(wx, wy, ww, wh)

        // Blackout drape slit of light
        if (isSlit) {
          ctx.fillStyle = 'rgba(210, 185, 130, 0.75)'
          ctx.fillRect(wx + ww / 2 - 1, wy, 2, wh)
          elit(wx + ww / 2 - 1, wy, 2, wh)
        }

        // Inside lit room: bedside lamp silhouette
        if (isLit && !isTv) {
          const lampX = (c % 2 === 0) ? wx + 4 : wx + ww - 8
          ctx.fillStyle = 'rgba(50, 35, 25, 0.65)'
          ctx.fillRect(lampX + 1, wy + wh * 0.55, 2, wh * 0.35)
          ctx.fillRect(lampX - 1, wy + wh * 0.50, 6, 4)
        }

        // Heavy luxury window drapes framing each guest room window
        const drapeW = Math.max(3, Math.round(ww * 0.22))
        const drapeCol = (c % 2 === 0) ? '#4a1520' : '#1e3048' // burgundy or royal navy velvet
        ctx.fillStyle = drapeCol
        ctx.fillRect(wx, wy, drapeW, wh)
        ctx.fillRect(wx + ww - drapeW, wy, drapeW, wh)
        // Drapery pelmet / valence box at top
        ctx.fillStyle = '#261b16'
        ctx.fillRect(wx - 1, wy - 1, ww + 2, 3)

        // French window central divider & transom
        ctx.fillStyle = '#1c1b18'
        ctx.fillRect(wx + ww / 2 - 0.75, wy, 1.5, wh)
        ctx.fillRect(wx, wy + Math.round(wh * 0.35) - 0.75, ww, 1.5)

        // Carved stone moulding & pediment lintel
        ctx.fillStyle = '#e4dacd'
        ctx.fillRect(wx - 3, wy - 4, ww + 6, 3)
        // Window sill
        ctx.fillStyle = '#b8aa96'
        ctx.fillRect(wx - 4, wy + wh + 1, ww + 8, 3.5)

        // French balcony wrought-iron guardrail at the bottom of the window
        ctx.fillStyle = '#181a1d'
        ctx.fillRect(wx - 1, wy + wh - 6, ww + 2, 2)
        ctx.fillRect(wx - 1, wy + wh - 1, ww + 2, 2)
        for (let bx = wx + 2; bx < wx + ww - 2; bx += 4) {
          ctx.fillRect(bx, wy + wh - 6, 1.2, 6)
        }
        ctx.fillStyle = '#d4af37'
        ctx.fillRect(wx + ww / 2 - 1, wy + wh - 4.5, 2, 2)

        // Relief
        hfill(wx - 2, wy - 2, ww + 4, wh + 4, H_RECESS)
        hfill(wx - 3, wy - 5, ww + 6, 3, H_SILL)
        hfill(wx - 4, wy + wh + 1, ww + 8, 3, H_SILL)

      } else if (style === 'hospital') {
        // ── Hospital Clinical / Ward Window with Medical Blinds & Realistic Night Life ──
        ctx.fillStyle = 'rgba(0,0,0,0.35)'
        ctx.fillRect(wx - 2, wy - 2, ww + 4, wh + 4)

        // Varied clinical night lighting:
        const roomHash = (c * 5 + f * 13 + floors * 7) % 10
        let roomBg = 'rgba(28, 38, 48, 0.92)' // dark room (patient sleeping)
        let isLit = false
        let isSurgical = false
        let isWarm = false

        if (roomHash === 0 || roomHash === 3 || roomHash === 7) {
          // Bright clinical / consultation / nurses' station cool white
          roomBg = 'rgba(175, 200, 215, 0.80)'
          isLit = true
        } else if (roomHash === 1 || roomHash === 6) {
          // Surgical theatre / intensive care cyan glow
          roomBg = 'rgba(130, 185, 205, 0.78)'
          isLit = true
          isSurgical = true
        } else if (roomHash === 4 || roomHash === 8) {
          // Soft dim convalescent night light
          roomBg = 'rgba(200, 178, 128, 0.75)'
          isLit = true
          isWarm = true
        }

        ctx.fillStyle = roomBg
        ctx.fillRect(wx, wy, ww, wh)
        if (isLit) elit(wx, wy, ww, wh)

        // Horizontal medical venetian blinds / privacy louvers
        const hasBlinds = (c + f) % 2 === 0
        if (hasBlinds) {
          ctx.fillStyle = isLit ? 'rgba(180, 205, 220, 0.35)' : 'rgba(20, 30, 40, 0.45)'
          for (let by = wy + 3; by < wy + wh - 2; by += 4) {
            ctx.fillRect(wx + 2, by, ww - 4, 1.2)
          }
        }

        // Inside lit room: medical equipment silhouette (IV drip pole / monitor stand)
        if (isLit && !isWarm) {
          const ivX = (c % 2 === 0) ? wx + 5 : wx + ww - 7
          ctx.fillStyle = 'rgba(40, 55, 70, 0.65)'
          ctx.fillRect(ivX, wy + wh * 0.45, 1.5, wh * 0.5)
          ctx.fillRect(ivX - 3, wy + wh * 0.42, 7, 1.5)
          ctx.fillStyle = isSurgical ? '#00e5ff' : '#ffffff'
          ctx.fillRect(ivX - 2, wy + wh * 0.46, 5, 4)
          elit(ivX - 2, wy + wh * 0.46, 5, 4)
        }

        // Clean flush aluminium window frame & transom
        ctx.fillStyle = '#404c56'
        ctx.fillRect(wx + ww / 2 - 0.75, wy, 1.5, wh)
        ctx.fillRect(wx, wy + Math.round(wh * 0.3) - 0.75, ww, 1.5)

        // Modern horizontal medical lintel & sill in clean brushed metal / concrete
        ctx.fillStyle = '#d2dce2'
        ctx.fillRect(wx - 2, wy - 3, ww + 4, 2.5)
        ctx.fillStyle = '#8ea0ae'
        ctx.fillRect(wx - 3, wy + wh + 1, ww + 6, 3)

        // Relief
        hfill(wx - 2, wy - 2, ww + 4, wh + 4, H_RECESS)
        hfill(wx - 3, wy - 4, ww + 6, 2, H_SILL)
        hfill(wx - 3, wy + wh + 1, ww + 6, 3, H_SILL)

      } else if (style === 'townhall') {
        // ── Town Hall Upper Floors: Noble Pedimented French Windows with Classical Balustrades ──
        ctx.fillStyle = 'rgba(0,0,0,0.38)'
        ctx.fillRect(wx - 2, wy - 2, ww + 4, wh + 4)

        const isWindowLit = ((c * 3 + f * 7) % 3) !== 0
        // Warm stately civic interior lighting
        ctx.fillStyle = isWindowLit ? 'rgba(205, 180, 125, 0.82)' : 'rgba(36, 48, 64, 0.90)'
        ctx.fillRect(wx, wy, ww, wh)
        if (isWindowLit) elit(wx, wy, ww, wh)

        // French window mullions & transoms (wooden frame)
        ctx.fillStyle = '#241e17'
        ctx.fillRect(wx + ww / 2 - 0.75, wy, 1.5, wh)
        ctx.fillRect(wx, wy + Math.round(wh * 0.35) - 0.75, ww, 1.5)
        ctx.fillRect(wx, wy + Math.round(wh * 0.70) - 0.75, ww, 1.5)

        // Alternating Pediments above the window (triangular vs curved segmental)
        const isTriangular = (c + f) % 2 === 0
        ctx.fillStyle = '#ded5c0' // fine French limestone
        if (isTriangular) {
          // Classical triangular pediment
          ctx.beginPath()
          ctx.moveTo(wx - 4, wy - 3)
          ctx.lineTo(wx + ww / 2, wy - 8)
          ctx.lineTo(wx + ww + 4, wy - 3)
          ctx.closePath()
          ctx.fill()
          ctx.strokeStyle = '#282018'
          ctx.lineWidth = 1.2
          ctx.stroke()
        } else {
          // Curved segmental pediment
          ctx.beginPath()
          ctx.arc(wx + ww / 2, wy - 2, (ww + 8) * 0.5, Math.PI, 0, false)
          ctx.closePath()
          ctx.fill()
          ctx.strokeStyle = '#282018'
          ctx.lineWidth = 1.2
          ctx.stroke()
        }

        // Carved stone corbels under pediment
        ctx.fillStyle = '#baa892'
        ctx.fillRect(wx - 3, wy - 3, 2.5, 3)
        ctx.fillRect(wx + ww + 0.5, wy - 3, 2.5, 3)

        // Protruding stone window sill
        ctx.fillStyle = '#baa892'
        ctx.fillRect(wx - 4, wy + wh + 1, ww + 8, 3.5)

        // Classical stone balustrade / guardrail at bottom of French window
        ctx.fillStyle = '#201a14'
        ctx.fillRect(wx - 1, wy + wh - 6, ww + 2, 1.5)
        ctx.fillRect(wx - 1, wy + wh - 1, ww + 2, 1.5)
        for (let bx = wx + 2; bx < wx + ww - 2; bx += 3.5) {
          ctx.fillRect(bx, wy + wh - 6, 1.2, 5)
        }
        // Golden municipal rosette accent in center of railing
        ctx.fillStyle = '#c5a059'
        ctx.fillRect(wx + ww / 2 - 1, wy + wh - 4.5, 2, 2)

        // Relief: recessed reveal, heavy stone pediment above and sill below
        hfill(wx - 2, wy - 2, ww + 4, wh + 4, H_RECESS)
        hfill(wx - 3, wy - 7, ww + 6, 4, H_SILL)
        hfill(wx - 4, wy + wh + 1, ww + 8, 3.5, H_SILL)

      } else {
        // ── Classic window with lintel, sill, and frame ──────────────────────
        ctx.fillStyle = 'rgba(0,0,0,0.32)'
        ctx.fillRect(wx - 2, wy - 2, ww + 4, wh + 4)
        const isWindowLit = ((c * 7 + f * 13) % 4) === 0
        ctx.fillStyle = isWindowLit ? 'rgba(215, 185, 125, 0.82)' : 'rgba(38, 52, 70, 0.88)'
        ctx.fillRect(wx, wy, ww, wh)
        if (isWindowLit) elit(wx, wy, ww, wh)
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
  const emissiveMap = new THREE.CanvasTexture(ecanvas)
  emissiveMap.wrapS = THREE.RepeatWrapping
  emissiveMap.wrapT = THREE.RepeatWrapping
  const result: FacadeTextures = { map: tex, normalMap, emissiveMap }
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
  const { map, normalMap, emissiveMap } = makeWindowTexture(effective, cacheKey, rows)
  const mat = new THREE.MeshStandardMaterial({
    map,
    normalMap,
    normalScale: new THREE.Vector2(0.7, 0.7),
    emissiveMap,
    emissive: 0xffffff,
    emissiveIntensity: 0,
    roughness: pal.isGlass ? 0.35 : 0.84,
    metalness: pal.isGlass ? 0.65 : 0.08,
  })
  mat.emissiveIntensity = currentGlow
  matCache.set(cacheKey, mat)
  return mat
}

/**
 * Night window glow for every cached facade material (0 by day).
 * Materials are shared across all buildings, so one pass lights the city.
 */
export function setFacadeNightGlow(intensity: number): void {
  currentGlow = intensity
  for (const mat of matCache.values()) {
    mat.emissiveIntensity = intensity
  }
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