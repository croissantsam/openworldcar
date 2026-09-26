/**
 * HotelBuilder — Generates authentic luxury/grand hotel architecture:
 *   1. Marquise d'Hôtel (Grand Glass & Brass Entrance Canopy):
 *      - Cantilevered glass marquee with polished brass / wrought-iron frame
 *      - Diagonal ornate structural scrollwork brackets supporting the canopy
 *      - Recessed warm spotlight downlights embedded underneath
 *
 *   2. Tapis Rouge (Red Carpet Runner):
 *      - Rich crimson carpet runner with golden borders extending across the entrance
 *
 *   3. Potelets en laiton & Cordons de guidage (Brass Stanchions with Velvet Ropes):
 *      - Polished brass balustrade posts flanking the red carpet
 *      - Elegant draped velvet ropes
 *
 *   4. Porte Tambour (Cylindrical Revolving Door):
 *      - Glazed brass cylindrical drum enclosure
 *      - Rotating glass door wings with brass edge trims and golden reception glow
 *
 *   5. Sculpted Evergreen Topiary Planters (Buis en pot taillés):
 *      - Fluted classical urn planters with spherical sculpted boxwood greenery
 *
 *   6. Enseigne Lumineuse 3D & Étoiles d'Hôtel (Illuminated 3D Marquee Sign):
 *      - 3D marquee sign with hotel name and rating stars (★★★★ / ★★★★★)
 *      - Night emissive glow map
 *
 *   7. Rooftop "HOTEL" Neon Skeleton Sign:
 *      - For buildings >= 14m: vintage rooftop neon sign mounted on steel truss pylons
 *
 * NOTE: Strictly NO flags. All geometry is bounded inside the facade threshold
 * and uses module-level shared materials to preserve 60+ FPS.
 */

import * as THREE from 'three'

// ─── Module-Level Shared Detail Materials ───────────────────────────────────

let brassMaterial: THREE.MeshStandardMaterial | null = null
let canopyGlassMaterial: THREE.MeshStandardMaterial | null = null
let downlightSpotMaterial: THREE.MeshStandardMaterial | null = null
let redCarpetMaterial: THREE.MeshStandardMaterial | null = null
let carpetGoldBorderMaterial: THREE.MeshStandardMaterial | null = null
let velvetRopeMaterial: THREE.MeshStandardMaterial | null = null
let planterUrnMaterial: THREE.MeshStandardMaterial | null = null
let topiaryGreeneryMaterial: THREE.MeshStandardMaterial | null = null
let revolvingGlassMaterial: THREE.MeshStandardMaterial | null = null
let neonSignMaterial: THREE.MeshStandardMaterial | null = null
let neonFrameMaterial: THREE.MeshStandardMaterial | null = null

const marqueeSignMatCache = new Map<string, THREE.MeshStandardMaterial>()

function getBrassMaterial(): THREE.MeshStandardMaterial {
  if (!brassMaterial) {
    brassMaterial = new THREE.MeshStandardMaterial({
      color: 0xd4af37,
      metalness: 0.85,
      roughness: 0.22,
    })
  }
  return brassMaterial
}

function getCanopyGlassMaterial(): THREE.MeshStandardMaterial {
  if (!canopyGlassMaterial) {
    canopyGlassMaterial = new THREE.MeshStandardMaterial({
      color: 0xa8c8dc,
      roughness: 0.12,
      metalness: 0.1,
      transparent: true,
      opacity: 0.72,
      side: THREE.DoubleSide,
    })
  }
  return canopyGlassMaterial
}

function getDownlightSpotMaterial(): THREE.MeshStandardMaterial {
  if (!downlightSpotMaterial) {
    downlightSpotMaterial = new THREE.MeshStandardMaterial({
      color: 0xfff6dd,
      emissive: 0xffd57e,
      emissiveIntensity: 1.8,
      roughness: 0.2,
      metalness: 0.1,
      side: THREE.DoubleSide,
    })
  }
  return downlightSpotMaterial
}

