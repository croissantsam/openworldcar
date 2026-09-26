/**
 * Classical statue geometries and archetype classification.
 *
 * Provides historical monuments (pedestrian, equestrian, busts, obelisks)
 * with multi-tiered stone pedestals and patinated bronze statues.
 * Built with GeoBuilder to share FURN_MAT vertex colors with zero extra draw calls.
 */

import * as THREE from 'three'
import type { PointOfInterest } from '@world-drive/shared'
import { GeoBuilder } from './GeometryHelpers.js'

export type StatueArchetype = 'statueEquestrian' | 'statuePedestrian' | 'statueBust' | 'statueObelisk'

/**
 * Returns true if a POI is a historical statue, memorial, or sculpted monument.
 */
export function isStatuePoi(poi: PointOfInterest): boolean {
  const tags = poi.tags
  if (tags) {
    const mem = tags['memorial']
    if (mem === 'statue' || mem === 'bust' || mem === 'obelisk' || mem === 'stone' || mem === 'stele') return true
    if (tags['historic'] === 'statue') return true
    const art = tags['artwork_type']
    if (art === 'statue' || art === 'bust' || art === 'obelisk' || art === 'sculpture') return true

    if (tags['historic'] === 'memorial' || tags['historic'] === 'monument') {
      if (tags['memorial']) return true
      const text = `${poi.name ?? ''} ${tags['name'] ?? ''} ${tags['description'] ?? ''} ${tags['wikipedia'] ?? ''}`.toLowerCase()
      if (
        text.includes('statue') ||
        text.includes('buste') ||
        text.includes('bust') ||
        text.includes('obélisque') ||
        text.includes('obelisk') ||
        text.includes('sculpture') ||
        text.includes('monument') ||
        text.includes('memorial') ||
        text.includes('mémorial')
      ) {
        return true
      }
    }

    if (tags['tourism'] === 'artwork') {
      const text = `${poi.name ?? ''} ${tags['name'] ?? ''} ${tags['description'] ?? ''}`.toLowerCase()
      if (text.includes('statue') || text.includes('buste') || text.includes('bust') || text.includes('sculpture')) {
        return true
      }
    }
  }

  const name = (poi.name ?? '').toLowerCase()
  if (
    name.startsWith('statue') ||
    name.includes(' statue') ||
    name.startsWith('buste') ||
    name.includes(' buste') ||
    name.startsWith('obélisque') ||
    name.includes(' obélisque') ||
    name.startsWith('obelisk') ||
    name.includes(' obelisk')
  ) {
    return true
  }

  return false
}

/**
 * Select the most appropriate statue archetype based on OSM tags and metadata.
 */
export function statueArchetypeFor(poi: PointOfInterest): StatueArchetype {
  const tags = poi.tags ?? {}
  const mem = (tags['memorial'] ?? '').toLowerCase()
  const art = (tags['artwork_type'] ?? '').toLowerCase()
  const text = `${poi.name ?? ''} ${tags['name'] ?? ''} ${tags['wikipedia'] ?? ''} ${tags['description'] ?? ''}`.toLowerCase()

  if (mem === 'obelisk' || art === 'obelisk' || text.includes('obélisque') || text.includes('obelisk')) {
    return 'statueObelisk'
  }
  if (mem === 'bust' || art === 'bust' || text.includes('buste') || text.includes('bust')) {
    return 'statueBust'
  }
  if (
    text.includes('équestre') ||
    text.includes('equestrian') ||
    text.includes('cavalier') ||
    text.includes('cheval') ||
    text.includes('horse')
  ) {
    return 'statueEquestrian'
  }
  return 'statuePedestrian'
}

/**
 * Classical standing hero / statesman statue on stepped stone pedestal.
 * Overall height ~4.6m.
 */
