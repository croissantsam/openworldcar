/**
 * Organic Flowering Shrub Template — for park flowerbeds.
 */

import * as THREE from 'three'
import { SHRUB_MAT, FLOWER_BLOSSOM_MATS } from './ParkMaterials.js'

function tagTemplateGroup(group: THREE.Group): THREE.Group {
  group.traverse((c) => {
    c.userData['isTemplate'] = true
  })
  return group
}

let _shrubTemplate: THREE.Group | null = null

export function getShrubTemplate(): THREE.Group {
  if (_shrubTemplate) return _shrubTemplate
  const group = new THREE.Group()

  const mainGeo = new THREE.DodecahedronGeometry(0.75, 1)
  mainGeo.scale(1.2, 0.8, 1.0)
  mainGeo.translate(0, 0.55, 0)
  const shrub = new THREE.Mesh(mainGeo, SHRUB_MAT)
  shrub.receiveShadow = true
  group.add(shrub)

  // Blossom accents
  const blossomCount = 8
  for (let i = 0; i < blossomCount; i++) {
    const bGeo = new THREE.SphereGeometry(0.08, 4, 4)
    const ang = (i / blossomCount) * Math.PI * 2
    const bx = Math.cos(ang) * 0.6
    const bz = Math.sin(ang) * 0.5
    const by = 0.55 + Math.sin(i * 2.3) * 0.25
    bGeo.translate(bx, by, bz)
    const bMesh = new THREE.Mesh(bGeo, FLOWER_BLOSSOM_MATS[i % FLOWER_BLOSSOM_MATS.length]!)
    group.add(bMesh)
  }

  _shrubTemplate = tagTemplateGroup(group)
  return _shrubTemplate
}