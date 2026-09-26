/**
 * TownhallBuilder — Generates majestic, authentic Hôtel de Ville / Mairie architecture:
 *   1. Central Civic Campanile & Clock Belfry (Le Beffroi de l'Hôtel de Ville):
 *      - Stately ashlar stone clock tower rising above the roofline
 *      - L'Horloge Municipale: illuminated clock dials with Roman numerals, golden bezel & black hands
 *      - Open arched bell chamber (Chambre des Cloches) with 3D bronze municipal bell
 *      - Zinc/copper cupola dome crowned with a gilded finial pinnacle
 *
 *   2. Peristyle & Escalier d'Honneur (Le Grand Portail & Fronton Municipal):
 *      - Monumental cascading stone entrance stairs flanking the parvis
 *      - Fluted classical columns supporting a carved stone entablature
 *      - Classical triangular pediment with official relief inscription "HÔTEL DE VILLE"
 *      - Heavy sculpted double oak doors with bronze studs & lion-head knockers
 *
 *   3. Balcon d'Honneur (Mayoral Balcony on Piano Nobile):
 *      - 1st-floor ceremonial balcony supported by sculpted stone consoles/corbels
 *      - Wrought-iron railing with classic scrolls and golden municipal rosette
 *
 *   4. Parvis & Municipal Civic Elements:
 *      - Official glazed municipal notice board vitrine ("AFFICHAGE LÉGAL - ARRÊTÉS MUNICIPAUX")
 *      - Classical cast-iron municipal street lamps with glowing warm lanterns
 *
 * NOTE: Strictly NO flags or flagpoles as requested.
 * All geometry uses module-level cached materials to preserve 60+ FPS.
 */

import * as THREE from 'three'

// ─── Module-Level Shared Detail Materials ───────────────────────────────────

let stoneFacadeMat: THREE.MeshStandardMaterial | null = null
let stoneDarkTrimMat: THREE.MeshStandardMaterial | null = null
let stoneStairsMat: THREE.MeshStandardMaterial | null = null
let roofZincCopperMat: THREE.MeshStandardMaterial | null = null
let goldFinialMat: THREE.MeshStandardMaterial | null = null
let bronzeBellMat: THREE.MeshStandardMaterial | null = null
let woodBeamMat: THREE.MeshStandardMaterial | null = null
let wroughtIronMat: THREE.MeshStandardMaterial | null = null
let doorOakMat: THREE.MeshStandardMaterial | null = null
let clockRimMat: THREE.MeshStandardMaterial | null = null
let clockDialMat: THREE.MeshStandardMaterial | null = null
let lampPostMat: THREE.MeshStandardMaterial | null = null
let lampGlowMat: THREE.MeshStandardMaterial | null = null
let noticeBoardFrameMat: THREE.MeshStandardMaterial | null = null
let noticeBoardGlassMat: THREE.MeshStandardMaterial | null = null

const pedimentMatCache = new Map<string, THREE.MeshStandardMaterial>()

function getStoneFacadeMaterial(): THREE.MeshStandardMaterial {
  if (!stoneFacadeMat) {
    stoneFacadeMat = new THREE.MeshStandardMaterial({
      color: 0xdcd4be, // Noble French limestone ashlar
      roughness: 0.68,
      metalness: 0.05,
    })
  }
  return stoneFacadeMat
}

function getStoneDarkTrimMaterial(): THREE.MeshStandardMaterial {
  if (!stoneDarkTrimMat) {
    stoneDarkTrimMat = new THREE.MeshStandardMaterial({
      color: 0xb4a488, // Carved moulding limestone
      roughness: 0.62,
      metalness: 0.05,
    })
  }
  return stoneDarkTrimMat
}

function getStoneStairsMaterial(): THREE.MeshStandardMaterial {
  if (!stoneStairsMat) {
    stoneStairsMat = new THREE.MeshStandardMaterial({
      color: 0xc8bea8,
      roughness: 0.75,
      metalness: 0.05,
    })
  }
  return stoneStairsMat
}

function getRoofZincCopperMaterial(): THREE.MeshStandardMaterial {
  if (!roofZincCopperMat) {
    roofZincCopperMat = new THREE.MeshStandardMaterial({
      color: 0x3e4a56, // French slate / zinc patina
      roughness: 0.42,
      metalness: 0.35,
    })
  }
  return roofZincCopperMat
}

function getGoldFinialMaterial(): THREE.MeshStandardMaterial {
  if (!goldFinialMat) {
    goldFinialMat = new THREE.MeshStandardMaterial({
      color: 0xd4af37, // Polished gold leaf
      emissive: 0x5a4810,
      emissiveIntensity: 0.35,
      roughness: 0.25,
      metalness: 0.85,
    })
  }
  return goldFinialMat
}

function getBronzeBellMaterial(): THREE.MeshStandardMaterial {
  if (!bronzeBellMat) {
    bronzeBellMat = new THREE.MeshStandardMaterial({
      color: 0x9e6c38, // Cast bronze bell
      roughness: 0.38,
      metalness: 0.75,
    })
  }
  return bronzeBellMat
}

function getWoodBeamMaterial(): THREE.MeshStandardMaterial {
  if (!woodBeamMat) {
    woodBeamMat = new THREE.MeshStandardMaterial({
      color: 0x2e1e14, // Weathered oak beam
      roughness: 0.85,
      metalness: 0.0,
    })
  }
  return woodBeamMat
}

