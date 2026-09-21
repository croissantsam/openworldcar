import type { Road, Building } from '@world-drive/shared'
import type { WorldPosition } from '@world-drive/math'

function estimateRoadHalfWidth(road: Road): number {
  if (road.explicitWidth && road.explicitWidth > 0) {
    return road.explicitWidth / 2
  }

  const lanes = road.lanes ?? 2
  const isLink = road.isLink ?? road.highway.endsWith('_link')

  let laneWidth = 3.5
  if (road.highway === 'motorway' || road.highway === 'trunk' || road.highway === 'primary') {
    laneWidth = 3.75
  } else if (road.highway === 'residential' || road.highway === 'living_street' || road.highway === 'service') {
    laneWidth = 3.0
  } else if (road.highway === 'track' || road.highway === 'path' || road.highway === 'footway' || road.highway === 'cycleway' || road.highway === 'pedestrian') {
    laneWidth = 2.0
  }

  const totalWidth = lanes * laneWidth

  const sidewalkExtra = road.sidewalkMode === 'both' ? 2.0 : (road.sidewalkMode === 'left' || road.sidewalkMode === 'right' ? 1.0 : 0)
  const cyclewayExtra = road.cycleway ? 1.5 : 0
  const parkingExtra = road.parkingLane === 'both' ? 2.5 : (road.parkingLane === 'left' || road.parkingLane === 'right' ? 1.25 : 0)

  return (totalWidth + sidewalkExtra + cyclewayExtra + parkingExtra) / 2 + 1.0
}

function pointInPolygon(pt: WorldPosition, polygon: WorldPosition[]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i]!.x, zi = polygon[i]!.z
    const xj = polygon[j]!.x, zj = polygon[j]!.z
    const intersect = ((zi > pt.z) !== (zj > pt.z)) &&
      (pt.x < (xj - xi) * (pt.z - zi) / (zj - zi) + xi)
    if (intersect) inside = !inside
  }
  return inside
}

function distancePointToSegment(px: number, pz: number, x1: number, z1: number, x2: number, z2: number): number {
  const dx = x2 - x1
  const dz = z2 - z1
  const lenSq = dx * dx + dz * dz
  if (lenSq === 0) return Math.hypot(px - x1, pz - z1)
  let t = ((px - x1) * dx + (pz - z1) * dz) / lenSq
  t = Math.max(0, Math.min(1, t))
  const closestX = x1 + t * dx
  const closestZ = z1 + t * dz
  return Math.hypot(px - closestX, pz - closestZ)
}

/**
 * Fraction of the footprint's vertices inside the road corridor (0..1).
 * A building merely touching a corridor with one corner is adjacency, not a conflict.
 */
function corridorVertexFraction(polygon: WorldPosition[], roadPoints: WorldPosition[], halfWidth: number): number {
  const bufferedHalfWidth = halfWidth + 1.5
  let inside = 0
  for (const pt of polygon) {
    for (let i = 0; i < roadPoints.length - 1; i++) {
      const a = roadPoints[i]!
      const b = roadPoints[i + 1]!
      const dist = distancePointToSegment(pt.x, pt.z, a.x, a.z, b.x, b.z)
      if (dist <= bufferedHalfWidth) { inside++; break }
    }
  }
  return polygon.length > 0 ? inside / polygon.length : 0
}

/**
 * True structural conflict: a road segment pierces the footprint, a road
 * endpoint lands inside it, or its centroid sits in a corridor (a road
 * running through the middle of a large footprint whose vertices are clear).
 */
function corridorPierces(polygon: WorldPosition[], roadPoints: WorldPosition[], halfWidth: number): boolean {
  const bufferedHalfWidth = halfWidth + 1.5

  for (let i = 0; i < roadPoints.length - 1; i++) {
    const a = roadPoints[i]!
    const b = roadPoints[i + 1]!
    for (let j = 0; j < polygon.length; j++) {
      const p1 = polygon[j]!
      const p2 = polygon[(j + 1) % polygon.length]!
      if (segmentsIntersect(a.x, a.z, b.x, b.z, p1.x, p1.z, p2.x, p2.z)) return true
    }
  }

  if (polygon.length > 0 && pointInPolygon(roadPoints[0]!, polygon)) return true
  if (polygon.length > 0 && pointInPolygon(roadPoints[roadPoints.length - 1]!, polygon)) return true

  if (polygon.length >= 3) {
    let cx = 0, cz = 0
    for (const p of polygon) { cx += p.x; cz += p.z }
    cx /= polygon.length; cz /= polygon.length
    for (let i = 0; i < roadPoints.length - 1; i++) {
      const a = roadPoints[i]!
      const b = roadPoints[i + 1]!
      if (distancePointToSegment(cx, cz, a.x, a.z, b.x, b.z) <= bufferedHalfWidth) return true
    }
  }

  return false
}

function segmentsIntersect(x1: number, z1: number, x2: number, z2: number, x3: number, z3: number, x4: number, z4: number): boolean {
  const denom = (x1 - x2) * (z3 - z4) - (z1 - z2) * (x3 - x4)
  if (denom === 0) return false
  const t = ((x1 - x3) * (z3 - z4) - (z1 - z3) * (x3 - x4)) / denom
  const u = -((x1 - x2) * (z1 - z3) - (z1 - z2) * (x1 - x3)) / denom
  return t >= 0 && t <= 1 && u >= 0 && u <= 1
}

export function filterBuildingsOverlappingRoads(buildings: Building[], roads: Road[]): Building[] {
  return buildings.filter(building => {
    if (building.footprint.length < 3) return true

    for (const road of roads) {
      const halfWidth = estimateRoadHalfWidth(road)
      // A road genuinely through the building is a conflict; a corner merely
      // touching the corridor is street adjacency — keep the building.
      if (corridorPierces(building.footprint, road.points, halfWidth)) {
        return false
      }
      if (corridorVertexFraction(building.footprint, road.points, halfWidth) >= 0.3) {
        return false
      }
    }
    return true
  })
}