function getRedCarpetMaterial(): THREE.MeshStandardMaterial {
  if (!redCarpetMaterial) {
    redCarpetMaterial = new THREE.MeshStandardMaterial({
      color: 0x861422,
      roughness: 0.94,
      metalness: 0.02,
    })
  }
  return redCarpetMaterial
}

function getCarpetGoldBorderMaterial(): THREE.MeshStandardMaterial {
  if (!carpetGoldBorderMaterial) {
    carpetGoldBorderMaterial = new THREE.MeshStandardMaterial({
      color: 0xdeb843,
      roughness: 0.45,
      metalness: 0.55,
    })
  }
  return carpetGoldBorderMaterial
}

function getVelvetRopeMaterial(): THREE.MeshStandardMaterial {
  if (!velvetRopeMaterial) {
    velvetRopeMaterial = new THREE.MeshStandardMaterial({
      color: 0x7a101b,
      roughness: 0.88,
      metalness: 0.05,
    })
  }
  return velvetRopeMaterial
}

function getPlanterUrnMaterial(): THREE.MeshStandardMaterial {
  if (!planterUrnMaterial) {
    planterUrnMaterial = new THREE.MeshStandardMaterial({
      color: 0x222328,
      roughness: 0.65,
      metalness: 0.25,
    })
  }
  return planterUrnMaterial
}

function getTopiaryGreeneryMaterial(): THREE.MeshStandardMaterial {
  if (!topiaryGreeneryMaterial) {
    topiaryGreeneryMaterial = new THREE.MeshStandardMaterial({
      color: 0x1e4624,
      roughness: 0.92,
      metalness: 0.0,
    })
  }
  return topiaryGreeneryMaterial
}

function getRevolvingGlassMaterial(): THREE.MeshStandardMaterial {
  if (!revolvingGlassMaterial) {
    revolvingGlassMaterial = new THREE.MeshStandardMaterial({
      color: 0x98bcd4,
      roughness: 0.15,
      metalness: 0.05,
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide,
    })
  }
  return revolvingGlassMaterial
}

function getNeonSignMaterial(): THREE.MeshStandardMaterial {
  if (!neonSignMaterial) {
    neonSignMaterial = new THREE.MeshStandardMaterial({
      color: 0xff3b30,
      emissive: 0xff1e10,
      emissiveIntensity: 2.2,
      roughness: 0.25,
      metalness: 0.1,
    })
  }
  return neonSignMaterial
}

function getNeonFrameMaterial(): THREE.MeshStandardMaterial {
  if (!neonFrameMaterial) {
    neonFrameMaterial = new THREE.MeshStandardMaterial({
      color: 0x383c42,
      roughness: 0.7,
      metalness: 0.6,
    })
  }
  return neonFrameMaterial
}

/**
 * Creates a procedural high-res texture for the hotel marquee sign plate with stars and night glow.
 */
