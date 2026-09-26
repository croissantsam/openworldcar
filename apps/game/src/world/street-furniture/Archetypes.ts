/**
 * Furniture archetype definitions — geometries and materials.
 */

import * as THREE from 'three'
import { GeoBuilder } from './GeometryHelpers.js'
import { FURN_MAT, CROWN_MAT, LAMP_HEAD_MAT } from './Materials.js'
import { getTreeArch } from './TreeArch.js'
import { getBenchTemplate } from '../park/index.js'
import {
  buildPedestrianStatueGeo,
  buildEquestrianStatueGeo,
  buildBustStatueGeo,
  buildObeliskStatueGeo,
} from './StatueGeometries.js'

export type ArchKey =
  | 'lamp' | 'lampHead' | 'bench' | 'benchNb' | 'bollard' | 'bike' | 'waste' | 'hydrant'
  | 'postbox' | 'fountain' | 'ad' | 'adColumn' | 'busStop' | 'subway'
  | 'trunk0' | 'trunk1' | 'trunk2' | 'crown0' | 'crown1' | 'crown2'
  | 'statueEquestrian' | 'statuePedestrian' | 'statueBust' | 'statueObelisk'

export interface ArchDef {
  geo: () => THREE.BufferGeometry
  mat: () => THREE.Material
  shadow: boolean
}

