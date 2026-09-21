/**
 * ImpactFX — Multi-sensory impact and collision feedback system.
 *
 * Provides:
 *   1. Procedural Web Audio crash sound synthesis (no external audio files required!)
 *   2. 3D spark particle bursts in Three.js (hot orange/white glowing sparks)
 *   3. Screen flash vignette overlay (tactile visual jolt)
 *   4. Gamepad dual-rumble haptic feedback
 */

import * as THREE from 'three'

// ── 1. Procedural Web Audio Crash Sound Synthesizer ────────────────────────
class CrashAudio {
  private ctx: AudioContext | null = null
  private noiseBuffer: AudioBuffer | null = null
  /** Persistent tire-screech loop (created on first drift, gain-driven). */
  private screechGain: GainNode | null = null

  private init(): void {
    if (this.ctx) return
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      this.ctx = new AudioCtx()

      // Generate 0.5s of white noise for metallic crunches
      const sampleRate = this.ctx.sampleRate
      const bufferSize = sampleRate * 0.5
      this.noiseBuffer = this.ctx.createBuffer(1, bufferSize, sampleRate)
      const data = this.noiseBuffer.getChannelData(0)
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1
      }

      // Resume context on user gesture if suspended
      const resume = () => {
        if (this.ctx && this.ctx.state === 'suspended') {
          this.ctx.resume()
        }
        window.removeEventListener('keydown', resume)
        window.removeEventListener('pointerdown', resume)
      }
      window.addEventListener('keydown', resume)
      window.addEventListener('pointerdown', resume)
    } catch {
      // AudioContext unavailable
    }
  }

  playImpact(intensity: number): void {
    this.init()
    if (!this.ctx || this.ctx.state === 'suspended') return

    const now = this.ctx.currentTime
    const clampedInt = Math.min(1.0, Math.max(0.15, intensity))

    // A. Sub-bass punch (thud)
    const osc = this.ctx.createOscillator()
    const oscGain = this.ctx.createGain()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(140 * clampedInt, now)
    osc.frequency.exponentialRampToValueAtTime(32, now + 0.18)

    oscGain.gain.setValueAtTime(0.7 * clampedInt, now)
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.22)

    osc.connect(oscGain)
    oscGain.connect(this.ctx.destination)
    osc.start(now)
    osc.stop(now + 0.25)

    // B. High-frequency metal crunch / scrape (filtered noise burst)
    if (this.noiseBuffer) {
      const noiseSource = this.ctx.createBufferSource()
      noiseSource.buffer = this.noiseBuffer

      const filter = this.ctx.createBiquadFilter()
      filter.type = 'bandpass'
      filter.frequency.setValueAtTime(800 + clampedInt * 600, now)
      filter.Q.setValueAtTime(2.0, now)

      const noiseGain = this.ctx.createGain()
      noiseGain.gain.setValueAtTime(0.55 * clampedInt, now)
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12 + clampedInt * 0.12)

      noiseSource.connect(filter)
      filter.connect(noiseGain)
      noiseGain.connect(this.ctx.destination)

      noiseSource.start(now)
      noiseSource.stop(now + 0.3)
    }
  }

  playSplash(): void {
    this.init()
    if (!this.ctx || this.ctx.state === 'suspended') return
    const now = this.ctx.currentTime

    // Low water whoosh
    const osc = this.ctx.createOscillator()
    const oscGain = this.ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(80, now)
    osc.frequency.exponentialRampToValueAtTime(25, now + 0.35)

    oscGain.gain.setValueAtTime(0.75, now)
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.40)
    osc.connect(oscGain)
    oscGain.connect(this.ctx.destination)
    osc.start(now)
    osc.stop(now + 0.45)

    // White water splash hiss
    if (this.noiseBuffer) {
      const noiseSource = this.ctx.createBufferSource()
      noiseSource.buffer = this.noiseBuffer

      const filter = this.ctx.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.setValueAtTime(1200, now)
      filter.frequency.exponentialRampToValueAtTime(200, now + 0.45)

      const noiseGain = this.ctx.createGain()
      noiseGain.gain.setValueAtTime(0.65, now)
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.50)

      noiseSource.connect(filter)
      filter.connect(noiseGain)
      noiseGain.connect(this.ctx.destination)
      noiseSource.start(now)
      noiseSource.stop(now + 0.55)
    }
  }

  /**
   * Continuous tire screech for drifts. Call every frame with 0..1 (0 =
   * silent): a persistent band-passed noise loop whose gain follows the
   * drift intensity. Never throws; silent when audio is unavailable.
   */
  setScreech(intensity: number): void {
    this.init()
    if (!this.ctx || !this.noiseBuffer) {
      return
    }
    try {
      if (!this.screechGain) {
        const src = this.ctx.createBufferSource()
        src.buffer = this.noiseBuffer
        src.loop = true
        const filter = this.ctx.createBiquadFilter()
        filter.type = 'bandpass'
        filter.frequency.value = 950
        filter.Q.value = 7
        const gain = this.ctx.createGain()
        gain.gain.value = 0
        src.connect(filter)
        filter.connect(gain)
        gain.connect(this.ctx.destination)
        src.start()
        this.screechGain = gain
      }
      if (this.ctx.state === 'suspended') return
      const target = Math.min(1, Math.max(0, intensity)) * 0.16
      this.screechGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.06)
    } catch {
      // AudioContext unavailable mid-game — stay silent
    }
  }

  playShieldActivated(): void {
    this.init()
    if (!this.ctx || this.ctx.state === 'suspended') return
    const now = this.ctx.currentTime

    // Rising harmonic sci-fi chime
    const freqs = [440, 659.25, 880]
    freqs.forEach((freq, idx) => {
      if (!this.ctx) return
      const osc = this.ctx.createOscillator()
      const gain = this.ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, now + idx * 0.08)
      gain.gain.setValueAtTime(0, now + idx * 0.08)
      gain.gain.linearRampToValueAtTime(0.18, now + idx * 0.08 + 0.03)
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.45)
      osc.connect(gain)
      gain.connect(this.ctx.destination)
      osc.start(now + idx * 0.08)
      osc.stop(now + idx * 0.08 + 0.5)
    })
  }

  playShieldWarning(): void {
    this.init()
    if (!this.ctx || this.ctx.state === 'suspended') return
    const now = this.ctx.currentTime

    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(620, now)
    gain.gain.setValueAtTime(0.12, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12)
    osc.connect(gain)
    gain.connect(this.ctx.destination)
    osc.start(now)
    osc.stop(now + 0.14)
  }

  playShieldDeactivated(): void {
    this.init()
    if (!this.ctx || this.ctx.state === 'suspended') return
    const now = this.ctx.currentTime

    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(520, now)
    osc.frequency.exponentialRampToValueAtTime(160, now + 0.35)
    gain.gain.setValueAtTime(0.18, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38)
    osc.connect(gain)
    gain.connect(this.ctx.destination)
    osc.start(now)
    osc.stop(now + 0.4)
  }
}

