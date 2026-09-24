import { describe, expect, it } from 'vitest'
import { solarPosition, solarTimeString } from './solar.js'

const utc = (iso: string): Date => new Date(iso)

describe('solarPosition', () => {
  it('is near zenith at the equator on the March equinox at noon UTC', () => {
    const s = solarPosition(0, 0, utc('2026-03-20T12:00:00Z'))
    expect(s.elevationDeg).toBeGreaterThan(85)
    expect(s.elevationDeg).toBeLessThanOrEqual(90)
  })

  it('is deep night at the equator at midnight UTC', () => {
    const s = solarPosition(0, 0, utc('2026-03-20T00:00:00Z'))
    expect(s.elevationDeg).toBeLessThan(-80)
  })

  it('gives low winter sun and high summer sun in Paris', () => {
    const winter = solarPosition(48.85, 2.35, utc('2026-01-15T12:00:00Z'))
    const summer = solarPosition(48.85, 2.35, utc('2026-07-15T12:00:00Z'))
    expect(winter.elevationDeg).toBeGreaterThan(5)
    expect(winter.elevationDeg).toBeLessThan(30)
    expect(summer.elevationDeg).toBeGreaterThan(45)
    expect(summer.elevationDeg).toBeLessThan(75)
    expect(summer.elevationDeg - winter.elevationDeg).toBeGreaterThan(30)
  })

  it('keeps polar day/night straight', () => {
    const june = solarPosition(80, 0, utc('2026-06-21T12:00:00Z'))
    const december = solarPosition(80, 0, utc('2026-12-21T12:00:00Z'))
    expect(june.elevationDeg).toBeGreaterThan(0)
    expect(december.elevationDeg).toBeLessThan(0)
  })

  it('differs across timezones at the same instant (Paris vs Tokyo)', () => {
    const at = utc('2026-06-01T03:00:00Z') // ~noon in Tokyo, ~5am in Paris
    const paris = solarPosition(48.85, 2.35, at)
    const tokyo = solarPosition(35.68, 139.69, at)
    expect(tokyo.elevationDeg).toBeGreaterThan(45)
    expect(Math.abs(tokyo.elevationDeg - paris.elevationDeg)).toBeGreaterThan(30)
  })

  it('reports azimuth clockwise from north, ~south at solar noon', () => {
    const s = solarPosition(48.85, 2.35, utc('2026-06-21T11:52:00Z'))
    expect(s.azimuthDeg).toBeGreaterThanOrEqual(0)
    expect(s.azimuthDeg).toBeLessThan(360)
    expect(s.azimuthDeg).toBeGreaterThan(165)
    expect(s.azimuthDeg).toBeLessThan(195)
  })
})

describe('solarTimeString', () => {
  it('matches UTC on the prime meridian', () => {
    expect(solarTimeString(0, utc('2026-06-01T15:04:00Z'))).toBe('15:04')
  })

  it('adds ~9h20 in Tokyo and wraps past midnight', () => {
    expect(solarTimeString(139.69, utc('2026-06-01T15:04:00Z'))).toBe('00:22')
    expect(solarTimeString(-74, utc('2026-06-01T03:00:00Z'))).toBe('22:04')
  })
})
