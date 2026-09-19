/**
 * BuildingMeshGenerator — renders all OpenStreetMap 3D buildings with maximum realism.
 *
 * Realism features (based on openstreetmap_tags_reference_3d.txt):
 *   - Type-specific palettes & architecture for all OSM types:
 *     apartments (Haussmannian stone), office/commercial (glass curtain towers), retail/supermarket,
 *     church/cathedral/chapel/temple/synagogue/mosque, school/university/kindergarten, hospital/clinic,
 *     hotel, restaurant, bank, train_station, stadium, sports_hall, fire_station, police, townhall,
 *     courthouse, government/civic/public, warehouse/industrial/factory/hangar, farm/barn/stable,
 *     greenhouse, house/detached/semidetached/terrace/bungalow/hut/cabin/shed/kiosk,
 *     garage/garages/carport, monument, castle, manor, ruins, and open roofs.
 *   - Window rows = real floors: the facade texture is generated per level count and one texture
 *     height equals the wall height, so a 7-level block shows exactly 7 rows with a one-floor ground band.
 *   - Neutral ground floor (plinth, taller windows, entrance door); real shops are drawn on top by
 *     the storefront generator from OSM POIs — no fake boutiques.
 *   - Untyped / residential buildings pick a hash-stable palette from a world-neutral pool; glass
 *     curtain walls only for office/commercial > 30 m or building:material=glass.
 *   - Stone facades with wrought-iron balconies on the 2nd and 5th floors counted from the ground.
 *   - Courtyards (multipolygon inner rings) are extruded as holes with their own inner facades.
 *   - Comprehensive roof shapes from Section 8:
 *     * flat: with 3D perimeter parapet walls (acrotères), elevator penthouses, HVAC chillers & communication masts.
 *     * mansard: classic Parisian 2-tier zinc/slate with 3D dormer windows (lucarnes) and terracotta chimney stacks (mitrons).
 *     * gabled: with vertical gable end walls (murs pignons) matching facade, roof tile ridges, and chimneys.
 *     * hipped: genuine 4-sided pitched hip roof with horizontal ridge and 4 sloping planes.
 *     * pyramidal: 4-sided pyramid from centroid.
 *     * skillion: mono-pitch shed roof sloping from high edge to low edge with side clerestory walls.
 *     * round: curved barrel vault arch for train stations, sports halls and hangars.
 *     * dome: stepped drum base with hemispherical dome and decorative golden/copper spire finial.
 *   - Open-structure carports & canopies (building=roof) with support pillars that cars can drive under freely.
 *   - Full OSM tags support: building:material, roof:material, building:colour, roof:colour,
 *     building:levels, min_height, roof:height, roof:levels, roof:orientation, brand, name.
 */

import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import type { Building, BuildingType, RoofShape } from '@world-drive/shared'
import type { WorldPosition } from '@world-drive/math'

// ── Facade color palettes & architectural styles ─────────────────────────────
export type ArchitecturalStyle =
  | 'haussmann'
  | 'glass_curtain'
  | 'brick'
  | 'commercial_boutique'
  | 'civic_classical'
  | 'industrial'
  | 'residential_house'
  | 'religious'
  | 'agricultural'
  | 'garage'
  | 'greenhouse'
  | 'ruins'
  | 'render'

interface Palette {
  facade: number
  frame: number
  roof: number
  style: ArchitecturalStyle
  isGlass: boolean
}

/**
 * Global neutral pool for untyped / residential buildings (building=yes|apartments|residential…).
 * Deliberately NOT keyed on region: every entry is plausible anywhere in the world, and the
 * pick is hash-stable per building id. Real facade colour/material tags override it.
 */
const PALETTES: Palette[] = [
  { facade: 0xd6cebe, frame: 0xbaa490, roof: 0x48525e, style: 'haussmann', isGlass: false }, // limestone cream
  { facade: 0xe0d6c4, frame: 0xc4b8a4, roof: 0x4e5864, style: 'haussmann', isGlass: false }, // pale stone
  { facade: 0xcfc1a8, frame: 0xb0a088, roof: 0x5a4a3c, style: 'render',    isGlass: false }, // warm beige render
  { facade: 0xd8d8d4, frame: 0xb4b4b0, roof: 0x50545a, style: 'render',    isGlass: false }, // light grey render
  { facade: 0xe6e2da, frame: 0xc0bcb4, roof: 0x5c5650, style: 'render',    isGlass: false }, // white render
  { facade: 0x9a5a44, frame: 0x74402e, roof: 0x3a2e28, style: 'brick',     isGlass: false }, // red brick
  { facade: 0xb8845a, frame: 0x8e6440, roof: 0x4a3828, style: 'brick',     isGlass: false }, // buff brick
  { facade: 0xd9c08a, frame: 0xb89c68, roof: 0x6a4e3c, style: 'render',    isGlass: false }, // pale ochre
]

/** The only glass facade: office/commercial above 30 m or building:material=glass. */
const GLASS_PALETTE: Palette = { facade: 0x243545, frame: 0x36485b, roof: 0x182430, style: 'glass_curtain', isGlass: true }

