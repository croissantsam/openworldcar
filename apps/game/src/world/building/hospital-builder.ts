/**
 * HospitalBuilder — Generates authentic hospital and clinic architecture:
 *   1. Rooftop Emergency Helipad (Héliport d'urgence médicale):
 *      - Elevated steel platform with safety perimeter net / caution railings
 *      - Bold high-visibility "H" landing markings and circular touchdown zone
 *      - Night-glowing green & amber perimeter approach landing beacons
 *
 *   2. Emergency Ambulance Bay & Covered Canopy (Quai des Urgences / SAS Ambulances):
 *      - Drive-under covered canopy supported by steel pillars
 *      - Illuminated 3D "URGENCES" / "EMERGENCY" signage band
 *      - Glowing red emergency beacon light
 *      - Ground ambulance parking bay markings (chevrons and red/white crosses)
 *
 *   3. Monumental 3D Illuminated Medical Cross Sign (Croix Médicale 3D):
 *      - Large 3D Greek medical cross (+) mounted on the facade
 *      - Emissive emerald green or emergency red night glow
 *
 *   4. Sterile Air Filtration & Rooftop HVAC Chillers (Centrales de Traitement d'Air):
 *      - Massive hospital ventilation and cooling units on the roof
 *
 *   5. Hospital Directional Entrance Totem:
 *      - Modern illuminated monolith totem ("URGENCES 24/7 - ACCUEIL")
 *
 * NOTE: Strictly NO flags as requested.
 * All geometry is bounded inside the facade threshold and uses module-level
 * shared materials to preserve 60+ FPS.
 */

import * as THREE from 'three'

// ─── Module-Level Shared Detail Materials ───────────────────────────────────

let medicalCrossMat: THREE.MeshStandardMaterial | null = null
let emergencyRedMat: THREE.MeshStandardMaterial | null = null
let ambulanceCanopyMat: THREE.MeshStandardMaterial | null = null
let steelPillarMat: THREE.MeshStandardMaterial | null = null
let helipadDeckMat: THREE.MeshStandardMaterial | null = null
let helipadMarkingMat: THREE.MeshStandardMaterial | null = null
let helipadLightGreenMat: THREE.MeshStandardMaterial | null = null
let helipadLightAmberMat: THREE.MeshStandardMaterial | null = null
let hvacChillerMat: THREE.MeshStandardMaterial | null = null
let totemMat: THREE.MeshStandardMaterial | null = null
let groundChevronsMat: THREE.MeshStandardMaterial | null = null

const hospitalSignMatCache = new Map<string, THREE.MeshStandardMaterial>()

function getMedicalCrossMaterial(): THREE.MeshStandardMaterial {
  if (!medicalCrossMat) {
    medicalCrossMat = new THREE.MeshStandardMaterial({
      color: 0x00e676,
      emissive: 0x00c853,
      emissiveIntensity: 2.2,
      roughness: 0.2,
      metalness: 0.1,
    })
  }
  return medicalCrossMat
}

function getEmergencyRedMaterial(): THREE.MeshStandardMaterial {
  if (!emergencyRedMat) {
    emergencyRedMat = new THREE.MeshStandardMaterial({
      color: 0xff1744,
      emissive: 0xd50000,
      emissiveIntensity: 2.4,
      roughness: 0.2,
      metalness: 0.1,
    })
  }
  return emergencyRedMat
}

function getAmbulanceCanopyMaterial(): THREE.MeshStandardMaterial {
  if (!ambulanceCanopyMat) {
    ambulanceCanopyMat = new THREE.MeshStandardMaterial({
      color: 0x3e4752,
      roughness: 0.45,
      metalness: 0.4,
    })
  }
  return ambulanceCanopyMat
}

function getSteelPillarMaterial(): THREE.MeshStandardMaterial {
  if (!steelPillarMat) {
    steelPillarMat = new THREE.MeshStandardMaterial({
      color: 0x5a6470,
      roughness: 0.35,
      metalness: 0.65,
    })
  }
  return steelPillarMat
}

