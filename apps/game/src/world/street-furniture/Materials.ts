/**
 * Shared materials for street furniture.
 */

import * as THREE from 'three'

/** All furniture geometry carries vertex colours → one material for every kind. */
export const FURN_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.12 })

export const CROWN_MAT = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.76,
  metalness: 0.02,
  flatShading: true,
})

export const LAMP_HEAD_MAT = new THREE.MeshStandardMaterial({
  color: 0xfff4d6,
  emissive: 0xffe2a0,
  emissiveIntensity: 1.4,
  roughness: 0.4,
})

export const WHITE = new THREE.Color(0xffffff)

export const DEFAULT_POSTBOX = new THREE.Color(0xd4a017)