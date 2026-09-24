import { describe, expect, it } from 'vitest'
import { buildRoadGraph, findAStarPath, generateRoadPath } from './RoadGraph.js'
import type { Road } from '@world-drive/shared'

function road(id: string, highway: Road['highway'], pts: [number, number][]): Road {
  return {
    id,
    highway,
    lanes: 2,
    bridge: false,
    tunnel: false,
    layer: 0,
    elevationMode: 'ground',
    points: pts.map(([x, z]) => ({ x, y: 0, z })),
  }
}

const SEG_A = road('a', 'residential', [[0, 0], [100, 0]])
const SEG_B = road('b', 'residential', [[100, 0], [100, 100]])

describe('buildRoadGraph', () => {
  it('snaps shared endpoints into junction nodes with bidirectional edges', () => {
    const g = buildRoadGraph([SEG_A, SEG_B])
    expect(g.nodes.size).toBe(3)
    // 2 roads × forward + backward.
    expect(g.edges.size).toBe(4)
    for (const [nodeId, edgeIds] of g.adjacency) {
      expect(g.nodes.has(nodeId)).toBe(true)
      for (const e of edgeIds) expect(g.edges.has(e)).toBe(true)
    }
  })

  it('creates a single directed edge for motorways', () => {
    const g = buildRoadGraph([road('m', 'motorway', [[0, 0], [500, 0]])])
    expect(g.edges.size).toBe(1)
  })

  it('skips degenerate roads', () => {
    expect(buildRoadGraph([road('d', 'residential', [[0, 0]])]).nodes.size).toBe(0)
  })
})

describe('findAStarPath', () => {
  it('finds a route through connected segments', () => {
    const g = buildRoadGraph([SEG_A, SEG_B])
    const path = findAStarPath(g, { x: 5, y: 0, z: 2 }, { x: 98, y: 0, z: 95 })
    expect(path).not.toBeNull()
    expect(path!.length).toBeGreaterThanOrEqual(3)
    expect(path![0]).toEqual({ x: 5, y: 0, z: 2 })
    expect(path![path!.length - 1]).toEqual({ x: 98, y: 0, z: 95 })
  })

  it('returns null when start and target are disconnected', () => {
    const g = buildRoadGraph([SEG_A, road('far', 'residential', [[5000, 5000], [5100, 5000]])])
    expect(findAStarPath(g, { x: 5, y: 0, z: 0 }, { x: 5050, y: 0, z: 5000 })).toBeNull()
  })

  it('returns null for an empty graph', () => {
    const g = buildRoadGraph([])
    expect(findAStarPath(g, { x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 })).toBeNull()
  })
})

describe('generateRoadPath', () => {
  it('returns null without roads, waypoints otherwise', () => {
    expect(generateRoadPath([], { x: 0, y: 0, z: 0 })).toBeNull()
    const pts = generateRoadPath([SEG_A, SEG_B], { x: 5, y: 0, z: 0 })
    expect(pts).not.toBeNull()
    expect(pts!.length).toBeGreaterThanOrEqual(2)
  })
})