function getWroughtIronMaterial(): THREE.MeshStandardMaterial {
  if (!wroughtIronMat) {
    wroughtIronMat = new THREE.MeshStandardMaterial({
      color: 0x1c1e22, // Black cast & wrought iron
      roughness: 0.48,
      metalness: 0.65,
    })
  }
  return wroughtIronMat
}

function getDoorOakMaterial(): THREE.MeshStandardMaterial {
  if (!doorOakMat) {
    doorOakMat = new THREE.MeshStandardMaterial({
      color: 0x261910, // Dark carved oak
      roughness: 0.65,
      metalness: 0.1,
    })
  }
  return doorOakMat
}

function getClockRimMaterial(): THREE.MeshStandardMaterial {
  if (!clockRimMat) {
    clockRimMat = new THREE.MeshStandardMaterial({
      color: 0xb8860b, // Dark gold clock bezel
      roughness: 0.3,
      metalness: 0.8,
    })
  }
  return clockRimMat
}

function getClockDialMaterial(): THREE.MeshStandardMaterial {
  if (!clockDialMat) {
    const canvas = document.createElement('canvas')
    canvas.width = 256
    canvas.height = 256
    const ctx = canvas.getContext('2d')
    if (ctx) {
      // Dial face (enamel white with warm golden republican tint)
      ctx.fillStyle = '#faf8f2'
      ctx.beginPath()
      ctx.arc(128, 128, 120, 0, Math.PI * 2)
      ctx.fill()

      // Outer bezel line
      ctx.strokeStyle = '#c5a059'
      ctx.lineWidth = 6
      ctx.stroke()

      ctx.strokeStyle = '#242018'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(128, 128, 114, 0, Math.PI * 2)
      ctx.stroke()

      // Roman Numerals / Hour Markers
      ctx.fillStyle = '#1c1812'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.font = 'bold 22px Georgia, serif'
      const numerals = ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI']
      for (let i = 0; i < 12; i++) {
        const a = (i * Math.PI) / 6 - Math.PI / 2
        const r = 94
        const x = 128 + Math.cos(a) * r
        const y = 128 + Math.sin(a) * r
        ctx.fillText(numerals[i]!, x, y)
      }

      // Minute ticks
      ctx.strokeStyle = '#383024'
      ctx.lineWidth = 1.5
      for (let i = 0; i < 60; i++) {
        if (i % 5 === 0) continue
        const a = (i * Math.PI) / 30
        const r1 = 110
        const r2 = 114
        ctx.beginPath()
        ctx.moveTo(128 + Math.cos(a) * r1, 128 + Math.sin(a) * r1)
        ctx.lineTo(128 + Math.cos(a) * r2, 128 + Math.sin(a) * r2)
        ctx.stroke()
      }

      // Hands pointing to 10:10 (traditional horological display)
      // Hour hand towards 10 o'clock (~300 deg)
      const hAngle = ((10 + 10 / 60) * Math.PI) / 6 - Math.PI / 2
      ctx.strokeStyle = '#18140e'
      ctx.lineWidth = 6
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(128, 128)
      ctx.lineTo(128 + Math.cos(hAngle) * 58, 128 + Math.sin(hAngle) * 58)
      ctx.stroke()

      // Minute hand towards 2 o'clock (~60 deg)
      const mAngle = (10 * Math.PI) / 30 - Math.PI / 2
      ctx.strokeStyle = '#18140e'
      ctx.lineWidth = 4
      ctx.beginPath()
      ctx.moveTo(128, 128)
      ctx.lineTo(128 + Math.cos(mAngle) * 82, 128 + Math.sin(mAngle) * 82)
      ctx.stroke()

      // Center boss
      ctx.fillStyle = '#b8860b'
      ctx.beginPath()
      ctx.arc(128, 128, 7, 0, Math.PI * 2)
      ctx.fill()
    }

    const tex = new THREE.CanvasTexture(canvas)
    clockDialMat = new THREE.MeshStandardMaterial({
      map: tex,
      emissive: 0xfff0cc,
      emissiveMap: tex,
      emissiveIntensity: 0.25,
      roughness: 0.3,
      metalness: 0.1,
    })
  }
  return clockDialMat
}

function getPedimentMaterial(title: string): THREE.MeshStandardMaterial {
  const cached = pedimentMatCache.get(title)
  if (cached) return cached

  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 128
  const ctx = canvas.getContext('2d')
  if (ctx) {
    // Carved limestone tympanum background
    ctx.fillStyle = '#dcd4be'
    ctx.fillRect(0, 0, 512, 128)

    // Moulded inner bevel
    ctx.strokeStyle = '#b4a488'
    ctx.lineWidth = 6
    ctx.strokeRect(6, 6, 500, 116)
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 2
    ctx.strokeRect(10, 10, 492, 108)

    // Relief carved inscription in gold leaf / dark stone
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = 'bold 36px "Cinzel", "Times New Roman", Georgia, serif'

    // Carved shadow
    ctx.fillStyle = 'rgba(40, 30, 20, 0.45)'
    ctx.fillText(title, 258, 67)

    // Gold leaf main lettering
    ctx.fillStyle = '#4a3a22'
    ctx.fillText(title, 256, 64)

    // Subtle laurel sprigs / republican rosettes flanking text
    ctx.fillStyle = '#b8860b'
    ctx.beginPath()
    ctx.arc(42, 64, 8, 0, Math.PI * 2)
    ctx.arc(470, 64, 8, 0, Math.PI * 2)
    ctx.fill()
  }

  const tex = new THREE.CanvasTexture(canvas)
  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    roughness: 0.65,
    metalness: 0.15,
  })
  pedimentMatCache.set(title, mat)
  return mat
}

