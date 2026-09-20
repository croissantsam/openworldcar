/**
 * Parisian Park Bench Template — Davioud style bench (fonte et bois).
 */

import * as THREE from 'three'
import { BENCH_IRON_MAT, BENCH_WOOD_MAT } from './ParkMaterials.js'

function tagTemplateGroup(group: THREE.Group): THREE.Group {
  group.traverse((c) => {
    c.userData['isTemplate'] = true
  })
  return group
}

let _benchTemplate: THREE.Group | null = null

export function getBenchTemplate(): THREE.Group {
  if (_benchTemplate) return _benchTemplate
  const group = new THREE.Group()

  // 2 Cast Iron End Legs
  for (const xOff of [-0.75, 0.75]) {
    const legGeo = new THREE.BoxGeometry(0.06, 0.44, 0.52)
    legGeo.translate(xOff, 0.22, 0)
    const leg = new THREE.Mesh(legGeo, BENCH_IRON_MAT)
    group.add(leg)

    // Backrest upright support
    const upGeo = new THREE.BoxGeometry(0.05, 0.45, 0.05)
    upGeo.translate(xOff, 0.60, -0.22)
    const up = new THREE.Mesh(upGeo, BENCH_IRON_MAT)
    group.add(up)
  }

  // Wooden Seat Slats
  for (let s = 0; s < 3; s++) {
    const slatGeo = new THREE.BoxGeometry(1.65, 0.035, 0.12)
    slatGeo.translate(0, 0.44, -0.16 + s * 0.15)
    const slat = new THREE.Mesh(slatGeo, BENCH_WOOD_MAT)
    group.add(slat)
  }

  // Wooden Backrest Slats
  for (let b = 0; b < 2; b++) {
    const backGeo = new THREE.BoxGeometry(1.65, 0.12, 0.035)
    backGeo.translate(0, 0.62 + b * 0.15, -0.24)
    const back = new THREE.Mesh(backGeo, BENCH_WOOD_MAT)
    group.add(back)
  }

  _benchTemplate = tagTemplateGroup(group)
  return _benchTemplate
}