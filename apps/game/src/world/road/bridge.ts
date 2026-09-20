import * as THREE from 'three'
import { computePolylineNormals, type Pt } from './geometry.js'
import { BRIDGE_DECK_MAT, BRIDGE_PARAPET_STONE_MAT, BRIDGE_RAILING_METAL_MAT, BRIDGE_PIER_MAT } from './materials.js'
import { buildRibbon, shiftRibbonLateral } from './geometry.js'

/** Find segments of a bridge polyline that cross other bridge polylines.
 * Returns an array of [startIndex, endIndex] ranges (inclusive start, exclusive end)
 * where parapets should be suppressed. */
export function findBridgeCrossingSegments(
  pts: Pt[],
  otherBridgePtsList: Pt[][],
  verticalTolerance = 2.0,
): [number, number][] {
  const crossingRanges: [number, number][] = []
  const N = pts.length
  if (N < 2) return crossingRanges

  // Build segment list for this bridge
  const segments: { i: number; a: Pt; b: Pt }[] = []
  for (let i = 0; i < N - 1; i++) {
    segments.push({ i, a: pts[i]!, b: pts[i + 1]! })
  }

  for (const otherPts of otherBridgePtsList) {
    if (otherPts.length < 2) continue
    for (let j = 0; j < otherPts.length - 1; j++) {
      const oa = otherPts[j]!
      const ob = otherPts[j + 1]!

      // Check if segments cross in XZ plane
      for (const seg of segments) {
        const { a, b, i } = seg
        if (segmentsCrossXZ(a, b, oa, ob)) {
          // Check vertical separation - if they're at similar heights, it's a true crossing
          const avgY1 = (a.y + b.y) / 2
          const avgY2 = (oa.y + ob.y) / 2
          if (Math.abs(avgY1 - avgY2) <= verticalTolerance) {
            // Mark this segment and adjacent ones for parapet removal
            const start = Math.max(0, i - 1)
            const end = Math.min(N, i + 2)
            crossingRanges.push([start, end])
          }
        }
      }
    }
  }

  // Merge overlapping ranges
  return mergeRanges(crossingRanges)
}

function segmentsCrossXZ(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  // Check if line segments AB and CD cross in XZ plane (ignoring Y)
  const cross = (ax: number, az: number, bx: number, bz: number, cx: number, cz: number) =>
    (bx - ax) * (cz - az) - (bz - az) * (cx - ax)

  const d1 = cross(a.x, a.z, b.x, b.z, c.x, c.z)
  const d2 = cross(a.x, a.z, b.x, b.z, d.x, d.z)
  const d3 = cross(c.x, c.z, d.x, d.z, a.x, a.z)
  const d4 = cross(c.x, c.z, d.x, d.z, b.x, b.z)

  // Proper intersection (not just touching at endpoints)
  return d1 * d2 < 0 && d3 * d4 < 0
}

function mergeRanges(ranges: [number, number][]): [number, number][] {
  if (ranges.length === 0) return []
  const sorted = ranges.sort((a, b) => a[0] - b[0])
  const merged: [number, number][] = [sorted[0]!]
  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1]!
    const curr = sorted[i]!
    if (curr[0] <= last[1]) {
      last[1] = Math.max(last[1], curr[1])
    } else {
      merged.push(curr)
    }
  }
  return merged
}