function getHelipadDeckMaterial(): THREE.MeshStandardMaterial {
  if (!helipadDeckMat) {
    helipadDeckMat = new THREE.MeshStandardMaterial({
      color: 0x252a30,
      roughness: 0.85,
      metalness: 0.15,
    })
  }
  return helipadDeckMat
}

function getHelipadMarkingMaterial(): THREE.MeshStandardMaterial {
  if (!helipadMarkingMat) {
    helipadMarkingMat = new THREE.MeshStandardMaterial({
      color: 0xffd600,
      emissive: 0xffaa00,
      emissiveIntensity: 0.35,
      roughness: 0.5,
      metalness: 0.1,
    })
  }
  return helipadMarkingMat
}

function getHelipadLightGreenMaterial(): THREE.MeshStandardMaterial {
  if (!helipadLightGreenMat) {
    helipadLightGreenMat = new THREE.MeshStandardMaterial({
      color: 0x69f0ae,
      emissive: 0x00e676,
      emissiveIntensity: 2.8,
      roughness: 0.1,
      metalness: 0.05,
    })
  }
  return helipadLightGreenMat
}

function getHelipadLightAmberMaterial(): THREE.MeshStandardMaterial {
  if (!helipadLightAmberMat) {
    helipadLightAmberMat = new THREE.MeshStandardMaterial({
      color: 0xffd54f,
      emissive: 0xffa000,
      emissiveIntensity: 2.6,
      roughness: 0.1,
      metalness: 0.05,
    })
  }
  return helipadLightAmberMat
}

function getHvacChillerMaterial(): THREE.MeshStandardMaterial {
  if (!hvacChillerMat) {
    hvacChillerMat = new THREE.MeshStandardMaterial({
      color: 0x606c78,
      roughness: 0.55,
      metalness: 0.5,
    })
  }
  return hvacChillerMat
}

function getTotemMaterial(): THREE.MeshStandardMaterial {
  if (!totemMat) {
    totemMat = new THREE.MeshStandardMaterial({
      color: 0x1f2730,
      roughness: 0.4,
      metalness: 0.4,
    })
  }
  return totemMat
}

function getGroundChevronsMaterial(): THREE.MeshStandardMaterial {
  if (!groundChevronsMat) {
    const W = 256
    const H = 256
    const canvas = document.createElement('canvas')
    canvas.width = W
    canvas.height = H
    const ctx = canvas.getContext('2d')!

    // Dark asphalt base
    ctx.fillStyle = '#1e2226'
    ctx.fillRect(0, 0, W, H)

    // Red ambulance cross in center
    const cx = W / 2
    const cy = H / 2
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(cx - 50, cy - 50, 100, 100)

    ctx.fillStyle = '#e50914'
    ctx.fillRect(cx - 16, cy - 40, 32, 80)
    ctx.fillRect(cx - 40, cy - 16, 80, 32)

    // Yellow diagonal safety chevron bands on sides
    ctx.strokeStyle = '#ffd600'
    ctx.lineWidth = 14
    for (let x = -W; x < W * 2; x += 36) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x + 50, H)
      ctx.stroke()
    }

    // Outer border
    ctx.strokeStyle = '#ffd600'
    ctx.lineWidth = 8
    ctx.strokeRect(4, 4, W - 8, H - 8)

    const map = new THREE.CanvasTexture(canvas)
    groundChevronsMat = new THREE.MeshStandardMaterial({
      map,
      roughness: 0.85,
      metalness: 0.05,
    })
  }
  return groundChevronsMat
}

/**
 * Creates an illuminated procedural sign texture for the emergency ambulance canopy.
 */
