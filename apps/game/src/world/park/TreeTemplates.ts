/**
 * Tree Templates — Realistic Parisian tree archetypes for parks.
 * All templates are cached and marked with userData.isTemplate = true.
 */

import * as THREE from 'three'
import { TRUNK_MAT, FOLIAGE_MATS } from './ParkMaterials.js'

function tagTemplateGroup(group: THREE.Group): THREE.Group {
  group.traverse((c) => {
    c.userData['isTemplate'] = true
  })
  return group
}

let _plataneTemplate: THREE.Group | null = null
let _lindenTemplate: THREE.Group | null = null
let _ornamentalTemplate: THREE.Group | null = null

/**
 * Archetype 1: Parisian Plane Tree / Horse Chestnut (Platane / Marronnier)
 * Majestic spreading crown with multiple organic leafy tiers and branching boughs.
 */
export function getPlataneTemplate(): THREE.Group {
  if (_plataneTemplate) return _plataneTemplate
  const group = new THREE.Group()

  // Main Trunk (height 3.2m, tapering)
  const trunkGeo = new THREE.CylinderGeometry(0.28, 0.44, 3.2, 8)
  trunkGeo.translate(0, 1.6, 0)
  const trunk = new THREE.Mesh(trunkGeo, TRUNK_MAT)
  trunk.castShadow = true
  group.add(trunk)

  // 3 Angled Branching Boughs spreading outward from trunk top
  const branchAngles = [0, (Math.PI * 2) / 3, (Math.PI * 4) / 3]
  for (const angle of branchAngles) {
    const bGeo = new THREE.CylinderGeometry(0.12, 0.20, 1.8, 6)
    bGeo.rotateZ(0.55)
    bGeo.rotateY(angle)
    bGeo.translate(Math.sin(angle) * 0.6, 3.4, Math.cos(angle) * 0.6)
    const bMesh = new THREE.Mesh(bGeo, TRUNK_MAT)
    group.add(bMesh)
  }

  // Voluminous Organic Canopy Clusters (Dodecahedrons for rich foliage clusters)
  const clusterDefs = [
    { x: 0, y: 5.2, z: 0, r: 2.1, matIdx: 0 },
    { x: 1.4, y: 4.5, z: 0.6, r: 1.7, matIdx: 1 },
    { x: -1.3, y: 4.6, z: -0.5, r: 1.8, matIdx: 2 },
    { x: 0.4, y: 4.7, z: 1.3, r: 1.6, matIdx: 1 },
    { x: -0.5, y: 4.8, z: -1.3, r: 1.6, matIdx: 0 },
    { x: 0.1, y: 6.2, z: 0.1, r: 1.5, matIdx: 2 },
  ]

  for (const c of clusterDefs) {
    const fGeo = new THREE.DodecahedronGeometry(c.r, 1)
    fGeo.translate(c.x, c.y, c.z)
    const fMesh = new THREE.Mesh(fGeo, FOLIAGE_MATS[c.matIdx]!)
    fMesh.castShadow = true
    fMesh.receiveShadow = true
    group.add(fMesh)
  }

  _plataneTemplate = tagTemplateGroup(group)
  return _plataneTemplate
}

/**
 * Archetype 2: Linden / Oak Tree (Tilleul noble / Chêne)
 * Stately upright trunk with tall, layered oval canopy.
 */
export function getLindenTemplate(): THREE.Group {
  if (_lindenTemplate) return _lindenTemplate
  const group = new THREE.Group()

  // Trunk (height 3.8m)
  const trunkGeo = new THREE.CylinderGeometry(0.24, 0.38, 3.8, 8)
  trunkGeo.translate(0, 1.9, 0)
  const trunk = new THREE.Mesh(trunkGeo, TRUNK_MAT)
  trunk.castShadow = true
  group.add(trunk)

  // Stratified Tall Canopy Clusters
  const clusterDefs = [
    { x: 0, y: 4.8, z: 0, r: 2.2, matIdx: 1 },
    { x: 0.8, y: 5.4, z: 0.5, r: 1.7, matIdx: 2 },
    { x: -0.7, y: 5.5, z: -0.6, r: 1.7, matIdx: 0 },
    { x: 0, y: 6.6, z: 0, r: 1.6, matIdx: 2 },
    { x: 0, y: 7.7, z: 0, r: 1.2, matIdx: 1 },
  ]

  for (const c of clusterDefs) {
    const fGeo = new THREE.DodecahedronGeometry(c.r, 1)
    fGeo.translate(c.x, c.y, c.z)
    const fMesh = new THREE.Mesh(fGeo, FOLIAGE_MATS[c.matIdx]!)
    fMesh.castShadow = true
    fMesh.receiveShadow = true
    group.add(fMesh)
  }

  _lindenTemplate = tagTemplateGroup(group)
  return _lindenTemplate
}

/**
 * Archetype 3: Ornamental Park Tree / Birch / Flowering (Arbre d'ornement)
 * Graceful slender trunk with delicate spreading canopy.
 */
export function getOrnamentalTemplate(): THREE.Group {
  if (_ornamentalTemplate) return _ornamentalTemplate
  const group = new THREE.Group()

  // Slender Trunk (height 2.8m)
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.26, 2.8, 7)
  trunkGeo.translate(0, 1.4, 0)
  const trunk = new THREE.Mesh(trunkGeo, TRUNK_MAT)
  trunk.castShadow = true
  group.add(trunk)

  // Delicate rounded foliage dome
  const clusterDefs = [
    { x: 0, y: 3.8, z: 0, r: 1.7, matIdx: 2 },
    { x: 0.8, y: 4.2, z: 0.5, r: 1.3, matIdx: 1 },
    { x: -0.7, y: 4.1, z: -0.5, r: 1.3, matIdx: 2 },
    { x: 0, y: 5.0, z: 0, r: 1.1, matIdx: 3 },
  ]

  for (const c of clusterDefs) {
    const fGeo = new THREE.DodecahedronGeometry(c.r, 1)
    fGeo.translate(c.x, c.y, c.z)
    const fMesh = new THREE.Mesh(fGeo, FOLIAGE_MATS[c.matIdx]!)
    fMesh.castShadow = true
    fMesh.receiveShadow = true
    group.add(fMesh)
  }

  _ornamentalTemplate = tagTemplateGroup(group)
  return _ornamentalTemplate
}