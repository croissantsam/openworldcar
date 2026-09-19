/**
 * OsmMultipolygon — buildings mapped as `type=multipolygon` relations.
 *
 * The OSM /api/0.6/map payload carries `<relation>` elements that the way
 * parser ignores. Buildings with inner courtyards (typical Haussmann blocks,
 * but the pattern is used worldwide) are mapped as a relation whose tags hold
 * `building=*` while its member ways are untagged and only carry geometry:
 *
 *   <relation id="1260751">
 *     <member type="way" ref="84330100" role="outer"/>
 *     <member type="way" ref="84328352" role="inner"/>
 *     <tag k="building" v="apartments"/>
 *     <tag k="type" v="multipolygon"/>
 *   </relation>
 *
 * This module is pure parsing: it stitches the member ways into closed rings,
 * hands every closed OUTER ring to the caller's `normalizeBuilding` (which
 * projects to world space and reads levels / roof tags exactly as for a closed
 * way) and attaches each closed INNER ring lying inside that outer as a hole.
 *
 * Ring convention: identical to a closed OSM way — the ring's first node is
 * repeated as its last point, so `footprint` and every `holes[i]` end with a
 * duplicate of their first point, exactly like every way-based building today.
 */

import type { Building } from '@world-drive/shared'

/** Same shape as world-data's RawOsmWay (coords are [lon, lat] pairs). */
export type RawBuildingInput = {
  id: string
  tags: Record<string, string>
  coords: [number, number][]
}

type NormalizeBuilding = (raw: RawBuildingInput) => Building | null
type DecodeTags = (body: string) => Record<string, string>

// Attribute part must not contain "/>" so a (theoretical) self-closing relation
// can never swallow the following elements up to a later </relation>.
const RELATION_RE = /<relation id="(\d+)"((?:[^>/]|\/(?!>))*)>([\s\S]*?)<\/relation>/g
// The OSM API always writes member attributes in the order type, ref, role.
const WAY_MEMBER_RE = /<member type="way" ref="(\d+)" role="([^"]*)"\s*\/>/g

/**
 * Stitch member ways (ordered node-id lists) end-to-end into closed rings.
 * Ways are reversed as needed; a ring closes when it returns to its start
 * node. Unclosed chains (e.g. a member way outside the bbox) are dropped.
 * Stitching works on node ids only, so it is unaffected by missing coordinates.
 */
function assembleRings(ways: string[][]): string[][] {
  const rings: string[][] = []
  const used = new Array<boolean>(ways.length).fill(false)

  for (let start = 0; start < ways.length; start++) {
    if (used[start]) continue
    const first = ways[start]!
    if (first.length < 2) { used[start] = true; continue }
    used[start] = true
    const ring: string[] = first.slice()

    // Grow forward until the chain returns to its first node id.
    for (;;) {
      const head = ring[0]!
      const tail = ring[ring.length - 1]!
      if (head === tail) {
        if (ring.length >= 4) rings.push(ring)
        break
      }
      let extended = false
      for (let j = 0; j < ways.length; j++) {
        if (used[j]) continue
        const w = ways[j]!
        if (w.length < 2) { used[j] = true; continue }
        const wFirst = w[0]!
        const wLast = w[w.length - 1]!
        if (wFirst === tail) {
          for (let k = 1; k < w.length; k++) ring.push(w[k]!)
        } else if (wLast === tail) {
          for (let k = w.length - 2; k >= 0; k--) ring.push(w[k]!)
        } else {
          continue
        }
        used[j] = true
        extended = true
        break
      }
      if (!extended) break // dangling chain: dropped
    }
  }
  return rings
}

/** Ray-casting point-in-polygon on [lon, lat] pairs (closing point tolerated). */
function pointInRing(pt: [number, number], ring: [number, number][]): boolean {
  const x = pt[0]
  const y = pt[1]
  let inside = false
  const n = ring.length
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const a = ring[i]!
    const b = ring[j]!
    const yi = a[1], yj = b[1]
    if ((yi > y) !== (yj > y)) {
      const xi = a[0], xj = b[0]
      const xAt = ((xj - xi) * (y - yi)) / (yj - yi) + xi
      if (x < xAt) inside = !inside
    }
  }
  return inside
}

