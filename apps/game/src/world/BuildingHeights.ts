/**
 * BuildingHeights — fills in heights for buildings whose height only came from the
 * type default (no `height` / `building:levels` tag) using the real levels of their
 * neighbours. Pure data pass (no three.js): the orchestrator calls it once per chunk
 * right after OSM parsing, before any mesh is generated.
 *
 * Global by design: nothing here is keyed on region. The fallback when a building has
 * no neighbour with a known level count is the median of the chunk itself, and only
 * when the chunk knows nothing at all does a flat world-wide default (3 levels) apply.
 */

import type { Building, BuildingType } from '@world-drive/shared'

/** Must match DEFAULT_FLOOR_HEIGHT in packages/world-data normalize.ts */
const FLOOR_H = 3.5
/** Neighbourhood radius (metres) used to borrow levels from tagged neighbours. */
const RADIUS = 60
/** World-wide fallback when neither the neighbours nor the chunk know any level count. */
const GLOBAL_DEFAULT_LEVELS = 3
/** Distinct level variants the facade renderer supports; also a sanity cap. */
const MAX_LEVELS = 24

/**
 * Type defaults exactly as the normaliser assigns them when no height/levels tag exists.
 * Only the "untyped-ish" residential kinds are eligible for filling: everything else
 * (offices, churches, warehouses, sheds, garages, canopies…) keeps its own default.
 */
const FILLABLE_DEFAULTS: Partial<Record<BuildingType | 'yes', number>> = {
  yes: 8,
  apartments: 18,
}

/** Types whose real-world height is intrinsically low: they never borrow neighbour levels. */
const KEEP_AS_IS = new Set<string>([
  'shed', 'garage', 'garages', 'carport', 'roof', 'hut', 'cabin', 'kiosk', 'greenhouse', 'bungalow',
  'house', 'detached', 'semidetached_house', 'terrace', 'farm_auxiliary', 'barn', 'stable', 'ruins',
])

interface Info {
  cx: number
  cz: number
  area: number
}

function footprintInfo(b: Building): Info {
  const fp = b.footprint
  const n = fp.length
  let twiceArea = 0
  let cx = 0
  let cz = 0
  for (let i = 0; i < n; i++) {
    const p = fp[i]!
    const q = fp[(i + 1) % n]!
    const cross = p.x * q.z - q.x * p.z
    twiceArea += cross
    cx += (p.x + q.x) * cross
    cz += (p.z + q.z) * cross
  }
  const area = Math.abs(twiceArea) / 2
  if (area < 1e-6) {
    // Degenerate ring: fall back to vertex average
    let sx = 0, sz = 0
    for (const p of fp) { sx += p.x; sz += p.z }
    return { cx: sx / n, cz: sz / n, area }
  }
  return { cx: cx / (3 * twiceArea), cz: cz / (3 * twiceArea), area }
}

/** True when the building's height/levels are just the normaliser's type default. */
export function hasDefaultHeight(b: Building): boolean {
  const t = (b.buildingType ?? 'yes') as BuildingType | 'yes'
  const def = FILLABLE_DEFAULTS[t]
  if (def === undefined) return false
  if (b.minHeight !== undefined) return false
  return Math.abs(b.height - def) < 1e-6 && b.levels === Math.round(def / FLOOR_H)
}

function median(values: number[]): number {
  const s = values.slice().sort((a, b) => a - b)
  const mid = s.length >> 1
  return s.length % 2 === 1 ? s[mid]! : Math.round((s[mid - 1]! + s[mid]!) / 2)
}

/** Level cap from footprint area so tiny footprints never become towers. */
function areaCap(area: number): number {
  if (area <= 60) return 3   // garden shed / annex sized
  if (area <= 100) return 5  // narrow urban lot
  return MAX_LEVELS
}

/**
 * Mutates `buildings` in place: every building whose height is only the type default
 * gets the median level count of its tagged neighbours within 60 m (grid-hashed, so the
 * pass is ~O(n) for a chunk), else the chunk-wide median, else 3 levels.
 * Footprints ≤ 40 m² and intrinsically low types are left untouched.
 */
export function fillMissingHeights(buildings: Building[]): void {
  const n = buildings.length
  if (n === 0) return

  const infos: Info[] = new Array<Info>(n)
  const unknown: number[] = []
  const grid = new Map<string, number[]>()
  const knownLevels: number[] = []
  const inv = 1 / RADIUS

  for (let i = 0; i < n; i++) {
    const b = buildings[i]!
    if (b.footprint.length < 3) { infos[i] = { cx: 0, cz: 0, area: 0 }; continue }
    const info = footprintInfo(b)
    infos[i] = info
    const type = b.buildingType ?? 'yes'
    if (KEEP_AS_IS.has(type)) continue
    if (hasDefaultHeight(b)) {
      unknown.push(i)
      continue
    }
    if (!(b.levels >= 1) || b.minHeight !== undefined) continue
    // Only "normal" buildings act as references: no canopies/sheds, no spires
    if (type === 'church' || type === 'cathedral' || type === 'stadium' || type === 'monument') continue
    const key = `${Math.floor(info.cx * inv)},${Math.floor(info.cz * inv)}`
    let cell = grid.get(key)
    if (!cell) { cell = []; grid.set(key, cell) }
    cell.push(i)
    knownLevels.push(b.levels)
  }

  if (unknown.length === 0) return
  const chunkMedian = knownLevels.length >= 5 ? median(knownLevels) : GLOBAL_DEFAULT_LEVELS
  const r2 = RADIUS * RADIUS
  const neighbours: number[] = []

  for (const i of unknown) {
    const b = buildings[i]!
    const info = infos[i]!
    if (info.area <= 40) continue // very small footprints stay low as they are

    neighbours.length = 0
    const gx = Math.floor(info.cx * inv)
    const gz = Math.floor(info.cz * inv)
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const cell = grid.get(`${gx + dx},${gz + dz}`)
        if (!cell) continue
        for (const j of cell) {
          const o = infos[j]!
          const ddx = o.cx - info.cx
          const ddz = o.cz - info.cz
          if (ddx * ddx + ddz * ddz <= r2) neighbours.push(buildings[j]!.levels)
        }
      }
    }

    let levels = neighbours.length > 0 ? median(neighbours) : chunkMedian
    levels = Math.max(1, Math.min(areaCap(info.area), MAX_LEVELS, Math.round(levels)))
    b.levels = levels
    b.height = levels * FLOOR_H
  }
}
