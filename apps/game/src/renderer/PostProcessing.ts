/**
 * PostProcessing — Burnout Paradise visual pipeline.
 *
 * Memory-optimised stack (Phase 3 — ultra-fast & lightweight):
 *   1. RenderPass      — scene → HDR buffer (HalfFloat, no MSAA)
 *   2. UnrealBloomPass — clamped low-res buffer (max 384x216) for smooth glow without GPU cost
 *   3. ShaderPass      — unified BurnoutPostShader (speed blur + color grade + vignette in 1 pass)
 *   4. OutputPass      — sRGB + tone mapping
 *
 * Eliminated overhead:
 *   - CubeCamera 6-pass re-render → replaced with zero-cost PMREM SkyEnvironment
 *   - Transmission passes on car glass → replaced with clearcoat PBR glass
 *   - Separate SpeedBlur/ColorGrade passes → merged into single pass
 *   - mat.needsUpdate recompilation on road materials → removed
 *
 * Usage:
 *   const pp = new PostProcessing(renderer, scene, camera)
 *   pp.setSpeed(playerCar.getSpeed())   // every frame
 *   pp.render()                          // replaces renderer.render()
 *   pp.setSize(w, h)                     // on resize
 *   pp.setNightFactor(nf)               // on solar update
 */

import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { BurnoutPostShader } from './shaders/BurnoutPostShader.js'

/** Bloom settings for daytime (sun visible) — high threshold so only true lights/glints bloom. */
const BLOOM_DAY = {
  strength:  0.15,
  radius:    0.30,
  threshold: 1.15,
}
/** Bloom settings for nighttime (street lamps and headlights glow softly, windows do not bloom). */
const BLOOM_NIGHT = {
  strength:  0.22,
  radius:    0.38,
  threshold: 1.05,
}

export class PostProcessing {
  private composer: EffectComposer
  private bloom: UnrealBloomPass
  private postPass: ShaderPass
  private renderer: THREE.WebGLRenderer

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
  ) {
    this.renderer = renderer
    const size = new THREE.Vector2()
    renderer.getSize(size)
    const cssW = size.x || window.innerWidth
    const cssH = size.y || window.innerHeight
    const pr = renderer.getPixelRatio()

    const targetW = Math.round(cssW * pr)
    const targetH = Math.round(cssH * pr)

    // ── Composer (HDR render target, no MSAA — saves 4× VRAM) ───────────────
    const renderTarget = new THREE.WebGLRenderTarget(targetW, targetH, {
      type: THREE.HalfFloatType,
      colorSpace: THREE.LinearSRGBColorSpace,
    })
    this.composer = new EffectComposer(renderer, renderTarget)
    this.composer.setPixelRatio(pr)
    this.composer.setSize(cssW, cssH)

    // ── Pass 1 — Scene render ─────────────────────────────────────────────────
    const renderPass = new RenderPass(scene, camera)
    this.composer.addPass(renderPass)

    // ── Pass 2 — Soft Bloom (clamped buffer for ultra-fast execution) ────────
    const bloomW = Math.min(Math.ceil((cssW * pr) / 4), 256)
    const bloomH = Math.min(Math.ceil((cssH * pr) / 4), 144)
    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(bloomW, bloomH),
      BLOOM_DAY.strength,
      BLOOM_DAY.radius,
      BLOOM_DAY.threshold,
    )
    this.composer.addPass(this.bloom)

    // ── Pass 3 — Unified Burnout FX (color grade + vignette in 1 pass) ────────
    this.postPass = new ShaderPass(BurnoutPostShader)
    this.composer.addPass(this.postPass)

    // ── Pass 4 — Output (sRGB + tone mapping) ─────────────────────────────────
    const outputPass = new OutputPass()
    this.composer.addPass(outputPass)
  }

  /** Vehicle speed hook (kept for interface compatibility). */
  setSpeed(_speedMs: number): void {}

  /**
   * Blend bloom between day and night settings based on nightFactor (0–1).
   * Call from the same place that calls renderer.applySolarState().
   */
  setNightFactor(nf: number): void {
    const t = Math.min(1, nf * 1.5)
    this.bloom.strength  = THREE.MathUtils.lerp(BLOOM_DAY.strength,  BLOOM_NIGHT.strength,  t)
    this.bloom.radius    = THREE.MathUtils.lerp(BLOOM_DAY.radius,    BLOOM_NIGHT.radius,    t)
    this.bloom.threshold = THREE.MathUtils.lerp(BLOOM_DAY.threshold, BLOOM_NIGHT.threshold, t)
  }

  /** Swap color grade settings for daytime / sunset / night tone. */
  setSolarElevation(elevDeg: number): void {
    const isSunset = elevDeg > -5 && elevDeg < 20
    const isNight  = elevDeg < -5
    const saturation = isNight ? 0.95 : isSunset ? 1.10 : 1.04
    const contrast   = isSunset ? 1.05 : 1.02
    this.postPass.uniforms['uSaturation']!.value = saturation
    this.postPass.uniforms['uContrast']!.value   = contrast
  }

  /** Must be called on every canvas resize. */
  setSize(w: number, h: number): void {
    const pr = this.renderer.getPixelRatio()
    this.composer.setPixelRatio(pr)
    this.composer.setSize(w, h)
    const bloomW = Math.min(Math.ceil((w * pr) / 4), 256)
    const bloomH = Math.min(Math.ceil((h * pr) / 4), 144)
    this.bloom.setSize(bloomW, bloomH)
  }

  /** Replace the raw renderer.render() call with this. */
  render(): void {
    this.composer.render()
  }

  dispose(): void {
    this.composer.dispose()
  }
}