export function buildPedestrianStatueGeo(): THREE.BufferGeometry {
  const b = new GeoBuilder()

  // 1. Stone Pedestal (Limestone & Granite foundation)
  b.box(2.2, 0.25, 2.2, 0, 0.125, 0, 0x8c8678)
  b.box(1.9, 0.25, 1.9, 0, 0.375, 0, 0xc2b8a4)
  b.box(1.4, 1.7, 1.4, 0, 1.35, 0, 0xd6cebe)
  // Commemorative bronze plaques (front & back)
  b.box(0.85, 0.6, 0.04, 0, 1.35, 0.72, 0x78643c)
  b.box(0.85, 0.6, 0.04, 0, 1.35, -0.72, 0x78643c)
  // Upper cornice / entablature
  b.box(1.65, 0.2, 1.65, 0, 2.3, 0, 0xc2b8a4)
  b.box(1.5, 0.1, 1.5, 0, 2.45, 0, 0xc2b8a4)

  // 2. Bronze Plinth
  b.box(1.1, 0.12, 1.1, 0, 2.56, 0, 0x26332a)

  // 3. Human Figure (Standing Hero / Orator / Statesman)
  // Legs & boots
  b.cyl(0.12, 0.13, 0.75, -0.16, 2.995, -0.04, 0x202923, 8)
  b.cyl(0.12, 0.13, 0.75, 0.16, 2.995, 0.08, 0x202923, 8)
  // Lower coat / tunic drapery
  b.cyl(0.36, 0.28, 0.65, 0, 3.25, 0.02, 0x2e3d33, 8)
  // Torso / military coat
  b.box(0.52, 0.62, 0.32, 0, 3.75, 0.02, 0x2e3d33)
  // Coat lapels / sash
  b.box(0.18, 0.5, 0.35, 0.04, 3.75, 0.02, 0x384a3e)
  // Cloak / mantle hanging behind
  b.box(0.56, 1.05, 0.1, 0, 3.5, -0.15, 0x26332a)
  // Left arm (resting at hip holding scroll or parchment)
  b.cyl(0.08, 0.09, 0.55, -0.32, 3.65, 0.02, 0x2e3d33, 6)
  b.box(0.08, 0.22, 0.08, -0.32, 3.35, 0.08, 0x384a3e)
  // Right arm (gesture pointing / raised)
  b.cyl(0.08, 0.09, 0.35, 0.32, 3.82, 0.1, 0x2e3d33, 6)
  b.box(0.1, 0.1, 0.32, 0.32, 3.96, 0.24, 0x2e3d33)
  // Neck & collar
  b.cyl(0.1, 0.12, 0.16, 0, 4.14, 0.02, 0x2e3d33, 8)
  // Head & face
  b.box(0.22, 0.26, 0.24, 0, 4.31, 0.04, 0x35483e)
  b.box(0.08, 0.12, 0.08, 0, 4.31, 0.17, 0x35483e)
  // Hair & hat
  b.box(0.32, 0.12, 0.34, 0, 4.46, 0.03, 0x202923)
  b.cyl(0.2, 0.18, 0.1, 0, 4.48, 0.03, 0x202923, 8)

  return b.build()
}

/**
 * Grand equestrian statue (e.g. Washington, Jeanne d'Arc, Napoleon).
 * Features an oblong neoclassical pedestal with apsidal ends,
 * a dynamic war horse with raised leg, and a commanding mounted general with sword.
 * Overall height ~5.6m.
 */
export function buildEquestrianStatueGeo(): THREE.BufferGeometry {
  const b = new GeoBuilder()

  // 1. Neoclassical Oblong Pedestal
  b.box(2.4, 0.3, 4.0, 0, 0.15, 0, 0x8c8678)
  b.box(2.1, 0.3, 3.7, 0, 0.45, 0, 0xc2b8a4)
  b.box(1.5, 1.9, 3.1, 0, 1.55, 0, 0xd6cebe)
  // Apsidal ends
  b.cyl(0.75, 0.75, 1.9, 0, 1.55, 1.55, 0xd6cebe, 12)
  b.cyl(0.75, 0.75, 1.9, 0, 1.55, -1.55, 0xd6cebe, 12)
  // Commemorative bronze plaques
  b.box(0.65, 0.5, 0.04, 0, 1.55, 2.32, 0x78643c)
  b.box(0.04, 0.55, 1.5, 0.77, 1.55, 0, 0x78643c)
  b.box(0.04, 0.55, 1.5, -0.77, 1.55, 0, 0x78643c)
  // Upper cornice
  b.box(1.75, 0.25, 3.35, 0, 2.625, 0, 0xc2b8a4)
  b.cyl(0.875, 0.875, 0.25, 0, 2.625, 1.55, 0xc2b8a4, 12)
  b.cyl(0.875, 0.875, 0.25, 0, 2.625, -1.55, 0xc2b8a4, 12)
  // Bronze plinth under horse
  b.box(1.15, 0.15, 2.7, 0, 2.825, 0, 0x26332a)

  // 2. The Bronze Horse (Facing +Z forward)
  b.cyl(0.1, 0.08, 1.05, -0.3, 3.425, -0.8, 0x202923, 6)
  b.cyl(0.1, 0.08, 1.05, 0.3, 3.425, -0.8, 0x202923, 6)
  b.cyl(0.09, 0.075, 1.05, 0.28, 3.425, 0.65, 0x202923, 6)
  // Raised front leg
  b.cyl(0.095, 0.085, 0.6, -0.3, 3.75, 0.55, 0x2e3d33, 6)
  b.cyl(0.08, 0.07, 0.5, -0.3, 3.45, 0.8, 0x202923, 6)
  // Torso / flanks / chest
  b.box(0.7, 0.72, 1.45, 0, 4.12, 0, 0x2e3d33)
  b.box(0.74, 0.75, 0.75, 0, 4.15, -0.65, 0x2e3d33)
  b.box(0.7, 0.78, 0.65, 0, 4.18, 0.65, 0x35483e)
  // Neck
  b.box(0.4, 0.85, 0.6, 0, 4.7, 0.95, 0x2e3d33)
  // Head & muzzle
  b.box(0.3, 0.36, 0.52, 0, 5.08, 1.25, 0x2e3d33)
  // Ears
  b.box(0.07, 0.15, 0.07, -0.1, 5.32, 1.1, 0x202923)
  b.box(0.07, 0.15, 0.07, 0.1, 5.32, 1.1, 0x202923)
  // Tail
  b.cyl(0.09, 0.13, 0.85, 0, 3.9, -1.15, 0x202923, 6)

  // 3. The Rider (Commander / Cavalier)
  // Saddle
  b.box(0.78, 0.14, 0.7, 0, 4.54, 0.05, 0x202923)
  // Legs flanking horse
  b.box(0.18, 0.68, 0.28, -0.42, 4.16, 0.1, 0x202923)
  b.box(0.18, 0.68, 0.28, 0.42, 4.16, 0.1, 0x202923)
  // Uniform torso
  b.box(0.46, 0.6, 0.32, 0, 4.9, 0.05, 0x2e3d33)
  // Flowing cape
  b.box(0.54, 0.88, 0.12, 0, 4.68, -0.18, 0x26332a)
  // Left arm holding reins
  b.box(0.13, 0.13, 0.42, -0.27, 4.86, 0.26, 0x2e3d33)
  // Right arm holding sword / baton
  b.box(0.13, 0.42, 0.13, 0.3, 5.15, 0.16, 0x2e3d33)
  b.cyl(0.02, 0.02, 0.65, 0.3, 5.58, 0.24, 0x384a3e, 4)
  // Head & Commander's Hat
  b.box(0.2, 0.24, 0.22, 0, 5.32, 0.05, 0x35483e)
  b.box(0.48, 0.12, 0.3, 0, 5.5, 0.05, 0x202923)

  return b.build()
}

