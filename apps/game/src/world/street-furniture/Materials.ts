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
  emissiveIntensity: 0.25,
  roughness: 0.4,
})

/**
 * Street-lamp glow from day (0.25, barely on) to night (3.0).
 * The material is shared by every lamp head, so one assignment lights them all.
 */
export function setLampNightGlow(nightAmount: number): void {
  const t = Math.min(1, Math.max(0, nightAmount))
  LAMP_HEAD_MAT.emissiveIntensity = 0.25 + t * 2.75
}

export const WHITE = new THREE.Color(0xffffff)

export const DEFAULT_POSTBOX = new THREE.Color(0xd4a017)