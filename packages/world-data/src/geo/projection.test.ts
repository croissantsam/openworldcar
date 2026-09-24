import { describe, expect, it, beforeAll } from 'vitest'
import { setWorldOrigin } from '@world-drive/math'
import { geoBoundingBox, lonLatArrayToWorld, metersPerDegreeAt } from './projection.js'

beforeAll(() => {
  setWorldOrigin({ latitude: 48.8648, longitude: 2.349 })
})

describe('geoBoundingBox', () => {
  it('returns an ordered bbox containing the centre', () => {
    const lat = 48.85
    const lon = 2.35
    const [south, west, north, east] = geoBoundingBox({ latitude: lat, longitude: lon }, 1000)
    expect(south).toBeLessThan(lat)
    expect(north).toBeGreaterThan(lat)
    expect(west).toBeLessThan(lon)
    expect(east).toBeGreaterThan(lon)
    // ~1 km half-extent in degrees at Paris latitude.
    expect(north - south).toBeGreaterThan(0.015)
    expect(north - south).toBeLessThan(0.025)
  })
})

describe('lonLatArrayToWorld / metersPerDegreeAt', () => {
  it('projects every coordinate pair', () => {
    const pts = lonLatArrayToWorld([
      [2.349, 48.8648],
      [2.35, 48.8649],
    ])
    expect(pts).toHaveLength(2)
    // First point is ~at the origin (within tens of metres).
    expect(Math.hypot(pts[0]!.x, pts[0]!.z)).toBeLessThan(200)
  })

  it('reports positive degree scales', () => {
    const m = metersPerDegreeAt(48.85)
    expect(m.lat).toBeGreaterThan(110_000)
    expect(m.lon).toBeGreaterThan(70_000)
    expect(m.lon).toBeLessThan(m.lat)
  })
})
