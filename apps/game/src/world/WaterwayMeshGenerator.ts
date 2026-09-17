/**
 * WaterwayMeshGenerator — renders OSM rivers, canals, streams and water bodies (lakes, basins, riverbanks).
 *
 * Realism features:
 *   - Recessed / carved riverbeds (creusé dans le sol) at y = -2.2m (water) and y = -3.4m (bed)
 *   - Stencil mask punching a clean hole through urban ground slabs
 *   - Vertical stone embankment walls (murs de quai de Seine) connecting street level to riverbed
 *   - Classic stone parapets / balustrades along quays at street level (y = 0.02 to 0.92m)
 *   - Animated water surface with flowing waves, foam highlights and specular sun glints
 */

import * as THREE from 'three'
import type { Waterway } from '@world-drive/shared'

// ── Materials ──────────────────────────────────────────────────────────────

// Stencil mask material: writes ref 1 into stencil buffer, invisible in color/depth
const STENCIL_MASK_MAT = new THREE.MeshBasicMaterial({
  colorWrite: false,
  depthWrite: false,
  stencilWrite: true,
  stencilRef: 1,
  stencilFunc: THREE.AlwaysStencilFunc,
  stencilZPass: THREE.ReplaceStencilOp,
  side: THREE.DoubleSide,
})

// Riverbed silt / pebbles under the water
const RIVERBED_MAT = new THREE.MeshStandardMaterial({
  color: 0x121915, // Murky riverbed silt
  roughness: 0.96,
  metalness: 0.0,
  side: THREE.DoubleSide,
})

// Aged Parisian stone embankment / quay walls
const QUAY_WALL_MAT = new THREE.MeshStandardMaterial({
  color: 0x6e6962, // Parisian limestone river quay wall
  roughness: 0.88,
  metalness: 0.04,
  side: THREE.DoubleSide,
})

// Street-level stone parapet / balustrade
const PARAPET_MAT = new THREE.MeshStandardMaterial({
  color: 0xb5afa0, // Warm limestone parapet coping
  roughness: 0.84,
  metalness: 0.04,
  side: THREE.DoubleSide,
})

// ── Animated Water ShaderMaterial ──────────────────────────────────────────
const WATER_VERT = `
  varying vec2 vUv;
  varying vec3 vWorldPos;
  void main() {
    vUv = uv;
    vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`
const WATER_FRAG = `
  uniform float uTime;
  varying vec2 vUv;
  varying vec3 vWorldPos;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1,0)), f.x),
      mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x),
      f.y
    );
  }

  void main() {
    // Flowing ripples based on world coords + time for coherent water surface
    vec2 p = vWorldPos.xz * 0.12;
    float n1 = noise(p * 3.5 + vec2(uTime * 0.35, uTime * 0.15));
    float n2 = noise(p * 7.0 - vec2(uTime * 0.25, uTime * 0.30));

    vec3 deepWater     = vec3(0.04, 0.16, 0.28); // Deep river teal
    vec3 midWater      = vec3(0.08, 0.34, 0.50); // Sunny river surface
    vec3 foamHighlight = vec3(0.85, 0.95, 1.00); // Crisp foam

    float ripple = n1 * 0.6 + n2 * 0.4;
    vec3 color = mix(deepWater, midWater, ripple * 0.7);

    // Subtle foam on wave peaks
    float peak = pow(max(0.0, n1 * n2), 2.5);
    color = mix(color, foamHighlight, peak * 0.45);

    // Sun specular glint
    float glint = pow(n2, 7.0) * 0.45;
    color += vec3(glint);

    // Slight transparency to reveal sunken riverbed underneath
    gl_FragColor = vec4(color, 0.88);
  }
`

let _waterMaterial: THREE.ShaderMaterial | null = null
let _clock: THREE.Clock | null = null