// ── 2. 3D Spark Particle System ────────────────────────────────────────────
type Spark = {
  mesh: THREE.Mesh
  velocity: THREE.Vector3
  life: number
  maxLife: number
}

const SPARK_MAT = new THREE.MeshBasicMaterial({
  color: 0xffaa22,
  transparent: true,
  opacity: 1.0,
})

// ── 3. Drift Smoke Puff Pool ─────────────────────────────────────────────────
type SmokePuff = {
  mesh: THREE.Mesh
  life: number
  maxLife: number
}

const SMOKE_GEO = new THREE.BoxGeometry(0.5, 0.5, 0.5)
const SMOKE_MAT = new THREE.MeshBasicMaterial({
  color: 0xc9ced4,
  transparent: true,
  opacity: 0.0,
  depthWrite: false,
})

const MAX_SMOKE_PUFFS = 128

export class ImpactFX {
  private scene: THREE.Scene
  private audio = new CrashAudio()
  private sparks: Spark[] = []
  private smokePuffs: SmokePuff[] = []
  private flashEl: HTMLDivElement | null = null

  constructor(scene: THREE.Scene) {
    this.scene = scene
    this._createScreenFlashElement()
  }

  private _createScreenFlashElement(): void {
    if (typeof document === 'undefined') return
    const el = document.createElement('div')
    el.id = 'impact-screen-flash'
    el.style.position = 'fixed'
    el.style.top = '0'
    el.style.left = '0'
    el.style.width = '100vw'
    el.style.height = '100vh'
    el.style.pointerEvents = 'none'
    el.style.zIndex = '9999'
    el.style.background = 'radial-gradient(ellipse at center, rgba(255,255,255,0.4) 0%, rgba(255,40,0,0.3) 65%, transparent 100%)'
    el.style.opacity = '0'
    el.style.transition = 'opacity 0.05s ease-out'
    document.body.appendChild(el)
    this.flashEl = el
  }

