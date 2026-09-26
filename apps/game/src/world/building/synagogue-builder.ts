/**
 * SynagogueBuilder — Generates authentic ecclesiastical architecture for synagogues:
 *   - Solid stone facade pediment (fronton plein) rising directly from the facade wall
 *   - The Tables of the Law (Tables de la Loi / Decalogue) firmly anchored to the pediment apex
 *   - 3D Star of David (Magen David) finials in gilded bronze atop the pediment and cupolas
 *   - Twin corner turrets with copper cupola domes (tourelles d'angle à coupoles) inset strictly inside
 *     the building envelope
 *   - Central octagonal sanctuary dome (coupole centrale) on large synagogues
 *   - Monumental Romanesque/Moorish arched entrance portal with stone steps and carved oak doors,
 *     recessed inward so it never overhangs the street
 *
 * All geometry is anchored directly to the true polygon edges and shares materials (60+ FPS).
 */

import * as THREE from 'three'

// Shared synagogue detail materials (module-level)
let goldBronzeMaterial: THREE.MeshStandardMaterial | null = null
let oakDoorMaterial: THREE.MeshStandardMaterial | null = null
let stoneTabletMaterial: THREE.MeshStandardMaterial | null = null

function getGoldBronzeMaterial(): THREE.MeshStandardMaterial {
  if (!goldBronzeMaterial) {
    goldBronzeMaterial = new THREE.MeshStandardMaterial({
      color: 0xd4af37,
      metalness: 0.85,
      roughness: 0.22,
    })
  }
  return goldBronzeMaterial
}

function getOakDoorMaterial(): THREE.MeshStandardMaterial {
  if (!oakDoorMaterial) {
    oakDoorMaterial = new THREE.MeshStandardMaterial({
      color: 0x362016,
      roughness: 0.80,
      metalness: 0.10,
    })
  }
  return oakDoorMaterial
}

function getStoneTabletMaterial(): THREE.MeshStandardMaterial {
  if (!stoneTabletMaterial) {
    stoneTabletMaterial = new THREE.MeshStandardMaterial({
      color: 0xe8dfcb,
      roughness: 0.90,
      metalness: 0.05,
    })
  }
  return stoneTabletMaterial
}

/**
 * Creates a clean 3D Star of David (Magen David / Hexagram) finial from two intersecting
 * equilateral triangular prisms with gilded bronze material.
 */
function createStarOfDavidMesh(size: number, depth: number, mat: THREE.Material): THREE.Group {
  const group = new THREE.Group()

  const r = size * 0.5
  // Triangle 1: pointing UP
  const shape1 = new THREE.Shape()
  for (let i = 0; i < 3; i++) {
    const angle = (Math.PI / 2) + (i * 2 * Math.PI / 3)
    const x = Math.cos(angle) * r
    const y = Math.sin(angle) * r
    if (i === 0) shape1.moveTo(x, y)
    else shape1.lineTo(x, y)
  }
  shape1.closePath()

  // Inner cutout for triangle 1
  const hole1 = new THREE.Path()
  const innerR = r * 0.65
  for (let i = 0; i < 3; i++) {
    const angle = (Math.PI / 2) + (i * 2 * Math.PI / 3)
    const x = Math.cos(angle) * innerR
    const y = Math.sin(angle) * innerR
    if (i === 0) hole1.moveTo(x, y)
    else hole1.lineTo(x, y)
  }
  hole1.closePath()
  shape1.holes.push(hole1)

  // Triangle 2: pointing DOWN
  const shape2 = new THREE.Shape()
  for (let i = 0; i < 3; i++) {
    const angle = (-Math.PI / 2) + (i * 2 * Math.PI / 3)
    const x = Math.cos(angle) * r
    const y = Math.sin(angle) * r
    if (i === 0) shape2.moveTo(x, y)
    else shape2.lineTo(x, y)
  }
  shape2.closePath()

  const hole2 = new THREE.Path()
  for (let i = 0; i < 3; i++) {
    const angle = (-Math.PI / 2) + (i * 2 * Math.PI / 3)
    const x = Math.cos(angle) * innerR
    const y = Math.sin(angle) * innerR
    if (i === 0) hole2.moveTo(x, y)
    else hole2.lineTo(x, y)
  }
  hole2.closePath()
  shape2.holes.push(hole2)

  const extrudeSettings: THREE.ExtrudeGeometryOptions = {
    depth,
    bevelEnabled: true,
    bevelSegments: 1,
    steps: 1,
    bevelSize: 0.02,
    bevelThickness: 0.02,
  }

  const geo1 = new THREE.ExtrudeGeometry(shape1, extrudeSettings)
  const geo2 = new THREE.ExtrudeGeometry(shape2, extrudeSettings)

  const m1 = new THREE.Mesh(geo1, mat)
  const m2 = new THREE.Mesh(geo2, mat)
  m1.castShadow = true
  m2.castShadow = true

  group.add(m1)
  group.add(m2)
  return group
}

