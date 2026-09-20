import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import type { Road } from '@world-drive/shared'
import { computeElevatedBridgePoints, computeTunnelPoints } from './elevation.js'
import { checkElevationConnections, elevClass } from './materials.js'
import { computeRoadWidth } from './road-width.js'
import { computePolylineNormals, resamplePolyline, type Pt } from './geometry.js'
import { generateGroundPortion, type RoadPortion, type RoadGenerateOptions } from './ground-road.js'
import { buildBridgeDeckMesh, buildBridgePiers } from './bridge.js'
import { buildTunnelTrenchMask, buildTunnelTrenchWalls, buildTunnelPortals, buildTunnelTube, buildTunnelLighting } from './tunnel.js'
import { clipGroupToCell, roadPortions, buildCellOf } from './colliders.js'
import { getAsphaltMaterial } from './materials.js'
import { buildRibbon, shiftRibbonLateral } from './geometry.js'
import { WHITE_MARK, YELLOW_MARK } from './materials.js'

export class RoadMeshGenerator {
  static generate(road: Road, allRoads?: Road[], opts?: RoadGenerateOptions): THREE.Group | null {
    const pts = road.points
    if (pts.length < 2) return null

    if (road.elevationMode === 'bridge' || road.bridge) {
      const g = RoadMeshGenerator.generateBridgeRoad(road, allRoads)
      const cell = buildCellOf(allRoads, opts)
      return g && cell ? clipGroupToCell(g, cell) : g
    }

    if (road.elevationMode === 'tunnel' || road.tunnel) {
      const g = RoadMeshGenerator.generateTunnelRoad(road, allRoads)
      const cell = buildCellOf(allRoads, opts)
      return g && cell ? clipGroupToCell(g, cell) : g
    }

    return RoadMeshGenerator.generateGroundRoad(road, allRoads, opts)
  }

  static createColliderDescs(road: Road, allRoads?: Road[]): RAPIER.ColliderDesc[] {
    const descs: RAPIER.ColliderDesc[] = []
    const pts = road.points
    if (pts.length < 2) return descs

    if (road.elevationMode === 'bridge' || road.bridge) {
      const { halfW } = computeRoadWidth(road)
      const bridgeHeight = road.bridgeHeight ?? (road.layer > 1 ? road.layer * 4.5 : 4.5)
      const { connectsStart, connectsEnd } = checkElevationConnections(road, allRoads)

      const { points: raisedPts } = computeElevatedBridgePoints(pts, bridgeHeight, connectsStart, connectsEnd)
      const N = raisedPts.length
      if (N < 2) return descs
      const normals = computePolylineNormals(raisedPts)

      const deckVerts: number[] = []
      const deckIdx: number[] = []

      for (let i = 0; i < N; i++) {
        const curr = raisedPts[i]!
        const norm = normals[i]!
        const nx = norm.nx
        const nz = norm.nz
        const miter = norm.miter
        const w = halfW * miter

        deckVerts.push(
          curr.x + nx * w, curr.y, curr.z + nz * w,
          curr.x - nx * w, curr.y, curr.z - nz * w,
        )

        if (i < N - 1) {
          const b = i * 2
          deckIdx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2)
          deckIdx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3)
        }
      }