export function buildBridgeDeckMesh(
  pts: Pt[],
  halfW: number,
  deckThickness = 0.85,
): THREE.Mesh | null {
  if (pts.length < 2) return null
  const verts: number[] = []
  const norm: number[] = []
  const idx: number[] = []
  const N = pts.length

  type CrossSec = { tlX: number; tlY: number; tlZ: number; trX: number; trY: number; trZ: number; blX: number; blY: number; blZ: number; brX: number; brY: number; brZ: number }
  const sections: CrossSec[] = []

  for (let i = 0; i < N; i++) {
    const curr = pts[i]!
    const prev = pts[Math.max(0, i - 1)]!
    const next = pts[Math.min(N - 1, i + 1)]!
    let dx = next.x - prev.x
    let dz = next.z - prev.z
    const len = Math.hypot(dx, dz)
    const nx = len > 0 ? -dz / len : 0
    const nz = len > 0 ? dx / len : 1

    const bW = halfW + 0.18
    const botW = halfW * 0.78

    sections.push({
      tlX: curr.x + nx * bW, tlY: curr.y, tlZ: curr.z + nz * bW,
      trX: curr.x - nx * bW, trY: curr.y, trZ: curr.z - nz * bW,
      blX: curr.x + nx * botW, blY: curr.y - deckThickness, blZ: curr.z + nz * botW,
      brX: curr.x - nx * botW, brY: curr.y - deckThickness, brZ: curr.z - nz * botW,
    })
  }

  for (let i = 0; i < N - 1; i++) {
    const s0 = sections[i]!
    const s1 = sections[i + 1]!

    const b0 = verts.length / 3
    verts.push(
      s0.blX, s0.blY, s0.blZ,
      s0.brX, s0.brY, s0.brZ,
      s1.brX, s1.brY, s1.brZ,
      s1.blX, s1.blY, s1.blZ,
    )
    norm.push(0, -1, 0,  0, -1, 0,  0, -1, 0,  0, -1, 0)
    idx.push(b0, b0 + 1, b0 + 2, b0, b0 + 2, b0 + 3)

    const b1 = verts.length / 3
    verts.push(
      s0.tlX, s0.tlY, s0.tlZ,
      s0.blX, s0.blY, s0.blZ,
      s1.blX, s1.blY, s1.blZ,
      s1.tlX, s1.tlY, s1.tlZ,
    )
    norm.push(0, 0.4, 0.9,  0, 0.4, 0.9,  0, 0.4, 0.9,  0, 0.4, 0.9)
    idx.push(b1, b1 + 1, b1 + 2, b1, b1 + 2, b1 + 3)

    const b2 = verts.length / 3
    verts.push(
      s0.trX, s0.trY, s0.trZ,
      s1.trX, s1.trY, s1.trZ,
      s1.brX, s1.brY, s1.brZ,
      s0.brX, s0.brY, s0.brZ,
    )
    norm.push(0, 0.4, -0.9,  0, 0.4, -0.9,  0, 0.4, -0.9,  0, 0.4, -0.9)
    idx.push(b2, b2 + 1, b2 + 2, b2, b2 + 2, b2 + 3)
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(norm, 3))
  geo.setIndex(idx)
  geo.computeVertexNormals()
  const mesh = new THREE.Mesh(geo, BRIDGE_DECK_MAT)
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

export function buildBridgeParapet(
  pts: Pt[],
  offset: number,
  height = 1.1,
  crossingSegments?: [number, number][],
): THREE.Group {
  const group = new THREE.Group()
  const N = pts.length
  if (N < 2) return group

  // Check if a segment index should have parapet suppressed
  function isSuppressed(i: number): boolean {
    if (!crossingSegments || crossingSegments.length === 0) return false
    for (const [start, end] of crossingSegments) {
      if (i >= start && i < end) return true
    }
    return false
  }

  // Build base and rail ribbons only for non-suppressed segments
  for (let i = 0; i < N - 1; i++) {
    if (isSuppressed(i)) continue

    const a = pts[i]!
    const b = pts[i + 1]!

    const baseRibbon = buildRibbon([a, b], 0.16, 0.175, BRIDGE_PARAPET_STONE_MAT)
    if (baseRibbon) {
      shiftRibbonLateral(baseRibbon, [a, b], offset)
      baseRibbon.renderOrder = 5
      group.add(baseRibbon)
    }

    const railRibbon = buildRibbon([a, b], 0.06, height - 0.05, BRIDGE_RAILING_METAL_MAT)
    if (railRibbon) {
      shiftRibbonLateral(railRibbon, [a, b], offset)
      railRibbon.renderOrder = 5
      group.add(railRibbon)
    }
  }

  // Posts - only on non-suppressed segments
  const postGeo = new THREE.BoxGeometry(0.10, height, 0.10)
  let dist = 0
  let nextPost = 2.0
  for (let i = 0; i < N - 1; i++) {
    if (isSuppressed(i)) {
      dist += Math.hypot(pts[i + 1]!.x - pts[i]!.x, pts[i + 1]!.z - pts[i]!.z)
      continue
    }

    const a = pts[i]!
    const b = pts[i + 1]!
    const segL = Math.hypot(b.x - a.x, b.z - a.z)

    let dx = b.x - a.x
    let dz = b.z - a.z
    const len = Math.hypot(dx, dz)
    const nx = len > 0 ? -dz / len : 0
    const nz = len > 0 ? dx / len : 1

    while (dist + segL >= nextPost) {
      const t = (nextPost - dist) / segL
      const px = a.x + (b.x - a.x) * t + nx * offset
      const py = a.y + (b.y - a.y) * t + height / 2
      const pz = a.z + (b.z - a.z) * t + nz * offset

      const post = new THREE.Mesh(postGeo, BRIDGE_RAILING_METAL_MAT)
      post.position.set(px, py, pz)
      post.rotation.y = Math.atan2(dx, dz)
      group.add(post)

      nextPost += 3.0
    }
    dist += segL
  }

  return group
}

export function buildBridgePiers(
  pts: Pt[],
  halfW: number,
  totalL: number,
  rampL: number,
): THREE.Group | null {
  const group = new THREE.Group()
  const N = pts.length
  if (N < 2) return null

  const pierSpacing = 24.0
  let dist = 0
  let nextPierDist = rampL + 6.0

  for (let i = 0; i < N - 1; i++) {
    const a = pts[i]!
    const b = pts[i + 1]!
    const segL = Math.hypot(b.x - a.x, b.z - a.z)

    while (dist + segL >= nextPierDist && nextPierDist <= totalL - rampL - 6.0) {
      const t = (nextPierDist - dist) / segL
      const px = a.x + (b.x - a.x) * t
      const py = a.y + (b.y - a.y) * t
      const pz = a.z + (b.z - a.z) * t

      let dx = b.x - a.x
      let dz = b.z - a.z
      const len = Math.hypot(dx, dz)
      const nx = len > 0 ? -dz / len : 0
      const nz = len > 0 ? dx / len : 1

      const deckBottomY = py - 0.85
      const pierHeight = Math.max(1.0, deckBottomY)

      const colRadius = 0.45
      const colGeo = new THREE.CylinderGeometry(colRadius, colRadius * 1.15, pierHeight, 10)
      colGeo.translate(0, pierHeight / 2, 0)

      const leftCol = new THREE.Mesh(colGeo, BRIDGE_PIER_MAT)
      leftCol.position.set(px + nx * (halfW * 0.6), 0, pz + nz * (halfW * 0.6))
      leftCol.castShadow = true
      leftCol.receiveShadow = true
      group.add(leftCol)

      const rightCol = new THREE.Mesh(colGeo, BRIDGE_PIER_MAT)
      rightCol.position.set(px - nx * (halfW * 0.6), 0, pz - nz * (halfW * 0.6))
      rightCol.castShadow = true
      rightCol.receiveShadow = true
      group.add(rightCol)

      const capGeo = new THREE.BoxGeometry(halfW * 1.5, 0.5, 1.2)
      const capMesh = new THREE.Mesh(capGeo, BRIDGE_PIER_MAT)
      capMesh.position.set(px, deckBottomY - 0.25, pz)
      capMesh.rotation.y = Math.atan2(dx, dz)
      capMesh.castShadow = true
      group.add(capMesh)

      nextPierDist += pierSpacing
    }
    dist += segL
  }

  return group.children.length > 0 ? group : null
}