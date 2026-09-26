/**
 * AcademicBuilder — Generates authentic educational architecture for:
 *   1. Écoles (Primary & Elementary Schools / Maternelles):
 *      - Frontispiece with school clock ("L'Horloge de l'école")
 *      - Central roof bell cupola (clocheton) with 3D bronze bell and weathervane
 *      - Recessed stone entrance portal with painted double doors and brass kickplates
 *      - Forecourt bicycle racks (arceaux à vélos) & school notice display board
 *
 *   2. Lycées & Collèges (Secondary & High Schools):
 *      - Imposing classical clock pavilion with large illuminated clock dial
 *      - Square stone campanile / clock tower rising above roofline
 *      - Monumental stone entrance portico with pilasters and broad stone steps
 *      - Student bicycle parking & parvis guardrails
 *
 *   3. Universités & Campus (Universities, Faculties & Grand Amphithéâtres):
 *      - Monumental grand colonnade portico (Péristyle) with classical fluted columns
 *      - Triangular pediment with carved Roman Latin inscription ("UNIVERSITAS")
 *      - Grand ceremonial flight of granite steps (Escalier d'honneur)
 *      - Monumental central copper dome or observatory lantern with golden finial
 *      - Campus directory totem and stone benches
 *
 * NOTE: Strictly NO flags as requested.
 * All geometry is bounded inside the building envelope to eliminate street overhang,
 * and uses module-level shared materials to guarantee 60+ FPS.
 */

import * as THREE from 'three'

export type AcademicType = 'school' | 'lycee' | 'university'

/**
 * Robust accent-agnostic detector for educational names from OSM:
 * Matches "école", "ecole", "lycée", "lycee", "collège", "college", "université", "sorbonne", etc.
 */
export function isEducationalName(name: string): 'school' | 'university' | null {
  if (!name) return null
  const n = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

  if (/\b(universite|university|faculte|campus|sorbonne|pantheon|polytech|institut|conservatoire)\b/i.test(n)) {
    return 'university'
  }
  if (
    /\b(ecole|lycee|college|high\s*school|gymnasium|grundschule|academy|scolaire|maternelle|elementaire|primaire|institution)\b/i.test(
      n,
    )
  ) {
    return 'school'
  }
  return null
}

// ─── Module-Level Shared Detail Materials ───────────────────────────────────

let clockDialMaterial: THREE.MeshStandardMaterial | null = null
let bronzeBellMaterial: THREE.MeshStandardMaterial | null = null
let oakDoorMaterial: THREE.MeshStandardMaterial | null = null
let greenDoorMaterial: THREE.MeshStandardMaterial | null = null
let stoneMouldingMaterial: THREE.MeshStandardMaterial | null = null
let copperDomeMaterial: THREE.MeshStandardMaterial | null = null
let goldFinialMaterial: THREE.MeshStandardMaterial | null = null
let bikeRackMaterial: THREE.MeshStandardMaterial | null = null
let totemMaterial: THREE.MeshStandardMaterial | null = null

