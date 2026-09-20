/**
 * WaterwayMeshGenerator — renders OSM rivers, canals, streams and water bodies (lakes, basins, riverbanks).
 *
 * Realism features:
 *   - Water surface at y = 0.012m (sits cleanly above urban slab at 0.001m and below roads at 0.028m)
 *   - Animated water shader with flowing ripples, wave foam highlights, and specular sun glints
 *   - Authentic Parisian limestone parapets / balustrades lining the quays (y = 0.02 to 0.92m)
 *   - Works 100% reliably without fragile stencil buffers or chunk ordering dependencies
 */

import * as THREE from 'three'
import type { Waterway } from '@world-drive/shared'
import { PARAPET_MAT, EMBANKMENT_EDGE_MAT, getWaterMaterial } from './WaterMaterial.js'
import { addOrientedBox } from './helpers.js'

export class WaterwayMeshGenerator {
  /**
   * Generate realistic water features with animated ripple shader, stone quay
   * border walls, and classic street-level parapet balustrades.
   */
  static generate(waterway: Waterway): THREE.Group | null {
    const pts = waterway.points
    if (pts.length < 2) return null

    const group = new THREE.Group()
    group.userData['waterwayId'] = waterway.id

    const WATER_Y = 0.012  // Sits cleanly above urban slab (0.001) and below road asphalt (0.028)

    // ── 1. Closed Polygon Water Surface (lakes, basins, closed riverbanks) ──
    if (waterway.isPolygon && pts.length >= 3) {
      try {
        const shape = new THREE.Shape()
        shape.moveTo(pts[0]!.x, -pts[0]!.z)
        for (let i = 1; i < pts.length; i++) {
          shape.lineTo(pts[i]!.x, -pts[i]!.z)
        }
        shape.closePath()

        // Water surface
        const waterGeo = new THREE.ShapeGeometry(shape)
        waterGeo.rotateX(-Math.PI / 2)
        waterGeo.translate(0, WATER_Y, 0)
        
        // Compute local UVs centered on the shape for stable noise at any world position
        const pos = waterGeo.attributes['position'] as THREE.BufferAttribute
        const uvs = new Float32Array(pos.count * 2)
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
        for (let i = 0; i < pos.count; i++) {
          const x = pos.getX(i)
          const z = pos.getZ(i)
          if (x < minX) minX = x
          if (x > maxX) maxX = x
          if (z < minZ) minZ = z
          if (z > maxZ) maxZ = z
        }
        const rangeX = maxX - minX
        const rangeZ = maxZ - minZ
        for (let i = 0; i < pos.count; i++) {
          const x = pos.getX(i)
          const z = pos.getZ(i)
          uvs[i * 2] = rangeX > 0 ? (x - minX) / rangeX : 0.5
          uvs[i * 2 + 1] = rangeZ > 0 ? (z - minZ) / rangeZ : 0.5
        }
        waterGeo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
        waterGeo.computeVertexNormals()
        const waterMesh = new THREE.Mesh(waterGeo, getWaterMaterial())
        waterMesh.receiveShadow = true
        waterMesh.renderOrder = 2
        group.add(waterMesh)

        // Perimeter stone parapet wall
        const parapetPos: number[] = []
        const parapetNorm: number[] = []
        const parapetIdx: number[] = []

        const N = pts.length
        for (let i = 0; i < N; i++) {
          const p1 = pts[i]!
          const p2 = pts[(i + 1) % N]!
          const dx = p2.x - p1.x
          const dz = p2.z - p1.z
          const len = Math.hypot(dx, dz)
          if (len < 1.0) continue

          const ux = dx / len
          const uz = dz / len
          const nx = -uz
          const nz = ux

          const pMidX = (p1.x + p2.x) / 2
          const pMidZ = (p1.z + p2.z) / 2
          addOrientedBox(
            parapetPos, parapetNorm, parapetIdx,
            pMidX, pMidZ,
            0.02, 0.90,
            len / 2, 0.20,
            ux, uz, nx, nz,
          )
        }

        if (parapetPos.length > 0) {
          const parapetGeo = new THREE.BufferGeometry()
          parapetGeo.setAttribute('position', new THREE.Float32BufferAttribute(parapetPos, 3))
          parapetGeo.setAttribute('normal', new THREE.Float32BufferAttribute(parapetNorm, 3))
          parapetGeo.setIndex(parapetIdx)
          const parapetMesh = new THREE.Mesh(parapetGeo, PARAPET_MAT)
          parapetMesh.castShadow = true
          parapetMesh.receiveShadow = true
          parapetMesh.renderOrder = 4
          group.add(parapetMesh)
        }

        return group
      } catch (err) {
        console.warn(`[WaterwayMeshGenerator] Failed to triangulate polygon waterway ${waterway.id}:`, err)
        // Fallback to linear waterway below
      }
    }

    // ── 2. Linear Waterways (rivers, streams, canals with width) ─────────────
    const halfW = (waterway.width || 30) / 2
    const N = pts.length

    // Compute left and right bank points along polyline
    type BankPoint = { x: number; z: number; nx: number; nz: number; ux: number; uz: number }
    const leftBank: BankPoint[] = []
    const rightBank: BankPoint[] = []

    for (let i = 0; i < N; i++) {
      const curr = pts[i]!
      const prev = pts[Math.max(0, i - 1)]!
      const next = pts[Math.min(N - 1, i + 1)]!

      let dx = next.x - prev.x
      let dz = next.z - prev.z
      const len = Math.hypot(dx, dz)
      const ux = len > 0 ? dx / len : 1
      const uz = len > 0 ? dz / len : 0

      const nx = -uz
      const nz = ux

      leftBank.push({
        x: curr.x + nx * halfW,
        z: curr.z + nz * halfW,
        nx, nz, ux, uz,
      })
      rightBank.push({
        x: curr.x - nx * halfW,
        z: curr.z - nz * halfW,
        nx: -nx, nz: -nz, ux, uz,
      })
    }

    // Build water surface ribbon vertices
    const waterVerts: number[] = []
    const uvs: number[] = []
    const ribbonIndices: number[] = []
    let totalLen = 0

    for (let i = 0; i < N; i++) {
      const l = leftBank[i]!
      const r = rightBank[i]!

      // Water surface at y = WATER_Y
      waterVerts.push(l.x, WATER_Y, l.z,  r.x, WATER_Y, r.z)

      if (i > 0) {
        totalLen += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.z - pts[i - 1]!.z)
      }
      const u = totalLen / (waterway.width * 2)
      uvs.push(0, u, 1, u)

      if (i < N - 1) {
        const b = i * 2
        // Winding order for normals pointing UP (Y+)
        // Triangle 1: left_i, left_{i+1}, right_i
        // Triangle 2: left_{i+1}, right_{i+1}, right_i
        ribbonIndices.push(b, b + 2, b + 1,  b + 2, b + 3, b + 1)
      }
    }