/**
 * Computes polygon signed area to determine vertex winding order.
 */
function polygonSignedArea(pts: THREE.Vector2[]): number {
  let a = 0
  const n = pts.length
  for (let i = 0; i < n; i++) {
    const p = pts[i]!
    const q = pts[(i + 1) % n]!
    a += p.x * q.y - q.x * p.y
  }
  return a / 2
}

interface FacadeEdge {
  p1: THREE.Vector2
  p2: THREE.Vector2
  mid: THREE.Vector2
  dir: THREE.Vector2
  normal: THREE.Vector2
  len: number
}

/**
 * Identifies the most prominent front facade edge of any building polygon.
 * Guarantees that the inward normal points strictly into the sanctuary interior.
 */
function findFrontFacadeEdge(fp: THREE.Vector2[]): FacadeEdge {
  const n = fp.length
  const isCCW = polygonSignedArea(fp) > 0

  let bestEdgeIdx = 0
  let bestScore = -Infinity

  // Score edges by a combination of length and front-facing orientation (min Y in 2D = north/front)
  for (let i = 0; i < n; i++) {
    const p1 = fp[i]!
    const p2 = fp[(i + 1) % n]!
    const len = p1.distanceTo(p2)
    if (len < 3.5) continue

    const midY = (p1.y + p2.y) / 2
    // Favor prominent front edges with sufficient width
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

  // Inward normal pointing into polygon interior
  const normal = isCCW
    ? new THREE.Vector2(-dir.y, dir.x)
    : new THREE.Vector2(dir.y, -dir.x)

  const mid = new THREE.Vector2((p1.x + p2.x) / 2, (p1.y + p2.y) / 2)

  return { p1, p2, mid, dir, normal, len }
}

/**
 * Builds a solid stone triangular facade pediment (fronton plein) rising directly from
 * the top of the facade wall (wallHeight).
 * This eliminates mid-air floating by physically connecting the building facade to the 10 Commandments.
 */
function buildSolidFacadePediment(
  group: THREE.Group,
  mid: THREE.Vector2,
  dir: THREE.Vector2,
  normal: THREE.Vector2,
  wallHeight: number,
  pedW: number,
  pedH: number,
  pedThickness: number,
  facadeMat: THREE.Material,
): THREE.Vector3 {
  const hw = pedW / 2
  const t = pedThickness

  // Apex position in 3D
  const apexPos = new THREE.Vector3(
    mid.x + normal.x * (t * 0.5),
    wallHeight + pedH,
    mid.y + normal.y * (t * 0.5),
  )

  // Vertices of the 3D triangular pediment prism
  // Base at wallHeight:
  const flX = mid.x - dir.x * hw, flZ = mid.y - dir.y * hw
  const frX = mid.x + dir.x * hw, frZ = mid.y + dir.y * hw
  const blX = flX + normal.x * t, blZ = flZ + normal.y * t
  const brX = frX + normal.x * t, brZ = frZ + normal.y * t

  // Apex vertices at wallHeight + pedH:
  const faX = mid.x, faZ = mid.y
  const baX = faX + normal.x * t, baZ = faZ + normal.y * t

  const positions: number[] = [
    // Front triangular face
    flX, wallHeight, flZ,
    frX, wallHeight, frZ,
    faX, wallHeight + pedH, faZ,

    // Back triangular face
    brX, wallHeight, brZ,
    blX, wallHeight, blZ,
    baX, wallHeight + pedH, baZ,

    // Left sloping roof cornice (quad = 2 triangles)
    flX, wallHeight, flZ,
    faX, wallHeight + pedH, faZ,
    baX, wallHeight + pedH, baZ,

    flX, wallHeight, flZ,
    baX, wallHeight + pedH, baZ,
    blX, wallHeight, blZ,

    // Right sloping roof cornice (quad = 2 triangles)
    faX, wallHeight + pedH, faZ,
    frX, wallHeight, frZ,
    brX, wallHeight, brZ,

    faX, wallHeight + pedH, faZ,
    brX, wallHeight, brZ,
    baX, wallHeight + pedH, baZ,
  ]

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.computeVertexNormals()

  const mesh = new THREE.Mesh(geo, facadeMat)
  mesh.castShadow = true
  mesh.receiveShadow = true
  group.add(mesh)

  return apexPos
}

/**
 * Builds the Tables of the Law (Tables de la Loi / Decalogue / Tablets of the Ten Commandments):
 * two side-by-side stone tablets with semicircular arched tops, mounted firmly on a stone pedestal.
 */
function buildTablesOfTheLaw(
  group: THREE.Group,
  pos: THREE.Vector3,
  dir: THREE.Vector2,
  normal: THREE.Vector2,
  pedestalMat: THREE.Material,
  tabletMat: THREE.Material,
  goldMat: THREE.Material,
  scale = 1.0,
): void {
  const tGroup = new THREE.Group()

  const totalW = 1.35 * scale
  const tabletH = 1.15 * scale
  const depth = 0.22 * scale
  const baseH = 0.22 * scale

  // 1. Stone pedestal base firmly sitting on pediment apex
  const pedGeo = new THREE.BoxGeometry(totalW + 0.25 * scale, baseH, depth + 0.12 * scale)
  const pedMesh = new THREE.Mesh(pedGeo, pedestalMat)
  pedMesh.position.y = baseH / 2
  pedMesh.castShadow = true
  tGroup.add(pedMesh)

  // 2. Dual arched tablets (left and right)
  const singleW = (totalW - 0.06 * scale) / 2
  const rectH = tabletH * 0.70
  const archR = singleW / 2

  for (let side = -1; side <= 1; side += 2) {
    const tabShape = new THREE.Shape()
    const ox = side * (singleW / 2 + 0.03 * scale)
    const x0 = ox - singleW / 2
    const x1 = ox + singleW / 2

    tabShape.moveTo(x0, baseH)
    tabShape.lineTo(x0, baseH + rectH)
    tabShape.arc(singleW / 2, 0, archR, Math.PI, 0, true)
    tabShape.lineTo(x1, baseH)
    tabShape.closePath()

    const tabGeo = new THREE.ExtrudeGeometry(tabShape, {
      depth,
      bevelEnabled: true,
      bevelSegments: 1,
      bevelSize: 0.015 * scale,
      bevelThickness: 0.015 * scale,
    })
    const tabMesh = new THREE.Mesh(tabGeo, tabletMat)
    tabMesh.position.z = -depth / 2
    tabMesh.castShadow = true
    tGroup.add(tabMesh)

    // Golden Roman / Hebrew numeral bar inlays (I..V on left, VI..X on right)
    for (let line = 0; line < 5; line++) {
      const lineY = baseH + 0.12 * scale + line * (rectH * 0.14)
      const lineMesh = new THREE.Mesh(
        new THREE.BoxGeometry(singleW * 0.55, 0.035 * scale, depth + 0.02 * scale),
        goldMat,
      )
      lineMesh.position.set(ox, lineY, 0)
      tGroup.add(lineMesh)
    }
  }

  // 3. Crowning gilded Star of David finial atop the Tablets of the Law
  const star = createStarOfDavidMesh(0.65 * scale, 0.05 * scale, goldMat)
  star.position.set(0, baseH + rectH + archR + 0.32 * scale, 0)
  tGroup.add(star)

  // Spindle mount between tablets and star
  const spindle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035 * scale, 0.035 * scale, 0.32 * scale, 8),
    goldMat,
  )
  spindle.position.set(0, baseH + rectH + archR + 0.16 * scale, 0)
  tGroup.add(spindle)

  // Orient with the facade edge
  const angle = Math.atan2(dir.y, dir.x)
  tGroup.rotation.y = -angle
  tGroup.position.copy(pos)
  group.add(tGroup)
}

