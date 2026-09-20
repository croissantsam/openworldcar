import type { Road } from '@world-drive/shared'
import { LANE_WIDTH } from './materials.js'

export function computeRoadWidth(road: Road): { roadW: number; lanes: number; halfW: number } {
  const hw = road.highway
  const isHighway = hw === 'motorway' || hw === 'trunk'
  const isMajor = hw === 'primary' || isHighway

  let lanes = road.lanes
  if (!lanes) {
    if (road.isLink) {
      lanes = 1
    } else if (hw === 'service' || hw === 'track') {
      lanes = 1
    } else if (road.oneway) {
      lanes = 1
    } else if (isMajor) {
      lanes = 4
    } else if (hw === 'pedestrian') {
      lanes = 3
    } else {
      lanes = 2
    }
  }

  let roadW: number
  if (road.isLink) {
    const baseW = lanes >= 2 ? 6.4 : 4.8
    roadW = road.explicitWidth && road.explicitWidth >= 3.2 ? road.explicitWidth : baseW
  } else if (hw === 'service' || hw === 'track') {
    const baseW = lanes >= 2 ? 5.4 : 3.8
    roadW = road.explicitWidth && road.explicitWidth >= 3.0 ? road.explicitWidth : baseW
  } else if (hw === 'pedestrian') {
    roadW = road.explicitWidth && road.explicitWidth >= 2.0 ? road.explicitWidth : 5.0
  } else if (road.oneway && lanes === 1) {
    const baseW = 4.6
    roadW = road.explicitWidth && road.explicitWidth >= 3.2 ? road.explicitWidth : baseW
  } else {
    roadW = road.explicitWidth && road.explicitWidth >= 3.2 ? road.explicitWidth : lanes * LANE_WIDTH
  }

  return { roadW, lanes, halfW: roadW / 2 }
}