import { describe, expect, it } from 'vitest'
import { deduplicateBuildings } from './deduplicate.js'
import type { Building } from '@world-drive/shared'

function building(id: string, dx: number): Building {
  return {
    id,
    footprint: [
      { x: dx, y: 0, z: 0 },
      { x: dx + 10, y: 0, z: 0 },
      { x: dx + 10, y: 0, z: 10 },
      { x: dx, y: 0, z: 10 },
    ],
    height: 12,
    levels: 4,
  }
}

describe('deduplicateBuildings', () => {
  it('collapses exact duplicate footprints', () => {
    expect(deduplicateBuildings([building('a', 0), building('b', 0)])).toHaveLength(1)
  })

  it('keeps disjoint buildings', () => {
    expect(deduplicateBuildings([building('a', 0), building('b', 1000)])).toHaveLength(2)
  })

  it('handles empty input', () => {
    expect(deduplicateBuildings([])).toEqual([])
  })
})
