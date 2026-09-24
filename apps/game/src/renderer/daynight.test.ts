import { describe, expect, it } from 'vitest'
import { dayNightPalette, nightFactor } from './daynight.js'

describe('dayNightPalette', () => {
  it('returns full daylight high above the horizon', () => {
    const p = dayNightPalette(45)
    expect(p.moon).toBe(false)
    expect(p.sunIntensity).toBe(2.8)
    expect(p.background).toBe(0x62aef7)
    expect(p.exposure).toBe(1.3)
  })

  it('returns deep night far below the horizon', () => {
    const p = dayNightPalette(-30)
    expect(p.moon).toBe(true)
    expect(p.background).toBe(0x0e1628)
    expect(p.sunIntensity).toBeLessThan(1.5)
  })

  it('paints a warm low sun at the horizon', () => {
    const p = dayNightPalette(0)
    expect(p.moon).toBe(false)
    const r = (p.sunColor >> 16) & 0xff
    const b = p.sunColor & 0xff
    expect(r).toBeGreaterThan(200) // orange-red…
    expect(b).toBeLessThan(120) // …not white-blue
  })

  it('dims monotonically from noon to midnight', () => {
    const elevations = [60, 20, 8, 0, -6, -18, -40]
    const exposures = elevations.map((e) => dayNightPalette(e).exposure)
    for (let i = 1; i < exposures.length; i++) {
      expect(exposures[i]!).toBeLessThanOrEqual(exposures[i - 1]!)
    }
    const intensities = elevations.map((e) => dayNightPalette(e).sunIntensity)
    expect(intensities[0]).toBeGreaterThan(intensities[intensities.length - 1]!)
  })

  it('interpolates continuously between stops (no pops)', () => {
    const a = dayNightPalette(10)
    const lo = dayNightPalette(8)
    const hi = dayNightPalette(20)
    expect(a.sunIntensity).toBeGreaterThan(lo.sunIntensity)
    expect(a.sunIntensity).toBeLessThan(hi.sunIntensity)
    expect(a.exposure).toBeGreaterThan(lo.exposure)
    expect(a.exposure).toBeLessThan(hi.exposure)
  })

  it('switches to moonlight below −6°', () => {
    expect(dayNightPalette(-5.9).moon).toBe(false)
    expect(dayNightPalette(-6.1).moon).toBe(true)
  })
})

describe('nightFactor', () => {
  it('is 0 by day, 1 by night, ramping through dusk', () => {
    expect(nightFactor(30)).toBe(0)
    expect(nightFactor(2)).toBe(0)
    expect(nightFactor(-12)).toBe(1)
    expect(nightFactor(-40)).toBe(1)
    const dusk = nightFactor(-5)
    expect(dusk).toBeGreaterThan(0)
    expect(dusk).toBeLessThan(1)
    expect(nightFactor(-10)).toBeGreaterThan(dusk)
  })
})