function ringCoords(ring: string[], nodes: Map<string, [number, number]>): [number, number][] {
  const coords: [number, number][] = []
  for (const id of ring) {
    const pt = nodes.get(id)
    if (pt) coords.push(pt)
  }
  return coords
}

/**
 * Parse `type=multipolygon` relations tagged `building=*` into Building[].
 *
 * @param xmlText          Raw OSM XML (the same payload the way parser reads).
 * @param nodes            node id -> [lon, lat] for every node in the payload.
 * @param wayNodeRefs      way id -> ordered node ids, for ALL ways incl. untagged.
 * @param normalizeBuilding world-data's normalizeBuilding (projection + tags).
 * @param decodeTags       The fetcher's <tag k v/> body decoder.
 * @param emittedWayIds    Optional: ids of ways the way parser already turned
 *                         into buildings. An outer ring made of exactly one such
 *                         way is skipped (mappers sometimes tag both the relation
 *                         and its outer way), avoiding a duplicate footprint.
 */
export function parseMultipolygonBuildings(
  xmlText: string,
  nodes: Map<string, [number, number]>,
  wayNodeRefs: Map<string, string[]>,
  normalizeBuilding: NormalizeBuilding,
  decodeTags: DecodeTags,
  emittedWayIds?: ReadonlySet<string>,
): Building[] {
  const buildings: Building[] = []
  if (xmlText.indexOf('<relation') === -1) return buildings

  for (const rm of xmlText.matchAll(RELATION_RE)) {
    const body = rm[3]!
    // Cheap pre-filters before decoding tags.
    if (body.indexOf('v="multipolygon"') === -1 || body.indexOf('k="building"') === -1) continue

    const tags = decodeTags(body)
    if (tags['type'] !== 'multipolygon') continue
    const buildingTag = tags['building']
    // Relations that are only building:part (or building=no) are skipped.
    if (!buildingTag || buildingTag === 'no') continue

    const outerWays: string[][] = []
    const innerWays: string[][] = []
    for (const mm of body.matchAll(WAY_MEMBER_RE)) {
      const wayId = mm[1]!
      const refs = wayNodeRefs.get(wayId)
      if (!refs || refs.length < 2) continue // member way outside the bbox
      const role = mm[2]!
      if (role === 'inner') innerWays.push(refs)
      else if (role === 'outer' || role === '') { // legacy: empty role = outer
        // Closed outer way already emitted by the way parser → would duplicate.
        if (emittedWayIds?.has(wayId) && refs[0] === refs[refs.length - 1]) continue
        outerWays.push(refs)
      }
    }
    if (outerWays.length === 0) continue

    const relId = rm[1]!
    const outerRings = assembleRings(outerWays)
    if (outerRings.length === 0) continue
    const innerRings = innerWays.length > 0 ? assembleRings(innerWays) : []
    const innerCoords = innerRings.map(r => ringCoords(r, nodes))
    const innerUsed = new Array<boolean>(innerRings.length).fill(false)

    for (let k = 0; k < outerRings.length; k++) {
      const coords = ringCoords(outerRings[k]!, nodes)
      if (coords.length < 4) continue // 3 distinct points + closing point

      const id = outerRings.length > 1 ? `r${relId}_${k}` : `r${relId}`
      const building = normalizeBuilding({ id, tags, coords })
      if (!building) continue

      if (innerCoords.length > 0) {
        const holes: Building['holes'] = []
        for (let j = 0; j < innerCoords.length; j++) {
          if (innerUsed[j]) continue
          const inner = innerCoords[j]!
          if (inner.length < 4) { innerUsed[j] = true; continue }
          if (!pointInRing(inner[0]!, coords)) continue
          innerUsed[j] = true
          // Reuse normalizeBuilding purely for its projection so the hole uses
          // exactly the outer's convention (orientation, closing point).
          const projected = normalizeBuilding({ id: `${id}_h${j}`, tags, coords: inner })
          if (projected && projected.footprint.length >= 4) holes.push(projected.footprint)
        }
        if (holes.length > 0) building.holes = holes
      }

      buildings.push(building)
    }
  }

  return buildings
}