// Type-specific palette overrides
const TYPE_PALETTES: Partial<Record<BuildingType, Palette>> = {
  // Residential
  house:              { facade: 0x8b5e3c, frame: 0x6a4530, roof: 0x6a3020, style: 'residential_house', isGlass: false },
  detached:           { facade: 0x9e7255, frame: 0x7a5840, roof: 0x624030, style: 'residential_house', isGlass: false },
  semidetached_house: { facade: 0x8b6545, frame: 0x6e5036, roof: 0x5a3825, style: 'residential_house', isGlass: false },
  terrace:            { facade: 0x7a5a3a, frame: 0x5e4428, roof: 0x4a3020, style: 'brick', isGlass: false },
  bungalow:           { facade: 0xa07850, frame: 0x806040, roof: 0x654832, style: 'residential_house', isGlass: false },
  hut:                { facade: 0x6a4e32, frame: 0x4e3820, roof: 0x382c18, style: 'residential_house', isGlass: false },
  cabin:              { facade: 0x6a4e32, frame: 0x4e3820, roof: 0x382c18, style: 'residential_house', isGlass: false },
  shed:               { facade: 0x756858, frame: 0x554a3a, roof: 0x443a2c, style: 'garage', isGlass: false },
  kiosk:              { facade: 0x2e4258, frame: 0x1e2e42, roof: 0x182430, style: 'commercial_boutique', isGlass: false },

  // Commercial / Retail / Offices
  office:             { facade: 0xc9c5bd, frame: 0x8a8680, roof: 0x3a3e46, style: 'render', isGlass: false },
  commercial:         { facade: 0xbdb7ac, frame: 0x7e7872, roof: 0x363a42, style: 'commercial_boutique', isGlass: false },
  retail:             { facade: 0xd2cbbe, frame: 0x485260, roof: 0x343a44, style: 'commercial_boutique', isGlass: false },
  supermarket:        { facade: 0x354b6e, frame: 0x223652, roof: 0x1a2434, style: 'commercial_boutique', isGlass: false },
  hotel:              { facade: 0xc4bcad, frame: 0x9e9484, roof: 0x42403e, style: 'haussmann', isGlass: false },
  restaurant:         { facade: 0x2c3540, frame: 0x384552, roof: 0x222a32, style: 'commercial_boutique', isGlass: false },
  bank:               { facade: 0xdedcd4, frame: 0xaaa69a, roof: 0x3e4248, style: 'civic_classical', isGlass: false },

  // Industrial / Logistics / Garages
  warehouse:          { facade: 0x7a7e88, frame: 0x5a5e68, roof: 0x3a3e48, style: 'industrial', isGlass: false },
  industrial:         { facade: 0x6e7280, frame: 0x525660, roof: 0x363a44, style: 'industrial', isGlass: false },
  factory:            { facade: 0x686c78, frame: 0x4c505c, roof: 0x323640, style: 'industrial', isGlass: false },
  hangar:             { facade: 0x848a94, frame: 0x626872, roof: 0x3c424a, style: 'industrial', isGlass: false },
  garage:             { facade: 0x888888, frame: 0x686868, roof: 0x505050, style: 'garage', isGlass: false },
  garages:            { facade: 0x808080, frame: 0x606060, roof: 0x484848, style: 'garage', isGlass: false },
  carport:            { facade: 0x96989c, frame: 0x52565c, roof: 0x383a40, style: 'industrial', isGlass: false },
  parking:            { facade: 0x8e8e8e, frame: 0x646464, roof: 0x4c4c4c, style: 'industrial', isGlass: false },
  service:            { facade: 0x828488, frame: 0x626468, roof: 0x44464a, style: 'industrial', isGlass: false },

  // Religious / Monuments
  church:             { facade: 0xc8bfa6, frame: 0xa8a08a, roof: 0x544e42, style: 'religious', isGlass: false },
  cathedral:          { facade: 0xc0b898, frame: 0xa09880, roof: 0x4a4438, style: 'religious', isGlass: false },
  chapel:             { facade: 0xc5bc9e, frame: 0xa29a84, roof: 0x504a3e, style: 'religious', isGlass: false },
  mosque:             { facade: 0xd0c8b0, frame: 0xb0a890, roof: 0x3e5e48, style: 'religious', isGlass: false },
  temple:             { facade: 0xd8c8a8, frame: 0xb8a888, roof: 0x784830, style: 'religious', isGlass: false },
  synagogue:          { facade: 0xc0b8a0, frame: 0xa09880, roof: 0x504840, style: 'religious', isGlass: false },
  monument:           { facade: 0xdad2c4, frame: 0xb8b0a2, roof: 0x8c8476, style: 'civic_classical', isGlass: false },
  castle:             { facade: 0x8e8880, frame: 0x6e6860, roof: 0x444240, style: 'civic_classical', isGlass: false },
  manor:              { facade: 0xbaa490, frame: 0x948270, roof: 0x544034, style: 'haussmann', isGlass: false },
  ruins:              { facade: 0x7c7872, frame: 0x5e5a56, roof: 0x484440, style: 'ruins', isGlass: false },

  // Public / Civic / Health / Education
  government:         { facade: 0xc6bea8, frame: 0xa49c86, roof: 0x4c4842, style: 'civic_classical', isGlass: false },
  civic:              { facade: 0xc0b8a4, frame: 0x9e9682, roof: 0x46423c, style: 'civic_classical', isGlass: false },
  public:             { facade: 0xb8b09c, frame: 0x98907c, roof: 0x403c36, style: 'civic_classical', isGlass: false },
  townhall:           { facade: 0xc8bea8, frame: 0xa29882, roof: 0x42464e, style: 'civic_classical', isGlass: false },
  courthouse:         { facade: 0xd0c6b0, frame: 0xa8a088, roof: 0x484c54, style: 'civic_classical', isGlass: false },
  hospital:           { facade: 0xe0ded8, frame: 0xb8b6b0, roof: 0x606268, style: 'commercial_boutique', isGlass: false },
  clinic:             { facade: 0xd8d6d0, frame: 0xb2b0aa, roof: 0x585a60, style: 'commercial_boutique', isGlass: false },
  school:             { facade: 0xcbbfa0, frame: 0xa89c7c, roof: 0x7a6848, style: 'civic_classical', isGlass: false },
  university:         { facade: 0xc0b288, frame: 0xa09268, roof: 0x685440, style: 'civic_classical', isGlass: false },
  kindergarten:       { facade: 0xd4a86a, frame: 0xb48848, roof: 0x8e6838, style: 'residential_house', isGlass: false },
  fire_station:       { facade: 0x823228, frame: 0xa82018, roof: 0x381814, style: 'industrial', isGlass: false },
  police:             { facade: 0x32445a, frame: 0x223244, roof: 0x1a2636, style: 'civic_classical', isGlass: false },
  train_station:      { facade: 0xb4aa8e, frame: 0x948a6e, roof: 0x444240, style: 'civic_classical', isGlass: false },
  stadium:            { facade: 0x484e5a, frame: 0x383c48, roof: 0x282c38, style: 'industrial', isGlass: false },
  sports_hall:        { facade: 0x5a6478, frame: 0x444c5e, roof: 0x2c3444, style: 'industrial', isGlass: false },

  // Agricultural
  farm:               { facade: 0x8c5e38, frame: 0x6e4624, roof: 0x4c2e1a, style: 'agricultural', isGlass: false },
  farm_auxiliary:     { facade: 0x7a5432, frame: 0x5e3e20, roof: 0x3e2614, style: 'agricultural', isGlass: false },
  barn:               { facade: 0x8b3a2b, frame: 0x642418, roof: 0x4a2216, style: 'agricultural', isGlass: false },
  stable:             { facade: 0x6e4828, frame: 0x54341a, roof: 0x362010, style: 'agricultural', isGlass: false },
  greenhouse:         { facade: 0xa8c2bc, frame: 0x344642, roof: 0x2c3c38, style: 'greenhouse', isGlass: true },

  // Cultural / Civic additions
  library:            { facade: 0xc0b8a4, frame: 0x9e9682, roof: 0x46423c, style: 'civic_classical', isGlass: false },
  museum:             { facade: 0xb8b09c, frame: 0x98907c, roof: 0x403c36, style: 'civic_classical', isGlass: false },
  theatre:            { facade: 0x484e5a, frame: 0x383c48, roof: 0x282c38, style: 'industrial', isGlass: false },

  // Fuel / Charging
  fuel:               { facade: 0xffffff, frame: 0xcccccc, roof: 0xff0000, style: 'commercial_boutique', isGlass: false, hasBoutiques: true },
  charging_station:   { facade: 0x00aaff, frame: 0x0088cc, roof: 0x004466, style: 'commercial_boutique', isGlass: true, hasBoutiques: true },

  // Canopy
  roof:               { facade: 0x909296, frame: 0x606268, roof: 0x3c3e44, style: 'industrial', isGlass: false },
}

