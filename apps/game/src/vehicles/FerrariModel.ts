/**
 * FerrariModel — stylized Ferrari-inspired mid-engine coupe, fully procedural
 * (no assets). Ported from /Users/idovmamane/samgame/ferrari-threejs/car.js.
 *
 * Model conventions (unchanged): metres, Y up, nose toward -Z, ground at
 * y = 0. Each wheel is a Group whose origin is its hub; rolling is rotation
 * about the wheel's local X axis. Same interface as PorscheModel.
 */

import * as THREE from 'three'
import type { PorscheCar } from './PorscheModel.js'

export type FerrariCar = PorscheCar

/** Tire outer radius (m): torus 0.281 + tube 0.082. */
export const FERRARI_WHEEL_RADIUS = 0.363
/** Hub height above the model's ground plane (m). */
export const FERRARI_HUB_HEIGHT = 0.365

type Vec3 = [number, number, number]

export function createFerrari({ color = '#e21b24' }: { color?: THREE.ColorRepresentation } = {}): FerrariCar {
  const car = new THREE.Group()
  car.name = 'Ferrari-inspired coupe'

  // Paint — MeshPhysicalMaterial with clearcoat lacquer + iridescence pearl
  const paint = new THREE.MeshPhysicalMaterial({
    color,
    metalness: 0.55,
    roughness: 0.18,
    clearcoat: 1.0,
    clearcoatRoughness: 0.08,
    iridescence: 0.30,           // subtle pearl shift on body highlights
    iridescenceIOR: 1.5,
    iridescenceThicknessRange: [100, 400],
    reflectivity: 0.5,
    side: THREE.DoubleSide,
  })
  // Windshield / windows — glossy tinted glass with clearcoat reflection
  const glass = new THREE.MeshPhysicalMaterial({
    color: '#08141c',
    metalness: 0.1,
    roughness: 0.05,
    clearcoat: 1.0,
    clearcoatRoughness: 0.05,
    transparent: true,
    opacity: 0.85,
    side: THREE.DoubleSide,
  })
  const rubber = new THREE.MeshStandardMaterial({ color: '#151619', roughness: 0.88 })
  const dark   = new THREE.MeshStandardMaterial({ color: '#11171a', roughness: 0.4 })
  // Alloy wheels — anisotropic brushed metal (directional specular highlights)
  const alloy = new THREE.MeshPhysicalMaterial({
    color: '#b9bec3',
    metalness: 0.98,
    roughness: 0.18,
    anisotropy: 0.85,            // radial brushing highlights on spokes
    anisotropyRotation: 0,
  })
  const red     = new THREE.MeshStandardMaterial({ color: '#ff1735', emissive: '#ff0620', emissiveIntensity: 2.5 })
  const lamp    = new THREE.MeshStandardMaterial({
    color: '#efffff',
    emissive: '#b8eaff',
    emissiveIntensity: 3.5,      // bloom will pick this up cleanly
    roughness: 0.08,
    metalness: 0.1,
  })
  const caliperMat = new THREE.MeshStandardMaterial({ color: '#f4c52c', metalness: 0.4, roughness: 0.35 })
  const intakeMaterial = dark.clone()
  intakeMaterial.side = THREE.DoubleSide

  function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, name: string, pos: Vec3 = [0, 0, 0], parent: THREE.Object3D = car): THREE.Mesh {
    const m = new THREE.Mesh(geo, mat)
    m.name = name
    m.position.set(pos[0], pos[1], pos[2])
    m.castShadow = true
    m.receiveShadow = true
    parent.add(m)
    return m
  }
  function box(size: Vec3, pos: Vec3, mat: THREE.Material, name: string, parent?: THREE.Object3D): THREE.Mesh {
    return mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), mat, name, pos, parent)
  }
  function ellipsoid(size: Vec3, pos: Vec3, mat: THREE.Material, name: string): THREE.Mesh {
    const m = mesh(new THREE.SphereGeometry(1, 40, 24), mat, name, pos)
    m.scale.set(size[0], size[1], size[2])
    return m
  }
  function line(points: Vec3[], material: THREE.Material, radius = 0.009, name = 'Trim'): THREE.Mesh {
    const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(p[0], p[1], p[2])))
    return mesh(new THREE.TubeGeometry(curve, 48, radius, 6, false), material, name)
  }

  // Smooth sampled loft; wheel clearances are cut into the lower side boundary.
  // [z, half width, shoulder, centre height]
  const stations: [number, number, number, number][] = [
    [-2.35, 0.64, 0.38, 0.43], [-2.23, 0.88, 0.48, 0.51], [-1.92, 0.93, 0.67, 0.58], [-1.34, 0.96, 0.91, 0.66],
    [-0.88, 0.91, 0.79, 0.74], [-0.35, 0.86, 0.75, 0.77], [0.40, 0.88, 0.79, 0.79], [1.34, 1.02, 0.94, 0.82],
    [1.85, 1.01, 0.83, 0.80], [2.23, 0.95, 0.73, 0.76], [2.35, 0.86, 0.67, 0.69],
  ]
  function interp(z: number, k: 1 | 2 | 3): number {
    let i = 0
    while (i < stations.length - 2 && stations[i + 1]![0] < z) i++
    const a = stations[i]!
    const b = stations[i + 1]!
    const t = THREE.MathUtils.smoothstep(z, a[0], b[0])
    return THREE.MathUtils.lerp(a[k], b[k], t)
  }
  const p: number[] = []
  const indices: number[] = []
  const nz = 180
  const nx = 48
  for (let j = 0; j <= nz; j++) {
    const z = -2.35 + (4.70 * j) / nz
    const w = interp(z, 1)
    const h = interp(z, 2)
    const top = interp(z, 3)
    let lower = 0.23
    for (const wz of [-1.34, 1.34]) {
      const d = z - wz
      if (Math.abs(d) < 0.415) lower = Math.max(lower, 0.365 + Math.sqrt(0.415 ** 2 - d * d))
    }
    for (let i = 0; i <= nx; i++) {
      const t = -Math.PI / 2 + (Math.PI * i) / nx
      const s = Math.abs(Math.sin(t))
      const y = top + (h - top) * Math.pow(s, 3) - (h - lower) * Math.pow(s, 18)
      p.push(w * Math.sin(t), y, z)
      if (j < nz && i < nx) {
        const a = j * (nx + 1) + i
        const b = a + nx + 1
        indices.push(a, b, a + 1, b, b + 1, a + 1)
      }
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  mesh(geo, paint, 'Sculpted body')
  box([1.5, 0.12, 3.45], [0, 0.25, 0], dark, 'Undertray')

  // Compact forward cabin leaves a long mid-engine rear deck. [z, half width, height]
  const cabin: Vec3[] = [[-1.01, 0.71, 0.78], [-0.68, 0.62, 1.10], [-0.36, 0.56, 1.25], [0.23, 0.56, 1.26], [0.52, 0.59, 1.15], [0.77, 0.64, 0.91], [0.91, 0.68, 0.80]]
  function cabinSurface(start: number, end: number, mat: THREE.Material, name: string): void {
    const verts: number[] = []
    const ids: number[] = []
    for (let j = start; j <= end; j++) {
      const [z, w, h] = cabin[j]!
      for (let i = 0; i <= 32; i++) {
        const t = -Math.PI / 2 + (Math.PI * i) / 32
        verts.push(w * Math.sin(t), 0.77 + (h - 0.77) * Math.pow(Math.cos(t), 0.55), z)
      }
    }
    for (let j = 0; j < end - start; j++) {
      for (let i = 0; i < 32; i++) {
        const a = j * 33 + i
        const b = a + 33
        ids.push(a, b, a + 1, b, b + 1, a + 1)
      }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
    g.setIndex(ids)
    g.computeVertexNormals()
    mesh(g, mat, name)
  }
  cabinSurface(0, 6, glass, 'Glazed cabin')

  // Painted roof centre, leaving side windows visible.
  const roofPts: number[] = []
  const roofIdx: number[] = []
  for (let j = 2; j <= 3; j++) {
    const [z, w, h] = cabin[j]!
    for (let i = 0; i <= 24; i++) {
      const t = -0.91 + (1.82 * i) / 24
      roofPts.push(w * Math.sin(t), 0.778 + (h - 0.77) * Math.pow(Math.cos(t), 0.55), z)
    }
  }
  for (let i = 0; i < 24; i++) roofIdx.push(i, i + 25, i + 1, i + 25, i + 26, i + 1)
  const rg = new THREE.BufferGeometry()
  rg.setAttribute('position', new THREE.Float32BufferAttribute(roofPts, 3))
  rg.setIndex(roofIdx)
  rg.computeVertexNormals()
  mesh(rg, paint, 'Roof')
  for (const j of [0, 2, 3, 6]) {
    const [z, w, h] = cabin[j]!
    const pts: Vec3[] = []
    for (let i = 0; i <= 24; i++) {
      const t = -Math.PI / 2 + (Math.PI * i) / 24
      pts.push([w * Math.sin(t), 0.78 + (h - 0.77) * Math.pow(Math.cos(t), 0.55), z])
    }
    line(pts, paint, j === 3 ? 0.024 : 0.018, 'Window surround')
  }
  for (const s of [-1, 1]) {
    line(cabin.map(([z, w]) => [s * w, 0.785, z] as Vec3), paint, 0.022, 'Window sill')
    line([[s * 0.56, 1.17, 0.23], [s * 0.65, 0.79, 0.32]], dark, 0.025, 'B pillar')
    line([[s * 0.873, 0.69, -0.77], [s * 0.858, 0.38, -0.61], [s * 0.865, 0.32, 0.39], [s * 0.89, 0.73, 0.49]], dark, 0.005, 'Door shut line')
    box([0.022, 0.026, 0.12], [s * 0.87, 0.705, 0.24], dark, 'Flush door handle')
    line([[s * 0.71, 0.89, -0.65], [s * 1.02, 0.95, -0.69]], dark, 0.022, 'Mirror stem')
    ellipsoid([0.135, 0.047, 0.09], [s * 1.055, 0.965, -0.69], paint, 'Side mirror')
    // Narrow, swept headlights on the front shoulders.
    const housing = ellipsoid([0.095, 0.031, 0.29], [s * 0.72, 0.658, -1.91], dark, 'Swept headlight housing')
    housing.rotation.set(0.21, s * 0.22, 0)
    line([[s * 0.78, 0.718, -1.66], [s * 0.745, 0.693, -1.85], [s * 0.68, 0.628, -2.14]], lamp, 0.015, 'LED headlight blade')
    line([[s * 0.75, 0.712, -1.69], [s * 0.715, 0.687, -1.87], [s * 0.66, 0.628, -2.10]], lamp, 0.009, 'LED headlight accent')
    box([0.46, 0.15, 0.09], [s * 0.57, 0.35, -2.245], dark, 'Front air intake')
    const splitter = box([0.61, 0.032, 0.27], [s * 0.59, 0.242, -2.22], dark, 'Front splitter')
    splitter.rotation.y = s * 0.09
    // Recess-like dark intake panel, framed by sculpted painted lips.
    const intakePoints: Vec3[] = [
      [s * 0.889, 0.745, 0.42], [s * 0.952, 0.80, 0.84], [s * 0.962, 0.53, 0.91], [s * 0.889, 0.39, 0.56],
    ]
    const ig = new THREE.BufferGeometry()
    ig.setAttribute('position', new THREE.Float32BufferAttribute(intakePoints.flat(), 3))
    ig.setIndex([0, 1, 2, 0, 2, 3])
    ig.computeVertexNormals()
    mesh(ig, intakeMaterial, 'Side cooling intake')
    line([intakePoints[0]!, [s * 0.923, 0.80, 0.64], intakePoints[1]!], paint, 0.022, 'Intake upper lip')
    line([intakePoints[3]!, [s * 0.932, 0.48, 0.76], intakePoints[2]!], paint, 0.024, 'Intake lower lip')
    line([[s * 0.90, 0.61, 0.55], [s * 0.945, 0.66, 0.84]], dark, 0.021, 'Intake vane')
    line([[s * 0.90, 0.26, -0.91], [s * 0.88, 0.245, 0], [s * 0.98, 0.27, 0.94]], dark, 0.038, 'Side skirt')
    // Flying buttresses flank the engine cover behind the cabin.
    line([[s * 0.44, 1.19, 0.35], [s * 0.59, 1.04, 0.74], [s * 0.77, 0.89, 1.22], [s * 0.86, 0.83, 1.64]], paint, 0.058, 'Rear buttress')
    for (const x of [0.56, 0.78]) {
      mesh(new THREE.TorusGeometry(0.080, 0.016, 10, 32), red, 'Round rear lamp', [s * x, 0.68, 2.30])
      mesh(new THREE.CircleGeometry(0.061, 32), dark, 'Rear lamp centre', [s * x, 0.68, 2.306])
    }
    const exhaust = mesh(new THREE.CylinderGeometry(0.071, 0.071, 0.18, 24), alloy, 'Exhaust', [s * 0.31, 0.40, 2.32])
    exhaust.rotation.x = Math.PI / 2
    mesh(new THREE.CircleGeometry(0.055, 24), dark, 'Exhaust bore', [s * 0.31, 0.40, 2.416])
  }
  box([0.44, 0.11, 0.09], [0, 0.34, -2.33], dark, 'Centre intake')
  box([1.68, 0.16, 0.07], [0, 0.49, 2.30], dark, 'Rear grille')
  box([1.82, 0.032, 0.17], [0, 0.79, 2.15], paint, 'Integrated rear lip')
  box([1.58, 0.065, 0.47], [0, 0.23, 2.10], dark, 'Rear diffuser')
  for (let i = -3; i <= 3; i++) box([0.025, 0.13, 0.40], [i * 0.20, 0.25, 2.12], dark, 'Diffuser fin')
  // Engine window and visible red plenums beneath a smoked glass canopy.
  box([0.92, 0.027, 0.91], [0, 0.853, 1.38], glass, 'Engine cover')
  for (const x of [-0.22, 0.22]) {
    box([0.23, 0.065, 0.59], [x, 0.834, 1.38], paint, 'Engine plenum')
    for (let i = 0; i < 5; i++) box([0.20, 0.012, 0.018], [x, 0.873, 1.17 + i * 0.10], alloy, 'Engine rib')
  }
  for (const x of [-0.57, 0.57]) {
    for (let i = 0; i < 7; i++) box([0.11, 0.024, 0.034], [x, 0.857, 1.11 + i * 0.10], dark, 'Rear deck cooling louvre')
  }

  const wheels: THREE.Group[] = []
  for (const z of [-1.34, 1.34]) {
    for (const s of [-1, 1]) {
      const wheel = new THREE.Group()
      wheel.name = `${z < 0 ? 'Front' : 'Rear'} ${s < 0 ? 'left' : 'right'} wheel`
      wheel.position.set(s * (z > 0 ? 0.98 : 0.92), FERRARI_HUB_HEIGHT, z)
      car.add(wheel)
      wheels.push(wheel)
      const tire = mesh(new THREE.TorusGeometry(0.281, 0.082, 16, 64), rubber, 'Tire', [0, 0, 0], wheel)
      tire.rotation.y = Math.PI / 2
      const rim = mesh(new THREE.CylinderGeometry(0.247, 0.247, 0.14, 48), alloy, 'Rim', [0, 0, 0], wheel)
      rim.rotation.z = Math.PI / 2
      const face = mesh(new THREE.CircleGeometry(0.219, 48), dark, 'Wheel inset', [s * 0.074, 0, 0], wheel)
      face.rotation.y = s * Math.PI / 2
      const disc = mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.01, 40), alloy, 'Brake disc', [s * 0.08, 0, 0], wheel)
      disc.rotation.z = Math.PI / 2
      box([0.055, 0.17, 0.06], [s * 0.093, 0.015, 0.145], caliperMat, 'Brake caliper', wheel)
      for (let i = 0; i < 5; i++) {
        const a = (i * Math.PI * 2) / 5
        const spoke = box([0.035, 0.19, 0.036], [s * 0.102, Math.cos(a) * 0.115, Math.sin(a) * 0.115], alloy, 'Alloy spoke', wheel)
        spoke.rotation.x = a
      }
      const hub = mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.035, 24), alloy, 'Hub', [s * 0.11, 0, 0], wheel)
      hub.rotation.z = Math.PI / 2
    }
  }
  car.userData['wheels'] = wheels.map((w) => w.name)

  return {
    group: car,
    wheels,
    /** Expose paint for the env probe to set envMap. */
    _paint: paint,
    /** Expose glass for the env probe to set envMap. */
    _glass: glass,
    setColor(value: THREE.ColorRepresentation): void {
      paint.color.set(value)
    },
    dispose(): void {
      const gs = new Set<THREE.BufferGeometry>()
      const ms = new Set<THREE.Material>()
      car.traverse((o) => {
        const m = o as THREE.Mesh
        if (m.isMesh) {
          gs.add(m.geometry)
          for (const mat of Array.isArray(m.material) ? m.material : [m.material]) ms.add(mat)
        }
      })
      gs.forEach((g) => g.dispose())
      ms.forEach((m) => m.dispose())
    },
  }
}

// ── Real-time environment probe ───────────────────────────────────────────────
//
// Creates a WebGLCubeRenderTarget + CubeCamera that can be positioned at the
// car's centre.  Update every ~6 frames (not every frame) to keep cost < 0.5ms.
//
// Usage (GameEngine or PlayerCar):
//   const probe = createFerrariEnvProbe(renderer, ferrari)
//   // in render loop (every 6 frames):
//   probe.update(renderer, scene)
//   // on dispose:
//   probe.dispose()
// ─────────────────────────────────────────────────────────────────────────────

export type FerrariEnvProbe = {
  cubeCamera?: THREE.CubeCamera
  update(renderer: THREE.WebGLRenderer, scene: THREE.Scene): void
  dispose(): void
}

export function createFerrariEnvProbe(
  _renderer: THREE.WebGLRenderer,
  _car: FerrariCar & { _paint?: THREE.MeshPhysicalMaterial; _glass?: THREE.MeshPhysicalMaterial },
): FerrariEnvProbe {
  // Reflections are now provided globally with 0 extra draw calls via scene.environment (SkyEnvironment PMREM),
  // completely eliminating the 6-pass CubeCamera re-render that caused massive frame drops.
  return {
    update(): void {},
    dispose(): void {},
  }
}
