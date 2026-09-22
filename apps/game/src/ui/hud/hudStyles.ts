import type React from 'react'

export const flightLabelStyle: React.CSSProperties = {
  fontFamily: "'Inter', sans-serif",
  fontSize: 8,
  fontWeight: 700,
  color: '#00d4ff',
  letterSpacing: 1.2,
}

/** Single shared look for every burger-menu button (grid + rows + toggles). */
export const menuButtonStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  background: 'rgba(255, 255, 255, 0.05)',
  border: '1px solid rgba(0, 212, 255, 0.3)',
  borderRadius: 12,
  padding: '10px 12px',
  cursor: 'pointer',
  color: '#ffffff',
  textAlign: 'left',
  width: '100%',
}

export const menuButtonIconStyle: React.CSSProperties = {
  fontSize: 20,
  flexShrink: 0,
}

export const menuButtonTitleStyle: React.CSSProperties = {
  fontFamily: "'Orbitron', sans-serif",
  fontSize: 10,
  fontWeight: 800,
  color: '#00d4ff',
}

export const menuButtonHintStyle: React.CSSProperties = {
  fontSize: 8,
  color: '#94a3b8',
}

export const flightUnitStyle: React.CSSProperties = {
  fontFamily: "'Inter', sans-serif",
  fontSize: 8,
  fontWeight: 700,
  color: 'rgba(148, 163, 184, 0.9)',
  letterSpacing: 1,
}

export const alertBannerStyle: React.CSSProperties = {
  position: 'absolute',
  left: '50%',
  transform: 'translateX(-50%)',
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  background: 'rgba(40, 8, 8, 0.86)',
  border: '1px solid rgba(239, 68, 68, 0.85)',
  borderRadius: 16,
  padding: '8px 20px',
  boxShadow: '0 8px 30px rgba(0,0,0,0.6), 0 0 24px rgba(239, 68, 68, 0.45)',
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  pointerEvents: 'none',
  userSelect: 'none',
  zIndex: 40,
  whiteSpace: 'nowrap',
}
