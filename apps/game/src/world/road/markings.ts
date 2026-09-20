import * as THREE from 'three'
import { WHITE_MARK, YELLOW_MARK } from './materials.js'
import { computePolylineNormals, type Pt, type PolylineNormal } from './geometry.js'

type BlockedFn = (x: number, z: number, arc: number) => boolean

export function buildDashedLine(
  points: Pt[],
  lateralOffset: number,
  halfMarkW: number,
  yOffset: number,
  dashLen: number,
  gapLen: number,
  material: THREE.MeshStandardMaterial,
  normals?: PolylineNormal[],
  blocked?: BlockedFn | null,
  arcOffset = 0,
): THREE.Mesh | null {
  if (points.length < 2) return null

  const norms = normals ?? computePolylineNormals(points)
  const strip: { x: number; y: number; z: number; nx: number; nz: number }[] = []
  for (let i = 0; i < points.length; i++) {
    const norm = norms[i]!
    const effLat = lateralOffset * norm.miter
    strip.push({
      x: points[i]!.x + norm.nx * effLat,
      y: points[i]!.y,
      z: points[i]!.z + norm.nz * effLat,
      nx: norm.nx,
      nz: norm.nz,
    })
  }

  const vertices: number[] = []
  const indices: number[] = []
  let arcLen = 0
  let quadIdx = 0

  for (let i = 0; i < strip.length - 1; i++) {
    const a = strip[i]!
    const b = strip[i + 1]!
    const segLen = Math.hypot(b.x - a.x, b.z - a.z)
    const cycleLen = dashLen + gapLen
    let t = 0
    while (t < segLen) {
      const phase = (arcOffset + arcLen + t) % cycleLen
      if (phase < dashLen) {
        const dashRemain = Math.min(dashLen - phase, segLen - t)
        const tA = t / segLen
        const tB = Math.min((t + dashRemain) / segLen, 1.0)
        const nxA = THREE.MathUtils.lerp(a.nx, b.nx, tA)
        const nzA = THREE.MathUtils.lerp(a.nz, b.nz, tA)
        const nxB = THREE.MathUtils.lerp(a.nx, b.nx, tB)
        const nzB = THREE.MathUtils.lerp(a.nz, b.nz, tB)
        const pA = { x: a.x + (b.x - a.x) * tA, y: a.y, z: a.z + (b.z - a.z) * tA, nx: nxA, nz: nzA }
        const pB = { x: a.x + (b.x - a.x) * tB, y: a.y, z: a.z + (b.z - a.z) * tB, nx: nxB, nz: nzB }
        const keep = dashRemain >= 0.6 && (!blocked || (!blocked(pA.x, pA.z, arcLen + t) && !blocked(pB.x, pB.z, arcLen + t + dashRemain) && !blocked((pA.x + pB.x) / 2, (pA.z + pB.z) / 2, arcLen + t + dashRemain / 2)))
        if (keep) {
          const base = quadIdx * 4
          vertices.push(
            pA.x + pA.nx * halfMarkW, pA.y + yOffset, pA.z + pA.nz * halfMarkW,
            pA.x - pA.nx * halfMarkW, pA.y + yOffset, pA.z - pA.nz * halfMarkW,
            pB.x + pB.nx * halfMarkW, pB.y + yOffset, pB.z + pB.nz * halfMarkW,
            pB.x - pB.nx * halfMarkW, pB.y + yOffset, pB.z - pB.nz * halfMarkW,
          )
          indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3)
          quadIdx++
        }
        t += dashRemain
      } else {
        t += cycleLen - phase
      }
    }
    arcLen += segLen
  }

  if (vertices.length === 0) return null

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  return new THREE.Mesh(geo, material)
}