function getHospitalSignMaterial(hospitalName: string): THREE.MeshStandardMaterial {
  const cleanName = hospitalName ? hospitalName.toUpperCase().trim() : 'CENTRE HOSPITALIER'
  const cacheKey = cleanName
  const existing = hospitalSignMatCache.get(cacheKey)
  if (existing) return existing

  const W = 512
  const H = 128
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!

  const ecanvas = document.createElement('canvas')
  ecanvas.width = W
  ecanvas.height = H
  const ectx = ecanvas.getContext('2d')!

  // Deep emergency red background
  ctx.fillStyle = '#b7091d'
  ctx.fillRect(0, 0, W, H)
  ectx.fillStyle = '#b7091d'
  ectx.fillRect(0, 0, W, H)

  // White border
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 4
  ctx.strokeRect(4, 4, W - 8, H - 8)
  ectx.strokeStyle = '#ffffff'
  ectx.lineWidth = 4
  ectx.strokeRect(4, 4, W - 8, H - 8)

  // White medical cross on the left
  const crossX = 52
  const crossY = H / 2
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(crossX - 10, crossY - 30, 20, 60)
  ctx.fillRect(crossX - 30, crossY - 10, 60, 20)

  ectx.fillStyle = '#ffffff'
  ectx.fillRect(crossX - 10, crossY - 30, 20, 60)
  ectx.fillRect(crossX - 30, crossY - 10, 60, 20)

  // Primary text: "URGENCES / EMERGENCY"
  ctx.fillStyle = '#ffffff'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.font = 'bold 36px "Helvetica Neue", "Arial Black", sans-serif'
  ctx.fillText('URGENCES', 100, 48)

  ectx.fillStyle = '#ffffff'
  ectx.textAlign = 'left'
  ectx.textBaseline = 'middle'
  ectx.font = 'bold 36px "Helvetica Neue", "Arial Black", sans-serif'
  ectx.fillText('URGENCES', 100, 48)

  // Subtitle: Hospital name or "ACCUEIL & AMBULANCES 24/7"
  ctx.font = 'bold 16px "Helvetica Neue", sans-serif'
  ctx.fillStyle = '#ffebee'
  const sub = cleanName.length > 28 ? cleanName.slice(0, 28) : cleanName
  ctx.fillText(sub, 102, 88)

  ectx.font = 'bold 16px "Helvetica Neue", sans-serif'
  ectx.fillStyle = '#ffebee'
  ectx.fillText(sub, 102, 88)

  const map = new THREE.CanvasTexture(canvas)
  const emissiveMap = new THREE.CanvasTexture(ecanvas)

  const mat = new THREE.MeshStandardMaterial({
    map,
    emissiveMap,
    emissive: 0xffffff,
    emissiveIntensity: 1.1,
    roughness: 0.35,
    metalness: 0.2,
  })

  hospitalSignMatCache.set(cacheKey, mat)
  return mat
}

// ─── Geometry Utilities ─────────────────────────────────────────────────────

function polygonSignedArea(fp: THREE.Vector2[]): number {
  let area = 0
  const n = fp.length
  for (let i = 0; i < n; i++) {
    const p1 = fp[i]!
    const p2 = fp[(i + 1) % n]!
    area += p1.x * p2.y - p2.x * p1.y
  }
  return area * 0.5
}

function findFrontFacadeEdge(fp: THREE.Vector2[]): {
  p1: THREE.Vector2
  p2: THREE.Vector2
  mid: THREE.Vector2
  dir: THREE.Vector2
  normal: THREE.Vector2
  len: number
} {
  const n = fp.length
  const isCCW = polygonSignedArea(fp) > 0

  let bestEdgeIdx = 0
  let bestScore = -Infinity

  for (let i = 0; i < n; i++) {
    const p1 = fp[i]!
    const p2 = fp[(i + 1) % n]!
    const len = p1.distanceTo(p2)
    if (len < 6.0) continue
    const midY = (p1.y + p2.y) / 2
    const score = len * 1.5 - midY * 0.05
    if (score > bestScore) {
      bestScore = score
      bestEdgeIdx = i
    }
  }

  const p1 = fp[bestEdgeIdx]!
  const p2 = fp[(bestEdgeIdx + 1) % n]!
  const len = Math.max(1e-4, p1.distanceTo(p2))
  const dir = new THREE.Vector2((p2.x - p1.x) / len, (p2.y - p1.y) / len)
  const normal = isCCW ? new THREE.Vector2(-dir.y, dir.x) : new THREE.Vector2(dir.y, -dir.x)
  const mid = new THREE.Vector2((p1.x + p2.x) / 2, (p1.y + p2.y) / 2)

  return { p1, p2, mid, dir, normal, len }
}

