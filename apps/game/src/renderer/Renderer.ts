/**
 * Three.js Renderer wrapper.
 * Owns the WebGLRenderer, scene, and perspective camera.
 */

import * as THREE from 'three'

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
    })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setSize(mount.clientWidth, mount.clientHeight)
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.30
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    mount.appendChild(this.renderer.domElement)

    // Scene (Burnout Paradise sunny coastal sky & crisp horizon)
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0x62aef7) // vibrant azure sky
    this.scene.fog = new THREE.FogExp2(0x8bc0f5, 0.0005) // expansive distance fog

    // Camera
    this.camera = new THREE.PerspectiveCamera(
      60,
      mount.clientWidth / mount.clientHeight,
      0.5,
      3000,
    )
    this.camera.position.set(0, 8, -20)

    // Lighting
    this._setupLighting()

    // Ground plane (visual)
    this._createGroundMesh()

    // Resize handler
    window.addEventListener('resize', this._onResize)
  }

  private _setupLighting(): void {
    // Ambient
    const ambient = new THREE.AmbientLight(0xfff1e0, 0.65)
    this.scene.add(ambient)

    // Sun — warm angled directional sunlight with crisp shadows & asphalt specular sheen
    const sun = new THREE.DirectionalLight(0xfff6e4, 2.8)
    sun.position.set(240, 320, 140)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    sun.shadow.camera.near = 1
    sun.shadow.camera.far = 1000
    sun.shadow.camera.left = -500
    sun.shadow.camera.right = 500
    sun.shadow.camera.top = 500
    sun.shadow.camera.bottom = -500
    sun.shadow.bias = -0.0001
    this.scene.add(sun)

    // Hemisphere — sky / warm ground reflection
    const hemi = new THREE.HemisphereLight(0x72b9f8, 0x3d4a36, 0.85)
    this.scene.add(hemi)
  }

  private _createGroundMesh(): void {
    // Large flat continuous terrain across the world (below chunks at y = -0.15)
    const geo = new THREE.PlaneGeometry(500000, 500000, 10, 10)
    const mat = new THREE.MeshLambertMaterial({
      color: 0x181a1d,
    })
    const ground = new THREE.Mesh(geo, mat)
    ground.rotation.x = -Math.PI / 2
    ground.position.y = -0.15
    ground.receiveShadow = true
    ground.renderOrder = 0
    this.scene.add(ground)
  }

  render(): void {
    this.renderer.render(this.scene, this.camera)
  }

  private _onResize = (): void => {
    const w = window.innerWidth
    const h = window.innerHeight
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h)
  }

  dispose(): void {
    window.removeEventListener('resize', this._onResize)
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }
}
