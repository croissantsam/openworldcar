import * as THREE from 'three'
import { getWaterMaterial } from './WaterMaterial.js'

let _clock: THREE.Clock | null = null

/**
 * Tick the water animation — call once per frame.
 */
export function tickWater(): void {
  const material = getWaterMaterial()
  if (!_clock) {
    _clock = new THREE.Clock()
  }
  material.uniforms['uTime']!.value = _clock.getElapsedTime()
}