      if (deckVerts.length >= 9 && deckIdx.length >= 3) {
        const deckCol = RAPIER.ColliderDesc.trimesh(
          new Float32Array(deckVerts),
          new Uint32Array(deckIdx),
        ).setFriction(0.3).setRestitution(0.0)
        descs.push(deckCol)
      }
    } else if (road.elevationMode === 'tunnel' || road.tunnel) {
      const { halfW } = computeRoadWidth(road)
      const depth = road.layer && road.layer < 0 ? Math.min(-4.5, road.layer * 4.5) : -4.8
      const { connectsStart, connectsEnd } = checkElevationConnections(road, allRoads)

      const { points: tunnelPts } = computeTunnelPoints(pts, depth, connectsStart, connectsEnd)
      const N = tunnelPts.length
      if (N < 2) return descs
      const normals = computePolylineNormals(tunnelPts)

      const floorVerts: number[] = []
      const floorIdx: number[] = []

      for (let i = 0; i < N; i++) {
        const curr = tunnelPts[i]!
        const norm = normals[i]!
        const nx = norm.nx
        const nz = norm.nz
        const miter = norm.miter
        const w = halfW * miter

        floorVerts.push(
          curr.x + nx * w, curr.y, curr.z + nz * w,
          curr.x - nx * w, curr.y, curr.z - nz * w,
        )

        if (i < N - 1) {
          const b = i * 2
          floorIdx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2)
          floorIdx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3)
        }
      }

      if (floorVerts.length >= 9 && floorIdx.length >= 3) {
        const floorCol = RAPIER.ColliderDesc.trimesh(
          new Float32Array(floorVerts),
          new Uint32Array(floorIdx),
        ).setFriction(0.3).setRestitution(0.0)
        descs.push(floorCol)
      }

      const wallVerts: number[] = []
      const wallIdx: number[] = []

      for (let i = 0; i < N; i++) {
        const curr = tunnelPts[i]!
        const norm = normals[i]!
        const nx = norm.nx
        const nz = norm.nz
        const miter = norm.miter
        const tW = (halfW + 0.22) * miter
        const topY = 0.14

        wallVerts.push(
          curr.x + nx * tW, curr.y, curr.z + nz * tW,
          curr.x + nx * tW, topY, curr.z + nz * tW,
        )
        wallVerts.push(
          curr.x - nx * tW, curr.y, curr.z - nz * tW,
          curr.x - nx * tW, topY, curr.z - nz * tW,
        )

        if (i < N - 1) {
          const lb = i * 4
          wallIdx.push(lb, lb + 1, lb + 4, lb + 1, lb + 5, lb + 4)
          wallIdx.push(lb, lb + 4, lb + 1, lb + 1, lb + 4, lb + 5)
          const rb = i * 4 + 2
          wallIdx.push(rb, rb + 1, rb + 4, rb + 1, rb + 5, rb + 4)
          wallIdx.push(rb, rb + 4, rb + 1, rb + 1, rb + 4, rb + 5)
        }
      }

      if (wallVerts.length >= 9 && wallIdx.length >= 3) {
        const wallCol = RAPIER.ColliderDesc.trimesh(
          new Float32Array(wallVerts),
          new Uint32Array(wallIdx),
        ).setFriction(0.1).setRestitution(0.05)
        descs.push(wallCol)
      }
    } else {
      const { halfW } = computeRoadWidth(road)
      for (const portion of roadPortions(road, allRoads)) {
        const smoothPts = resamplePolyline(portion.pts, 1.8)
        const N = smoothPts.length
        if (N >= 2) {
          const normals = computePolylineNormals(smoothPts)
          const roadVerts: number[] = []
          const roadIdx: number[] = []
          const ROAD_Y = 0.028
          for (let i = 0; i < N; i++) {
            const curr = smoothPts[i]!
            const norm = normals[i]!
            const nx = norm.nx
            const nz = norm.nz
            const miter = norm.miter
            const w = halfW * miter

            roadVerts.push(
              curr.x + nx * w, ROAD_Y, curr.z + nz * w,
              curr.x - nx * w, ROAD_Y, curr.z - nz * w,
            )
            if (i < N - 1) {
              const b = i * 2
              roadIdx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2)
              roadIdx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3)
            }
          }
          if (roadVerts.length >= 9 && roadIdx.length >= 3) {
            const roadCol = RAPIER.ColliderDesc.trimesh(
              new Float32Array(roadVerts),
              new Uint32Array(roadIdx),
            ).setFriction(0.35).setRestitution(0.0)
            descs.push(roadCol)
          }
        }
      }
    }

    return descs
  }

  static generateBridgeRoad(road: Road, allRoads?: Road[]): THREE.Group | null {
    const pts = road.points
    if (pts.length < 2) return null

    const group = new THREE.Group()
    group.userData['roadId'] = road.id

    const hw = road.highway
    const surf = road.surface
    const { roadW, lanes, halfW } = computeRoadWidth(road)
    const bridgeHeight = road.bridgeHeight ?? (road.layer > 1 ? road.layer * 4.5 : 4.5)
    const { connectsStart, connectsEnd } = checkElevationConnections(road, allRoads)

    const { points: raisedPts, totalLength: L, rampLength: R } = computeElevatedBridgePoints(
      pts,
      bridgeHeight,
      connectsStart,
      connectsEnd,
    )

    const surface = buildRibbon(raisedPts, halfW, 0.0, getAsphaltMaterial(hw, surf))
    if (surface) {
      surface.userData['roadId'] = road.id
      surface.renderOrder = 4
      group.add(surface)
    }

    const leftEdge = buildRibbon(raisedPts, 0.09, 0.005, WHITE_MARK)
    if (leftEdge) {
      shiftRibbonLateral(leftEdge, raisedPts, halfW - 0.15)
      leftEdge.renderOrder = 5
      group.add(leftEdge)
    }
    const rightEdge = buildRibbon(raisedPts, 0.09, 0.005, WHITE_MARK)
    if (rightEdge) {
      shiftRibbonLateral(rightEdge, raisedPts, -(halfW - 0.15))
      rightEdge.renderOrder = 5
      group.add(rightEdge)
    }

    if (road.isLink || road.oneway) {
      if (lanes >= 2) {
        for (let l = 1; l < lanes; l++) {
          const divOffset = -halfW + l * (roadW / lanes)
          const div = buildRibbon(raisedPts, 0.08, 0.005, WHITE_MARK)
          if (div) {
            shiftRibbonLateral(div, raisedPts, divOffset)
            div.renderOrder = 5
            group.add(div)
          }
        }
      }
    } else if (lanes >= 4) {
      const yellowDiv = buildRibbon(raisedPts, 0.10, 0.005, YELLOW_MARK)
      if (yellowDiv) {
        yellowDiv.renderOrder = 5
        group.add(yellowDiv)
      }
    } else if (lanes >= 2) {
      const dashedCenter = buildRibbon(raisedPts, 0.08, 0.005, WHITE_MARK)
      if (dashedCenter) {
        dashedCenter.renderOrder = 5
        group.add(dashedCenter)
      }
    }

    const deckMesh = buildBridgeDeckMesh(raisedPts, halfW, 0.85)
    if (deckMesh) group.add(deckMesh)

    const piers = buildBridgePiers(raisedPts, halfW, L, R)
    if (piers) group.add(piers)

    return group
  }

  static generateTunnelRoad(road: Road, allRoads?: Road[]): THREE.Group | null {
    const pts = road.points
    if (pts.length < 2) return null

    const group = new THREE.Group()
    group.userData['roadId'] = road.id

    const hw = road.highway
    const surf = road.surface
    const { roadW, lanes, halfW } = computeRoadWidth(road)
    const depth = road.layer && road.layer < 0 ? Math.min(-4.5, road.layer * 4.5) : -4.8
    const { connectsStart, connectsEnd } = checkElevationConnections(road, allRoads)

    const { points: tunnelPts, totalLength: L, rampLength: R } = computeTunnelPoints(
      pts,
      depth,
      connectsStart,
      connectsEnd,
    )

    const trenchMask = buildTunnelTrenchMask(tunnelPts, halfW, L, R)
    if (trenchMask) group.add(trenchMask)

    const surface = buildRibbon(tunnelPts, halfW, 0.0, getAsphaltMaterial(hw, surf))
    if (surface) {
      surface.userData['roadId'] = road.id
      surface.renderOrder = 3
      group.add(surface)
    }

    const leftEdge = buildRibbon(tunnelPts, 0.09, 0.005, WHITE_MARK)
    if (leftEdge) {
      shiftRibbonLateral(leftEdge, tunnelPts, halfW - 0.15)
      leftEdge.renderOrder = 4
      group.add(leftEdge)
    }
    const rightEdge = buildRibbon(tunnelPts, 0.09, 0.005, WHITE_MARK)
    if (rightEdge) {
      shiftRibbonLateral(rightEdge, tunnelPts, -(halfW - 0.15))
      rightEdge.renderOrder = 4
      group.add(rightEdge)
    }

    if (road.isLink || road.oneway) {
      if (lanes >= 2) {
        for (let l = 1; l < lanes; l++) {
          const divOffset = -halfW + l * (roadW / lanes)
          const div = buildRibbon(tunnelPts, 0.08, 0.005, WHITE_MARK)
          if (div) {
            shiftRibbonLateral(div, tunnelPts, divOffset)
            div.renderOrder = 4
            group.add(div)
          }
        }
      }
    } else if (lanes >= 4) {
      const yellowDiv = buildRibbon(tunnelPts, 0.10, 0.005, YELLOW_MARK)
      if (yellowDiv) {
        yellowDiv.renderOrder = 4
        group.add(yellowDiv)
      }
    } else if (lanes >= 2) {
      const dashedCenter = buildRibbon(tunnelPts, 0.08, 0.005, WHITE_MARK)
      if (dashedCenter) {
        dashedCenter.renderOrder = 4
        group.add(dashedCenter)
      }
    }

    const trenchWalls = buildTunnelTrenchWalls(tunnelPts, halfW, L, R)
    if (trenchWalls) group.add(trenchWalls)

    const tube = buildTunnelTube(tunnelPts, halfW, L, R)
    if (tube) group.add(tube)

    const portals = buildTunnelPortals(tunnelPts, halfW, L, R)
    if (portals) group.add(portals)

    const lights = buildTunnelLighting(tunnelPts, L, R)
    if (lights) group.add(lights)

    return group
  }

  static generateGroundRoad(road: Road, allRoads?: Road[], opts?: RoadGenerateOptions): THREE.Group | null {
    if (road.points.length < 2) return null
    const portions = roadPortions(road, allRoads, opts)
    if (portions.length === 0) return null
    if (portions.length === 1 && !portions[0]!.openStart && !portions[0]!.openEnd) {
      return generateGroundPortion(road, portions[0]!, allRoads, opts)
    }
    const group = new THREE.Group()
    group.userData['roadId'] = road.id
    for (const portion of portions) {
      const sub = generateGroundPortion(road, portion, allRoads, opts)
      if (sub) group.add(sub)
    }
    return group.children.length > 0 ? group : null
  }
}

export { generateGroundPortion, type RoadPortion, type RoadGenerateOptions } from './ground-road.js'