// ─── 3D Architectural Component Builders ────────────────────────────────────

/**
 * Builds the emergency ambulance covered bay and canopy (Quai des Urgences).
 */
function buildAmbulanceBayCanopy(
  group: THREE.Group,
  center: THREE.Vector2,
  normal: THREE.Vector2,
  canopyW: number,
  canopyDepth: number,
  canopyH: number,
  hospitalName: string,
): void {
  const bayGroup = new THREE.Group()

  const canopyMat = getAmbulanceCanopyMaterial()
  const pillarMat = getSteelPillarMaterial()
  const redMat = getEmergencyRedMaterial()

  // 1. Covered drive-under canopy roof slab
  const roofThickness = 0.35
  const roofGeo = new THREE.BoxGeometry(canopyW, roofThickness, canopyDepth)
  const roofMesh = new THREE.Mesh(roofGeo, canopyMat)
  roofMesh.position.set(0, canopyH, canopyDepth * 0.5)
  bayGroup.add(roofMesh)

  // 2. Heavy steel support columns at outer edge (for ambulances driving underneath)
  const pillarR = 0.16
  const pillarGeo = new THREE.CylinderGeometry(pillarR, pillarR, canopyH, 12)

  const leftPillar = new THREE.Mesh(pillarGeo, pillarMat)
  leftPillar.position.set(-canopyW * 0.46, canopyH * 0.5, canopyDepth - 0.25)
  bayGroup.add(leftPillar)

  const rightPillar = new THREE.Mesh(pillarGeo, pillarMat)
  rightPillar.position.set(canopyW * 0.46, canopyH * 0.5, canopyDepth - 0.25)
  bayGroup.add(rightPillar)

  // 3. Illuminated "URGENCES" emergency sign fascia board
  const signW = Math.min(canopyW * 0.95, 5.5)
  const signH = 0.8
  const signGeo = new THREE.BoxGeometry(signW, signH, 0.08)
  const signMat = getHospitalSignMaterial(hospitalName)
  const signMesh = new THREE.Mesh(signGeo, signMat)
  signMesh.position.set(0, canopyH + 0.25, canopyDepth + 0.05)
  bayGroup.add(signMesh)

  // 4. Red Emergency Warning Beacon Light on top of canopy
  const beaconGeo = new THREE.CylinderGeometry(0.16, 0.18, 0.3, 12)
  const beacon = new THREE.Mesh(beaconGeo, redMat)
  beacon.position.set(canopyW * 0.42, canopyH + roofThickness * 0.5 + 0.15, canopyDepth * 0.5)
  bayGroup.add(beacon)

  // 5. Ground-level ambulance parking bay markings
  const bayMarkingGeo = new THREE.PlaneGeometry(canopyW * 0.88, canopyDepth * 0.92)
  const bayMarkingMesh = new THREE.Mesh(bayMarkingGeo, getGroundChevronsMaterial())
  bayMarkingMesh.rotation.x = -Math.PI / 2
  bayMarkingMesh.position.set(0, 0.015, canopyDepth * 0.5)
  bayGroup.add(bayMarkingMesh)

  const angle = Math.atan2(normal.y, normal.x) - Math.PI / 2
  bayGroup.rotation.y = -angle
  bayGroup.position.set(center.x, 0, center.y)
  group.add(bayGroup)
}

/**
 * Builds the prominent 3D illuminated Medical Cross (+) sign on the facade.
 */
