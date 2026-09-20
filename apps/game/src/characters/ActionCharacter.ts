/**
 * ActionCharacter — the two playable humans, Nova (woman) and Atlas (man).
 *
 * A faithful TypeScript port of the action-characters-threejs pack: a rigid
 * articulated rig (no skinning) built from primitives, with four procedural
 * clips (Idle, Walk, Run, Punch) baked as quaternion tracks.
 *
 * Metres, Y up, the character faces +Z, feet on y = 0. About 1.84 m for the
 * woman and 1.99 m for the man, scale included. Walk and Run are in-place:
 * translation belongs to whoever drives the character.
 */

import * as THREE from 'three'

export type CharacterType = 'woman' | 'man'
export type ClipName = 'Idle' | 'Walk' | 'Run' | 'Punch'

/** Every joint the rig exposes; the clips animate all but the hands. */
export type JointKey =
  | 'hips'
  | 'spine'
  | 'neck'
  | 'head'
  | 'shoulder_left'
  | 'shoulder_right'
  | 'elbow_left'
  | 'elbow_right'
  | 'hand_left'
  | 'hand_right'
  | 'thigh_left'
  | 'thigh_right'
  | 'knee_left'
  | 'knee_right'
  | 'ankle_left'
  | 'ankle_right'

export type ActionCharacterOptions = {
  type?: CharacterType
  /** Must be unique per character in a scene: it prefixes every object name. */
  name?: string
  accent?: string
  skinTone?: string
}

export type ActionCharacter = {
  group: THREE.Group
  joints: Record<JointKey, THREE.Group>
  /** Empty nodes in each palm, for equipment. */
  attachments: { left: THREE.Object3D; right: THREE.Object3D }
  animations: THREE.AnimationClip[]
  mixer: THREE.AnimationMixer
  play: (label: ClipName, fade?: number) => void
  update: (dt: number) => void
  setAccent: (value: THREE.ColorRepresentation) => void
  dispose: () => void
}

/** Height of the hips above the feet, in rig units (before group.scale). */
export const RIG_HIP_HEIGHT = 0.94

/** Euler triples per joint for one animation sample, plus a vertical hip offset. */
type Pose = Partial<Record<JointKey, readonly [number, number, number]>> & { bob?: number }

/** The joints the clips drive. Hands stay still, so they carry no track. */
const ANIMATED: readonly JointKey[] = [
  'spine',
  'head',
  'shoulder_left',
  'shoulder_right',
  'elbow_left',
  'elbow_right',
  'thigh_left',
  'thigh_right',
  'knee_left',
  'knee_right',
  'ankle_left',
  'ankle_right',
]

const SAMPLES = 33

