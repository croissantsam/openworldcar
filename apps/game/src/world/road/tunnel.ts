import * as THREE from 'three'
import { computePolylineNormals, type Pt } from './geometry.js'
import { TUNNEL_WALL_MAT, TUNNEL_PORTAL_MAT, TUNNEL_LIGHT_MAT, TRENCH_MASK_MAT, CURB_MAT, BRIDGE_RAILING_METAL_MAT } from './materials.js'
import { buildRibbon } from './geometry.js'

export function buildTunnelTrenchWalls(
  pts: Pt[],
  halfW: number,
  totalL: number,
  rampL: number,
): THREE.Group | null {
  const group = new THREE.Group()
  const N = pts.length
  if (N < 2) return null

  const wallOffset = halfW + 0.22
  const STREET_Y = 0.14
  let dist = 0

  const wallVerts: number[] = []
  const wallNorm: number[] = []
  const wallIdx: number[] = []

  const copingVerts: number[] = []
  const copingIdx: number[] = []

  const railPtsLeft: Pt[] = []
  const railPtsRight: Pt[] = []

  for (let i = 0; i < N - 1; i++) {
    const p0 = pts[i]!
    const p1 = pts[i + 1]!
    const segL = Math.hypot(p1.x - p0.x, p1.z - p0.z)
    const midDist = dist + segL / 2

    const isEntryRamp = midDist <= rampL + 0.5
    const isExitRamp = midDist >= totalL - rampL - 0.5

    if (isEntryRamp || isExitRamp) {
      let dx = p1.x - p0.x
      let dz = p1.z - p0.z
      const len = Math.hypot(dx, dz)
      const nx = len > 0 ? -dz / len : 0
      const nz = len > 0 ? dx / len : 1

      const bL = wallVerts.length / 3
      wallVerts.push(
        p0.x + nx * wallOffset, p0.y, p0.z + nz * wallOffset,
        p1.x + nx * wallOffset, p1.y, p1.z + nz * wallOffset,
        p1.x + nx * wallOffset, STREET_Y, p1.z + nz * wallOffset,
        p0.x + nx * wallOffset, STREET_Y, p0.z + nz * wallOffset,
      )
      wallNorm.push(-nx, 0, -nz,  -nx, 0, -nz,  -nx, 0, -nz,  -nx, 0, -nz)
      wallIdx.push(bL, bL + 1, bL + 2, bL, bL + 2, bL + 3)

      const bR = wallVerts.length / 3
      wallVerts.push(
        p0.x - nx * wallOffset, STREET_Y, p0.z - nz * wallOffset,
        p1.x - nx * wallOffset, STREET_Y, p1.z - nz * wallOffset,
        p1.x - nx * wallOffset, p1.y, p1.z - nz * wallOffset,
        p0.x - nx * wallOffset, p0.y, p0.z - nz * wallOffset,
      )
      wallNorm.push(nx, 0, nz,  nx, 0, nz,  nx, 0, nz,  nx, 0, nz)
      wallIdx.push(bR, bR + 1, bR + 2, bR, bR + 2, bR + 3)

      const bCL = copingVerts.length / 3
      copingVerts.push(
        p0.x + nx * wallOffset, STREET_Y + 0.02, p0.z + nz * wallOffset,
        p1.x + nx * wallOffset, STREET_Y + 0.02, p1.z + nz * wallOffset,
        p1.x + nx * (wallOffset + 0.35), STREET_Y + 0.02, p1.z + nz * (wallOffset + 0.35),
        p0.x + nx * (wallOffset + 0.35), STREET_Y + 0.02, p0.z + nz * (wallOffset + 0.35),
      )
      copingIdx.push(bCL, bCL + 1, bCL + 2, bCL, bCL + 2, bCL + 3)

      const bCR = copingVerts.length / 3
      copingVerts.push(
        p0.x - nx * (wallOffset + 0.35), STREET_Y + 0.02, p0.z - nz * (wallOffset + 0.35),
        p1.x - nx * (wallOffset + 0.35), STREET_Y + 0.02, p1.z - nz * (wallOffset + 0.35),
        p1.x - nx * wallOffset, STREET_Y + 0.02, p1.z - nz * wallOffset,
        p0.x - nx * wallOffset, STREET_Y + 0.02, p0.z - nz * wallOffset,
      )
      copingIdx.push(bCR, bCR + 1, bCR + 2, bCR, bCR + 2, bCR + 3)

      if (Math.abs(p0.y - STREET_Y) > 0.6) {
        railPtsLeft.push({ x: p0.x + nx * (wallOffset + 0.18), y: STREET_Y, z: p0.z + nz * (wallOffset + 0.18) })
        railPtsRight.push({ x: p0.x - nx * (wallOffset + 0.18), y: STREET_Y, z: p0.z - nz * (wallOffset + 0.18) })
      }
    }

    dist += segL
  }

  if (wallVerts.length > 0) {
    const wallGeo = new THREE.BufferGeometry()
    wallGeo.setAttribute('position', new THREE.Float32BufferAttribute(wallVerts, 3))
    wallGeo.setAttribute('normal', new THREE.Float32BufferAttribute(wallNorm, 3))
    wallGeo.setIndex(wallIdx)
    wallGeo.computeVertexNormals()
    const wallMesh = new THREE.Mesh(wallGeo, TUNNEL_PORTAL_MAT)
    wallMesh.castShadow = true
    wallMesh.receiveShadow = true
    group.add(wallMesh)
  }

  if (copingVerts.length > 0) {
    const copingGeo = new THREE.BufferGeometry()
    copingGeo.setAttribute('position', new THREE.Float32BufferAttribute(copingVerts, 3))
    copingGeo.setIndex(copingIdx)
    copingGeo.computeVertexNormals()
    const copingMesh = new THREE.Mesh(copingGeo, CURB_MAT)
    group.add(copingMesh)
  }

  if (railPtsLeft.length >= 2) {
    const leftRail = buildRibbon(railPtsLeft, 0.05, 0.85, BRIDGE_RAILING_METAL_MAT)
    if (leftRail) group.add(leftRail)
  }
  if (railPtsRight.length >= 2) {
    const rightRail = buildRibbon(railPtsRight, 0.05, 0.85, BRIDGE_RAILING_METAL_MAT)
    if (rightRail) group.add(rightRail)
  }

  return group.children.length > 0 ? group : null
}