function getHotelMarqueeSignMaterial(hotelName: string, starsCount = 4): THREE.MeshStandardMaterial {
  const cleanName = hotelName ? hotelName.toUpperCase().trim() : 'HÔTEL'
  const cacheKey = `${cleanName}_${starsCount}`
  const existing = marqueeSignMatCache.get(cacheKey)
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

  // Deep royal navy / black lacquered background
  ctx.fillStyle = '#0c121e'
  ctx.fillRect(0, 0, W, H)
  ectx.fillStyle = '#000000'
  ectx.fillRect(0, 0, W, H)

  // Polished gold double border
  ctx.strokeStyle = '#d4af37'
  ctx.lineWidth = 4
  ctx.strokeRect(4, 4, W - 8, H - 8)
  ctx.strokeStyle = '#b89230'
  ctx.lineWidth = 1.5
  ctx.strokeRect(10, 10, W - 20, H - 20)

  ectx.strokeStyle = '#7c581a'
  ectx.lineWidth = 3
  ectx.strokeRect(4, 4, W - 8, H - 8)

  // Draw 5-pointed gold stars
  const drawStar = (cx: number, cy: number, r: number) => {
    ctx.beginPath()
    ectx.beginPath()
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5
      const ai = a + Math.PI / 5
      const px = cx + Math.cos(a) * r
      const py = cy + Math.sin(a) * r
      const px2 = cx + Math.cos(ai) * (r * 0.44)
      const py2 = cy + Math.sin(ai) * (r * 0.44)
      if (i === 0) {
        ctx.moveTo(px, py)
        ectx.moveTo(px, py)
      } else {
        ctx.lineTo(px, py)
        ectx.lineTo(px, py)
      }
      ctx.lineTo(px2, py2)
      ectx.lineTo(px2, py2)
    }
    ctx.closePath()
    ectx.closePath()
    ctx.fillStyle = '#ffdf6d'
    ctx.fill()
    ctx.strokeStyle = '#d4af37'
    ctx.lineWidth = 1
    ctx.stroke()

    ectx.fillStyle = '#ffcf40'
    ectx.fill()
  }

  // Draw stars row at the top
  const starR = 9
  const starSpacing = 24
  const startStarX = W / 2 - ((starsCount - 1) * starSpacing) / 2
  for (let s = 0; s < starsCount; s++) {
    drawStar(startStarX + s * starSpacing, 28, starR)
  }

  // Draw Hotel Name in elegant classical Didot/Trajan lettering
  ctx.fillStyle = '#ffffff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  let fontSize = 34
  if (cleanName.length > 20) fontSize = 24
  else if (cleanName.length > 14) fontSize = 28
  ctx.font = `bold ${fontSize}px "Cinzel", "Didot", "Times New Roman", "Georgia", serif`
  ctx.fillText(cleanName, W / 2, 70)

  // Subtitle
  ctx.font = 'bold 13px "Cinzel", "Helvetica Neue", sans-serif'
  ctx.fillStyle = '#d4af37'
  ctx.fillText('H Ô T E L  ★  P A L A C E', W / 2, 104)

  // Emissive glow channel
  ectx.fillStyle = '#fff4cc'
  ectx.textAlign = 'center'
  ectx.textBaseline = 'middle'
  ectx.font = `bold ${fontSize}px "Cinzel", "Didot", "Times New Roman", "Georgia", serif`
  ectx.fillText(cleanName, W / 2, 70)

  ectx.font = 'bold 13px "Cinzel", "Helvetica Neue", sans-serif'
  ectx.fillStyle = '#e6bf44'
  ectx.fillText('H Ô T E L  ★  P A L A C E', W / 2, 104)

  const map = new THREE.CanvasTexture(canvas)
  const emissiveMap = new THREE.CanvasTexture(ecanvas)

  const mat = new THREE.MeshStandardMaterial({
    map,
    emissiveMap,
    emissive: 0xffffff,
    emissiveIntensity: 0.85,
    roughness: 0.4,
    metalness: 0.4,
  })

  marqueeSignMatCache.set(cacheKey, mat)
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
    if (len < 5.0) continue
    const midY = (p1.y + p2.y) / 2
    // Prefer long, visible edges
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
 * Builds the grand glass and polished brass canopy (Marquise d'Hôtel).
 */
function buildHotelMarqueeCanopy(
  group: THREE.Group,
  center: THREE.Vector2,
  dir: THREE.Vector2,
  normal: THREE.Vector2,
  canopyW: number,
  canopyDepth: number,
  canopyY: number,
  hotelName: string,
): void {
  const canopyGroup = new THREE.Group()

  const brass = getBrassMaterial()
  const glass = getCanopyGlassMaterial()
  const spot = getDownlightSpotMaterial()

  // 1. Cantilevered main glass roof slab
  const glassGeo = new THREE.BoxGeometry(canopyW, 0.06, canopyDepth)
  const glassMesh = new THREE.Mesh(glassGeo, glass)
  glassMesh.position.set(0, 0, canopyDepth * 0.5)
  canopyGroup.add(glassMesh)

  // 2. Brass perimeter frame beam
  const frameThickness = 0.12
  const frameHeight = 0.22

  // Front beam (outer edge facing street)
  const frontBeamGeo = new THREE.BoxGeometry(canopyW + 0.1, frameHeight, frameThickness)
  const frontBeam = new THREE.Mesh(frontBeamGeo, brass)
  frontBeam.position.set(0, 0, canopyDepth)
  canopyGroup.add(frontBeam)

  // Side beams
  const sideBeamGeo = new THREE.BoxGeometry(frameThickness, frameHeight, canopyDepth)
  const leftBeam = new THREE.Mesh(sideBeamGeo, brass)
  leftBeam.position.set(-canopyW * 0.5, 0, canopyDepth * 0.5)
  canopyGroup.add(leftBeam)

  const rightBeam = new THREE.Mesh(sideBeamGeo, brass)
  rightBeam.position.set(canopyW * 0.5, 0, canopyDepth * 0.5)
  canopyGroup.add(rightBeam)

  // Brass glazing bars / ribs dividing glass
  const ribCount = Math.max(3, Math.round(canopyW / 1.1))
  for (let r = 1; r < ribCount; r++) {
    const rx = -canopyW * 0.5 + (r * canopyW) / ribCount
    const ribGeo = new THREE.BoxGeometry(0.04, 0.08, canopyDepth)
    const ribMesh = new THREE.Mesh(ribGeo, brass)
    ribMesh.position.set(rx, 0.02, canopyDepth * 0.5)
    canopyGroup.add(ribMesh)
  }

  // 3. Recessed warm spotlight downlights embedded underneath
  const spotCount = Math.min(4, Math.max(2, Math.round(canopyW / 1.4)))
  for (let s = 0; s < spotCount; s++) {
    const sx = -canopyW * 0.4 + (s * (canopyW * 0.8)) / Math.max(1, spotCount - 1)
    const spotGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.04, 12)
    const spotMesh = new THREE.Mesh(spotGeo, spot)
    spotMesh.position.set(sx, -0.04, canopyDepth * 0.55)
    canopyGroup.add(spotMesh)
  }

  // 4. Cantilever ornate diagonal support struts from facade
  const strutGeo = new THREE.CylinderGeometry(0.04, 0.04, Math.hypot(canopyDepth, 1.1), 8)
  const strutAngle = Math.atan2(canopyDepth, 1.1)

  const leftStrut = new THREE.Mesh(strutGeo, brass)
  leftStrut.position.set(-canopyW * 0.46, -0.55, canopyDepth * 0.5)
  leftStrut.rotation.x = strutAngle
  canopyGroup.add(leftStrut)

  const rightStrut = new THREE.Mesh(strutGeo, brass)
  rightStrut.position.set(canopyW * 0.46, -0.55, canopyDepth * 0.5)
  rightStrut.rotation.x = strutAngle
  canopyGroup.add(rightStrut)

  // 5. 3D Illuminated Marquee Sign mounted on the front fascia of the canopy
  const signW = Math.min(canopyW * 0.9, 4.2)
  const signH = 0.75
  const signGeo = new THREE.BoxGeometry(signW, signH, 0.08)
  const signMat = getHotelMarqueeSignMaterial(hotelName, 5)
  const signMesh = new THREE.Mesh(signGeo, signMat)
  signMesh.position.set(0, 0.22, canopyDepth + 0.05)
  canopyGroup.add(signMesh)

  // Position canopy in world coordinates oriented to facade
  const angle = Math.atan2(normal.y, normal.x) - Math.PI / 2
  canopyGroup.rotation.y = -angle
  canopyGroup.position.set(center.x, canopyY, center.y)
  group.add(canopyGroup)
}

