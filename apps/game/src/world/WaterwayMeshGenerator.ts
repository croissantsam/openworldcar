/**
 * WaterwayMeshGenerator — renders OSM rivers, canals, streams and water bodies (lakes, basins, riverbanks).
 *
 * Realism features:
 *   - Water surface at y = 0.012m (sits cleanly above urban slab at 0.001m and below roads at 0.028m)
 *   - Animated water shader with flowing ripples, wave foam highlights, and specular sun glints
 *   - Authentic Parisian limestone parapets / balustrades lining the quays (y = 0.02 to 0.92m)
 *   - Works 100% reliably without fragile stencil buffers or chunk ordering dependencies
 */

import * as THREE from 'three'
import type { Waterway } from '@world-drive/shared'

// ── Materials ──────────────────────────────────────────────────────────────

// Street-level stone parapet / balustrade
const PARAPET_MAT = new THREE.MeshStandardMaterial({
  color: 0xb5afa0, // Warm Parisian limestone parapet coping
  roughness: 0.84,
  metalness: 0.04,
  side: THREE.DoubleSide,
})

// Embankment curb edging along the water's edge
const EMBANKMENT_EDGE_MAT = new THREE.MeshStandardMaterial({
  color: 0x6e6962, // Aged Parisian river quay stone
  roughness: 0.88,
  metalness: 0.04,
  side: THREE.DoubleSide,
})

