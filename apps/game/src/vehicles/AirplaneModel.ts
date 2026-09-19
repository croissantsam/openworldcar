/**
 * AirplaneModel — "Alizé", a fictional two-seat leisure aircraft.
 *
 * Faithful TypeScript port of avion-biplace-threejs/airplane.js (same parts,
 * materials, names and API). Metres, Y up, nose toward -Z, wheels on the
 * ground at y = 0.
 */

import * as THREE from 'three'

// ─── Useful dimensions (model frame: nose toward -Z, ground at y = 0) ────────

/** Main wheels: contact under the axle at z = +0.13, x = ±1.03. */
export const AIRPLANE_MAIN_WHEEL_Z = 0.13
export const AIRPLANE_MAIN_WHEEL_X = 1.03
export const AIRPLANE_MAIN_WHEEL_RADIUS = 0.215
/** Nose wheel: contact under the axle at z = -2.05. */
export const AIRPLANE_NOSE_WHEEL_Z = -2.05
export const AIRPLANE_NOSE_WHEEL_RADIUS = 0.175
/** Wheel base (nose wheel ↔ main axle), metres. */
export const AIRPLANE_WHEEL_BASE = AIRPLANE_MAIN_WHEEL_Z - AIRPLANE_NOSE_WHEEL_Z
/** Wing span (tip to tip, navigation lights included). */
export const AIRPLANE_WING_SPAN = 9.52
/** Wingtip (saumon) lateral position and height. */
export const AIRPLANE_WINGTIP_X = 4.7
export const AIRPLANE_WINGTIP_Y = 1.33
/** Overall length (spinner tip → rudder), height (fin top). */
export const AIRPLANE_LENGTH = 7.1
export const AIRPLANE_HEIGHT = 2.7
/** Propeller hub position and disc radius (blade tip). */
export const AIRPLANE_PROPELLER_POSITION: Readonly<[number, number, number]> = [0, 1.22, -3.0]
export const AIRPLANE_PROPELLER_RADIUS = 1.01
/** Fuselage centre line height. */
export const AIRPLANE_FUSELAGE_Y = 1.22

export const AIRPLANE_WHEELS = {
  mainZ: AIRPLANE_MAIN_WHEEL_Z,
  mainX: AIRPLANE_MAIN_WHEEL_X,
  mainRadius: AIRPLANE_MAIN_WHEEL_RADIUS,
  noseZ: AIRPLANE_NOSE_WHEEL_Z,
  noseRadius: AIRPLANE_NOSE_WHEEL_RADIUS,
  base: AIRPLANE_WHEEL_BASE,
} as const

export type TwoSeatAirplaneOptions = {
  color?: THREE.ColorRepresentation
  accent?: THREE.ColorRepresentation
  scale?: number
}

export type TwoSeatAirplane = {
  group: THREE.Group
  propeller: THREE.Group
  setColor(value: THREE.ColorRepresentation): void
  setAccent(value: THREE.ColorRepresentation): void
  /** Spin the propeller: deltaSeconds ≥ 0, rpm = visual revolutions per minute. */
  update(deltaSeconds: number, rpm?: number): void
  dispose(): void
}

type Vec3 = [number, number, number]
/** [z, half width, half height, centre height] */
type Station = [number, number, number, number]
/** [span, leading edge z, chord, height, thickness] */
type WingSection = [number, number, number, number, number]