// Material color overrides based on building:material
const MATERIAL_COLORS: Record<string, number> = {
  brick:            0x7c382b,
  stone:            0xc8beae,
  limestone:        0xd8d0be,
  sandstone:        0xd4b886,
  concrete:         0x949290,
  glass:            0x243545,
  wood:             0x8b6545,
  plaster:          0xd8d4cc,
  masonry:          0xa8a090,
  metal:            0x6e747c,
  steel:            0x5c626a,
  corrugated_iron:  0x787e86,
  timber_framing:   0x7d5a3c,
  marble:           0xe8e6e0,
  granite:          0x848286,
}

// Roof material color overrides based on roof:material
const ROOF_MATERIAL_COLORS: Record<string, number> = {
  roof_tiles: 0xb24d35,
  slate:      0x343942,
  zinc:       0x5a6674,
  copper:     0x4fa37b,
  tar_paper:  0x292b2e,
  concrete:   0x76787c,
  glass:      0x365874,
  thatch:     0x8a7248,
  metal:      0x6e747c,
}

// ── Window texture cache ─────────────────────────────────────────────────────
// One texture per (palette, level count): the canvas holds exactly `rows` floors, the
// ground floor being the bottom row, so the UV scale can map one repeat to the wall height.
const textureCache = new Map<string, THREE.CanvasTexture>()

/** Distinct level variants: taller buildings repeat the texture every MAX_TEXTURE_ROWS floors. */
const MAX_TEXTURE_ROWS = 24
const ROW_PX = 64

function makeWindowTexture(palette: Palette, cacheKey: string, rows: number): THREE.CanvasTexture {
  const cached = textureCache.get(cacheKey)
  if (cached) return cached

  const floors = Math.max(1, Math.min(MAX_TEXTURE_ROWS, Math.round(rows)))
  const W = 512
  const H = floors * ROW_PX
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!

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
    } else if (hasStringcourse && f > 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.10)'
      ctx.fillRect(0, y, W, 2)
    }

    // Ground-floor plinth (soubassement): darker base band + rustication for stone facades
    if (isGroundFloor && style !== 'industrial' && style !== 'garage' && style !== 'glass_curtain' && style !== 'religious' && style !== 'greenhouse') {
      ctx.fillStyle = 'rgba(0,0,0,0.16)'
      ctx.fillRect(0, y + floorH - 6, W, 6)
      if (style === 'haussmann' || style === 'civic_classical') {
        ctx.fillStyle = 'rgba(0,0,0,0.12)'
        for (let gy = y + 2; gy < H; gy += 14) ctx.fillRect(0, gy, W, 2)
      }
    }

    // Wrought-iron balcony railings on the 2nd and 5th floors counted from the ground
    const hasBalcony = style === 'haussmann' && floors >= 4 && (floorFromGround === 2 || floorFromGround === 5)
    if (hasBalcony) {
      ctx.fillStyle = '#1c1f24'
      ctx.fillRect(0, y + floorH - 10, W, 8)
      for (let bx = 0; bx < W; bx += 8) ctx.fillRect(bx, y + floorH - 12, 2, 10)
      ctx.fillStyle = 'rgba(255, 215, 0, 0.4)'
      ctx.fillRect(0, y + floorH - 12, W, 2)
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

      } else if (style === 'religious') {
        // ── Gothic / Romanesque lancet arched window with stained glass ──────
        ctx.fillStyle = 'rgba(0,0,0,0.45)'
        ctx.fillRect(wx, wy, ww, wh)
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
      }
    }
  }

  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.anisotropy = 4
  textureCache.set(cacheKey, tex)
  return tex
}

// ── Material cache ───────────────────────────────────────────────────────────
const matCache = new Map<string, THREE.MeshStandardMaterial>()
const roofMatCache = new Map<string, THREE.MeshStandardMaterial>()

function getFacadeMat(pal: Palette, key: string, rows: number, colourOverride?: string): THREE.MeshStandardMaterial {
  const cacheKey = `${key}_L${rows}_${colourOverride ?? ''}`
  if (matCache.has(cacheKey)) return matCache.get(cacheKey)!

  // A building:colour / building:material tint keeps the window rows: tint the base palette.
  let effective = pal
  if (colourOverride) {
    const hex = new THREE.Color(colourOverride).getHex()
    effective = { ...pal, facade: hex, frame: (hex >> 1) & 0x7f7f7f }
  }
  const tex = makeWindowTexture(effective, cacheKey, rows)
  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    roughness: pal.isGlass ? 0.35 : 0.84,
    metalness: pal.isGlass ? 0.65 : 0.08,
  })
  matCache.set(cacheKey, mat)
  return mat
}

