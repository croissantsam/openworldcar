/**
 * ParkedCarGenerator — visual-only parked cars along OSM street parking
 * (Road.parkingLane from parking:left/right/both=*). One InstancedMesh per
 * road, one shared material, deterministic occupancy/colour per slot.
 * Works anywhere in the world: it only reads the road geometry + tags.
 */

import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

type Pt = { x: number; y: number; z: number }

const CAR_LENGTH = 4.3
const CAR_WIDTH = 1.75
const SLOT_PITCH = 5.6
const OCCUPANCY = 0.7
const END_MARGIN = 8 + CAR_LENGTH / 2
const CROSSING_MARGIN = 8 + CAR_LENGTH / 2

/** Muted real-world fleet palette: white, silver, black, grey, dark blue, dark red, beige, dark green. */
const CAR_PALETTE: THREE.Color[] = [
  new THREE.Color(0xe8e8e6),
  new THREE.Color(0xb9bcc2),
  new THREE.Color(0x17181b),
  new THREE.Color(0x6b6e74),
  new THREE.Color(0x1f2f5a),
  new THREE.Color(0x6a1f24),
  new THREE.Color(0xc9b99a),
  new THREE.Color(0x1f4a35),
]

const CAR_MAT = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.45,
  metalness: 0.35,
})

let _carGeometry: THREE.BufferGeometry | null = null

function colouredBox(w: number, h: number, d: number, cx: number, cy: number, cz: number, shade: number): THREE.BufferGeometry {
  const geo = new THREE.BoxGeometry(w, h, d)
  geo.translate(cx, cy, cz)
  const n = geo.getAttribute('position').count
  const colours = new Float32Array(n * 3)
  colours.fill(shade)
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3))
  return geo
}

/** Low-poly hatchback: body + cabin + dark window band + 4 wheels, merged into one geometry (+Z forward). */
function getCarGeometry(): THREE.BufferGeometry {
  if (_carGeometry) return _carGeometry
  const parts: THREE.BufferGeometry[] = []
  // Lower body (instance colour shows through the white vertex colour)
  parts.push(colouredBox(CAR_WIDTH, 0.64, CAR_LENGTH, 0, 0.60, 0, 1.0))
  // Cabin
  parts.push(colouredBox(CAR_WIDTH - 0.22, 0.53, 2.25, 0, 1.18, -0.15, 1.0))
  // Window band (slightly wider than the cabin so it reads as dark glass)
  parts.push(colouredBox(CAR_WIDTH - 0.19, 0.34, 2.28, 0, 1.17, -0.15, 0.13))
  // Wheels
  const wheelShade = 0.07
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      parts.push(colouredBox(0.24, 0.64, 0.64, sx * 0.78, 0.32, sz * 1.35, wheelShade))
    }
  }
  const merged = mergeGeometries(parts, false)
  for (const p of parts) p.dispose()
  _carGeometry = merged ?? parts[0]!
  return _carGeometry
}

/** Small deterministic hash → [0, 1). */
function hash01(seed: string, a: number, b: number): number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  h ^= a * 374761393
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= b * 668265263
  h = Math.imul(h ^ (h >>> 15), 2246822519)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

export type ParkedCarsInput = {
  roadId: string
  /** Resampled centre-line (metres, world space). */
  points: Pt[]
  /** Half road width (metres). */
  halfW: number
  /** Parking sides, in the road generator's sign convention: +1 = +normal side, -1 = -normal side. */
  sides: number[]
  /** Arc-length positions (metres from way start) of crossings to keep clear. */
  crossingArcs: number[]
  /** True for one-way roads (all cars face the way direction). */
  oneway: boolean
  /** Returns true when a world point lies on another road's asphalt (junction areas). */
  isOnOtherRoad?: (x: number, z: number) => boolean
}

/**
 * Builds the parked-car InstancedMesh for one road, or null when no slot is occupied.
 * Cars are purely visual (no colliders); userData.skipMerge keeps the instances alive
 * through ChunkOptimizer.
 */
