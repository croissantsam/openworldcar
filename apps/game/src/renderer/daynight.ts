/**
 * Day/night lighting palette, driven by real solar elevation.
 *
 * Pure function of the Sun's elevation (hex colors + intensities), so the
 * look is unit-testable without Three.js. The Renderer applies the result
 * to the sun / ambient / hemisphere lights, sky background, fog and
 * exposure. Below −6° the directional light becomes bluish moonlight
 * (opposite azimuth, fixed 35° elevation) so night stays readable and
 * shadows keep working.
 */

export type DayNightPalette = {
  sunColor: number
  sunIntensity: number
  ambientColor: number
  ambientIntensity: number
  hemiSky: number
  hemiGround: number
  hemiIntensity: number
  background: number
  fog: number
  exposure: number
  /** True when the directional light acts as the moon. */
  moon: boolean
}

type Stop = {
  elev: number
  sunColor: number
  sunIntensity: number
  ambientColor: number
  ambientIntensity: number
  hemiSky: number
  hemiGround: number
  hemiIntensity: number
  background: number
  fog: number
  exposure: number
}

// Night → twilight → golden → low sun → full day.
const STOPS: Stop[] = [
  {
    elev: -18,
    sunColor: 0x9db0ff,
    sunIntensity: 1.3,
    ambientColor: 0x46587f,
    ambientIntensity: 0.65,
    hemiSky: 0x2f3f68,
    hemiGround: 0x151923,
    hemiIntensity: 0.7,
    background: 0x0e1628,
    fog: 0x16203c,
    exposure: 1.12,
  },
  {
    elev: -6,
    sunColor: 0x8a7fd8,
    sunIntensity: 0.5,
    ambientColor: 0x5a6aa8,
    ambientIntensity: 0.38,
    hemiSky: 0x3a4a80,
    hemiGround: 0x23242c,
    hemiIntensity: 0.5,
    background: 0x2a3358,
    fog: 0x333d63,
    exposure: 1.14,
  },
  {
    elev: 0,
    sunColor: 0xff9a3c,
    sunIntensity: 2.0,
    ambientColor: 0xe8a878,
    ambientIntensity: 0.48,
    hemiSky: 0x8a7fc0,
    hemiGround: 0x3a322c,
    hemiIntensity: 0.65,
    background: 0xc97e52,
    fog: 0xb98a6a,
    exposure: 1.2,
  },
  {
    elev: 8,
    sunColor: 0xffe3b3,
    sunIntensity: 2.6,
    ambientColor: 0xf7d9b8,
    ambientIntensity: 0.6,
    hemiSky: 0x6fa8e8,
    hemiGround: 0x454434,
    hemiIntensity: 0.8,
    background: 0x5fa8ef,
    fog: 0x84b4ee,
    exposure: 1.28,
  },
  {
    elev: 20,
    sunColor: 0xfff6e4,
    sunIntensity: 2.8,
    ambientColor: 0xfff1e0,
    ambientIntensity: 0.65,
    hemiSky: 0x72b9f8,
    hemiGround: 0x3d4a36,
    hemiIntensity: 0.85,
    background: 0x62aef7,
    fog: 0x8bc0f5,
    exposure: 1.3,
  },
]

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function lerpColor(a: number, b: number, t: number): number {
  const r = Math.round(lerp((a >> 16) & 0xff, (b >> 16) & 0xff, t))
  const g = Math.round(lerp((a >> 8) & 0xff, (b >> 8) & 0xff, t))
  const bl = Math.round(lerp(a & 0xff, b & 0xff, t))
  return (r << 16) | (g << 8) | bl
}

export function dayNightPalette(elevationDeg: number): DayNightPalette {  const e = elevationDeg
  if (e <= STOPS[0]!.elev) return { ...STOPS[0]!, moon: true }
  for (let i = 0; i < STOPS.length - 1; i++) {
    const lo = STOPS[i]!
    const hi = STOPS[i + 1]!
    if (e <= hi.elev) {
      const t = (e - lo.elev) / (hi.elev - lo.elev)
      return {
        sunColor: lerpColor(lo.sunColor, hi.sunColor, t),
        sunIntensity: lerp(lo.sunIntensity, hi.sunIntensity, t),
        ambientColor: lerpColor(lo.ambientColor, hi.ambientColor, t),
        ambientIntensity: lerp(lo.ambientIntensity, hi.ambientIntensity, t),
        hemiSky: lerpColor(lo.hemiSky, hi.hemiSky, t),
        hemiGround: lerpColor(lo.hemiGround, hi.hemiGround, t),
        hemiIntensity: lerp(lo.hemiIntensity, hi.hemiIntensity, t),
        background: lerpColor(lo.background, hi.background, t),
        fog: lerpColor(lo.fog, hi.fog, t),
        exposure: lerp(lo.exposure, hi.exposure, t),
        moon: e < -6,
      }
    }
  }
  const top = STOPS[STOPS.length - 1]!
  return { ...top, moon: false }
}

/**
 * Night amount 0 (day) → 1 (full night) from solar elevation.
 * Ramps from +2° (lamps flicker on at dusk) to full at −12° (astronomical
 * dusk). Drives headlights, lamp heads and lit windows.
 */
export function nightFactor(elevationDeg: number): number {
  const t = (2 - elevationDeg) / 14
  return Math.min(1, Math.max(0, t))
}
