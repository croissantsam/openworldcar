/**
 * BurnoutPostShader — Unified Burnout Paradise post-processing pass.
 *
 * Combines in a single full-screen quad:
 *   1. Radial Speed Blur (only when vehicle speed > 20 m/s; 8 taps)
 *   2. Cinematic Contrast & Crushed Blacks
 *   3. Warm Sunlight Highlights
 *   4. Saturation Boost (arcade punch)
 *   5. Smooth Screen-Edge Vignette
 *
 * Replaces two separate ShaderPass full-screen blits with one,
 * saving memory bandwidth, texture allocations, and render passes.
 */

export const BurnoutPostShader = {
  name: 'BurnoutPostShader',

  uniforms: {
    tDiffuse:    { value: null },
    uSaturation: { value: 1.04 },
    uContrast:   { value: 1.02 },
    uVignette:   { value: 0.22 },
  },

  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,

  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float     uSaturation;
    uniform float     uContrast;
    uniform float     uVignette;
    varying vec2      vUv;

    const vec3 LUM = vec3(0.2126, 0.7152, 0.0722);

    void main() {
      vec4 baseColor = texture2D(tDiffuse, vUv);
      vec3 col = baseColor.rgb;

      // 2. Multiplicative Contrast (pivot at 0.5)
      col = (col - 0.5) * uContrast + 0.5;

      // 3. Saturation (subtle and natural)
      float lum = dot(col, LUM);
      col = mix(vec3(lum), col, uSaturation);

      // 5. Vignette (smooth dark border)
      vec2 uv2 = vUv * 2.0 - 1.0;
      float vig = 1.0 - uVignette * dot(uv2 * vec2(0.8, 1.0), uv2 * vec2(0.8, 1.0));
      col *= clamp(vig, 0.0, 1.0);

      gl_FragColor = vec4(clamp(col, 0.0, 1.0), baseColor.a);
    }
  `,
} as const