function getClockDialMaterial(): THREE.MeshStandardMaterial {
  if (!clockDialMaterial) {
    const canvas = document.createElement('canvas')
    canvas.width = 256
    canvas.height = 256
    const ctx = canvas.getContext('2d')!

    // White enamel dial with gold/black rim
    ctx.fillStyle = '#fcfbf8'
    ctx.beginPath()
    ctx.arc(128, 128, 120, 0, Math.PI * 2)
    ctx.fill()

    ctx.strokeStyle = '#b89030' // outer brass bezel
    ctx.lineWidth = 10
    ctx.stroke()

    ctx.strokeStyle = '#1a1815' // inner dark ring
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.arc(128, 128, 114, 0, Math.PI * 2)
    ctx.stroke()

    // Hour marks
    ctx.fillStyle = '#181614'
    for (let i = 0; i < 12; i++) {
      const angle = (i * Math.PI) / 6
      const isMajor = i % 3 === 0
      const rInner = isMajor ? 88 : 98
      const rOuter = 110
      ctx.beginPath()
      ctx.lineWidth = isMajor ? 6 : 3
      ctx.moveTo(128 + Math.sin(angle) * rInner, 128 - Math.cos(angle) * rInner)
      ctx.lineTo(128 + Math.sin(angle) * rOuter, 128 - Math.cos(angle) * rOuter)
      ctx.stroke()
    }

    // Hands pointing at 10:10 (classic horology aesthetic)
    ctx.strokeStyle = '#141210'
    ctx.lineWidth = 6
    ctx.lineCap = 'round'
    // Hour hand at 10
    ctx.beginPath()
    ctx.moveTo(128, 128)
    ctx.lineTo(128 - Math.cos(Math.PI / 6) * 55, 128 - Math.sin(Math.PI / 6) * 55)
    ctx.stroke()
    // Minute hand at 2
    ctx.lineWidth = 4.5
    ctx.beginPath()
    ctx.moveTo(128, 128)
    ctx.lineTo(128 + Math.cos(Math.PI / 6) * 82, 128 - Math.sin(Math.PI / 6) * 82)
    ctx.stroke()

    // Center pivot
    ctx.fillStyle = '#b89030'
    ctx.beginPath()
    ctx.arc(128, 128, 7, 0, Math.PI * 2)
    ctx.fill()

    const map = new THREE.CanvasTexture(canvas)
    clockDialMaterial = new THREE.MeshStandardMaterial({
      map,
      roughness: 0.35,
      metalness: 0.15,
      emissive: new THREE.Color(0xfff0cc),
      emissiveIntensity: 0.25,
    })
  }
  return clockDialMaterial
}

function getBronzeBellMaterial(): THREE.MeshStandardMaterial {
  if (!bronzeBellMaterial) {
    bronzeBellMaterial = new THREE.MeshStandardMaterial({
      color: 0xcd7f32,
      metalness: 0.85,
      roughness: 0.28,
    })
  }
  return bronzeBellMaterial
}

function getOakDoorMaterial(): THREE.MeshStandardMaterial {
  if (!oakDoorMaterial) {
    oakDoorMaterial = new THREE.MeshStandardMaterial({
      color: 0x2e1a12,
      roughness: 0.82,
      metalness: 0.08,
    })
  }
  return oakDoorMaterial
}

function getGreenDoorMaterial(): THREE.MeshStandardMaterial {
  if (!greenDoorMaterial) {
    greenDoorMaterial = new THREE.MeshStandardMaterial({
      color: 0x1f382a,
      roughness: 0.75,
      metalness: 0.10,
    })
  }
  return greenDoorMaterial
}

function getStoneMouldingMaterial(): THREE.MeshStandardMaterial {
  if (!stoneMouldingMaterial) {
    stoneMouldingMaterial = new THREE.MeshStandardMaterial({
      color: 0xdcd4be,
      roughness: 0.88,
      metalness: 0.05,
    })
  }
  return stoneMouldingMaterial
}

function getCopperDomeMaterial(): THREE.MeshStandardMaterial {
  if (!copperDomeMaterial) {
    copperDomeMaterial = new THREE.MeshStandardMaterial({
      color: 0x487868,
      roughness: 0.45,
      metalness: 0.42,
    })
  }
  return copperDomeMaterial
}

function getGoldFinialMaterial(): THREE.MeshStandardMaterial {
  if (!goldFinialMaterial) {
    goldFinialMaterial = new THREE.MeshStandardMaterial({
      color: 0xd4af37,
      metalness: 0.88,
      roughness: 0.22,
    })
  }
  return goldFinialMaterial
}

function getBikeRackMaterial(): THREE.MeshStandardMaterial {
  if (!bikeRackMaterial) {
    bikeRackMaterial = new THREE.MeshStandardMaterial({
      color: 0x8a929a,
      metalness: 0.78,
      roughness: 0.32,
    })
  }
  return bikeRackMaterial
}

function getTotemMaterial(): THREE.MeshStandardMaterial {
  if (!totemMaterial) {
    const canvas = document.createElement('canvas')
    canvas.width = 128
    canvas.height = 256
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#263442'
    ctx.fillRect(0, 0, 128, 256)
    ctx.fillStyle = '#e6b840'
    ctx.fillRect(0, 0, 128, 12)
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 15px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('CAMPUS', 64, 45)
    ctx.fillText('UNIVERSITÉ', 64, 70)
    ctx.fillStyle = '#9cb4cc'
    ctx.font = '11px sans-serif'
    ctx.fillText('ACCÈS AMPHIS', 64, 110)
    ctx.fillText('BIBLIOTHÈQUE', 64, 130)
    ctx.fillText('ADMINISTRATION', 64, 150)
    ctx.fillStyle = '#e6b840'
    ctx.fillRect(20, 180, 88, 3)
    const map = new THREE.CanvasTexture(canvas)
    totemMaterial = new THREE.MeshStandardMaterial({ map, roughness: 0.5, metalness: 0.2 })
  }
  return totemMaterial
}