export function createActionCharacter(options: ActionCharacterOptions = {}): ActionCharacter {
  const type: CharacterType = options.type ?? 'woman'
  const name = options.name ?? (type === 'woman' ? 'Nova' : 'Atlas')
  const accent = options.accent ?? (type === 'woman' ? '#2bc7b9' : '#f2a344')
  const skinTone = options.skinTone ?? (type === 'woman' ? '#ad7655' : '#cc9b76')

  const prefix = name.replace(/[^a-zA-Z0-9_]/g, '_') || 'Character'
  const group = new THREE.Group()
  group.name = prefix
  group.scale.setScalar(type === 'woman' ? 0.95 : 1.02)

  const joints = {} as Record<JointKey, THREE.Group>

  const suit = new THREE.MeshStandardMaterial({ color: '#29363e', roughness: 0.86 })
  const armor = new THREE.MeshStandardMaterial({ color: '#465962', metalness: 0.36, roughness: 0.48 })
  const black = new THREE.MeshStandardMaterial({ color: '#111c24', roughness: 0.72 })
  const color = new THREE.MeshStandardMaterial({ color: accent, metalness: 0.25, roughness: 0.42 })
  const skin = new THREE.MeshStandardMaterial({ color: skinTone, roughness: 0.82 })
  const hair = new THREE.MeshStandardMaterial({
    color: type === 'woman' ? '#201919' : '#362c25',
    roughness: 0.95,
  })
  const leather = new THREE.MeshStandardMaterial({ color: '#735c47', roughness: 0.9 })
  const white = new THREE.MeshStandardMaterial({ color: '#d4dddb', roughness: 0.45 })

  type Vec3 = readonly [number, number, number]

  const joint = (key: JointKey, pos: Vec3, parent: THREE.Object3D = group): THREE.Group => {
    const j = new THREE.Group()
    j.name = `${prefix}_${key}`
    j.position.set(pos[0], pos[1], pos[2])
    parent.add(j)
    joints[key] = j
    return j
  }

  const mesh = (
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    label: string,
    pos: Vec3,
    parent: THREE.Object3D,
  ): THREE.Mesh => {
    const o = new THREE.Mesh(geometry, material)
    o.name = `${prefix}_${label}`
    o.position.set(pos[0], pos[1], pos[2])
    o.castShadow = true
    o.receiveShadow = true
    parent.add(o)
    return o
  }

  const box = (size: Vec3, pos: Vec3, mat: THREE.Material, label: string, parent: THREE.Object3D): THREE.Mesh =>
    mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), mat, label, pos, parent)

  const oval = (size: Vec3, pos: Vec3, mat: THREE.Material, label: string, parent: THREE.Object3D): THREE.Mesh => {
    const o = mesh(new THREE.SphereGeometry(1, 12, 8), mat, label, pos, parent)
    o.scale.set(size[0], size[1], size[2])
    return o
  }

  const segment = (
    length: number,
    top: number,
    bottom: number,
    mat: THREE.Material,
    parent: THREE.Object3D,
    label: string,
  ): THREE.Mesh =>
    mesh(new THREE.CylinderGeometry(top, bottom, length, 8), mat, label, [0, -length / 2, 0], parent)

  // ── Torso ──────────────────────────────────────────────────────────────────
  const hips = joint('hips', [0, RIG_HIP_HEIGHT, 0])
  oval([type === 'woman' ? 0.165 : 0.175, 0.14, 0.115], [0, -0.005, 0], suit, 'pelvis', hips)

  const spine = joint('spine', [0, 0.08, 0], hips)
  const chestWidth = type === 'woman' ? 0.205 : 0.225
  const torso = mesh(new THREE.CylinderGeometry(1, 0.83, 0.4, 8), suit, 'torso', [0, 0.23, 0], spine)
  torso.scale.set(chestWidth, 1, 0.13)

  box([chestWidth * 1.65, 0.25, 0.055], [0, 0.25, 0.124], armor, 'chest_plate', spine)
  box([0.065, 0.24, 0.018], [-0.1, 0.26, 0.163], color, 'chest_accent', spine)
  box([0.07, 0.03, 0.019], [0.092, 0.33, 0.163], white, 'chest_patch', spine)
  box([chestWidth * 1.65, 0.29, 0.08], [0, 0.24, -0.14], armor, 'back_plate', spine)
  box([0.17, 0.26, 0.115], [0, 0.24, -0.21], black, 'compact_pack', spine)

  for (const s of [-1, 1] as const) {
    box([0.042, 0.36, 0.037], [s * 0.145, 0.24, 0.153], black, 'vest_strap', spine)
    box([0.071, 0.055, 0.025], [s * 0.145, 0.37, 0.174], color, 'strap_buckle', spine)
    box([0.065, 0.11, 0.057], [s * 0.07, 0.11, 0.166], leather, 'vest_pouch', spine)
  }

  box([0.34, 0.07, 0.255], [0, 0.01, 0], black, 'belt', hips)
  box([0.066, 0.055, 0.017], [0, 0.01, 0.136], color, 'belt_buckle', hips)
  box([0.09, 0.12, 0.07], [0.21, -0.065, 0], leather, 'utility_pouch', hips)

  // ── Head ───────────────────────────────────────────────────────────────────
  const neck = joint('neck', [0, 0.52, 0], spine)
  mesh(new THREE.CylinderGeometry(0.065, 0.075, 0.105, 10), skin, 'neck', [0, 0.035, 0], neck)

  const head = joint('head', [0, 0.115, 0], neck)
  oval([type === 'woman' ? 0.135 : 0.145, 0.178, 0.133], [0, 0.095, 0], skin, 'head_mesh', head)
  oval([0.096, 0.056, 0.096], [0, -0.014, 0.025], skin, 'jaw', head)

  for (const s of [-1, 1] as const) {
    oval([0.023, 0.04, 0.019], [s * 0.135, 0.084, 0], skin, 'ear', head)
    oval([0.025, 0.012, 0.01], [s * 0.048, 0.121, 0.122], white, 'eye_white', head)
    oval([0.009, 0.01, 0.005], [s * 0.048, 0.121, 0.132], black, 'iris', head)
    const brow = box([0.052, 0.01, 0.012], [s * 0.049, 0.15, 0.12], hair, 'brow', head)
    brow.rotation.z = -s * 0.08
  }

  oval([0.022, 0.032, 0.035], [0, 0.085, 0.132], skin, 'nose', head)
  box([0.043, 0.008, 0.008], [0, 0.036, 0.115], leather, 'mouth', head)

  // Sculpted cap plus close side pieces, so the face stays visible.
  const hairCap = new THREE.SphereGeometry(1, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.46)
  const cap = mesh(hairCap, hair, 'hair_cap', [0, 0.12, -0.012], head)
  cap.scale.set(0.147, 0.17, 0.146)
  for (const s of [-1, 1] as const) {
    oval([0.024, 0.075, 0.088], [s * 0.126, 0.12, -0.027], hair, 'side_hair', head)
  }

  if (type === 'woman') {
    oval([0.095, 0.1, 0.074], [0, 0.15, -0.133], hair, 'tied_hair', head)
    oval([0.055, 0.14, 0.053], [0, 0.036, -0.2], hair, 'ponytail', head)
    mesh(new THREE.TorusGeometry(0.043, 0.01, 6, 12), color, 'hair_tie', [0, 0.12, -0.183], head).rotation.x =
      Math.PI / 2
  } else {
    oval([0.104, 0.038, 0.095], [0, 0.264, -0.008], hair, 'short_hair', head)
  }

  oval([0.026, 0.039, 0.035], [0.156, 0.09, 0], black, 'earpiece', head)
  const micCurve = new THREE.CatmullRomCurve3(
    ([
      [0.16, 0.07, 0],
      [0.16, 0.018, 0.1],
      [0.1, 0.027, 0.14],
    ] as const).map((p) => new THREE.Vector3(p[0], p[1], p[2])),
  )
  mesh(new THREE.TubeGeometry(micCurve, 8, 0.006, 5, false), black, 'microphone', [0, 0, 0], head)

  // ── Limbs ──────────────────────────────────────────────────────────────────
  const attachments: { left: THREE.Object3D; right: THREE.Object3D } = {
    left: new THREE.Object3D(),
    right: new THREE.Object3D(),
  }

  for (const s of [-1, 1] as const) {
    const side = s < 0 ? 'left' : 'right'

    const shoulder = joint(`shoulder_${side}` as JointKey, [s * (chestWidth + 0.047), 0.41, 0], spine)
    oval([0.102, 0.105, 0.112], [s * 0.008, -0.015, 0], armor, 'shoulder_guard', shoulder)
    box([0.055, 0.038, 0.02], [s * 0.025, 0.01, 0.109], color, 'shoulder_marker', shoulder)
    segment(0.285, 0.072, 0.061, suit, shoulder, 'upper_arm')

    const elbow = joint(`elbow_${side}` as JointKey, [0, -0.285, 0], shoulder)
    oval([0.066, 0.065, 0.067], [0, 0, 0], black, 'elbow_joint', elbow)
    segment(0.255, 0.064, 0.044, suit, elbow, 'forearm')
    box([0.095, 0.14, 0.032], [0, -0.1, 0.055], armor, 'forearm_guard', elbow)
    box([0.074, 0.031, 0.036], [0, -0.205, 0.045], color, 'wrist_band', elbow)

    const hand = joint(`hand_${side}` as JointKey, [0, -0.275, 0], elbow)
    oval([0.055, 0.075, 0.042], [0, -0.035, 0.01], black, 'glove', hand)
    oval([0.025, 0.038, 0.03], [-s * 0.044, -0.02, 0.027], black, 'thumb', hand)

    const grip = attachments[side]
    grip.name = `${prefix}_grip_${side}`
    grip.position.set(0, -0.04, 0.04)
    hand.add(grip)

    const thigh = joint(`thigh_${side}` as JointKey, [s * 0.105, -0.045, 0], hips)
    segment(0.405, 0.102, 0.076, suit, thigh, 'thigh')
    box([0.08, 0.13, 0.055], [s * 0.071, -0.16, 0.005], leather, 'thigh_pocket', thigh)

    const knee = joint(`knee_${side}` as JointKey, [0, -0.405, 0], thigh)
    oval([0.079, 0.077, 0.082], [0, 0, 0], black, 'knee_joint', knee)
    oval([0.08, 0.085, 0.035], [0, -0.005, 0.071], armor, 'kneepad', knee)
    box([0.055, 0.023, 0.012], [0, 0.025, 0.105], color, 'knee_marker', knee)
    segment(0.37, 0.071, 0.052, suit, knee, 'shin')
    box([0.088, 0.2, 0.029], [0, -0.17, 0.056], armor, 'shin_guard', knee)

    const ankle = joint(`ankle_${side}` as JointKey, [0, -0.37, 0], knee)
    oval([0.075, 0.12, 0.078], [0, 0.025, 0], black, 'boot_upper', ankle)
    oval([0.078, 0.067, 0.137], [0, -0.047, 0.05], black, 'boot', ankle)
    box([0.155, 0.026, 0.25], [0, -0.095, 0.045], black, 'sole', ankle)
    box([0.09, 0.026, 0.075], [0, -0.063, 0.146], armor, 'toe_guard', ankle)
  }

  // ── Clips ──────────────────────────────────────────────────────────────────
  // Quaternion tracks: no Euler interpolation surprises, and they export to glTF.
  const makeClip = (label: ClipName, duration: number, pose: (t: number) => Pose): THREE.AnimationClip => {
    const times = Array.from({ length: SAMPLES }, (_, i) => (duration * i) / (SAMPLES - 1))
    const tracks: THREE.KeyframeTrack[] = []
    const q = new THREE.Quaternion()
    const e = new THREE.Euler()

    for (const key of ANIMATED) {
      const values: number[] = []
      for (let i = 0; i < times.length; i++) {
        const angles = pose(i / (SAMPLES - 1))[key] ?? ([0, 0, 0] as const)
        e.set(angles[0], angles[1], angles[2])
        q.setFromEuler(e)
        values.push(q.x, q.y, q.z, q.w)
      }
      tracks.push(new THREE.QuaternionKeyframeTrack(`${joints[key].name}.quaternion`, times, values))
    }

    const positions: number[] = []
    for (let i = 0; i < times.length; i++) {
      positions.push(0, RIG_HIP_HEIGHT + (pose(i / (SAMPLES - 1)).bob ?? 0), 0)
    }
    tracks.push(new THREE.VectorKeyframeTrack(`${hips.name}.position`, times, positions))

    return new THREE.AnimationClip(label, duration, tracks)
  }

  const relaxed = (): Pose => ({
    shoulder_left: [0, 0, -0.09],
    shoulder_right: [0, 0, 0.09],
    elbow_left: [-0.12, 0, 0],
    elbow_right: [-0.12, 0, 0],
  })

  const idle = makeClip('Idle', 2.4, (t) => ({
    ...relaxed(),
    spine: [0.008 * Math.sin(t * Math.PI * 2), 0, 0],
    head: [0, 0.025 * Math.sin(t * Math.PI * 2), 0],
    bob: 0.004 * Math.sin(t * Math.PI * 2),
  }))

  const stride = (t: number, run: boolean): Pose => {
    const a = t * Math.PI * 2
    const s = Math.sin(a)
    const c = Math.cos(a)
    const swing = run ? 0.78 : 0.4
    return {
      spine: [run ? 0.12 : 0.025, 0.035 * s, 0],
      head: [run ? -0.1 : 0, 0, 0],
      bob: ((run ? 0.035 : 0.012) * (1 - Math.cos(2 * a))) / 2,
      thigh_left: [swing * s, 0, 0],
      thigh_right: [-swing * s, 0, 0],
      knee_left: [0.1 + (run ? 1.05 : 0.48) * Math.max(0, c), 0, 0],
      knee_right: [0.1 + (run ? 1.05 : 0.48) * Math.max(0, -c), 0, 0],
      ankle_left: [-0.1 - 0.12 * Math.max(0, c), 0, 0],
      ankle_right: [-0.1 - 0.12 * Math.max(0, -c), 0, 0],
      shoulder_left: [-swing * s, 0, -0.12],
      shoulder_right: [swing * s, 0, 0.12],
      elbow_left: [run ? -1.2 : -0.22, 0, 0],
      elbow_right: [run ? -1.2 : -0.22, 0, 0],
    }
  }

  const walk = makeClip('Walk', 1.05, (t) => stride(t, false))
  const run = makeClip('Run', 0.62, (t) => stride(t, true))

  const punch = makeClip('Punch', 0.7, (t) => {
    const attack = Math.sin(Math.PI * Math.min(1, t / 0.48)) ** 2
    const guard = Math.sin(Math.PI * t)
    return {
      ...relaxed(),
      spine: [0, -0.28 * attack, 0],
      head: [0, 0.18 * attack, 0],
      shoulder_right: [-1.56 * attack, 0, 0.09 * (1 - attack)],
      elbow_right: [-0.12 - 0.65 * guard * (1 - attack), 0, 0],
      shoulder_left: [-0.65 * guard, 0, -0.12],
      elbow_left: [-0.12 - 0.95 * guard, 0, 0],
      thigh_left: [-0.1 * guard, 0, 0],
      thigh_right: [0.1 * guard, 0, 0],
    }
  })

  const animations = [idle, walk, run, punch]
  group.animations = animations

  const mixer = new THREE.AnimationMixer(group)
  let active: THREE.AnimationAction | null = null

  const play = (label: ClipName, fade = 0.16): void => {
    const clip = THREE.AnimationClip.findByName(animations, label)
    if (!clip) return
    const next = mixer.clipAction(clip)
    if (next === active && next.isRunning()) return
    const once = label === 'Punch'
    next.reset().setEffectiveWeight(1).setEffectiveTimeScale(1)
    next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity)
    next.clampWhenFinished = once
    if (active) active.fadeOut(fade)
    next.fadeIn(fade).play()
    active = next
  }

  const onFinished = (): void => play('Idle')
  mixer.addEventListener('finished', onFinished)
  play('Idle', 0)

  return {
    group,
    joints,
    attachments,
    animations,
    mixer,
    play,
    update(dt: number): void {
      mixer.update(Math.max(0, Math.min(dt, 0.1)))
    },
    setAccent(value: THREE.ColorRepresentation): void {
      color.color.set(value)
    },
    dispose(): void {
      mixer.removeEventListener('finished', onFinished)
      mixer.stopAllAction()
      mixer.uncacheRoot(group)
      const geometries = new Set<THREE.BufferGeometry>()
      const materials = new Set<THREE.Material>()
      group.traverse((o) => {
        const m = o as THREE.Mesh
        if (!m.isMesh) return
        geometries.add(m.geometry)
        for (const mat of Array.isArray(m.material) ? m.material : [m.material]) materials.add(mat)
      })
      geometries.forEach((g) => g.dispose())
      materials.forEach((m) => m.dispose())
      group.clear()
    },
  }
}
