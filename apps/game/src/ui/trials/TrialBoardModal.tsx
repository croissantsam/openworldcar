import { useEffect, useRef, useState } from 'react'
import type { GameEngine } from '../../game/GameEngine.js'
import {
  formatTrialDist,
  formatTrialTime,
  subscribeTrialTimesChanged,
  type TrialDef,
} from '../../lib/trials.js'
import { WORLD_DESTINATIONS } from '../../world/destinations.js'
import {
  getMyTrialBests,
  getMyTrialHistory,
  getTrialLeaderboard,
  type TrialHistoryRow,
  type TrialLeaderboardRow,
} from '../../server/trials.js'

function rankIcon(rank: number): string {
  if (rank === 1) return '🥇'
  if (rank === 2) return '🥈'
  if (rank === 3) return '🥉'
  return `${rank}`
}

function destCity(destinationId: string): string {
  return WORLD_DESTINATIONS.find((d) => d.id === destinationId)?.city ?? 'Zone perso'
}

function histKey(h: Pick<TrialHistoryRow, 'trialId' | 'destinationId'>): string {
  return `${h.trialId} ${h.destinationId}`
}

function LeaderboardRows({ rows }: { rows: TrialLeaderboardRow[] }) {
  return (
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
            {r.you ? ' (vous)' : ''}
          </span>
          <span style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 11, fontWeight: 800, color: '#fff', flexShrink: 0 }}>
            {formatTrialTime(r.timeMs)}
          </span>
        </div>
      ))}
    </div>
  )
}