function getNoticeBoardFrameMaterial(): THREE.MeshStandardMaterial {
  if (!noticeBoardFrameMat) {
    noticeBoardFrameMat = new THREE.MeshStandardMaterial({
      color: 0x2b343d, // Dark civic bronze / cast steel
      roughness: 0.4,
      metalness: 0.6,
    })
  }
  return noticeBoardFrameMat
}

function getNoticeBoardGlassMaterial(): THREE.MeshStandardMaterial {
  if (!noticeBoardGlassMat) {
    const canvas = document.createElement('canvas')
    canvas.width = 256
    canvas.height = 192
    const ctx = canvas.getContext('2d')
    if (ctx) {
      // Board interior background
      ctx.fillStyle = '#485460'
      ctx.fillRect(0, 0, 256, 192)

      // Official header
      ctx.fillStyle = '#1c2630'
      ctx.fillRect(8, 8, 240, 24)
      ctx.fillStyle = '#ffffff'
      ctx.font = 'bold 11px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('AFFICHAGE LÉGAL - RÉPUBLIQUE FRANÇAISE', 128, 24)

      // Sheet 1: Arrêté Municipal
      ctx.fillStyle = '#fbfaf6'
      ctx.fillRect(16, 40, 68, 90)
      ctx.fillStyle = '#0a2240'
      ctx.fillRect(20, 44, 60, 6)
      ctx.fillStyle = '#888888'
      for (let y = 56; y < 124; y += 6) {
        ctx.fillRect(20, y, 60, 2)
      }

      // Sheet 2: Délibérations du Conseil Municipal
      ctx.fillStyle = '#fbfaf6'
      ctx.fillRect(94, 40, 68, 90)
      ctx.fillStyle = '#8a1824'
      ctx.fillRect(98, 44, 60, 6)
      ctx.fillStyle = '#888888'
      for (let y = 56; y < 124; y += 6) {
        ctx.fillRect(98, y, 60, 2)
      }

      // Sheet 3: Avis d'Urbanisme & Mariages
      ctx.fillStyle = '#fbfaf6'
      ctx.fillRect(172, 40, 68, 90)
      ctx.fillStyle = '#185a34'
      ctx.fillRect(176, 44, 60, 6)
      ctx.fillStyle = '#888888'
      for (let y = 56; y < 124; y += 6) {
        ctx.fillRect(176, y, 60, 2)
      }

      // Glass reflections
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(12, 180)
      ctx.lineTo(240, 12)
      ctx.stroke()
    }

    const tex = new THREE.CanvasTexture(canvas)
    noticeBoardGlassMat = new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.2,
      metalness: 0.1,
    })
  }
  return noticeBoardGlassMat
}

function getLampPostMaterial(): THREE.MeshStandardMaterial {
  if (!lampPostMat) {
    lampPostMat = new THREE.MeshStandardMaterial({
      color: 0x1c2024, // Parisian dark green/black cast iron
      roughness: 0.45,
      metalness: 0.7,
    })
  }
  return lampPostMat
}

function getLampGlowMaterial(): THREE.MeshStandardMaterial {
  if (!lampGlowMat) {
    lampGlowMat = new THREE.MeshStandardMaterial({
      color: 0xfff6dc,
      emissive: 0xffdf88,
      emissiveIntensity: 2.2,
      roughness: 0.2,
      metalness: 0.1,
    })
  }
  return lampGlowMat
}

// ─── Geometry Builders ──────────────────────────────────────────────────────

interface FacadeEdge {
  p1: THREE.Vector2
  p2: THREE.Vector2
  mid: THREE.Vector2
  dir: THREE.Vector2
  normal: THREE.Vector2
  len: number
}

function findFrontFacadeEdge(fp2d: THREE.Vector2[]): FacadeEdge {
  let bestLen = 0
  let bestIdx = 0

  for (let i = 0; i < fp2d.length; i++) {
    const next = (i + 1) % fp2d.length
    const len = fp2d[i]!.distanceTo(fp2d[next]!)
    if (len > bestLen) {
      bestLen = len
      bestIdx = i
    }
  }

  const p1 = fp2d[bestIdx]!
  const p2 = fp2d[(bestIdx + 1) % fp2d.length]!
  const mid = new THREE.Vector2((p1.x + p2.x) * 0.5, (p1.y + p2.y) * 0.5)
  const dir = new THREE.Vector2(p2.x - p1.x, p2.y - p1.y).normalize()
  // Outward normal in 2D (clockwise from edge dir)
  const normal = new THREE.Vector2(dir.y, -dir.x)

  return { p1, p2, mid, dir, normal, len: bestLen }
}

