import React, { useState, useEffect } from 'react'
import {
  WORLD_DESTINATIONS,
  createCustomDestination,
  type WorldDestination,
} from '../world/destinations.js'
import { AddressSearchBar } from './AddressSearchBar.js'
import { useLocale } from '../i18n/index.js'
import { destName, destDesc } from '../i18n/dict-travel.js'

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
  const [isCompact, setIsCompact] = useState(false)
  const { t } = useLocale()

  useEffect(() => {
    const check = () => {
      setIsCompact(window.innerHeight <= 540)
    }
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  if (!isOpen) return null

  const franceCount = WORLD_DESTINATIONS.filter((d) => d.country === 'France').length
  const europeCount = WORLD_DESTINATIONS.filter((d) =>
    ['France', 'Royaume-Uni', 'Italie', 'Allemagne'].includes(d.country),
  ).length
  const intlCount = WORLD_DESTINATIONS.filter((d) => !['France'].includes(d.country)).length

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
      setErrorMsg(t('travel_lat_error'))
      return
    }
    if (isNaN(lon) || lon < -180 || lon > 180) {
      setErrorMsg(t('travel_lon_error'))
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
        padding: isCompact ? '8px' : '24px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '1020px',
          maxHeight: isCompact ? '96vh' : '92vh',
          backgroundColor: 'rgba(15, 23, 42, 0.95)',
          border: '1px solid rgba(56, 189, 248, 0.25)',
          borderRadius: isCompact ? '16px' : '24px',
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
            padding: isCompact ? '10px 16px' : '22px 32px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'linear-gradient(180deg, rgba(30, 41, 59, 0.6) 0%, rgba(15, 23, 42, 0) 100%)',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: isCompact ? '18px' : '24px' }}>🌍</span>
              <h2
                style={{
                  margin: 0,
                  fontSize: isCompact ? '16px' : '22px',
                  fontWeight: 800,
                  letterSpacing: '0.04em',
                  background: 'linear-gradient(135deg, #ffffff 0%, #38bdf8 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                {t('travel_title')}
              </h2>
            </div>
            {!isCompact && (
              <p style={{ margin: '6px 0 0', fontSize: '13px', color: '#94a3b8' }}>
                {t('travel_subtitle')}
              </p>
            )}
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              color: '#94a3b8',
              width: isCompact ? '28px' : '36px',
              height: isCompact ? '28px' : '36px',
              borderRadius: isCompact ? '8px' : '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: isCompact ? '14px' : '18px',
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
            padding: isCompact ? '8px 16px' : '16px 32px 14px',
            background: 'linear-gradient(180deg, rgba(30, 41, 59, 0.4) 0%, rgba(15, 23, 42, 0.3) 100%)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          }}
        >
          <div style={{ marginBottom: isCompact ? '4px' : '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: isCompact ? '10px' : '12px', fontWeight: 700, color: '#38bdf8', letterSpacing: '0.06em' }}>
              {t('travel_search_label')}
            </span>
            {!isCompact && (
              <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                {t('travel_search_hint')}
              </span>
            )}
          </div>
          <AddressSearchBar
            autoFocus={!isCompact}
            compact={isCompact}
            placeholder={t('travel_search_placeholder')}
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
            padding: isCompact ? '6px 16px' : '14px 32px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
            flexWrap: 'wrap',
            gap: isCompact ? '6px' : '12px',
          }}
        >
          {/* Destination filter buttons */}
          <div style={{ display: 'flex', gap: isCompact ? '4px' : '8px', flexWrap: 'wrap' }}>
            {(
              [
                { id: 'all', label: t('travel_filter_all', { count: WORLD_DESTINATIONS.length }) },
                { id: 'france', label: t('travel_filter_france', { count: franceCount }) },
                { id: 'europe', label: t('travel_filter_europe', { count: europeCount }) },
                { id: 'international', label: t('travel_filter_intl', { count: intlCount }) },
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
                  padding: isCompact ? '4px 10px' : '6px 14px',
                  fontSize: isCompact ? '11px' : '12px',
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
              padding: isCompact ? '4px 10px' : '6px 14px',
              fontSize: isCompact ? '11px' : '12px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.2s',
            }}
          >
            <span>{t('travel_gps_toggle')}</span>
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
                {t('travel_gps_title')}
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
                  {t('travel_lat_label')}
                </label>
                <input
                  type="text"
                  placeholder={t('travel_lat_placeholder')}
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
                  {t('travel_lon_label')}
                </label>
                <input
                  type="text"
                  placeholder={t('travel_lon_placeholder')}
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
                  {t('travel_name_label')}
                </label>
                <input
                  type="text"
                  placeholder={t('travel_name_placeholder')}
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
                <span>{t('travel_submit')}</span>
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
            padding: isCompact ? '10px 16px 16px' : '20px 32px 32px',
            display: 'grid',
            gridTemplateColumns: isCompact ? 'repeat(auto-fill, minmax(210px, 1fr))' : 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: isCompact ? '8px' : '16px',
            overflowY: 'auto',
            // Body-level `touch-action: none` disables touch scrolling: re-enable
            // vertical panning here so the card list scrolls on mobile.
            touchAction: 'pan-y',
            overscrollBehavior: 'contain',
            maxHeight: isCompact ? 'calc(96vh - 150px)' : 'calc(92vh - 220px)',
          }}
        >
          {filtered.map((dest) => {
            const isCurrent = dest.id === currentDestinationId
            const goThere = () => {
              if (isCurrent) return
              onSelectDestination(dest)
              onClose()
            }
            return (
              <div
                key={dest.id}
                role={isCurrent ? undefined : 'button'}
                tabIndex={isCurrent ? undefined : 0}
                onClick={goThere}
                onKeyDown={(e) => {
                  if (!isCurrent && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault()
                    goThere()
                  }
                }}
                style={{
                  background: isCurrent
                    ? 'linear-gradient(145deg, rgba(30, 58, 138, 0.4) 0%, rgba(15, 23, 42, 0.7) 100%)'
                    : 'rgba(30, 41, 59, 0.4)',
                  border: isCurrent
                    ? '1.5px solid #38bdf8'
                    : '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: isCompact ? '12px' : '18px',
                  padding: isCompact ? '10px 12px' : '18px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  boxShadow: isCurrent ? '0 0 24px rgba(56, 189, 248, 0.3)' : 'none',
                  transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                  position: 'relative',
                  overflow: 'hidden',
                  cursor: isCurrent ? 'default' : 'pointer',
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
                        {t('travel_current_badge')}
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
                    {destName(dest, t)}
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
                    {destDesc(dest, t)}
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

                {/* Travel Action Button (card itself is clickable too) */}
                <button
                  disabled={isCurrent}
                  onClick={(e) => {
                    e.stopPropagation()
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
                    t('travel_current_btn')
                  ) : (
                    <>
                      <span>{t('travel_go_btn')}</span>
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
            💡 <strong style={{ color: '#38bdf8' }}>{t('travel_footer_highlight')}</strong>
            {t('travel_footer_rest')}
          </div>
          <div style={{ color: '#38bdf8', fontWeight: 600 }}>
            {t('travel_key_before')} <kbd style={kbdStyle}>T</kbd> {t('travel_key_after')}
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