/** Biplace de loisir fictif. Mètres, Y vertical, nez vers -Z. */
export function createTwoSeatAirplane({
  color = '#eee9df',
  accent = '#174b50',
  scale = 1,
}: TwoSeatAirplaneOptions = {}): TwoSeatAirplane {
  if (!Number.isFinite(scale) || scale <= 0) throw new Error('Échelle invalide.')
  const group = new THREE.Group()
  group.name = 'Alizé — avion biplace'
  group.scale.setScalar(scale)

  const paint = new THREE.MeshPhysicalMaterial({ color, metalness: 0.28, roughness: 0.27, clearcoat: 1, side: THREE.DoubleSide })
  const trim = new THREE.MeshPhysicalMaterial({ color: accent, metalness: 0.48, roughness: 0.28, clearcoat: 1, side: THREE.DoubleSide })
  const brass = new THREE.MeshStandardMaterial({ color: '#b7925c', metalness: 0.75, roughness: 0.3 })
  const dark = new THREE.MeshStandardMaterial({ color: '#20272a', roughness: 0.6 })
  const rubber = new THREE.MeshStandardMaterial({ color: '#131718', roughness: 0.9 })
  const leather = new THREE.MeshStandardMaterial({ color: '#9c6445', roughness: 0.8 })
  const metal = new THREE.MeshStandardMaterial({ color: '#aab6b8', metalness: 0.85, roughness: 0.25 })
  const glass = new THREE.MeshPhysicalMaterial({
    color: '#99c4cc',
    transparent: true,
    opacity: 0.25,
    metalness: 0,
    roughness: 0.08,
    clearcoat: 1,
    side: THREE.DoubleSide,
    depthWrite: false,
  })

  function mesh(g: THREE.BufferGeometry, m: THREE.Material, name: string, pos: Vec3 = [0, 0, 0], parent: THREE.Object3D = group): THREE.Mesh {
    const o = new THREE.Mesh(g, m)
    o.name = name
    o.position.set(pos[0], pos[1], pos[2])
    o.castShadow = m !== glass
    o.receiveShadow = true
    parent.add(o)
    return o
  }
  function box(size: Vec3, pos: Vec3, mat: THREE.Material, name: string, parent?: THREE.Object3D): THREE.Mesh {
    return mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), mat, name, pos, parent)
  }
  function oval(size: Vec3, pos: Vec3, mat: THREE.Material, name: string, parent?: THREE.Object3D): THREE.Mesh {
    const o = mesh(new THREE.SphereGeometry(1, 32, 20), mat, name, pos, parent)
    o.scale.set(size[0], size[1], size[2])
    return o
  }
  function beam(a: Vec3, b: Vec3, r: number, mat: THREE.Material, name: string): THREE.Mesh {
    const v = new THREE.Vector3(a[0], a[1], a[2])
    const w = new THREE.Vector3(b[0], b[1], b[2])
    const d = w.clone().sub(v)
    const mid = v.add(w).multiplyScalar(0.5)
    const o = mesh(new THREE.CylinderGeometry(r, r, d.length(), 10), mat, name, [mid.x, mid.y, mid.z])
    o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize())
    return o
  }
  function line(points: Vec3[], r: number, mat: THREE.Material, name: string): THREE.Mesh {
    const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(p[0], p[1], p[2])))
    return mesh(new THREE.TubeGeometry(curve, 64, r, 8, false), mat, name)
  }

  // ── Fuselage: lofted rings through the stations ────────────────────────────
  const stations: Station[] = [
    [-2.94, 0.23, 0.24, 1.22], [-2.65, 0.37, 0.34, 1.22], [-2.05, 0.47, 0.42, 1.22],
    [-1.2, 0.57, 0.47, 1.24], [-0.4, 0.61, 0.48, 1.23], [0.45, 0.56, 0.43, 1.22],
    [1.15, 0.43, 0.34, 1.21], [2, 0.28, 0.24, 1.2], [2.85, 0.16, 0.16, 1.21],
    [3.48, 0.06, 0.095, 1.23], [3.63, 0.005, 0.015, 1.23],
  ]
  function at(z: number, k: 1 | 2 | 3): number {
    let i = 0
    while (i < stations.length - 2 && stations[i + 1]![0] < z) i++
    const a = stations[i]!
    const b = stations[i + 1]!
    const t = THREE.MathUtils.smoothstep(z, a[0], b[0])
    return THREE.MathUtils.lerp(a[k], b[k], t)
  }
  const vertices: number[] = []
  const ids: number[] = []
  const rings = 170
  const slices = 64
  for (let j = 0; j <= rings; j++) {
    const z = -2.94 + (6.57 * j) / rings
    for (let i = 0; i <= slices; i++) {
      const t = (2 * Math.PI * i) / slices
      vertices.push(at(z, 1) * Math.cos(t), at(z, 3) + at(z, 2) * Math.sin(t), z)
    }
  }
  for (let j = 0; j < rings; j++) {
    for (let i = 0; i < slices; i++) {
      const z = -2.94 + (6.57 * (j + 0.5)) / rings
      const t = (2 * Math.PI * (i + 0.5)) / slices
      // Ouverture réelle au-dessus des deux sièges, sous la verrière.
      if (z > -0.95 && z < 0.87 && Math.sin(t) > 0.43) continue
      const a = j * (slices + 1) + i
      const b = a + slices + 1
      ids.push(a, a + 1, b, b, a + 1, b + 1)
    }
  }
  const body = new THREE.BufferGeometry()
  body.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  body.setIndex(ids)
  body.computeVertexNormals()
  mesh(body, paint, 'Fuselage profilé')

  // Sections fermées d’ailes à profil symétrique, effilées vers les saumons.
  function wing(sections: WingSection[], side: number, mat: THREE.Material, name: string, vertical = false): THREE.Mesh {
    const points: number[] = []
    const indices: number[] = []
    const n = 48
    for (const [span, lead, chord, height, thickness] of sections) {
      for (let i = 0; i < n; i++) {
        const t = (i / n) * Math.PI * 2
        const u = (1 - Math.cos(t)) / 2
        const foil =
          5 * thickness *
          (0.2969 * Math.sqrt(u) - 0.126 * u - 0.3516 * u * u + 0.2843 * u * u * u - 0.1036 * u * u * u * u) *
          Math.sign(Math.sin(t))
        const x = side * span
        const y = height + foil * chord
        const z = lead + u * chord
        if (vertical) points.push(foil * chord, span + height, z)
        else points.push(x, y, z)
      }
    }
    for (let j = 0; j < sections.length - 1; j++) {
      for (let i = 0; i < n; i++) {
        const a = j * n + i
        const b = j * n + ((i + 1) % n)
        indices.push(a, b, a + n, b, b + n, a + n)
      }
    }
    // Fermeture des deux extrémités.
    for (const j of [0, sections.length - 1]) {
      const base = j * n
      for (let i = 1; i < n - 1; i++) indices.push(base, base + i, base + i + 1)
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(points, 3))
    geo.setIndex(indices)
    geo.computeVertexNormals()
    return mesh(geo, mat, name)
  }

  for (const s of [-1, 1]) {
    wing([[0.43, -0.7, 1.88, 1.03, 0.13], [1.1, -0.68, 1.8, 1.06, 0.12], [3.75, -0.22, 1.12, 1.22, 0.11], [4.48, 0.09, 0.76, 1.29, 0.1], [4.7, 0.3, 0.4, 1.33, 0.1]], s, paint, 'Aile basse')
    wing([[4.49, 0.09, 0.76, 1.294, 0.1], [4.7, 0.3, 0.4, 1.334, 0.1], [4.76, 0.46, 0.12, 1.35, 0.1]], s, trim, 'Saumon contrasté')
    line([[s * 1.05, 1.08, 0.92], [s * 2.6, 1.16, 0.79], [s * 4.3, 1.3, 0.68]], 0.007, dark, 'Joint des ailerons')
    wing([[0.12, 2.32, 1.03, 1.28, 0.1], [1.2, 2.62, 0.75, 1.31, 0.09], [1.61, 2.88, 0.39, 1.35, 0.08]], s, paint, 'Empennage horizontal')
    wing([[1.35, 2.72, 0.61, 1.33, 0.09], [1.61, 2.88, 0.39, 1.35, 0.08], [1.68, 3.05, 0.14, 1.36, 0.08]], s, trim, 'Saumon de stabilisateur')
    // Filet longitudinal bicolore, posé sur les flancs.
    const livery: Array<[number, number]> = [[-2.65, 0.37], [-1.7, 0.51], [-0.8, 0.6], [0.4, 0.57], [1.4, 0.39], [2.5, 0.22], [3.25, 0.1]]
    line(livery.map(([z, w]): Vec3 => [s * w, 1.23, z]), 0.043, trim, 'Livrée latérale')
    const filet: Array<[number, number]> = [[-2.6, 0.38], [-1.7, 0.51], [-0.8, 0.6], [0.4, 0.57], [1.4, 0.39], [2.5, 0.22]]
    line(filet.map(([z, w]): Vec3 => [s * w, 1.295, z]), 0.01, brass, 'Filet doré')
    oval([0.075, 0.055, 0.16], [s * 0.32, 1.19, -2.68], dark, 'Prise d’air moteur')
    beam([s * 0.63, 1.04, 0.25], [s * 1.03, 0.28, 0.13], 0.038, metal, 'Jambe de train principal')
    oval([0.14, 0.16, 0.38], [s * 1.03, 0.25, 0.13], paint, 'Carénage de roue')
    const tire = mesh(new THREE.CylinderGeometry(0.215, 0.215, 0.105, 32), rubber, 'Pneu principal', [s * 1.03, 0.215, 0.13])
    tire.rotation.z = Math.PI / 2
    const hub = mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.112, 24), metal, 'Moyeu principal', [s * 1.03, 0.215, 0.13])
    hub.rotation.z = Math.PI / 2
    const nav = new THREE.MeshStandardMaterial({
      color: s < 0 ? '#f43532' : '#3ddd8b',
      emissive: s < 0 ? '#f43532' : '#3ddd8b',
      emissiveIntensity: 2,
    })
    oval([0.04, 0.03, 0.065], [s * 4.7, 1.36, 0.46], nav, 'Feu de navigation')
  }
  wing([[0, 2.15, 1.35, 1.27, 0.13], [0.55, 2.41, 1.03, 1.27, 0.12], [1.24, 2.94, 0.51, 1.27, 0.1], [1.4, 3.13, 0.24, 1.27, 0.1]], 1, trim, 'Dérive', true)
  line([[0, 1.42, 3.33], [0, 2.08, 3.36], [0, 2.58, 3.34]], 0.008, brass, 'Joint de gouverne')

  // Deux sièges côte à côte, tableau de bord et manches.
  box([1.0, 0.07, 1.65], [0, 1.03, -0.05], dark, 'Plancher du cockpit')
  for (const s of [-1, 1]) {
    oval([0.205, 0.07, 0.26], [s * 0.255, 1.16, 0.14], leather, 'Assise')
    const back = oval([0.2, 0.31, 0.075], [s * 0.255, 1.39, 0.39], leather, 'Dossier')
    back.rotation.x = -0.12
    oval([0.115, 0.095, 0.06], [s * 0.255, 1.66, 0.43], leather, 'Appui-tête')
    beam([s * 0.255, 1.13, -0.1], [s * 0.255, 1.4, -0.18], 0.018, dark, 'Manche')
    box([0.18, 0.025, 0.43], [s * 0.255, 1.24, 0.1], dark, 'Ceinture ventrale')
  }
  box([0.95, 0.25, 0.12], [0, 1.37, -0.71], dark, 'Tableau de bord')
  for (const x of [-0.27, 0.27]) {
    box([0.25, 0.13, 0.008], [x, 1.4, -0.642], new THREE.MeshStandardMaterial({ color: '#648d97', emissive: '#23454d', emissiveIntensity: 0.4 }), 'Écran de vol')
  }
  box([0.085, 0.15, 0.48], [0, 1.19, -0.2], trim, 'Console centrale')
  const canopyGeo = new THREE.SphereGeometry(1, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2)
  const canopy = mesh(canopyGeo, glass, 'Verrière panoramique', [0, 1.43, -0.04])
  canopy.scale.set(0.6, 0.6, 1.18)
  canopy.renderOrder = 2
  const rim: Vec3[] = []
  for (let i = 0; i <= 64; i++) {
    const t = (i / 64) * Math.PI * 2
    rim.push([0.6 * Math.cos(t), 1.432, -0.04 + 1.18 * Math.sin(t)])
  }
  line(rim, 0.021, trim, 'Encadrement de verrière')
  const bow: Vec3[] = []
  for (let i = 0; i <= 32; i++) {
    const t = (i / 32) * Math.PI
    bow.push([0.6 * Math.cos(t), 1.43 + 0.6 * Math.sin(t), -0.04])
  }
  line(bow, 0.014, paint, 'Arceau de verrière')
  beam([0, 0.93, -1.91], [0, 0.23, -2.05], 0.032, metal, 'Train avant')
  const frontTire = mesh(new THREE.CylinderGeometry(0.175, 0.175, 0.09, 32), rubber, 'Roue avant', [0, 0.175, -2.05])
  frontTire.rotation.z = Math.PI / 2
  oval([0.105, 0.125, 0.3], [0, 0.21, -2.05], paint, 'Carénage avant')
  beam([0, 1.56, 1.28], [0, 1.9, 1.45], 0.012, dark, 'Antenne')

  // Hélice séparée pour l’animation autour de l’axe longitudinal.
  const propeller = new THREE.Group()
  propeller.name = 'Hélice'
  propeller.position.set(0, 1.22, -3.0)
  group.add(propeller)
  for (const s of [-1, 1]) {
    const blade = oval([0.075, 0.51, 0.025], [s * 0.055, s * 0.49, 0], trim, 'Pale', propeller)
    blade.rotation.z = -0.12
    oval([0.065, 0.1, 0.027], [s * 0.1, s * 0.91, 0], brass, 'Bout de pale', propeller)
  }
  const spinner = mesh(new THREE.ConeGeometry(0.25, 0.48, 48), paint, 'Cône d’hélice', [0, 1.22, -3.22])
  spinner.rotation.x = -Math.PI / 2
  const collar = mesh(new THREE.CylinderGeometry(0.255, 0.255, 0.07, 48), brass, 'Bague moteur', [0, 1.22, -2.97])
  collar.rotation.x = Math.PI / 2

  return {
    group,
    propeller,
    setColor(value) {
      paint.color.set(value)
    },
    setAccent(value) {
      trim.color.set(value)
    },
    update(deltaSeconds, rpm = 700) {
      if (Number.isFinite(deltaSeconds) && deltaSeconds >= 0 && Number.isFinite(rpm)) {
        propeller.rotation.z = (propeller.rotation.z + (deltaSeconds * rpm * Math.PI * 2) / 60) % (Math.PI * 2)
      }
    },
    dispose() {
      const geometries = new Set<THREE.BufferGeometry>()
      const materials = new Set<THREE.Material>()
      group.traverse((o) => {
        const m = o as THREE.Mesh
        if (m.isMesh) {
          geometries.add(m.geometry)
          for (const mat of Array.isArray(m.material) ? m.material : [m.material]) materials.add(mat)
        }
      })
      geometries.forEach((g) => g.dispose())
      materials.forEach((m) => m.dispose())
    },
  }
}