/**
 * Builds the Central Civic Campanile & Clock Belfry (Le Beffroi de l'Hôtel de Ville).
 */
function buildCivicBelfry(
  group: THREE.Group,
  center: THREE.Vector2,
  baseH: number,
  belfryWidth = 4.2,
): void {
  const belfryGroup = new THREE.Group()

  const stoneMat = getStoneFacadeMaterial()
  const trimMat = getStoneDarkTrimMaterial()
  const roofMat = getRoofZincCopperMaterial()
  const goldMat = getGoldFinialMaterial()
  const bellMat = getBronzeBellMaterial()
  const woodMat = getWoodBeamMaterial()
  const clockMat = getClockDialMaterial()
  const clockRim = getClockRimMaterial()

  const halfW = belfryWidth * 0.5
  let curY = 0

  // 1. Lower Stone Podium / Base Tier
  const podiumH = 2.4
  const podiumGeo = new THREE.BoxGeometry(belfryWidth, podiumH, belfryWidth)
  const podiumMesh = new THREE.Mesh(podiumGeo, stoneMat)
  podiumMesh.position.y = curY + podiumH * 0.5
  belfryGroup.add(podiumMesh)

  // Moulded Cornice above podium
  const cornGeo = new THREE.BoxGeometry(belfryWidth + 0.35, 0.25, belfryWidth + 0.35)
  const cornMesh = new THREE.Mesh(cornGeo, trimMat)
  cornMesh.position.y = curY + podiumH + 0.125
  belfryGroup.add(cornMesh)
  curY += podiumH + 0.25

  // 2. Clock Tier (Square Tower with Circular Dials on 4 faces)
  const clockTierW = belfryWidth * 0.92
  const clockTierH = 2.8
  const clockTierGeo = new THREE.BoxGeometry(clockTierW, clockTierH, clockTierW)
  const clockTierMesh = new THREE.Mesh(clockTierGeo, stoneMat)
  clockTierMesh.position.y = curY + clockTierH * 0.5
  belfryGroup.add(clockTierMesh)

  // Corner pilasters on clock tier
  const pilGeo = new THREE.BoxGeometry(0.35, clockTierH, 0.35)
  const pilOffsets = [-1, 1]
  for (const ox of pilOffsets) {
    for (const oz of pilOffsets) {
      const pil = new THREE.Mesh(pilGeo, trimMat)
      pil.position.set(ox * (clockTierW * 0.5 - 0.15), curY + clockTierH * 0.5, oz * (clockTierW * 0.5 - 0.15))
      belfryGroup.add(pil)
    }
  }

  // 4 Illuminated Clock Dials (L'Horloge de la République)
  const dialRadius = Math.min(1.05, clockTierW * 0.36)
  const dialGeo = new THREE.CircleGeometry(dialRadius, 24)
  const rimGeo = new THREE.TorusGeometry(dialRadius, 0.08, 8, 24)

  const faces = [
    { pos: [0, curY + clockTierH * 0.5, clockTierW * 0.5 + 0.02], rot: [0, 0, 0] },
    { pos: [0, curY + clockTierH * 0.5, -clockTierW * 0.5 - 0.02], rot: [0, Math.PI, 0] },
    { pos: [clockTierW * 0.5 + 0.02, curY + clockTierH * 0.5, 0], rot: [0, Math.PI / 2, 0] },
    { pos: [-clockTierW * 0.5 - 0.02, curY + clockTierH * 0.5, 0], rot: [0, -Math.PI / 2, 0] },
  ]
  for (const f of faces) {
    const dialMesh = new THREE.Mesh(dialGeo, clockMat)
    dialMesh.position.set(f.pos[0]!, f.pos[1]!, f.pos[2]!)
    dialMesh.rotation.set(f.rot[0]!, f.rot[1]!, f.rot[2]!)
    belfryGroup.add(dialMesh)

    const rimMesh = new THREE.Mesh(rimGeo, clockRim)
    rimMesh.position.set(f.pos[0]!, f.pos[1]!, f.pos[2]!)
    rimMesh.rotation.set(f.rot[0]!, f.rot[1]!, f.rot[2]!)
    belfryGroup.add(rimMesh)
  }

  // Intermediate cornice above clock
  const midCornGeo = new THREE.BoxGeometry(clockTierW + 0.4, 0.28, clockTierW + 0.4)
  const midCornMesh = new THREE.Mesh(midCornGeo, trimMat)
  midCornMesh.position.y = curY + clockTierH + 0.14
  belfryGroup.add(midCornMesh)
  curY += clockTierH + 0.28

  // 3. Open Arched Belfry (Chambre des Cloches)
  const belfryH = 3.2
  const belfryW = clockTierW * 0.86
  const pierW = 0.36

  // 4 Corner piers
  const pierGeo = new THREE.BoxGeometry(pierW, belfryH, pierW)
  for (const ox of pilOffsets) {
    for (const oz of pilOffsets) {
      const pier = new THREE.Mesh(pierGeo, stoneMat)
      pier.position.set(ox * (belfryW * 0.5 - pierW * 0.5), curY + belfryH * 0.5, oz * (belfryW * 0.5 - pierW * 0.5))
      belfryGroup.add(pier)
    }
  }

  // Arched lintels between piers
  const archBeamGeoX = new THREE.BoxGeometry(belfryW, 0.35, pierW)
  const archBeamGeoZ = new THREE.BoxGeometry(pierW, 0.35, belfryW)
  for (const sign of [-1, 1]) {
    const bx = new THREE.Mesh(archBeamGeoX, trimMat)
    bx.position.set(0, curY + belfryH - 0.18, sign * (belfryW * 0.5 - pierW * 0.5))
    belfryGroup.add(bx)

    const bz = new THREE.Mesh(archBeamGeoZ, trimMat)
    bz.position.set(sign * (belfryW * 0.5 - pierW * 0.5), curY + belfryH - 0.18, 0)
    belfryGroup.add(bz)
  }

  // Heavy oak belfry crossbeam (mouton de cloche)
  const beamGeo = new THREE.BoxGeometry(belfryW * 0.88, 0.24, 0.24)
  const beamMesh = new THREE.Mesh(beamGeo, woodMat)
  beamMesh.position.set(0, curY + belfryH * 0.76, 0)
  belfryGroup.add(beamMesh)

  // 3D Bronze Bell (Cloche Municipale) hanging inside belfry
  const bellGroup = new THREE.Group()
  const bellLipGeo = new THREE.CylinderGeometry(0.38, 0.48, 0.22, 16)
  const bellWaistGeo = new THREE.CylinderGeometry(0.24, 0.38, 0.38, 16)
  const bellHeadGeo = new THREE.CylinderGeometry(0.18, 0.24, 0.18, 16)
  const bellCrownGeo = new THREE.TorusGeometry(0.09, 0.03, 8, 16)

  const lip = new THREE.Mesh(bellLipGeo, bellMat)
  lip.position.y = -0.42
  const waist = new THREE.Mesh(bellWaistGeo, bellMat)
  waist.position.y = -0.16
  const head = new THREE.Mesh(bellHeadGeo, bellMat)
  head.position.y = 0.08
  const crown = new THREE.Mesh(bellCrownGeo, bellMat)
  crown.position.y = 0.22
  crown.rotation.x = Math.PI / 2

  bellGroup.add(lip, waist, head, crown)
  bellGroup.position.set(0, curY + belfryH * 0.62, 0)
  belfryGroup.add(bellGroup)

  // Top entablature of belfry
  const topEntGeo = new THREE.BoxGeometry(belfryW + 0.45, 0.35, belfryW + 0.45)
  const topEntMesh = new THREE.Mesh(topEntGeo, trimMat)
  topEntMesh.position.y = curY + belfryH + 0.175
  belfryGroup.add(topEntMesh)
  curY += belfryH + 0.35

  // 4. Zinc / Copper Cupola Dome & Spire Finial (Dôme à l'impériale)
  const domeRadius = belfryW * 0.65
  const domeH = 2.4
  const cupolaGeo = new THREE.ConeGeometry(domeRadius, domeH, 16)
  const cupolaMesh = new THREE.Mesh(cupolaGeo, roofMat)
  cupolaMesh.position.y = curY + domeH * 0.5
  belfryGroup.add(cupolaMesh)
  curY += domeH

  // Gilded Finial Pinnacle at the summit (STRICTLY NO FLAG)
  const finialBaseGeo = new THREE.SphereGeometry(0.24, 16, 16)
  const finialBase = new THREE.Mesh(finialBaseGeo, goldMat)
  finialBase.position.y = curY + 0.18
  belfryGroup.add(finialBase)

  const needleGeo = new THREE.CylinderGeometry(0.03, 0.08, 1.4, 8)
  const needle = new THREE.Mesh(needleGeo, goldMat)
  needle.position.y = curY + 0.95
  belfryGroup.add(needle)

  const apexSphereGeo = new THREE.SphereGeometry(0.12, 12, 12)
  const apexSphere = new THREE.Mesh(apexSphereGeo, goldMat)
  apexSphere.position.y = curY + 1.68
  belfryGroup.add(apexSphere)

  belfryGroup.position.set(center.x, baseH, center.y)
  group.add(belfryGroup)
}

