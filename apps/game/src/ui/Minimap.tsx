import { useEffect, useRef, useState, useCallback } from 'react'
import type { GameEngine } from '../game/GameEngine.js'
import type { Road, Building, Waterway, Park } from '@world-drive/shared'
import type { WorldPosition } from '@world-drive/math'

type Props = {
  engine: GameEngine
  isMobileLandscape?: boolean
  externalExpanded?: boolean
  onToggleExpanded?: () => void
}

// Iconic Paris landmarks for 1-click GPS routing
const LANDMARKS: Array<{ name: string; pos: WorldPosition; desc: string }> = [
  { name: 'Centre Pompidou', pos: { x: 480, y: 0, z: 420 }, desc: 'Art moderne & architecture' },
  { name: 'Place des Victoires', pos: { x: -350, y: 0, z: 20 }, desc: 'Place circulaire historique' },
  { name: 'Porte Saint-Denis', pos: { x: 180, y: 0, z: -400 }, desc: 'Arc de triomphe Louis XIV' },
  { name: 'Bourse de Commerce', pos: { x: -280, y: 0, z: 320 }, desc: 'Collection Pinault' },
  { name: 'Boulevard de Sébastopol', pos: { x: 250, y: 0, z: 60 }, desc: 'Grand axe nord-sud' },
]

/** True when any point lies within the squared radius (early exit, no sqrt). */
function pointsInRange(
  pts: ReadonlyArray<{ x: number; z: number }>,
  cx: number,
  cz: number,
  rSq: number,
): boolean {
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!
    const dx = p.x - cx
    const dz = p.z - cz
    if (dx * dx + dz * dz <= rSq) return true
  }
  return false
}

