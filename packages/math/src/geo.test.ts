import { describe, expect, it } from 'vitest'
import {
  geoToWorld,
  worldToGeo,
  setWorldOrigin,
  getWorldOrigin,
  isWorldOriginSet,
  geoDistanceMeters,
  DEFAULT_ORIGIN,
} from './geo.js'

const PARIS_2E = { latitude: 48.8648, longitude: 2.349 }
const TOKYO_SHIBUYA = { latitude: 35.6595, longitude: 139.7005 }
const SYDNEY_HARBOUR = { latitude: -33.8568, longitude: 151.2153 }

describe('world origin', () => {
  it('starts unset, then records the configured geo position', () => {
    expect(isWorldOriginSet()).toBe(false)
    setWorldOrigin(PARIS_2E)
    expect(isWorldOriginSet()).toBe(true)
    expect(getWorldOrigin()).toEqual({ latitude: PARIS_2E.latitude, longitude: PARIS_2E.longitude })
  })

  it('exposes a sane default origin', () => {
    expect(DEFAULT_ORIGIN.latitude).toBeGreaterThan(48)
    expect(DEFAULT_ORIGIN.latitude).toBeLessThan(49)
  })
})

describe('geoToWorld / worldToGeo', () => {
  it('maps the origin to (0, 0) on the ground plane', () => {
    setWorldOrigin(PARIS_2E)
    const p = geoToWorld(PARIS_2E)
    expect(p.x).toBeCloseTo(0, 10)
    expect(p.y).toBe(0)
    expect(p.z).toBeCloseTo(0, 10)
  })

  it('round-trips through world space within survey tolerance', () => {
    setWorldOrigin(PARIS_2E)
    for (const geo of [PARIS_2E, TOKYO_SHIBUYA, SYDNEY_HARBOUR]) {
      const back = worldToGeo(geoToWorld(geo))
      expect(back.latitude).toBeCloseTo(geo.latitude, 6)
      expect(back.longitude).toBeCloseTo(geo.longitude, 6)
    }
  })

  it('is deterministic: same GPS always yields same world position', () => {
    setWorldOrigin(PARIS_2E)
    const a = geoToWorld(TOKYO_SHIBUYA)
    setWorldOrigin(TOKYO_SHIBUYA)
    setWorldOrigin(PARIS_2E)
    expect(geoToWorld(TOKYO_SHIBUYA)).toEqual(a)
  })

  it('moves ~111 km per degree of latitude', () => {
    setWorldOrigin({ latitude: 0, longitude: 0 })
    const p = geoToWorld({ latitude: 1, longitude: 0 })
    // 1° latitude ≈ 110.6 km in Web Mercator; Z is negated (south = +Z).
    expect(Math.abs(p.z)).toBeGreaterThan(110_000)
    expect(Math.abs(p.z)).toBeLessThan(112_000)
    expect(p.x).toBeCloseTo(0, 6)
  })

  it('passes altitude through the Y axis', () => {
    setWorldOrigin(PARIS_2E)
    expect(geoToWorld({ ...PARIS_2E, altitude: 35 }).y).toBe(35)
    expect(worldToGeo({ x: 10, y: 35, z: -20 }).altitude).toBe(35)
  })
})

describe('geoDistanceMeters', () => {
  it('is zero for identical positions', () => {
    expect(geoDistanceMeters(PARIS_2E, PARIS_2E)).toBe(0)
  })

  it('measures ~111.2 km per degree of latitude', () => {
    const d = geoDistanceMeters({ latitude: 0, longitude: 0 }, { latitude: 1, longitude: 0 })
    expect(d).toBeGreaterThan(111_000)
    expect(d).toBeLessThan(111_400)
  })

  it('measures intercontinental distances (Paris → Tokyo ≈ 9 700 km)', () => {
    const d = geoDistanceMeters(PARIS_2E, TOKYO_SHIBUYA)
    expect(d).toBeGreaterThan(9_500_000)
    expect(d).toBeLessThan(10_000_000)
  })
})