/**
 * Builds the Peristyle Entrance, Escalier d'Honneur & Carved Pediment.
 */
function buildGrandEntrancePeristyle(
  group: THREE.Group,
  center: THREE.Vector2,
  normal: THREE.Vector2,
  dir: THREE.Vector2,
  wallHeight: number,
  portalW: number,
  title: string,
): void {
  const portalGroup = new THREE.Group()

  const stoneMat = getStoneFacadeMaterial()
  const trimMat = getStoneDarkTrimMaterial()
  const stairsMat = getStoneStairsMaterial()
  const doorMat = getDoorOakMaterial()
  const goldMat = getGoldFinialMaterial()
  const ironMat = getWroughtIronMaterial()
  const pedimentMat = getPedimentMaterial(title)

  const portalDepth = 1.3
  const columnH = Math.min(4.2, wallHeight * 0.38)
  const columnR = 0.22

  // 1. Escalier d'Honneur (Ceremonial cascading stone stairs)
  const stepCount = 4
  const stepH = 0.18
  const stepD = 0.38
  const stairsW = portalW + 1.2

  for (let s = 0; s < stepCount; s++) {
    const sW = stairsW + (stepCount - 1 - s) * 0.25
    const sD = portalDepth + (stepCount - 1 - s) * stepD
    const sH = stepH
    const stepGeo = new THREE.BoxGeometry(sW, sH, sD)
    const stepMesh = new THREE.Mesh(stepGeo, stairsMat)
    stepMesh.position.set(0, s * stepH + stepH * 0.5, sD * 0.5)
    portalGroup.add(stepMesh)
  }

  const landingY = stepCount * stepH

  // Lateral stone balustrade flanks alongside the stairs
  const balustradeL = portalDepth + (stepCount - 1) * stepD
  const balustradeGeo = new THREE.BoxGeometry(0.28, 0.75, balustradeL)
  for (const sign of [-1, 1]) {
    const bal = new THREE.Mesh(balustradeGeo, trimMat)
    bal.position.set(sign * (stairsW * 0.5 + 0.1), landingY * 0.5 + 0.35, balustradeL * 0.5)
    portalGroup.add(bal)

    // Decorative stone ball / urn finial on stair post
    const ballGeo = new THREE.SphereGeometry(0.18, 12, 12)
    const ball = new THREE.Mesh(ballGeo, trimMat)
    ball.position.set(sign * (stairsW * 0.5 + 0.1), landingY * 0.5 + 0.82, balustradeL)
    portalGroup.add(ball)
  }

  // 2. Fluted Classical Stone Columns flanking the portal
  const colGeo = new THREE.CylinderGeometry(columnR * 0.88, columnR, columnH, 16)
  const colBaseGeo = new THREE.BoxGeometry(columnR * 2.5, 0.2, columnR * 2.5)
  const colCapGeo = new THREE.BoxGeometry(columnR * 2.6, 0.24, columnR * 2.6)

  const colPositions = [-portalW * 0.45, portalW * 0.45]
  for (const cx of colPositions) {
    const col = new THREE.Mesh(colGeo, trimMat)
    col.position.set(cx, landingY + 0.2 + columnH * 0.5, portalDepth * 0.88)

    const cBase = new THREE.Mesh(colBaseGeo, trimMat)
    cBase.position.set(cx, landingY + 0.1, portalDepth * 0.88)

    const cCap = new THREE.Mesh(colCapGeo, trimMat)
    cCap.position.set(cx, landingY + 0.2 + columnH + 0.12, portalDepth * 0.88)

    portalGroup.add(col, cBase, cCap)
  }

  // 3. Classical Entablature (Architrave + Frieze + Cornice)
  const entY = landingY + 0.2 + columnH + 0.24
  const entGeo = new THREE.BoxGeometry(portalW + 0.8, 0.5, portalDepth * 1.05)
  const entMesh = new THREE.Mesh(entGeo, trimMat)
  entMesh.position.set(0, entY + 0.25, portalDepth * 0.55)
  portalGroup.add(entMesh)

  // 4. Carved Classical Pediment (Fronton Triangulaire)
  const pedimentH = 1.35
  const pedimentBaseW = portalW + 0.85

  // Triangular prism geometry for pediment
  const pedShape = new THREE.Shape()
  pedShape.moveTo(-pedimentBaseW * 0.5, 0)
  pedShape.lineTo(0, pedimentH)
  pedShape.lineTo(pedimentBaseW * 0.5, 0)
  pedShape.closePath()

  const pedGeo = new THREE.ExtrudeGeometry(pedShape, {
    depth: 0.35,
    bevelEnabled: true,
    bevelThickness: 0.08,
    bevelSize: 0.08,
    bevelSegments: 2,
  })
  const pedMesh = new THREE.Mesh(pedGeo, trimMat)
  pedMesh.position.set(0, entY + 0.5, portalDepth * 0.88)
  portalGroup.add(pedMesh)

  // Official Inscribed Plaque inside the tympanum ("HÔTEL DE VILLE")
  const plaqueW = pedimentBaseW * 0.65
  const plaqueH = pedimentH * 0.45
  const plaqueGeo = new THREE.PlaneGeometry(plaqueW, plaqueH)
  const plaqueMesh = new THREE.Mesh(plaqueGeo, pedimentMat)
  plaqueMesh.position.set(0, entY + 0.5 + pedimentH * 0.32, portalDepth * 0.88 + 0.37)
  portalGroup.add(plaqueMesh)

  // 5. Grand Sculpted Double Oak Doors in the portal opening
  const doorW = portalW * 0.72
  const doorH = columnH * 0.86
  const doorGeo = new THREE.BoxGeometry(doorW, doorH, 0.12)
  const doorMesh = new THREE.Mesh(doorGeo, doorMat)
  doorMesh.position.set(0, landingY + doorH * 0.5, 0.06)
  portalGroup.add(doorMesh)

  // Bronze door studs and lion head knockers
  const knockerGeo = new THREE.TorusGeometry(0.08, 0.025, 8, 16)
  for (const sign of [-1, 1]) {
    const knocker = new THREE.Mesh(knockerGeo, goldMat)
    knocker.position.set(sign * (doorW * 0.24), landingY + doorH * 0.52, 0.14)
    portalGroup.add(knocker)
  }

  // Fanlight transom above the door
  const transomGeo = new THREE.CylinderGeometry(doorW * 0.5, doorW * 0.5, 0.08, 16, 1, false, 0, Math.PI)
  const transomMesh = new THREE.Mesh(transomGeo, ironMat)
  transomMesh.rotation.z = Math.PI / 2
  transomMesh.rotation.x = Math.PI / 2
  transomMesh.position.set(0, landingY + doorH + doorW * 0.25, 0.06)
  portalGroup.add(transomMesh)

  // Align portal group with facade normal
  const angle = Math.atan2(normal.y, normal.x) - Math.PI / 2
  portalGroup.rotation.y = -angle
  portalGroup.position.set(center.x, 0, center.y)
  group.add(portalGroup)
}

