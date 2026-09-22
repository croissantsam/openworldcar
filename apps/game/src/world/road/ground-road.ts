import * as THREE from 'three'
import { buildCleanSidewalk } from './sidewalk.js'
import { buildJunctionCorners, type JunctionCorners, type TrimSeg } from './junction-corners.js'
import { armAsphaltGeometry } from './arm-asphalt.js'
import { buildRoadObstacles, analyseJunctions, type JunctionInfo, type RoadObstacleSeg, isPointInRoadAsphalt } from './junction.js'
import { computeRoadWidth } from './road-width.js'
import { getAsphaltMaterial, sidewalkWidthOf, isDrivableWay, elevClass } from './materials.js'
import { computePolylineNormals, resamplePolyline, type Pt, type PolylineNormal, type EndNormals, type Vec2 } from './geometry.js'
import { buildDashedLine, buildCrosswalk, buildStopLine, buildBicycleMarking, buildBusLaneMarking, buildParkingBays, buildRoadArrow } from './markings.js'
import { getStreetLampTemplate, getTrafficLightTemplate } from './templates.js'
import { extendArmEnds, continuationEndNormals, clampArmEndPoke } from './junction-helpers.js'
import { buildStrip } from './geometry.js'
import type { Road } from '@world-drive/shared'

export interface RoadPortion {
  pts: Pt[]
  openStart: boolean
  openEnd: boolean
  arcStart: number
}

export interface RoadGenerateOptions {
  cell?: { x: number; z: number }
  syntheticLamps?: boolean
}

