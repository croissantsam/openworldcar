import { useEffect, useRef, useState, useCallback } from 'react'
import type { GameEngine } from '../game/GameEngine.js'
import type { Road, Building, Waterway, Park } from '@world-drive/shared'
import type { WorldPosition } from '@world-drive/math'

type Props = {
  engine: GameEngine
}

// Iconic Paris landmarks for 1-click GPS routing
const LANDMARKS: Array<{ name: string; pos: WorldPosition; desc: string }> = [
  { name: 'Centre Pompidou', pos: { x: 480, y: 0, z: 420 }, desc: 'Art moderne & architecture' },
  { name: 'Place des Victoires', pos: { x: -350, y: 0, z: 20 }, desc: 'Place circulaire historique' },
  { name: 'Porte Saint-Denis', pos: { x: 180, y: 0, z: -400 }, desc: 'Arc de triomphe Louis XIV' },
  { name: 'Bourse de Commerce', pos: { x: -280, y: 0, z: 320 }, desc: 'Collection Pinault' },
  { name: 'Boulevard de Sébastopol', pos: { x: 250, y: 0, z: 60 }, desc: 'Grand axe nord-sud' },
]

export function Minimap({ engine }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [expanded, setExpanded] = useState(false)
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
  }, [engine])

  // Canvas render loop
  useEffect(() => {
    let animId = 0

    const render = () => {
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      const width = canvas.width
      const height = canvas.height
      const centerX = width / 2
      const centerY = height / 2

      const playerPos = engine.playerCar.getPosition()
      const playerYaw = engine.playerCar.getYaw()

      // Zoom scale: world units to canvas pixels
      // In radar mode: ~1.4 px/m (shows ~150m radius). In expanded mode: ~0.4 px/m (shows ~800m)
      const scale = expanded ? 0.42 : 1.35

      ctx.clearRect(0, 0, width, height)

      // Background
      ctx.save()
      ctx.fillStyle = expanded ? 'rgba(10, 16, 28, 0.95)' : 'rgba(10, 16, 28, 0.88)'
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

      // In radar mode: Heading-up display (rotate world against car yaw)
      if (!expanded) {
        ctx.rotate(-playerYaw)
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
      ctx.fillStyle = 'rgba(40, 52, 75, 0.65)'
      ctx.strokeStyle = 'rgba(70, 90, 125, 0.4)'
      ctx.lineWidth = 1
      for (const b of buildings) {
        const fp = b.footprint
        if (fp.length < 3) continue
        ctx.beginPath()
        ctx.moveTo(fp[0]!.x * scale, fp[0]!.z * scale)
        for (let i = 1; i < fp.length; i++) {
          ctx.lineTo(fp[i]!.x * scale, fp[i]!.z * scale)
        }
        ctx.closePath()
        ctx.fill()
        ctx.stroke()
      }

      // ── 2. Roads (Grosses avenues 4 voies vs Rues moyennes 2 voies vs Petites rues 1 voie) ──
      for (const road of roads) {
        const pts = road.points
        if (pts.length < 2) continue

        const hw = road.highway
        const isHighway = hw === 'motorway' || hw === 'trunk'
        const isMajor = hw === 'primary' || isHighway || (road.lanes && road.lanes >= 4)
        const isMedium = hw === 'secondary' || hw === 'tertiary' || (road.lanes && road.lanes === 2)

        let roadW: number
        let color: string

        if (isMajor) {
          // Grosses avenues : 2 voies dans chaque sens (large et clair)
          color = '#94a3b8'
          roadW = Math.max(6, 14 * scale)
        } else if (isMedium) {
          // Rues moyennes : 2 voies en double sens (1 aller + 1 retour)
          color = '#64748b'
          roadW = Math.max(4, 7 * scale)
        } else {
          // Petites rues : 1 voie en double sens
          color = '#475569'
          roadW = Math.max(2.5, 4.5 * scale)
        }

        // Chaussée
        ctx.strokeStyle = color
        ctx.lineWidth = roadW
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'

        ctx.beginPath()
        ctx.moveTo(pts[0]!.x * scale, pts[0]!.z * scale)
        for (let i = 1; i < pts.length; i++) {
          ctx.lineTo(pts[i]!.x * scale, pts[i]!.z * scale)
        }
        ctx.stroke()

        // Pour les grosses avenues : séparateur central plus sombre pour marquer le 2x2 voies
        if (isMajor && roadW >= 7) {
          ctx.save()
          ctx.strokeStyle = '#1e293b'
          ctx.lineWidth = Math.max(1, 1.4 * scale)
          ctx.beginPath()
          ctx.moveTo(pts[0]!.x * scale, pts[0]!.z * scale)
          for (let i = 1; i < pts.length; i++) {
            ctx.lineTo(pts[i]!.x * scale, pts[i]!.z * scale)
          }
          ctx.stroke()
          ctx.restore()
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
        setRemainingDist(Math.round(distAcc))
        setGpsRouteActive(true)
      } else {
        setGpsRouteActive(false)
        setRemainingDist(null)
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
        ctx.rotate(playerYaw)
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

      // Car triangle beacon
      ctx.shadowColor = '#00d4ff'
      ctx.shadowBlur = 10
      ctx.fillStyle = '#00f0ff'
      ctx.beginPath()
      ctx.moveTo(0, -9) // Nose
      ctx.lineTo(6, 7)  // Right rear
      ctx.lineTo(0, 4)  // Tail inset
      ctx.lineTo(-6, 7) // Left rear
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

        // Cardinal directions (rotate with player yaw)
        const cardinals = [
          { label: 'N', angle: 0, color: '#ff4d6d' },
          { label: 'E', angle: Math.PI / 2, color: 'rgba(255,255,255,0.7)' },
          { label: 'S', angle: Math.PI, color: 'rgba(255,255,255,0.7)' },
          { label: 'W', angle: (Math.PI * 3) / 2, color: 'rgba(255,255,255,0.7)' },
        ]

        ctx.font = "900 9px 'Orbitron', sans-serif"
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'

        for (const c of cardinals) {
          const a = c.angle - playerYaw - Math.PI / 2
          const cx = centerX + Math.cos(a) * (radius - 12)
          const cy = centerY + Math.sin(a) * (radius - 12)
          ctx.fillStyle = c.color
          ctx.fillText(c.label, cx, cy)
        }
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
      const scale = 0.42

      const playerPos = engine.playerCar.getPosition()
      const worldX = playerPos.x + (clickX - centerX) / scale
      const worldZ = playerPos.z + (clickY - centerY) / scale

      engine.setGpsDestination({ x: worldX, y: 0, z: worldZ })
    },
    [expanded, engine],
  )

  return (
    <>
      {/* ── Minimap Widget (Bottom Left) ───────────────────────────────────── */}
      <div
        style={{
          position: 'absolute',
          bottom: 28,
          left: 32,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          gap: 8,
          zIndex: 40,
        }}
      >
        {/* GPS Turn-by-Turn Bar */}
        {gpsRouteActive && remainingDist !== null && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 12px',
              borderRadius: 6,
              background: 'rgba(10, 16, 28, 0.92)',
              border: '1px solid rgba(0, 240, 255, 0.5)',
              backdropFilter: 'blur(10px)',
              boxShadow: '0 4px 16px rgba(0, 212, 255, 0.25)',
              fontFamily: "'Orbitron', sans-serif",
              fontSize: 10,
              color: '#00f0ff',
              letterSpacing: 1,
            }}
          >
            <span style={{ fontSize: 13 }}>🧭</span>
            <span>GPS: {remainingDist}m</span>
            <button
              onClick={(e) => {
                e.stopPropagation()
                engine.setGpsDestination(null)
              }}
              style={{
                marginLeft: 4,
                background: 'transparent',
                border: 'none',
                color: '#ff4d6d',
                cursor: 'pointer',
                fontSize: 11,
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
          style={{
            position: 'relative',
            width: expanded ? 520 : 190,
            height: expanded ? 480 : 190,
            borderRadius: expanded ? 12 : '50%',
            overflow: 'hidden',
            cursor: expanded ? 'crosshair' : 'pointer',
            transition: 'width 0.25s ease, height 0.25s ease, border-radius 0.25s ease',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6), 0 0 20px rgba(0, 212, 255, 0.18)',
            border: expanded
              ? '1px solid rgba(0, 212, 255, 0.4)'
              : 'none',
          }}
          title={expanded ? 'Cliquez pour définir une destination GPS' : 'Cliquez ou appuyez sur M pour agrandir'}
        >
          <canvas
            ref={canvasRef}
            width={expanded ? 520 : 190}
            height={expanded ? 480 : 190}
            style={{ width: '100%', height: '100%', display: 'block' }}
          />

          {/* Quick toggle button */}
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
            }}
          >
            {expanded ? 'RÉDUIRE [M]' : 'CARTE [M]'}
          </button>
        </div>

        {/* Expanded Navigation Sidebar & POI Fast Travel */}
        {expanded && (
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
