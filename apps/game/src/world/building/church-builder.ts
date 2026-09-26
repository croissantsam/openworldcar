/**
 * ChurchBuilder — Generates authentic ecclesiastical architecture for churches,
 * cathedrals, and chapels:
 *   - Monumental bell tower (clocher) with belfry louvers (abat-sons), clock faces,
 *     and soaring octagonal spire (flèche) crowned with a golden cross
 *   - Twin facade towers for grand cathedrals
 *   - Real 3D stone buttresses (contreforts) stepping down the nave walls
 *   - Sculpted stone entrance portal (grand portail roman/gothique) with carved timber doors
 *   - Ridge crossing flèche for large cathedrals
 *
 * All geometry shares existing chunk materials (facadeMat, roofMat, and shared cross/door materials)
 * to maintain bounded draw calls and 60+ FPS performance.
 */

import * as THREE from 'three'

// Shared church detail materials (module-level)
let crossMaterial: THREE.MeshStandardMaterial | null = null
let oakDoorMaterial: THREE.MeshStandardMaterial | null = null
let belfryLouverMaterial: THREE.MeshStandardMaterial | null = null
let clockDialMaterial: THREE.MeshStandardMaterial | null = null

function getCrossMaterial(): THREE.MeshStandardMaterial {
  if (!crossMaterial) {
    crossMaterial = new THREE.MeshStandardMaterial({
      color: 0xd4af37,
      metalness: 0.85,
      roughness: 0.22,
    })
  }
  return crossMaterial
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

function getBelfryLouverMaterial(): THREE.MeshStandardMaterial {
  if (!belfryLouverMaterial) {
    belfryLouverMaterial = new THREE.MeshStandardMaterial({
      color: 0x221c17,
      roughness: 0.90,
      metalness: 0.05,
    })
  }
  return belfryLouverMaterial
}

function getClockDialMaterial(): THREE.MeshStandardMaterial {
  if (!clockDialMaterial) {
    // White dial with dark rim
    const canvas = document.createElement('canvas')
    canvas.width = 128
    canvas.height = 128
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#f8f6f0'
    ctx.beginPath()
    ctx.arc(64, 64, 60, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#1a1815'
    ctx.lineWidth = 6
    ctx.stroke()
    ctx.strokeStyle = '#2b2620'
    ctx.lineWidth = 2
    ctx.strokeRect(62, 16, 4, 20) // 12
    ctx.strokeRect(92, 62, 20, 4) // 3
    ctx.strokeRect(62, 92, 4, 20) // 6
    ctx.strokeRect(16, 62, 20, 4) // 9
    // Hour & minute hands
    ctx.strokeStyle = '#111111'
    ctx.lineWidth = 4
    ctx.beginPath(); ctx.moveTo(64, 64); ctx.lineTo(64, 28); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(64, 64); ctx.lineTo(90, 64); ctx.stroke()
    const tex = new THREE.CanvasTexture(canvas)
    clockDialMaterial = new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.5,
      metalness: 0.1,
    })
  }
  return clockDialMaterial
}

/**
 * Builds authentic religious architecture elements (bell tower, spire,
 * buttresses, and entrance portal) and attaches them to the building group.
 */