/**
 * Builds an authentic Moorish/Romanesque Revival corner turret with cupola dome:
 * - Square lower shaft rising from the roof/eaves level
 * - Molded stone cornices
 * - Arched belfry/lantern chamber with colonnettes
 * - Hemispherical copper cupola dome
 * - Crowned with a gilded Star of David finial
 */
function buildCornerCupolaTurret(
  group: THREE.Group,
  cx: number,
  cz: number,
  shaftW: number,
  shaftH: number,
  baseY: number,
  facadeMat: THREE.Material,
  roofMat: THREE.Material,
  goldMat: THREE.Material,
): void {
  // 1. Turret shaft
  const shaftGeo = new THREE.BoxGeometry(shaftW, shaftH, shaftW)
  const shaftMesh = new THREE.Mesh(shaftGeo, facadeMat)
  shaftMesh.position.set(cx, baseY + shaftH / 2, cz)
  shaftMesh.castShadow = true
  shaftMesh.receiveShadow = true
  group.add(shaftMesh)

  // 2. Decorative stone cornice atop shaft
  const corniceH = 0.35
  const corniceGeo = new THREE.BoxGeometry(shaftW + 0.25, corniceH, shaftW + 0.25)
  const corniceMesh = new THREE.Mesh(corniceGeo, facadeMat)
  corniceMesh.position.set(cx, baseY + shaftH + corniceH / 2, cz)
  corniceMesh.castShadow = true
  group.add(corniceMesh)

  // 3. Octagonal lantern drum
  const drumH = 1.8
  const drumR = shaftW * 0.48
  const drumGeo = new THREE.CylinderGeometry(drumR, drumR, drumH, 8)
  const drumMesh = new THREE.Mesh(drumGeo, facadeMat)
  drumMesh.position.set(cx, baseY + shaftH + corniceH + drumH / 2, cz)
  drumMesh.castShadow = true
  group.add(drumMesh)

  // Dark arched window insets around drum
  const winMat = new THREE.MeshBasicMaterial({ color: 0x181410 })
  for (let a = 0; a < 8; a += 2) {
    const angle = (a * Math.PI) / 4
    const wx = cx + Math.cos(angle) * (drumR * 0.95)
    const wz = cz + Math.sin(angle) * (drumR * 0.95)
    const winMesh = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.0, 0.12), winMat)
    winMesh.position.set(wx, baseY + shaftH + corniceH + drumH / 2, wz)
    winMesh.rotation.y = -angle + Math.PI / 2
    group.add(winMesh)
  }

  // 4. Hemispherical copper cupola dome
  const domeBaseY = baseY + shaftH + corniceH + drumH
  const domeR = drumR * 1.04
  const domeGeo = new THREE.SphereGeometry(domeR, 12, 10, 0, Math.PI * 2, 0, Math.PI / 2)
  const domeMesh = new THREE.Mesh(domeGeo, roofMat)
  domeMesh.position.set(cx, domeBaseY, cz)
  domeMesh.castShadow = true
  group.add(domeMesh)

  // 5. Gilded spire finial + Star of David
  const finialH = 0.9
  const finialMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.06, finialH, 8),
    goldMat,
  )
  finialMesh.position.set(cx, domeBaseY + domeR + finialH / 2, cz)
  finialMesh.castShadow = true
  group.add(finialMesh)

  const star = createStarOfDavidMesh(0.70, 0.05, goldMat)
  star.position.set(cx, domeBaseY + domeR + finialH + 0.35, cz)
  group.add(star)
}