    // Water surface mesh
    const waterGeo = new THREE.BufferGeometry()
    waterGeo.setAttribute('position', new THREE.Float32BufferAttribute(waterVerts, 3))
    waterGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
    waterGeo.setIndex(ribbonIndices)
    waterGeo.computeVertexNormals()
    const waterMesh = new THREE.Mesh(waterGeo, getWaterMaterial())
    waterMesh.receiveShadow = true
    waterMesh.renderOrder = 2
    group.add(waterMesh)

    // Embankment curb stones and street parapets along both banks
    const parapetPos: number[] = []
    const parapetNorm: number[] = []
    const parapetIdx: number[] = []

    const curbPos: number[] = []
    const curbNorm: number[] = []
    const curbIdx: number[] = []

    function addBankCurbAndParapet(bank: BankPoint[]) {
      for (let i = 0; i < bank.length - 1; i++) {
        const b1 = bank[i]!
        const b2 = bank[i + 1]!
        const dx = b2.x - b1.x
        const dz = b2.z - b1.z
        const segLen = Math.hypot(dx, dz)
        if (segLen < 1.0) continue

        const ux = dx / segLen
        const uz = dz / segLen
        const nx = b1.nx
        const nz = b1.nz

        const midX = (b1.x + b2.x) / 2
        const midZ = (b1.z + b2.z) / 2

        // Stone curb edging along the water's edge
        addOrientedBox(
          curbPos, curbNorm, curbIdx,
          midX, midZ,
          0.005, 0.08,
          segLen / 2, 0.35,
          ux, uz, nx, nz,
        )

        // Classic stone parapet balustrade along quays (skip small ditches/drains)
        if (halfW >= 8.0) {
          addOrientedBox(
            parapetPos, parapetNorm, parapetIdx,
            midX, midZ,
            0.02, 0.90,
            segLen / 2, 0.20,
            ux, uz, nx, nz,
          )
        }
      }
    }

    addBankCurbAndParapet(leftBank)
    addBankCurbAndParapet(rightBank)

    if (curbPos.length > 0) {
      const curbGeo = new THREE.BufferGeometry()
      curbGeo.setAttribute('position', new THREE.Float32BufferAttribute(curbPos, 3))
      curbGeo.setAttribute('normal', new THREE.Float32BufferAttribute(curbNorm, 3))
      curbGeo.setIndex(curbIdx)
      const curbMesh = new THREE.Mesh(curbGeo, EMBANKMENT_EDGE_MAT)
      curbMesh.castShadow = true
      curbMesh.receiveShadow = true
      curbMesh.renderOrder = 3
      group.add(curbMesh)
    }

    if (parapetPos.length > 0) {
      const parapetGeo = new THREE.BufferGeometry()
      parapetGeo.setAttribute('position', new THREE.Float32BufferAttribute(parapetPos, 3))
      parapetGeo.setAttribute('normal', new THREE.Float32BufferAttribute(parapetNorm, 3))
      parapetGeo.setIndex(parapetIdx)
      const parapetMesh = new THREE.Mesh(parapetGeo, PARAPET_MAT)
      parapetMesh.castShadow = true
      parapetMesh.receiveShadow = true
      parapetMesh.renderOrder = 4
      group.add(parapetMesh)
    }

    return group
  }
}