function getRoofMat(pal: Palette, key: string, colourOverride?: string, materialOverride?: string): THREE.MeshStandardMaterial {
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

function hashId(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return h
}

// ── Roof Geometry Builders (Section 8: roof:shape=*) ──────────────────────────

/**
 * Build a flat roof with stone parapet wall (acrotère) along the perimeter
 * and rooftop technical equipment (elevator housing, HVAC chillers, antenna mast).
 */
function buildFlatRoofWithDetails(
  shape: THREE.Shape,
  fp: THREE.Vector2[],
  baseHeight: number,
  roofMat: THREE.MeshStandardMaterial,
  facadeMat: THREE.MeshStandardMaterial,
  skipEquipment = false,
): THREE.Group {
  const group = new THREE.Group()

  // 1. Roof deck slab
  const roofGeo = new THREE.ShapeGeometry(shape)
  roofGeo.rotateX(-Math.PI / 2)
  roofGeo.translate(0, baseHeight, 0)
  const roofMesh = new THREE.Mesh(roofGeo, roofMat)
  roofMesh.receiveShadow = true
  group.add(roofMesh)

  // 2. Continuous Parapet Coping Border (Acrotère) along roof edge
  const parapetHeight = 0.75 // 75cm high safety ledge
  const parapetThickness = 0.35
  const N = fp.length

  // Bounding box calculations
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const p of fp) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x)
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y)
  }
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  const spanX = maxX - minX
  const spanY = maxY - minY

  // Parapet geometry: outer wall, inner wall, and top coping
  const parapetInnerVerts: THREE.Vector2[] = fp.map(p => {
    const dx = cx - p.x
    const dy = cy - p.y
    const d = Math.hypot(dx, dy)
    if (d < 0.1) return p
    const ratio = Math.min(0.25, parapetThickness / d)
    return new THREE.Vector2(p.x + dx * ratio, p.y + dy * ratio)
  })

  const pPos: number[] = []
  const pNorm: number[] = []
  const pIdx: number[] = []

  for (let i = 0; i < N; i++) {
    const next = (i + 1) % N
    const p1 = fp[i]!
    const p2 = fp[next]!
    const q1 = parapetInnerVerts[i]!
    const q2 = parapetInnerVerts[next]!

    // Top coping cap
    const b = pPos.length / 3
    pPos.push(
      p1.x, baseHeight + parapetHeight, p1.y,
      p2.x, baseHeight + parapetHeight, p2.y,
      q2.x, baseHeight + parapetHeight, q2.y,
      q1.x, baseHeight + parapetHeight, q1.y,
    )
    pNorm.push(0, 1, 0,  0, 1, 0,  0, 1, 0,  0, 1, 0)
    pIdx.push(b, b + 1, b + 2,  b, b + 2, b + 3)

    // Inner parapet face
    const b2 = pPos.length / 3
    pPos.push(
      q1.x, baseHeight, q1.y,
      q2.x, baseHeight, q2.y,
      q2.x, baseHeight + parapetHeight, q2.y,
      q1.x, baseHeight + parapetHeight, q1.y,
    )
    pNorm.push(0, 0, 1,  0, 0, 1,  0, 0, 1,  0, 0, 1)
    pIdx.push(b2, b2 + 1, b2 + 2,  b2, b2 + 2, b2 + 3)
  }

  const parapetGeo = new THREE.BufferGeometry()
  parapetGeo.setAttribute('position', new THREE.Float32BufferAttribute(pPos, 3))
  parapetGeo.setAttribute('normal', new THREE.Float32BufferAttribute(pNorm, 3))
  parapetGeo.setIndex(pIdx)
  parapetGeo.computeVertexNormals()
  const parapetMesh = new THREE.Mesh(parapetGeo, facadeMat)
  parapetMesh.receiveShadow = true
  group.add(parapetMesh)

  // 3. Rooftop equipment (elevator penthouse, HVAC chillers, communication mast)
  if (!skipEquipment && spanX > 10 && spanY > 10) {
    const equipMat = new THREE.MeshStandardMaterial({ color: 0x50545a, roughness: 0.85, metalness: 0.25 })

    // Elevator / stair penthouse housing
    const hvacW = Math.min(spanX * 0.22, 5.5)
    const hvacD = Math.min(spanY * 0.22, 4.5)
    const hvacH = 2.4
    const boxGeo = new THREE.BoxGeometry(hvacW, hvacH, hvacD)
    const boxMesh = new THREE.Mesh(boxGeo, equipMat)
    boxMesh.position.set(cx, baseHeight + hvacH / 2, cy)
    boxMesh.receiveShadow = true
    group.add(boxMesh)

    // Secondary ventilation chiller unit with fans
    if (spanX > 16) {
      const ventGeo = new THREE.BoxGeometry(hvacW * 0.65, 1.2, hvacD * 0.65)
      const ventMesh = new THREE.Mesh(ventGeo, equipMat)
      ventMesh.position.set(cx + hvacW * 0.85, baseHeight + 0.6, cy)
      group.add(ventMesh)
    }

    // Communication antenna mast with flashing red beacon
    if (spanX > 14 && spanY > 14) {
      const mastH = 4.5
      const mastGeo = new THREE.CylinderGeometry(0.06, 0.12, mastH, 6)
      const mastMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.8, roughness: 0.2 })
      const mastMesh = new THREE.Mesh(mastGeo, mastMat)
      mastMesh.position.set(cx - hvacW * 0.6, baseHeight + mastH / 2, cy - hvacD * 0.4)
      group.add(mastMesh)

      // Warning beacon tip
      const beaconGeo = new THREE.SphereGeometry(0.16, 8, 8)
      const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff2222 })
      const beaconMesh = new THREE.Mesh(beaconGeo, beaconMat)
      beaconMesh.position.set(cx - hvacW * 0.6, baseHeight + mastH, cy - hvacD * 0.4)
      group.add(beaconMesh)
    }
  }

  return group
}