/**
 * Builds the Balcon d'Honneur (Mayoral Balcony on Piano Nobile).
 */
function buildBalconDHonneur(
  group: THREE.Group,
  center: THREE.Vector2,
  normal: THREE.Vector2,
  dir: THREE.Vector2,
  balconyY: number,
  balconyW: number,
): void {
  const balconyGroup = new THREE.Group()

  const trimMat = getStoneDarkTrimMaterial()
  const ironMat = getWroughtIronMaterial()
  const goldMat = getGoldFinialMaterial()

  const balconyDepth = 0.95
  const slabThickness = 0.22

  // 1. Stone Balcony Slab
  const slabGeo = new THREE.BoxGeometry(balconyW, slabThickness, balconyDepth)
  const slabMesh = new THREE.Mesh(slabGeo, trimMat)
  slabMesh.position.set(0, slabThickness * 0.5, balconyDepth * 0.5)
  balconyGroup.add(slabMesh)

  // 2. Sculpted Stone Consoles / Corbels underneath the slab
  const corbelCount = Math.max(3, Math.round(balconyW / 1.1))
  const corbelGeo = new THREE.BoxGeometry(0.24, 0.65, balconyDepth * 0.85)
  for (let i = 0; i < corbelCount; i++) {
    const t = corbelCount === 1 ? 0 : (i / (corbelCount - 1)) * 2 - 1
    const cx = t * (balconyW * 0.5 - 0.2)
    const corbel = new THREE.Mesh(corbelGeo, trimMat)
    corbel.position.set(cx, -0.32, balconyDepth * 0.45)
    balconyGroup.add(corbel)
  }

  // 3. Wrought-Iron Guardrail with scrolls (Garde-corps en fer forgé)
  const railH = 0.9
  const railThickness = 0.04

  // Front railing
  const frontRailGeo = new THREE.BoxGeometry(balconyW, railH, railThickness)
  const frontRail = new THREE.Mesh(frontRailGeo, ironMat)
  frontRail.position.set(0, slabThickness + railH * 0.5, balconyDepth - railThickness * 0.5)
  balconyGroup.add(frontRail)

  // Side railings
  const sideRailGeo = new THREE.BoxGeometry(railThickness, railH, balconyDepth)
  for (const sign of [-1, 1]) {
    const sideRail = new THREE.Mesh(sideRailGeo, ironMat)
    sideRail.position.set(sign * (balconyW * 0.5 - railThickness * 0.5), slabThickness + railH * 0.5, balconyDepth * 0.5)
    balconyGroup.add(sideRail)
  }

  // Golden Central Municipal Medallion / Rosette on front railing
  const rosetteGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.05, 16)
  const rosette = new THREE.Mesh(rosetteGeo, goldMat)
  rosette.rotation.x = Math.PI / 2
  rosette.position.set(0, slabThickness + railH * 0.5, balconyDepth + 0.02)
  balconyGroup.add(rosette)

  const angle = Math.atan2(normal.y, normal.x) - Math.PI / 2
  balconyGroup.rotation.y = -angle
  balconyGroup.position.set(center.x, balconyY, center.y)
  group.add(balconyGroup)
}

