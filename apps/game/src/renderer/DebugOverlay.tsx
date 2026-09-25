/**
 * DebugOverlay — in-game stats panel.
 * Toggle with ` (backtick) or ~.
 */

import { useEffect, useState, useCallback } from 'react'
import type { GameEngine, DebugStats } from '../game/GameEngine.js'

type Props = { engine: GameEngine }

const STYLE: React.CSSProperties = {
  position: 'absolute',
  top: 16,
  left: 16,
  background: 'rgba(0,0,0,0.75)',
  backdropFilter: 'blur(8px)',
  color: '#00ff88',
  fontFamily: "'Courier New', monospace",
  fontSize: 11,
  padding: '12px 16px',
  borderRadius: 6,
  border: '1px solid rgba(0,255,136,0.2)',
  pointerEvents: 'none',
  userSelect: 'none',
  minWidth: 220,
  lineHeight: 1.8,
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 24 }}>
      <span style={{ color: '#888' }}>{label}</span>
      <span>{value}</span>
    </div>
  )
}

export function DebugOverlay({ engine }: Props) {
  const [stats, setStats] = useState<DebugStats>(engine.stats)

  const refresh = useCallback(() => setStats({ ...engine.stats }), [engine])

  useEffect(() => {
    const id = setInterval(refresh, 200) // update 5×/s
    return () => clearInterval(id)
  }, [refresh])

  const { x, y, z } = stats.playerPosition

  return (
    <div style={STYLE}>
      <div
        style={{
          fontFamily: "'Orbitron', sans-serif",
          color: '#00ff88',
          fontSize: 10,
          letterSpacing: 2,
          marginBottom: 8,
          borderBottom: '1px solid rgba(0,255,136,0.2)',
          paddingBottom: 6,
        }}
      >
        DEBUG
      </div>

      <Row label="FPS" value={stats.fps} />
      <Row label="MS" value={`${stats.ms} ms`} />
      <Row label="Draw Calls" value={stats.drawCalls} />
      <Row label="Triangles" value={stats.triangles.toLocaleString()} />

      <div style={{ borderTop: '1px solid rgba(0,255,136,0.1)', margin: '6px 0' }} />

      <Row label="Street" value={stats.streetName ?? 'En exploration'} />
      <Row label="Chunk" value={stats.currentChunk} />
      <Row label="Loaded Chunks" value={stats.loadedChunks} />
      <Row label="Chunk Q" value={`${stats.chunkBuildQueue} (${stats.chunkLoadsCompleted}/${stats.chunkLoadsStarted})`} />

      <div style={{ borderTop: '1px solid rgba(0,255,136,0.1)', margin: '6px 0' }} />

      <Row label="World X" value={x.toFixed(1)} />
      <Row label="World Y" value={y.toFixed(1)} />
      <Row label="World Z" value={z.toFixed(1)} />
      <Row label="GPS Lat" value={stats.gpsPosition.lat.toFixed(5)} />
      <Row label="GPS Lon" value={stats.gpsPosition.lon.toFixed(5)} />
      <Row label="Local time" value={stats.solarTime} />
      <Row label="Sun elev" value={`${stats.sunElev.toFixed(1)}°${stats.sunElev < -6 ? ' ☾' : stats.sunElev < 0 ? ' twilight' : ' ☀'}`} />

      <div style={{ borderTop: '1px solid rgba(0,255,136,0.1)', margin: '6px 0' }} />

      <Row label="Latency" value={stats.networkLatency < 0 ? 'OFFLINE' : `${stats.networkLatency} ms`} />
      <Row label="Players" value={stats.nearbyPlayers} />
      <Row label="NPCs" value={stats.npcCount} />
      <Row label="Srv tick" value={stats.serverTickMs === undefined ? '—' : `${stats.serverTickMs.toFixed(2)} ms`} />
      <Row label="Srv p95" value={stats.serverTickP95 === undefined ? '—' : `${stats.serverTickP95.toFixed(2)} ms`} />
      <Row label="Srv players" value={stats.serverPlayers ?? '—'} />

      <div
        style={{
          marginTop: 8,
          color: '#555',
          fontSize: 9,
          letterSpacing: 1,
        }}
      >
        [ ` ] TOGGLE DEBUG · [T/G] TIME ±1H · [N] REAL TIME
      </div>
    </div>
  )
}
