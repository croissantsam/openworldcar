import React, { useState } from 'react'
import {
  WORLD_DESTINATIONS,
  createCustomDestination,
  type WorldDestination,
} from '../world/destinations.js'
import { AddressSearchBar } from './AddressSearchBar.js'

interface WorldTravelModalProps {
  isOpen: boolean
  onClose: () => void
  currentDestinationId: string
  onSelectDestination: (destination: WorldDestination) => void
}

export const WorldTravelModal: React.FC<WorldTravelModalProps> = ({
  isOpen,
  onClose,
  currentDestinationId,
  onSelectDestination,
}) => {
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'france' | 'europe' | 'international'>('all')
  const [showCustomGps, setShowCustomGps] = useState(false)
  const [customLat, setCustomLat] = useState('')
  const [customLon, setCustomLon] = useState('')
  const [customName, setCustomName] = useState('')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  if (!isOpen) return null

  const filtered = WORLD_DESTINATIONS.filter((d) => {
    if (selectedFilter === 'france') return d.country === 'France'
    if (selectedFilter === 'europe') return ['France', 'Royaume-Uni', 'Italie', 'Allemagne'].includes(d.country)
    if (selectedFilter === 'international') return !['France'].includes(d.country)
    return true
  })

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const lat = parseFloat(customLat.trim().replace(',', '.'))
    const lon = parseFloat(customLon.trim().replace(',', '.'))

    if (isNaN(lat) || lat < -90 || lat > 90) {
      setErrorMsg('Veuillez saisir une latitude valide entre -90 et 90.')
      return
    }
    if (isNaN(lon) || lon < -180 || lon > 180) {
      setErrorMsg('Veuillez saisir une longitude valide entre -180 et 180.')
      return
    }

    setErrorMsg(null)
    const customDest = createCustomDestination(lat, lon, customName)
    onSelectDestination(customDest)
    onClose()
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(5, 8, 18, 0.82)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        animation: 'fadeIn 0.25s ease-out',
        padding: '24px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '1020px',
          maxHeight: '92vh',
          backgroundColor: 'rgba(15, 23, 42, 0.95)',
          border: '1px solid rgba(56, 189, 248, 0.25)',
          borderRadius: '24px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.85), 0 0 40px rgba(56, 189, 248, 0.18)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
          color: '#f8fafc',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '22px 32px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'linear-gradient(180deg, rgba(30, 41, 59, 0.6) 0%, rgba(15, 23, 42, 0) 100%)',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '24px' }}>🌍</span>
              <h2
                style={{
                  margin: 0,
                  fontSize: '22px',
                  fontWeight: 800,
                  letterSpacing: '0.04em',
                  background: 'linear-gradient(135deg, #ffffff 0%, #38bdf8 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                VOYAGE MONDIAL & GÉNÉRATION EN DIRECT
              </h2>
            </div>
            <p style={{ margin: '6px 0 0', fontSize: '13px', color: '#94a3b8' }}>
              Explorez les métropoles mondiales et générez de nouveaux chunks OpenStreetMap en temps réel pendant que vous roulez.
            </p>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              color: '#94a3b8',
              width: '36px',
              height: '36px',
              borderRadius: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '18px',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = '#fff'
              e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)'
              e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.4)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = '#94a3b8'
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)'
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.12)'
            }}
          >
            ✕
          </button>
        </div>

        {/* Live Address Search Section */}
        <div
          style={{
            padding: '16px 32px 14px',
            background: 'linear-gradient(180deg, rgba(30, 41, 59, 0.4) 0%, rgba(15, 23, 42, 0.3) 100%)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          }}
        >
          <div style={{ marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#38bdf8', letterSpacing: '0.06em' }}>
              📍 RECHERCHER UNE ADRESSE DANS LE MONDE (OPENSTREETMAP) :
            </span>
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>
              Streaming 100% procédural au fur et à mesure
            </span>
          </div>
          <AddressSearchBar
            autoFocus
            placeholder="Saisissez une adresse, rue ou monument (ex: 10 rue de la Paix, Tour Eiffel, Times Square)..."
            onSelectAddress={(dest) => {
              onSelectDestination(dest)
              onClose()
            }}
          />
        </div>

        {/* Action / Filter Bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 32px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          {/* Destination filter buttons */}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {(
              [
                { id: 'all', label: `Toutes (${WORLD_DESTINATIONS.length})` },
                { id: 'france', label: '🇫🇷 France (3)' },
                { id: 'europe', label: '🇪🇺 Europe (5)' },
                { id: 'international', label: '🌐 International (8)' },
              ] as const
            ).map((filter) => (
              <button
                key={filter.id}
                onClick={() => {
                  setSelectedFilter(filter.id)
                  setShowCustomGps(false)
                }}
                style={{
                  background:
                    selectedFilter === filter.id && !showCustomGps
                      ? 'rgba(56, 189, 248, 0.2)'
                      : 'rgba(255, 255, 255, 0.04)',
                  border:
                    selectedFilter === filter.id && !showCustomGps
                      ? '1px solid rgba(56, 189, 248, 0.5)'
                      : '1px solid rgba(255, 255, 255, 0.08)',
                  color: selectedFilter === filter.id && !showCustomGps ? '#38bdf8' : '#94a3b8',
                  borderRadius: '9999px',
                  padding: '6px 14px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                {filter.label}
              </button>
            ))}
          </div>

          {/* Toggle Custom GPS Button */}
          <button
            onClick={() => setShowCustomGps((v) => !v)}
            style={{
              background: showCustomGps
                ? 'linear-gradient(135deg, #0284c7 0%, #2563eb 100%)'
                : 'rgba(56, 189, 248, 0.1)',
              border: showCustomGps
                ? '1px solid #38bdf8'
                : '1px solid rgba(56, 189, 248, 0.3)',
              color: showCustomGps ? '#ffffff' : '#38bdf8',
              borderRadius: '9999px',
              padding: '6px 14px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.2s',
            }}
          >
            <span>🧭 Coordonnées GPS Libres</span>
            <span>{showCustomGps ? '▲' : '▼'}</span>
          </button>
        </div>

        {/* Custom GPS Teleport Form Drawer */}
        {showCustomGps && (
          <div
            style={{
              background: 'rgba(2, 6, 23, 0.85)',
              borderBottom: '1px solid rgba(56, 189, 248, 0.25)',
              padding: '20px 32px',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
              animation: 'fadeIn 0.2s ease-out',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '18px' }}>🚀</span>
              <span style={{ fontSize: '14px', fontWeight: 700, color: '#e2e8f0' }}>
                Téléportation & Génération en temps réel n'importe où sur Terre
              </span>
            </div>

            <form
              onSubmit={handleCustomSubmit}
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr)) 180px',
                gap: '12px',
                alignItems: 'end',
              }}
            >
              <div>
                <label style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginBottom: '4px', fontWeight: 600 }}>
                  LATITUDE (-90° à +90°)
                </label>
                <input
                  type="text"
                  placeholder="Ex: 48.8584"
                  value={customLat}
                  onChange={(e) => setCustomLat(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    background: 'rgba(30, 41, 59, 0.6)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#fff',
                    fontSize: '13px',
                    fontFamily: 'monospace',
                    boxSizing: 'border-box',
                    outline: 'none',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginBottom: '4px', fontWeight: 600 }}>
                  LONGITUDE (-180° à +180°)
                </label>
                <input
                  type="text"
                  placeholder="Ex: 2.2945"
                  value={customLon}
                  onChange={(e) => setCustomLon(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    background: 'rgba(30, 41, 59, 0.6)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#fff',
                    fontSize: '13px',
                    fontFamily: 'monospace',
                    boxSizing: 'border-box',
                    outline: 'none',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginBottom: '4px', fontWeight: 600 }}>
                  NOM DU LIEU (OPTIONNEL)
                </label>
                <input
                  type="text"
                  placeholder="Ex: Mon Quartier, Circuit..."
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    background: 'rgba(30, 41, 59, 0.6)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#fff',
                    fontSize: '13px',
                    boxSizing: 'border-box',
                    outline: 'none',
                  }}
                />
              </div>

              <button
                type="submit"
                style={{
                  padding: '10px 18px',
                  borderRadius: '10px',
                  border: 'none',
                  background: 'linear-gradient(135deg, #0284c7 0%, #2563eb 100%)',
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: '13px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  boxShadow: '0 4px 14px rgba(2, 132, 199, 0.4)',
                  height: '38px',
                }}
              >
                <span>Téléporter & Rouler</span>
                <span>⚡</span>
              </button>
            </form>

            {errorMsg && (
              <div style={{ color: '#f87171', fontSize: '12px', fontWeight: 600 }}>
                ⚠️ {errorMsg}
              </div>
            )}
          </div>
        )}

        {/* Destination Cards Grid */}
        <div
          style={{
            padding: '20px 32px 32px',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '16px',
            overflowY: 'auto',
            maxHeight: 'calc(92vh - 220px)',
          }}
        >
          {filtered.map((dest) => {
            const isCurrent = dest.id === currentDestinationId
            return (
              <div
                key={dest.id}
                style={{
                  background: isCurrent
                    ? 'linear-gradient(145deg, rgba(30, 58, 138, 0.4) 0%, rgba(15, 23, 42, 0.7) 100%)'
                    : 'rgba(30, 41, 59, 0.4)',
                  border: isCurrent
                    ? '1.5px solid #38bdf8'
                    : '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '18px',
                  padding: '18px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  boxShadow: isCurrent ? '0 0 24px rgba(56, 189, 248, 0.3)' : 'none',
                  transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                  position: 'relative',
                  overflow: 'hidden',
                }}
                onMouseEnter={(e) => {
                  if (!isCurrent) {
                    e.currentTarget.style.borderColor = 'rgba(56, 189, 248, 0.45)'
                    e.currentTarget.style.transform = 'translateY(-2px)'
                    e.currentTarget.style.boxShadow = '0 10px 25px -5px rgba(0, 0, 0, 0.5)'
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isCurrent) {
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)'
                    e.currentTarget.style.transform = 'translateY(0)'
                    e.currentTarget.style.boxShadow = 'none'
                  }
                }}
              >
                <div>
                  {/* Top Row: Flag & Country Badge */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '10px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '24px' }}>{dest.flag}</span>
                      <span
                        style={{
                          fontSize: '11px',
                          textTransform: 'uppercase',
                          fontWeight: 700,
                          color: '#64748b',
                          letterSpacing: '0.08em',
                        }}
                      >
                        {dest.country}
                      </span>
                    </div>

                    {isCurrent ? (
                      <span
                        style={{
                          background: 'rgba(34, 197, 94, 0.2)',
                          color: '#4ade80',
                          border: '1px solid rgba(34, 197, 94, 0.4)',
                          fontSize: '11px',
                          fontWeight: 700,
                          padding: '3px 8px',
                          borderRadius: '8px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <span
                          style={{
                            width: '6px',
                            height: '6px',
                            borderRadius: '50%',
                            background: '#4ade80',
                            boxShadow: '0 0 6px #4ade80',
                          }}
                        />
                        ACTUEL
                      </span>
                    ) : (
                      <span
                        style={{
                          fontSize: '11px',
                          color: '#94a3b8',
                          fontFamily: 'monospace',
                          background: 'rgba(255, 255, 255, 0.05)',
                          padding: '2px 6px',
                          borderRadius: '6px',
                        }}
                      >
                        {dest.origin.latitude.toFixed(3)}°, {dest.origin.longitude.toFixed(3)}°
                      </span>
                    )}
                  </div>

                  {/* City & Name */}
                  <h3
                    style={{
                      margin: '0 0 6px',
                      fontSize: '16px',
                      fontWeight: 700,
                      color: '#f1f5f9',
                    }}
                  >
                    {dest.name}
                  </h3>

                  {/* Description */}
                  <p
                    style={{
                      margin: '0 0 14px',
                      fontSize: '12px',
                      lineHeight: '1.45',
                      color: '#94a3b8',
                    }}
                  >
                    {dest.description}
                  </p>

                  {/* Landmarks preview tags */}
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '6px',
                      marginBottom: '16px',
                    }}
                  >
                    {dest.landmarks.slice(0, 3).map((lm, idx) => (
                      <span
                        key={idx}
                        style={{
                          background: 'rgba(255, 255, 255, 0.04)',
                          border: '1px solid rgba(255, 255, 255, 0.06)',
                          borderRadius: '6px',
                          padding: '2px 7px',
                          fontSize: '11px',
                          color: '#cbd5e1',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <span>{lm.icon}</span>
                        <span>{lm.name}</span>
                      </span>
                    ))}
                  </div>
                </div>

                {/* Travel Action Button */}
                <button
                  disabled={isCurrent}
                  onClick={() => {
                    onSelectDestination(dest)
                    onClose()
                  }}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '12px',
                    border: 'none',
                    background: isCurrent
                      ? 'rgba(255, 255, 255, 0.04)'
                      : 'linear-gradient(135deg, #0284c7 0%, #2563eb 100%)',
                    color: isCurrent ? '#64748b' : '#ffffff',
                    fontSize: '13px',
                    fontWeight: 700,
                    letterSpacing: '0.02em',
                    cursor: isCurrent ? 'default' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    boxShadow: isCurrent ? 'none' : '0 4px 12px rgba(2, 132, 199, 0.3)',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    if (!isCurrent) {
                      e.currentTarget.style.transform = 'translateY(-1px)'
                      e.currentTarget.style.boxShadow = '0 6px 16px rgba(2, 132, 199, 0.45)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isCurrent) {
                      e.currentTarget.style.transform = 'translateY(0)'
                      e.currentTarget.style.boxShadow = '0 4px 12px rgba(2, 132, 199, 0.3)'
                    }
                  }}
                >
                  {isCurrent ? (
                    'Position actuelle'
                  ) : (
                    <>
                      <span>Voyager ici</span>
                      <span>✈️</span>
                    </>
                  )}
                </button>
              </div>
            )
          })}
        </div>

        {/* Footer info banner */}
        <div
          style={{
            padding: '14px 32px',
            borderTop: '1px solid rgba(255, 255, 255, 0.06)',
            background: 'rgba(10, 15, 30, 0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '12px',
            color: '#64748b',
          }}
        >
          <div>
            💡 <strong style={{ color: '#38bdf8' }}>Génération continue</strong> : Dès que vous conduisez vers les limites de la carte, les nouveaux chunks sont générés en direct !
          </div>
          <div style={{ color: '#38bdf8', fontWeight: 600 }}>
            Touche <kbd style={kbdStyle}>T</kbd> pour voyager
          </div>
        </div>
      </div>
    </div>
  )
}

const kbdStyle: React.CSSProperties = {
  background: 'rgba(255, 255, 255, 0.1)',
  border: '1px solid rgba(255, 255, 255, 0.2)',
  borderRadius: '4px',
  padding: '1px 5px',
  fontFamily: 'monospace',
  fontSize: '11px',
  color: '#e2e8f0',
}