export function Minimap({
  engine,
  isMobileLandscape: propIsMobileLandscape,
  externalExpanded,
  onToggleExpanded,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [internalExpanded, setInternalExpanded] = useState(false)
  const expanded = externalExpanded !== undefined ? externalExpanded : internalExpanded

  const [radarZoom, setRadarZoom] = useState(1.0)
  const [expandedZoom, setExpandedZoom] = useState(1.0)
  const radarZoomRef = useRef(radarZoom)
  radarZoomRef.current = radarZoom
  const expandedZoomRef = useRef(expandedZoom)
  expandedZoomRef.current = expandedZoom

  const setExpanded = useCallback(
    (val: boolean | ((prev: boolean) => boolean)) => {
      if (onToggleExpanded) {
        onToggleExpanded()
      } else {
        setInternalExpanded(val)
      }
    },
    [onToggleExpanded],
  )

  const [autoIsMobile, setAutoIsMobile] = useState(false)
  useEffect(() => {
    const check = () => {
      const isTouch =
        'ontouchstart' in window ||
        navigator.maxTouchPoints > 0 ||
        window.matchMedia('(pointer: coarse)').matches
      const isNarrowHeight = window.innerHeight <= 520 && window.innerWidth > window.innerHeight
      setAutoIsMobile(isTouch || isNarrowHeight)
    }
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const isMobileLandscape =
    propIsMobileLandscape !== undefined ? propIsMobileLandscape : autoIsMobile

  const [gpsRouteActive, setGpsRouteActive] = useState(false)
  const [remainingDist, setRemainingDist] = useState<number | null>(null)

  // Toggle expanded map with 'M' key
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'm' || e.key === 'M') {
        setExpanded((v) => !v)
      }
      if (e.key === 'Escape') {
        setExpanded(false)
        engine.setGpsDestination(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [engine, setExpanded])

  // Last GPS values pushed to React state (the canvas loop must not setState per frame).
  const gpsActiveRef = useRef(false)
  const remainingRef = useRef<number | null>(null)

  // Canvas render loop
  useEffect(() => {
    let animId = 0
    let lastDraw = 0

    const render = (now: number) => {
      // Throttle: a minimap needs ~12 Hz, not a full second render loop.
      // Redrawing every building + road stroke at 60 fps scales with loaded
      // map size and starves the main game loop the faster you drive.
      if (now - lastDraw < 80) {
        animId = requestAnimationFrame(render)
        return
      }
      lastDraw = now

      const canvas = canvasRef.current
      if (!canvas) {
        animId = requestAnimationFrame(render)
        return
      }
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        animId = requestAnimationFrame(render)
        return
      }

      const width = canvas.width
      const height = canvas.height
      const centerX = width / 2
      const centerY = height / 2

      // Active vehicle (car or plane)
      const playerPos = engine.getPlayerPosition()
      const forward = engine.getPlayerHeadingVector()
      // forward.x is East (+X) / West (-X)
      // forward.z is South (+Z) / North (-Z)
      // 2D canvas angle: +X is right (East), +Y is down (South), -Y is up (North)
      const headingAngle = Math.atan2(forward.z, forward.x)

      // In radar mode: world rotates so vehicle forward direction is always UP
      const worldRotation = -headingAngle - Math.PI / 2
      // In expanded mode: world is static North-Up, so player arrow rotates to face heading
      const arrowRotation = headingAngle + Math.PI / 2

      // Zoom scale: world units to canvas pixels
      // Radar mode: scale ~0.34 gives ~280m visible radius (560m diameter)
      // Expanded mode: scale ~0.20 gives ~1.3km visible radius
      const baseScale = expanded
        ? (isMobileLandscape ? 0.24 : 0.20)
        : (isMobileLandscape ? 0.30 : 0.34)
      const currentZoom = expanded ? expandedZoomRef.current : radarZoomRef.current
      const scale = baseScale * currentZoom

      // Canvas calls dominate minimap cost: skip features outside the view
      // (radius + margin for wide roads / waterways).
      const viewR = Math.hypot(width, height) / 2 / scale + 60
      const viewRSq = viewR * viewR

      ctx.clearRect(0, 0, width, height)

      // Background
      ctx.save()
      ctx.fillStyle = expanded
        ? 'rgba(10, 16, 28, 0.95)'
        : isMobileLandscape
        ? 'rgba(10, 16, 28, 0.65)'
        : 'rgba(10, 16, 28, 0.88)'
      if (!expanded) {
        ctx.beginPath()
        ctx.arc(centerX, centerY, width / 2 - 2, 0, Math.PI * 2)
        ctx.fill()
        ctx.clip()
      } else {
        ctx.fillRect(0, 0, width, height)
      }

      // World transformation
      ctx.save()
      ctx.translate(centerX, centerY)

      // In radar mode: Heading-up display (rotate world against car forward heading)
      if (!expanded) {
        ctx.rotate(worldRotation)
      }
      ctx.translate(-playerPos.x * scale, -playerPos.z * scale)

      const roads: Road[] = engine.chunkManager?.getActiveRoads() ?? []
      const buildings: Building[] = engine.chunkManager?.getActiveBuildings() ?? []
      const waterways: Waterway[] = engine.chunkManager?.getActiveWaterways() ?? []
      const parks: Park[] = engine.chunkManager?.getActiveParks() ?? []

      // ── 0a. Parks & Gardens (Jardins, parcs, squares, pelouses) ───────────
      for (const p of parks) {
        const pts = p.polygon
        if (pts.length < 3) continue
        if (!pointsInRange(pts, playerPos.x, playerPos.z, viewRSq)) continue
        ctx.fillStyle = 'rgba(34, 197, 94, 0.40)'
        ctx.strokeStyle = 'rgba(74, 222, 128, 0.60)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(pts[0]!.x * scale, pts[0]!.z * scale)
        for (let i = 1; i < pts.length; i++) {
          ctx.lineTo(pts[i]!.x * scale, pts[i]!.z * scale)
        }
        ctx.closePath()
        ctx.fill()
        ctx.stroke()
      }

      // ── 0b. Waterways (Fleuves, rivières, bassins) ──────────────────────────
      for (const w of waterways) {
        const pts = w.points
        if (pts.length < 2) continue
        if (!pointsInRange(pts, playerPos.x, playerPos.z, viewRSq)) continue
        if (w.isPolygon && pts.length >= 3) {
          ctx.fillStyle = 'rgba(14, 116, 144, 0.65)'
          ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)'
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.moveTo(pts[0]!.x * scale, pts[0]!.z * scale)
          for (let i = 1; i < pts.length; i++) {
            ctx.lineTo(pts[i]!.x * scale, pts[i]!.z * scale)
          }
          ctx.closePath()
          ctx.fill()
          ctx.stroke()
        } else {
          ctx.strokeStyle = 'rgba(14, 116, 144, 0.85)'
          ctx.lineWidth = Math.max(4, (w.width || 14) * scale)
          ctx.lineCap = 'round'
          ctx.lineJoin = 'round'
          ctx.beginPath()
          ctx.moveTo(pts[0]!.x * scale, pts[0]!.z * scale)
          for (let i = 1; i < pts.length; i++) {
            ctx.lineTo(pts[i]!.x * scale, pts[i]!.z * scale)
          }
          ctx.stroke()
        }
      }

      // ── 1. Buildings (footprint polygons) ──────────────────────────────────
      ctx.fillStyle = 'rgba(30, 41, 59, 0.60)'
      ctx.strokeStyle = 'rgba(51, 65, 85, 0.45)'
      ctx.lineWidth = 1
      for (const b of buildings) {
        const fp = b.footprint
        if (fp.length < 3) continue
        if (!pointsInRange(fp, playerPos.x, playerPos.z, viewRSq)) continue
        ctx.beginPath()
        ctx.moveTo(fp[0]!.x * scale, fp[0]!.z * scale)
        for (let i = 1; i < fp.length; i++) {
          ctx.lineTo(fp[i]!.x * scale, fp[i]!.z * scale)
        }
        ctx.closePath()
        ctx.fill()
        ctx.stroke()
      }

      // ── 2. Real OpenStreetMap Roads ───────────────────────────────────────
      // High-contrast, multi-pass cartographic road rendering (minor -> tunnels/cycleways -> medium -> major)
      type RoadDrawItem = {
        road: Road
        pts: WorldPosition[]
        category: 'major' | 'medium' | 'minor' | 'service' | 'tunnel' | 'cycleway'
        width: number
        color: string
      }

      const drawList: RoadDrawItem[] = []

      for (const road of roads) {
        const pts = road.points
        if (pts.length < 2) continue
        if (!pointsInRange(pts, playerPos.x, playerPos.z, viewRSq)) continue

        const hw = road.highway
        // Skip footways, steps, and paths
        if (hw === 'footway' || hw === 'path' || hw === 'steps') continue

        // Underground tunnels / underpasses
        if (road.elevationMode === 'tunnel' || road.tunnel) {
          drawList.push({
            road,
            pts,
            category: 'tunnel',
            width: Math.max(2.2, (road.lanes || 2) * 2.6 * scale),
            color: '#64748b',
          })
          continue
        }

        if (hw === 'cycleway') {
          drawList.push({
            road,
            pts,
            category: 'cycleway',
            width: Math.max(1.2, 1.8 * scale),
            color: 'rgba(16, 185, 129, 0.85)',
          })
          continue
        }

        const isHighway = hw === 'motorway' || hw === 'trunk'
        const isMajor = hw === 'primary' || isHighway || (road.lanes && road.lanes >= 4)
        const isMedium = hw === 'secondary' || hw === 'tertiary' || (road.lanes && road.lanes === 2)

        if (isMajor) {
          // Grosses avenues & boulevards : blanc éclatant avec casing foncé
          drawList.push({
            road,
            pts,
            category: 'major',
            width: Math.max(4.6, (road.lanes || 4) * 2.5 * scale),
            color: '#f8fafc',
          })
        } else if (isMedium) {
          // Rues moyennes (secondaires & tertiaires) : argent clair très lisible
          drawList.push({
            road,
            pts,
            category: 'medium',
            width: Math.max(3.2, (road.lanes || 2) * 2.2 * scale),
            color: '#cbd5e1',
          })
        } else if (hw === 'service') {
          // Voies de service / parkings
          drawList.push({
            road,
            pts,
            category: 'service',
            width: Math.max(1.8, 1.6 * scale),
            color: '#64748b',
          })
        } else {
          // Rues résidentielles, living_street, unclassified : gris ardoise clair bien contrasté
          drawList.push({
            road,
            pts,
            category: 'minor',
            width: Math.max(2.2, (road.lanes || 1) * 2.0 * scale),
            color: '#94a3b8',
          })
        }
      }

      // ── Bridges casing pass ──
      for (const item of drawList) {
        if (item.road.elevationMode === 'bridge' || item.road.bridge) {
          ctx.save()
          ctx.strokeStyle = '#020617'
          ctx.lineWidth = item.width + 3
          ctx.lineCap = 'butt'
          ctx.beginPath()
          ctx.moveTo(item.pts[0]!.x * scale, item.pts[0]!.z * scale)
          for (let i = 1; i < item.pts.length; i++) {
            ctx.lineTo(item.pts[i]!.x * scale, item.pts[i]!.z * scale)
          }
          ctx.stroke()
          ctx.restore()
        }
      }

      // ── Pass 1: Minor streets & Service roads ──
      for (const item of drawList) {
        if (item.category === 'minor' || item.category === 'service') {
          ctx.strokeStyle = item.color
          ctx.lineWidth = item.width
          ctx.lineCap = 'round'
          ctx.lineJoin = 'round'
          ctx.beginPath()
          ctx.moveTo(item.pts[0]!.x * scale, item.pts[0]!.z * scale)
          for (let i = 1; i < item.pts.length; i++) {
            ctx.lineTo(item.pts[i]!.x * scale, item.pts[i]!.z * scale)
          }
          ctx.stroke()
        }
      }

      // ── Pass 2: Tunnels & Cycleways ──
      for (const item of drawList) {
        if (item.category === 'tunnel') {
          ctx.save()
          ctx.strokeStyle = item.color
          ctx.lineWidth = item.width
          ctx.setLineDash([6, 4])
          ctx.beginPath()
          ctx.moveTo(item.pts[0]!.x * scale, item.pts[0]!.z * scale)
          for (let i = 1; i < item.pts.length; i++) {
            ctx.lineTo(item.pts[i]!.x * scale, item.pts[i]!.z * scale)
          }
          ctx.stroke()
          ctx.restore()
        } else if (item.category === 'cycleway') {
          ctx.save()
          ctx.strokeStyle = item.color
          ctx.lineWidth = item.width
          ctx.setLineDash([4, 4])
          ctx.beginPath()
          ctx.moveTo(item.pts[0]!.x * scale, item.pts[0]!.z * scale)
          for (let i = 1; i < item.pts.length; i++) {
            ctx.lineTo(item.pts[i]!.x * scale, item.pts[i]!.z * scale)
          }
          ctx.stroke()
          ctx.restore()
        }
      }

      // ── Pass 3: Medium streets ──
      for (const item of drawList) {
        if (item.category === 'medium') {
          ctx.strokeStyle = item.color
          ctx.lineWidth = item.width
          ctx.lineCap = 'round'
          ctx.lineJoin = 'round'
          ctx.beginPath()
          ctx.moveTo(item.pts[0]!.x * scale, item.pts[0]!.z * scale)
          for (let i = 1; i < item.pts.length; i++) {
            ctx.lineTo(item.pts[i]!.x * scale, item.pts[i]!.z * scale)
          }
          ctx.stroke()
        }
      }

      // ── Pass 4: Major boulevards & Motorways (on top for clean intersections) ──
      for (const item of drawList) {
        if (item.category === 'major') {
          // Subtle dark casing so major avenue stands out
          ctx.save()
          ctx.strokeStyle = 'rgba(15, 23, 42, 0.7)'
          ctx.lineWidth = item.width + 1.6
          ctx.lineCap = 'round'
          ctx.lineJoin = 'round'
          ctx.beginPath()
          ctx.moveTo(item.pts[0]!.x * scale, item.pts[0]!.z * scale)
          for (let i = 1; i < item.pts.length; i++) {
            ctx.lineTo(item.pts[i]!.x * scale, item.pts[i]!.z * scale)
          }
          ctx.stroke()
          ctx.restore()

          // Road surface
          ctx.strokeStyle = item.color
          ctx.lineWidth = item.width
          ctx.lineCap = 'round'
          ctx.lineJoin = 'round'
          ctx.beginPath()
          ctx.moveTo(item.pts[0]!.x * scale, item.pts[0]!.z * scale)
          for (let i = 1; i < item.pts.length; i++) {
            ctx.lineTo(item.pts[i]!.x * scale, item.pts[i]!.z * scale)
          }
          ctx.stroke()

          // Center divider for wide avenues
          if (item.width >= 6) {
            ctx.save()
            ctx.strokeStyle = '#334155'
            ctx.lineWidth = Math.max(1, 1.0 * scale)
            ctx.beginPath()
            ctx.moveTo(item.pts[0]!.x * scale, item.pts[0]!.z * scale)
            for (let i = 1; i < item.pts.length; i++) {
              ctx.lineTo(item.pts[i]!.x * scale, item.pts[i]!.z * scale)
            }
            ctx.stroke()
            ctx.restore()
          }
        }
      }

      // ── 3. GPS Planned Route Line ─────────────────────────────────────────
      const route = engine.getGpsRoute()
      if (route && route.length > 1) {
        ctx.save()
        ctx.strokeStyle = '#00f0ff'
        ctx.lineWidth = Math.max(3.5, 4.5 * scale)
        ctx.shadowColor = '#00d4ff'
        ctx.shadowBlur = 10
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'

        ctx.beginPath()
        ctx.moveTo(playerPos.x * scale, playerPos.z * scale)
        for (let i = 0; i < route.length; i++) {
          ctx.lineTo(route[i]!.x * scale, route[i]!.z * scale)
        }
        ctx.stroke()
        ctx.restore()

        // Calculate total remaining road distance
        let distAcc = Math.hypot(route[0]!.x - playerPos.x, route[0]!.z - playerPos.z)
        for (let i = 0; i < route.length - 1; i++) {
          distAcc += Math.hypot(route[i + 1]!.x - route[i]!.x, route[i + 1]!.z - route[i]!.z)
        }
        // Never setState blindly from a render loop: only on actual change.
        const rounded = Math.round(distAcc)
        if (remainingRef.current !== rounded) {
          remainingRef.current = rounded
          setRemainingDist(rounded)
        }
        if (!gpsActiveRef.current) {
          gpsActiveRef.current = true
          setGpsRouteActive(true)
        }
      } else {
        if (gpsActiveRef.current) {
          gpsActiveRef.current = false
          setGpsRouteActive(false)
        }
        if (remainingRef.current !== null) {
          remainingRef.current = null
          setRemainingDist(null)
        }
      }

      // ── 4. GPS Destination Pin ────────────────────────────────────────────
      const dest = engine.getGpsDestination()
      if (dest) {
        ctx.save()
        const px = dest.x * scale
        const pz = dest.z * scale
        ctx.fillStyle = '#ff3366'
        ctx.shadowColor = '#ff3366'
        ctx.shadowBlur = 12
        ctx.beginPath()
        ctx.arc(px, pz, 6, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = 2
        ctx.stroke()
        ctx.restore()
      }

      // ── 4b. Time-trial starts (green, all available) & finish (red).
      // The finish stays hidden until GO; discovery lives on this map. ──────
      const trialStarts = engine.getTrialStartPoints()
      if (trialStarts.length > 0) {
        ctx.save()
        ctx.fillStyle = '#34d399'
        ctx.shadowColor = '#34d399'
        ctx.shadowBlur = 10
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = 2
        for (const s of trialStarts) {
          ctx.beginPath()
          ctx.arc(s.x * scale, s.z * scale, 5, 0, Math.PI * 2)
          ctx.fill()
          ctx.stroke()
        }
        ctx.restore()
      }
      const trialMarkers = engine.getTrialMarkers()
      if (trialMarkers.finish) {
        ctx.save()
        ctx.fillStyle = '#ef4444'
        ctx.shadowColor = '#ef4444'
        ctx.shadowBlur = 10
        ctx.beginPath()
        ctx.arc(trialMarkers.finish.x * scale, trialMarkers.finish.z * scale, 5, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = 2
        ctx.stroke()
        ctx.restore()
      }

      // ── 4c. Time-trial direct line (shortest path: straight to the finish,
      // not the car road route) while counting down or running ──────────────
      const trialStatus = engine.getTrialStatus()
      if (
        (trialStatus.phase === 'countdown' || trialStatus.phase === 'running') &&
        trialStatus.active
      ) {
        ctx.save()
        ctx.strokeStyle = '#34d399'
        ctx.lineWidth = Math.max(2.5, 3.5 * scale)
        ctx.setLineDash([10, 7])
        ctx.shadowColor = '#34d399'
        ctx.shadowBlur = 8
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(playerPos.x * scale, playerPos.z * scale)
        ctx.lineTo(trialStatus.active.to.x * scale, trialStatus.active.to.z * scale)
        ctx.stroke()
        ctx.restore()
      }

      // ── 5. NPC Traffic Blips ──────────────────────────────────────────────
      const npcs = engine.getNPCPositions()
      ctx.fillStyle = '#fbbf24'
      for (const npc of npcs) {
        const nx = npc.x * scale
        const nz = npc.z * scale
        ctx.beginPath()
        ctx.arc(nx, nz, 3, 0, Math.PI * 2)
        ctx.fill()
      }

      // ── 6. Remote Multiplayer Players ─────────────────────────────────────
      const remotePlayers = engine.getRemotePlayerPositions()
      ctx.fillStyle = '#e879f9'
      for (const p of remotePlayers) {
        const rx = p.x * scale
        const rz = p.z * scale
        ctx.beginPath()
        ctx.arc(rx, rz, 4, 0, Math.PI * 2)
        ctx.fill()
      }

      ctx.restore() // Restore world transform

      // ── 7. Player Indicator (Beacon + Headlight Beam) ─────────────────────
      ctx.save()
      ctx.translate(centerX, centerY)
      if (expanded) {
        ctx.rotate(arrowRotation)
      }

      // Headlight cone (forward beam)
      const beamGrad = ctx.createRadialGradient(0, 0, 4, 0, -38, 45)
      beamGrad.addColorStop(0, 'rgba(0, 212, 255, 0.4)')
      beamGrad.addColorStop(1, 'rgba(0, 212, 255, 0.0)')
      ctx.fillStyle = beamGrad
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.lineTo(-18, -48)
      ctx.lineTo(18, -48)
      ctx.closePath()
      ctx.fill()

      ctx.shadowColor = '#00d4ff'
      ctx.shadowBlur = 10
      ctx.fillStyle = '#00f0ff'
      ctx.beginPath()
      if (engine.vehicleMode === 'plane') {
        // Plane silhouette (nose up = heading)
        ctx.moveTo(0, -10) // Nose
        ctx.lineTo(1.7, -6)
        ctx.lineTo(1.7, -2.2)
        ctx.lineTo(10.5, 0.4) // Right wing tip
        ctx.lineTo(10.5, 2.6)
        ctx.lineTo(1.7, 2.2)
        ctx.lineTo(1.2, 6.4)
        ctx.lineTo(4.6, 8.4) // Right stabiliser
        ctx.lineTo(4.6, 10)
        ctx.lineTo(0, 9)
        ctx.lineTo(-4.6, 10)
        ctx.lineTo(-4.6, 8.4)
        ctx.lineTo(-1.2, 6.4)
        ctx.lineTo(-1.7, 2.2)
        ctx.lineTo(-10.5, 2.6)
        ctx.lineTo(-10.5, 0.4) // Left wing tip
        ctx.lineTo(-1.7, -2.2)
        ctx.lineTo(-1.7, -6)
      } else {
        // Car triangle beacon
        ctx.moveTo(0, -9) // Nose
        ctx.lineTo(6, 7)  // Right rear
        ctx.lineTo(0, 4)  // Tail inset
        ctx.lineTo(-6, 7) // Left rear
      }
      ctx.closePath()
      ctx.fill()

      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 1.2
      ctx.stroke()
      ctx.restore()

      // ── 8. Radar Compass Ring & Ring Border ───────────────────────────────
      if (!expanded) {
        const radius = width / 2 - 2
        // Outer glow bezel
        ctx.strokeStyle = 'rgba(0, 212, 255, 0.4)'
        ctx.lineWidth = 2.5
        ctx.beginPath()
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2)
        ctx.stroke()

        // Cardinal directions (North is -Z in world, so -PI/2 in 2D canvas)
        const cardinals = [
          { label: 'N', angle: -Math.PI / 2, color: '#ff4d6d' },
          { label: 'E', angle: 0,            color: 'rgba(255,255,255,0.85)' },
          { label: 'S', angle: Math.PI / 2,  color: 'rgba(255,255,255,0.7)' },
          { label: 'W', angle: Math.PI,      color: 'rgba(255,255,255,0.7)' },
        ]

        ctx.font = "900 10px 'Orbitron', sans-serif"
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'

        for (const c of cardinals) {
          const a = c.angle + worldRotation
          const cx = centerX + Math.cos(a) * (radius - 12)
          const cy = centerY + Math.sin(a) * (radius - 12)
          ctx.fillStyle = c.color
          ctx.fillText(c.label, cx, cy)
        }
      } else {
        // North indicator badge in top right corner of expanded map
        const badgeX = width - 42
        const badgeY = 42
        ctx.save()
        ctx.fillStyle = 'rgba(15, 23, 42, 0.82)'
        ctx.strokeStyle = 'rgba(0, 212, 255, 0.45)'
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.arc(badgeX, badgeY, 18, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()

        // Red arrow pointing North (Up)
        ctx.fillStyle = '#ff4d6d'
        ctx.beginPath()
        ctx.moveTo(badgeX, badgeY - 11)
        ctx.lineTo(badgeX + 4.5, badgeY - 1)
        ctx.lineTo(badgeX - 4.5, badgeY - 1)
        ctx.closePath()
        ctx.fill()

        ctx.font = "900 10px 'Orbitron', sans-serif"
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        ctx.fillStyle = '#ff4d6d'
        ctx.fillText('N', badgeX, badgeY + 1)
        ctx.restore()
      }

      ctx.restore() // Restore canvas clip
      animId = requestAnimationFrame(render)
    }

    animId = requestAnimationFrame(render)
    return () => cancelAnimationFrame(animId)
  }, [engine, expanded])

  // Click on expanded map to set GPS destination
  const handleMapClick = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      if (!expanded) {
        setExpanded(true)
        return
      }

      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      const clickX = e.clientX - rect.left
      const clickY = e.clientY - rect.top

      const centerX = canvas.width / 2
      const centerY = canvas.height / 2
      const baseScale = expanded
        ? (isMobileLandscape ? 0.24 : 0.20)
        : (isMobileLandscape ? 0.30 : 0.34)
      const currentZoom = expanded ? expandedZoomRef.current : radarZoomRef.current
      const scale = baseScale * currentZoom

      const playerPos = engine.getPlayerPosition()
      const worldX = playerPos.x + (clickX - centerX) / scale
      const worldZ = playerPos.z + (clickY - centerY) / scale

      engine.setGpsDestination({ x: worldX, y: 0, z: worldZ })
    },
    [expanded, engine, isMobileLandscape],
  )

  // ── Mobile Landscape Expanded Modal Overlay ─────────────────────────────
  if (isMobileLandscape && expanded) {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 100,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(5, 8, 18, 0.88)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          padding: '12px',
        }}
        onClick={() => setExpanded(false)}
      >
        <div
          style={{
            width: '100%',
            maxWidth: 640,
            maxHeight: '94vh',
            backgroundColor: 'rgba(15, 23, 42, 0.96)',
            border: '1px solid rgba(0, 212, 255, 0.4)',
            borderRadius: 18,
            boxShadow: '0 20px 50px rgba(0,0,0,0.85), 0 0 30px rgba(0,212,255,0.2)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div
            style={{
              padding: '8px 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
              background: 'linear-gradient(180deg, rgba(30, 41, 59, 0.6) 0%, rgba(15, 23, 42, 0) 100%)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 16 }}>📍</span>
              <span
                style={{
                  fontFamily: "'Orbitron', sans-serif",
                  fontSize: 11,
                  fontWeight: 800,
                  color: '#00d4ff',
                  letterSpacing: 1.5,
                }}
              >
                CARTE GPS — {(engine.currentDestination?.city ?? 'PARIS').toUpperCase()}
              </span>
            </div>
            <button
              onClick={() => setExpanded(false)}
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                color: '#fff',
                fontSize: 14,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              ✕
            </button>
          </div>

          {/* Body with horizontal split */}
          <div
            style={{
              display: 'flex',
              padding: 10,
              gap: 12,
              flex: 1,
              minHeight: 0,
              alignItems: 'center',
            }}
          >
            {/* Radar Canvas */}
            <div
              onClick={handleMapClick}
              style={{
                position: 'relative',
                width: 330,
                height: 230,
                borderRadius: 12,
                overflow: 'hidden',
                border: '1px solid rgba(0, 212, 255, 0.4)',
                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)',
                cursor: 'crosshair',
                flexShrink: 0,
              }}
            >
              <canvas
                ref={canvasRef}
                width={330}
                height={230}
                style={{ width: '100%', height: '100%', display: 'block' }}
              />
            </div>

            {/* Landmarks POI list */}
            <div
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                overflowY: 'auto',
                maxHeight: 230,
                paddingRight: 4,
              }}
            >
              <div
                style={{
                  fontFamily: "'Orbitron', sans-serif",
                  fontSize: 9,
                  color: '#38bdf8',
                  letterSpacing: 1,
                  marginBottom: 2,
                }}
              >
                DESTINATIONS 1-CLIC :
              </div>
              {LANDMARKS.map((lm) => (
                <button
                  key={lm.name}
                  onClick={() => {
                    engine.setGpsDestination(lm.pos)
                    setExpanded(false)
                  }}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: 8,
                    padding: '5px 8px',
                    cursor: 'pointer',
                    color: '#ffffff',
                    textAlign: 'left',
                  }}
                >
                  <span style={{ fontSize: 10, fontWeight: 700 }}>📍 {lm.name}</span>
                  <span style={{ fontSize: 8, color: '#94a3b8' }}>{lm.desc}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Standard / Mobile Landscape Radar Widget ──────────────────────────────
  const currentScale = expanded
    ? (isMobileLandscape ? 0.24 : 0.20) * expandedZoom
    : (isMobileLandscape ? 0.30 : 0.34) * radarZoom
  const currentRadiusMeters =
    Math.round(((expanded ? 260 : isMobileLandscape ? 70 : 100) / currentScale / 10)) * 10

  return (
    <>
      <div
        style={{
          position: 'absolute',
          bottom: isMobileLandscape
            ? 'max(14px, env(safe-area-inset-bottom, 14px))'
            : 24,
          left: isMobileLandscape
            ? 'max(14px, env(safe-area-inset-left, 14px))'
            : 24,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          gap: 6,
          zIndex: 40,
        }}
      >
        {/* GPS Turn-by-Turn Bar (docked above the radar so radar stays anchored at bottom-left) */}
        {gpsRouteActive && remainingDist !== null && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: isMobileLandscape ? '3px 8px' : '5px 12px',
              borderRadius: 6,
              background: 'rgba(10, 16, 28, 0.92)',
              border: '1px solid rgba(0, 240, 255, 0.5)',
              backdropFilter: 'blur(10px)',
              boxShadow: '0 4px 16px rgba(0, 212, 255, 0.25)',
              fontFamily: "'Orbitron', sans-serif",
              fontSize: isMobileLandscape ? 8 : 10,
              color: '#00f0ff',
              letterSpacing: 1,
            }}
          >
            <span style={{ fontSize: isMobileLandscape ? 10 : 13 }}>🧭</span>
            <span>GPS: {remainingDist}m</span>
            <button
              onClick={(e) => {
                e.stopPropagation()
                engine.setGpsDestination(null)
              }}
              style={{
                marginLeft: 2,
                background: 'transparent',
                border: 'none',
                color: '#ff4d6d',
                cursor: 'pointer',
                fontSize: 10,
                fontWeight: 700,
              }}
              title="Annuler GPS"
            >
              ✕
            </button>
          </div>
        )}

        {/* Radar Canvas Container */}
        <div
          onClick={handleMapClick}
          onWheel={(e) => {
            e.stopPropagation()
            const factor = e.deltaY < 0 ? 1.15 : 0.87
            if (expanded) {
              setExpandedZoom((z) => Math.max(0.4, Math.min(3.0, +(z * factor).toFixed(2))))
            } else {
              setRadarZoom((z) => Math.max(0.4, Math.min(2.5, +(z * factor).toFixed(2))))
            }
          }}
          style={{
            position: 'relative',
            width: expanded ? 520 : isMobileLandscape ? 140 : 200,
            height: expanded ? 480 : isMobileLandscape ? 140 : 200,
            borderRadius: expanded ? 12 : '50%',
            overflow: 'hidden',
            cursor: expanded ? 'crosshair' : 'pointer',
            transition: 'width 0.25s ease, height 0.25s ease, border-radius 0.25s ease',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6), 0 0 20px rgba(0, 212, 255, 0.18)',
            border: expanded
              ? '1px solid rgba(0, 212, 255, 0.4)'
              : isMobileLandscape
              ? '1.5px solid rgba(0, 212, 255, 0.35)'
              : '1.5px solid rgba(0, 212, 255, 0.3)',
          }}
          title={
            expanded
              ? 'Cliquez pour définir une destination GPS (molette pour zoomer)'
              : 'Agrandir la carte [M] (molette pour zoomer)'
          }
        >
          <canvas
            ref={canvasRef}
            width={expanded ? 520 : isMobileLandscape ? 140 : 200}
            height={expanded ? 480 : isMobileLandscape ? 140 : 200}
            style={{ width: '100%', height: '100%', display: 'block' }}
          />

          {/* Quick toggle button */}
          {(expanded || !isMobileLandscape) && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                setExpanded((v) => !v)
              }}
              style={{
                position: 'absolute',
                top: 8,
                right: 8,
                background: 'rgba(10, 16, 28, 0.85)',
                border: '1px solid rgba(0, 212, 255, 0.3)',
                color: '#00d4ff',
                borderRadius: 4,
                padding: '3px 7px',
                fontFamily: "'Orbitron', sans-serif",
                fontSize: 9,
                cursor: 'pointer',
                letterSpacing: 1,
                zIndex: 15,
              }}
            >
              {expanded ? '✕' : 'CARTE [M]'}
            </button>
          )}

          {/* Zoom Buttons (+ / −) */}
          <div
            style={{
              position: 'absolute',
              bottom: expanded ? 10 : 8,
              right: expanded ? 10 : isMobileLandscape ? 6 : 10,
              display: 'flex',
              flexDirection: 'column',
              gap: 3,
              zIndex: 15,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => {
                if (expanded) setExpandedZoom((z) => Math.min(3.0, +(z * 1.25).toFixed(2)))
                else setRadarZoom((z) => Math.min(2.5, +(z * 1.25).toFixed(2)))
              }}
              style={{
                width: 20,
                height: 20,
                borderRadius: 4,
                background: 'rgba(10, 16, 28, 0.85)',
                border: '1px solid rgba(0, 212, 255, 0.35)',
                color: '#00d4ff',
                fontFamily: "'Orbitron', sans-serif",
                fontSize: 12,
                fontWeight: 900,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                lineHeight: 1,
                padding: 0,
              }}
              title="Zoom avant (+)"
            >
              +
            </button>
            <button
              onClick={() => {
                if (expanded) setExpandedZoom((z) => Math.max(0.4, +(z * 0.8).toFixed(2)))
                else setRadarZoom((z) => Math.max(0.4, +(z * 0.8).toFixed(2)))
              }}
              style={{
                width: 20,
                height: 20,
                borderRadius: 4,
                background: 'rgba(10, 16, 28, 0.85)',
                border: '1px solid rgba(0, 212, 255, 0.35)',
                color: '#00d4ff',
                fontFamily: "'Orbitron', sans-serif",
                fontSize: 12,
                fontWeight: 900,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                lineHeight: 1,
                padding: 0,
              }}
              title="Zoom arrière (−)"
            >
              −
            </button>
          </div>

          {/* Visible range pill */}
          <div
            style={{
              position: 'absolute',
              bottom: expanded ? 10 : 8,
              left: expanded ? 10 : '50%',
              transform: expanded ? 'none' : 'translateX(-50%)',
              background: 'rgba(10, 16, 28, 0.78)',
              border: '1px solid rgba(0, 212, 255, 0.25)',
              borderRadius: 8,
              padding: '1px 6px',
              fontFamily: "'Orbitron', sans-serif",
              fontSize: 8,
              color: '#38bdf8',
              letterSpacing: 0.5,
              pointerEvents: 'none',
              userSelect: 'none',
              zIndex: 12,
            }}
          >
            {currentRadiusMeters}m
          </div>
        </div>

        {/* Desktop Expanded Navigation Sidebar & POI Fast Travel */}
        {!isMobileLandscape && expanded && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              width: 520,
              padding: '10px 14px',
              borderRadius: 8,
              background: 'rgba(10, 16, 28, 0.94)',
              border: '1px solid rgba(0, 212, 255, 0.3)',
              backdropFilter: 'blur(12px)',
            }}
          >
            <div
              style={{
                fontFamily: "'Orbitron', sans-serif",
                fontSize: 10,
                letterSpacing: 1.5,
                color: '#00d4ff',
                marginBottom: 2,
                display: 'flex',
                justifyContent: 'space-between',
              }}
            >
              <span>{engine.currentDestination?.flag ?? '🌍'} DESTINATIONS RAPIDES — {(engine.currentDestination?.city ?? 'PARIS').toUpperCase()}</span>
              <span style={{ color: '#38bdf8' }}>[T] Voyager vers une autre ville</span>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {LANDMARKS.map((lm) => (
                <button
                  key={lm.name}
                  onClick={() => {
                    engine.setGpsDestination(lm.pos)
                  }}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: 6,
                    padding: '6px 10px',
                    cursor: 'pointer',
                    color: '#ffffff',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(0, 212, 255, 0.15)'
                    e.currentTarget.style.borderColor = 'rgba(0, 212, 255, 0.6)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)'
                  }}
                >
                  <span
                    style={{
                      fontFamily: "'Inter', sans-serif",
                      fontSize: 11,
                      fontWeight: 700,
                    }}
                  >
                    📍 {lm.name}
                  </span>
                  <span style={{ fontSize: 9, color: '#888', marginTop: 1 }}>{lm.desc}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  )
}