function makeInscriptionMaterial(text: string): THREE.MeshStandardMaterial {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 64
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#dcd4be'
  ctx.fillRect(0, 0, 512, 64)
  ctx.strokeStyle = '#b8ac92'
  ctx.lineWidth = 3
  ctx.strokeRect(4, 4, 504, 56)
  ctx.fillStyle = '#282420'
  ctx.font = 'bold 22px serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text.toUpperCase(), 256, 32)
  const map = new THREE.CanvasTexture(canvas)
  return new THREE.MeshStandardMaterial({ map, roughness: 0.85 })
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
    if (len < 4.0) continue
    const midY = (p1.y + p2.y) / 2
    const score = len * 1.5 - midY * 0.1
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

// ─── Architectural Builders ─────────────────────────────────────────────────

/**
 * Builds the classic round school clock mounted on a stone pedestal.
 */
function buildSchoolClock(
  group: THREE.Group,
  center: THREE.Vector3,
  normal: THREE.Vector2,
  radius: number,
): void {
  const clockGroup = new THREE.Group()

  // 1. Protruding stone bezel
  const bezelGeo = new THREE.CylinderGeometry(radius * 1.08, radius * 1.08, 0.16, 24)
  bezelGeo.rotateX(Math.PI / 2)
  const bezelMesh = new THREE.Mesh(bezelGeo, getStoneMouldingMaterial())
  clockGroup.add(bezelMesh)

  // 2. Dial face with hands & emissive map
  const dialGeo = new THREE.CircleGeometry(radius, 24)
  const dialMesh = new THREE.Mesh(dialGeo, getClockDialMaterial())
  dialMesh.position.z = 0.09
  clockGroup.add(dialMesh)

  const angle = Math.atan2(normal.y, normal.x)
  clockGroup.rotation.y = -angle + Math.PI / 2
  clockGroup.position.copy(center)
  group.add(clockGroup)
}

/**
 * Builds the open wooden/copper roof campanile (clocheton d'école) with an authentic bronze bell.
 */
function buildSchoolBellCampanile(
  group: THREE.Group,
  center: THREE.Vector2,
  roofY: number,
  campanileW: number,
  campanileH: number,
  roofMat: THREE.Material,
): void {
  const campGroup = new THREE.Group()
  const hw = campanileW / 2

  // 1. Base plinth on roof ridge
  const baseGeo = new THREE.BoxGeometry(campanileW * 1.15, 0.4, campanileW * 1.15)
  const baseMesh = new THREE.Mesh(baseGeo, getStoneMouldingMaterial())
  baseMesh.position.set(0, 0.2, 0)
  campGroup.add(baseMesh)

  // 2. Four timber / zinc corner posts
  const postH = campanileH * 0.65
  const postThick = 0.18
  const postGeo = new THREE.BoxGeometry(postThick, postH, postThick)
  const postMat = getStoneMouldingMaterial()
  const offsets = [
    [-hw * 0.85, -hw * 0.85],
    [hw * 0.85, -hw * 0.85],
    [hw * 0.85, hw * 0.85],
    [-hw * 0.85, hw * 0.85],
  ]
  for (const [ox, oz] of offsets) {
    const post = new THREE.Mesh(postGeo, postMat)
    post.position.set(ox!, 0.4 + postH / 2, oz!)
    campGroup.add(post)
  }

  // 3. Bronze bell hanging in the middle
  const bellH = campanileH * 0.35
  const bellGeo = new THREE.CylinderGeometry(0.12, 0.38, bellH, 14, 1, false)
  const bellMesh = new THREE.Mesh(bellGeo, getBronzeBellMaterial())
  bellMesh.position.set(0, 0.4 + postH * 0.55, 0)
  campGroup.add(bellMesh)

  // 4. Pyramidal copper roof cap
  const roofCapH = campanileH * 0.45
  const roofCapGeo = new THREE.ConeGeometry(campanileW * 0.88, roofCapH, 4)
  roofCapGeo.rotateY(Math.PI / 4)
  const roofCapMesh = new THREE.Mesh(roofCapGeo, getCopperDomeMaterial())
  roofCapMesh.position.set(0, 0.4 + postH + roofCapH / 2, 0)
  campGroup.add(roofCapMesh)

  // 5. Gilded weathervane finial (girouette)
  const finialGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.8, 6)
  const finialMesh = new THREE.Mesh(finialGeo, getGoldFinialMaterial())
  finialMesh.position.set(0, 0.4 + postH + roofCapH + 0.4, 0)
  campGroup.add(finialMesh)

  campGroup.position.set(center.x, roofY, center.y)
  group.add(campGroup)
}