export const ARCH: Record<ArchKey, ArchDef> = {
  lamp: {
    shadow: true,
    mat: () => FURN_MAT,
    geo: () => new GeoBuilder()
      .cyl(0.055, 0.09, 4.0, 0, 2.0, 0, 0x2f3236, 8)
      .cyl(0.16, 0.16, 0.06, 0, 0.03, 0, 0x2f3236, 8)
      .box(0.06, 0.06, 1.15, 0, 3.97, 0.55, 0x2f3236)
      .build(),
  },
  lampHead: {
    shadow: false,
    mat: () => LAMP_HEAD_MAT,
    geo: () => {
      const g = new THREE.BoxGeometry(0.42, 0.14, 0.32)
      g.translate(0, 3.9, 1.05)
      return g
    },
  },
  bench: {
    shadow: false,
    mat: () => FURN_MAT,
    geo: () => new GeoBuilder().template(getBenchTemplate()).build(),
  },
  benchNb: {
    shadow: false,
    mat: () => FURN_MAT,
    geo: () => new GeoBuilder().template(getBenchTemplate(), (m) => {
      m.geometry.computeBoundingBox()
      return (m.geometry.boundingBox?.max.y ?? 0) < 0.5
    }).build(),
  },
  bollard: {
    shadow: false,
    mat: () => FURN_MAT,
    geo: () => new GeoBuilder()
      .cyl(0.075, 0.085, 0.86, 0, 0.43, 0, 0x3a3d40, 8)
      .cyl(0.09, 0.09, 0.05, 0, 0.885, 0, 0x9a9da0, 8)
      .build(),
  },
  bike: {
    shadow: false,
    mat: () => FURN_MAT,
    geo: () => new GeoBuilder()
      .cyl(0.025, 0.025, 0.78, -0.36, 0.39, 0, 0x8c9094, 6)
      .cyl(0.025, 0.025, 0.78, 0.36, 0.39, 0, 0x8c9094, 6)
      .box(0.77, 0.05, 0.05, 0, 0.79, 0, 0x8c9094)
      .build(),
  },
  waste: {
    shadow: false,
    mat: () => FURN_MAT,
    geo: () => new GeoBuilder()
      .cyl(0.03, 0.03, 1.0, 0, 0.5, 0.2, 0x3b3f42, 6)
      .cyl(0.2, 0.17, 0.75, 0, 0.62, 0, 0x2f5f3b, 8)
      .cyl(0.21, 0.21, 0.04, 0, 1.0, 0, 0x1f1f1f, 8)
      .build(),
  },
  hydrant: {
    shadow: false,
    mat: () => FURN_MAT,
    geo: () => new GeoBuilder()
      .cyl(0.11, 0.13, 0.62, 0, 0.31, 0, 0xc0392b, 8)
      .cyl(0.09, 0.11, 0.1, 0, 0.66, 0, 0x8e8e8e, 8)
      .box(0.34, 0.09, 0.09, 0, 0.42, 0, 0x8e8e8e)
      .build(),
  },
  postbox: {
    shadow: false,
    mat: () => FURN_MAT,
    // white vertex colour → per-instance colour via instanceColor (tags.colour)
    geo: () => new GeoBuilder()
      .box(0.45, 0.95, 0.35, 0, 0.72, 0, 0xffffff)
      .box(0.36, 0.25, 0.28, 0, 0.125, 0, 0x4a4a4a)
      .build(),
  },
  fountain: {
    shadow: false,
    mat: () => FURN_MAT,
    geo: () => new GeoBuilder()
      .cyl(1.2, 1.25, 0.5, 0, 0.25, 0, 0x8d8d88, 16)
      .cyl(1.05, 1.05, 0.46, 0, 0.29, 0, 0x4a90c8, 16)
      .cyl(0.14, 0.2, 1.1, 0, 1.0, 0, 0x8d8d88, 8)
      .cyl(0.4, 0.42, 0.12, 0, 1.5, 0, 0x9a9a94, 12)
      .build(),
  },
  ad: {
    shadow: false,
    mat: () => FURN_MAT,
    geo: () => new GeoBuilder()
      .cyl(0.05, 0.06, 2.3, 0, 1.15, 0, 0x3a3d40, 8)
      .box(2.0, 1.5, 0.06, 0, 3.0, 0, 0x2a2d30)
      .box(1.9, 1.4, 0.04, 0, 3.0, 0.02, 0xe8e2d4)
      .build(),
  },
  adColumn: {
    shadow: false,
    mat: () => FURN_MAT,
    geo: () => new GeoBuilder()
      .cyl(0.6, 0.62, 2.9, 0, 1.45, 0, 0x2f5f3b, 12)
      .cyl(0.58, 0.58, 2.0, 0, 1.6, 0, 0xd8d0bf, 12)
      .cyl(0.05, 0.7, 0.5, 0, 3.15, 0, 0x2f5f3b, 12)
      .build(),
  },
  busStop: {
    shadow: false,
    mat: () => FURN_MAT,
    geo: () => new GeoBuilder()
      .cyl(0.04, 0.045, 3.0, 0, 1.5, 0, 0x3a3d40, 8)
      .box(0.6, 0.2, 0.03, 0, 2.72, 0, 0x1f3a93)
      .box(0.22, 0.22, 0.03, 0, 2.98, 0, 0xe8b400)
      .build(),
  },
  subway: {
    shadow: false,
    mat: () => FURN_MAT,
    geo: () => new GeoBuilder()
      .cyl(0.04, 0.04, 1.0, -1.0, 0.5, 0, 0x1f4d3a, 6)
      .cyl(0.04, 0.04, 1.0, 1.0, 0.5, 0, 0x1f4d3a, 6)
      .box(2.1, 0.05, 0.05, 0, 1.0, 0, 0x1f4d3a)
      .box(2.1, 0.04, 0.04, 0, 0.55, 0, 0x1f4d3a)
      .cyl(0.04, 0.045, 2.6, 1.2, 1.3, 0, 0x1f4d3a, 6)
      .box(0.7, 0.3, 0.04, 1.2, 2.45, 0, 0x145a32)
      .build(),
  },
  trunk0: { shadow: true, mat: () => getTreeArch(0).trunkMat, geo: () => getTreeArch(0).trunk },
  trunk1: { shadow: true, mat: () => getTreeArch(1).trunkMat, geo: () => getTreeArch(1).trunk },
  trunk2: { shadow: true, mat: () => getTreeArch(2).trunkMat, geo: () => getTreeArch(2).trunk },
  crown0: { shadow: true, mat: () => CROWN_MAT, geo: () => getTreeArch(0).crown },
  crown1: { shadow: true, mat: () => CROWN_MAT, geo: () => getTreeArch(1).crown },
  crown2: { shadow: true, mat: () => CROWN_MAT, geo: () => getTreeArch(2).crown },
  statueEquestrian: { shadow: true, mat: () => FURN_MAT, geo: () => buildEquestrianStatueGeo() },
  statuePedestrian: { shadow: true, mat: () => FURN_MAT, geo: () => buildPedestrianStatueGeo() },
  statueBust: { shadow: true, mat: () => FURN_MAT, geo: () => buildBustStatueGeo() },
  statueObelisk: { shadow: true, mat: () => FURN_MAT, geo: () => buildObeliskStatueGeo() },
}

const _geoCache = new Map<ArchKey, THREE.BufferGeometry>()

export function getGeo(key: ArchKey): THREE.BufferGeometry {
  let g = _geoCache.get(key)
  if (!g) {
    g = ARCH[key].geo()
    _geoCache.set(key, g)
  }
  return g
}