/**
 * Classical sculpted portrait bust on tall stone stèle.
 * Overall height ~3.0m.
 */
export function buildBustStatueGeo(): THREE.BufferGeometry {
  const b = new GeoBuilder()

  // 1. Pedestal / Stèle
  b.box(1.3, 0.2, 1.3, 0, 0.1, 0, 0x8c8678)
  b.box(1.0, 0.2, 1.0, 0, 0.3, 0, 0xc2b8a4)
  b.box(0.7, 1.5, 0.7, 0, 1.15, 0, 0xd6cebe)
  b.box(0.45, 0.4, 0.03, 0, 1.25, 0.365, 0x78643c)
  b.box(0.85, 0.18, 0.85, 0, 1.99, 0, 0xc2b8a4)

  // 2. Bronze Bust
  b.box(0.5, 0.1, 0.5, 0, 2.13, 0, 0x26332a)
  b.box(0.68, 0.36, 0.36, 0, 2.36, 0, 0x2e3d33)
  b.cyl(0.11, 0.12, 0.16, 0, 2.58, 0.01, 0x2e3d33, 8)
  b.box(0.24, 0.3, 0.26, 0, 2.76, 0.02, 0x35483e)
  b.box(0.08, 0.14, 0.08, 0, 2.76, 0.16, 0x35483e)
  b.box(0.28, 0.24, 0.28, 0, 2.82, 0, 0x202923)

  return b.build()
}

/**
 * Historic monumental stone obelisk with inscribed plaques and gilded pyramidion.
 * Overall height ~9.0m.
 */
export function buildObeliskStatueGeo(): THREE.BufferGeometry {
  const b = new GeoBuilder()

  // 1. Stepped Monumental Pedestal
  b.box(3.8, 0.3, 3.8, 0, 0.15, 0, 0x8c8678)
  b.box(3.0, 0.3, 3.0, 0, 0.45, 0, 0xc2b8a4)
  b.box(2.0, 1.6, 2.0, 0, 1.4, 0, 0xd6cebe)
  // Bronze inscription plaques around 4 sides
  b.box(1.2, 1.0, 0.04, 0, 1.4, 1.02, 0x78643c)
  b.box(1.2, 1.0, 0.04, 0, 1.4, -1.02, 0x78643c)
  b.box(0.04, 1.0, 1.2, 1.02, 1.4, 0, 0x78643c)
  b.box(0.04, 1.0, 1.2, -1.02, 1.4, 0, 0x78643c)
  b.box(2.3, 0.25, 2.3, 0, 2.325, 0, 0xc2b8a4)

  // 2. The Obelisk Shaft (Syenite granite needle, rotated 45 deg so faces align with base)
  b.box(1.4, 0.2, 1.4, 0, 2.55, 0, 0x9e988a)
  // 4-sided tapering needle rotated 45 degrees (Math.PI / 4)
  b.cyl(0.5, 0.85, 5.5, 0, 5.4, 0, 0xc49a82, 4, Math.PI / 4)
  // Gilded pyramidion / capstone
  b.cyl(0.02, 0.5, 0.8, 0, 8.55, 0, 0xdfb432, 4, Math.PI / 4)

  return b.build()
}