/**
 * Builds the red carpet runner with gold border and brass stanchions.
 */
function buildRedCarpetAndStanchions(
  group: THREE.Group,
  center: THREE.Vector2,
  normal: THREE.Vector2,
  carpetW: number,
  carpetLen: number,
): void {
  const runnerGroup = new THREE.Group()

  const carpetMat = getRedCarpetMaterial()
  const goldMat = getCarpetGoldBorderMaterial()
  const brass = getBrassMaterial()
  const velvet = getVelvetRopeMaterial()

  // 1. Red Carpet Runner
  const carpetGeo = new THREE.BoxGeometry(carpetW, 0.025, carpetLen)
  const carpetMesh = new THREE.Mesh(carpetGeo, carpetMat)
  carpetMesh.position.set(0, 0.015, carpetLen * 0.5)
  runnerGroup.add(carpetMesh)

  // Golden side ribbon trim
  const borderW = 0.07
  const borderGeo = new THREE.BoxGeometry(borderW, 0.028, carpetLen)
  const leftBorder = new THREE.Mesh(borderGeo, goldMat)
  leftBorder.position.set(-carpetW * 0.5 + borderW * 0.5, 0.016, carpetLen * 0.5)
  runnerGroup.add(leftBorder)

  const rightBorder = new THREE.Mesh(borderGeo, goldMat)
  rightBorder.position.set(carpetW * 0.5 - borderW * 0.5, 0.016, carpetLen * 0.5)
  runnerGroup.add(rightBorder)

  // 2. Brass Stanchions with Velvet Ropes
  const stanchionCount = 3
  const stanchionH = 0.95
  const stanchionR = 0.035
  const baseR = 0.16

  const baseGeo = new THREE.CylinderGeometry(baseR, baseR * 1.15, 0.05, 16)
  const poleGeo = new THREE.CylinderGeometry(stanchionR, stanchionR, stanchionH, 12)
  const finialGeo = new THREE.SphereGeometry(0.065, 12, 12)

  const ropeGeo = new THREE.CylinderGeometry(0.025, 0.025, 1, 8)

  for (const side of [-1, 1]) {
    const sx = side * (carpetW * 0.5 + 0.18)
    for (let i = 0; i < stanchionCount; i++) {
      const sz = 0.3 + (i * (carpetLen - 0.5)) / (stanchionCount - 1)

      // Base disc
      const baseMesh = new THREE.Mesh(baseGeo, brass)
      baseMesh.position.set(sx, 0.025, sz)
      runnerGroup.add(baseMesh)

      // Post
      const poleMesh = new THREE.Mesh(poleGeo, brass)
      poleMesh.position.set(sx, stanchionH * 0.5, sz)
      runnerGroup.add(poleMesh)

      // Top sphere finial
      const finialMesh = new THREE.Mesh(finialGeo, brass)
      finialMesh.position.set(sx, stanchionH, sz)
      runnerGroup.add(finialMesh)

      // Velvet rope connecting to next stanchion
      if (i < stanchionCount - 1) {
        const nextSz = 0.3 + ((i + 1) * (carpetLen - 0.5)) / (stanchionCount - 1)
        const segLen = nextSz - sz
        const ropeMesh = new THREE.Mesh(ropeGeo, velvet)
        ropeMesh.scale.set(1, segLen, 1)
        ropeMesh.position.set(sx, stanchionH * 0.78, (sz + nextSz) * 0.5)
        ropeMesh.rotation.x = Math.PI / 2
        runnerGroup.add(ropeMesh)
      }
    }
  }

  const angle = Math.atan2(normal.y, normal.x) - Math.PI / 2
  runnerGroup.rotation.y = -angle
  runnerGroup.position.set(center.x, 0, center.y)
  group.add(runnerGroup)
}