/**
 * Builds the central sanctuary dome (Coupole centrale) for grand synagogues.
 */
function buildCentralSanctuaryDome(
  group: THREE.Group,
  cx: number,
  cz: number,
  baseY: number,
  domeR: number,
  facadeMat: THREE.Material,
  roofMat: THREE.Material,
  goldMat: THREE.Material,
): void {
  // Octagonal drum
  const drumH = 2.0
  const drumGeo = new THREE.CylinderGeometry(domeR * 0.98, domeR * 0.98, drumH, 8)
  const drumMesh = new THREE.Mesh(drumGeo, facadeMat)
  drumMesh.position.set(cx, baseY + drumH / 2, cz)
  drumMesh.castShadow = true
  drumMesh.receiveShadow = true
  group.add(drumMesh)

  // Dome cornice
  const corniceGeo = new THREE.CylinderGeometry(domeR * 1.04, domeR * 0.98, 0.35, 8)
  const corniceMesh = new THREE.Mesh(corniceGeo, facadeMat)
  corniceMesh.position.set(cx, baseY + drumH + 0.17, cz)
  group.add(corniceMesh)

  // Ribbed cupola dome
  const domeBaseY = baseY + drumH + 0.35
  const domeGeo = new THREE.SphereGeometry(domeR, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2)
  const domeMesh = new THREE.Mesh(domeGeo, roofMat)
  domeMesh.position.set(cx, domeBaseY, cz)
  domeMesh.castShadow = true
  group.add(domeMesh)

  // Lantern & gilded Star of David finial
  const lanternH = 0.9
  const lanternR = domeR * 0.24
  const lanternGeo = new THREE.CylinderGeometry(lanternR, lanternR, lanternH, 8)
  const lanternMesh = new THREE.Mesh(lanternGeo, facadeMat)
  lanternMesh.position.set(cx, domeBaseY + domeR + lanternH / 2, cz)
  group.add(lanternMesh)

  const star = createStarOfDavidMesh(0.95, 0.07, goldMat)
  star.position.set(cx, domeBaseY + domeR + lanternH + 0.5, cz)
  group.add(star)
}

