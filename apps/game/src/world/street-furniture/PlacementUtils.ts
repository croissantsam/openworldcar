/**
 * Placement utilities — tree archetype selection, yaw calculation, colour parsing.
 */

import * as THREE from 'three'
import { hash32, unit, clamp, parseMetres, MAX_PER_KIND, MAX_TREES, ROAD_MARGIN } from './Hashing.js'
import { RoadIndex, NearestRoad } from './RoadIndex.js'

export function treeArchetypeFor(tags: Record<string, string> | undefined): 0 | 1 | 2 {
  const g = ((tags?.['genus'] ?? '') + ' ' + (tags?.['species'] ?? '') + ' ' + (tags?.['taxon'] ?? '')).toLowerCase()
  if (!g.trim()) return 2
  if (/platan|aesculus|marronnier|chestnut|plane/.test(g)) return 0
  if (/tilia|acer|carpinus|quercus|fraxinus|ulmus|populus|fagus|robinia|celtis|sophora|styphnolobium|linden|oak|maple/.test(g)) return 1
  return 2
}

export function faceYaw(n: NearestRoad | null, h: number): number {
  // Rotation about Y by yaw maps local +z to (sin yaw, 0, cos yaw): local +z faces the road.
  return n ? Math.atan2(n.toX, n.toZ) : unit(h, 3) * Math.PI * 2
}

export function parseColourTag(v: string | undefined): THREE.Color | null {
  if (!v) return null
  const s = v.trim().toLowerCase()
  if (/^#[0-9a-f]{6}$/.test(s)) return new THREE.Color(s)
  const names = THREE.Color.NAMES as Record<string, number>
  const hex = names[s]
  return hex !== undefined ? new THREE.Color(hex) : null
}

export { hash32, unit, clamp, parseMetres, MAX_PER_KIND, MAX_TREES, ROAD_MARGIN, RoadIndex }
export type { NearestRoad }