export function buildChurchArchitecture(
  group: THREE.Group,
  fp2d: THREE.Vector2[],
  wallHeight: number,
  roofPitch: number,
  bType: 'church' | 'cathedral' | 'chapel',
  facadeMat: THREE.MeshStandardMaterial,
  roofMat: THREE.MeshStandardMaterial,
): void {
  if (fp2d.length < 3) return

  // 1. Calculate bounding box and nave principal axis
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const p of fp2d) {
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y
    if (p.y > maxY) maxY = p.y
  }

  const spanX = maxX - minX
  const spanY = maxY - minY
  const alongX = spanX >= spanY
  const naveLen = Math.max(spanX, spanY)
  const naveW = Math.min(spanX, spanY)
  const cx = (minX + maxX) / 2
  const cz = (minY + maxY) / 2

  // Front facade center (entrance end) vs rear choir
  const frontX = alongX ? minX : cx
  const frontZ = alongX ? cz : minY

  const crossMat = getCrossMaterial()
  const belfryMat = getBelfryLouverMaterial()
  const clockMat = getClockDialMaterial()
  const doorMat = getOakDoorMaterial()

  // ── 2. Bell Tower & Spire (Clocher & Flèche) ──────────────────────────────
  const isCathedral = bType === 'cathedral'
  const isLargeCathedral = isCathedral && naveW >= 15.0 && naveLen >= 28.0

  if (isLargeCathedral) {
    // ── Twin Gothic Facade Towers (Tours jumelles style Notre-Dame) ──
    const towerW = Math.max(5.5, Math.min(8.5, naveW * 0.36))
    const towerH = 22.0
    const spireH = 18.0
    const towerBaseY = wallHeight

    const offsetDist = naveW * 0.32
    const offsets = alongX
      ? [{ x: minX + towerW * 0.55, z: cz - offsetDist }, { x: minX + towerW * 0.55, z: cz + offsetDist }]
      : [{ x: cx - offsetDist, z: minY + towerW * 0.55 }, { x: cx + offsetDist, z: minY + towerW * 0.55 }]

    for (const tPos of offsets) {
      addBellTower(group, tPos.x, tPos.z, towerW, towerH, spireH, towerBaseY, facadeMat, roofMat, belfryMat, clockMat, crossMat)
    }

    // Central Crossing Flèche (Flèche de croisée du transept)
    const crossingSpireH = 22.0
    const crossingBaseY = wallHeight + roofPitch
    const crossingMesh = new THREE.Mesh(new THREE.ConeGeometry(2.4, crossingSpireH, 8), roofMat)
    crossingMesh.position.set(cx, crossingBaseY + crossingSpireH / 2, cz)
    crossingMesh.castShadow = true
    group.add(crossingMesh)
    addCrossFinial(group, cx, cz, crossingBaseY + crossingSpireH, crossMat, 2.0)

  } else {
    // ── Single Monumental Bell Tower (Clocher de façade ou de croisée) ──
    const towerW = Math.max(4.8, Math.min(7.5, naveW * 0.42))
    const towerH = isCathedral ? 20.0 : bType === 'chapel' ? 10.0 : 15.0
    const spireH = isCathedral ? 22.0 : bType === 'chapel' ? 12.0 : 17.0
    const towerBaseY = wallHeight

    // Positioned at the front facade of the church
    const tX = alongX ? minX + towerW * 0.6 : cx
    const tZ = alongX ? cz : minY + towerW * 0.6

    addBellTower(group, tX, tZ, towerW, towerH, spireH, towerBaseY, facadeMat, roofMat, belfryMat, clockMat, crossMat)
  }

  // ── 3. 3D Wall Buttresses (Contreforts en saillie le long de la nef) ──────
  addNaveButtresses(group, fp2d, wallHeight, facadeMat)

  // ── 4. Monumental Church Portal (Grand Portail d'Entrée) ─────────────────
  addChurchPortal(group, frontX, frontZ, alongX, facadeMat, doorMat, crossMat)
}

/**
 * Creates a stone bell tower with belfry louvers, clock dials, stone cornice,
 * octagonal spire, and golden cross finial.
 */
