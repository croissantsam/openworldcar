/**
 * PorscheModel — stylized 911-inspired coupe, fully procedural (no assets).
 * Ported from /Users/idovmamane/samgame/porsche-threejs/car.js.
 *
 * Conventions of the model (kept as in the source): metres, Y up, nose toward
 * -Z, ground level at y = 0. Each wheel is a Group whose origin is its hub;
 * rolling is rotation about the wheel's local X axis.
 */

import * as THREE from 'three'

export type PorscheCar = {
  group: THREE.Group
  /** Front left, front right, rear left, rear right (model frame). */
  wheels: THREE.Group[]
  setColor(value: THREE.ColorRepresentation): void
  dispose(): void
  /**
   * Exposed by FerrariModel for the real-time env-probe.
   * Optional so PorscheModel doesn't need to implement it.
   */
  _paint?: THREE.MeshPhysicalMaterial
  _glass?: THREE.MeshPhysicalMaterial
}

/** Tire outer radius (m): torus 0.281 + tube 0.082. */
export const PORSCHE_WHEEL_RADIUS = 0.363
/** Hub height above the model's ground plane (m). */
export const PORSCHE_HUB_HEIGHT = 0.365

type Vec3 = [number, number, number]

export function createPorsche({ color = '#d9e2df' }: { color?: THREE.ColorRepresentation } = {}): PorscheCar {
  const car = new THREE.Group()
  car.name = 'Porsche-inspired coupe'

  const paint = new THREE.MeshPhysicalMaterial({ color, metalness: 0.72, roughness: 0.24, clearcoat: 1, clearcoatRoughness: 0.12, side: THREE.DoubleSide })
  const glass = new THREE.MeshPhysicalMaterial({ color: '#152b35', metalness: 0.48, roughness: 0.12, clearcoat: 1, side: THREE.DoubleSide })
  const rubber = new THREE.MeshStandardMaterial({ color: '#151619', roughness: 0.88 })
  const dark = new THREE.MeshStandardMaterial({ color: '#11171a', roughness: 0.4 })
  const alloy = new THREE.MeshStandardMaterial({ color: '#b9bec3', metalness: 0.95, roughness: 0.23 })
  const red = new THREE.MeshStandardMaterial({ color: '#ff1735', emissive: '#ff0620', emissiveIntensity: 2 })
  const lamp = new THREE.MeshStandardMaterial({ color: '#efffff', emissive: '#b8eaff', emissiveIntensity: 3 })
  const caliperMat = new THREE.MeshStandardMaterial({ color: '#e62c28' })

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
    [-2.22, 0.56, 0.48, 0.58], [-2.12, 0.80, 0.56, 0.66], [-1.82, 0.89, 0.74, 0.71], [-1.35, 0.93, 0.91, 0.78],
    [-0.88, 0.88, 0.85, 0.84], [-0.35, 0.85, 0.80, 0.86], [0.40, 0.89, 0.83, 0.88], [1.30, 0.98, 0.95, 0.87],
    [1.75, 0.96, 0.81, 0.79], [2.10, 0.85, 0.63, 0.69], [2.22, 0.64, 0.53, 0.60],
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
    const z = -2.22 + (4.44 * j) / nz
    const w = interp(z, 1)
    const h = interp(z, 2)
    const top = interp(z, 3)
    let lower = 0.27
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

  // Glazed cabin follows a continuous fastback profile. [z, half width, height]
  const cabin: Vec3[] = [[-0.88, 0.72, 0.84], [-0.52, 0.64, 1.18], [-0.12, 0.59, 1.39], [0.45, 0.59, 1.41], [0.87, 0.66, 1.27], [1.31, 0.76, 0.97], [1.53, 0.80, 0.86]]
  function cabinSurface(start: number, end: number, mat: THREE.Material, name: string): void {
    const verts: number[] = []
    const ids: number[] = []
    for (let j = start; j <= end; j++) {
      const [z, w, h] = cabin[j]!
      for (let i = 0; i <= 32; i++) {
        const t = -Math.PI / 2 + (Math.PI * i) / 32
        verts.push(w * Math.sin(t), 0.83 + (h - 0.83) * Math.pow(Math.cos(t), 0.55), z)
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
      roofPts.push(w * Math.sin(t), 0.838 + (h - 0.83) * Math.pow(Math.cos(t), 0.55), z)
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
      pts.push([w * Math.sin(t), 0.84 + (h - 0.83) * Math.pow(Math.cos(t), 0.55), z])
    }
    line(pts, paint, j === 3 ? 0.024 : 0.018, 'Window surround')
  }
  for (const s of [-1, 1]) {
    line(cabin.map(([z, w]) => [s * w, 0.845, z] as Vec3), paint, 0.022, 'Window sill')
    line([[s * 0.59, 1.29, 0.40], [s * 0.69, 0.85, 0.45]], dark, 0.023, 'B pillar')
    line([[s * 0.864, 0.76, -0.66], [s * 0.881, 0.43, -0.58], [s * 0.89, 0.38, 0.63], [s * 0.928, 0.73, 0.83]], dark, 0.005, 'Door shut line')
    box([0.022, 0.035, 0.16], [s * 0.884, 0.765, 0.53], alloy, 'Door handle')
    line([[s * 0.74, 0.94, -0.53], [s * 0.99, 0.98, -0.51]], dark, 0.025, 'Mirror stem')
    ellipsoid([0.14, 0.065, 0.10], [s * 1.015, 1, -0.52], paint, 'Side mirror')
    // Headlights tilt skyward on the raised front fenders.
    const bezel = ellipsoid([0.19, 0.07, 0.265], [s * 0.64, 0.753, -1.78], dark, 'Headlight housing')
    bezel.rotation.x = 0.25
    const lens = ellipsoid([0.155, 0.047, 0.225], [s * 0.64, 0.79, -1.79], lamp, 'Oval headlight')
    lens.rotation.x = 0.25
    for (const dx of [-0.053, 0.053]) box([0.018, 0.018, 0.12], [s * 0.64 + dx, 0.831, -1.79], alloy, 'Headlight detail')
    box([0.44, 0.10, 0.055], [s * 0.57, 0.43, -2.115], dark, 'Front air intake')
    box([0.48, 0.035, 0.055], [s * 0.53, 0.62, 2.115], red, 'Rear light')
    const exhaust = mesh(new THREE.CylinderGeometry(0.067, 0.067, 0.16, 24), alloy, 'Exhaust', [s * 0.60, 0.30, 2.15])
    exhaust.rotation.x = Math.PI / 2
    mesh(new THREE.CircleGeometry(0.052, 24), dark, 'Exhaust bore', [s * 0.60, 0.30, 2.236])
  }
  box([1.2, 0.10, 0.06], [0, 0.37, -2.17], dark, 'Centre intake')
  box([1.58, 0.035, 0.035], [0, 0.62, 2.15], red, 'Rear light bar')
  box([1.55, 0.035, 0.21], [0, 0.82, 1.91], paint, 'Rear lip spoiler')
  for (let i = 0; i < 9; i++) box([0.57, 0.012, 0.021], [0, 0.91 - i * 0.011, 1.41 + i * 0.043], dark, 'Engine grille')

  const wheels: THREE.Group[] = []
  for (const z of [-1.34, 1.34]) {
    for (const s of [-1, 1]) {
      const wheel = new THREE.Group()
      wheel.name = `${z < 0 ? 'Front' : 'Rear'} ${s < 0 ? 'left' : 'right'} wheel`
      wheel.position.set(s * 0.895, PORSCHE_HUB_HEIGHT, z)
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