function buildIlluminatedMedicalCross(
  group: THREE.Group,
  center: THREE.Vector2,
  normal: THREE.Vector2,
  crossY: number,
  crossSize: number,
  color: 'green' | 'red' = 'green',
): void {
  const crossGroup = new THREE.Group()

  const crossMat = color === 'green' ? getMedicalCrossMaterial() : getEmergencyRedMaterial()
  const backingMat = getSteelPillarMaterial()

  const barW = crossSize * 0.32
  const depth = 0.14

  // Circular or square backing plaque
  const backGeo = new THREE.BoxGeometry(crossSize * 1.15, crossSize * 1.15, 0.05)
  const backMesh = new THREE.Mesh(backGeo, backingMat)
  crossGroup.add(backMesh)

  // Vertical bar
  const vertGeo = new THREE.BoxGeometry(barW, crossSize, depth)
  const vertMesh = new THREE.Mesh(vertGeo, crossMat)
  vertMesh.position.z = depth * 0.5
  crossGroup.add(vertMesh)

  // Horizontal bar
  const horizGeo = new THREE.BoxGeometry(crossSize, barW, depth)
  const horizMesh = new THREE.Mesh(horizGeo, crossMat)
  horizMesh.position.z = depth * 0.5
  crossGroup.add(horizMesh)

  const angle = Math.atan2(normal.y, normal.x) - Math.PI / 2
  crossGroup.rotation.y = -angle
  crossGroup.position.set(center.x + normal.x * 0.12, crossY, center.y + normal.y * 0.12)
  group.add(crossGroup)
}

/**
 * Builds the rooftop emergency helipad (Héliport d'urgence médicale).
 */
function buildRooftopHelipad(
  group: THREE.Group,
  center: THREE.Vector2,
  wallHeight: number,
  padRadius: number,
): void {
  const helipadGroup = new THREE.Group()

  const deckMat = getHelipadDeckMaterial()
  const markMat = getHelipadMarkingMaterial()
  const pillarMat = getSteelPillarMaterial()
  const greenLight = getHelipadLightGreenMaterial()
  const amberLight = getHelipadLightAmberMaterial()

  const deckThickness = 0.25
  const elevation = 0.75 // elevated above roof surface on steel pylons

  // 1. Steel structural support pillars elevating the pad
  const pillarCount = 6
  const pillarGeo = new THREE.CylinderGeometry(0.09, 0.09, elevation, 8)
  for (let i = 0; i < pillarCount; i++) {
    const a = (i * Math.PI * 2) / pillarCount
    const px = Math.cos(a) * (padRadius * 0.75)
    const pz = Math.sin(a) * (padRadius * 0.75)
    const pillarMesh = new THREE.Mesh(pillarGeo, pillarMat)
    pillarMesh.position.set(px, elevation * 0.5, pz)
    helipadGroup.add(pillarMesh)
  }

  // 2. Main octagonal / circular landing deck slab
  const deckGeo = new THREE.CylinderGeometry(padRadius, padRadius, deckThickness, 16)
  const deckMesh = new THREE.Mesh(deckGeo, deckMat)
  deckMesh.position.set(0, elevation + deckThickness * 0.5, 0)
  helipadGroup.add(deckMesh)

  // 3. Painted Markings on Helipad: Outer Yellow Safety Ring
  const ringGeo = new THREE.RingGeometry(padRadius * 0.82, padRadius * 0.94, 24)
  const ringMesh = new THREE.Mesh(ringGeo, markMat)
  ringMesh.rotation.x = -Math.PI / 2
  ringMesh.position.set(0, elevation + deckThickness + 0.01, 0)
  helipadGroup.add(ringMesh)

  // Inner Touchdown Circle
  const innerRingGeo = new THREE.RingGeometry(padRadius * 0.52, padRadius * 0.58, 24)
  const innerRingMesh = new THREE.Mesh(innerRingGeo, markMat)
  innerRingMesh.rotation.x = -Math.PI / 2
  innerRingMesh.position.set(0, elevation + deckThickness + 0.012, 0)
  helipadGroup.add(innerRingMesh)

  // 4. Large Bold Letter "H" in center of Helipad
  const letterH = padRadius * 0.65
  const legW = letterH * 0.22
  const barH = letterH * 0.2

  const hGroup = new THREE.Group()
  // Left leg
  const leg1 = new THREE.Mesh(new THREE.PlaneGeometry(legW, letterH), markMat)
  leg1.position.set(-letterH * 0.38, 0, 0)
  // Right leg
  const leg2 = new THREE.Mesh(new THREE.PlaneGeometry(legW, letterH), markMat)
  leg2.position.set(letterH * 0.38, 0, 0)
  // Crossbar
  const bar = new THREE.Mesh(new THREE.PlaneGeometry(letterH * 0.76, barH), markMat)

  hGroup.add(leg1, leg2, bar)
  hGroup.rotation.x = -Math.PI / 2
  hGroup.position.set(0, elevation + deckThickness + 0.015, 0)
  helipadGroup.add(hGroup)

  // 5. Perimeter Night Landing Lights (green approach & amber beacons)
  const lightCount = 12
  const lightStemGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.2, 8)
  const lightBulbGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.12, 10)

  for (let i = 0; i < lightCount; i++) {
    const a = (i * Math.PI * 2) / lightCount
    const lx = Math.cos(a) * (padRadius * 0.98)
    const lz = Math.sin(a) * (padRadius * 0.98)
    const lightMat = i % 3 === 0 ? amberLight : greenLight

    const stemMesh = new THREE.Mesh(lightStemGeo, pillarMat)
    stemMesh.position.set(lx, elevation + deckThickness + 0.1, lz)

    const bulbMesh = new THREE.Mesh(lightBulbGeo, lightMat)
    bulbMesh.position.set(lx, elevation + deckThickness + 0.24, lz)

    helipadGroup.add(stemMesh, bulbMesh)
  }

  // 6. Perimeter yellow caution safety railing
  const railGeo = new THREE.TorusGeometry(padRadius * 0.98, 0.035, 8, 24)
  const railMesh = new THREE.Mesh(railGeo, markMat)
  railMesh.rotation.x = Math.PI / 2
  railMesh.position.set(0, elevation + deckThickness + 0.25, 0)
  helipadGroup.add(railMesh)

  helipadGroup.position.set(center.x, wallHeight, center.y)
  group.add(helipadGroup)
}

