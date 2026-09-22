import { useEffect, useState } from 'react'
import type { GameEngine } from '../../game/GameEngine.js'
import {
  formatTrialDist,
  formatTrialTime,
  TRIAL_START_RADIUS_M,
  type TrialDef,
} from '../../lib/trials.js'
import { getLocalTrialBests, isOnlineMode, subscribeOnlineMode } from '../../lib/connectivity.js'
import { getTrialLeaderboard, type TrialLeaderboardRow } from '../../server/trials.js'

interface TrialStartPanelProps {
  engine: GameEngine
  proposal: TrialDef
  distToStartM: number
  touchMode: boolean
}

function rankIcon(rank: number): string {
  if (rank === 1) return '🥇'
  if (rank === 2) return '🥈'
  if (rank === 3) return '🥉'
  return `${rank}`
}

/**
 * Full panel within the start zone: every destination from this beacon,
 * shortest first (≤3km by construction), each with its top-3 times.
 * The highlighted race is selectable (click / keys 1-6); ENTRÉE or the
 * DÉPART button starts it.
 */
export function TrialStartPanel({ engine, proposal, distToStartM, touchMode }: TrialStartPanelProps) {
  const [trials, setTrials] = useState<TrialDef[]>([])
  const [tops, setTops] = useState<Record<string, TrialLeaderboardRow[]>>({})
  // Ids whose leaderboard fetch failed (vs. genuinely empty): shown as
  // "indisponible" with a manual retry button.
  const [topsErr, setTopsErr] = useState<Record<string, boolean>>({})
  const [selectedId, setSelectedId] = useState<string | null>(proposal.id)
  // Manual retry counter — the only refetch trigger besides beacon change.
  const [retryTick, setRetryTick] = useState(0)
  // Bumped when the online/offline mode flips while the panel is open, so
  // the display switches between server times and local records.
  const [modeTick, setModeTick] = useState(0)
  const fromId = proposal.from.id

  // Race list for this beacon — computed ONCE when the panel appears (mount
  // / beacon change). Deterministic per beacon (see getBeaconTrials): every
  // player at the same beacon lists the same races.
  useEffect(() => {
    let list: TrialDef[] = []
    try {
      list = engine.getBeaconTrials(fromId, 6)
    } catch {
      list = []
    }
    setTrials(list)
    if (list.length === 0) {
      setTops({})
      setTopsErr({})
      setSelectedId(null)
      engine.setTrialSelection(null)
      return
    }
    // Default selection: the proposal (shortest), so ENTRÉE behaves as before.
    const first = list[0]!
    setSelectedId(first.id)
    engine.setTrialSelection(first)
    // Reset tops for the new beacon so stale times aren't shown, then fetch.
    setTops({})
    setTopsErr({})
  }, [engine, fromId])

  // Top-3 per race — ONE plain HTTP flight when the panel appears (or on
  // manual retry). No polling, no focus refetch, no socket. Offline: local
  // records only, zero network.
  useEffect(() => {
    if (trials.length === 0) return
    if (!isOnlineMode()) {
      const bests = getLocalTrialBests()
      const map: Record<string, TrialLeaderboardRow[]> = {}
      for (const t of trials) {
        const b = bests[t.id]
        map[t.id] = b !== undefined ? [{ rank: 1, label: 'Record local', timeMs: b, you: true }] : []
      }
      setTops(map)
      setTopsErr({})
      return
    }
    let cancelled = false
    const list = trials
    const ids = list.map((t) => t.id)
    function withTimeout<T>(p: Promise<T>, ms = 10000): Promise<T | null> {
      let timer: ReturnType<typeof setTimeout> | undefined
      const timeout = new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), ms)
      })
      // Clear the timer when the request settles first (no timer leak, no
      // stray wakeup after unmount).
      return Promise.race([p.finally(() => clearTimeout(timer)), timeout])
    }
    // try/catch: a synchronously-throwing RPC stub (broken import, bad state)
    // would otherwise escape the effect and stick the UI on loading forever.
    try {
      Promise.all(
        list.map((t) =>
          withTimeout(getTrialLeaderboard({ data: t.id }))
            .then((rows) =>
              rows === null
                ? { id: t.id, ok: false as const, rows: [] as TrialLeaderboardRow[] }
                : { id: t.id, ok: true as const, rows: rows.slice(0, 3) },
            )
            .catch(() => ({ id: t.id, ok: false as const, rows: [] as TrialLeaderboardRow[] })),
        ),
      ).then((all) => {
        if (cancelled) return
        const map: Record<string, TrialLeaderboardRow[]> = {}
        const errs: Record<string, boolean> = {}
        for (const r of all) {
          if (r.ok) map[r.id] = r.rows
          else errs[r.id] = true
        }
        // Safety net: every ok id gets an entry (empty = "Aucun temps"), so
        // the UI can never stay stuck on "Chargement des temps…".
        for (const id of ids) {
          if (!(id in map) && !errs[id]) map[id] = []
        }
        setTops((prev) => {
          const next = { ...prev }
          for (const id of ids) {
            if (id in map) next[id] = map[id]!
            // Failed ids keep their previous rows (stale beats empty).
          }
          return next
        })
        setTopsErr((prev) => {
          const next = { ...prev }
          for (const id of ids) {
            if (errs[id]) next[id] = true
            else if (id in map) delete next[id]
          }
          return next
        })
      })
    } catch {
      if (cancelled) return
      // Synchronously-broken RPC: flag everything, retried next tick.
      const errs: Record<string, boolean> = {}
      for (const id of ids) errs[id] = true
      setTopsErr((prev) => ({ ...prev, ...errs }))
    }
    return () => {
      cancelled = true
    }
  }, [trials, retryTick, modeTick])

  useEffect(() => subscribeOnlineMode(() => setModeTick((t) => t + 1)), [])

  const select = (trial: TrialDef) => {
    setSelectedId(trial.id)
    engine.setTrialSelection(trial)
  }

  // Keys 1-6 pick a race (free: digits aren't driving controls). Ignored
  // while typing in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return
      const el = document.activeElement
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return
      const n = e.key >= '1' && e.key <= '9' ? Number(e.key) : NaN
      if (Number.isInteger(n) && n >= 1 && n <= trials.length) {
        select(trials[n - 1]!)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [engine, trials]) // eslint-disable-line react-hooks/exhaustive-deps

  const inZone = distToStartM <= TRIAL_START_RADIUS_M

  return (
    <div
      style={{
        position: 'absolute',
        top: touchMode ? 48 : 58,
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'rgba(10, 16, 28, 0.88)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: '1px solid rgba(52, 211, 153, 0.45)',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4), 0 0 14px rgba(52, 211, 153, 0.2)',
        borderRadius: 14,
        padding: touchMode ? '6px 14px' : '8px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        pointerEvents: 'none',
        userSelect: 'none',
        zIndex: 60,
        width: touchMode ? 300 : 340,
        maxHeight: '44dvh',
        overflowY: 'auto',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
        <span style={{ fontFamily: "'Inter', sans-serif", fontSize: touchMode ? 11 : 13, fontWeight: 800, color: '#fff' }}>
          ⏱️ Départ : {proposal.from.name}
        </span>
        {inZone ? (
          <span
            style={{
              fontFamily: "'Orbitron', sans-serif",
              fontSize: touchMode ? 10 : 12,
              fontWeight: 900,
              letterSpacing: 2,
              color: '#6ee7b7',
              animation: 'hudFlash 0.5s ease-in-out infinite alternate',
            }}
          >
            APPUYEZ SUR ENTRÉE
          </span>
        ) : (
          <span style={{ fontFamily: "'Inter', sans-serif", fontSize: touchMode ? 9 : 11, color: '#94a3b8' }}>
            À {Math.round(distToStartM)} m — roulez-y !
          </span>
        )}
        {trials.length > 1 && (
          <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 9, color: '#64748b' }}>
            Clic ou touches 1-{Math.min(trials.length, 9)} pour choisir la course
          </span>
        )}
      </div>

      {trials.map((t, i) => {
        const top = tops[t.id]
        const failed = topsErr[t.id] === true && top === undefined
        const isSel = selectedId === t.id
        return (
          <div
            key={t.id}
            onClick={() => select(t)}
            title="Choisir cette course"
            style={{
              background: isSel ? 'rgba(52, 211, 153, 0.1)' : 'rgba(255, 255, 255, 0.03)',
              border: isSel ? '1px solid rgba(52, 211, 153, 0.45)' : '1px solid rgba(255, 255, 255, 0.07)',
              borderRadius: 10,
              padding: '6px 10px',
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
              pointerEvents: 'auto',
              cursor: 'pointer',
              userSelect: 'none',
            }}
          >
            <span style={{ fontSize: touchMode ? 11 : 12, fontWeight: 800, color: '#e2e8f0' }}>
              {isSel ? '▶ ' : ''}
              {trials.length > 1 ? `${i + 1}. ` : ''}→ {t.to.name} · {formatTrialDist(t.distanceM)}
            </span>
            {!top && !failed ? (
              <span style={{ fontSize: 10, color: '#64748b' }}>Chargement des temps…</span>
            ) : failed ? (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setRetryTick((t) => t + 1)
                }}
                title="Réessayer le chargement du classement"
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  fontSize: 10,
                  color: '#fbbf24',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                Classement indisponible — réessayer ↻
              </button>
            ) : top!.length === 0 ? (
              <span style={{ fontSize: 10, color: '#64748b' }}>Aucun temps — à vous !</span>
            ) : (
              top!.map((r) => (
                <span
                  key={r.rank}
                  style={{
                    fontSize: 10,
                    color: r.you ? '#7dd3fc' : '#94a3b8',
                    fontWeight: r.you ? 800 : 400,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {rankIcon(r.rank)} {formatTrialTime(r.timeMs)} · {r.label}
                  {r.you ? ' (vous)' : ''}
                </span>
              ))
            )}
            {isSel && inZone && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  engine.startTrial(t)
                }}
                style={{
                  marginTop: 4,
                  background: 'rgba(52, 211, 153, 0.18)',
                  border: '1px solid rgba(52, 211, 153, 0.6)',
                  borderRadius: 8,
                  color: '#6ee7b7',
                  fontFamily: "'Orbitron', sans-serif",
                  fontSize: 10,
                  fontWeight: 900,
                  letterSpacing: 2,
                  padding: '5px 0',
                  cursor: 'pointer',
                  width: '100%',
                }}
              >
                ▶ DÉPART
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
