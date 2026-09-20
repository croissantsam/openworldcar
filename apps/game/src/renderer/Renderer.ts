/**
 * Three.js Renderer wrapper.
 * Owns the WebGLRenderer, scene, and perspective camera.
 */

import * as THREE from 'three'
import { useSettingsStore, type ViewDistanceSettings } from '../settings/SettingsStore.js'

let onViewDistanceChangeCallback: ((settings: ViewDistanceSettings) => void) | null = null

export function setViewDistanceChangeCallback(cb: (settings: ViewDistanceSettings) => void): void {
  onViewDistanceChangeCallback = cb
}

function getViewDistanceSettings(): ViewDistanceSettings {
  return useSettingsStore.getState().getEffectiveSettings()
}

export class Renderer {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera

  constructor(mount: HTMLElement) {
    // WebGL renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      stencil: true,
      powerPreference: 'high-performance',
      logarithmicDepthBuffer: true,
    })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
    this.renderer.setSize(mount.clientWidth, mount.clientHeight)
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.30
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    mount.appendChild(this.renderer.domElement)

    const settings = getViewDistanceSettings()

    // Scene (Burnout Paradise sunny coastal sky & crisp horizon)
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0x62aef7) // vibrant azure sky
    this.scene.fog = new THREE.FogExp2(0x8bc0f5, settings.fogDensity)

    // Camera
    this.camera = new THREE.PerspectiveCamera(
      60,
      mount.clientWidth / mount.clientHeight,
      0.5,
      settings.cameraFar,
    )
    this.camera.position.set(0, 8, -20)

    // Lighting
    this._setupLighting()

    // Ground plane (visual)
    this._createGroundMesh()

    // Listen for view distance changes
    setViewDistanceChangeCallback((newSettings) => this.applyViewDistanceSettings(newSettings))

    // Resize handler
    window.addEventListener('resize', this._onResize)
  }

  /** Apply new view distance settings (camera far plane, fog). */
  applyViewDistanceSettings(settings: ViewDistanceSettings): void {
    this.camera.far = settings.cameraFar
    this.camera.updateProjectionMatrix()
    if (this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.density = settings.fogDensity
    }
  }

  // Resize handler
  private _onResize = (): void => {
    const w = window.innerWidth
    const h = window.innerHeight
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h)
  }

  private sun!: THREE.DirectionalLight

  private _setupLighting(): void {
    // Ambient
    const ambient = new THREE.AmbientLight(0xfff1e0, 0.65)
    this.scene.add(ambient)

    // Sun — warm angled directional sunlight with crisp shadows & asphalt specular sheen
    this.sun = new THREE.DirectionalLight(0xfff6e4, 2.8)
    this.sun.position.set(120, 180, 80)
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(2048, 2048)
    this.sun.shadow.camera.near = 10
    this.sun.shadow.camera.far = 400
    this.sun.shadow.camera.left = -160
    this.sun.shadow.camera.right = 160
    this.sun.shadow.camera.top = 160
    this.sun.shadow.camera.bottom = -160
    this.sun.shadow.bias = -0.0003
    this.sun.shadow.normalBias = 0.02
    this.scene.add(this.sun)
    this.scene.add(this.sun.target)

    // Hemisphere — sky / warm ground reflection
    const hemi = new THREE.HemisphereLight(0x72b9f8, 0x3d4a36, 0.85)
    this.scene.add(hemi)
  }

  /**
   * Keep directional light and shadow camera centered on the player.
   * This provides crisp shadows everywhere the player drives without rendering distant objects.
   */
  updateSunPosition(pos: { x: number; y: number; z: number }): void {
    if (!this.sun) return
    const offsetX = 120
    const offsetY = 180
    const offsetZ = 80
    this.sun.position.set(pos.x + offsetX, pos.y + offsetY, pos.z + offsetZ)
    this.sun.target.position.set(pos.x, pos.y, pos.z)
    this.sun.target.updateMatrixWorld()
  }

  private _createGroundMesh(): void {
    // Large flat continuous terrain across the world (deep below riverbeds at y = -6.0)
    const geo = new THREE.PlaneGeometry(500000, 500000, 10, 10)
    const mat = new THREE.MeshLambertMaterial({
      color: 0x181a1d,
    })
    const ground = new THREE.Mesh(geo, mat)
    ground.rotation.x = -Math.PI / 2
    ground.position.y = -6.0 // Deep below riverbeds (-3.4m) and water (-2.2m)
    ground.receiveShadow = true
    ground.renderOrder = -10
    this.scene.add(ground)
  }

  render(): void {
    this.renderer.render(this.scene, this.camera)
  }

  dispose(): void {
    window.removeEventListener('resize', this._onResize)
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }
}