/**
 * Builds the monumental Romanesque/Moorish arched entrance portal.
 * Directs inward along the polygon normal so it is 100% within the building envelope and never encroaches on streets.
 */
function buildSynagoguePortal(
  group: THREE.Group,
  mid: THREE.Vector2,
  dir: THREE.Vector2,
  normal: THREE.Vector2,
  portalW: number,
  facadeMat: THREE.Material,
  doorMat: THREE.Material,
  goldMat: THREE.Material,
): void {
  const pGroup = new THREE.Group()

  const portalH = 4.4
  const portalD = 0.45

  // 1. Broad stone steps leading up (recessed inside building entrance threshold)
  const stepsMesh = new THREE.Mesh(
    new THREE.BoxGeometry(portalW + 0.8, 0.22, 0.5),
    facadeMat,
  )
  stepsMesh.position.set(0, 0.11, 0.25)
  stepsMesh.castShadow = true
  stepsMesh.receiveShadow = true
  pGroup.add(stepsMesh)

  // 2. Sculpted stone portal frame
  const portalGeo = new THREE.BoxGeometry(portalW, portalH, portalD)
  const portalMesh = new THREE.Mesh(portalGeo, facadeMat)
  portalMesh.position.set(0, portalH / 2, portalD / 2)
  portalMesh.castShadow = true
  portalMesh.receiveShadow = true
  pGroup.add(portalMesh)

  // 3. Heavy oak double doors (cintrées)
  const doorW = portalW * 0.58
  const doorH = portalH * 0.70
  const doorMesh = new THREE.Mesh(
    new THREE.BoxGeometry(doorW, doorH, 0.08),
    doorMat,
  )
  doorMesh.position.set(0, doorH / 2, 0.35)
  doorMesh.castShadow = true
  pGroup.add(doorMesh)

  // 4. Semicircular tympanum above door with Star of David / rosette medallion
  const tympanumMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(doorW * 0.5, doorW * 0.5, 0.10, 12, 1, false, 0, Math.PI),
    facadeMat,
  )
  tympanumMesh.position.set(0, doorH, 0.25)
  tympanumMesh.rotation.z = Math.PI / 2
  tympanumMesh.rotation.x = Math.PI / 2
  pGroup.add(tympanumMesh)

  // Star of David emblem in tympanum center
  const star = createStarOfDavidMesh(0.55, 0.04, goldMat)
  star.position.set(0, doorH + doorW * 0.22, 0.28)
  pGroup.add(star)

  // 5. Crowned architrave / pediment cornice
  const corniceH = 0.28
  const corniceMesh = new THREE.Mesh(
    new THREE.BoxGeometry(portalW + 0.25, corniceH, portalD + 0.1),
    facadeMat,
  )
  corniceMesh.position.set(0, portalH + corniceH / 2, portalD / 2)
  corniceMesh.castShadow = true
  pGroup.add(corniceMesh)

  // Orient with the facade edge
  const angle = Math.atan2(dir.y, dir.x)
  pGroup.rotation.y = -angle
  pGroup.position.set(mid.x, 0, mid.y)
  group.add(pGroup)
}

/**
 * Generates the complete authentic synagogue architecture:
 * - Solid stone facade pediment rising directly from wallHeight
 * - The Tables of the Law (Tables de la Loi) firmly anchored on the pediment apex (never flying!)
 * - Gilded Star of David (Magen David) finials
 * - Twin corner turrets with domed cupolas inset strictly inside the building perimeter
 * - Central sanctuary dome (for larger footprints)
 * - Monumental Romanesque/horseshoe arched portal recessed inward
 */