export function buildRoadArrow(
  centerPt: Pt,
  dir: { dx: number; dz: number },
): THREE.Mesh {
  const norm = { nx: -dir.dz, nz: dir.dx }
  const cy = centerPt.y + 0.040

  const stemHalfW = 0.18
  const headHalfW = 0.65

  const p1 = { x: centerPt.x - dir.dx * 2.2 - norm.nx * stemHalfW, z: centerPt.z - dir.dz * 2.2 - norm.nz * stemHalfW }
  const p2 = { x: centerPt.x - dir.dx * 2.2 + norm.nx * stemHalfW, z: centerPt.z - dir.dz * 2.2 + norm.nz * stemHalfW }
  const p3 = { x: centerPt.x + dir.dx * 0.4 - norm.nx * stemHalfW, z: centerPt.z + dir.dz * 0.4 - norm.nz * stemHalfW }
  const p4 = { x: centerPt.x + dir.dx * 0.4 + norm.nx * stemHalfW, z: centerPt.z + dir.dz * 0.4 + norm.nz * stemHalfW }

  const p5 = { x: centerPt.x + dir.dx * 0.4 - norm.nx * headHalfW, z: centerPt.z + dir.dz * 0.4 - norm.nz * headHalfW }
  const p6 = { x: centerPt.x + dir.dx * 0.4 + norm.nx * headHalfW, z: centerPt.z + dir.dz * 0.4 + norm.nz * headHalfW }
  const p7 = { x: centerPt.x + dir.dx * 2.4, z: centerPt.z + dir.dz * 2.4 }

  const verts = [
    p1.x, cy, p1.z,
    p2.x, cy, p2.z,
    p3.x, cy, p3.z,
    p4.x, cy, p4.z,
    p5.x, cy, p5.z,
    p6.x, cy, p6.z,
    p7.x, cy, p7.z,
  ]

  const indices = [
    0, 1, 2, 1, 3, 2,
    4, 5, 6,
  ]

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  const arrowMesh = new THREE.Mesh(geo, WHITE_MARK)
  arrowMesh.renderOrder = 4
  return arrowMesh
}

export function buildCrosswalk(
  centerPt: Pt,
  dir: { dx: number; dz: number },
  roadHalfW: number,
): THREE.Mesh | null {
  const norm = { nx: -dir.dz, nz: dir.dx }
  const stripeWidth = 0.50
  const stripeGap = 0.45
  const stripeLength = 3.6
  const halfLen = stripeLength / 2

  const vertices: number[] = []
  const indices: number[] = []
  let quadIdx = 0

  const totalCrossW = roadHalfW * 2 - 0.8
  const startOffset = -totalCrossW / 2
  const numStripes = Math.floor(totalCrossW / (stripeWidth + stripeGap))

  for (let s = 0; s < numStripes; s++) {
    const lat = startOffset + s * (stripeWidth + stripeGap) + stripeWidth / 2
    const cx = centerPt.x + norm.nx * lat
    const cz = centerPt.z + norm.nz * lat
    const cy = centerPt.y + 0.040

    const p1x = cx + norm.nx * (stripeWidth / 2) - dir.dx * halfLen
    const p1z = cz + norm.nz * (stripeWidth / 2) - dir.dz * halfLen

    const p2x = cx - norm.nx * (stripeWidth / 2) - dir.dx * halfLen
    const p2z = cz - norm.nz * (stripeWidth / 2) - dir.dz * halfLen

    const p3x = cx + norm.nx * (stripeWidth / 2) + dir.dx * halfLen
    const p3z = cz + norm.nz * (stripeWidth / 2) + dir.dz * halfLen

    const p4x = cx - norm.nx * (stripeWidth / 2) + dir.dx * halfLen
    const p4z = cz - norm.nz * (stripeWidth / 2) + dir.dz * halfLen

    const base = quadIdx * 4
    vertices.push(
      p1x, cy, p1z,
      p2x, cy, p2z,
      p3x, cy, p3z,
      p4x, cy, p4z,
    )
    indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2)
    quadIdx++
  }

  if (vertices.length === 0) return null
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  const crossMesh = new THREE.Mesh(geo, WHITE_MARK)
  crossMesh.renderOrder = 4
  return crossMesh
}