/**
 * Build a classic Parisian 2-tier Mansard roof:
 * - Steep lower pitch in dark zinc/slate with 3D dormer windows (lucarnes)
 * - Flat upper roof deck
 * - Authentic terracotta chimney stacks (cheminées avec mitrons) along party walls
 */
function buildMansardRoof(
  fp: THREE.Vector2[],
  roofHeight: number,
  baseHeight: number,
  roofMat: THREE.MeshStandardMaterial,
  facadeMat: THREE.MeshStandardMaterial,
): THREE.Group {
  const group = new THREE.Group()

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const p of fp) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x)
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y)
  }
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2

  // Inset factor for the mansard curb
  const inset = 1.3
  const lowerH = roofHeight * 0.70

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
    idx.push(b, b + 1, b + 2,  b, b + 2, b + 3)
  }

  // Upper flat zinc deck
  const upperShape = new THREE.Shape()
  upperShape.moveTo(innerVerts[0]!.x, -innerVerts[0]!.y)
  for (let i = 1; i < innerVerts.length; i++) upperShape.lineTo(innerVerts[i]!.x, -innerVerts[i]!.y)
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
 * Build a gabled roof (triangular ridge along major axis or orientation).
 * Features vertical triangular gable end walls (murs pignons) textured with facadeMat,
 * and sloping roof planes textured with roofMat.
 */
function buildGabledRoof(
  fp: THREE.Vector2[],
  roofHeight: number,
  baseHeight: number,
  roofMat: THREE.MeshStandardMaterial,
  facadeMat: THREE.MeshStandardMaterial,
  orientation?: 'along' | 'across',
): THREE.Group {
  const group = new THREE.Group()

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const p of fp) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x)
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y)
  }
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  const spanX = maxX - minX
  const spanY = maxY - minY

  let ridgeAlongX = spanX >= spanY
  if (orientation === 'across') ridgeAlongX = !ridgeAlongX

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

  // Sloping roof planes (use roofMat)
  const roofPos: number[] = ridgeAlongX
    ? [
        // Side 1 (North slope)
        r1x, peakY, r1z,  r2x, peakY, r2z,  e2.x, baseHeight, e2.z,  e1.x, baseHeight, e1.z,
        // Side 2 (South slope)
        r2x, peakY, r2z,  r1x, peakY, r1z,  e4.x, baseHeight, e4.z,  e3.x, baseHeight, e3.z,
      ]
    : [
        // Side 1 (West slope)
        r1x, peakY, r1z,  r2x, peakY, r2z,  e4.x, baseHeight, e4.z,  e1.x, baseHeight, e1.z,
        // Side 2 (East slope)
        r2x, peakY, r2z,  r1x, peakY, r1z,  e2.x, baseHeight, e2.z,  e3.x, baseHeight, e3.z,
      ]

  const roofIdx = [
    0, 1, 2,  0, 2, 3,
    4, 5, 6,  4, 6, 7,
  ]

  const roofGeo = new THREE.BufferGeometry()
  roofGeo.setAttribute('position', new THREE.Float32BufferAttribute(roofPos, 3))
  roofGeo.setIndex(roofIdx)
  roofGeo.computeVertexNormals()
  const roofMesh = new THREE.Mesh(roofGeo, roofMat)
  roofMesh.castShadow = true
  roofMesh.receiveShadow = true
  group.add(roofMesh)

  // Vertical gable end walls (murs pignons) textured with facadeMat
  const gablePos: number[] = ridgeAlongX
    ? [
        // West gable end
        r1x, peakY, r1z,  e1.x, baseHeight, e1.z,  e4.x, baseHeight, e4.z,
        // East gable end
        r2x, peakY, r2z,  e3.x, baseHeight, e3.z,  e2.x, baseHeight, e2.z,
      ]
    : [
        // North gable end
        r1x, peakY, r1z,  e2.x, baseHeight, e2.z,  e1.x, baseHeight, e1.z,
        // South gable end
        r2x, peakY, r2z,  e4.x, baseHeight, e4.z,  e3.x, baseHeight, e3.z,
      ]

  const gableIdx = [0, 1, 2,  3, 4, 5]
  const gableGeo = new THREE.BufferGeometry()
  gableGeo.setAttribute('position', new THREE.Float32BufferAttribute(gablePos, 3))
  gableGeo.setIndex(gableIdx)
  gableGeo.computeVertexNormals()
  const gableMesh = new THREE.Mesh(gableGeo, facadeMat)
  gableMesh.castShadow = true
  gableMesh.receiveShadow = true
  group.add(gableMesh)

  // Ridge tile cap cylinder
  const ridgeLen = ridgeAlongX ? spanX : spanY
  const ridgeCapGeo = new THREE.CylinderGeometry(0.12, 0.12, ridgeLen, 6)
  if (ridgeAlongX) {
    ridgeCapGeo.rotateZ(Math.PI / 2)
  } else {
    ridgeCapGeo.rotateX(Math.PI / 2)
  }
  const ridgeCap = new THREE.Mesh(ridgeCapGeo, roofMat)
  ridgeCap.position.set(cx, peakY + 0.06, cy)
  group.add(ridgeCap)

  // Brick chimney stack near the ridge
  const chimH = 1.4
  const chimGeo = new THREE.BoxGeometry(0.7, chimH, 0.7)
  const chimMat = new THREE.MeshStandardMaterial({ color: 0x7c382b, roughness: 0.9 })
  const chimMesh = new THREE.Mesh(chimGeo, chimMat)
  chimMesh.position.set(cx + (ridgeAlongX ? spanX * 0.25 : 0), peakY + chimH * 0.3, cy + (ridgeAlongX ? 0 : spanY * 0.25))
  group.add(chimMesh)

  return group
}

/**
 * Build a genuine hipped roof (toit à 4 pans) with a central horizontal ridge
 * and 4 sloping trapezoidal/triangular roof facets.
 */
