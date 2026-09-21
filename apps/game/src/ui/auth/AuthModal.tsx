import { useState } from 'react'
import { authClient } from '../../lib/auth-client.js'
import { getMyProfile, saveDisplayName } from '../../server/profile.js'
import { persistCurrentState } from '../../services/profileSync.js'
import type { GameEngine } from '../../game/GameEngine.js'

interface AuthModalProps {
  engine: GameEngine
  onClose: () => void
}

type Mode = 'login' | 'signup'

function modalStyle(): React.CSSProperties {
  return {
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
  }
}

function panelStyle(): React.CSSProperties {
  return {
    background: 'rgba(15, 23, 42, 0.95)',
    border: '1px solid rgba(0, 212, 255, 0.4)',
    borderRadius: 20,
    padding: '18px 22px',
    maxWidth: 400,
    width: '92%',
    boxShadow: '0 20px 50px rgba(0,0,0,0.8), 0 0 25px rgba(0, 212, 255, 0.2)',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    maxHeight: '90dvh',
    overflowY: 'auto',
  }
}

function inputStyle(): React.CSSProperties {
  return {
    width: '100%',
    background: 'rgba(255, 255, 255, 0.06)',
    border: '1px solid rgba(255, 255, 255, 0.15)',
    borderRadius: 10,
    padding: '9px 12px',
    color: '#fff',
    fontFamily: "'Inter', sans-serif",
    fontSize: 13,
    outline: 'none',
    boxSizing: 'border-box',
  }
}

function primaryButtonStyle(disabled: boolean): React.CSSProperties {
  return {
    width: '100%',
    background: disabled ? 'rgba(0, 212, 255, 0.25)' : 'linear-gradient(90deg, #00b4d8, #0088ff)',
    border: 'none',
    borderRadius: 10,
    padding: '10px 12px',
    color: '#fff',
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: 1.5,
    cursor: disabled ? 'wait' : 'pointer',
  }
}

function ghostButtonStyle(): React.CSSProperties {
  return {
    width: '100%',
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.15)',
    borderRadius: 10,
    padding: '9px 12px',
    color: '#e2e8f0',
    fontFamily: "'Inter', sans-serif",
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  }
}

function labelStyle(): React.CSSProperties {
  return {
    fontFamily: "'Inter', sans-serif",
    fontSize: 10,
    fontWeight: 700,
    color: '#94a3b8',
    letterSpacing: 1,
    textTransform: 'uppercase',
  }
}

export function AuthModal({ engine, onClose }: AuthModalProps) {
  const { data: session, isPending } = authClient.useSession()
  const user = session?.user as { name?: string; email?: string; isAnonymous?: boolean | null } | undefined
  const isGuest = !user || user.isAnonymous === true || user.isAnonymous === null

  return (
    <div style={modalStyle()} onClick={onClose}>
      <div style={panelStyle()} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 12, fontWeight: 900, color: '#00d4ff', letterSpacing: 2 }}>
            COMPTE PILOTE
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

        {isPending ? (
          <div style={{ color: '#94a3b8', fontSize: 13, textAlign: 'center', padding: '12px 0' }}>
            Chargement de la session…
          </div>
        ) : isGuest ? (
          <GuestPanel engine={engine} onDone={onClose} />
        ) : (
          <MemberPanel engine={engine} name={user?.name ?? ''} email={user?.email ?? ''} onDone={onClose} />
        )}
      </div>
    </div>
  )
}