function addBellTower(
  group: THREE.Group,
  tX: number,
  tZ: number,
  towerW: number,
  towerH: number,
  spireH: number,
  towerBaseY: number,
  facadeMat: THREE.MeshStandardMaterial,
  roofMat: THREE.MeshStandardMaterial,
  belfryMat: THREE.MeshStandardMaterial,
  clockMat: THREE.MeshStandardMaterial,
  crossMat: THREE.MeshStandardMaterial,
): void {
  // Main square stone shaft
  const towerGeo = new THREE.BoxGeometry(towerW, towerH, towerW)
  const towerMesh = new THREE.Mesh(towerGeo, facadeMat)
  towerMesh.position.set(tX, towerBaseY + towerH / 2, tZ)
  towerMesh.castShadow = true
  towerMesh.receiveShadow = true
  group.add(towerMesh)

  // Corner pilasters / buttresses along tower corners
  const pilasterW = 0.45
  const pilasterOff = (towerW + pilasterW) / 2 - 0.05
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const pMesh = new THREE.Mesh(new THREE.BoxGeometry(pilasterW, towerH, pilasterW), facadeMat)
      pMesh.position.set(tX + sx * pilasterOff, towerBaseY + towerH / 2, tZ + sz * pilasterOff)
      pMesh.castShadow = true
      group.add(pMesh)
    }
  }

  // Belfry chamber louvers (Abat-sons) on all 4 faces
  const belfryW = towerW * 0.44
  const belfryH = towerH * 0.26
  const belfryY = towerBaseY + towerH * 0.68
  const belfryOff = towerW / 2 + 0.04

  // North / South louvers
  for (const s of [-1, 1]) {
    const louverZ = new THREE.Mesh(new THREE.BoxGeometry(belfryW, belfryH, 0.12), belfryMat)
    louverZ.position.set(tX, belfryY, tZ + s * belfryOff)
    group.add(louverZ)

    const louverX = new THREE.Mesh(new THREE.BoxGeometry(0.12, belfryH, belfryW), belfryMat)
    louverX.position.set(tX + s * belfryOff, belfryY, tZ)
    group.add(louverX)
  }

  // Clock faces on 4 faces below belfry
  const clockRadius = Math.max(0.7, towerW * 0.18)
  const clockY = towerBaseY + towerH * 0.38
  const clockOff = towerW / 2 + 0.03
  const clockGeo = new THREE.CylinderGeometry(clockRadius, clockRadius, 0.08, 16)

  // North/South clocks
  const cNorth = new THREE.Mesh(clockGeo, clockMat)
  cNorth.rotation.x = Math.PI / 2
  cNorth.position.set(tX, clockY, tZ + clockOff)
  group.add(cNorth)

  const cSouth = new THREE.Mesh(clockGeo, clockMat)
  cSouth.rotation.x = -Math.PI / 2
  cSouth.position.set(tX, clockY, tZ - clockOff)
  group.add(cSouth)

  // East/West clocks
  const cEast = new THREE.Mesh(clockGeo, clockMat)
  cEast.rotation.z = -Math.PI / 2
  cEast.position.set(tX + clockOff, clockY, tZ)
  group.add(cEast)

  const cWest = new THREE.Mesh(clockGeo, clockMat)
  cWest.rotation.z = Math.PI / 2
  cWest.position.set(tX - clockOff, clockY, tZ)
  group.add(cWest)

  // Stone cornice / balustrade crowning the tower
  const corniceH = 0.7
  const corniceMesh = new THREE.Mesh(new THREE.BoxGeometry(towerW + 0.6, corniceH, towerW + 0.6), facadeMat)
  corniceMesh.position.set(tX, towerBaseY + towerH + corniceH / 2, tZ)
  corniceMesh.castShadow = true
  group.add(corniceMesh)

  // Steep octagonal spire (Flèche en ardoise / zinc)
  const spireBaseR = towerW * 0.60
  const spireMesh = new THREE.Mesh(new THREE.ConeGeometry(spireBaseR, spireH, 8), roofMat)
  spireMesh.position.set(tX, towerBaseY + towerH + corniceH + spireH / 2, tZ)
  spireMesh.castShadow = true
  group.add(spireMesh)

  // Golden cross finial at the pinnacle
  addCrossFinial(group, tX, tZ, towerBaseY + towerH + corniceH + spireH, crossMat, 2.2)
}

/**
 * Creates a gleaming golden Latin cross finial at a given point.
 */
function addCrossFinial(
  group: THREE.Group,
  x: number,
  z: number,
  baseY: number,
  crossMat: THREE.MeshStandardMaterial,
  height = 2.0,
): void {
  const shaftW = 0.12
  const barW = height * 0.58
  const barY = baseY + height * 0.68

  const vShaft = new THREE.Mesh(new THREE.BoxGeometry(shaftW, height, shaftW), crossMat)
  vShaft.position.set(x, baseY + height / 2, z)
  vShaft.castShadow = true
  group.add(vShaft)

  const hBar = new THREE.Mesh(new THREE.BoxGeometry(barW, shaftW, shaftW), crossMat)
  hBar.position.set(x, barY, z)
  hBar.castShadow = true
  group.add(hBar)
}

/**
 * Generates projecting 3D stone buttresses with sloped weatherings along the nave walls.
 */
