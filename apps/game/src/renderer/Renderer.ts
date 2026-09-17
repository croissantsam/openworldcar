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
      powerPreference: 'high-performance',
    })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setSize(mount.clientWidth, mount.clientHeight)
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.2
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    mount.appendChild(this.renderer.domElement)

    // Scene
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0x87ceeb) // sky blue
    this.scene.fog = new THREE.FogExp2(0x87ceeb, 0.0008)

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
    const ambient = new THREE.AmbientLight(0xffeedd, 0.6)
    this.scene.add(ambient)

    // Sun — directional with shadows
    const sun = new THREE.DirectionalLight(0xfff5e0, 2.5)
    sun.position.set(200, 400, 100)
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

    // Hemisphere — sky/ground fill
    const hemi = new THREE.HemisphereLight(0x87ceeb, 0x3d5a3e, 0.8)
    this.scene.add(hemi)
  }

  private _createGroundMesh(): void {
    // Large flat continuous terrain across the world
    const geo = new THREE.PlaneGeometry(500000, 500000, 10, 10)
    const mat = new THREE.MeshLambertMaterial({ color: 0x2d3a2e })
    const ground = new THREE.Mesh(geo, mat)
    ground.rotation.x = -Math.PI / 2
    ground.receiveShadow = true
    this.scene.add(ground)

    // Grid helper (faint atmospheric horizon)
    const grid = new THREE.GridHelper(500000, 2000, 0x2a4030, 0x2a4030)
    ;(grid.material as THREE.LineBasicMaterial).opacity = 0.15
    ;(grid.material as THREE.LineBasicMaterial).transparent = true
    this.scene.add(grid)
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