/**
 * Builds the official municipal notice board ("Affichage Légal") on the parvis.
 */
function buildMunicipalNoticeBoard(
  group: THREE.Group,
  pos: THREE.Vector3,
  dir: THREE.Vector2,
): void {
  const boardGroup = new THREE.Group()

  const frameMat = getNoticeBoardFrameMaterial()
  const glassMat = getNoticeBoardGlassMaterial()

  const boardW = 1.65
  const boardH = 1.15
  const postH = 2.1

  // 2 Bronze / Cast Steel Support Posts
  const postGeo = new THREE.CylinderGeometry(0.045, 0.045, postH, 12)
  for (const sign of [-1, 1]) {
    const post = new THREE.Mesh(postGeo, frameMat)
    post.position.set(sign * (boardW * 0.44), postH * 0.5, 0)
    boardGroup.add(post)
  }

  // Vitrine Cabinet Frame
  const cabinetGeo = new THREE.BoxGeometry(boardW, boardH, 0.14)
  const cabinet = new THREE.Mesh(cabinetGeo, frameMat)
  cabinet.position.set(0, postH - boardH * 0.5, 0)
  boardGroup.add(cabinet)

  // Glazed front display face with municipal notices
  const displayGeo = new THREE.PlaneGeometry(boardW - 0.08, boardH - 0.08)
  const display = new THREE.Mesh(displayGeo, glassMat)
  display.position.set(0, postH - boardH * 0.5, 0.075)
  boardGroup.add(display)

  boardGroup.position.set(pos.x, 0, pos.z)
  const angle = Math.atan2(dir.y, dir.x)
  boardGroup.rotation.y = -angle
  group.add(boardGroup)
}