  /**
   * Trigger complete impact feedback.
   */
  triggerImpact(
    intensity: number,
    point: { x: number; y: number; z: number },
    direction: { x: number; y: number; z: number },
  ): void {
    // 1. Audio crunch
    this.audio.playImpact(intensity)

    // 2. Screen flash
    if (this.flashEl) {
      this.flashEl.style.opacity = (Math.min(0.75, intensity * 0.65)).toString()
      setTimeout(() => {
        if (this.flashEl) {
          this.flashEl.style.opacity = '0'
          this.flashEl.style.transition = 'opacity 0.22s ease-out'
        }
      }, 50)
    }

    // 3. 3D Spark burst
    const count = Math.min(45, Math.floor(15 + intensity * 35))
    const sparkGeo = new THREE.BoxGeometry(0.06, 0.06, 0.14)

    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(sparkGeo, SPARK_MAT)
      mesh.position.set(
        point.x + (Math.random() - 0.5) * 0.4,
        point.y + (Math.random() - 0.5) * 0.3,
        point.z + (Math.random() - 0.5) * 0.4,
      )

      // Spray sparks away from impact normal with cone spread
      const speed = 6 + Math.random() * 16 * intensity
      const sprayDir = new THREE.Vector3(
        -direction.x + (Math.random() - 0.5) * 1.5,
        Math.abs(direction.y) + Math.random() * 1.2 + 0.3,
        -direction.z + (Math.random() - 0.5) * 1.5,
      ).normalize()

      this.scene.add(mesh)
      this.sparks.push({
        mesh,
        velocity: sprayDir.multiplyScalar(speed),
        life: 0,
        maxLife: 0.25 + Math.random() * 0.35,
      })
    }