function GuestPanel({ engine, onDone }: { engine: GameEngine; onDone: () => void }) {
  const [mode, setMode] = useState<Mode>('signup')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      if (mode === 'signup') {
        if (name.trim().length < 2) throw new Error('Choisis un pseudo (2 caractères min).')
        const res = await authClient.signUp.email({
          name: name.trim(),
          email: email.trim(),
          password,
          callbackURL: window.location.origin,
        })
        if (res.error) throw new Error(res.error.message ?? 'Inscription impossible.')
        // New permanent account: carry the guest's current progress over.
        await persistCurrentState(engine)
      } else {
        const res = await authClient.signIn.email({
          email: email.trim(),
          password,
          callbackURL: window.location.origin,
        })
        if (res.error) throw new Error(res.error.message ?? 'Connexion impossible.')
        // Existing account without a save yet: start from the current state.
        const existing = await getMyProfile().catch(() => null)
        if (!existing) await persistCurrentState(engine)
      }
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div
        style={{
          background: 'rgba(251, 191, 36, 0.08)',
          border: '1px solid rgba(251, 191, 36, 0.35)',
          borderRadius: 12,
          padding: '10px 12px',
          fontSize: 12,
          color: '#fde68a',
          lineHeight: 1.5,
        }}
      >
        👤 <strong>Mode invité</strong> — ton spawn et tes réglages sont sauvegardés. Crée un compte pour les
        retrouver sur tous tes appareils.
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        {(['signup', 'login'] as Mode[]).map((m) => (
          <button
            key={m}
            onClick={() => {
              setMode(m)
              setError(null)
            }}
            style={{
              flex: 1,
              background: mode === m ? 'rgba(0, 212, 255, 0.15)' : 'rgba(255,255,255,0.04)',
              border: mode === m ? '1px solid rgba(0, 212, 255, 0.6)' : '1px solid rgba(255,255,255,0.1)',
              borderRadius: 10,
              padding: '8px 0',
              color: mode === m ? '#00d4ff' : '#94a3b8',
              fontFamily: "'Orbitron', sans-serif",
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: 1,
              cursor: 'pointer',
            }}
          >
            {m === 'signup' ? 'CRÉER UN COMPTE' : 'SE CONNECTER'}
          </button>
        ))}
      </div>

      {mode === 'signup' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={labelStyle()}>Pseudo</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex : SpeedRacer"
            maxLength={40}
            style={inputStyle()}
          />
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={labelStyle()}>Email</span>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="pilote@exemple.fr"
          type="email"
          autoComplete="email"
          style={inputStyle()}
        />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={labelStyle()}>Mot de passe (8 caractères min)</span>
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          type="password"
          autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
          style={inputStyle()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submit()
          }}
        />
      </div>

      {error && (
        <div
          style={{
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.4)',
            borderRadius: 10,
            padding: '8px 12px',
            fontSize: 12,
            color: '#fca5a5',
          }}
        >
          {error}
        </div>
      )}

      <button onClick={() => void submit()} disabled={busy} style={primaryButtonStyle(busy)}>
        {busy ? '…' : mode === 'signup' ? "CRÉER MON COMPTE" : 'SE CONNECTER'}
      </button>
    </>
  )
}

function MemberPanel({
  engine,
  name,
  email,
  onDone,
}: {
  engine: GameEngine
  name: string
  email: string
  onDone: () => void
}) {
  const [displayName, setDisplayName] = useState(name)
  const [saving, setSaving] = useState(false)
  const [savedTick, setSavedTick] = useState(false)
  const [busy, setBusy] = useState(false)

  const saveName = async () => {
    const clean = displayName.trim()
    if (clean.length < 2) return
    setSaving(true)
    try {
      await saveDisplayName({ data: clean })
      setSavedTick(true)
      setTimeout(() => setSavedTick(false), 1500)
    } catch {
      // ignore transient failures
    } finally {
      setSaving(false)
    }
  }

  const logout = async () => {
    setBusy(true)
    try {
      // Save before leaving, then fall back to a fresh guest session.
      await persistCurrentState(engine)
      await authClient.signOut()
      await authClient.signIn.anonymous()
    } finally {
      setBusy(false)
      onDone()
    }
  }

  return (
    <>
      <div
        style={{
          background: 'rgba(52, 211, 153, 0.08)',
          border: '1px solid rgba(52, 211, 153, 0.35)',
          borderRadius: 12,
          padding: '10px 12px',
          fontSize: 12,
          color: '#a7f3d0',
          lineHeight: 1.5,
        }}
      >
        ✅ <strong>Connecté{email.includes('@') ? '' : 'e'}</strong> — spawn et réglages synchronisés sur ton compte.
        <div style={{ color: '#6ee7b7', opacity: 0.8, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {email}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={labelStyle()}>Pseudo pilote</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={40}
            style={inputStyle()}
          />
          <button
            onClick={() => void saveName()}
            disabled={saving}
            style={{
              background: 'rgba(0, 212, 255, 0.15)',
              border: '1px solid rgba(0, 212, 255, 0.5)',
              borderRadius: 10,
              padding: '0 14px',
              color: '#00d4ff',
              fontFamily: "'Orbitron', sans-serif",
              fontSize: 10,
              fontWeight: 800,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {savedTick ? '✓' : saving ? '…' : 'OK'}
          </button>
        </div>
      </div>

      <button onClick={() => void logout()} disabled={busy} style={ghostButtonStyle()}>
        {busy ? '…' : 'Se déconnecter (retour invité)'}
      </button>
    </>
  )
}