function addNaveButtresses(
  group: THREE.Group,
  fp2d: THREE.Vector2[],
  wallHeight: number,
  facadeMat: THREE.MeshStandardMaterial,
): void {
  const n = fp2d.length
  const buttressW = 0.95
  const buttressD = 0.85
  const buttressH = wallHeight * 0.88

  for (let i = 0; i < n; i++) {
    const p1 = fp2d[i]!
    const p2 = fp2d[(i + 1) % n]!
    const dx = p2.x - p1.x
    const dz = p2.y - p1.y
    const len = Math.hypot(dx, dz)
    if (len < 6.5) continue

    const tx = dx / len
    const tz = dz / len
    // Outward unit normal (for CCW polygons)
    const nx = tz
    const nz = -tx

    // Place buttresses every ~6 meters along the edge
    const count = Math.max(1, Math.floor(len / 6.0))
    const step = len / (count + 1)

    for (let k = 1; k <= count; k++) {
      const bx = p1.x + tx * step * k + nx * (buttressD / 2)
      const bz = p1.y + tz * step * k + nz * (buttressD / 2)

      // Main vertical stone shaft
      const bMesh = new THREE.Mesh(new THREE.BoxGeometry(buttressW, buttressH, buttressD), facadeMat)
      bMesh.position.set(bx, buttressH / 2, bz)
      bMesh.rotation.y = -Math.atan2(nz, nx) + Math.PI / 2
      bMesh.castShadow = true
      bMesh.receiveShadow = true
      group.add(bMesh)

      // Sloped stone weathering cap (chapeau de contrefort à 45°)
      const capH = 0.6
      const capMesh = new THREE.Mesh(new THREE.BoxGeometry(buttressW, capH, buttressD * 0.8), facadeMat)
      capMesh.position.set(bx, buttressH + capH / 2, bz)
      capMesh.rotation.y = -Math.atan2(nz, nx) + Math.PI / 2
      capMesh.castShadow = true
      group.add(capMesh)
    }
  }
}

/**
 * Creates a monumental carved stone entrance portal with steps, recessed arch,
 * heavy oak timber doors, and crowned with a stone cross.
 */
function addChurchPortal(
  group: THREE.Group,
  frontX: number,
  frontZ: number,
  alongX: boolean,
  facadeMat: THREE.MeshStandardMaterial,
  doorMat: THREE.MeshStandardMaterial,
  crossMat: THREE.MeshStandardMaterial,
): void {
  const portalW = 4.2
  const portalH = 5.2
  const portalD = 0.95

  // Direction pointing INSIDE the building (never outwards towards streets!)
  const inX = alongX ? 1 : 0
  const inZ = alongX ? 0 : 1

  const posX = frontX + inX * (portalD / 2)
  const posZ = frontZ + inZ * (portalD / 2)

  // 1. Stone steps leading to portal (recessed inside building entrance)
  const stepsMesh = new THREE.Mesh(
    new THREE.BoxGeometry(alongX ? 0.6 : portalW + 0.8, 0.25, alongX ? portalW + 0.8 : 0.6),
    facadeMat,
  )
  stepsMesh.position.set(frontX + inX * 0.25, 0.12, frontZ + inZ * 0.25)
  stepsMesh.castShadow = true
  stepsMesh.receiveShadow = true
  group.add(stepsMesh)

  // 2. Sculpted stone portal frame
  const portalGeo = new THREE.BoxGeometry(alongX ? portalD : portalW, portalH, alongX ? portalW : portalD)
  const portalMesh = new THREE.Mesh(portalGeo, facadeMat)
  portalMesh.position.set(posX, portalH / 2, posZ)
  portalMesh.castShadow = true
  portalMesh.receiveShadow = true
  group.add(portalMesh)

  // 3. Heavy oak double door (recessed inside portal)
  const doorW = portalW * 0.62
  const doorH = portalH * 0.72
  const doorMesh = new THREE.Mesh(
    new THREE.BoxGeometry(alongX ? 0.12 : doorW, doorH, alongX ? doorW : 0.12),
    doorMat,
  )
  doorMesh.position.set(frontX + inX * 0.35, doorH / 2, frontZ + inZ * 0.35)
  doorMesh.castShadow = true
  group.add(doorMesh)

  // 4. Triangular pediment / gablet above portal
  const pedimentH = 1.4
  const pedimentMesh = new THREE.Mesh(
    new THREE.ConeGeometry(portalW * 0.55, pedimentH, 4),
    facadeMat,
  )
  pedimentMesh.position.set(posX, portalH + pedimentH / 2, posZ)
  pedimentMesh.rotation.y = alongX ? 0 : Math.PI / 4
  pedimentMesh.castShadow = true
  group.add(pedimentMesh)

  // Small portal cross on top of pediment
  addCrossFinial(group, posX, posZ, portalH + pedimentH, crossMat, 1.2)
}
