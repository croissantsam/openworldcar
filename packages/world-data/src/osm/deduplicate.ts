/**
 * Building deduplication and conflict resolution.
 *
 * Solves Z-fighting and rendering artifacts caused by OpenStreetMap data anomalies:
 * 1. Building outlines (building=*) coexisting with 3D parts (building:part=*)
 * 2. Obsolete/generic cadastre import footprints overlapping updated modern buildings
 * 3. Exact or near-exact duplicate polygons
 */

import type { Building } from '@world-drive/shared'

type Pt = { x: number; z: number }

function pointInPoly(pt: Pt, poly: Pt[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i]!.x, zi = poly[i]!.z
    const xj = poly[j]!.x, zj = poly[j]!.z
    const intersect = ((zi > pt.z) !== (zj > pt.z)) &&
      (pt.x < (xj - xi) * (pt.z - zi) / (zj - zi) + xi)
    if (intersect) inside = !inside
  }
  return inside
}

function samplePointsInPoly(poly: Pt[]): Pt[] {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
  for (const p of poly) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x)
    minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z)
  }
  const samples: Pt[] = []

  // Add vertices
  for (const p of poly) samples.push(p)

  // Add midpoints of edges
  const n = poly.length
  for (let i = 0; i < n; i++) {
    const next = (i + 1) % n
    samples.push({ x: (poly[i]!.x + poly[next]!.x) / 2, z: (poly[i]!.z + poly[next]!.z) / 2 })
  }

  // Centroid
  let cx = 0, cz = 0
  for (const p of poly) { cx += p.x; cz += p.z }
  samples.push({ x: cx / n, z: cz / n })

  // Grid interior samples (4x4)
  const steps = 4
  const dx = (maxX - minX) / (steps + 1)
  const dz = (maxZ - minZ) / (steps + 1)
  for (let i = 1; i <= steps; i++) {
    for (let j = 1; j <= steps; j++) {
      const pt = { x: minX + i * dx, z: minZ + j * dz }
      if (pointInPoly(pt, poly)) samples.push(pt)
    }
  }
  return samples
}

function computeOverlapFraction(smaller: Pt[], larger: Pt[]): number {
  const samples = samplePointsInPoly(smaller)
  if (samples.length === 0) return 0
  let insideCount = 0
  for (const s of samples) {
    if (pointInPoly(s, larger)) insideCount++
  }
  return insideCount / samples.length
}

function polyArea(poly: Pt[]): number {
  if (poly.length < 3) return 0
  let a = 0
  const n = poly.length
  for (let i = 0; i < n; i++) {
    const next = (i + 1) % n
    a += poly[i]!.x * poly[next]!.z - poly[next]!.x * poly[i]!.z
  }
  return Math.abs(a) / 2
}

function getFidelityScore(b: Building): number {
  let score = 0
  if (b.name) score += 25
  if (b.brand) score += 15
  if (b.buildingType && b.buildingType !== 'yes') score += 20
  if (b.levels > 0) score += 15
  if (b.roofShape && b.roofShape !== 'flat') score += 10
  if (b.colour || b.material) score += 10
  if (b.isPart) score += 30 // building:part represents actual 3D geometry over 2D outline
  if (b.source && b.source.toLowerCase().includes('cadastre')) score -= 15
  score += Math.min(b.footprint.length, 10)
  return score
}

/**
 * Deduplicate and resolve overlapping 3D buildings from OpenStreetMap data.
 *
 * Removes duplicate buildings, outlines that conflict with 3D parts,
 * and low-fidelity cadastre footprints that overlap updated buildings.
 */
export function deduplicateBuildings(buildings: Building[]): Building[] {
  if (buildings.length <= 1) return buildings

  const discarded = new Set<string>()
  const n = buildings.length

  // Precompute AABB, 2D points, area, and fidelity score
  const meta = buildings.map(b => {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
    const pts: Pt[] = b.footprint.map(p => ({ x: p.x, z: p.z }))
    for (const p of pts) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x)
      minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z)
    }
    const area = polyArea(pts)
    const score = getFidelityScore(b)
    return { b, minX, maxX, minZ, maxZ, pts, area, score }
  })

  for (let i = 0; i < n; i++) {
    const m1 = meta[i]!
    if (discarded.has(m1.b.id)) continue

    for (let j = i + 1; j < n; j++) {
      const m2 = meta[j]!
      if (discarded.has(m2.b.id)) continue

      // 1. Fast 2D AABB bounding box check with 0.5m margin
      if (
        m1.maxX <= m2.minX + 0.5 || m2.maxX <= m1.minX + 0.5 ||
        m1.maxZ <= m2.minZ + 0.5 || m2.maxZ <= m1.minZ + 0.5
      ) {
        continue
      }

      // 2. Vertical height overlap check
      const h1Bottom = m1.b.minHeight ?? 0
      const h1Top = m1.b.height
      const h2Bottom = m2.b.minHeight ?? 0
      const h2Top = m2.b.height
      const vertOverlap = Math.min(h1Top, h2Top) - Math.max(h1Bottom, h2Bottom)
      if (vertOverlap <= 0.5) {
        // Vertically stacked (e.g. podium and tower) — no 3D conflict
        continue
      }

      // 3. Compute 2D overlap fraction
      const smaller = m1.area <= m2.area ? m1 : m2
      const larger = m1.area <= m2.area ? m2 : m1
      if (smaller.area < 1.0) {
        // Discard degenerate tiny footprints
        discarded.add(smaller.b.id)
        continue
      }

      const frac = computeOverlapFraction(smaller.pts, larger.pts)

      // Significant 2D footprint overlap (> 20%) with vertical collision
      if (frac >= 0.20) {
        let toDiscard: typeof m1

        if (smaller.b.isPart && !larger.b.isPart) {
          // Keep the 3D building part, discard the enclosing building outline
          toDiscard = larger
        } else if (!smaller.b.isPart && larger.b.isPart) {
          toDiscard = smaller
        } else if (smaller.score !== larger.score) {
          // Discard the lower-fidelity building
          toDiscard = smaller.score < larger.score ? smaller : larger
        } else {
          // Tiebreak: discard smaller footprint
          toDiscard = smaller
        }

        discarded.add(toDiscard.b.id)
      }
    }
  }

  return buildings.filter(b => !discarded.has(b.id))
}