/**
 * Builds a 3D revolving door (porte tambour) at the entrance portal.
 */
function buildRevolvingDoor(
  group: THREE.Group,
  center: THREE.Vector2,
  normal: THREE.Vector2,
  doorRadius: number,
  doorHeight: number,
): void {
  const doorGroup = new THREE.Group()

  const brass = getBrassMaterial()
  const glass = getRevolvingGlassMaterial()
  const spot = getDownlightSpotMaterial()

  // 1. Outer curved glass enclosure (drum)
  const drumGeo = new THREE.CylinderGeometry(doorRadius, doorRadius, doorHeight, 20, 1, true, 0, Math.PI * 1.5)
  const drumMesh = new THREE.Mesh(drumGeo, glass)
  drumMesh.position.set(0, doorHeight * 0.5, 0)
  doorGroup.add(drumMesh)

  // Brass plinth ring & ceiling cap
  const ringGeo = new THREE.CylinderGeometry(doorRadius * 1.02, doorRadius * 1.02, 0.08, 24)
  const baseRing = new THREE.Mesh(ringGeo, brass)
  baseRing.position.set(0, 0.04, 0)
  doorGroup.add(baseRing)

  const topCap = new THREE.Mesh(ringGeo, brass)
  topCap.position.set(0, doorHeight + 0.04, 0)
  doorGroup.add(topCap)

  // Ceiling warm downlight spot inside revolving door
  const ceilSpot = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.02, 12), spot)
  ceilSpot.position.set(0, doorHeight - 0.02, 0)
  doorGroup.add(ceilSpot)

  // 2. Central vertical brass spindle
  const spindleGeo = new THREE.CylinderGeometry(0.05, 0.05, doorHeight, 12)
  const spindle = new THREE.Mesh(spindleGeo, brass)
  spindle.position.set(0, doorHeight * 0.5, 0)
  doorGroup.add(spindle)

  // 3. Four rotating door wings with brass edge frames
  const wingW = doorRadius * 0.94
  const wingH = doorHeight * 0.92
  const wingGeo = new THREE.BoxGeometry(wingW, wingH, 0.03)

  for (let w = 0; w < 4; w++) {
    const wingRot = (w * Math.PI) / 2 + 0.25 // slight natural rotation angle
    const wingMesh = new THREE.Mesh(wingGeo, glass)
    wingMesh.position.set(Math.cos(wingRot) * (wingW * 0.5), doorHeight * 0.5, Math.sin(wingRot) * (wingW * 0.5))
    wingMesh.rotation.y = -wingRot
    doorGroup.add(wingMesh)

    // Brass outer edge bumper on wing
    const edgeBumperGeo = new THREE.BoxGeometry(0.035, wingH, 0.04)
    const edgeBumper = new THREE.Mesh(edgeBumperGeo, brass)
    edgeBumper.position.set(Math.cos(wingRot) * wingW, doorHeight * 0.5, Math.sin(wingRot) * wingW)
    edgeBumper.rotation.y = -wingRot
    doorGroup.add(edgeBumper)
  }

  const angle = Math.atan2(normal.y, normal.x) - Math.PI / 2
  doorGroup.rotation.y = -angle
  // Position slightly inward on the threshold
  doorGroup.position.set(center.x - normal.x * 0.2, 0, center.y - normal.y * 0.2)
  group.add(doorGroup)
}

