/**
 * RoadGraph — directional road network graph for traffic & navigation.
 *
 * Nodes represent road endpoints and intersections.
 * Edges represent drivable road segments with geometry and speed limits.
 */

import type { Road, RoadNode, RoadEdge, RoadGraph } from '@world-drive/shared'
import type { WorldPosition } from '@world-drive/math'

/** Quantized key for snapping nearby road points into junction nodes (~1m grid). */
function nodeKey(pos: WorldPosition): string {
  const qx = Math.round(pos.x)
  const qz = Math.round(pos.z)
  return `${qx}:${qz}`
}

function distXZ(a: WorldPosition, b: WorldPosition): number {
  const dx = b.x - a.x
  const dz = b.z - a.z
  return Math.sqrt(dx * dx + dz * dz)
}

/**
 * Build a RoadGraph from loaded Road objects.
 * Connects contiguous ways at shared intersection nodes.
 */
export function buildRoadGraph(roads: Iterable<Road>): RoadGraph {
  const nodes = new Map<string, RoadNode>()
  const edges = new Map<string, RoadEdge>()
  const adjacency = new Map<string, string[]>()

  function getOrCreateNode(pos: WorldPosition): string {
    const key = nodeKey(pos)
    if (!nodes.has(key)) {
      nodes.set(key, { id: key, position: { x: pos.x, y: pos.y, z: pos.z } })
      adjacency.set(key, [])
    }
    return key
  }

  function addEdge(edge: RoadEdge): void {
    edges.set(edge.id, edge)
    const list = adjacency.get(edge.from) ?? []
    list.push(edge.id)
    adjacency.set(edge.from, list)
  }

  let counter = 0

  for (const road of roads) {
    const pts = road.points
    if (pts.length < 2) continue

    const fromNode = getOrCreateNode(pts[0]!)
    const toNode = getOrCreateNode(pts[pts.length - 1]!)

    let length = 0
    for (let i = 0; i < pts.length - 1; i++) {
      length += distXZ(pts[i]!, pts[i + 1]!)
    }

    const forwardId = `edge_${road.id}_fwd_${counter++}`
    addEdge({
      id: forwardId,
      from: fromNode,
      to: toNode,
      length,
      speedLimit: road.maxSpeed ?? 50,
      lanes: road.lanes,
    })

    // Bi-directional for non-motorways
    if (road.highway !== 'motorway') {
      const backwardId = `edge_${road.id}_rev_${counter++}`
      addEdge({
        id: backwardId,
        from: toNode,
        to: fromNode,
        length,
        speedLimit: road.maxSpeed ?? 50,
        lanes: road.lanes,
      })
    }
  }

  return { nodes, edges, adjacency }
}

/**
 * Generate a sequence of road waypoints through the graph starting at or near startPos.
 */
export function generateRoadPath(
  roads: Road[],
  startPos: WorldPosition,
  maxDistance = 250,
): WorldPosition[] | null {
  if (roads.length === 0) return null

  // Find the closest road to startPos
  let closestRoad: Road | null = null
  let closestDistSq = maxDistance * maxDistance

  for (const road of roads) {
    if (road.points.length < 2) continue
    for (const p of road.points) {
      const dx = p.x - startPos.x
      const dz = p.z - startPos.z
      const dSq = dx * dx + dz * dz
      if (dSq < closestDistSq) {
        closestDistSq = dSq
        closestRoad = road
      }
    }
  }

  if (!closestRoad) return null

  // Collect waypoints along this road and possibly connecting roads
  const waypoints: WorldPosition[] = closestRoad.points.map((p) => ({
    x: p.x,
    y: p.y + 0.1,
    z: p.z,
  }))

  return waypoints.length >= 2 ? waypoints : null
}

/**
 * A* search to find the shortest driving path through the RoadGraph
 * between two arbitrary world positions.
 */
export function findAStarPath(
  graph: RoadGraph,
  startPos: WorldPosition,
  targetPos: WorldPosition,
): WorldPosition[] | null {
  if (graph.nodes.size === 0) return null

  // Find nearest start and target node
  let startNodeId: string | null = null
  let startMinDistSq = Infinity
  let targetNodeId: string | null = null
  let targetMinDistSq = Infinity

  for (const [id, node] of graph.nodes) {
    const dStart = distXZ(node.position, startPos)
    const dStartSq = dStart * dStart
    if (dStartSq < startMinDistSq) {
      startMinDistSq = dStartSq
      startNodeId = id
    }
    const dTarget = distXZ(node.position, targetPos)
    const dTargetSq = dTarget * dTarget
    if (dTargetSq < targetMinDistSq) {
      targetMinDistSq = dTargetSq
      targetNodeId = id
    }
  }

  if (!startNodeId || !targetNodeId) return null
  if (startNodeId === targetNodeId) {
    const node = graph.nodes.get(startNodeId)!
    return [startPos, node.position, targetPos]
  }

  const targetNode = graph.nodes.get(targetNodeId)!

  const openSet = new Set<string>([startNodeId])
  const cameFrom = new Map<string, string>()
  const gScore = new Map<string, number>()
  gScore.set(startNodeId, 0)

  const fScore = new Map<string, number>()
  fScore.set(startNodeId, distXZ(graph.nodes.get(startNodeId)!.position, targetNode.position))

  while (openSet.size > 0) {
    let currentId: string | null = null
    let lowestF = Infinity
    for (const id of openSet) {
      const f = fScore.get(id) ?? Infinity
      if (f < lowestF) {
        lowestF = f
        currentId = id
      }
    }

    if (!currentId) break
    if (currentId === targetNodeId) {
      const path: WorldPosition[] = [targetPos]
      let curr: string | undefined = currentId
      while (curr) {
        const node = graph.nodes.get(curr)
        if (node) path.unshift(node.position)
        curr = cameFrom.get(curr)
      }
      path.unshift(startPos)
      return path
    }

    openSet.delete(currentId)
    const currentG = gScore.get(currentId) ?? Infinity
    const edgeIds = graph.adjacency.get(currentId) ?? []

    for (const edgeId of edgeIds) {
      const edge = graph.edges.get(edgeId)
      if (!edge) continue
      const neighborId = edge.to
      const tentativeG = currentG + edge.length

      if (tentativeG < (gScore.get(neighborId) ?? Infinity)) {
        cameFrom.set(neighborId, currentId)
        gScore.set(neighborId, tentativeG)
        const neighborNode = graph.nodes.get(neighborId)
        if (neighborNode) {
          const h = distXZ(neighborNode.position, targetNode.position)
          fScore.set(neighborId, tentativeG + h)
          openSet.add(neighborId)
        }
      }
    }
  }

  return null
}
