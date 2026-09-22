import { formatTrialTime, TRIAL_START_RADIUS_M, type TrialStatus } from '../../lib/trials.js'
import { useLocale } from '../../i18n/index.js'

interface TrialWidgetsProps {
  status: TrialStatus
  submit: { timeMs: number; bestMs: number; isRecord: boolean; offline?: boolean } | null
  touchMode: boolean
  onAbort: () => void
}

function pillStyle(touchMode: boolean): React.CSSProperties {
  return {
    position: 'absolute',
    top: touchMode ? 48 : 58,
    left: '50%',
    transform: 'translateX(-50%)',
    background: 'rgba(10, 16, 28, 0.85)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    border: '1px solid rgba(52, 211, 153, 0.45)',
    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4), 0 0 14px rgba(52, 211, 153, 0.2)',
    borderRadius: 14,
    padding: touchMode ? '5px 14px' : '7px 18px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 2,
    pointerEvents: 'none',
    userSelect: 'none',
    zIndex: 60,
    maxWidth: '92vw',
    whiteSpace: 'nowrap',
  }
}

export function TrialWidgets({ status, submit, touchMode, onAbort }: TrialWidgetsProps) {
  const { t } = useLocale()
  if (status.phase === 'idle') {
    // Discovery lives on the minimap (all starts) + the in-zone ENTRÉE chip:
    // no idle guidance message.
    return null
  }

  if (status.phase === 'countdown') {
    return (
      <div
        style={{
          position: 'absolute',
          top: '30%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 4,
          pointerEvents: 'none',
          userSelect: 'none',
          zIndex: 60,
        }}
      >
        <span
          style={{
            fontFamily: "'Orbitron', sans-serif",
            fontSize: touchMode ? 64 : 84,
            fontWeight: 900,
            color: '#fff',
            textShadow: '0 0 30px rgba(52, 211, 153, 0.8)',
            lineHeight: 1,
          }}
        >
          {Math.ceil(status.countdownS)}
        </span>
        <span
          style={{
            fontFamily: "'Orbitron', sans-serif",
            fontSize: touchMode ? 10 : 12,
            fontWeight: 800,
            letterSpacing: 3,
            color: '#6ee7b7',
          }}
        >
          {status.active ? `${status.active.from.name.toUpperCase()} → ${status.active.to.name.toUpperCase()}` : t('trial_get_ready')}
        </span>
      </div>
    )
  }

  if (status.phase === 'running' && status.active) {
    return (
      <div style={{ ...pillStyle(touchMode), pointerEvents: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            style={{
              fontFamily: "'Orbitron', sans-serif",
              fontSize: touchMode ? 18 : 22,
              fontWeight: 900,
              color: '#fff',
              textShadow: '0 0 14px rgba(52, 211, 153, 0.6)',
              lineHeight: 1,
            }}
          >
            {formatTrialTime(status.elapsedMs)}
          </span>
          <button
            onClick={onAbort}
            style={{
              pointerEvents: 'auto',
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: 8,
              color: '#fff',
              width: 24,
              height: 24,
              cursor: 'pointer',
              fontSize: 11,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            title={t('trial_abort_title')}
          >
            ✕
          </button>
        </div>
        <span style={{ fontFamily: "'Inter', sans-serif", fontSize: touchMode ? 9 : 11, color: '#94a3b8' }}>
          {t('trial_running_remain', { name: status.active.to.name, dist: Math.round(status.remainingM) })}
        </span>
      </div>
    )
  }

  if (status.phase === 'finished' && status.lastResult) {
    const timeMs = submit?.timeMs ?? status.lastResult.timeMs
    return (
      <div
        style={{
          position: 'absolute',
          top: '34%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 6,
          background: 'rgba(10, 16, 28, 0.9)',
          border: '1px solid rgba(251, 191, 36, 0.6)',
          boxShadow: '0 8px 30px rgba(0,0,0,0.6), 0 0 24px rgba(251, 191, 36, 0.35)',
          borderRadius: 18,
          padding: touchMode ? '10px 22px' : '14px 32px',
          pointerEvents: 'none',
          userSelect: 'none',
          zIndex: 60,
        }}
      >
        <span style={{ fontSize: touchMode ? 22 : 28 }}>🏁</span>
        <span
          style={{
            fontFamily: "'Orbitron', sans-serif",
            fontSize: touchMode ? 26 : 34,
            fontWeight: 900,
            color: '#fff',
            textShadow: '0 0 18px rgba(251, 191, 36, 0.6)',
            lineHeight: 1,
          }}
        >
          {formatTrialTime(timeMs)}
        </span>
        <span
          style={{
            fontFamily: "'Orbitron', sans-serif",
            fontSize: touchMode ? 9 : 11,
            fontWeight: 800,
            letterSpacing: 2,
            color: submit?.isRecord ? '#fbbf24' : '#94a3b8',
            animation: submit?.isRecord ? 'hudFlash 0.5s ease-in-out infinite alternate' : undefined,
          }}
        >
          {submit ? (submit.isRecord ? t('trial_new_record') : t('trial_record_is', { time: formatTrialTime(submit.bestMs) })) : t('trial_sending_time')}
        </span>
        {submit?.offline && (
          <span
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: touchMode ? 9 : 11,
              fontWeight: 700,
              color: '#fbbf24',
            }}
          >
            {t('trial_offline_saved')}
          </span>
        )}
        <span style={{ fontFamily: "'Inter', sans-serif", fontSize: touchMode ? 9 : 11, color: 'rgba(255,255,255,0.7)' }}>
          {t('trial_continue_hint', { from: status.lastResult.trial.from.name, to: status.lastResult.trial.to.name })}
        </span>
      </div>
    )
  }

  return null
}