/**
 * Builds rooftop sterile air filtration & HVAC chiller units (CTA médicales).
 */
function buildRooftopHvacChillers(
  group: THREE.Group,
  center: THREE.Vector2,
  wallHeight: number,
  chillerW: number,
): void {
  const hvacGroup = new THREE.Group()
  const mat = getHvacChillerMaterial()

  // Two industrial ventilation / chiller cubicles
  for (const side of [-1, 1]) {
    const boxW = Math.min(3.2, chillerW * 0.45)
    const boxH = 1.4
    const boxD = 2.2
    const boxGeo = new THREE.BoxGeometry(boxW, boxH, boxD)
    const boxMesh = new THREE.Mesh(boxGeo, mat)
    boxMesh.position.set(side * (boxW * 0.7), boxH * 0.5, 0)
    hvacGroup.add(boxMesh)

    // Exhaust fan cowling on top
    const fanGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.25, 12)
    const fanMesh = new THREE.Mesh(fanGeo, mat)
    fanMesh.position.set(side * (boxW * 0.7), boxH + 0.12, 0)
    hvacGroup.add(fanMesh)
  }

  hvacGroup.position.set(center.x, wallHeight, center.y)
  group.add(hvacGroup)
}

/**
 * Builds the hospital entrance totem ("URGENCES 24/7 - ACCUEIL").
 */