export function TrialBoardModal({ engine, onClose }: { engine: GameEngine; onClose: () => void }) {
  const [tab, setTab] = useState<'near' | 'mine'>('near')
  const [trials, setTrials] = useState<TrialDef[]>([])
  const [radarDone, setRadarDone] = useState(false)
  const [bests, setBests] = useState<Record<string, number>>({})
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [rows, setRows] = useState<TrialLeaderboardRow[] | null>(null)
  const [boardError, setBoardError] = useState(false)
  // History tab: every distinct chrono the player has run + teleport + board.
  const [hist, setHist] = useState<TrialHistoryRow[] | null>(null)
  const [histError, setHistError] = useState(false)
  const [histSelectedId, setHistSelectedId] = useState<string | null>(null)
  const [histRows, setHistRows] = useState<TrialLeaderboardRow[] | null>(null)
  const [histBoardError, setHistBoardError] = useState(false)
  const histFetchedRef = useRef<string | null>(null)
  // Bumped by the liveness subscription (submit / other tab / focus / poll).
  const [refreshTick, setRefreshTick] = useState(0)
  // Selection the rows were last (re)set for — distinguishes a new
  // selection (loading state) from a background refresh (keep stale rows).
  const fetchedSelRef = useRef<string | null>(null)

  useEffect(() => subscribeTrialTimesChanged(() => setRefreshTick((t) => t + 1)), [])

  // Nearby trials now, then far-monument radar (Overpass, cached), then again.
  useEffect(() => {
    let cancelled = false
    try {
      setTrials(engine.getNearbyTrials())
    } catch {
      setTrials([])
    }
    engine
      .refreshTrialRadar()
      .catch(() => {})
      .finally(() => {
        if (cancelled) return
        try {
          setTrials(engine.getNearbyTrials())
        } catch {
          // keep the first pass
        }
        setRadarDone(true)
      })
    return () => {
      cancelled = true
    }
  }, [engine])

  const selected = trials.find((t) => t.id === (selectedId ?? trials[0]?.id)) ?? trials[0] ?? null

  useEffect(() => {
    let cancelled = false
    if (trials.length === 0) return
    getMyTrialBests({ data: trials.map((t) => t.id) })
      .then((b) => {
        if (!cancelled) setBests(b)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [trials, refreshTick])

  useEffect(() => {
    if (!selected) return
    let cancelled = false
    const isBackground = fetchedSelRef.current === selected.id && rows !== null
    if (!isBackground) {
      // New selection: full reset to loading state.
      fetchedSelRef.current = selected.id
      setRows(null)
      setBoardError(false)
    }
    getTrialLeaderboard({ data: selected.id })
      .then((r) => {
        if (!cancelled) {
          setRows(r)
          setBoardError(false)
        }
      })
      .catch(() => {
        // Background refresh failure: keep stale rows. Only flag an error
        // when there is nothing to show yet.
        if (!cancelled && !isBackground) setBoardError(true)
      })
    return () => {
      cancelled = true
    }
  }, [selected?.id, refreshTick]) // eslint-disable-line react-hooks/exhaustive-deps

  // History tab: refetch when opened and on liveness ticks (a new run lands here).
  useEffect(() => {
    if (tab !== 'mine') return
    let cancelled = false
    setHistError(false)
    getMyTrialHistory()
      .then((h) => {
        if (!cancelled) {
          setHist(h)
          setHistError(false)
        }
      })
      .catch(() => {
        if (!cancelled) setHistError(true)
      })
    return () => {
      cancelled = true
    }
  }, [tab, refreshTick])

  const histSelected =
    hist?.find((h) => histKey(h) === (histSelectedId ?? (hist[0] ? histKey(hist[0]) : ''))) ?? hist?.[0] ?? null

  useEffect(() => {
    if (!histSelected) return
    let cancelled = false
    const isBackground = histFetchedRef.current === histSelected.trialId && histRows !== null
    if (!isBackground) {
      histFetchedRef.current = histSelected.trialId
      setHistRows(null)
      setHistBoardError(false)
    }
    getTrialLeaderboard({ data: histSelected.trialId })
      .then((r) => {
        if (!cancelled) {
          setHistRows(r)
          setHistBoardError(false)
        }
      })
      .catch(() => {
        if (!cancelled && !isBackground) setHistBoardError(true)
      })
    return () => {
      cancelled = true
    }
  }, [histSelected?.trialId, refreshTick]) // eslint-disable-line react-hooks/exhaustive-deps

  const histCanTeleport = histSelected?.fromX != null && histSelected?.fromZ != null

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
          border: '1px solid rgba(52, 211, 153, 0.4)',
          borderRadius: 20,
          padding: '18px 22px',
          maxWidth: 460,
          width: '94%',
          maxHeight: '88dvh',
          overflowY: 'auto',
          boxShadow: '0 20px 50px rgba(0,0,0,0.8), 0 0 25px rgba(52, 211, 153, 0.15)',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 12, fontWeight: 900, color: '#34d399', letterSpacing: 2 }}>
            CONTRE-LA-MONTRE
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

        {/* Tabs: nearby races vs. run history */}
        <div style={{ display: 'flex', gap: 6 }}>
          {(
            [
              { id: 'near', label: 'À PROXIMITÉ' },
              { id: 'mine', label: 'MES CHRONOS' },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                flex: 1,
                background: tab === t.id ? 'rgba(52, 211, 153, 0.15)' : 'rgba(255, 255, 255, 0.04)',
                border: tab === t.id ? '1px solid rgba(52, 211, 153, 0.55)' : '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: 10,
                color: tab === t.id ? '#6ee7b7' : '#94a3b8',
                fontFamily: "'Orbitron', sans-serif",
                fontSize: 10,
                fontWeight: 800,
                letterSpacing: 1.5,
                padding: '7px 0',
                cursor: 'pointer',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'near' ? (
          <>
            <div style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.5 }}>
              Roulez jusqu'au <strong style={{ color: '#34d399' }}>départ vert</strong> puis appuyez sur{' '}
              <strong style={{ color: '#fff' }}>ENTRÉE</strong> pour lancer le chrono jusqu'au{' '}
              <strong style={{ color: '#ef4444' }}>drapeau rouge</strong>.
            </div>

            {trials.length === 0 ? (
              <div style={{ color: '#94a3b8', fontSize: 12, textAlign: 'center', padding: '12px 0' }}>
                {!radarDone
                  ? 'Recherche des monuments alentour…'
                  : 'Aucun monument chronométrable dans la zone — roulez vers un quartier avec des monuments.'}
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {trials.map((t) => {
                    const best = bests[t.id]
                    const active = selected?.id === t.id
                    return (
                      <button
                        key={t.id}
                        onClick={() => setSelectedId(t.id)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          background: active ? 'rgba(52, 211, 153, 0.12)' : 'rgba(255, 255, 255, 0.03)',
                          border: active ? '1px solid rgba(52, 211, 153, 0.55)' : '1px solid rgba(255, 255, 255, 0.08)',
                          borderRadius: 12,
                          padding: '8px 12px',
                          cursor: 'pointer',
                          color: '#fff',
                          textAlign: 'left',
                          width: '100%',
                        }}
                      >
                        <span style={{ fontSize: 18 }}>⏱️</span>
                        <span style={{ display: 'flex', flexDirection: 'column', gap: 1, flex: 1, minWidth: 0 }}>
                          <span
                            style={{
                              fontSize: 12,
                              fontWeight: 800,
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {t.from.name} → {t.to.name}
                          </span>
                          <span style={{ fontSize: 10, color: '#94a3b8' }}>
                            {formatTrialDist(t.distanceM)}
                            {best !== undefined ? ` · record : ${formatTrialTime(best)}` : ' · jamais couru'}
                          </span>
                        </span>
                      </button>
                    )
                  })}
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                  }}
                >
                  <div
                    style={{
                      fontFamily: "'Orbitron', sans-serif",
                      fontSize: 9,
                      fontWeight: 800,
                      color: '#00d4ff',
                      letterSpacing: 1.5,
                    }}
                  >
                    CLASSEMENT{selected ? ` — ${selected.from.name.toUpperCase()} → ${selected.to.name.toUpperCase()}` : ''}
                  </div>
                  <button
                    onClick={() => setRefreshTick((t) => t + 1)}
                    title="Rafraîchir le classement"
                    style={{
                      background: 'rgba(0, 212, 255, 0.1)',
                      border: '1px solid rgba(0, 212, 255, 0.4)',
                      borderRadius: 8,
                      color: '#00d4ff',
                      width: 24,
                      height: 24,
                      cursor: 'pointer',
                      fontSize: 12,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    ↻
                  </button>
                </div>
                {boardError ? (
                  <div style={{ color: '#fca5a5', fontSize: 12, textAlign: 'center' }}>Classement indisponible hors-ligne.</div>
                ) : !rows ? (
                  <div style={{ color: '#94a3b8', fontSize: 12, textAlign: 'center', padding: '8px 0' }}>Chargement…</div>
                ) : rows.length === 0 ? (
                  <div style={{ color: '#94a3b8', fontSize: 12, textAlign: 'center', padding: '8px 0' }}>
                    Personne n'a couru ce chrono — soyez le premier !
                  </div>
                ) : (
                  <LeaderboardRows rows={rows} />
                )}
              </>
            )}
          </>
        ) : histError ? (
          <div style={{ color: '#fca5a5', fontSize: 12, textAlign: 'center', padding: '12px 0' }}>
            Historique indisponible hors-ligne.
          </div>
        ) : hist === null ? (
          <div style={{ color: '#94a3b8', fontSize: 12, textAlign: 'center', padding: '12px 0' }}>Chargement…</div>
        ) : hist.length === 0 ? (
          <div style={{ color: '#94a3b8', fontSize: 12, textAlign: 'center', padding: '12px 0' }}>
            Aucun chrono couru pour l'instant — finissez une course pour l'épingler ici.
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {hist.map((h) => {
                const active = histSelected && histKey(h) === histKey(histSelected)
                return (
                  <button
                    key={histKey(h)}
                    onClick={() => setHistSelectedId(histKey(h))}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      background: active ? 'rgba(52, 211, 153, 0.12)' : 'rgba(255, 255, 255, 0.03)',
                      border: active ? '1px solid rgba(52, 211, 153, 0.55)' : '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: 12,
                      padding: '8px 12px',
                      cursor: 'pointer',
                      color: '#fff',
                      textAlign: 'left',
                      width: '100%',
                    }}
                  >
                    <span style={{ fontSize: 18 }}>🏁</span>
                    <span style={{ display: 'flex', flexDirection: 'column', gap: 1, flex: 1, minWidth: 0 }}>
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 800,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {h.fromName} → {h.toName}
                      </span>
                      <span style={{ fontSize: 10, color: '#94a3b8' }}>
                        {destCity(h.destinationId)} · {formatTrialDist(h.distanceM)} · record{' '}
                        {formatTrialTime(h.bestMs)} · {h.runs} {h.runs > 1 ? 'courses' : 'course'}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>

            {histSelected && (
              <>
                {histCanTeleport && (
                  <button
                    onClick={() => {
                      if (engine.gotoTrialStart(histSelected)) onClose()
                    }}
                    title="Se téléporter au départ pour refaire ce chrono"
                    style={{
                      background: 'rgba(52, 211, 153, 0.18)',
                      border: '1px solid rgba(52, 211, 153, 0.6)',
                      borderRadius: 10,
                      color: '#6ee7b7',
                      fontFamily: "'Orbitron', sans-serif",
                      fontSize: 10,
                      fontWeight: 900,
                      letterSpacing: 2,
                      padding: '8px 0',
                      cursor: 'pointer',
                      width: '100%',
                    }}
                  >
                    📍 S'Y TÉLÉPORTER POUR REFAIRE
                  </button>
                )}
                <div
                  style={{
                    fontFamily: "'Orbitron', sans-serif",
                    fontSize: 9,
                    fontWeight: 800,
                    color: '#00d4ff',
                    letterSpacing: 1.5,
                  }}
                >
                  CLASSEMENT — {histSelected.fromName.toUpperCase()} → {histSelected.toName.toUpperCase()}
                </div>
                {histBoardError ? (
                  <div style={{ color: '#fca5a5', fontSize: 12, textAlign: 'center' }}>Classement indisponible hors-ligne.</div>
                ) : !histRows ? (
                  <div style={{ color: '#94a3b8', fontSize: 12, textAlign: 'center', padding: '8px 0' }}>Chargement…</div>
                ) : histRows.length === 0 ? (
                  <div style={{ color: '#94a3b8', fontSize: 12, textAlign: 'center', padding: '8px 0' }}>
                    Aucun temps sur ce chrono.
                  </div>
                ) : (
                  <LeaderboardRows rows={histRows} />
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
