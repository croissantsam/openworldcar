/**
 * BuildingMeshGenerator — extrudes OSM building footprints.
 *
 * Uses THREE.ExtrudeGeometry for low-poly buildings.
 * Shared materials per height class.
 */

import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import type { Building } from '@world-drive/shared'

// Instanced materials by height tier
const SHORT_MAT = new THREE.MeshLambertMaterial({ color: 0xb0a090 })
const MED_MAT = new THREE.MeshLambertMaterial({ color: 0x9090a0 })
const TALL_MAT = new THREE.MeshLambertMaterial({ color: 0x8090b0 })

function getMaterial(height: number): THREE.MeshLambertMaterial {
  if (height < 10) return SHORT_MAT
  if (height < 30) return MED_MAT
  return TALL_MAT
}

export class BuildingMeshGenerator {
  /**
   * Generate a building mesh from a footprint polygon.
   * Returns null if footprint is degenerate.
   */
  static generate(building: Building): THREE.Mesh | null {
    const fp = building.footprint
    if (fp.length < 3) return null

    // Build a THREE.Shape from the footprint in X and -Z so that
    // rotating by -PI/2 aligns extrusion with +Y and depth with +Z in world space
    const shape = new THREE.Shape()
    shape.moveTo(fp[0]!.x, -fp[0]!.z)
    for (let i = 1; i < fp.length; i++) {
      shape.lineTo(fp[i]!.x, -fp[i]!.z)
    }
    shape.closePath()

    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: building.height,
      bevelEnabled: false,
    })

    // ExtrudeGeometry extrudes along Z; rotate so it extrudes upward (+Y)
    geo.rotateX(-Math.PI / 2)

    const mat = getMaterial(building.height)
    const mesh = new THREE.Mesh(geo, mat)
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.userData['buildingId'] = building.id

    return mesh
  }

  /**
   * Create a Rapier static collider description for physical collisions.
   * Uses exact trimesh matching the extruded visual building geometry.
   * Prevents false collisions on streets caused by axis-aligned bounding boxes.
   */
  static createColliderDesc(building: Building): RAPIER.ColliderDesc | null {
    const fp = building.footprint
    if (fp.length < 3) return null

    // Fast-path: procedural buildings (4-point or 5-point chamfered corner footprints)
    if (fp.length === 4 || fp.length === 5) {
      let minX = Infinity
      let maxX = -Infinity
      let minZ = Infinity
      let maxZ = -Infinity
      for (let i = 0; i < fp.length; i++) {
        const p = fp[i]!
        if (p.x < minX) minX = p.x
        if (p.x > maxX) maxX = p.x
        if (p.z < minZ) minZ = p.z
        if (p.z > maxZ) maxZ = p.z
      }
      const halfX = (maxX - minX) / 2
      const halfY = building.height / 2
      const halfZ = (maxZ - minZ) / 2
      const centerX = (minX + maxX) / 2
      const centerZ = (minZ + maxZ) / 2

      return RAPIER.ColliderDesc.cuboid(halfX, halfY, halfZ)
        .setTranslation(centerX, halfY, centerZ)
        .setFriction(0.4)
        .setRestitution(0.1)
    }

    try {
      // Build the exact extruded shape matching the visual mesh
      const shape = new THREE.Shape()
      shape.moveTo(fp[0]!.x, -fp[0]!.z)
      for (let i = 1; i < fp.length; i++) {
        shape.lineTo(fp[i]!.x, -fp[i]!.z)
      }
      shape.closePath()

      const geo = new THREE.ExtrudeGeometry(shape, {
        depth: building.height,
        bevelEnabled: false,
      })
      geo.rotateX(-Math.PI / 2)

      const pos = geo.attributes.position
      if (!pos || pos.count < 3) {
        geo.dispose()
        return null
      }

      const vertices = new Float32Array(pos.array)
      const indices = new Uint32Array(pos.count)
      for (let i = 0; i < pos.count; i++) {
        indices[i] = i
      }

      geo.dispose()

      return RAPIER.ColliderDesc.trimesh(vertices, indices)
        .setFriction(0.4)
        .setRestitution(0.1)
    } catch (err) {
      console.warn(`[BuildingMeshGenerator] Failed to create trimesh collider for ${building.id}:`, err)
      return null
    }
  }
}