export function buildStopLine(
  centerPt: Pt,
  dir: { dx: number; dz: number },
  roadHalfW: number,
  fullWidth = false,
): THREE.Mesh | null {
  const norm = { nx: -dir.dz, nz: dir.dx }
  const barThick = 0.45
  const halfThick = barThick / 2
  const span = roadHalfW - 0.4
  const from = fullWidth ? -span : 0

  const cy = centerPt.y + 0.040
  const base = 0
  const vertices = [
    centerPt.x + norm.nx * from - dir.dx * halfThick, cy, centerPt.z + norm.nz * from - dir.dz * halfThick,
    centerPt.x + norm.nx * span - dir.dx * halfThick, cy, centerPt.z + norm.nz * span - dir.dz * halfThick,
    centerPt.x + norm.nx * from + dir.dx * halfThick, cy, centerPt.z + norm.nz * from + dir.dz * halfThick,
    centerPt.x + norm.nx * span + dir.dx * halfThick, cy, centerPt.z + norm.nz * span + dir.dz * halfThick,
  ]
  const indices = [base, base + 1, base + 2, base + 1, base + 3, base + 2]

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  const stopMesh = new THREE.Mesh(geo, WHITE_MARK)
  stopMesh.renderOrder = 4
  return stopMesh
}

export function buildBicycleMarking(
  pos: Pt,
  dir: { dx: number; dz: number },
): THREE.Group {
  const g = new THREE.Group()
  const q = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 0, 1),
    new THREE.Vector3(dir.dx, 0, dir.dz),
  )
  g.position.set(pos.x, pos.y + 0.040, pos.z)
  g.rotation.setFromQuaternion(q)

  const wheelGeo = new THREE.RingGeometry(0.12, 0.17, 10)
  wheelGeo.rotateX(-Math.PI / 2)
  const w1 = new THREE.Mesh(wheelGeo, WHITE_MARK)
  w1.position.set(0, 0, -0.35)
  w1.renderOrder = 5
  g.add(w1)

  const w2 = new THREE.Mesh(wheelGeo, WHITE_MARK)
  w2.position.set(0, 0, 0.35)
  w2.renderOrder = 5
  g.add(w2)

  const frameGeo = new THREE.BoxGeometry(0.04, 0.005, 0.5)
  const frame = new THREE.Mesh(frameGeo, WHITE_MARK)
  frame.renderOrder = 5
  g.add(frame)

  return g
}

export function buildBusLaneMarking(
  pos: Pt,
  dir: { dx: number; dz: number },
): THREE.Group {
  const g = new THREE.Group()
  const q = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 0, 1),
    new THREE.Vector3(dir.dx, 0, dir.dz),
  )
  g.position.set(pos.x, pos.y + 0.040, pos.z)
  g.rotation.setFromQuaternion(q)

  const bGeo = new THREE.BoxGeometry(0.35, 0.005, 0.9)
  const bMesh = new THREE.Mesh(bGeo, WHITE_MARK)
  bMesh.position.set(-0.5, 0, 0)
  bMesh.renderOrder = 5
  g.add(bMesh)

  const uGeo = new THREE.BoxGeometry(0.35, 0.005, 0.9)
  const uMesh = new THREE.Mesh(uGeo, WHITE_MARK)
  uMesh.position.set(0, 0, 0)
  uMesh.renderOrder = 5
  g.add(uMesh)

  const sGeo = new THREE.BoxGeometry(0.35, 0.005, 0.9)
  const sMesh = new THREE.Mesh(sGeo, WHITE_MARK)
  sMesh.position.set(0.5, 0, 0)
  sMesh.renderOrder = 5
  g.add(sMesh)

  return g
}

export function buildParkingBays(
  points: Pt[],
  normals: PolylineNormal[],
  halfW: number,
  side: 'left' | 'right',
  roadLen: number,
  blocked: BlockedFn | null,
  arcOffset = 0,
): THREE.Group | null {
  if (points.length < 2 || roadLen < 15) return null
  const group = new THREE.Group()
  const bayW = 2.0
  const bayL = 5.0

  const numBays = Math.min(8, Math.floor(roadLen / bayL))
  if (numBays < 1) return null

  const sideSign = side === 'right' ? 1 : -1
  const lineOffset = sideSign * (halfW - bayW)
  const pLine = buildDashedLine(points, lineOffset, 0.05, 0.040, 2.0, 2.0, WHITE_MARK, normals, blocked, arcOffset)
  if (pLine) {
    pLine.renderOrder = 4
    group.add(pLine)
  }

  return group.children.length > 0 ? group : null
}