    // 4. Gamepad rumble if available
    try {
      if (typeof navigator !== 'undefined' && navigator.getGamepads) {
        const gamepads = navigator.getGamepads()
        for (const gp of gamepads) {
          if (gp && gp.vibrationActuator) {
            gp.vibrationActuator.playEffect('dual-rumble', {
              startDelay: 0,
              duration: Math.floor(100 + intensity * 200),
              weakMagnitude: intensity,
              strongMagnitude: intensity * 0.9,
            })
          }
        }
      }
    } catch {
      // Gamepad vibration unsupported
    }
  }

  /**
   * Trigger water plunge / splash feedback when car falls into river/lake.
   */
  triggerWaterSplash(point: { x: number; y: number; z: number }): void {
    this.audio.playSplash()

    // Blue water vignette splash
    if (this.flashEl) {
      this.flashEl.style.background = 'radial-gradient(ellipse at center, rgba(14,165,233,0.55) 0%, rgba(2,132,199,0.45) 65%, transparent 100%)'
      this.flashEl.style.opacity = '0.80'
      setTimeout(() => {
        if (this.flashEl) {
          this.flashEl.style.opacity = '0'
          this.flashEl.style.transition = 'opacity 0.40s ease-out'
          setTimeout(() => {
            if (this.flashEl) {
              this.flashEl.style.background = 'radial-gradient(ellipse at center, rgba(255,255,255,0.4) 0%, rgba(255,40,0,0.3) 65%, transparent 100%)'
            }
          }, 450)
        }
      }, 70)
    }

    // Water droplet burst
    const count = 30
    const dropletGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12)
    const DROPLET_MAT = new THREE.MeshBasicMaterial({ color: 0x93c5fd, transparent: true, opacity: 0.9 })

    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(dropletGeo, DROPLET_MAT)
      mesh.position.set(
        point.x + (Math.random() - 0.5) * 1.5,
        (point.y ?? 0) + 0.2 + Math.random() * 0.3,
        point.z + (Math.random() - 0.5) * 1.5,
      )

      const speed = 5 + Math.random() * 8
      const sprayDir = new THREE.Vector3(
        (Math.random() - 0.5) * 2,
        Math.random() * 1.4 + 0.8,
        (Math.random() - 0.5) * 2,
      ).normalize()

      this.scene.add(mesh)
      this.sparks.push({
        mesh,
        velocity: sprayDir.multiplyScalar(speed),
        life: 0,
        maxLife: 0.45 + Math.random() * 0.35,
      })
    }
  }

  /**
   * One tire-smoke puff at a rear wheel. Call per frame while drifting
   * (the pool caps live puffs; excess calls are dropped).
   */
  emitDriftSmoke(point: { x: number; y: number; z: number }): void {
    let puff = this.smokePuffs.find((p) => p.life >= p.maxLife)
    if (!puff) {
      if (this.smokePuffs.length >= MAX_SMOKE_PUFFS) return
      const mesh = new THREE.Mesh(SMOKE_GEO, SMOKE_MAT.clone())
      mesh.visible = false
      this.scene.add(mesh)
      puff = { mesh, life: 1, maxLife: 1 }
      this.smokePuffs.push(puff)
    }
    puff.maxLife = 0.7 + Math.random() * 0.4
    puff.life = 0
    puff.mesh.visible = true
    puff.mesh.position.set(
      point.x + (Math.random() - 0.5) * 0.5,
      point.y + Math.random() * 0.15,
      point.z + (Math.random() - 0.5) * 0.5,
    )
    const s = 0.7 + Math.random() * 0.4
    puff.mesh.scale.set(s, s, s)
    puff.mesh.rotation.y = Math.random() * Math.PI
  }

  /** Tire screech gain 0..1 for the current drift (0 = silent). */
  setDriftScreech(intensity: number): void {
    this.audio.setScreech(intensity)
  }

  /**
   * Tick active spark particles.
   */
  update(dt: number): void {
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i]!
      s.life += dt

      if (s.life >= s.maxLife) {
        this.scene.remove(s.mesh)
        s.mesh.geometry.dispose()
        this.sparks.splice(i, 1)
        continue
      }

      // Gravity & air drag
      s.velocity.y -= 22 * dt
      s.velocity.x *= 0.96
      s.velocity.z *= 0.96

      s.mesh.position.addScaledVector(s.velocity, dt)

      // Bounce on ground
      if (s.mesh.position.y < 0.04) {
        s.mesh.position.y = 0.04
        s.velocity.y = -s.velocity.y * 0.45
      }

      // Look along velocity direction
      if (s.velocity.lengthSq() > 0.01) {
        s.mesh.quaternion.setFromUnitVectors(
          new THREE.Vector3(0, 0, 1),
          s.velocity.clone().normalize(),
        )
      }

      // Fade out
      const progress = s.life / s.maxLife
      const mat = s.mesh.material as THREE.MeshBasicMaterial
      mat.opacity = 1.0 - progress
    }

    // Drift smoke: rise, expand, fade
    for (const p of this.smokePuffs) {
      if (p.life >= p.maxLife) {
        p.mesh.visible = false
        continue
      }
      p.life += dt
      const t = Math.min(1, p.life / p.maxLife)
      p.mesh.position.y += dt * 1.1
      const grow = 1 + t * 2.6
      p.mesh.scale.set(grow, grow, grow)
      ;(p.mesh.material as THREE.MeshBasicMaterial).opacity = 0.55 * (1 - t)
    }
  }

  playShieldActivated(): void {
    this.audio.playShieldActivated()
  }

  playShieldWarning(): void {
    this.audio.playShieldWarning()
  }

  playShieldDeactivated(): void {
    this.audio.playShieldDeactivated()
  }

  dispose(): void {
    for (const s of this.sparks) {
      this.scene.remove(s.mesh)
      s.mesh.geometry.dispose()
    }
    this.sparks = []
    for (const p of this.smokePuffs) {
      this.scene.remove(p.mesh)
      ;(p.mesh.material as THREE.MeshBasicMaterial).dispose()
    }
    this.smokePuffs = []
    this.audio.setScreech(0)
    if (this.flashEl && this.flashEl.parentNode) {
      this.flashEl.parentNode.removeChild(this.flashEl)
    }
  }
}