function getWaterMaterial(): THREE.ShaderMaterial {
  if (!_waterMaterial) {
    _clock = new THREE.Clock()
    _waterMaterial = new THREE.ShaderMaterial({
      vertexShader: WATER_VERT,
      fragmentShader: WATER_FRAG,
      uniforms: { uTime: { value: 0 } },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
  }
  return _waterMaterial
}

/**
 * Tick the water animation — call once per frame.
 */
export function tickWater(): void {
  if (_waterMaterial && _clock) {
    _waterMaterial.uniforms['uTime']!.value = _clock.getElapsedTime()
  }
}

/**
 * Helper to push an oriented 3D cuboid into vertex/normal/index arrays.
 */
function addOrientedBox(
  posList: number[],
  normList: number[],
  idxList: number[],
  cx: number,
  cz: number,
  yMin: number,
  yMax: number,
  halfLen: number,
  halfWidth: number,
  ux: number,
  uz: number,
  nx: number,
  nz: number,
) {
  const baseIdx = posList.length / 3

  const c0x = cx - ux * halfLen - nx * halfWidth
  const c0z = cz - uz * halfLen - nz * halfWidth

  const c1x = cx + ux * halfLen - nx * halfWidth
  const c1z = cz + uz * halfLen - nz * halfWidth

  const c2x = cx + ux * halfLen + nx * halfWidth
  const c2z = cz + uz * halfLen + nz * halfWidth

  const c3x = cx - ux * halfLen + nx * halfWidth
  const c3z = cz - uz * halfLen + nz * halfWidth

  // Face 0: Top (+Y)
  posList.push(c0x, yMax, c0z,  c1x, yMax, c1z,  c2x, yMax, c2z,  c3x, yMax, c3z)
  normList.push(0, 1, 0,  0, 1, 0,  0, 1, 0,  0, 1, 0)
  idxList.push(baseIdx, baseIdx + 1, baseIdx + 2, baseIdx, baseIdx + 2, baseIdx + 3)

  // Face 1: Bottom (-Y)
  const b1 = baseIdx + 4
  posList.push(c3x, yMin, c3z,  c2x, yMin, c2z,  c1x, yMin, c1z,  c0x, yMin, c0z)
  normList.push(0, -1, 0,  0, -1, 0,  0, -1, 0,  0, -1, 0)
  idxList.push(b1, b1 + 1, b1 + 2, b1, b1 + 2, b1 + 3)

  // Face 2: Side +N
  const b2 = baseIdx + 8
  posList.push(c2x, yMin, c2z,  c3x, yMin, c3z,  c3x, yMax, c3z,  c2x, yMax, c2z)
  normList.push(nx, 0, nz,  nx, 0, nz,  nx, 0, nz,  nx, 0, nz)
  idxList.push(b2, b2 + 1, b2 + 2, b2, b2 + 2, b2 + 3)

  // Face 3: Side -N
  const b3 = baseIdx + 12
  posList.push(c0x, yMin, c0z,  c1x, yMin, c1z,  c1x, yMax, c1z,  c0x, yMax, c0z)
  normList.push(-nx, 0, -nz,  -nx, 0, -nz,  -nx, 0, -nz,  -nx, 0, -nz)
  idxList.push(b3, b3 + 1, b3 + 2, b3, b3 + 2, b3 + 3)

  // Face 4: End +U
  const b4 = baseIdx + 16
  posList.push(c1x, yMin, c1z,  c2x, yMin, c2z,  c2x, yMax, c2z,  c1x, yMax, c1z)
  normList.push(ux, 0, uz,  ux, 0, uz,  ux, 0, uz,  ux, 0, uz)
  idxList.push(b4, b4 + 1, b4 + 2, b4, b4 + 2, b4 + 3)

  // Face 5: End -U
  const b5 = baseIdx + 20
  posList.push(c3x, yMin, c3z,  c0x, yMin, c0z,  c0x, yMax, c0z,  c3x, yMax, c3z)
  normList.push(-ux, 0, -uz,  -ux, 0, -uz,  -ux, 0, -uz,  -ux, 0, -uz)
  idxList.push(b5, b5 + 1, b5 + 2, b5, b5 + 2, b5 + 3)
}

export class WaterwayMeshGenerator {
  /**
   * Generate realistic carved water features with stencil cutout, sunken riverbed,
   * stone embankment quay walls, and street-level parapet balustrades.
   */
  static generate(waterway: Waterway): THREE.Group | null {
    const pts = waterway.points
    if (pts.length < 2) return null

    const group = new THREE.Group()
    group.userData['waterwayId'] = waterway.id

    const WATER_Y = -2.2   // Water surface elevation (sunken into ground)
    const BED_Y = -3.4     // Riverbed floor elevation
    const STREET_Y = 0.05  // Top of embankment wall at ground level

    // ── 1. Closed Polygon Water Surface (lakes, basins, riverbanks) ─────────
    if (waterway.isPolygon && pts.length >= 3) {
      const shape = new THREE.Shape()
      shape.moveTo(pts[0]!.x, pts[0]!.z)
      for (let i = 1; i < pts.length; i++) {
        shape.lineTo(pts[i]!.x, pts[i]!.z)
      }
      shape.closePath()

      // A. Stencil Cutout Mask (punches hole through urban ground slab)
      const maskGeo = new THREE.ShapeGeometry(shape)
      maskGeo.rotateX(-Math.PI / 2)
      maskGeo.translate(0, 0.08, 0)
      const maskMesh = new THREE.Mesh(maskGeo, STENCIL_MASK_MAT)
      maskMesh.renderOrder = -1
      group.add(maskMesh)

      // B. Sunken Riverbed Floor (y = BED_Y)
      const bedGeo = new THREE.ShapeGeometry(shape)
      bedGeo.rotateX(-Math.PI / 2)
      bedGeo.translate(0, BED_Y, 0)
      bedGeo.computeVertexNormals()
      const bedMesh = new THREE.Mesh(bedGeo, RIVERBED_MAT)
      bedMesh.receiveShadow = true
      bedMesh.renderOrder = 1
      group.add(bedMesh)

      // C. Sunken Water Surface (y = WATER_Y)
      const waterGeo = new THREE.ShapeGeometry(shape)
      waterGeo.rotateX(-Math.PI / 2)
      waterGeo.translate(0, WATER_Y, 0)
      const pos = waterGeo.attributes['position'] as THREE.BufferAttribute
      const uvs = new Float32Array(pos.count * 2)
      for (let i = 0; i < pos.count; i++) {
        uvs[i * 2] = pos.getX(i) * 0.05
        uvs[i * 2 + 1] = pos.getZ(i) * 0.05
      }
      waterGeo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
      waterGeo.computeVertexNormals()
      const waterMesh = new THREE.Mesh(waterGeo, getWaterMaterial())
      waterMesh.renderOrder = 2
      group.add(waterMesh)

      // D. Vertical Stone Embankment Walls & Street-level Parapets
      const quayPos: number[] = []
      const quayNorm: number[] = []
      const quayIdx: number[] = []

      const parapetPos: number[] = []
      const parapetNorm: number[] = []
      const parapetIdx: number[] = []

      const N = pts.length
      for (let i = 0; i < N; i++) {
        const p1 = pts[i]!
        const p2 = pts[(i + 1) % N]!
        const dx = p2.x - p1.x
        const dz = p2.z - p1.z
        const len = Math.hypot(dx, dz)
        if (len < 0.5) continue

        const ux = dx / len
        const uz = dz / len
        const nx = -uz
        const nz = ux

        // Vertical stone quay wall from STREET_Y down to BED_Y
        const bIdx = quayPos.length / 3
        quayPos.push(
          p1.x, STREET_Y, p1.z,
          p2.x, STREET_Y, p2.z,
          p2.x, BED_Y, p2.z,
          p1.x, BED_Y, p1.z,
        )
        quayNorm.push(nx, 0, nz,  nx, 0, nz,  nx, 0, nz,  nx, 0, nz)
        quayIdx.push(bIdx, bIdx + 1, bIdx + 2, bIdx, bIdx + 2, bIdx + 3)

        // Parapet wall along street level
        const pMidX = (p1.x + p2.x) / 2
        const pMidZ = (p1.z + p2.z) / 2
        addOrientedBox(
          parapetPos, parapetNorm, parapetIdx,
          pMidX, pMidZ,
          0.02, 0.92,
          len / 2, 0.18,
          ux, uz, nx, nz,
        )
      }

      if (quayPos.length > 0) {
        const quayGeo = new THREE.BufferGeometry()
        quayGeo.setAttribute('position', new THREE.Float32BufferAttribute(quayPos, 3))
        quayGeo.setAttribute('normal', new THREE.Float32BufferAttribute(quayNorm, 3))
        quayGeo.setIndex(quayIdx)
        const quayMesh = new THREE.Mesh(quayGeo, QUAY_WALL_MAT)
        quayMesh.castShadow = true
        quayMesh.receiveShadow = true
        quayMesh.renderOrder = 1
        group.add(quayMesh)
      }

      if (parapetPos.length > 0) {
        const parapetGeo = new THREE.BufferGeometry()
        parapetGeo.setAttribute('position', new THREE.Float32BufferAttribute(parapetPos, 3))
        parapetGeo.setAttribute('normal', new THREE.Float32BufferAttribute(parapetNorm, 3))
        parapetGeo.setIndex(parapetIdx)
        const parapetMesh = new THREE.Mesh(parapetGeo, PARAPET_MAT)
        parapetMesh.castShadow = true
        parapetMesh.receiveShadow = true
        parapetMesh.renderOrder = 1
        group.add(parapetMesh)
      }

      return group
    }

    // ── 2. Linear Waterways (rivers, streams, canals with width) ─────────────
    const halfW = waterway.width / 2
    const N = pts.length

    // Compute left and right bank points along polyline
    type BankPoint = { x: number; z: number; nx: number; nz: number; ux: number; uz: number }
    const leftBank: BankPoint[] = []
    const rightBank: BankPoint[] = []

    for (let i = 0; i < N; i++) {
      const curr = pts[i]!
      const prev = pts[Math.max(0, i - 1)]!
      const next = pts[Math.min(N - 1, i + 1)]!

      let dx = next.x - prev.x
      let dz = next.z - prev.z
      const len = Math.hypot(dx, dz)
      const ux = len > 0 ? dx / len : 1
      const uz = len > 0 ? dz / len : 0

      const nx = -uz
      const nz = ux

      leftBank.push({
        x: curr.x + nx * halfW,
        z: curr.z + nz * halfW,
        nx, nz, ux, uz,
      })
      rightBank.push({
        x: curr.x - nx * halfW,
        z: curr.z - nz * halfW,
        nx: -nx, nz: -nz, ux, uz,
      })
    }

    // A. Build water ribbon vertices and riverbed floor vertices
    const maskVerts: number[] = []
    const waterVerts: number[] = []
    const bedVerts: number[] = []
    const uvs: number[] = []
    const ribbonIndices: number[] = []
    let totalLen = 0

    for (let i = 0; i < N; i++) {
      const l = leftBank[i]!
      const r = rightBank[i]!

      // Mask quad strip at y = 0.08
      maskVerts.push(l.x, 0.08, l.z,  r.x, 0.08, r.z)

      // Water surface at y = WATER_Y
      waterVerts.push(l.x, WATER_Y, l.z,  r.x, WATER_Y, r.z)

      // Riverbed floor at y = BED_Y
      bedVerts.push(l.x, BED_Y, l.z,  r.x, BED_Y, r.z)

      if (i > 0) {
        totalLen += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.z - pts[i - 1]!.z)
      }
      const u = totalLen / (waterway.width * 4)
      uvs.push(0, u, 1, u)

      if (i < N - 1) {
        const b = i * 2
        ribbonIndices.push(b, b + 1, b + 2, b + 1, b + 3, b + 2)
      }
    }

    // Stencil mask mesh
    const maskGeo = new THREE.BufferGeometry()
    maskGeo.setAttribute('position', new THREE.Float32BufferAttribute(maskVerts, 3))
    maskGeo.setIndex(ribbonIndices)
    const maskMesh = new THREE.Mesh(maskGeo, STENCIL_MASK_MAT)
    maskMesh.renderOrder = -1
    group.add(maskMesh)

    // Riverbed floor mesh
    const bedGeo = new THREE.BufferGeometry()
    bedGeo.setAttribute('position', new THREE.Float32BufferAttribute(bedVerts, 3))
    bedGeo.setIndex(ribbonIndices)
    bedGeo.computeVertexNormals()
    const bedMesh = new THREE.Mesh(bedGeo, RIVERBED_MAT)
    bedMesh.receiveShadow = true
    bedMesh.renderOrder = 1
    group.add(bedMesh)

    // Sunken water surface mesh
    const waterGeo = new THREE.BufferGeometry()
    waterGeo.setAttribute('position', new THREE.Float32BufferAttribute(waterVerts, 3))
    waterGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
    waterGeo.setIndex(ribbonIndices)
    waterGeo.computeVertexNormals()
    const waterMesh = new THREE.Mesh(waterGeo, getWaterMaterial())
    waterMesh.renderOrder = 2
    group.add(waterMesh)

    // B. Left and Right Embankment Walls & Parapets
    const quayPos: number[] = []
    const quayNorm: number[] = []
    const quayIdx: number[] = []

    const parapetPos: number[] = []
    const parapetNorm: number[] = []
    const parapetIdx: number[] = []

    // Helper for a bank line (left or right)
    function addBankWallAndParapet(bank: BankPoint[]) {
      for (let i = 0; i < bank.length - 1; i++) {
        const b1 = bank[i]!
        const b2 = bank[i + 1]!
        const dx = b2.x - b1.x
        const dz = b2.z - b1.z
        const segLen = Math.hypot(dx, dz)
        if (segLen < 0.5) continue

        const ux = dx / segLen
        const uz = dz / segLen
        const nx = b1.nx
        const nz = b1.nz

        // Vertical stone quay wall from STREET_Y down to BED_Y
        const bIdx = quayPos.length / 3
        quayPos.push(
          b1.x, STREET_Y, b1.z,
          b2.x, STREET_Y, b2.z,
          b2.x, BED_Y, b2.z,
          b1.x, BED_Y, b1.z,
        )
        quayNorm.push(nx, 0, nz,  nx, 0, nz,  nx, 0, nz,  nx, 0, nz)
        quayIdx.push(bIdx, bIdx + 1, bIdx + 2, bIdx, bIdx + 2, bIdx + 3)

        // Parapet along bank
        const midX = (b1.x + b2.x) / 2
        const midZ = (b1.z + b2.z) / 2
        addOrientedBox(
          parapetPos, parapetNorm, parapetIdx,
          midX, midZ,
          0.02, 0.92,
          segLen / 2, 0.18,
          ux, uz, nx, nz,
        )
      }
    }

    addBankWallAndParapet(leftBank)
    addBankWallAndParapet(rightBank)

    if (quayPos.length > 0) {
      const quayGeo = new THREE.BufferGeometry()
      quayGeo.setAttribute('position', new THREE.Float32BufferAttribute(quayPos, 3))
      quayGeo.setAttribute('normal', new THREE.Float32BufferAttribute(quayNorm, 3))
      quayGeo.setIndex(quayIdx)
      const quayMesh = new THREE.Mesh(quayGeo, QUAY_WALL_MAT)
      quayMesh.castShadow = true
      quayMesh.receiveShadow = true
      quayMesh.renderOrder = 1
      group.add(quayMesh)
    }

    if (parapetPos.length > 0) {
      const parapetGeo = new THREE.BufferGeometry()
      parapetGeo.setAttribute('position', new THREE.Float32BufferAttribute(parapetPos, 3))
      parapetGeo.setAttribute('normal', new THREE.Float32BufferAttribute(parapetNorm, 3))
      parapetGeo.setIndex(parapetIdx)
      const parapetMesh = new THREE.Mesh(parapetGeo, PARAPET_MAT)
      parapetMesh.castShadow = true
      parapetMesh.receiveShadow = true
      parapetMesh.renderOrder = 1
      group.add(parapetMesh)
    }

    return group
  }
}