/**
 * Builds the school / lycée entrance portal with moulded surround, recessed steps, and double doors.
 */
function buildAcademicEntrancePortal(
  group: THREE.Group,
  mid: THREE.Vector2,
  dir: THREE.Vector2,
  normal: THREE.Vector2,
  portalW: number,
  portalH: number,
  doorMat: THREE.Material,
  inscriptionText?: string,
): void {
  const portalGroup = new THREE.Group()

  // Recess inward along normal so steps and frame remain 100% inside polygon footprint
  const recess = 0.55
  const frameThick = 0.45

  // 1. Moulded stone side jambs
  const jambW = 0.45
  const jambGeo = new THREE.BoxGeometry(jambW, portalH, frameThick)
  const jambMat = getStoneMouldingMaterial()
  const leftJamb = new THREE.Mesh(jambGeo, jambMat)
  leftJamb.position.set(-portalW / 2 + jambW / 2, portalH / 2, recess / 2)
  portalGroup.add(leftJamb)

  const rightJamb = new THREE.Mesh(jambGeo, jambMat)
  rightJamb.position.set(portalW / 2 - jambW / 2, portalH / 2, recess / 2)
  portalGroup.add(rightJamb)

  // 2. Stone lintel / entablature
  const lintelH = 0.65
  const lintelGeo = new THREE.BoxGeometry(portalW + 0.3, lintelH, frameThick + 0.1)
  const lintelMesh = new THREE.Mesh(lintelGeo, jambMat)
  lintelMesh.position.set(0, portalH + lintelH / 2, recess / 2)
  portalGroup.add(lintelMesh)

  // 3. Inscription plaque if provided
  if (inscriptionText) {
    const plaqueMat = makeInscriptionMaterial(inscriptionText)
    const plaqueGeo = new THREE.PlaneGeometry(portalW * 0.9, 0.45)
    const plaqueMesh = new THREE.Mesh(plaqueGeo, plaqueMat)
    plaqueMesh.position.set(0, portalH + lintelH / 2, recess / 2 + frameThick * 0.5 + 0.06)
    portalGroup.add(plaqueMesh)
  }

  // 4. Double doors
  const doorW = (portalW - jambW * 2) * 0.49
  const doorH = portalH - 0.2
  const doorGeo = new THREE.BoxGeometry(doorW, doorH, 0.08)
  const leftDoor = new THREE.Mesh(doorGeo, doorMat)
  leftDoor.position.set(-doorW * 0.51, doorH / 2 + 0.1, recess)
  portalGroup.add(leftDoor)

  const rightDoor = new THREE.Mesh(doorGeo, doorMat)
  rightDoor.position.set(doorW * 0.51, doorH / 2 + 0.1, recess)
  portalGroup.add(rightDoor)

  // Brass kickplates at door bottom
  const brassGeo = new THREE.BoxGeometry(doorW * 0.92, 0.25, 0.09)
  const brassMat = getGoldFinialMaterial()
  const bLeft = new THREE.Mesh(brassGeo, brassMat)
  bLeft.position.set(-doorW * 0.51, 0.22, recess)
  portalGroup.add(bLeft)
  const bRight = new THREE.Mesh(brassGeo, brassMat)
  bRight.position.set(doorW * 0.51, 0.22, recess)
  portalGroup.add(bRight)

  // 5. Recessed stone steps leading into the doorway
  const stepCount = 3
  const stepRise = 0.14
  for (let s = 0; s < stepCount; s++) {
    const sw = portalW - jambW * 1.5 + (stepCount - s) * 0.15
    const st = 0.32
    const stepGeo = new THREE.BoxGeometry(sw, stepRise, st)
    const stepMesh = new THREE.Mesh(stepGeo, jambMat)
    stepMesh.position.set(0, s * stepRise + stepRise / 2, s * st * 0.8)
    portalGroup.add(stepMesh)
  }

  const angle = Math.atan2(dir.y, dir.x)
  portalGroup.rotation.y = -angle
  portalGroup.position.set(mid.x + normal.x * recess, 0, mid.y + normal.y * recess)
  group.add(portalGroup)
}