/**
 * Builds sculpted evergreen boxwood topiary planters flanking the entrance.
 */
function buildTopiaryPlanters(
  group: THREE.Group,
  center: THREE.Vector2,
  dir: THREE.Vector2,
  normal: THREE.Vector2,
  spreadDistance: number,
): void {
  const urnMat = getPlanterUrnMaterial()
  const greenMat = getTopiaryGreeneryMaterial()

  // Classical fluted square urn planter
  const urnGeo = new THREE.CylinderGeometry(0.32, 0.24, 0.72, 8)
  // Neatly trimmed spherical evergreen topiary bush
  const bushGeo = new THREE.SphereGeometry(0.42, 12, 12)
  bushGeo.scale(1, 1.15, 1)

  for (const side of [-1, 1]) {
    const planterGroup = new THREE.Group()

    const urnMesh = new THREE.Mesh(urnGeo, urnMat)
    urnMesh.position.set(0, 0.36, 0)
    planterGroup.add(urnMesh)

    const bushMesh = new THREE.Mesh(bushGeo, greenMat)
    bushMesh.position.set(0, 0.98, 0)
    planterGroup.add(bushMesh)

    const px = center.x + dir.x * (side * spreadDistance) + normal.x * 0.4
    const pz = center.y + dir.y * (side * spreadDistance) + normal.y * 0.4
    planterGroup.position.set(px, 0, pz)
    group.add(planterGroup)
  }
}

