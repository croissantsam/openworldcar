/**
 * RoadMeshGenerator — converts Road data into Three.js BufferGeometry.
 *
 * Creates a ribbon along the road centre-line.
 * Width is determined by lane count.
 */

import * as THREE from 'three'
import type { Road } from '@world-drive/shared'

// Shared materials to minimise draw calls
const ROAD_MATERIALS: Record<string, THREE.MeshLambertMaterial> = {
  motorway: new THREE.MeshLambertMaterial({ color: 0x444466 }),
  trunk: new THREE.MeshLambertMaterial({ color: 0x445566 }),
  primary: new THREE.MeshLambertMaterial({ color: 0x4a4a4a }),
  secondary: new THREE.MeshLambertMaterial({ color: 0x555555 }),
  default: new THREE.MeshLambertMaterial({ color: 0x666666 }),
}

const LANE_WIDTH = 3.5 // metres per lane

function getMaterial(highway: string): THREE.MeshLambertMaterial {
  return ROAD_MATERIALS[highway] ?? ROAD_MATERIALS['default']!
}

export class RoadMeshGenerator {
  /**
   * Generate a road ribbon mesh from a Road definition.
   * Returns null if the road has too few points to form a surface.
   */
  static generate(road: Road): THREE.Mesh | null {
    const points = road.points
    if (points.length < 2) return null

    const width = road.lanes * LANE_WIDTH
    const halfW = width / 2

    const vertices: number[] = []
    const indices: number[] = []
    const uvs: number[] = []

    let totalLength = 0

    for (let i = 0; i < points.length; i++) {
      const curr = points[i]!
      const prev = points[Math.max(0, i - 1)]!
      const next = points[Math.min(points.length - 1, i + 1)]!

      // Direction vector
      let dx = next.x - prev.x
      let dz = next.z - prev.z
      const len = Math.sqrt(dx * dx + dz * dz)
      if (len === 0) { dx = 1; }
      else { dx /= len; dz /= len; }

      // Perpendicular
      const nx = -dz
      const nz = dx

      // Two vertices per road point (left + right edges)
      vertices.push(
        curr.x + nx * halfW, curr.y + 0.02, curr.z + nz * halfW,
        curr.x - nx * halfW, curr.y + 0.02, curr.z - nz * halfW,
      )

      if (i > 0) {
        const segLen = Math.sqrt(
          (curr.x - prev.x) ** 2 + (curr.z - prev.z) ** 2,
        )
        totalLength += segLen
      }

      const u = totalLength / (width * 5)
      uvs.push(0, u, 1, u)

      if (i < points.length - 1) {
        const base = i * 2
        indices.push(base, base + 1, base + 2)
        indices.push(base + 1, base + 3, base + 2)
      }
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
    geo.setIndex(indices)
    geo.computeVertexNormals()

    const mesh = new THREE.Mesh(geo, getMaterial(road.highway))
    mesh.receiveShadow = true
    mesh.userData['roadId'] = road.id

    return mesh
  }
}
