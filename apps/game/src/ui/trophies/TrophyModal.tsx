import { useEffect, useState } from 'react'
import { getLeaderboard, getMyProgress, type LeaderboardMetric, type MyProgress } from '../../server/stats.js'
import { TROPHIES, trophyProgress, type TrophyCategory, type TrophyDef } from '../../lib/trophies.js'

type Tab = 'trophies' | 'leaderboard'

const CATEGORY_LABELS: Record<TrophyCategory, string> = {
  distance: 'Distance totale',
  jump: 'Sauts',
  cities: 'Villes explorées',
  playtime: 'Temps de jeu',
}

const METRICS: Array<{ id: LeaderboardMetric; label: string }> = [
  { id: 'distance', label: 'Distance' },
  { id: 'jump', label: 'Sauts' },
  { id: 'cities', label: 'Villes' },
  { id: 'playtime', label: 'Temps' },
  { id: 'trophies', label: 'Trophées' },
]

function formatValue(metric: LeaderboardMetric, value: number): string {
  switch (metric) {
    case 'distance': {
      const km = value / 1000
      return km < 100 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`
    }
    case 'jump':
      return `${Math.round(value)} m`
    case 'cities':
      return `${Math.round(value)}`
    case 'playtime': {
      const h = Math.floor(value / 3600)
      const m = Math.floor((value % 3600) / 60)
      return h > 0 ? `${h}h ${m}min` : `${m}min`
    }
    case 'trophies':
      return `${Math.round(value)}/${TROPHIES.length}`
  }
}

function rankIcon(rank: number): string {
  if (rank === 1) return '🥇'
  if (rank === 2) return '🥈'
  if (rank === 3) return '🥉'
  return `${rank}`
}

export function TrophyModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('trophies')
  const [progress, setProgress] = useState<MyProgress | null>(null)
  const [progressError, setProgressError] = useState(false)
  const [metric, setMetric] = useState<LeaderboardMetric>('distance')
  const [rows, setRows] = useState<Array<{ rank: number; label: string; value: number; you: boolean }> | null>(null)
  const [boardError, setBoardError] = useState(false)

  useEffect(() => {
    let cancelled = false
    getMyProgress()
      .then((p) => {
        if (!cancelled) setProgress(p)
      })
      .catch(() => {
        if (!cancelled) setProgressError(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (tab !== 'leaderboard') return
    let cancelled = false
    setRows(null)
    setBoardError(false)
    getLeaderboard({ data: metric })
      .then((r) => {
        if (!cancelled) setRows(r)
      })
      .catch(() => {
        if (!cancelled) setBoardError(true)
      })
    return () => {
      cancelled = true
    }
  }, [tab, metric])

  const unlockedIds = new Set(progress?.trophies.map((t) => t.trophyId) ?? [])
  const snapshot = progress
    ? {
        totalDistanceM: progress.stats.totalDistanceM,
        maxJumpM: progress.stats.maxJumpM,
        totalPlayTimeS: progress.stats.totalPlayTimeS,
        citiesCount: progress.cities.length,
      }
    : null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.7)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        zIndex: 300,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'rgba(15, 23, 42, 0.95)',
          border: '1px solid rgba(251, 191, 36, 0.4)',
          borderRadius: 20,
          padding: '18px 22px',
          maxWidth: 460,
          width: '94%',
          maxHeight: '88dvh',
          overflowY: 'auto',
          boxShadow: '0 20px 50px rgba(0,0,0,0.8), 0 0 25px rgba(251, 191, 36, 0.15)',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 12, fontWeight: 900, color: '#fbbf24', letterSpacing: 2 }}>
            TROPHÉES & CLASSEMENT
          </span>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 8,
              color: '#fff',
              width: 28,
              height: 28,
              cursor: 'pointer',
              fontSize: 13,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          {(['trophies', 'leaderboard'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                flex: 1,
                background: tab === t ? 'rgba(251, 191, 36, 0.15)' : 'rgba(255,255,255,0.04)',
                border: tab === t ? '1px solid rgba(251, 191, 36, 0.6)' : '1px solid rgba(255,255,255,0.1)',
                borderRadius: 10,
                padding: '8px 0',
                color: tab === t ? '#fbbf24' : '#94a3b8',
                fontFamily: "'Orbitron', sans-serif",
                fontSize: 10,
                fontWeight: 800,
                letterSpacing: 1,
                cursor: 'pointer',
              }}
            >
              {t === 'trophies' ? `🏆 TROPHÉES${progress ? ` (${progress.trophies.length}/${TROPHIES.length})` : ''}` : '📊 CLASSEMENT'}
            </button>
          ))}
        </div>

        {tab === 'trophies' ? (
          <TrophyList progress={snapshot} unlockedIds={unlockedIds} error={progressError} />
        ) : (
          <Leaderboard metric={metric} setMetric={setMetric} rows={rows} error={boardError} />
        )}
      </div>
    </div>
  )
}

function TrophyList({
  progress,
  unlockedIds,
  error,
}: {
  progress: { totalDistanceM: number; maxJumpM: number; totalPlayTimeS: number; citiesCount: number } | null
  unlockedIds: Set<string>
  error: boolean
}) {
  if (error) {
    return <div style={{ color: '#fca5a5', fontSize: 12, textAlign: 'center' }}>Progression indisponible hors-ligne.</div>
  }
  if (!progress) {
    return <div style={{ color: '#94a3b8', fontSize: 12, textAlign: 'center', padding: '12px 0' }}>Chargement…</div>
  }
  const categories = (Object.keys(CATEGORY_LABELS) as TrophyCategory[]).map((cat) => ({
    cat,
    items: TROPHIES.filter((t) => t.category === cat),
  }))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {categories.map(({ cat, items }) => (
        <div key={cat}>
          <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 9, fontWeight: 800, color: '#00d4ff', letterSpacing: 1.5, marginBottom: 6 }}>
            {CATEGORY_LABELS[cat].toUpperCase()}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {items.map((t) => (
              <TrophyCard key={t.id} def={t} unlocked={unlockedIds.has(t.id)} ratio={trophyProgress(t, progress)} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function TrophyCard({ def, unlocked, ratio }: { def: TrophyDef; unlocked: boolean; ratio: number }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        background: unlocked ? 'rgba(251, 191, 36, 0.1)' : 'rgba(255, 255, 255, 0.03)',
        border: unlocked ? '1px solid rgba(251, 191, 36, 0.5)' : '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: 12,
        padding: '8px 12px',
        opacity: unlocked ? 1 : 0.75,
      }}
    >
      <span style={{ fontSize: 22, filter: unlocked ? 'none' : 'grayscale(1)', flexShrink: 0 }}>{def.icon}</span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1, minWidth: 0 }}>
        <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 800, color: unlocked ? '#fde68a' : '#e2e8f0' }}>
          {def.name}
        </span>
        <span style={{ fontSize: 10, color: '#94a3b8' }}>{def.description}</span>
        {!unlocked && (
          <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.1)', overflow: 'hidden', marginTop: 2 }}>
            <div
              style={{
                width: `${Math.round(ratio * 100)}%`,
                height: '100%',
                borderRadius: 2,
                background: 'linear-gradient(90deg, #b45309, #fbbf24)',
              }}
            />
          </div>
        )}
      </div>
      {unlocked && <span style={{ fontSize: 14, color: '#fbbf24', flexShrink: 0 }}>✓</span>}
    </div>
  )
}

function Leaderboard({
  metric,
  setMetric,
  rows,
  error,
}: {
  metric: LeaderboardMetric
  setMetric: (m: LeaderboardMetric) => void
  rows: Array<{ rank: number; label: string; value: number; you: boolean }> | null
  error: boolean
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {METRICS.map((m) => (
          <button
            key={m.id}
            onClick={() => setMetric(m.id)}
            style={{
              background: metric === m.id ? 'rgba(0, 212, 255, 0.15)' : 'rgba(255,255,255,0.04)',
              border: metric === m.id ? '1px solid rgba(0, 212, 255, 0.6)' : '1px solid rgba(255,255,255,0.1)',
              borderRadius: 8,
              padding: '6px 10px',
              color: metric === m.id ? '#00d4ff' : '#94a3b8',
              fontFamily: "'Inter', sans-serif",
              fontSize: 11,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {m.label}
          </button>
        ))}
      </div>

      {error ? (
        <div style={{ color: '#fca5a5', fontSize: 12, textAlign: 'center' }}>Classement indisponible hors-ligne.</div>
      ) : !rows ? (
        <div style={{ color: '#94a3b8', fontSize: 12, textAlign: 'center', padding: '12px 0' }}>Chargement…</div>
      ) : rows.length === 0 ? (
        <div style={{ color: '#94a3b8', fontSize: 12, textAlign: 'center', padding: '12px 0' }}>
          Personne au classement pour l’instant — roule pour être le premier !
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {rows.map((r) => (
            <div
              key={r.rank}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                background: r.you ? 'rgba(0, 212, 255, 0.12)' : 'rgba(255, 255, 255, 0.03)',
                border: r.you ? '1px solid rgba(0, 212, 255, 0.5)' : '1px solid rgba(255, 255, 255, 0.07)',
                borderRadius: 10,
                padding: '7px 12px',
              }}
            >
              <span style={{ width: 30, textAlign: 'center', fontSize: r.rank <= 3 ? 16 : 12, fontWeight: 800, color: '#e2e8f0', flexShrink: 0 }}>
                {rankIcon(r.rank)}
              </span>
              <span
                style={{
                  flex: 1,
                  fontSize: 12,
                  fontWeight: r.you ? 800 : 600,
                  color: r.you ? '#7dd3fc' : '#e2e8f0',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {r.label}
                {r.you ? ' (toi)' : ''}
              </span>
              <span style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 11, fontWeight: 800, color: '#fff', flexShrink: 0 }}>
                {formatValue(metric, r.value)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
