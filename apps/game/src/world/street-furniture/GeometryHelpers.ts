/**
 * Geometry helpers — vertex-coloured, non-indexed, merged geometries.
 */

import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { WHITE } from './Materials.js'

export function bakeColour(geo: THREE.BufferGeometry, c: THREE.Color): THREE.BufferGeometry {
  const n = geo.getAttribute('position')!.count
  const arr = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r
    arr[i * 3 + 1] = c.g
    arr[i * 3 + 2] = c.b
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3))
  return geo
}

export function normalise(geo: THREE.BufferGeometry, matrix?: THREE.Matrix4): THREE.BufferGeometry {
  let g = geo.index ? geo.toNonIndexed() : geo.clone()
  if (matrix) g.applyMatrix4(matrix)
  for (const name of Object.keys(g.attributes)) {
    if (name !== 'position' && name !== 'normal' && name !== 'uv' && name !== 'color') g.deleteAttribute(name)
  }
  if (!g.getAttribute('normal')) g.computeVertexNormals()
  if (!g.getAttribute('uv')) {
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position')!.count * 2), 2))
  }
  return g
}

export class GeoBuilder {
  private parts: THREE.BufferGeometry[] = []
  private readonly c = new THREE.Color()

  box(w: number, h: number, d: number, x: number, y: number, z: number, colour: number, rotY = 0): this {
    const g = new THREE.BoxGeometry(w, h, d)
    if (rotY) g.rotateY(rotY)
    g.translate(x, y, z)
    this.parts.push(bakeColour(normalise(g), this.c.set(colour)))
    g.dispose()
    return this
  }

  cyl(rTop: number, rBot: number, h: number, x: number, y: number, z: number, colour: number, segs = 8, rotY = 0): this {
    const g = new THREE.CylinderGeometry(rTop, rBot, h, segs)
    if (rotY) g.rotateY(rotY)
    g.translate(x, y, z)
    this.parts.push(bakeColour(normalise(g), this.c.set(colour)))
    g.dispose()
    return this
  }

  /** Merge the meshes of a template group, baking each mesh's material colour. */
  template(group: THREE.Group, keep?: (m: THREE.Mesh) => boolean): this {
    group.updateMatrixWorld(true)
    group.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh || !m.geometry) return
      if (keep && !keep(m)) return
      const mat = (Array.isArray(m.material) ? m.material[0] : m.material) as THREE.MeshStandardMaterial
      const colour = mat && mat.color ? mat.color : WHITE
      this.parts.push(bakeColour(normalise(m.geometry, m.matrixWorld), colour))
    })
    return this
  }

  build(): THREE.BufferGeometry {
    const merged = this.parts.length === 1 ? this.parts[0]! : mergeGeometries(this.parts, false)
    if (!merged) return new THREE.BufferGeometry()
    merged.computeBoundingBox()
    merged.computeBoundingSphere()
    return merged
  }
}