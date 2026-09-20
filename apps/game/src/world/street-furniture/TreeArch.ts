/**
 * Tree archetypes — extracted from park templates.
 */

import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import {
  getPlataneTemplate,
  getLindenTemplate,
  getOrnamentalTemplate,
} from '../park/index.js'
import { FURN_MAT } from './Materials.js'
import { GeoBuilder, normalise } from './GeometryHelpers.js'

export interface TreeArch {
  trunk: THREE.BufferGeometry
  crown: THREE.BufferGeometry
  trunkMat: THREE.Material
  height: number
}

const _treeArch: (TreeArch | null)[] = [null, null, null]

function isTrunkMesh(m: THREE.Mesh): boolean {
  const mat = m.material as THREE.MeshStandardMaterial
  return !!(mat && mat.map)
}

export function getTreeArch(i: 0 | 1 | 2): TreeArch {
  const cached = _treeArch[i]
  if (cached) return cached
  const tpl = i === 0 ? getPlataneTemplate() : i === 1 ? getLindenTemplate() : getOrnamentalTemplate()
  tpl.updateMatrixWorld(true)
  const trunkParts: THREE.BufferGeometry[] = []
  let trunkMat: THREE.Material = FURN_MAT
  tpl.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh || !m.geometry || !isTrunkMesh(m)) return
    trunkMat = m.material as THREE.Material
    trunkParts.push(normalise(m.geometry, m.matrixWorld))
  })
  const trunk = trunkParts.length === 1
    ? trunkParts[0]!
    : (mergeGeometries(trunkParts, false) ?? new THREE.BufferGeometry())
  trunk.computeBoundingBox()
  trunk.computeBoundingSphere()

  const crown = new GeoBuilder().template(tpl, (m) => !isTrunkMesh(m)).build()

  const height = Math.max(crown.boundingBox?.max.y ?? 8, trunk.boundingBox?.max.y ?? 3)
  const arch: TreeArch = { trunk, crown, trunkMat, height }
  _treeArch[i] = arch
  return arch
}