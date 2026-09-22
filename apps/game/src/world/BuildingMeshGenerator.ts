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
 *   - Real 3D relief on every masonry building: floor string-course bands, corner quoins
 *     (pilasters), protruding entrance portals with steps; slim dark roofline caps on
 *     modern / industrial blocks. All relief shares 4 materials (no draw-call explosion).
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
import {
  PALETTES,
  GLASS_PALETTE,
  TYPE_PALETTES,
  MATERIAL_COLORS,
  ROOF_MATERIAL_COLORS,
} from './building/building-palettes'
import {
  getFacadeMat,
  getRoofMat,
  hashId,
} from './building/building-textures'
import {
  buildFlatRoofWithDetails,
  buildMansardRoof,
  buildGabledRoof,
  buildHippedRoof,
  buildPyramidalRoof,
  buildSkillionRoof,
  buildRoundRoof,
  buildDomeRoof,
  buildOpenCanopy,
} from './building/roof-builders'
import { addLedges } from './FacadeRelief'

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
    let pal: typeof PALETTES[0]
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
    const rows = Math.min(levels, 24) // MAX_TEXTURE_ROWS from building-textures

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

    // ── 1b. Real 3D relief: cornices, plinths, floor bands, corner quoins,
    // entrance portals, balcony slabs + railings (shared materials only, so the
    // chunk merger keeps draw calls bounded) ──
    const style = pal.style
    const masonry = style === 'haussmann' || style === 'render' || style === 'brick' ||
      style === 'civic_classical' || style === 'commercial_boutique' || style === 'residential_house' ||
      style === 'religious'
    if (masonry && wallHeight >= 3) {
      addLedges(group, {
        ring: fp2d,
        bottomY,
        topY: building.height,
        floorH,
        levels,
        cornice: true,
        plinth: style !== 'residential_house' && style !== 'religious',
        balconies: style === 'haussmann' || style === 'render' || style === 'brick' ||
          style === 'civic_classical',
        bands: style !== 'residential_house',
        pilasters: style === 'haussmann' || style === 'brick' || style === 'civic_classical' ||
          style === 'religious',
        entrance: true,
        darkTrim: false,
      })
    } else if (wallHeight >= 3) {
      // Modern / industrial / sheds: a slim dark cap so the roofline still reads in 3D.
      addLedges(group, {
        ring: fp2d,
        bottomY,
        topY: building.height,
        floorH,
        levels,
        cornice: true,
        plinth: false,
        balconies: false,
        bands: false,
        pilasters: false,
        entrance: false,
        darkTrim: true,
      })
    }

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

    // Pitched builders decline (null) when the footprint cannot carry the shape
    // (irregular rings, degenerate spans): fall back to flat so the roof always
    // sits on the walls instead of floating beside them.
    const addFlat = (): void => {
      // Flat roof with 3D parapet border (acrotère) & rooftop HVAC/lift penthouse/antennae
      const flat = buildFlatRoofWithDetails(shape, fp2d, roofBaseH, roofMat, facadeMat, hasHoles)
      group.add(flat)
    }
    if (roofShape === 'mansard') {
      const mansard = buildMansardRoof(fp2d, Math.max(2.2, roofPitch), roofBaseH, roofMat, facadeMat)
      if (mansard) group.add(mansard)
      else addFlat()
    } else if (roofShape === 'gabled') {
      const gabled = buildGabledRoof(fp2d, roofPitch, roofBaseH, roofMat, facadeMat, building.roofOrientation)
      if (gabled) group.add(gabled)
      else addFlat()
    } else if (roofShape === 'hipped') {
      const hipped = buildHippedRoof(fp2d, roofPitch, roofBaseH, roofMat)
      if (hipped) group.add(hipped)
      else addFlat()
    } else if (roofShape === 'pyramidal') {
      const pyramidal = buildPyramidalRoof(fp2d, roofPitch, roofBaseH, roofMat)
      if (pyramidal) group.add(pyramidal)
      else addFlat()
    } else if (roofShape === 'skillion') {
      const skillion = buildSkillionRoof(fp2d, roofPitch, roofBaseH, roofMat, facadeMat)
      group.add(skillion)
    } else if (roofShape === 'round') {
      const round = buildRoundRoof(fp2d, roofPitch, roofBaseH, roofMat, facadeMat)
      if (round) group.add(round)
      else addFlat()
    } else if (roofShape === 'dome') {
      const dome = buildDomeRoof(fp2d, roofPitch, roofBaseH, roofMat)
      if (dome) group.add(dome)
      else addFlat()
    } else {
      addFlat()
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

    // ── Roof cap (flat slab at wall-top height) ──────────────────────────
    // Closes the volume so aircraft collide with roofs — and can land on
    // them (the flight ground-ray accepts TriMesh) — instead of falling
    // through into the building. Courtyard holes stay open (earcut skips
    // them), so airshafts remain flyable. Pitched visual roofs protrude
    // above the flat cap: collision stays at eave level by design.
    // Both windings are emitted (OSM ring winding is arbitrary) so the
    // slab collides from above regardless of triangle facing.
    try {
      const contour = fp.map((p) => new THREE.Vector2(p.x, p.z))
      const holeRings = (building.holes ?? []).filter((h) => h.length >= 3)
      const holeContours = holeRings.map((h) => h.map((p) => new THREE.Vector2(p.x, p.z)))
      const faces = THREE.ShapeUtils.triangulateShape(contour, holeContours)
      if (faces.length > 0) {
        const base = verts.length / 3
        for (const p of fp) verts.push(p.x, building.height, p.z)
        for (const h of holeRings) for (const p of h) verts.push(p.x, building.height, p.z)
        for (const f of faces) {
          const a = base + f[0]!
          const b = base + f[1]!
          const c = base + f[2]!
          indices.push(a, b, c)
          indices.push(a, c, b)
        }
      }
    } catch {
      // Degenerate footprint: keep walls-only rather than no collider at all.
    }

    return RAPIER.ColliderDesc.trimesh(
      new Float32Array(verts),
      new Uint32Array(indices),
    )
  }
}