export function buildTunnelTrenchMask(
  pts: Pt[],
  halfW: number,
  totalL: number,
  rampL: number,
): THREE.Mesh | null {
  const N = pts.length
  if (N < 2) return null

  const wallOffset = halfW + 0.30
  const MASK_Y = 0.005
  let dist = 0

  const maskVerts: number[] = []
  const maskIdx: number[] = []

  for (let i = 0; i < N - 1; i++) {
    const p0 = pts[i]!
    const p1 = pts[i + 1]!
    const segL = Math.hypot(p1.x - p0.x, p1.z - p0.z)
    const midDist = dist + segL / 2

    const isEntryRamp = midDist <= rampL + 0.3
    const isExitRamp = midDist >= totalL - rampL - 0.3

    if (isEntryRamp || isExitRamp) {
      let dx = p1.x - p0.x
      let dz = p1.z - p0.z
      const len = Math.hypot(dx, dz)
      const nx = len > 0 ? -dz / len : 0
      const nz = len > 0 ? dx / len : 1

      const b = maskVerts.length / 3
      maskVerts.push(
        p0.x + nx * wallOffset, MASK_Y, p0.z + nz * wallOffset,
        p0.x - nx * wallOffset, MASK_Y, p0.z - nz * wallOffset,
        p1.x + nx * wallOffset, MASK_Y, p1.z + nz * wallOffset,
        p1.x - nx * wallOffset, MASK_Y, p1.z - nz * wallOffset,
      )
      maskIdx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2)
      maskIdx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3)
    }

    dist += segL
  }

  if (maskVerts.length === 0) return null

  const maskGeo = new THREE.BufferGeometry()
  maskGeo.setAttribute('position', new THREE.Float32BufferAttribute(maskVerts, 3))
  maskGeo.setIndex(maskIdx)
  const maskMesh = new THREE.Mesh(maskGeo, TRENCH_MASK_MAT)
  maskMesh.renderOrder = -1
  return maskMesh
}

