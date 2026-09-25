import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { RoadMeshGenerator } from './road-mesh-generator.js'
import { computeRoadWidth } from './road-width.js'
import type { Road } from '@world-drive/shared'

/**
 * Crossing priority: where two ground roads cross, only the biggest road's
 * asphalt is drawn (butt joint, bisection-precise). Coplanar overlap used to
 * shimmer (Z-fighting). These tests count asphalt-level vertices
 * (y ≈ 0.028 isolates the asphalt ribbon from markings/gutters/sidewalks).
 */

const ASPHALT_Y = 0.028

function road(id: string, highway: Road['highway'], pts: [number, number][], extra?: Partial<Road>): Road {
  return {
    id,
    highway,
    lanes: highway === 'primary' ? 4 : 2,
    bridge: false,
    tunnel: false,
    layer: 0,
    elevationMode: 'ground',
    points: pts.map(([x, z]) => ({ x, y: 0, z })),
    ...extra,
  }
}

// E-W major at z=200, N-S minor at x=160 — all inside chunk cell (0,0).
const MAJOR = road('t-major', 'primary', [[100, 200], [220, 200]])
const MINOR = road('t-minor', 'residential', [[160, 140], [160, 260]])
const CX = 160
const CZ = 200

const OPTS = { cell: { x: 0, z: 0 }, syntheticLamps: false }

function asphaltVerts(group: THREE.Group | null, inside: (x: number, y: number, z: number) => boolean): number {
  if (!group) return 0
  let n = 0
  group.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    const pos = (mesh.geometry as THREE.BufferGeometry | undefined)?.getAttribute('position') as
      | THREE.BufferAttribute
      | undefined
    if (!pos) return
    const v = new THREE.Vector3()
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i)
      // World transform: test groups are built at identity, but be safe.
      mesh.updateWorldMatrix(true, false)
      const wx = v.x + mesh.matrixWorld.elements[12]!
      const wy = v.y + mesh.matrixWorld.elements[13]!
      const wz = v.z + mesh.matrixWorld.elements[14]!
      if (Math.abs(wy - ASPHALT_Y) < 5e-4 && inside(wx, wy, wz)) n++
    }
  })
  return n
}

describe('crossing priority (only the biggest road shows)', () => {
  const majorHalfW = computeRoadWidth(MAJOR).halfW
  // Crossing box: inside the major's footprint, away from its edges.
  const inMajorBox = (x: number, _y: number, z: number): boolean =>
    Math.abs(x - CX) <= 55 && Math.abs(z - CZ) <= majorHalfW - 0.05

  it('cuts the minor road inside the major footprint, keeps the major whole', () => {
    const minorAlone = RoadMeshGenerator.generateGroundRoad(MINOR, [MINOR], OPTS)
    const minorWithMajor = RoadMeshGenerator.generateGroundRoad(MINOR, [MINOR, MAJOR], OPTS)
    expect(asphaltVerts(minorAlone, inMajorBox)).toBeGreaterThan(0)
    expect(asphaltVerts(minorWithMajor, inMajorBox)).toBe(0)

    // The major is untouched far from the crossing (x in [190, 210]).
    const farSlice = (x: number, _y: number, z: number): boolean =>
      x >= 190 && x <= 210 && Math.abs(z - CZ) <= majorHalfW
    const majorAlone = RoadMeshGenerator.generateGroundRoad(MAJOR, [MAJOR], OPTS)
    const majorWithMinor = RoadMeshGenerator.generateGroundRoad(MAJOR, [MAJOR, MINOR], OPTS)
    const aloneCount = asphaltVerts(majorAlone, farSlice)
    expect(aloneCount).toBeGreaterThan(0)
    expect(asphaltVerts(majorWithMinor, farSlice)).toBe(aloneCount)
  })

  it('breaks equal-rank ties deterministically (exactly one yields)', () => {
    const a = road('zz-a', 'residential', [[100, 200], [220, 200]])
    const b = road('zz-b', 'residential', [[160, 140], [160, 260]])
    const halfA = computeRoadWidth(a).halfW
    // B's verts strictly inside A's footprint (the hole region).
    const inABox = (x: number, _y: number, z: number): boolean =>
      Math.abs(x - CX) <= 55 && Math.abs(z - CZ) <= halfA - 0.05
    const bAlone = RoadMeshGenerator.generateGroundRoad(b, [b], OPTS)
    const bWithA = RoadMeshGenerator.generateGroundRoad(b, [b, a], OPTS)
    expect(asphaltVerts(bAlone, inABox)).toBeGreaterThan(0)
    expect(asphaltVerts(bWithA, inABox)).toBe(0)
    // A is untouched far from the crossing (lower id wins the tiebreak).
    const farSlice = (x: number, _y: number, _z: number): boolean => x >= 190 && x <= 210
    const aAlone = RoadMeshGenerator.generateGroundRoad(a, [a], OPTS)
    const aWithB = RoadMeshGenerator.generateGroundRoad(a, [a, b], OPTS)
    const aloneCount = asphaltVerts(aAlone, farSlice)
    expect(aloneCount).toBeGreaterThan(0)
    expect(asphaltVerts(aWithB, farSlice)).toBe(aloneCount)
  })

  it('never cuts across elevation classes (bridge over ground road)', () => {
    const bridge = road('t-bridge', 'primary', [[100, 200], [220, 200]], {
      bridge: true,
      layer: 1,
      elevationMode: 'bridge',
    })
    const minorAlone = RoadMeshGenerator.generateGroundRoad(MINOR, [MINOR], OPTS)
    const minorWithBridge = RoadMeshGenerator.generateGroundRoad(MINOR, [MINOR, bridge], OPTS)
    const inBox = (x: number, _y: number, z: number): boolean =>
      Math.abs(x - CX) <= 55 && Math.abs(z - CZ) <= computeRoadWidth(bridge).halfW - 0.05
    const aloneCount = asphaltVerts(minorAlone, inBox)
    expect(aloneCount).toBeGreaterThan(0)
    expect(asphaltVerts(minorWithBridge, inBox)).toBe(aloneCount)
  })
})