/**
 * Builds a vintage rooftop "HOTEL" neon skeleton sign atop the front parapet.
 */
function buildRooftopNeonSign(
  group: THREE.Group,
  center: THREE.Vector2,
  normal: THREE.Vector2,
  wallHeight: number,
  signW: number,
): void {
  const neonGroup = new THREE.Group()

  const neonMat = getNeonSignMaterial()
  const frameMat = getNeonFrameMaterial()

  const signH = 1.9
  const pylonH = 0.85

  // 1. Steel structural truss framework
  const pylonGeo = new THREE.CylinderGeometry(0.045, 0.045, pylonH + signH, 8)
  const leftPylon = new THREE.Mesh(pylonGeo, frameMat)
  leftPylon.position.set(-signW * 0.45, (pylonH + signH) * 0.5, 0)
  neonGroup.add(leftPylon)

  const rightPylon = new THREE.Mesh(pylonGeo, frameMat)
  rightPylon.position.set(signW * 0.45, (pylonH + signH) * 0.5, 0)
  neonGroup.add(rightPylon)

  // Horizontal support rails
  const railGeo = new THREE.CylinderGeometry(0.03, 0.03, signW, 8)
  const topRail = new THREE.Mesh(railGeo, frameMat)
  topRail.position.set(0, pylonH + signH * 0.85, 0)
  topRail.rotation.z = Math.PI / 2
  neonGroup.add(topRail)

  const botRail = new THREE.Mesh(railGeo, frameMat)
  botRail.position.set(0, pylonH + signH * 0.15, 0)
  botRail.rotation.z = Math.PI / 2
  neonGroup.add(botRail)

  // 2. Individual 3D Glowing Neon Letters: "H O T E L"
  const letters = ['H', 'O', 'T', 'E', 'L']
  const letterSpacing = (signW * 0.8) / (letters.length - 1)
  const letterY = pylonH + signH * 0.5
  const letterH = signH * 0.75
  const tubeThick = 0.07

  letters.forEach((l, idx) => {
    const lx = -signW * 0.4 + idx * letterSpacing
    const letterGroup = new THREE.Group()

    if (l === 'H') {
      const legGeo = new THREE.BoxGeometry(tubeThick, letterH, tubeThick)
      const barGeo = new THREE.BoxGeometry(0.35, tubeThick, tubeThick)
      const l1 = new THREE.Mesh(legGeo, neonMat)
      l1.position.set(-0.175, 0, 0)
      const l2 = new THREE.Mesh(legGeo, neonMat)
      l2.position.set(0.175, 0, 0)
      const bar = new THREE.Mesh(barGeo, neonMat)
      letterGroup.add(l1, l2, bar)
    } else if (l === 'O') {
      const ringGeo = new THREE.TorusGeometry(letterH * 0.38, tubeThick * 0.5, 8, 16)
      const oMesh = new THREE.Mesh(ringGeo, neonMat)
      letterGroup.add(oMesh)
    } else if (l === 'T') {
      const stemGeo = new THREE.BoxGeometry(tubeThick, letterH, tubeThick)
      const topGeo = new THREE.BoxGeometry(0.42, tubeThick, tubeThick)
      const stem = new THREE.Mesh(stemGeo, neonMat)
      const top = new THREE.Mesh(topGeo, neonMat)
      top.position.set(0, letterH * 0.46, 0)
      letterGroup.add(stem, top)
    } else if (l === 'E') {
      const backGeo = new THREE.BoxGeometry(tubeThick, letterH, tubeThick)
      const armGeo = new THREE.BoxGeometry(0.32, tubeThick, tubeThick)
      const back = new THREE.Mesh(backGeo, neonMat)
      back.position.set(-0.15, 0, 0)
      const topArm = new THREE.Mesh(armGeo, neonMat)
      topArm.position.set(0, letterH * 0.46, 0)
      const midArm = new THREE.Mesh(armGeo, neonMat)
      midArm.position.set(-0.02, 0, 0)
      const botArm = new THREE.Mesh(armGeo, neonMat)
      botArm.position.set(0, -letterH * 0.46, 0)
      letterGroup.add(back, topArm, midArm, botArm)
    } else if (l === 'L') {
      const backGeo = new THREE.BoxGeometry(tubeThick, letterH, tubeThick)
      const footGeo = new THREE.BoxGeometry(0.34, tubeThick, tubeThick)
      const back = new THREE.Mesh(backGeo, neonMat)
      back.position.set(-0.14, 0, 0)
      const foot = new THREE.Mesh(footGeo, neonMat)
      foot.position.set(0.02, -letterH * 0.46, 0)
      letterGroup.add(back, foot)
    }

    letterGroup.position.set(lx, letterY, 0.04)
    neonGroup.add(letterGroup)
  })

  const angle = Math.atan2(normal.y, normal.x) - Math.PI / 2
  neonGroup.rotation.y = -angle
  // Position on roof front parapet
  neonGroup.position.set(center.x - normal.x * 0.5, wallHeight, center.y - normal.y * 0.5)
  group.add(neonGroup)
}