// ── Animated Water ShaderMaterial ──────────────────────────────────────────
const WATER_VERT = `
  #include <logdepthbuf_pars_vertex>
  varying vec2 vUv;
  varying vec3 vWorldPos;
  void main() {
    vUv = uv;
    vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    #include <logdepthbuf_vertex>
  }
`
const WATER_FRAG = `
  #include <logdepthbuf_pars_fragment>
  uniform float uTime;
  varying vec2 vUv;
  varying vec3 vWorldPos;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
      f.y
    );
  }

  void main() {
    #include <logdepthbuf_fragment>

    // Coherent world-space flowing ripples
    vec2 p = vWorldPos.xz * 0.14;
    float n1 = noise(p * 3.2 + vec2(uTime * 0.35, uTime * 0.12));
    float n2 = noise(p * 6.8 - vec2(uTime * 0.22, uTime * 0.28));

    vec3 deepWater     = vec3(0.03, 0.15, 0.28); // Deep Seine river teal
    vec3 midWater      = vec3(0.08, 0.34, 0.50); // Sunny river surface
    vec3 foamHighlight = vec3(0.85, 0.95, 1.00); // Crisp wave foam

    float ripple = n1 * 0.6 + n2 * 0.4;
    vec3 color = mix(deepWater, midWater, ripple * 0.7);

    // Subtle foam on wave crests
    float peak = pow(max(0.0, n1 * n2), 2.2);
    color = mix(color, foamHighlight, peak * 0.45);

    // Dynamic sun specular glint
    float glint = pow(max(0.0, n2), 6.5) * 0.45;
    color += vec3(glint);

    gl_FragColor = vec4(color, 0.96);
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
      polygonOffset: true,
      polygonOffsetFactor: -1.5,
      polygonOffsetUnits: -1.5,
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
   * Generate realistic water features with animated ripple shader, stone quay
   * border walls, and classic street-level parapet balustrades.
   */
  static generate(waterway: Waterway): THREE.Group | null {
    const pts = waterway.points
    if (pts.length < 2) return null

    const group = new THREE.Group()
    group.userData['waterwayId'] = waterway.id

    const WATER_Y = 0.012  // Sits cleanly above urban slab (0.001) and below road asphalt (0.028)

    // ── 1. Closed Polygon Water Surface (lakes, basins, closed riverbanks) ──
    if (waterway.isPolygon && pts.length >= 3) {
      try {
        const shape = new THREE.Shape()
        shape.moveTo(pts[0]!.x, -pts[0]!.z)
        for (let i = 1; i < pts.length; i++) {
          shape.lineTo(pts[i]!.x, -pts[i]!.z)
        }
        shape.closePath()

        // Water surface
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
        waterMesh.receiveShadow = true
        waterMesh.renderOrder = 2
        group.add(waterMesh)

        // Perimeter stone parapet wall
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
          if (len < 1.0) continue

          const ux = dx / len
          const uz = dz / len
          const nx = -uz
          const nz = ux

          const pMidX = (p1.x + p2.x) / 2
          const pMidZ = (p1.z + p2.z) / 2
          addOrientedBox(
            parapetPos, parapetNorm, parapetIdx,
            pMidX, pMidZ,
            0.02, 0.90,
            len / 2, 0.20,
            ux, uz, nx, nz,
          )
        }

        if (parapetPos.length > 0) {
          const parapetGeo = new THREE.BufferGeometry()
          parapetGeo.setAttribute('position', new THREE.Float32BufferAttribute(parapetPos, 3))
          parapetGeo.setAttribute('normal', new THREE.Float32BufferAttribute(parapetNorm, 3))
          parapetGeo.setIndex(parapetIdx)
          const parapetMesh = new THREE.Mesh(parapetGeo, PARAPET_MAT)
          parapetMesh.castShadow = true
          parapetMesh.receiveShadow = true
          parapetMesh.renderOrder = 4
          group.add(parapetMesh)
        }

        return group
      } catch (err) {
        console.warn(`[WaterwayMeshGenerator] Failed to triangulate polygon waterway ${waterway.id}:`, err)
        // Fallback to linear waterway below
      }
    }

    // ── 2. Linear Waterways (rivers, streams, canals with width) ─────────────
    const halfW = (waterway.width || 30) / 2
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

    // Build water surface ribbon vertices
    const waterVerts: number[] = []
    const uvs: number[] = []
    const ribbonIndices: number[] = []
    let totalLen = 0

    for (let i = 0; i < N; i++) {
      const l = leftBank[i]!
      const r = rightBank[i]!

      // Water surface at y = WATER_Y
      waterVerts.push(l.x, WATER_Y, l.z,  r.x, WATER_Y, r.z)

      if (i > 0) {
        totalLen += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.z - pts[i - 1]!.z)
      }
      const u = totalLen / (waterway.width * 2)
      uvs.push(0, u, 1, u)

      if (i < N - 1) {
        const b = i * 2
        ribbonIndices.push(b, b + 1, b + 2,  b + 1, b + 3, b + 2)
      }
    }

    // Water surface mesh
    const waterGeo = new THREE.BufferGeometry()
    waterGeo.setAttribute('position', new THREE.Float32BufferAttribute(waterVerts, 3))
    waterGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
    waterGeo.setIndex(ribbonIndices)
    waterGeo.computeVertexNormals()
    const waterMesh = new THREE.Mesh(waterGeo, getWaterMaterial())
    waterMesh.receiveShadow = true
    waterMesh.renderOrder = 2
    group.add(waterMesh)

    // Embankment curb stones and street parapets along both banks
    const parapetPos: number[] = []
    const parapetNorm: number[] = []
    const parapetIdx: number[] = []

    const curbPos: number[] = []
    const curbNorm: number[] = []
    const curbIdx: number[] = []

    function addBankCurbAndParapet(bank: BankPoint[]) {
      for (let i = 0; i < bank.length - 1; i++) {
        const b1 = bank[i]!
        const b2 = bank[i + 1]!
        const dx = b2.x - b1.x
        const dz = b2.z - b1.z
        const segLen = Math.hypot(dx, dz)
        if (segLen < 1.0) continue

        const ux = dx / segLen
        const uz = dz / segLen
        const nx = b1.nx
        const nz = b1.nz

        const midX = (b1.x + b2.x) / 2
        const midZ = (b1.z + b2.z) / 2

        // Stone curb edging along the water's edge
        addOrientedBox(
          curbPos, curbNorm, curbIdx,
          midX, midZ,
          0.005, 0.08,
          segLen / 2, 0.35,
          ux, uz, nx, nz,
        )

        // Classic stone parapet balustrade along quays (skip small ditches/drains)
        if (halfW >= 8.0) {
          addOrientedBox(
            parapetPos, parapetNorm, parapetIdx,
            midX, midZ,
            0.02, 0.90,
            segLen / 2, 0.20,
            ux, uz, nx, nz,
          )
        }
      }
    }

    addBankCurbAndParapet(leftBank)
    addBankCurbAndParapet(rightBank)

    if (curbPos.length > 0) {
      const curbGeo = new THREE.BufferGeometry()
      curbGeo.setAttribute('position', new THREE.Float32BufferAttribute(curbPos, 3))
      curbGeo.setAttribute('normal', new THREE.Float32BufferAttribute(curbNorm, 3))
      curbGeo.setIndex(curbIdx)
      const curbMesh = new THREE.Mesh(curbGeo, EMBANKMENT_EDGE_MAT)
      curbMesh.castShadow = true
      curbMesh.receiveShadow = true
      curbMesh.renderOrder = 3
      group.add(curbMesh)
    }

    if (parapetPos.length > 0) {
      const parapetGeo = new THREE.BufferGeometry()
      parapetGeo.setAttribute('position', new THREE.Float32BufferAttribute(parapetPos, 3))
      parapetGeo.setAttribute('normal', new THREE.Float32BufferAttribute(parapetNorm, 3))
      parapetGeo.setIndex(parapetIdx)
      const parapetMesh = new THREE.Mesh(parapetGeo, PARAPET_MAT)
      parapetMesh.castShadow = true
      parapetMesh.receiveShadow = true
      parapetMesh.renderOrder = 4
      group.add(parapetMesh)
    }

    return group
  }
}