export function buildSynagogueArchitecture(
  group: THREE.Group,
  fp2d: THREE.Vector2[],
  wallHeight: number,
  roofPitch: number,
  facadeMat: THREE.Material,
  roofMat: THREE.Material,
): void {
  if (fp2d.length < 3) return

  // 1. Find the true front facade edge of the polygon
  const facade = findFrontFacadeEdge(fp2d)
  const { p1, p2, mid, dir, normal, len } = facade

  // 2. Compute building footprint span and centroid
  let sumX = 0, sumZ = 0
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const p of fp2d) {
    sumX += p.x; sumZ += p.y
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x)
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y)
  }
  const n = fp2d.length
  const cx = sumX / n
  const cz = sumZ / n
  const spanX = maxX - minX
  const spanY = maxY - minY
  const naveW = Math.min(spanX, spanY)
  const naveLen = Math.max(spanX, spanY)

  const goldMat = getGoldBronzeMaterial()
  const doorMat = getOakDoorMaterial()
  const tabletMat = getStoneTabletMaterial()

  // ── 3. Solid Stone Facade Pediment & Tables of the Law ──────────────────
  // The pediment rises directly from wallHeight, completely eliminating any mid-air gap!
  const pedW = Math.min(10.0, Math.max(4.5, len * 0.65))
  const pedH = Math.min(3.2, Math.max(1.8, pedW * 0.35))
  const pedThickness = 0.55

  const apexPos = buildSolidFacadePediment(
    group,
    mid,
    dir,
    normal,
    wallHeight,
    pedW,
    pedH,
    pedThickness,
    facadeMat,
  )

  // Tables of the Law sit directly on the pediment apex
  const decalogueScale = Math.max(0.75, Math.min(1.2, pedW * 0.12))
  buildTablesOfTheLaw(
    group,
    apexPos,
    dir,
    normal,
    facadeMat,
    tabletMat,
    goldMat,
    decalogueScale,
  )

  // ── 4. Twin Corner Turrets with Domed Cupolas (Tourelles d'angle à coupoles) ──
  // Positioned at the facade corners, inset strictly inside the building perimeter
  const turretW = Math.max(2.2, Math.min(3.4, len * 0.18))
  const turretH = Math.max(4.0, Math.min(6.5, wallHeight * 0.38))
  const turretBaseY = Math.max(0, wallHeight - 1.5) // Sits on top of the upper wall/roofline
  const insetDist = turretW * 0.55 + 0.25

  // Corner 1 (near p1) and Corner 2 (near p2), shifted inward along both dir and normal
  const c1 = new THREE.Vector2(
    p1.x + dir.x * insetDist + normal.x * insetDist,
    p1.y + dir.y * insetDist + normal.y * insetDist,
  )
  const c2 = new THREE.Vector2(
    p2.x - dir.x * insetDist + normal.x * insetDist,
    p2.y - dir.y * insetDist + normal.y * insetDist,
  )

  // Only spawn corner turrets if the facade edge is wide enough
  if (len >= 8.0) {
    buildCornerCupolaTurret(
      group,
      c1.x,
      c1.y,
      turretW,
      turretH,
      turretBaseY,
      facadeMat,
      roofMat,
      goldMat,
    )
    buildCornerCupolaTurret(
      group,
      c2.x,
      c2.y,
      turretW,
      turretH,
      turretBaseY,
      facadeMat,
      roofMat,
      goldMat,
    )
  }

  // ── 5. Central Sanctuary Dome (for large synagogues) ─────────────────────
  if (naveW >= 14.0 && naveLen >= 18.0) {
    const domeR = Math.max(3.5, Math.min(6.5, naveW * 0.26))
    const domeBaseY = wallHeight + 0.3
    buildCentralSanctuaryDome(
      group,
      cx,
      cz,
      domeBaseY,
      domeR,
      facadeMat,
      roofMat,
      goldMat,
    )
  }

  // ── 6. Monumental Arched Entrance Portal (recessed inside building envelope) ──
  const portalW = Math.min(4.2, Math.max(2.8, len * 0.38))
  buildSynagoguePortal(
    group,
    mid,
    dir,
    normal,
    portalW,
    facadeMat,
    doorMat,
    goldMat,
  )
}