function buildHippedRoof(
  fp: THREE.Vector2[],
  roofHeight: number,
  baseHeight: number,
  mat: THREE.MeshStandardMaterial,
): THREE.Mesh {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const p of fp) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x)
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y)
  }
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  const spanX = maxX - minX
  const spanY = maxY - minY

  const alongX = spanX >= spanY
  const ridgeHalfLen = Math.max(0.5, (alongX ? spanX - spanY : spanY - spanX) / 2)
  const peakY = baseHeight + roofHeight

  const r1x = alongX ? cx - ridgeHalfLen : cx
  const r1z = alongX ? cy : cy - ridgeHalfLen
  const r2x = alongX ? cx + ridgeHalfLen : cx
  const r2z = alongX ? cy : cy + ridgeHalfLen

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

  const indices: number[] = alongX
    ? [
        0, 3, 2,  0, 1, 3, // North trapezoid
        1, 4, 3,           // East triangle hip
        0, 4, 1,  0, 5, 4, // South trapezoid
        0, 2, 5,           // West triangle hip
      ]
    : [
        0, 2, 3,           // North triangle hip
        0, 3, 1,  1, 3, 4, // East trapezoid
        0, 1, 4,  0, 4, 5, // South triangle hip
        0, 5, 2,  1, 2, 5, // West trapezoid
      ]

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
 * Build a pyramidal roof from footprint centroid.
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
 * Build a skillion roof (mono-pitch shed roof) sloping from one side to the other.
 */
function buildSkillionRoof(
  fp: THREE.Vector2[],
  roofHeight: number,
  baseHeight: number,
  roofMat: THREE.MeshStandardMaterial,
  facadeMat: THREE.MeshStandardMaterial,
): THREE.Group {
  const group = new THREE.Group()

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const p of fp) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x)
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y)
  }
  const spanX = maxX - minX
  const spanY = maxY - minY

  const slopeAlongX = spanX <= spanY

  // Sloping roof plane
  const roofVerts: number[] = []
  for (const p of fp) {
    const t = slopeAlongX ? (p.x - minX) / spanX : (p.y - minY) / spanY
    roofVerts.push(p.x, baseHeight + t * roofHeight, p.y)
  }

  // Simple fan triangulation for footprint
  const roofIndices: number[] = []
  for (let i = 1; i < fp.length - 1; i++) {
    roofIndices.push(0, i, i + 1)
  }

  const roofGeo = new THREE.BufferGeometry()
  roofGeo.setAttribute('position', new THREE.Float32BufferAttribute(roofVerts, 3))
  roofGeo.setIndex(roofIndices)
  roofGeo.computeVertexNormals()
  const roofMesh = new THREE.Mesh(roofGeo, roofMat)
  roofMesh.castShadow = true
  roofMesh.receiveShadow = true
  group.add(roofMesh)

  // Side clerestory triangular/trapezoid wall skirts
  const wallPos: number[] = []
  const wallIdx: number[] = []
  const N = fp.length

  for (let i = 0; i < N; i++) {
    const next = (i + 1) % N
    const p1 = fp[i]!
    const p2 = fp[next]!
    const t1 = slopeAlongX ? (p1.x - minX) / spanX : (p1.y - minY) / spanY
    const t2 = slopeAlongX ? (p2.x - minX) / spanX : (p2.y - minY) / spanY

    const h1 = baseHeight + t1 * roofHeight
    const h2 = baseHeight + t2 * roofHeight

    const b = wallPos.length / 3
    wallPos.push(
      p1.x, baseHeight, p1.y,
      p2.x, baseHeight, p2.y,
      p2.x, h2, p2.y,
      p1.x, h1, p1.y,
    )
    wallIdx.push(b, b + 1, b + 2,  b, b + 2, b + 3)
  }

  const wallGeo = new THREE.BufferGeometry()
  wallGeo.setAttribute('position', new THREE.Float32BufferAttribute(wallPos, 3))
  wallGeo.setIndex(wallIdx)
  wallGeo.computeVertexNormals()
  const wallMesh = new THREE.Mesh(wallGeo, facadeMat)
  wallMesh.castShadow = true
  group.add(wallMesh)

  return group
}

/**
 * Build a round / barrel vault roof (toit arrondi / en berceau)
 * Typical for train stations, sports halls, hangars, and modern structures.
 */
function buildRoundRoof(
  fp: THREE.Vector2[],
  roofHeight: number,
  baseHeight: number,
  roofMat: THREE.MeshStandardMaterial,
  facadeMat: THREE.MeshStandardMaterial,
): THREE.Group {
  const group = new THREE.Group()

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const p of fp) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x)
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y)
  }
  const spanX = maxX - minX
  const spanY = maxY - minY
  const archAlongX = spanX <= spanY

  // Generate curved barrel arc
  const segments = 12
  const pos: number[] = []
  const idx: number[] = []

  const len = archAlongX ? spanY : spanX
  const width = archAlongX ? spanX : spanY
  const startW = archAlongX ? minX : minY
  const startL = archAlongX ? minY : minX

  for (let s = 0; s <= segments; s++) {
    const t = s / segments
    const angle = t * Math.PI
    const arcY = baseHeight + Math.sin(angle) * roofHeight
    const coordW = startW + t * width

    const x1 = archAlongX ? coordW : startL
    const z1 = archAlongX ? startL : coordW
    const x2 = archAlongX ? coordW : startL + len
    const z2 = archAlongX ? startL + len : coordW

    pos.push(x1, arcY, z1)
    pos.push(x2, arcY, z2)

    if (s > 0) {
      const b = (s - 1) * 2
      idx.push(b, b + 1, b + 3,  b, b + 3, b + 2)
    }
  }

  const barrelGeo = new THREE.BufferGeometry()
  barrelGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  barrelGeo.setIndex(idx)
  barrelGeo.computeVertexNormals()
  const barrelMesh = new THREE.Mesh(barrelGeo, roofMat)
  barrelMesh.castShadow = true
  barrelMesh.receiveShadow = true
  group.add(barrelMesh)

  return group
}

/**
 * Build a dome roof with drum base and decorative golden/copper apex spire finial.
 */