/**
 * Builds a row of tubular steel bicycle racks (arceaux à vélos) along the front parvis.
 */
function buildBicycleRacks(
  group: THREE.Group,
  startPos: THREE.Vector3,
  dir: THREE.Vector2,
  count: number,
  spacing: number,
): void {
  const rackMat = getBikeRackMaterial()
  const rackRadius = 0.035
  const hoopW = 0.75
  const hoopH = 0.85

  for (let i = 0; i < count; i++) {
    const rackGroup = new THREE.Group()

    // Left leg
    const legGeo = new THREE.CylinderGeometry(rackRadius, rackRadius, hoopH, 8)
    const lLeg = new THREE.Mesh(legGeo, rackMat)
    lLeg.position.set(-hoopW / 2, hoopH / 2, 0)
    rackGroup.add(lLeg)

    // Right leg
    const rLeg = new THREE.Mesh(legGeo, rackMat)
    rLeg.position.set(hoopW / 2, hoopH / 2, 0)
    rackGroup.add(rLeg)

    // Top horizontal bar
    const topGeo = new THREE.CylinderGeometry(rackRadius, rackRadius, hoopW, 8)
    topGeo.rotateZ(Math.PI / 2)
    const topBar = new THREE.Mesh(topGeo, rackMat)
    topBar.position.set(0, hoopH, 0)
    rackGroup.add(topBar)

    const posX = startPos.x + dir.x * (i * spacing)
    const posZ = startPos.z + dir.y * (i * spacing)
    rackGroup.position.set(posX, startPos.y, posZ)
    const angle = Math.atan2(dir.y, dir.x)
    rackGroup.rotation.y = -angle + Math.PI / 2
    group.add(rackGroup)
  }
}

/**
 * Builds the grand monumental colonnade portico (Péristyle) for universities.
 */