// ─── Main Hotel Architecture Entry Point ────────────────────────────────────

/**
 * Builds complete 3D hotel architecture for an OSM hotel building.
 */
export function buildHotelArchitecture(
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

  const displayName = buildingName ? buildingName.slice(0, 26) : 'HÔTEL'

  // Dimensions scaled proportionally to facade width
  const canopyW = Math.min(5.4, Math.max(3.6, edge.len * 0.34))
  const canopyDepth = Math.min(2.2, Math.max(1.5, edge.len * 0.16))
  const canopyY = Math.min(3.8, Math.max(3.2, wallHeight * 0.28))

  // 1. Marquise d'Hôtel (Grand Glass and Brass Entrance Canopy with spotlights & 3D sign)
  buildHotelMarqueeCanopy(
    group,
    edge.mid,
    edge.dir,
    edge.normal,
    canopyW,
    canopyDepth,
    canopyY,
    displayName,
  )

  // 2. Revolving Door (Porte Tambour)
  const doorR = Math.min(1.4, Math.max(1.05, canopyW * 0.26))
  const doorH = Math.min(canopyY - 0.2, 3.0)
  buildRevolvingDoor(group, edge.mid, edge.normal, doorR, doorH)

  // 3. Red Carpet Runner and Brass Stanchions
  const carpetW = Math.min(2.4, Math.max(1.6, doorR * 1.6))
  const carpetLen = canopyDepth + 0.6
  buildRedCarpetAndStanchions(group, edge.mid, edge.normal, carpetW, carpetLen)

  // 4. Evergreen Topiary Planters flanking the canopy
  const planterSpread = canopyW * 0.5 + 0.75
  buildTopiaryPlanters(group, edge.mid, edge.dir, edge.normal, planterSpread)

  // 5. Rooftop Neon Sign for buildings >= 14m tall
  if (wallHeight >= 14.0 && edge.len >= 9.0) {
    const neonSignW = Math.min(7.5, Math.max(4.2, edge.len * 0.42))
    buildRooftopNeonSign(group, edge.mid, edge.normal, wallHeight, neonSignW)
  }
}
