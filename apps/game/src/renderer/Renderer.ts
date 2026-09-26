/**
 * Three.js Renderer wrapper.
 * Owns the WebGLRenderer, scene, and perspective camera.
 */

import * as THREE from 'three'
import { useSettingsStore, type ViewDistanceSettings } from '../settings/SettingsStore.js'
import { dayNightPalette, nightFactor } from './daynight.js'
import { setLampNightGlow } from '../world/street-furniture/Materials.js'
import { setFacadeNightGlow } from '../world/building/building-textures.js'
import { setVitrineNightFactor } from '../world/StorefrontInterior.js'
import { setAsphaltWetness } from '../world/road/materials.js'
import { PostProcessing } from './PostProcessing.js'
import { SkyEnvironment } from './SkyEnvironment.js'
import { CloudSystem } from './Clouds.js'

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
  /** Full Burnout Paradise post-processing pipeline. */
  postProcessing!: PostProcessing
  /** Procedural HDR sky environment reflections (cars, roads, buildings). */
  private skyEnv: SkyEnvironment
  /** Procedural slow-drifting atmospheric clouds. */
  clouds: CloudSystem
  private lastFrameTime = performance.now()

  constructor(mount: HTMLElement) {
    // WebGL renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      stencil: true,
      powerPreference: 'high-performance',
      logarithmicDepthBuffer: false,
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

    // Moon + stars (visible at night only)
    this._setupNightSky()

    // Ground plane (visual)
    this._createGroundMesh()

    // Post-processing pipeline (Bloom, Speed Blur, Color Grade)
    this.postProcessing = new PostProcessing(this.renderer, this.scene, this.camera)

    // Procedural HDR sky environment map (ambient reflections for cars & asphalt)
    this.skyEnv = new SkyEnvironment(this.renderer)

    // Procedural slow-drifting atmospheric clouds
    this.clouds = new CloudSystem(this.scene)

    // Listen for view distance changes
    setViewDistanceChangeCallback((newSettings) => this.applyViewDistanceSettings(newSettings))

    // Resize handler
    window.addEventListener('resize', this._onResize)
  }

  /** Apply new view distance settings (camera far plane, fog, shadow distance). */
  applyViewDistanceSettings(settings: ViewDistanceSettings): void {
    this.camera.far = settings.cameraFar
    this.camera.updateProjectionMatrix()
    if (this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.density = settings.fogDensity
    }
    this._updateShadowFrustum(settings.loadRadius)
  }

  private _updateShadowFrustum(loadRadius: number): void {
    if (!this.sun) return
    const shadowRadius = Math.max(260, Math.min(480, (loadRadius + 0.5) * 128))
    const cam = this.sun.shadow.camera as THREE.OrthographicCamera
    cam.left = -shadowRadius
    cam.right = shadowRadius
    cam.top = shadowRadius
    cam.bottom = -shadowRadius
    cam.near = 15
    cam.far = 900
    cam.updateProjectionMatrix()
  }

  // Resize handler
  private _onResize = (): void => {
    const w = window.innerWidth
    const h = window.innerHeight
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h)
    this.postProcessing?.setSize(w, h)
  }

  private sun!: THREE.DirectionalLight
  private ambient!: THREE.AmbientLight
  private hemi!: THREE.HemisphereLight
  /**
   * Unit vector pointing TOWARD the sun (or moon at night). Defaults to the
   * legacy fixed afternoon offset so the scene looks identical before the
   * first real solar update.
   */
  private sunDir = new THREE.Vector3(120, 180, 80).normalize()
  /** Player position from the last shadow-box update — anchors moon + stars. */
  private lastFocus = new THREE.Vector3()
  private lastSunPos = new THREE.Vector3(-99999, -99999, -99999)
  private moon!: THREE.Sprite
  private moonMat!: THREE.SpriteMaterial
  private stars!: THREE.Points
  private starsMat!: THREE.PointsMaterial

  private _setupLighting(): void {
    const settings = getViewDistanceSettings()
    const shadowRadius = Math.max(260, Math.min(480, (settings.loadRadius + 0.5) * 128))

    // Ambient
    this.ambient = new THREE.AmbientLight(0xfff1e0, 0.65)
    this.scene.add(this.ambient)

    // Sun — warm angled directional sunlight with crisp shadows & asphalt specular sheen
    // Shadow box matches the loaded building chunk radius (e.g. 320m for medium),
    // so distant buildings cast their shadows immediately as they load instead of popping in when moving.
    this.sun = new THREE.DirectionalLight(0xfff6e4, 2.8)
    this.sun.position.set(120, 180, 80)
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(2048, 2048)
    this.sun.shadow.camera.near = 15
    this.sun.shadow.camera.far = 900
    this.sun.shadow.camera.left = -shadowRadius
    this.sun.shadow.camera.right = shadowRadius
    this.sun.shadow.camera.top = shadowRadius
    this.sun.shadow.camera.bottom = -shadowRadius
    this.sun.shadow.bias = -0.0003
    this.sun.shadow.normalBias = 0.04
    this.scene.add(this.sun)
    this.scene.add(this.sun.target)

    // Hemisphere — sky / warm ground reflection
    this.hemi = new THREE.HemisphereLight(0x72b9f8, 0x3d4a36, 0.85)
    this.scene.add(this.hemi)
  }

  /**
   * Drive all lighting from the real solar position.
   * World axes: +x east, −z north, +y up; azimuth is clockwise from north.
   * Below −6° the directional light becomes moonlight (opposite azimuth,
   * fixed 35° elevation) so nights stay readable with working shadows.
   */
  applySolarState(elevationDeg: number, azimuthDeg: number): void {
    const p = dayNightPalette(elevationDeg)
    const toRad = Math.PI / 180
    let az = azimuthDeg * toRad
    let el = elevationDeg * toRad
    if (p.moon) {
      az += Math.PI
      el = 35 * toRad
    }
    const cosEl = Math.cos(el)
    this.sunDir
      .set(Math.sin(az) * cosEl, Math.sin(el), -Math.cos(az) * cosEl)
      .normalize()

    this.sun.color.setHex(p.sunColor)
    this.sun.intensity = p.sunIntensity
    this.ambient.color.setHex(p.ambientColor)
    this.ambient.intensity = p.ambientIntensity
    this.hemi.color.setHex(p.hemiSky)
    this.hemi.groundColor.setHex(p.hemiGround)
    this.hemi.intensity = p.hemiIntensity
    if (this.scene.background instanceof THREE.Color) {
      this.scene.background.setHex(p.background)
    }
    if (this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.color.setHex(p.fog)
    }
    this.renderer.toneMappingExposure = p.exposure

    // Night glow: street-lamp heads + lit building windows (shared materials,
    // so the whole loaded city follows in one pass — no per-object cost).
    const nf = nightFactor(elevationDeg)
    setLampNightGlow(nf)
    setFacadeNightGlow(nf * 0.12)
    setVitrineNightFactor(nf)
    setAsphaltWetness(nf)

    // Post-processing: adapt bloom + color grade to time of day.
    this.postProcessing?.setNightFactor(nf)
    this.postProcessing?.setSolarElevation(elevationDeg)

    // Update HDR sky environment reflection map for car body and asphalt
    this.skyEnv?.update(this.scene, elevationDeg, azimuthDeg, p)

    // Clouds: adapt to sun/moon lighting, sky color, and day/night factor
    this.clouds?.applySolarState(p, nf, this.sunDir)

    // Moon + stars follow the player and fade in with the night.
    // sunDir already points at the moon when palette.moon is set.
    const MOON_DIST = 1200
    this.stars.position.copy(this.lastFocus)
    this.starsMat.opacity = nf
    this.moonMat.opacity = nf > 0.02 ? Math.min(1, nf * 1.5) : 0
    this.moon.visible = this.moonMat.opacity > 0
    if (this.moon.visible) {
      this.moon.position.set(
        this.lastFocus.x + this.sunDir.x * MOON_DIST,
        this.lastFocus.y + this.sunDir.y * MOON_DIST,
        this.lastFocus.z + this.sunDir.z * MOON_DIST,
      )
    }
  }

  /**
   * Moon disc + star dome. Both follow the player (sky-anchored, never
   * occluded by fog) and fade in with the night amount. One sprite + one
   * Points draw call, zero cost by day.
   */
  private _setupNightSky(): void {
    // Moon: soft radial disc sprite.
    const canvas = document.createElement('canvas')
    canvas.width = 128
    canvas.height = 128
    const ctx = canvas.getContext('2d')!
    const grad = ctx.createRadialGradient(64, 64, 20, 64, 64, 64)
    grad.addColorStop(0, 'rgba(240, 244, 255, 1)')
    grad.addColorStop(0.55, 'rgba(214, 224, 248, 1)')
    grad.addColorStop(0.62, 'rgba(180, 192, 228, 0.55)')
    grad.addColorStop(1, 'rgba(160, 175, 220, 0)')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, 128, 128)
    const moonTex = new THREE.CanvasTexture(canvas)
    this.moonMat = new THREE.SpriteMaterial({
      map: moonTex,
      transparent: true,
      opacity: 0,
      fog: false,
      depthWrite: false,
    })
    this.moon = new THREE.Sprite(this.moonMat)
    this.moon.scale.set(140, 140, 1)
    this.moon.visible = false
    this.moon.renderOrder = -7
    this.scene.add(this.moon)

    // Stars: deterministic dome (seeded so the sky is stable frame to frame).
    const COUNT = 900
    const RADIUS = 1300
    const positions = new Float32Array(COUNT * 3)
    const colors = new Float32Array(COUNT * 3)
    let seed = 0x2f6e2b1
    const rand = (): number => {
      seed = (seed + 0x6d2b79f5) | 0
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
    for (let i = 0; i < COUNT; i++) {
      const theta = rand() * Math.PI * 2
      const y = 0.05 + rand() * 0.95
      const r = Math.sqrt(Math.max(0, 1 - y * y))
      positions[i * 3] = Math.cos(theta) * r * RADIUS
      positions[i * 3 + 1] = y * RADIUS
      positions[i * 3 + 2] = Math.sin(theta) * r * RADIUS
      const b = 0.35 + 0.65 * rand() * rand()
      const warm = rand() < 0.2
      colors[i * 3] = b * (warm ? 1 : 0.85)
      colors[i * 3 + 1] = b * 0.9
      colors[i * 3 + 2] = b
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    this.starsMat = new THREE.PointsMaterial({
      size: 1.8,
      sizeAttenuation: false,
      vertexColors: true,
      transparent: true,
      opacity: 0,
      fog: false,
      depthWrite: false,
    })
    this.stars = new THREE.Points(geo, this.starsMat)
    this.stars.renderOrder = -8
    this.scene.add(this.stars)
  }

  /**
   * Keep directional light and shadow camera centered on the player.
   * This provides crisp shadows everywhere the player drives without rendering distant objects.
   * The light sits along the current sun/moon direction (see applySolarState).
   */
  updateSunPosition(pos: { x: number; y: number; z: number }): void {
    if (!this.sun) return
    this.lastFocus.set(pos.x, pos.y, pos.z)
    const dx = pos.x - this.lastSunPos.x
    const dz = pos.z - this.lastSunPos.z
    if (dx * dx + dz * dz < 0.1) return
    this.lastSunPos.set(pos.x, pos.y, pos.z)

    const DIST = 400
    this.sun.position.set(
      pos.x + this.sunDir.x * DIST,
      pos.y + this.sunDir.y * DIST,
      pos.z + this.sunDir.z * DIST,
    )
    this.sun.target.position.set(pos.x, pos.y, pos.z)
    this.sun.target.updateMatrixWorld()
  }

  private _createGroundMesh(): void {
    // Large flat continuous terrain below riverbeds (y = -6.0).
    // MeshBasicMaterial = unlit flat colour → invisible to the bloom pass,
    // so it never contributes to the "glowy ground" artefact.
    const geo = new THREE.PlaneGeometry(500000, 500000, 1, 1)
    const mat = new THREE.MeshBasicMaterial({ color: 0x8a867e })
    const ground = new THREE.Mesh(geo, mat)
    ground.rotation.x = -Math.PI / 2
    ground.position.y = -6.0
    ground.renderOrder = -10
    this.scene.add(ground)
  }

  /** Set current vehicle speed (m/s) for speed-blur post-processing. */
  setSpeed(speedMs: number): void {
    this.postProcessing?.setSpeed(speedMs)
  }

  /** Environment reflection map for vehicles. */
  getEnvMap(): THREE.Texture | null {
    return this.skyEnv?.getTexture() ?? null
  }

  render(): void {
    const now = performance.now()
    const delta = Math.min((now - this.lastFrameTime) / 1000, 0.1)
    this.lastFrameTime = now

    // Slow atmospheric cloud drift and camera positioning
    this.clouds?.update(delta, this.camera.position)

    // Use post-processing composer instead of bare renderer.render()
    if (this.postProcessing) {
      this.postProcessing.render()
    } else {
      this.renderer.render(this.scene, this.camera)
    }
  }

  dispose(): void {
    window.removeEventListener('resize', this._onResize)
    this.clouds?.dispose()
    this.skyEnv?.dispose()
    this.postProcessing?.dispose()
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }
}