/**
 * Builds a classical cast-iron municipal lamp post with glowing lanterns.
 */
function buildCivicLampPost(
  group: THREE.Group,
  pos: THREE.Vector3,
): void {
  const lampGroup = new THREE.Group()

  const ironMat = getLampPostMaterial()
  const glowMat = getLampGlowMaterial()

  const postH = 3.6

  // Moulded base
  const baseGeo = new THREE.CylinderGeometry(0.18, 0.28, 0.7, 12)
  const base = new THREE.Mesh(baseGeo, ironMat)
  base.position.y = 0.35
  lampGroup.add(base)

  // Fluted central shaft
  const shaftGeo = new THREE.CylinderGeometry(0.07, 0.12, postH - 0.7, 12)
  const shaft = new THREE.Mesh(shaftGeo, ironMat)
  shaft.position.y = 0.7 + (postH - 0.7) * 0.5
  lampGroup.add(shaft)

  // Cross arms for twin lanterns
  const armGeo = new THREE.BoxGeometry(0.85, 0.06, 0.06)
  const arm = new THREE.Mesh(armGeo, ironMat)
  arm.position.y = postH - 0.15
  lampGroup.add(arm)

  // Twin spherical lanterns
  const lanternGeo = new THREE.SphereGeometry(0.16, 16, 16)
  for (const sign of [-1, 1]) {
    const lantern = new THREE.Mesh(lanternGeo, glowMat)
    lantern.position.set(sign * 0.38, postH - 0.15, 0)
    lampGroup.add(lantern)

    // Lantern iron finial cap
    const capGeo = new THREE.ConeGeometry(0.14, 0.12, 12)
    const cap = new THREE.Mesh(capGeo, ironMat)
    cap.position.set(sign * 0.38, postH + 0.04, 0)
    lampGroup.add(cap)
  }

  lampGroup.position.set(pos.x, 0, pos.z)
  group.add(lampGroup)
}

// ─── Main Town Hall Architecture Entry Point ────────────────────────────────

/**
 * Builds complete 3D town hall architecture for an OSM townhall building.
 */
export function buildTownhallArchitecture(
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

  const displayName = buildingName ? buildingName.slice(0, 26).toUpperCase() : 'HÔTEL DE VILLE'

  // Centroid of building footprint for central belfry campanile
  let sumX = 0, sumZ = 0
  for (const p of fp2d) {
    sumX += p.x
    sumZ += p.y
  }
  const centroid = new THREE.Vector2(sumX / fp2d.length, sumZ / fp2d.length)

  // Position campanile midway between centroid and front facade for maximum street visibility
  const belfryPos = new THREE.Vector2(
    centroid.x * 0.4 + edge.mid.x * 0.6,
    centroid.y * 0.4 + edge.mid.y * 0.6,
  )

  // 1. Central Civic Campanile & Clock Belfry (Le Beffroi de l'Hôtel de Ville)
  const belfryW = Math.min(4.8, Math.max(3.2, edge.len * 0.22))
  buildCivicBelfry(group, belfryPos, wallHeight, belfryW)

  // 2. Peristyle Grand Entrance, Escalier d'Honneur & Inscribed Pediment
  const portalW = Math.min(5.8, Math.max(3.6, edge.len * 0.28))
  buildGrandEntrancePeristyle(
    group,
    edge.mid,
    edge.normal,
    edge.dir,
    wallHeight,
    portalW,
    displayName,
  )

  // 3. Balcon d'Honneur (Mayoral Balcony on Piano Nobile above entrance)
  if (wallHeight >= 6.5) {
    const balconyY = Math.min(wallHeight * 0.52, 4.6)
    const balconyW = portalW * 0.88
    buildBalconDHonneur(
      group,
      new THREE.Vector2(edge.mid.x + edge.normal.x * 0.05, edge.mid.y + edge.normal.y * 0.05),
      edge.normal,
      edge.dir,
      balconyY,
      balconyW,
    )
  }

  // 4. Official Municipal Notice Board ("Affichage Légal / Arrêtés Municipaux")
  const noticeBoardPos = new THREE.Vector3(
    edge.mid.x - edge.dir.x * (portalW * 0.5 + 1.8) + edge.normal.x * 0.6,
    0,
    edge.mid.y - edge.dir.y * (portalW * 0.5 + 1.8) + edge.normal.y * 0.6,
  )
  buildMunicipalNoticeBoard(group, noticeBoardPos, edge.dir)

  // 5. Classical Cast-Iron Civic Street Lamps flanking the entrance
  const lampOffset = portalW * 0.5 + 1.4
  const lampLeft = new THREE.Vector3(
    edge.mid.x - edge.dir.x * lampOffset + edge.normal.x * 1.5,
    0,
    edge.mid.y - edge.dir.y * lampOffset + edge.normal.y * 1.5,
  )
  const lampRight = new THREE.Vector3(
    edge.mid.x + edge.dir.x * lampOffset + edge.normal.x * 1.5,
    0,
    edge.mid.y + edge.dir.y * lampOffset + edge.normal.y * 1.5,
  )
  buildCivicLampPost(group, lampLeft)
  buildCivicLampPost(group, lampRight)
}