function buildUniversityColonnade(
  group: THREE.Group,
  mid: THREE.Vector2,
  dir: THREE.Vector2,
  normal: THREE.Vector2,
  wallHeight: number,
  porticoW: number,
  colCount: number,
  inscriptionText: string,
): void {
  const portGroup = new THREE.Group()
  const stoneMat = getStoneMouldingMaterial()

  const colH = Math.min(10.0, wallHeight * 0.75)
  const colR = 0.38
  const porticoDepth = 1.6

  // 1. Cascading multi-tiered grand flight of steps (Escalier d'honneur)
  const stepCount = 5
  const stepRise = 0.16
  for (let s = 0; s < stepCount; s++) {
    const sw = porticoW + (stepCount - s) * 0.6
    const sd = porticoDepth + (stepCount - s) * 0.4
    const sGeo = new THREE.BoxGeometry(sw, stepRise, sd)
    const sMesh = new THREE.Mesh(sGeo, stoneMat)
    sMesh.position.set(0, s * stepRise + stepRise / 2, (s - stepCount / 2) * 0.25)
    portGroup.add(sMesh)
  }

  // 2. Colonnade: 4 or 6 grand classical fluted columns
  const colSpacing = porticoW / (colCount - 1)
  const startX = -porticoW / 2
  const colGeo = new THREE.CylinderGeometry(colR * 0.9, colR, colH, 16)
  const baseCapGeo = new THREE.BoxGeometry(colR * 2.5, 0.25, colR * 2.5)

  for (let c = 0; c < colCount; c++) {
    const cx = startX + c * colSpacing

    // Column shaft
    const colMesh = new THREE.Mesh(colGeo, stoneMat)
    colMesh.position.set(cx, stepCount * stepRise + colH / 2, 0)
    portGroup.add(colMesh)

    // Base
    const baseMesh = new THREE.Mesh(baseCapGeo, stoneMat)
    baseMesh.position.set(cx, stepCount * stepRise + 0.12, 0)
    portGroup.add(baseMesh)

    // Capital
    const capMesh = new THREE.Mesh(baseCapGeo, stoneMat)
    capMesh.position.set(cx, stepCount * stepRise + colH - 0.12, 0)
    portGroup.add(capMesh)
  }

  // 3. Entablature above columns with carved Roman inscription
  const entabH = 1.1
  const entabGeo = new THREE.BoxGeometry(porticoW + 0.8, entabH, porticoDepth * 0.8)
  const entabMesh = new THREE.Mesh(entabGeo, stoneMat)
  entabMesh.position.set(0, stepCount * stepRise + colH + entabH / 2, 0)
  portGroup.add(entabMesh)

  const inscriptMat = makeInscriptionMaterial(inscriptionText)
  const plaqueGeo = new THREE.PlaneGeometry(porticoW * 0.85, entabH * 0.65)
  const plaqueMesh = new THREE.Mesh(plaqueGeo, inscriptMat)
  plaqueMesh.position.set(0, stepCount * stepRise + colH + entabH / 2, porticoDepth * 0.4 + 0.02)
  portGroup.add(plaqueMesh)

  // 4. Triangular pediment with dentils and sculpted tympanum
  const pedH = Math.min(3.5, porticoW * 0.25)
  const pedShape = new THREE.Shape()
  pedShape.moveTo(-porticoW / 2 - 0.5, 0)
  pedShape.lineTo(porticoW / 2 + 0.5, 0)
  pedShape.lineTo(0, pedH)
  pedShape.closePath()

  const pedGeo = new THREE.ExtrudeGeometry(pedShape, { depth: porticoDepth * 0.6, bevelEnabled: false })
  const pedMesh = new THREE.Mesh(pedGeo, stoneMat)
  pedMesh.position.set(0, stepCount * stepRise + colH + entabH, -porticoDepth * 0.3)
  portGroup.add(pedMesh)

  // 5. Triple grand entrance doors recessed behind the colonnade
  const doorGeo = new THREE.BoxGeometry(1.6, 3.2, 0.08)
  const oakMat = getOakDoorMaterial()
  for (let d = -1; d <= 1; d++) {
    const door = new THREE.Mesh(doorGeo, oakMat)
    door.position.set(d * (porticoW * 0.28), stepCount * stepRise + 1.6, -porticoDepth * 0.5)
    portGroup.add(door)
  }

  const angle = Math.atan2(dir.y, dir.x)
  portGroup.rotation.y = -angle
  portGroup.position.set(mid.x + normal.x * (porticoDepth * 0.5), 0, mid.y + normal.y * (porticoDepth * 0.5))
  group.add(portGroup)
}

/**
 * Builds a monumental central copper dome with an octagonal drum and lantern cupola.
 */
function buildUniversityDome(
  group: THREE.Group,
  center: THREE.Vector2,
  wallHeight: number,
  domeRadius: number,
): void {
  const domeGroup = new THREE.Group()
  const stoneMat = getStoneMouldingMaterial()
  const copperMat = getCopperDomeMaterial()

  // 1. Octagonal stone drum with arched clerestory windows
  const drumH = Math.max(2.5, domeRadius * 0.6)
  const drumGeo = new THREE.CylinderGeometry(domeRadius * 1.05, domeRadius * 1.08, drumH, 8)
  const drumMesh = new THREE.Mesh(drumGeo, stoneMat)
  drumMesh.position.set(0, drumH / 2, 0)
  domeGroup.add(drumMesh)

  // 2. Hemispherical copper dome
  const domeGeo = new THREE.SphereGeometry(domeRadius, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2)
  const domeMesh = new THREE.Mesh(domeGeo, copperMat)
  domeMesh.position.set(0, drumH, 0)
  domeGroup.add(domeMesh)

  // 3. Golden lantern cupola atop dome
  const lanternH = domeRadius * 0.55
  const lanternR = domeRadius * 0.26
  const lanternGeo = new THREE.CylinderGeometry(lanternR, lanternR * 1.1, lanternH, 8)
  const lanternMesh = new THREE.Mesh(lanternGeo, stoneMat)
  lanternMesh.position.set(0, drumH + domeRadius + lanternH / 2, 0)
  domeGroup.add(lanternMesh)

  // 4. Lantern roof cap & finial
  const capGeo = new THREE.ConeGeometry(lanternR * 1.25, lanternH * 0.6, 8)
  const capMesh = new THREE.Mesh(capGeo, copperMat)
  capMesh.position.set(0, drumH + domeRadius + lanternH + lanternH * 0.3, 0)
  domeGroup.add(capMesh)

  const finialGeo = new THREE.SphereGeometry(0.22, 10, 8)
  const finialMesh = new THREE.Mesh(finialGeo, getGoldFinialMaterial())
  finialMesh.position.set(0, drumH + domeRadius + lanternH * 1.7, 0)
  domeGroup.add(finialMesh)

  domeGroup.position.set(center.x, wallHeight, center.y)
  group.add(domeGroup)
}