function buildHospitalTotem(
  group: THREE.Group,
  pos: THREE.Vector3,
  dir: THREE.Vector2,
): void {
  const totemGroup = new THREE.Group()

  const totemMat = getTotemMaterial()
  const redMat = getEmergencyRedMaterial()

  // Monolith column
  const totemGeo = new THREE.BoxGeometry(0.9, 2.5, 0.18)
  const totemMesh = new THREE.Mesh(totemGeo, totemMat)
  totemMesh.position.set(0, 1.25, 0)
  totemGroup.add(totemMesh)

  // Red top band
  const topBandGeo = new THREE.BoxGeometry(0.92, 0.65, 0.2)
  const topBand = new THREE.Mesh(topBandGeo, redMat)
  topBand.position.set(0, 2.15, 0)
  totemGroup.add(topBand)

  // White medical cross on totem
  const crossGeo = new THREE.BoxGeometry(0.12, 0.35, 0.22)
  const c1 = new THREE.Mesh(crossGeo, getMedicalCrossMaterial())
  c1.position.set(0, 2.15, 0)
  const crossGeo2 = new THREE.BoxGeometry(0.35, 0.12, 0.22)
  const c2 = new THREE.Mesh(crossGeo2, getMedicalCrossMaterial())
  c2.position.set(0, 2.15, 0)
  totemGroup.add(c1, c2)

  totemGroup.position.set(pos.x, 0, pos.z)
  const angle = Math.atan2(dir.y, dir.x)
  totemGroup.rotation.y = -angle
  group.add(totemGroup)
}

// ─── Main Hospital Architecture Entry Point ─────────────────────────────────

/**
 * Builds complete 3D hospital architecture for an OSM hospital or clinic building.
 */
export function buildHospitalArchitecture(
  group: THREE.Group,
  fp2d: THREE.Vector2[],
  wallHeight: number,
  _roofPitch: number,
  _facadeMat: THREE.Material,
  _roofMat: THREE.Material,
  buildingName?: string,
): void {
  const edge = findFrontFacadeEdge(fp2d)
  if (edge.len < 5.0) return

  const displayName = buildingName ? buildingName.slice(0, 28) : 'CENTRE HOSPITALIER'

  // Centroid of building footprint for rooftop elements
  let sumX = 0, sumZ = 0
  for (const p of fp2d) {
    sumX += p.x
    sumZ += p.y
  }
  const centroid = new THREE.Vector2(sumX / fp2d.length, sumZ / fp2d.length)

  // 1. Covered Emergency Ambulance Bay Canopy (Quai des Urgences)
  const canopyW = Math.min(6.8, Math.max(4.6, edge.len * 0.36))
  const canopyDepth = Math.min(3.4, Math.max(2.4, edge.len * 0.18))
  const canopyH = 3.4
  buildAmbulanceBayCanopy(
    group,
    edge.mid,
    edge.normal,
    canopyW,
    canopyDepth,
    canopyH,
    displayName,
  )

  // 2. Large 3D Illuminated Medical Cross (+) Sign on the facade
  const crossSize = Math.min(1.8, Math.max(1.2, wallHeight * 0.16))
  const crossY = Math.min(wallHeight - 1.2, canopyH + 2.2)
  buildIlluminatedMedicalCross(
    group,
    new THREE.Vector2(edge.mid.x + edge.dir.x * (canopyW * 0.5 + 1.2), edge.mid.y + edge.dir.y * (canopyW * 0.5 + 1.2)),
    edge.normal,
    crossY,
    crossSize,
    'green',
  )

  // 3. Hospital Directional Totem at the entrance
  const totemPos = new THREE.Vector3(
    edge.mid.x - edge.dir.x * (canopyW * 0.5 + 1.6) + edge.normal.x * 0.8,
    0,
    edge.mid.y - edge.dir.y * (canopyW * 0.5 + 1.6) + edge.normal.y * 0.8,
  )
  buildHospitalTotem(group, totemPos, edge.dir)

  // 4. Rooftop Emergency Helipad (for buildings >= 9m tall or wide footprints)
  if (wallHeight >= 8.5 && edge.len >= 12.0) {
    const padRadius = Math.min(6.5, Math.max(4.2, edge.len * 0.22))
    buildRooftopHelipad(group, centroid, wallHeight, padRadius)
  }

  // 5. Rooftop Sterile Air Filtration & HVAC Chillers
  if (edge.len >= 8.0) {
    const hvacOffset = new THREE.Vector2(
      centroid.x + edge.normal.x * 3.5,
      centroid.y + edge.normal.y * 3.5,
    )
    buildRooftopHvacChillers(group, hvacOffset, wallHeight, canopyW)
  }
}