export function buildTunnelPortals(
  pts: Pt[],
  halfW: number,
  totalL: number,
  rampL: number,
): THREE.Group | null {
  const group = new THREE.Group()
  const N = pts.length
  if (N < 2) return null

  const targetDistances = [rampL, totalL - rampL]

  for (const targetD of targetDistances) {
    let dist = 0
    for (let i = 0; i < N - 1; i++) {
      const a = pts[i]!
      const b = pts[i + 1]!
      const segL = Math.hypot(b.x - a.x, b.z - a.z)

      if (dist + segL >= targetD) {
        const t = (targetD - dist) / segL
        const px = a.x + (b.x - a.x) * t
        const py = a.y + (b.y - a.y) * t
        const pz = a.z + (b.z - a.z) * t

        let dx = b.x - a.x
        let dz = b.z - a.z
        const len = Math.hypot(dx, dz)
        const nx = len > 0 ? -dz / len : 0
        const nz = len > 0 ? dx / len : 1

        const STREET_Y = 0.14
        const portalH = STREET_Y - py
        const portalW = halfW * 2 + 2.0
        const portalD = 2.4

        const headerH = 1.2
        const headerGeo = new THREE.BoxGeometry(portalW, headerH, portalD)
        const headerMesh = new THREE.Mesh(headerGeo, TUNNEL_PORTAL_MAT)
        headerMesh.position.set(px, STREET_Y - headerH / 2, pz)
        headerMesh.rotation.y = Math.atan2(dx, dz)
        headerMesh.castShadow = true
        headerMesh.receiveShadow = true
        group.add(headerMesh)

        const jambW = 1.0
        const jambH = portalH
        const jambGeo = new THREE.BoxGeometry(jambW, jambH, portalD)
        const leftJamb = new THREE.Mesh(jambGeo, TUNNEL_PORTAL_MAT)
        leftJamb.position.set(px + nx * (halfW + jambW / 2), py + jambH / 2, pz + nz * (halfW + jambW / 2))
        leftJamb.rotation.y = Math.atan2(dx, dz)
        leftJamb.castShadow = true
        leftJamb.receiveShadow = true
        group.add(leftJamb)

        const rightJamb = new THREE.Mesh(jambGeo, TUNNEL_PORTAL_MAT)
        rightJamb.position.set(px - nx * (halfW + jambW / 2), py + jambH / 2, pz - nz * (halfW + jambW / 2))
        rightJamb.rotation.y = Math.atan2(dx, dz)
        rightJamb.castShadow = true
        rightJamb.receiveShadow = true
        group.add(rightJamb)

        break
      }
      dist += segL
    }
  }

  return group.children.length > 0 ? group : null
}

