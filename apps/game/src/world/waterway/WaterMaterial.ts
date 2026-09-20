import * as THREE from 'three'

// Street-level stone parapet / balustrade
export const PARAPET_MAT = new THREE.MeshStandardMaterial({
  color: 0xb5afa0, // Warm Parisian limestone parapet coping
  roughness: 0.84,
  metalness: 0.04,
  side: THREE.DoubleSide,
})

// Embankment curb edging along the water's edge
export const EMBANKMENT_EDGE_MAT = new THREE.MeshStandardMaterial({
  color: 0x6e6962, // Aged Parisian river quay stone
  roughness: 0.88,
  metalness: 0.04,
  side: THREE.DoubleSide,
})

// Animated Water ShaderMaterial
const WATER_VERT = `
  // <common> first: logdepthbuf_vertex calls isPerspectiveMatrix(), which lives
  // there. Without it the vertex shader fails to compile and the water is invisible.
  #include <common>
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

    // Coherent world-space flowing ripples — use UV for stable coords at any world offset
    vec2 p = vUv * 50.0;
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

export function getWaterMaterial(): THREE.ShaderMaterial {
  if (!_waterMaterial) {
    _waterMaterial = new THREE.ShaderMaterial({
      vertexShader: WATER_VERT,
      fragmentShader: WATER_FRAG,
      uniforms: { uTime: { value: 0 } },
      polygonOffset: true,
      polygonOffsetFactor: -2.0,
      polygonOffsetUnits: -2.0,
      transparent: true,
      depthWrite: false,
      side: THREE.FrontSide,
    })
  }
  return _waterMaterial
}