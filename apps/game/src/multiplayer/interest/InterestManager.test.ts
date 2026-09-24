import { describe, expect, it, vi, beforeEach } from 'vitest'
import { InterestManager, type InterestPoint } from './InterestManager.js'

function pt(x: number, z: number, geo?: InterestPoint['geo']): InterestPoint {
  return { position: { x, y: 0, z }, ...(geo ? { geo } : {}) }
}

describe('InterestManager (2 km radius, §8 ratified model)', () => {
  let interest: InterestManager
  beforeEach(() => {
    interest = new InterestManager()
  })

  it('includes nearby players on the same origin, excludes distant ones', () => {
    const all = new Map<string, InterestPoint>([
      ['near', pt(100, 0)],
      ['edge', pt(1999, 0)],
      ['far', pt(2500, 0)],
      ['self', pt(0, 0)],
    ])
    const ids = interest.getPlayersInRange(pt(0, 0), all, 'self')
    expect(ids).toContain('near')
    expect(ids).toContain('edge')
    expect(ids).not.toContain('far')
    expect(ids).not.toContain('self')
  })

  it('uses haversine geo distance across origins (raw XYZ incomparable)', () => {
    const paris = { latitude: 48.8648, longitude: 2.349 }
    const parisNearby = { latitude: 48.8653, longitude: 2.349 } // ~55 m north
    const tokyo = { latitude: 35.6595, longitude: 139.7005 }
    const origin = pt(999_999, -999_999, paris)
    const all = new Map<string, InterestPoint>([
      // Close on Earth, garbage XYZ (other local frame) → visible.
      ['neighbour', pt(-888_888, 777_777, parisNearby)],
      // Close XYZ but on the other side of the planet → hidden.
      ['stranger', pt(999_950, -999_950, tokyo)],
    ])
    const ids = interest.getPlayersInRange(origin, all, 'self')
    expect(ids).toEqual(['neighbour'])
  })

  it('falls back to raw XZ distance when geo is missing (older clients)', () => {
    const all = new Map<string, InterestPoint>([
      ['legacy-near', pt(50, 0)],
      ['legacy-far', pt(5000, 0)],
    ])
    const ids = interest.getPlayersInRange(pt(0, 0), all, 'self')
    expect(ids).toEqual(['legacy-near'])
  })

  it('returns an empty set when alone', () => {
    expect(interest.getPlayersInRange(pt(0, 0), new Map(), 'self')).toEqual([])
  })

  it('teleport scenario: same player id, new geo, same connection', () => {
    // Paris → Tokyo: the moved player drops out of the Paris set…
    const paris = { latitude: 48.8648, longitude: 2.349 }
    const tokyo = { latitude: 35.6595, longitude: 139.7005 }
    const all = new Map<string, InterestPoint>([['moved', pt(0, 0, tokyo)]])
    expect(interest.getPlayersInRange(pt(0, 0, paris), all, 'self')).toEqual([])
    // …and appears in the Tokyo set without reconnecting.
    expect(interest.getPlayersInRange(pt(10, 10, tokyo), all, 'self')).toEqual(['moved'])
  })

  it('does not depend on console or network', () => {
    const spy = vi.spyOn(console, 'log')
    interest.getPlayersInRange(pt(0, 0), new Map([['a', pt(1, 1)]]), 'self')
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })
})
