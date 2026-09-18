/**
 * BarrierMeshGenerator — renders OSM barrier=* geometry and generates physics colliders.
 *
 * Supports:
 *   - wall: stone/brick/concrete masonry wall with coping stone cap
 *   - fence: vertical posts with horizontal metal/wooden rails
 *   - hedge: lush dense trimmed green shrubbery
 *   - guard_rail: galvanized steel W-beam highway barrier with support posts
 */

import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import type { Barrier, BarrierType } from '@world-drive/shared'

// ── Materials ────────────────────────────────────────────────────────────────

const WALL_MAT = new THREE.MeshStandardMaterial({
  color: 0x8a857b, // aged Parisian limestone / concrete
  roughness: 0.90,
  metalness: 0.05,
})

const WALL_CAP_MAT = new THREE.MeshStandardMaterial({
  color: 0xa8a298, // lighter coping stone
  roughness: 0.85,
  metalness: 0.04,
})

const HEDGE_MAT = new THREE.MeshStandardMaterial({
  color: 0x245422, // deep lush foliage green
  roughness: 0.96,
  metalness: 0.0,
})

const GUARD_RAIL_MAT = new THREE.MeshStandardMaterial({
  color: 0xa0a5a8, // galvanized steel
  roughness: 0.55,
  metalness: 0.70,
})

const FENCE_POST_MAT = new THREE.MeshStandardMaterial({
  color: 0x303030, // dark metal iron
  roughness: 0.70,
  metalness: 0.60,
})

const FENCE_RAIL_MAT = new THREE.MeshStandardMaterial({
  color: 0x3a3a3a,
  roughness: 0.75,
  metalness: 0.50,
})

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildExtrudedSegment(
  p0: { x: number; y: number; z: number },
  p1: { x: number; y: number; z: number },
  width: number,
  height: number,
  yBottom: number,
  material: THREE.Material,
): THREE.Mesh {
  const dx = p1.x - p0.x
  const dz = p1.z - p0.z
  const len = Math.hypot(dx, dz)
  const angle = Math.atan2(dx, dz)

  const geo = new THREE.BoxGeometry(width, height, len)
  const mesh = new THREE.Mesh(geo, material)
  mesh.position.set(
    (p0.x + p1.x) / 2,
    yBottom + height / 2,
    (p0.z + p1.z) / 2,
  )
  mesh.rotation.y = angle
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

// ── Main Class ───────────────────────────────────────────────────────────────

export class BarrierMeshGenerator {
  /**
   * Generates 3D visual mesh group for a barrier polyline.
   */
  static generate(barrier: Barrier): THREE.Group | null {
    const pts = barrier.points
    if (pts.length < 2) return null

    const group = new THREE.Group()
    group.userData['barrierId'] = barrier.id
    const type: BarrierType = barrier.type

    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i]!
      const p1 = pts[i + 1]!
      const segLen = Math.hypot(p1.x - p0.x, p1.z - p0.z)
      if (segLen < 0.2) continue

      if (type === 'wall') {
        const wallH = barrier.height ?? 1.8
        const wallW = 0.28
        // Main wall body
        group.add(buildExtrudedSegment(p0, p1, wallW, wallH, 0, WALL_MAT))
        // Coping stone cap
        group.add(buildExtrudedSegment(p0, p1, wallW + 0.08, 0.10, wallH, WALL_CAP_MAT))
      } else if (type === 'hedge') {
        const hedgeH = barrier.height ?? 1.4
        const hedgeW = 0.60
        group.add(buildExtrudedSegment(p0, p1, hedgeW, hedgeH, 0, HEDGE_MAT))
      } else if (type === 'guard_rail') {
        const railH = 0.75
        const railW = 0.10
        // W-beam horizontal rail
        group.add(buildExtrudedSegment(p0, p1, railW, 0.32, railH - 0.32, GUARD_RAIL_MAT))

        // Support posts every 2.0m
        const numPosts = Math.max(2, Math.floor(segLen / 2.0))
        for (let p = 0; p <= numPosts; p++) {
          const t = p / numPosts
          const px = p0.x + (p1.x - p0.x) * t
          const pz = p0.z + (p1.z - p0.z) * t
          const postGeo = new THREE.BoxGeometry(0.08, railH, 0.08)
          const postMesh = new THREE.Mesh(postGeo, GUARD_RAIL_MAT)
          postMesh.position.set(px, railH / 2, pz)
          postMesh.castShadow = true
          group.add(postMesh)
        }
      } else {
        // Fence: posts + 2 horizontal rails
        const fenceH = barrier.height ?? 1.5
        // Top rail
        group.add(buildExtrudedSegment(p0, p1, 0.05, 0.05, fenceH - 0.1, FENCE_RAIL_MAT))
        // Mid rail
        group.add(buildExtrudedSegment(p0, p1, 0.05, 0.05, fenceH * 0.45, FENCE_RAIL_MAT))

        // Vertical posts every 2.2m
        const numPosts = Math.max(2, Math.floor(segLen / 2.2))
        for (let p = 0; p <= numPosts; p++) {
          const t = p / numPosts
          const px = p0.x + (p1.x - p0.x) * t
          const pz = p0.z + (p1.z - p0.z) * t
          const postGeo = new THREE.BoxGeometry(0.08, fenceH, 0.08)
          const postMesh = new THREE.Mesh(postGeo, FENCE_POST_MAT)
          postMesh.position.set(px, fenceH / 2, pz)
          postMesh.castShadow = true
          group.add(postMesh)
        }
      }
    }

    return group
  }

  /**
   * Generates Rapier physical collider descriptors for solid barrier collisions.
   */
  static createColliderDescs(barrier: Barrier): RAPIER.ColliderDesc[] {
    const pts = barrier.points
    if (pts.length < 2) return []

    const descs: RAPIER.ColliderDesc[] = []
    const type: BarrierType = barrier.type

    let height = barrier.height ?? 1.6
    let width = 0.30
    if (type === 'hedge') { height = 1.4; width = 0.60 }
    else if (type === 'guard_rail') { height = 0.85; width = 0.20 }
    else if (type === 'fence') { height = 1.5; width = 0.15 }

    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i]!
      const p1 = pts[i + 1]!
      const dx = p1.x - p0.x
      const dz = p1.z - p0.z
      const len = Math.hypot(dx, dz)
      if (len < 0.2) continue

      const angle = Math.atan2(dx, dz)
      const midX = (p0.x + p1.x) / 2
      const midZ = (p0.z + p1.z) / 2

      // Rapier cuboid uses half-extents
      const colDesc = RAPIER.ColliderDesc.cuboid(width / 2, height / 2, len / 2)
      colDesc.setTranslation(midX, height / 2, midZ)
      // Set rotation around Y axis
      const halfA = angle / 2
      colDesc.setRotation({ x: 0, y: Math.sin(halfA), z: 0, w: Math.cos(halfA) })
      colDesc.setFriction(0.6)
      colDesc.setRestitution(0.15)
      descs.push(colDesc)
    }

    return descs
  }
}