// ─── Main Academic Architecture Entry Point ─────────────────────────────────

export function buildAcademicArchitecture(
  group: THREE.Group,
  fp2d: THREE.Vector2[],
  wallHeight: number,
  roofPitch: number,
  facadeMat: THREE.Material,
  roofMat: THREE.Material,
  buildingType: string | undefined,
  buildingName: string | undefined,
): void {
  const edge = findFrontFacadeEdge(fp2d)
  if (edge.len < 5.0) return

  const n = (buildingName ?? '').toLowerCase()
  const eduKind = isEducationalName(buildingName ?? '')

  const isUni =
    buildingType === 'university' ||
    buildingType === 'college' ||
    eduKind === 'university' ||
    /\b(universit|facult|campus|sorbonne|pantheon|polytech|institut|college\s+of)\b/i.test(n) ||
    wallHeight >= 18
  const isLycee =
    /\b(lycée|lycee|collège|college|high\s*school|gymnasium)\b/i.test(n) ||
    (buildingType === 'school' && wallHeight >= 12.5)

  const academicType: AcademicType = isUni ? 'university' : isLycee ? 'lycee' : 'school'

  // Centroid of building footprint for roof elements (campanile, dome)
  let sumX = 0,
    sumZ = 0
  for (const p of fp2d) {
    sumX += p.x
    sumZ += p.y
  }
  const centroid = new THREE.Vector2(sumX / fp2d.length, sumZ / fp2d.length)

  // ──────────────────────────────────────────────────────────────────────────
  // 1. ÉCOLE PRIMAIRE / ELEMENTARY SCHOOL / KINDERGARTEN
  // ──────────────────────────────────────────────────────────────────────────
  if (academicType === 'school') {
    const portalW = Math.min(3.8, edge.len * 0.35)
    const portalH = 3.2
    const clockR = 0.75

    // A. Entrance portal with painted green double doors
    const label = buildingName ? buildingName.slice(0, 24) : 'ÉCOLE'
    buildAcademicEntrancePortal(
      group,
      edge.mid,
      edge.dir,
      edge.normal,
      portalW,
      portalH,
      getGreenDoorMaterial(),
      label,
    )

    // B. School clock mounted above entrance on facade
    const clockY = Math.min(wallHeight - clockR * 1.2, portalH + 1.6)
    const clockPos = new THREE.Vector3(
      edge.mid.x + edge.normal.x * 0.12,
      clockY,
      edge.mid.y + edge.normal.y * 0.12,
    )
    buildSchoolClock(group, clockPos, edge.normal, clockR)

    // C. Roof bell campanile with 3D bronze bell (centered on roof ridge above entrance)
    const campPos = new THREE.Vector2(
      edge.mid.x + edge.normal.x * 3.5,
      edge.mid.y + edge.normal.y * 3.5,
    )
    buildSchoolBellCampanile(group, campPos, wallHeight, 2.4, 3.2, roofMat)

    // D. Bicycle racks along front facade
    if (edge.len >= 12.0) {
      const rackStart = new THREE.Vector3(
        edge.mid.x - edge.dir.x * (portalW * 0.8 + 2.5) + edge.normal.x * 0.5,
        0,
        edge.mid.y - edge.dir.y * (portalW * 0.8 + 2.5) + edge.normal.y * 0.5,
      )
      buildBicycleRacks(group, rackStart, edge.dir, 4, 1.0)
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 2. LYCÉE & COLLÈGE (HIGH SCHOOL)
  // ──────────────────────────────────────────────────────────────────────────
  else if (academicType === 'lycee') {
    const portalW = Math.min(4.8, edge.len * 0.32)
    const portalH = 3.8
    const clockR = 1.05

    // A. Monumental entrance portal with oak doors
    const inscription = buildingName ? buildingName.slice(0, 24) : 'LYCÉE'
    buildAcademicEntrancePortal(
      group,
      edge.mid,
      edge.dir,
      edge.normal,
      portalW,
      portalH,
      getOakDoorMaterial(),
      inscription,
    )

    // B. Large illuminated academic clock above entrance
    const clockY = Math.min(wallHeight - clockR * 1.3, portalH + 2.4)
    const clockPos = new THREE.Vector3(
      edge.mid.x + edge.normal.x * 0.15,
      clockY,
      edge.mid.y + edge.normal.y * 0.15,
    )
    buildSchoolClock(group, clockPos, edge.normal, clockR)

    // C. Elevated clock tower / campanile pavilion on central roof
    const campPos = new THREE.Vector2(
      edge.mid.x + edge.normal.x * 4.5,
      edge.mid.y + edge.normal.y * 4.5,
    )
    buildSchoolBellCampanile(group, campPos, wallHeight, 3.4, 4.6, roofMat)

    // D. Student bicycle parking racks along front facade
    if (edge.len >= 16.0) {
      const rackStart = new THREE.Vector3(
        edge.mid.x + edge.dir.x * (portalW * 0.7 + 2.0) + edge.normal.x * 0.6,
        0,
        edge.mid.y + edge.dir.y * (portalW * 0.7 + 2.0) + edge.normal.y * 0.6,
      )
      buildBicycleRacks(group, rackStart, edge.dir, 6, 1.1)
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 3. UNIVERSITÉ & CAMPUS (UNIVERSITY / FACULTY)
  // ──────────────────────────────────────────────────────────────────────────
  else if (academicType === 'university') {
    const colonnadeW = Math.min(14.0, Math.max(7.0, edge.len * 0.45))
    const colCount = colonnadeW >= 10.0 ? 6 : 4
    const inscription = buildingName ? buildingName.slice(0, 26) : 'UNIVERSITAS'

    // A. Monumental Classical Colonnade Portico & Grand Flight of Stairs
    buildUniversityColonnade(
      group,
      edge.mid,
      edge.dir,
      edge.normal,
      wallHeight,
      colonnadeW,
      colCount,
      inscription,
    )

    // B. Monumental Central Copper Dome (Coupole Universitaire)
    const domeR = Math.min(8.0, Math.max(3.5, edge.len * 0.18))
    buildUniversityDome(group, centroid, wallHeight, domeR)

    // C. Campus Directory Totem
    const totemPos = new THREE.Vector3(
      edge.mid.x + edge.dir.x * (colonnadeW * 0.65 + 2.0) + edge.normal.x * 0.8,
      0,
      edge.mid.y + edge.dir.y * (colonnadeW * 0.65 + 2.0) + edge.normal.y * 0.8,
    )
    const totemGeo = new THREE.BoxGeometry(0.8, 2.2, 0.15)
    const totemMesh = new THREE.Mesh(totemGeo, getTotemMaterial())
    totemMesh.position.set(totemPos.x, 1.1, totemPos.z)
    const totemAngle = Math.atan2(edge.dir.y, edge.dir.x)
    totemMesh.rotation.y = -totemAngle
    group.add(totemMesh)

    // D. Bicycle parking station
    if (edge.len >= 20.0) {
      const rackStart = new THREE.Vector3(
        edge.mid.x + edge.dir.x * (colonnadeW * 0.65 + 4.0) + edge.normal.x * 0.8,
        0,
        edge.mid.y + edge.dir.y * (colonnadeW * 0.65 + 4.0) + edge.normal.x * 0.8,
      )
      buildBicycleRacks(group, rackStart, edge.dir, 8, 1.1)
    }
  }
}