function buildDomeRoof(
  fp: THREE.Vector2[],
  roofHeight: number,
  baseHeight: number,
  mat: THREE.MeshStandardMaterial,
): THREE.Group {
  const group = new THREE.Group()
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const p of fp) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x)
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y)
  }
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2
  const radius = Math.min(maxX - minX, maxY - minY) / 2

  // Stepped drum base collar
  const drumH = roofHeight * 0.25
  const drumGeo = new THREE.CylinderGeometry(radius * 0.95, radius, drumH, 20)
  drumGeo.translate(cx, baseHeight + drumH / 2, cy)
  const drumMesh = new THREE.Mesh(drumGeo, mat)
  drumMesh.castShadow = true
  group.add(drumMesh)

  // Dome hemisphere shell
  const domeH = roofHeight * 0.75
  const geo = new THREE.SphereGeometry(radius * 0.95, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2)
  geo.scale(1, domeH / (radius * 0.95), 1)
  geo.translate(cx, baseHeight + drumH, cy)
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
 * Build an open canopy / carport structure with slender support pillars
 * and a roof slab that players can drive under freely.
 */
function buildOpenCanopy(
  fp: THREE.Vector2[],
  height: number,
  roofMat: THREE.MeshStandardMaterial,
): THREE.Group {
  const group = new THREE.Group()

  // Roof slab
  const shape = new THREE.Shape()
  shape.moveTo(fp[0]!.x, -fp[0]!.y)
  for (let i = 1; i < fp.length; i++) shape.lineTo(fp[i]!.x, -fp[i]!.y)
  shape.closePath()

  const roofGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.40, bevelEnabled: false })
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

    // Select palette (global rules only, nothing region-specific):
    //  - building:material=glass, or office/commercial taller than 30 m → glass curtain wall
    //  - other typed buildings → their type palette
    //  - untyped / residential (yes, apartments, …) → hash-stable pick from the neutral pool
    const materialLower = building.material?.toLowerCase()
    const isUntyped = !bType || bType === 'yes' || bType === 'apartments'
    const typePal = !isUntyped && bType ? TYPE_PALETTES[bType] : undefined
    let pal: Palette
    let matKey: string
    if (materialLower === 'glass' || ((bType === 'office' || bType === 'commercial') && building.height > 30)) {
      pal = GLASS_PALETTE
      matKey = 'glass'
    } else if (typePal) {
      pal = typePal
      matKey = bType!
    } else {
      const paletteIdx = hashId(building.id) % PALETTES.length
      pal = PALETTES[paletteIdx]!
      matKey = `pool${paletteIdx}`
    }

    // Tint facade if building:colour or building:material is present (window rows are kept)
    let facadeColorOverride = building.colour
    if (!facadeColorOverride && materialLower && materialLower !== 'glass' && MATERIAL_COLORS[materialLower]) {
      const col = MATERIAL_COLORS[materialLower]!
      facadeColorOverride = `#${col.toString(16).padStart(6, '0')}`
    }

    // Real floor count → window rows. One texture height = the whole wall height.
    const bottomY = building.minHeight ?? 0
    const wallHeight = Math.max(1.5, building.height - bottomY)
    let levels = Math.round(building.levels)
    if (!(levels >= 1)) levels = 1
    let floorH = wallHeight / levels
    if (floorH < 2.3 || floorH > 6.5) {
      // levels tag inconsistent with height: derive from height instead
      levels = Math.max(1, Math.round(wallHeight / 3.3))
      floorH = wallHeight / levels
    }
    const rows = Math.min(levels, MAX_TEXTURE_ROWS)

    const facadeMat = getFacadeMat(pal, matKey, rows, facadeColorOverride)
    const roofMat = getRoofMat(pal, matKey, building.roofColour, building.roofMaterial)

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

    // Courtyards (multipolygon inner rings) become holes: inner facades are extruded too.
    let hasHoles = false
    if (building.holes) {
      for (const ring of building.holes) {
        if (ring.length < 3) continue
        const path = new THREE.Path()
        path.moveTo(ring[0]!.x, -ring[0]!.z)
        for (let i = 1; i < ring.length; i++) path.lineTo(ring[i]!.x, -ring[i]!.z)
        path.closePath()
        shape.holes.push(path)
        hasHoles = true
      }
    }

    const fullGeo = new THREE.ExtrudeGeometry(shape, {
      depth: wallHeight,
      bevelEnabled: false,
    })

    // Extract ONLY the extruded side walls (materialIndex === 1), discarding redundant top/bottom caps.
    // This prevents the top cap (textured with facade windows) from Z-fighting with roof geometry!
    const wallGroup = fullGeo.groups.find((g) => g.materialIndex === 1)
    let wallGeo: THREE.BufferGeometry
    if (wallGroup) {
      wallGeo = new THREE.BufferGeometry()
      const pos = fullGeo.attributes['position'] as THREE.BufferAttribute
      const uv = fullGeo.attributes['uv'] as THREE.BufferAttribute
      const normal = fullGeo.attributes['normal'] as THREE.BufferAttribute
      const start = wallGroup.start
      const count = wallGroup.count

      wallGeo.setAttribute('position', new THREE.BufferAttribute(pos.array.slice(start * 3, (start + count) * 3), 3))
      if (normal) wallGeo.setAttribute('normal', new THREE.BufferAttribute(normal.array.slice(start * 3, (start + count) * 3), 3))
      if (uv) wallGeo.setAttribute('uv', new THREE.BufferAttribute(uv.array.slice(start * 2, (start + count) * 2), 2))
      fullGeo.dispose()
    } else {
      wallGeo = fullGeo
    }

    wallGeo.rotateX(-Math.PI / 2)
    if (bottomY > 0) wallGeo.translate(0, bottomY, 0)

    // Adjust UVs so windows and store facades wrap realistically
    const uvAttr = wallGeo.attributes['uv'] as THREE.BufferAttribute
    if (uvAttr) {
      const uScale = 0.05
      // One texture repeat = `rows` floors, so every window row is a real floor and the
      // ground-floor band is exactly one floor tall.
      // ExtrudeGeometry side walls carry v = 1 - depth, so (1 - v) is the height above the wall base.
      const vScale = 1 / (rows * floorH)
      for (let i = 0; i < uvAttr.count; i++) {
        uvAttr.setXY(i, uvAttr.getX(i) * uScale, (1 - uvAttr.getY(i)) * vScale)
      }
      uvAttr.needsUpdate = true
    }

    const wallMesh = new THREE.Mesh(wallGeo, facadeMat)
    wallMesh.castShadow = true
    wallMesh.receiveShadow = true
    wallMesh.userData['buildingId'] = building.id
    group.add(wallMesh)

    // ── 2. Roof Generation (Section 8: roof:shape=*) ──────────────────────
    let roofShape = building.roofShape ?? 'flat'

    // Heuristics based on building type, architectural style, and height:
    if (hasHoles) {
      // Pitched roof builders work on the outer ring only; a courtyard block keeps a flat roof with the hole.
      roofShape = 'flat'
    } else if (roofShape === 'flat' && (bType === 'apartments' || pal.style === 'haussmann') && building.height >= 12) {
      roofShape = 'mansard'
    } else if (roofShape === 'flat' && (bType === 'house' || bType === 'detached' || bType === 'terrace' || bType === 'bungalow' || bType === 'barn') && building.height < 12) {
      roofShape = 'gabled'
    } else if (roofShape === 'flat' && (bType === 'church' || bType === 'cathedral' || bType === 'chapel' || bType === 'temple')) {
      roofShape = 'pyramidal'
    } else if (roofShape === 'flat' && (bType === 'sports_hall' || bType === 'hangar') && building.height < 14) {
      roofShape = 'round'
    }

    const roofBaseH = building.height
    const defaultPitch = Math.max(1.8, Math.min(8.0, building.height * 0.18))
    const roofPitch = building.roofHeight ?? defaultPitch

    if (roofShape === 'mansard') {
      const mansard = buildMansardRoof(fp2d, Math.max(2.2, roofPitch), roofBaseH, roofMat, facadeMat)
      group.add(mansard)
    } else if (roofShape === 'gabled') {
      const gabled = buildGabledRoof(fp2d, roofPitch, roofBaseH, roofMat, facadeMat, building.roofOrientation)
      group.add(gabled)
    } else if (roofShape === 'hipped') {
      const hipped = buildHippedRoof(fp2d, roofPitch, roofBaseH, roofMat)
      group.add(hipped)
    } else if (roofShape === 'pyramidal') {
      const pyramidal = buildPyramidalRoof(fp2d, roofPitch, roofBaseH, roofMat)
      group.add(pyramidal)
    } else if (roofShape === 'skillion') {
      const skillion = buildSkillionRoof(fp2d, roofPitch, roofBaseH, roofMat, facadeMat)
      group.add(skillion)
    } else if (roofShape === 'round') {
      const round = buildRoundRoof(fp2d, roofPitch, roofBaseH, roofMat, facadeMat)
      group.add(round)
    } else if (roofShape === 'dome') {
      const dome = buildDomeRoof(fp2d, roofPitch, roofBaseH, roofMat)
      group.add(dome)
    } else {
      // Flat roof with 3D parapet border (acrotère) & rooftop HVAC/lift penthouse/antennae
      const flat = buildFlatRoofWithDetails(shape, fp2d, roofBaseH, roofMat, facadeMat, hasHoles)
      group.add(flat)
    }

    // ── 3. Religious Architecture: Church Spire / Belfry / Minaret ────────
    if (bType === 'church' || bType === 'cathedral' || bType === 'chapel') {
      // Slender bell tower & cross spire
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
      for (const p of fp2d) {
        minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x)
        minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y)
      }
      const cx = (minX + maxX) / 2
      const cy = (minY + maxY) / 2

      const towerH = bType === 'cathedral' ? 14.0 : 8.0
      const spireH = bType === 'cathedral' ? 12.0 : 7.0
      const towerBaseH = building.height + (roofShape === 'pyramidal' ? roofPitch : 0)

      // Belfry square tower
      const towerGeo = new THREE.BoxGeometry(3.5, towerH, 3.5)
      const towerMesh = new THREE.Mesh(towerGeo, facadeMat)
      towerMesh.position.set(cx, towerBaseH + towerH / 2, cy)
      towerMesh.castShadow = true
      group.add(towerMesh)

      // Octagonal spire
      const spireGeo = new THREE.ConeGeometry(2.2, spireH, 8)
      const spireMesh = new THREE.Mesh(spireGeo, roofMat)
      spireMesh.position.set(cx, towerBaseH + towerH + spireH / 2, cy)
      spireMesh.castShadow = true
      group.add(spireMesh)

      // Golden cross finial
      const crossMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.8, roughness: 0.2 })
      const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.6, 0.12), crossMat)
      const crossH = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.12, 0.12), crossMat)
      crossV.position.set(cx, towerBaseH + towerH + spireH + 0.8, cy)
      crossH.position.set(cx, towerBaseH + towerH + spireH + 1.1, cy)
      group.add(crossV)
      group.add(crossH)
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

    const verts: number[] = []
    const indices: number[] = []
    const bottomY = building.minHeight ?? 0

    // Vertical wall quads along the outer ring and along every courtyard ring
    // (so a car inside a courtyard cannot drive through the inner facades).
    const rings: WorldPosition[][] = [fp]
    if (building.holes) for (const h of building.holes) if (h.length >= 3) rings.push(h)

    for (const ring of rings) {
      const n = ring.length
      const base = verts.length / 3
      for (let i = 0; i < n; i++) {
        const p = ring[i]!
        verts.push(p.x, bottomY, p.z)
        verts.push(p.x, building.height, p.z)
      }
      for (let i = 0; i < n; i++) {
        const next = (i + 1) % n
        const b0 = base + i * 2
        const t0 = base + i * 2 + 1
        const b1 = base + next * 2
        const t1 = base + next * 2 + 1
        indices.push(b0, b1, t0)
        indices.push(b1, t1, t0)
      }
    }

    return RAPIER.ColliderDesc.trimesh(
      new Float32Array(verts),
      new Uint32Array(indices),
    )
  }
}