export function buildParkedCars(input: ParkedCarsInput): THREE.InstancedMesh | null {
  const { points, halfW, sides, crossingArcs, oneway, roadId } = input
  if (points.length < 2 || sides.length === 0) return null

  // Arc-length table
  const arcs: number[] = [0]
  for (let i = 1; i < points.length; i++) {
    arcs.push(arcs[i - 1]! + Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.z - points[i - 1]!.z))
  }
  const total = arcs[arcs.length - 1]!
  const usable = total - END_MARGIN * 2
  if (usable < CAR_LENGTH) return null

  const numSlots = Math.floor(usable / SLOT_PITCH)
  if (numSlots < 1) return null
  const lateral = Math.max(0.9, halfW - 1.0)

  type Placement = { x: number; z: number; y: number; heading: number; colour: THREE.Color }
  const placements: Placement[] = []
  let segIdx = 0

  for (const side of sides) {
    segIdx = 0
    for (let k = 0; k < numSlots; k++) {
      if (hash01(roadId, side + 2, k) >= OCCUPANCY) continue
      const jitter = (hash01(roadId, side + 7, k) - 0.5) * 0.5
      const s = END_MARGIN + SLOT_PITCH * k + SLOT_PITCH / 2 + jitter
      if (s < END_MARGIN || s > total - END_MARGIN) continue

      let nearCrossing = false
      for (let c = 0; c < crossingArcs.length; c++) {
        if (Math.abs(crossingArcs[c]! - s) < CROSSING_MARGIN) { nearCrossing = true; break }
      }
      if (nearCrossing) continue

      // Locate segment (arcs are monotonic; slots are increasing)
      while (segIdx < arcs.length - 2 && arcs[segIdx + 1]! < s) segIdx++
      const a = points[segIdx]!
      const b = points[segIdx + 1]!
      const segLen = arcs[segIdx + 1]! - arcs[segIdx]!
      if (segLen < 1e-4) continue
      const t = (s - arcs[segIdx]!) / segLen
      const dx = (b.x - a.x) / segLen
      const dz = (b.z - a.z) / segLen
      const nx = -dz
      const nz = dx
      const x = a.x + (b.x - a.x) * t + nx * lateral * side
      const z = a.z + (b.z - a.z) * t + nz * lateral * side
      const y = a.y + (b.y - a.y) * t
      if (input.isOnOtherRoad && input.isOnOtherRoad(x, z)) continue

      // Right-hand traffic: cars on the +normal (geometric right) side face the way direction.
      const faceForward = oneway || side > 0
      const heading = Math.atan2(faceForward ? dx : -dx, faceForward ? dz : -dz)
      const colour = CAR_PALETTE[Math.floor(hash01(roadId, side + 11, k) * CAR_PALETTE.length) % CAR_PALETTE.length]!
      placements.push({ x, z, y, heading, colour })
    }
  }

  if (placements.length === 0) return null

  const mesh = new THREE.InstancedMesh(getCarGeometry(), CAR_MAT, placements.length)
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const pos = new THREE.Vector3()
  const one = new THREE.Vector3(1, 1, 1)
  const up = new THREE.Vector3(0, 1, 0)
  for (let i = 0; i < placements.length; i++) {
    const p = placements[i]!
    q.setFromAxisAngle(up, p.heading)
    pos.set(p.x, p.y + 0.03, p.z)
    m.compose(pos, q, one)
    mesh.setMatrixAt(i, m)
    mesh.setColorAt(i, p.colour)
  }
  mesh.instanceMatrix.needsUpdate = true
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  mesh.computeBoundingSphere()
  mesh.castShadow = true
  mesh.receiveShadow = true
  mesh.userData['skipMerge'] = true
  mesh.userData['isTemplate'] = true // shared geometry: never dispose per chunk
  mesh.name = 'parkedCars'
  return mesh
}