export function buildTunnelTube(
  pts: Pt[],
  halfW: number,
  totalL: number,
  rampL: number,
): THREE.Mesh | null {
  const N = pts.length
  if (N < 2) return null

  const tubeHalfW = halfW + 0.35
  const CEILING_TOP_Y = 0.0
  const CEILING_BOT_Y = -0.45

  const verts: number[] = []
  const norm: number[] = []
  const idx: number[] = []

  let dist = 0
  for (let i = 0; i < N - 1; i++) {
    const p0 = pts[i]!
    const p1 = pts[i + 1]!
    const segL = Math.hypot(p1.x - p0.x, p1.z - p0.z)
    const midDist = dist + segL / 2

    if (midDist >= rampL - 0.5 && midDist <= totalL - rampL + 0.5) {
      let dx = p1.x - p0.x
      let dz = p1.z - p0.z
      const len = Math.hypot(dx, dz)
      const nx = len > 0 ? -dz / len : 0
      const nz = len > 0 ? dx / len : 1

      const bL = verts.length / 3
      verts.push(
        p0.x + nx * tubeHalfW, p0.y, p0.z + nz * tubeHalfW,
        p1.x + nx * tubeHalfW, p1.y, p1.z + nz * tubeHalfW,
        p1.x + nx * tubeHalfW, CEILING_BOT_Y, p1.z + nz * tubeHalfW,
        p0.x + nx * tubeHalfW, CEILING_BOT_Y, p0.z + nz * tubeHalfW,
      )
      norm.push(-nx, 0, -nz,  -nx, 0, -nz,  -nx, 0, -nz,  -nx, 0, -nz)
      idx.push(bL, bL + 1, bL + 2, bL, bL + 2, bL + 3)

      const bR = verts.length / 3
      verts.push(
        p0.x - nx * tubeHalfW, CEILING_BOT_Y, p0.z - nz * tubeHalfW,
        p1.x - nx * tubeHalfW, CEILING_BOT_Y, p1.z - nz * tubeHalfW,
        p1.x - nx * tubeHalfW, p1.y, p1.z - nz * tubeHalfW,
        p0.x - nx * tubeHalfW, p0.y, p0.z - nz * tubeHalfW,
      )
      norm.push(nx, 0, nz,  nx, 0, nz,  nx, 0, nz,  nx, 0, nz)
      idx.push(bR, bR + 1, bR + 2, bR, bR + 2, bR + 3)

      const bC = verts.length / 3
      verts.push(
        p0.x + nx * tubeHalfW, CEILING_BOT_Y, p0.z + nz * tubeHalfW,
        p1.x + nx * tubeHalfW, CEILING_BOT_Y, p1.z + nz * tubeHalfW,
        p1.x - nx * tubeHalfW, CEILING_BOT_Y, p1.z - nz * tubeHalfW,
        p0.x - nx * tubeHalfW, CEILING_BOT_Y, p0.z - nz * tubeHalfW,
      )
      norm.push(0, -1, 0,  0, -1, 0,  0, -1, 0,  0, -1, 0)
      idx.push(bC, bC + 1, bC + 2, bC, bC + 2, bC + 3)

      const bTop = verts.length / 3
      verts.push(
        p0.x - nx * tubeHalfW, CEILING_TOP_Y, p0.z - nz * tubeHalfW,
        p1.x - nx * tubeHalfW, CEILING_TOP_Y, p1.z - nz * tubeHalfW,
        p1.x + nx * tubeHalfW, CEILING_TOP_Y, p1.z + nz * tubeHalfW,
        p0.x + nx * tubeHalfW, CEILING_TOP_Y, p0.z + nz * tubeHalfW,
      )
      norm.push(0, 1, 0,  0, 1, 0,  0, 1, 0,  0, 1, 0)
      idx.push(bTop, bTop + 1, bTop + 2, bTop, bTop + 2, bTop + 3)
    }

    dist += segL
  }

  if (verts.length === 0) return null

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(norm, 3))
  geo.setIndex(idx)
  geo.computeVertexNormals()
  const mesh = new THREE.Mesh(geo, TUNNEL_WALL_MAT)
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

export function buildTunnelLighting(
  pts: Pt[],
  totalL: number,
  rampL: number,
): THREE.Group | null {
  const group = new THREE.Group()
  const N = pts.length
  if (N < 2) return null

  const lightSpacing = 12.0
  let dist = 0
  let nextLightDist = rampL + 4.0

  const stripGeo = new THREE.BoxGeometry(0.28, 0.12, 1.8)

  for (let i = 0; i < N - 1; i++) {
    const a = pts[i]!
    const b = pts[i + 1]!
    const segL = Math.hypot(b.x - a.x, b.z - a.z)

    while (dist + segL >= nextLightDist && nextLightDist <= totalL - rampL - 4.0) {
      const t = (nextLightDist - dist) / segL
      const px = a.x + (b.x - a.x) * t
      const py = -0.55
      const pz = a.z + (b.z - a.z) * t

      const mesh = new THREE.Mesh(stripGeo, TUNNEL_LIGHT_MAT)
      mesh.position.set(px, py, pz)
      mesh.rotation.y = Math.atan2(b.x - a.x, b.z - a.z)
      group.add(mesh)

      nextLightDist += lightSpacing
    }
    dist += segL
  }

  return group.children.length > 0 ? group : null
}