export function generateGroundPortion(
  wholeRoad: Road,
  portion: RoadPortion,
  allRoads?: Road[],
  opts?: RoadGenerateOptions,
): THREE.Group | null {
  const rawPts0 = portion.pts
  if (rawPts0.length < 2) return null
  const road: Road = rawPts0 === wholeRoad.points ? wholeRoad : { ...wholeRoad, points: rawPts0 }
  const open: [boolean, boolean] = [portion.openStart, portion.openEnd]
  const arcOffset = portion.arcStart

  const hw = road.highway
  const surf = road.surface
  const isHighway = hw === 'motorway' || hw === 'trunk'
  const isMajor = hw === 'primary' || isHighway
  const isLink = road.isLink ?? false
  const isUrbanStreet = !isHighway && !isLink && hw !== 'path' && hw !== 'footway' && hw !== 'cycleway' && hw !== 'steps' && hw !== 'pedestrian' && hw !== 'track'

  const { roadW, lanes, halfW } = computeRoadWidth(road)
  const group = new THREE.Group()
  group.userData['roadId'] = road.id
  const isClosedLoop = Math.hypot(
    rawPts0[0]!.x - rawPts0[rawPts0.length - 1]!.x,
    rawPts0[0]!.z - rawPts0[rawPts0.length - 1]!.z,
  ) < 3.0

  const junction = analyseJunctions(road, allRoads)
  let obstacleCache: RoadObstacleSeg[] | null = null
  const getObstacles = (): RoadObstacleSeg[] => {
    if (!obstacleCache) obstacleCache = buildRoadObstacles(allRoads, road, junction)
    return obstacleCache
  }
  const rawPts = extendArmEnds(rawPts0, junction)
  const smoothPts = resamplePolyline(rawPts, 1.8)
  const endNormals = continuationEndNormals(smoothPts, junction)
  const normals = computePolylineNormals(smoothPts, endNormals)
  const raisedPts = smoothPts

  const arcTable: number[] = [0]
  for (let i = 1; i < smoothPts.length; i++) {
    arcTable.push(arcTable[i - 1]! + Math.hypot(smoothPts[i]!.x - smoothPts[i - 1]!.x, smoothPts[i]!.z - smoothPts[i - 1]!.z))
  }
  const roadLength = arcTable[arcTable.length - 1]!
  const pointAtArc = (s: number): { x: number; y: number; z: number; dx: number; dz: number } => {
    let i = 0
    while (i < smoothPts.length - 2 && arcTable[i + 1]! < s) i++
    const a = smoothPts[i]!; const b = smoothPts[i + 1]!
    const segL = arcTable[i + 1]! - arcTable[i]!
    const t = segL > 1e-6 ? Math.max(0, Math.min(1, (s - arcTable[i]!) / segL)) : 0
    let dx = b.x - a.x; let dz = b.z - a.z
    if (segL > 1e-6) { dx /= segL; dz /= segL } else { dx = 0; dz = 1 }
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t, dx, dz }
  }

  const asphaltMat = getAsphaltMaterial(hw, surf)
  const corners: JunctionCorners = junction.others.length > 0 && isDrivableWay(road)
    ? buildJunctionCorners(road, junction, smoothPts, arcTable, halfW, getObstacles())
    : { trims: { left: [], right: [] }, meshes: [], endTrim: [0, 0] }
  const inTrim = (side: 'left' | 'right', arc: number): boolean => {
    const list = corners.trims[side]
    for (let i = 0; i < list.length; i++) {
      const t = list[i]!
      if (arc >= t.a0 && arc <= t.a1) return true
    }
    return false
  }
  const orphanTrims = new Set<TrimSeg>()
  const addCornerMeshes = (): void => {
    for (const m of corners.meshes) {
      let orphan = false
      for (const t of orphanTrims) if (t.meshes.includes(m)) { orphan = true; break }
      if (!orphan) group.add(m)
    }
  }
  const endDisc: [number, number] = [0, 0]
  for (const e of [0, 1] as const) {
    const je = junction.ends[e]
    if (!je.isJunction || je.partner) continue
    let r = 0
    for (const a of je.arms) r = Math.max(r, computeRoadWidth(a.road).halfW)
    for (const t of je.through) r = Math.max(r, computeRoadWidth(t).halfW)
    endDisc[e] = r > 0 ? r + 0.5 : 0
  }
  const inEndDisc = (arc: number): boolean =>
    (endDisc[0] > 0 && arc < endDisc[0]) || (endDisc[1] > 0 && arc > roadLength - endDisc[1])
  const blockedAt = (margin: number, footprint = false, side?: 'left' | 'right'): ((x: number, z: number, arc: number) => boolean) | null =>
    junction.others.length === 0 ? null : (x: number, z: number, arc: number) =>
      (side !== undefined && inTrim(side, arc)) || (!footprint && inEndDisc(arc)) ||
      isPointInRoadAsphalt(x, z, getObstacles(), margin, footprint)

  const asphaltGeo = junction.others.length > 0 && isDrivableWay(road)
    ? armAsphaltGeometry(smoothPts, junction, halfW, getObstacles(), endNormals)
    : { pts: smoothPts, normals, trapezoid: [false, false] as [boolean, boolean] }
  const surface = buildStrip(asphaltGeo.pts, asphaltGeo.normals, halfW, 0.028, asphaltMat, hw === 'pedestrian' ? { uvMetres: 2.4, arcOffset } : { arcOffset })
  if (surface) {
    if (junction.others.length > 0 && !(asphaltGeo.trapezoid[0] && asphaltGeo.trapezoid[1])) {
      clampArmEndPoke(surface, asphaltGeo.pts, junction, getObstacles(), asphaltGeo.trapezoid)
    }
    surface.userData['roadId'] = road.id
    surface.renderOrder = 3
    group.add(surface)
  }

  if (hw === 'cycleway') {
    const cyclewayMat = new THREE.MeshStandardMaterial({
      color: 0x1f5c38, roughness: 0.85, metalness: 0.02,
      polygonOffset: true, polygonOffsetFactor: -2.0, polygonOffsetUnits: -2.0,
    })
    const cycleSurface = buildStrip(raisedPts, normals, halfW, 0.028, cyclewayMat, { arcOffset })
    if (cycleSurface) group.add(cycleSurface)
    const cycleEdge = buildStrip(raisedPts, normals, 0.06, 0.038, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.0, emissive: 0xffffff, emissiveIntensity: 0.22, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3.0, polygonOffsetUnits: -3.0 }), { lateral: halfW - 0.1, arcOffset })
    if (cycleEdge) group.add(cycleEdge)
    return group
  }

  if (hw === 'path' || hw === 'footway') {
    return group
  }

  if (road.isRoundabout && rawPts0.length >= 4 && isClosedLoop) {
    let sumX = 0, sumZ = 0
    for (const p of rawPts0) { sumX += p.x; sumZ += p.z }
    const cX = sumX / rawPts0.length
    const cZ = sumZ / rawPts0.length

    let avgR = 0
    for (const p of rawPts0) {
      avgR += Math.hypot(p.x - cX, p.z - cZ)
    }
    avgR /= rawPts0.length

    const innerR = Math.max(2.0, avgR - halfW)
    const islandGeo = new THREE.CylinderGeometry(innerR, innerR + 0.2, 0.28, 32)
    const grassMat = new THREE.MeshStandardMaterial({
      color: 0x2e6b2c, roughness: 0.95, metalness: 0.0,
    })
    const islandMesh = new THREE.Mesh(islandGeo, grassMat)
    islandMesh.position.set(cX, 0.14, cZ)
    islandMesh.receiveShadow = true
    group.add(islandMesh)

    const innerDecorGeo = new THREE.CylinderGeometry(innerR * 0.35, innerR * 0.4, 0.6, 24)
    const stoneMat = new THREE.MeshStandardMaterial({
      color: 0xd0cbc0, roughness: 0.85, metalness: 0.05,
    })
    const decorMesh = new THREE.Mesh(innerDecorGeo, stoneMat)
    decorMesh.position.set(cX, 0.35, cZ)
    decorMesh.castShadow = true
    group.add(decorMesh)
  }

  if (hw === 'pedestrian') {
    const swWidth = 1.5
    const capStart = !junction.ends[0].partner && !open[0]
    const capEnd = !junction.ends[1].partner && !open[1]
    const jEnds: [boolean, boolean] = [junction.ends[0].isJunction, junction.ends[1].isJunction]
    group.add(buildCleanSidewalk(raisedPts, normals, halfW, swWidth, 'left', getObstacles(), capStart, capEnd, [], arcOffset, jEnds))
    group.add(buildCleanSidewalk(raisedPts, normals, halfW, swWidth, 'right', getObstacles(), capStart, capEnd, [], arcOffset, jEnds))
    addCornerMeshes()
    return group
  }

  const CW_W = 1.6
  const CW_GAP = 0.25
  const CW_FOOT = CW_W + CW_GAP
  const BUS_W = 3.0
  const MIN_CAR_W = 2.6
  const cw = road.cycleway
  let cycleRight = false
  let cycleLeft = false
  if (isUrbanStreet && cw && cw !== 'none' && cw !== 'shared_lane') {
    if (cw === 'both') { cycleRight = true; cycleLeft = true }
    else if (cw === 'left') cycleLeft = true
    else if (cw === 'right') cycleRight = true
    else { cycleRight = true; cycleLeft = !road.oneway }
  }
  if (cycleLeft && cycleRight && roadW - 2 * CW_FOOT < MIN_CAR_W) cycleLeft = false
  if (cycleLeft && roadW - CW_FOOT < MIN_CAR_W) cycleLeft = false
  if (cycleRight && roadW - CW_FOOT < MIN_CAR_W) cycleRight = false
  let busLane = !!road.hasBusLane && isUrbanStreet
  if (busLane && roadW - BUS_W - (cycleRight ? CW_FOOT : 0) - (cycleLeft ? CW_FOOT : 0) < MIN_CAR_W) busLane = false
  const carMinus = -halfW + (cycleLeft ? CW_FOOT : 0)
  const carPlus = halfW - (cycleRight ? CW_FOOT : 0) - (busLane ? BUS_W : 0)
  const carW = Math.max(MIN_CAR_W, carPlus - carMinus)
  const carCenter = (carMinus + carPlus) / 2
  const carLanes = Math.max(1, Math.min(lanes, Math.floor(carW / MIN_CAR_W + 1e-6)))
  const laneW = carW / carLanes

  if (isUrbanStreet) {
    const gutterW = 0.24
    const gutterOffset = halfW - gutterW / 2
    const leftGutter = buildStrip(raisedPts, normals, gutterW / 2, 0.029, new THREE.MeshStandardMaterial({ color: 0x50545c, roughness: 0.82, metalness: 0.05, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2.0, polygonOffsetUnits: -2.0 }), { lateral: -gutterOffset, blocked: blockedAt(0.0, false, 'left'), arcOffset, minRun: 1.0 })
    const rightGutter = buildStrip(raisedPts, normals, gutterW / 2, 0.029, new THREE.MeshStandardMaterial({ color: 0x50545c, roughness: 0.82, metalness: 0.05, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2.0, polygonOffsetUnits: -2.0 }), { lateral: gutterOffset, blocked: blockedAt(0.0, false, 'right'), arcOffset, minRun: 1.0 })
    if (leftGutter)  { leftGutter.renderOrder = 3; group.add(leftGutter) }
    if (rightGutter) { rightGutter.renderOrder = 3; group.add(rightGutter) }
  }

  const tireTrackHalfW = 0.22
  const trackBlocked = blockedAt(0.3)
  for (let l = 0; l < carLanes; l++) {
    const laneCenter = carMinus + (l + 0.5) * laneW
    const wheel = Math.min(0.75, laneW / 2 - 0.4)
    const trackL = buildStrip(raisedPts, normals, tireTrackHalfW, 0.032, new THREE.MeshStandardMaterial({ color: 0x121316, roughness: 0.60, metalness: 0.06, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide }), { lateral: laneCenter - wheel, blocked: trackBlocked, arcOffset, minRun: 1.5 })
    const trackR = buildStrip(raisedPts, normals, tireTrackHalfW, 0.032, new THREE.MeshStandardMaterial({ color: 0x121316, roughness: 0.60, metalness: 0.06, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide }), { lateral: laneCenter + wheel, blocked: trackBlocked, arcOffset, minRun: 1.5 })
    if (trackL) { trackL.renderOrder = 3; group.add(trackL) }
    if (trackR) { trackR.renderOrder = 3; group.add(trackR) }
  }

  const edgeHalfW = 0.07
  const edgeOffset = isUrbanStreet ? halfW - 0.35 : halfW - 0.18
  if (!cycleLeft) {
    const leftEdge = buildStrip(raisedPts, normals, edgeHalfW, 0.040, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.0, emissive: 0xffffff, emissiveIntensity: 0.22, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3.0, polygonOffsetUnits: -3.0 }), { lateral: -edgeOffset, blocked: blockedAt(1.0, false, 'left'), arcOffset, minRun: 1.0 })
    if (leftEdge) { leftEdge.renderOrder = 4; group.add(leftEdge) }
  }
  if (!cycleRight && !busLane) {
    const rightEdge = buildStrip(raisedPts, normals, edgeHalfW, 0.040, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.0, emissive: 0xffffff, emissiveIntensity: 0.22, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3.0, polygonOffsetUnits: -3.0 }), { lateral: edgeOffset, blocked: blockedAt(1.0, false, 'right'), arcOffset, minRun: 1.0 })
    if (rightEdge) { rightEdge.renderOrder = 4; group.add(rightEdge) }
  }

  const markBlocked = blockedAt(0.5)
  if (isLink || road.oneway) {
    for (let l = 1; l < carLanes; l++) {
      const dividerOffset = carMinus + l * laneW
      const div = buildDashedLine(raisedPts, dividerOffset, 0.07, 0.040, isLink ? 4.0 : 3.0, 5.0, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.0, emissive: 0xffffff, emissiveIntensity: 0.22, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3.0, polygonOffsetUnits: -3.0 }), normals, markBlocked, arcOffset)
      if (div) { div.renderOrder = 4; group.add(div) }
    }
  } else if (lanes >= 4) {
    const doubleSep = 0.14
    const leftCenterLine = buildStrip(raisedPts, normals, 0.06, 0.040, new THREE.MeshStandardMaterial({ color: 0xffb800, roughness: 0.35, metalness: 0.0, emissive: 0xe6a000, emissiveIntensity: 0.25, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3.0, polygonOffsetUnits: -3.0 }), { lateral: carCenter - doubleSep, blocked: markBlocked, arcOffset, minRun: 1.0 })
    const rightCenterLine = buildStrip(raisedPts, normals, 0.06, 0.040, new THREE.MeshStandardMaterial({ color: 0xffb800, roughness: 0.35, metalness: 0.0, emissive: 0xe6a000, emissiveIntensity: 0.25, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3.0, polygonOffsetUnits: -3.0 }), { lateral: carCenter + doubleSep, blocked: markBlocked, arcOffset, minRun: 1.0 })
    if (leftCenterLine)  { leftCenterLine.renderOrder = 4; group.add(leftCenterLine) }
    if (rightCenterLine) { rightCenterLine.renderOrder = 4; group.add(rightCenterLine) }

    const divLeft = buildDashedLine(raisedPts, carCenter - carW / 4, 0.07, 0.040, 4.0, 5.0, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.0, emissive: 0xffffff, emissiveIntensity: 0.22, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3.0, polygonOffsetUnits: -3.0 }), normals, markBlocked, arcOffset)
    const divRight = buildDashedLine(raisedPts, carCenter + carW / 4, 0.07, 0.040, 4.0, 5.0, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.0, emissive: 0xffffff, emissiveIntensity: 0.22, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3.0, polygonOffsetUnits: -3.0 }), normals, markBlocked, arcOffset)
    if (divLeft)  { divLeft.renderOrder = 4; group.add(divLeft) }
    if (divRight) { divRight.renderOrder = 4; group.add(divRight) }
  } else if (lanes >= 2) {
    const centerDivider = buildDashedLine(raisedPts, carCenter, 0.07, 0.040, 3.0, 3.0, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.0, emissive: 0xffffff, emissiveIntensity: 0.22, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3.0, polygonOffsetUnits: -3.0 }), normals, markBlocked, arcOffset)
    if (centerDivider) { centerDivider.renderOrder = 4; group.add(centerDivider) }
  }

  const swMode = road.sidewalkMode ?? (isUrbanStreet ? 'both' : 'none')
  if (swMode !== 'none') {
    const swWidth = sidewalkWidthOf(road)
    const capStart = !junction.ends[0].partner && !open[0]
    const capEnd = !junction.ends[1].partner && !open[1]
    const jEnds: [boolean, boolean] = [junction.ends[0].isJunction, junction.ends[1].isJunction]
    if (swMode === 'both' || swMode === 'left') {
      group.add(buildCleanSidewalk(raisedPts, normals, halfW, swWidth, 'left', getObstacles(), capStart, capEnd, corners.trims.left, arcOffset, jEnds, orphanTrims))
    }
    if (swMode === 'both' || swMode === 'right') {
      group.add(buildCleanSidewalk(raisedPts, normals, halfW, swWidth, 'right', getObstacles(), capStart, capEnd, corners.trims.right, arcOffset, jEnds, orphanTrims))
    }
  }
  addCornerMeshes()

  if (cycleRight || cycleLeft) {
    const cwHalf = CW_W / 2
    const cwRightOffset = halfW - CW_GAP - cwHalf - (busLane ? BUS_W : 0)
    const cwLeftOffset = halfW - CW_GAP - cwHalf

    const addCycleLane = (side: 'right' | 'left', offset: number) => {
      const lat = (side === 'right' ? 1 : -1) * offset
      const laneBlocked = blockedAt(0.5, false, side)
      const cycleRibbon = buildStrip(raisedPts, normals, cwHalf, 0.038, new THREE.MeshStandardMaterial({ color: 0x1d6d42, roughness: 0.78, metalness: 0.04, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2.5, polygonOffsetUnits: -2.5 }), { lateral: lat, blocked: laneBlocked, arcOffset, minRun: 1.5 })
      if (cycleRibbon) {
        cycleRibbon.renderOrder = 4
        group.add(cycleRibbon)
      }

      const divOffset = (side === 'right' ? 1 : -1) * (offset - cwHalf)
      const whiteBorder = buildDashedLine(raisedPts, divOffset, 0.05, 0.039, 1.5, 1.5, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.0, emissive: 0xffffff, emissiveIntensity: 0.22, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3.0, polygonOffsetUnits: -3.0 }), normals, laneBlocked, arcOffset)
      if (whiteBorder) {
        whiteBorder.renderOrder = 4
        group.add(whiteBorder)
      }

      if (roadLength >= 20) {
        const numIcons = Math.max(1, Math.floor(roadLength / 25))
        for (let k = 1; k <= numIcons; k++) {
          const sIcon = k * (roadLength / (numIcons + 1))
          const p = pointAtArc(sIcon)
          const nx = -p.dz; const nz = p.dx
          const ix = p.x + nx * lat
          const iz = p.z + nz * lat
          if (laneBlocked && laneBlocked(ix, iz, sIcon)) continue
          group.add(buildBicycleMarking({ x: ix, y: p.y, z: iz }, { dx: p.dx, dz: p.dz }))
        }
      }
    }

    if (cycleRight) addCycleLane('right', cwRightOffset)
    if (cycleLeft) addCycleLane('left', cwLeftOffset)
  }

  if (busLane) {
    const busHalf = BUS_W / 2
    const busOffset = halfW - 0.25 - busHalf
    const busBlocked = blockedAt(0.5, false, 'right')
    const busRibbon = buildStrip(raisedPts, normals, busHalf, 0.035, new THREE.MeshStandardMaterial({ color: 0x4a2424, roughness: 0.80, metalness: 0.05, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2.5, polygonOffsetUnits: -2.5 }), { lateral: busOffset, blocked: busBlocked, arcOffset, minRun: 1.5 })
    if (busRibbon) {
      busRibbon.renderOrder = 3
      group.add(busRibbon)
    }

    const busSepOffset = halfW - 0.25 - BUS_W
    const busSep = buildStrip(raisedPts, normals, 0.12, 0.039, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.0, emissive: 0xffffff, emissiveIntensity: 0.22, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3.0, polygonOffsetUnits: -3.0 }), { lateral: busSepOffset, blocked: busBlocked, arcOffset, minRun: 1.0 })
    if (busSep) {
      busSep.renderOrder = 4
      group.add(busSep)
    }

    if (roadLength >= 25) {
      const numBusMarks = Math.max(1, Math.floor(roadLength / 35))
      for (let k = 1; k <= numBusMarks; k++) {
        const sMark = k * (roadLength / (numBusMarks + 1))
        const p = pointAtArc(sMark)
        const nx = -p.dz; const nz = p.dx
        const bx = p.x + nx * busOffset
        const bz = p.z + nz * busOffset
        if (busBlocked && busBlocked(bx, bz, sMark)) continue
        group.add(buildBusLaneMarking({ x: bx, y: p.y, z: bz }, { dx: p.dx, dz: p.dz }))
      }
    }
  }

  type CrossingPlacement = { x: number; y: number; z: number; dx: number; dz: number; arc: number; signals: boolean; markings: boolean; stopLine: boolean }
  type CrossingRec = NonNullable<Road['crossings']>[number]
  const crossingPlacements: CrossingPlacement[] = []
  const realCrossings = road.crossings ?? []
  const ZEBRA_HALF = 1.8
  const fpBlocked = blockedAt(0.3, true)
  const extentFrom = (sNode: number, dirSign: number): number => {
    if (!fpBlocked) return 0
    const lat = Math.max(0.5, halfW - 0.4)
    let d = sNode < 1 ? Math.max(corners.endTrim[0], endDisc[0]) : sNode > roadLength - 1 ? Math.max(corners.endTrim[1], endDisc[1]) : 0
    while (d < 40) {
      const s = sNode + dirSign * d
      if (s < 0 || s > roadLength) break
      const p = pointAtArc(s)
      const nx = -p.dz; const nz = p.dx
      if (!fpBlocked(p.x, p.z, s) && !fpBlocked(p.x + nx * lat, p.z + nz * lat, s) && !fpBlocked(p.x - nx * lat, p.z - nz * lat, s)) break
      d += 0.25
    }
    return d
  }
  const addPlacement = (s: number, forward: boolean, signals: boolean, markings: boolean, stopLine: boolean): void => {
    if ((s < ZEBRA_HALF + 0.2 && !open[0]) || (s > roadLength - ZEBRA_HALF - 0.2 && !open[1])) return
    if (s < -ZEBRA_HALF || s > roadLength + ZEBRA_HALF) return
    const p = pointAtArc(s)
    crossingPlacements.push({
      x: p.x, y: p.y, z: p.z,
      dx: forward ? p.dx : -p.dx, dz: forward ? p.dz : -p.dz,
      arc: s, signals, markings, stopLine,
    })
  }
  const crossingIsDrawn = (c: CrossingRec): boolean => {
    const m = c.markings
    const no = m === 'no' || m === 'unmarked' || m === 'informal'
    return c.signals || (m !== undefined && !no)
  }

  if (isUrbanStreet && realCrossings.length > 0 && roadLength >= 8) {
    for (const c of realCrossings) {
      const m = c.markings
      const noMarkings = m === 'no' || m === 'unmarked' || m === 'informal'
      const drawMarkings = m === undefined ? c.signals : !noMarkings
      if (!drawMarkings && !c.signals) continue

      let bestArc = 0
      let bestD = Infinity
      for (let i = 0; i < smoothPts.length - 1; i++) {
        const a = smoothPts[i]!; const b = smoothPts[i + 1]!
        const sdx = b.x - a.x; const sdz = b.z - a.z
        const lenSq = sdx * sdx + sdz * sdz
        if (lenSq < 1e-6) continue
        let t = ((c.position.x - a.x) * sdx + (c.position.z - a.z) * sdz) / lenSq
        t = Math.max(0, Math.min(1, t))
        const d = Math.hypot(c.position.x - (a.x + sdx * t), c.position.z - (a.z + sdz * t))
        if (d < bestD) { bestD = d; bestArc = arcTable[i]! + Math.sqrt(lenSq) * t }
      }
      if (bestD > 6) continue

      if ((open[0] && bestArc < 0.05) || (open[1] && bestArc > roadLength - 0.05)) continue
      const atStart = bestArc < 1.5 && !open[0]
      const atEnd = bestArc > roadLength - 1.5 && !open[1]
      let markingsHere = drawMarkings
      if (m === undefined && realCrossings.some((oc: CrossingRec) => oc !== c && oc.markings !== undefined &&
        Math.hypot(oc.position.x - c.position.x, oc.position.z - c.position.z) < 20)) markingsHere = false
      if (atStart || atEnd) {
        const je = junction.ends[atStart ? 0 : 1]
        const partner = je.partner && je.partner !== road ? je.partner : null
        if (m === undefined && !je.isJunction) continue
        if (!je.isJunction && !partner) continue
        if (realCrossings.some((oc: CrossingRec) => oc !== c && crossingIsDrawn(oc) && (() => {
          const d = Math.hypot(oc.position.x - je.node.x, oc.position.z - je.node.z)
          return d > 1.5 && d < 8
        })())) continue
        if (partner) {
          if (partner.crossings?.some((oc: any) => oc.nodeId === c.nodeId)) {
            const pEnd = partner.points[partner.points.length - 1]!
            const pEndsHere = Math.hypot(pEnd.x - je.node.x, pEnd.z - je.node.z) < 0.8
            const myScore = atEnd ? (road.oneway ? 2 : 1) : 0
            const pScore = pEndsHere ? (partner.oneway ? 2 : 1) : 0
            if (pScore > myScore || (pScore === myScore && (partner.id < road.id))) continue
          }
          if (partner.crossings?.some((oc: any) => oc.nodeId !== c.nodeId && crossingIsDrawn(oc) && (() => {
            const d = Math.hypot(oc.position.x - je.node.x, oc.position.z - je.node.z)
            return d > 1.5 && d < 8
          })())) continue
        }
        if (!je.isJunction) {
          const s = atStart ? ZEBRA_HALF + 0.3 : roadLength - ZEBRA_HALF - 0.3
          addPlacement(s, true, c.signals, markingsHere, c.signals)
          if (c.signals && !road.oneway) addPlacement(s, false, true, false, true)
          continue
        }
        const extent = extentFrom(atStart ? 0 : roadLength, atStart ? 1 : -1)
        const s = atStart ? extent + ZEBRA_HALF + 1.0 : roadLength - extent - ZEBRA_HALF - 1.0
        const approaches = atEnd || !road.oneway
        addPlacement(s, atEnd || !!road.oneway, c.signals, markingsHere, c.signals && approaches)
        continue
      }

      const nodeIsJunction = junction.others.some((r) => {
        const s0 = r.points[0]!; const s1 = r.points[r.points.length - 1]!
        return Math.hypot(s0.x - c.position.x, s0.z - c.position.z) < 0.8 || Math.hypot(s1.x - c.position.x, s1.z - c.position.z) < 0.8
      })
      if (!nodeIsJunction) {
        const s = Math.max(open[0] ? -Infinity : ZEBRA_HALF + 0.3, Math.min(open[1] ? Infinity : roadLength - ZEBRA_HALF - 0.3, bestArc))
        addPlacement(s, true, c.signals, drawMarkings, c.signals)
        if (c.signals && !road.oneway) addPlacement(s, false, true, false, true)
      } else {
        const before = extentFrom(bestArc, -1)
        const after = extentFrom(bestArc, 1)
        addPlacement(bestArc - before - ZEBRA_HALF - 1.0, true, c.signals, markingsHere, c.signals)
        addPlacement(bestArc + after + ZEBRA_HALF + 1.0, !!road.oneway, c.signals, markingsHere, c.signals && !road.oneway)
      }
    }
  } else if (isUrbanStreet && realCrossings.length === 0 && roadLength >= 60 && !open[0] &&
    (hw === 'primary' || hw === 'secondary' || hw === 'tertiary') &&
    !(allRoads && allRoads.some((r) => r.crossings && r.crossings.length > 0))) {
    const extent = extentFrom(0, 1)
    const s = Math.max(extent + ZEBRA_HALF + 1.0, Math.min(14, roadLength * 0.35))
    const signals = junction.ends[0].isJunction
    addPlacement(s, !!road.oneway, signals, true, signals && !road.oneway)
  }

  crossingPlacements.sort((a, b) => a.arc - b.arc)
  for (let i = crossingPlacements.length - 1; i > 0; i--) {
    const a = crossingPlacements[i - 1]!
    const b = crossingPlacements[i]!
    if (b.arc - a.arc < 4 && a.dx * b.dx + a.dz * b.dz > 0) {
      a.signals = a.signals || b.signals
      a.markings = a.markings || b.markings
      a.stopLine = a.stopLine || b.stopLine
      crossingPlacements.splice(i, 1)
    }
  }

  if (isUrbanStreet && road.parkingLane && road.parkingLane !== 'none' && roadLength >= 15) {
    if (road.parkingLane === 'both' || road.parkingLane === 'right') {
      const baysR = buildParkingBays(raisedPts, normals, halfW, 'right', roadLength, blockedAt(1.0, false, 'right'), arcOffset)
      if (baysR) group.add(baysR)
    }
    if (road.parkingLane === 'both' || road.parkingLane === 'left') {
      const baysL = buildParkingBays(raisedPts, normals, halfW, 'left', roadLength, blockedAt(1.0, false, 'left'), arcOffset)
      if (baysL) group.add(baysL)
    }

    // Parked cars disabled for now (visual-only, no gameplay use yet).
    // See ParkedCarGenerator.buildParkedCars to re-enable per-road parking.
  }

  const poleBlocked = blockedAt(0.5)
  for (const cp of crossingPlacements) {
    const dir = { dx: cp.dx, dz: cp.dz }
    const norm = { nx: -cp.dz, nz: cp.dx }

    if (cp.markings) {
      const crosswalk = buildCrosswalk(cp, dir, halfW)
      if (crosswalk) {
        crosswalk.renderOrder = 4
        crosswalk.userData['crossing'] = { arc: cp.arc, x: cp.x, z: cp.z, signals: cp.signals, stopLine: cp.stopLine }
        group.add(crosswalk)
      }
    }

    if (cp.signals && cp.stopLine) {
      const stopPt = { x: cp.x - dir.dx * 2.5, y: cp.y, z: cp.z - dir.dz * 2.5 }
      const stopLine = buildStopLine(stopPt, dir, halfW, !!road.oneway || isLink)
      if (stopLine) { stopLine.renderOrder = 4; group.add(stopLine) }

      const px = cp.x + norm.nx * (halfW + 0.8)
      const pz = cp.z + norm.nz * (halfW + 0.8)
      if (!poleBlocked || !poleBlocked(px, pz, cp.arc)) {
        const signalPole = getTrafficLightTemplate().clone()
        signalPole.position.set(px, cp.y, pz)
        signalPole.rotation.y = Math.atan2(dir.dx, dir.dz) + Math.PI / 2
        group.add(signalPole)
      }
    }
  }

  if (!isLink && roadLength >= 35) {
    const arrowBlocked = blockedAt(1.0)
    const ARROW_CLEAR = ZEBRA_HALF + 4.5
    const clearOfCrossings = (s: number): boolean =>
      crossingPlacements.every((cp) => Math.abs(s - cp.arc) >= ARROW_CLEAR)
    let sArrow = roadLength * 0.65
    if (!clearOfCrossings(sArrow)) {
      const candidates = [0.5, 0.8, 0.35, 0.9, 0.25].map((f) => roadLength * f)
      sArrow = candidates.find((s) => clearOfCrossings(s)) ?? -1
    }
    if (sArrow < 0) sArrow = Number.NaN
    const p = pointAtArc(Number.isNaN(sArrow) ? 0 : sArrow)
    const norm = { nx: -p.dz, nz: p.dx }
    const putArrow = (lat: number, forward: boolean): void => {
      if (Number.isNaN(sArrow)) return
      const pt = { x: p.x + norm.nx * lat, y: p.y, z: p.z + norm.nz * lat }
      if (arrowBlocked && arrowBlocked(pt.x, pt.z, sArrow)) return
      group.add(buildRoadArrow(pt, forward ? { dx: p.dx, dz: p.dz } : { dx: -p.dx, dz: -p.dz }))
    }
    if (road.oneway) {
      for (let l = 0; l < carLanes; l++) putArrow(carMinus + (l + 0.5) * laneW, true)
    } else if (lanes >= 4) {
      putArrow(carCenter + carW / 4, true)
      putArrow(carCenter - carW / 4, false)
    }
  }

  if (opts?.syntheticLamps !== false && swMode !== 'none' && !isHighway && !isLink && (road.lit || isUrbanStreet) && roadLength >= 35) {
    const lampTmpl = getStreetLampTemplate()
    const lampBlocked = blockedAt(1.0)
    const lampSpacing = 32
    const numLamps = Math.min(8, Math.max(1, Math.floor(roadLength / lampSpacing)))
    for (let k = 1; k <= numLamps; k++) {
      const sLamp = k * (roadLength / (numLamps + 1))
      const p = pointAtArc(sLamp)
      const nx = -p.dz; const nz = p.dx
      const lampSide = k % 2 === 0 ? 1 : -1
      if (lampSide > 0 ? swMode === 'left' : swMode === 'right') continue
      const lx = p.x + nx * (halfW + 0.8) * lampSide
      const lz = p.z + nz * (halfW + 0.8) * lampSide
      if (lampBlocked && lampBlocked(lx, lz, sLamp)) continue
      if (inTrim(lampSide > 0 ? 'right' : 'left', sLamp)) continue
      const lamp = lampTmpl.clone()
      lamp.position.set(lx, p.y, lz)
      lamp.rotation.y = Math.atan2(p.dx, p.dz) + (lampSide > 0 ? Math.PI / 2 : -Math.PI / 2)
      group.add(lamp)
    }
  }

  return group
}

export { buildCleanSidewalk } from './sidewalk.js'
export { buildJunctionCorners, type JunctionCorners, type TrimSeg } from './junction-corners.js'
export { armAsphaltGeometry } from './arm-asphalt.js'
export { buildRoadObstacles, analyseJunctions, type JunctionInfo, type RoadObstacleSeg, isPointInRoadAsphalt } from './junction.js'
export { computeRoadWidth } from './road-width.js'
export { getAsphaltMaterial, sidewalkWidthOf, isDrivableWay, elevClass } from './materials.js'
export { computePolylineNormals, resamplePolyline, type Pt, type PolylineNormal, type EndNormals, type Vec2, buildStrip } from './geometry.js'
export { buildDashedLine, buildCrosswalk, buildStopLine, buildBicycleMarking, buildBusLaneMarking, buildParkingBays, buildRoadArrow } from './markings.js'
export { getStreetLampTemplate, getTrafficLightTemplate } from './templates.js'
export { extendArmEnds, continuationEndNormals, clampArmEndPoke } from './junction-helpers.js'