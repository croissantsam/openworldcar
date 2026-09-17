import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  searchAddress,
  geocodingResultToDestination,
  type GeocodingResult,
} from '../services/geocoding.js'
import type { WorldDestination } from '../world/destinations.js'

interface AddressSearchBarProps {
  onSelectAddress: (destination: WorldDestination) => void
  placeholder?: string
  autoFocus?: boolean
  compact?: boolean
  onClose?: () => void
}

const QUICK_SUGGESTIONS = [
  { label: '🗼 Tour Eiffel, Paris', query: 'Tour Eiffel, Paris' },
  { label: '✨ Champs-Élysées', query: 'Avenue des Champs-Élysées, Paris' },
  { label: '🥖 Rue Montorgueil', query: 'Rue Montorgueil, Paris' },
  { label: '🗽 Times Square, NY', query: 'Times Square, New York' },
  { label: '🏮 Shibuya, Tokyo', query: 'Shibuya Crossing, Tokyo' },
  { label: '🇬🇧 Big Ben, Londres', query: 'Big Ben, London' },
  { label: '🏛️ Colisée, Rome', query: 'Colosseo, Roma' },
]

export const AddressSearchBar: React.FC<AddressSearchBarProps> = ({
  onSelectAddress,
  placeholder = 'Rechercher une adresse, une rue ou un monument...',
  autoFocus = false,
  compact = false,
  onClose,
}) => {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<GeocodingResult[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const debounceTimerRef = useRef<any>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  // Focus input on mount if requested
  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus()
    }
  }, [autoFocus])

  // Handle outside click to close dropdown
  useEffect(() => {
    const handlePointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    window.addEventListener('pointerdown', handlePointerDown)
    return () => window.removeEventListener('pointerdown', handlePointerDown)
  }, [])

  const executeSearch = useCallback(async (text: string) => {
    if (text.trim().length < 2) {
      setResults([])
      setIsOpen(false)
      setIsLoading(false)
      return
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    const controller = new AbortController()
    abortControllerRef.current = controller

    setIsLoading(true)
    setErrorMessage(null)

    try {
      const items = await searchAddress(text, controller.signal)
      setResults(items)
      setIsOpen(true)
      setSelectedIndex(-1)
      if (items.length === 0) {
        setErrorMessage('Aucun lieu trouvé. Essayez avec un nom de rue, de monument ou de ville.')
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setErrorMessage('Erreur de recherche. Vérifiez votre connexion.')
      }
    } finally {
      setIsLoading(false)
    }
  }, [])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setQuery(val)

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }

    debounceTimerRef.current = setTimeout(() => {
      executeSearch(val)
    }, 350)
  }

  const handleSelectResult = (item: GeocodingResult) => {
    const dest = geocodingResultToDestination(item)
    setIsOpen(false)
    setQuery(item.name)
    onSelectAddress(dest)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!isOpen && results.length > 0) {
        setIsOpen(true)
      } else {
        setSelectedIndex((prev) => (prev + 1 < results.length ? prev + 1 : 0))
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((prev) => (prev - 1 >= 0 ? prev - 1 : results.length - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (selectedIndex >= 0 && results[selectedIndex]) {
        handleSelectResult(results[selectedIndex]!)
      } else if (results.length > 0) {
        handleSelectResult(results[0]!)
      } else if (query.trim().length >= 2) {
        executeSearch(query)
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false)
      if (onClose) onClose()
    }
  }

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100%',
        maxWidth: compact ? '420px' : '100%',
        fontFamily: 'Inter, system-ui, sans-serif',
        zIndex: 50,
      }}
    >
      {/* Input container */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          background: 'rgba(15, 23, 42, 0.88)',
          border: '1.5px solid rgba(56, 189, 248, 0.45)',
          borderRadius: compact ? '20px' : '16px',
          padding: compact ? '4px 12px' : '10px 18px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.65), 0 0 16px rgba(56, 189, 248, 0.25)',
          backdropFilter: 'blur(16px)',
          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        {/* Search Icon */}
        <span
          style={{
            fontSize: compact ? '14px' : '18px',
            marginRight: compact ? '8px' : '12px',
            color: '#38bdf8',
            opacity: 0.9,
          }}
        >
          🔍
        </span>

        {/* Text Input */}
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (results.length > 0) setIsOpen(true)
          }}
          placeholder={placeholder}
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: '#f8fafc',
            fontSize: compact ? '13px' : '15px',
            fontWeight: 500,
            letterSpacing: '0.02em',
          }}
        />

        {/* Loading Spinner */}
        {isLoading && (
          <div
            style={{
              width: '16px',
              height: '16px',
              border: '2px solid rgba(56, 189, 248, 0.2)',
              borderTopColor: '#38bdf8',
              borderRadius: '50%',
              animation: 'spin 0.7s linear infinite',
              marginRight: '8px',
            }}
          />
        )}

        {/* Clear Button */}
        {query.length > 0 && (
          <button
            onClick={() => {
              setQuery('')
              setResults([])
              setIsOpen(false)
              inputRef.current?.focus()
            }}
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: 'none',
              borderRadius: '50%',
              width: '20px',
              height: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#94a3b8',
              cursor: 'pointer',
              fontSize: '11px',
              marginLeft: '4px',
            }}
          >
            ✕
          </button>
        )}
      </div>

      {/* Quick Suggestion Chips (when input is empty or focused) */}
      {!compact && query.length === 0 && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px',
            marginTop: '12px',
            alignItems: 'center',
          }}
        >
          <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>
            Suggestions rapides :
          </span>
          {QUICK_SUGGESTIONS.map((sug) => (
            <button
              key={sug.query}
              onClick={() => {
                setQuery(sug.query)
                executeSearch(sug.query)
              }}
              style={{
                background: 'rgba(30, 41, 59, 0.7)',
                border: '1px solid rgba(56, 189, 248, 0.25)',
                color: '#94a3b8',
                borderRadius: '12px',
                padding: '4px 10px',
                fontSize: '12px',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = '#38bdf8'
                e.currentTarget.style.borderColor = 'rgba(56, 189, 248, 0.6)'
                e.currentTarget.style.background = 'rgba(14, 165, 233, 0.15)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = '#94a3b8'
                e.currentTarget.style.borderColor = 'rgba(56, 189, 248, 0.25)'
                e.currentTarget.style.background = 'rgba(30, 41, 59, 0.7)'
              }}
            >
              {sug.label}
            </button>
          ))}
        </div>
      )}

      {/* Dropdown Results */}
      {isOpen && (results.length > 0 || errorMessage) && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            left: 0,
            right: 0,
            background: 'rgba(15, 23, 42, 0.96)',
            border: '1px solid rgba(56, 189, 248, 0.4)',
            borderRadius: '16px',
            boxShadow: '0 20px 45px rgba(0, 0, 0, 0.8), 0 0 25px rgba(56, 189, 248, 0.2)',
            backdropFilter: 'blur(20px)',
            maxHeight: '340px',
            overflowY: 'auto',
            padding: '6px',
            zIndex: 100,
          }}
        >
          {errorMessage && (
            <div style={{ padding: '14px 18px', color: '#f87171', fontSize: '13px', textAlign: 'center' }}>
              {errorMessage}
            </div>
          )}

          {results.map((item, idx) => {
            const isSelected = idx === selectedIndex
            return (
              <div
                key={`${item.placeId}_${idx}`}
                onClick={() => handleSelectResult(item)}
                onMouseEnter={() => setSelectedIndex(idx)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  background: isSelected ? 'rgba(56, 189, 248, 0.16)' : 'transparent',
                  border: isSelected ? '1px solid rgba(56, 189, 248, 0.35)' : '1px solid transparent',
                  transition: 'all 0.12s ease-out',
                  gap: '12px',
                }}
              >
                {/* Flag / Icon */}
                <div
                  style={{
                    fontSize: '22px',
                    width: '32px',
                    height: '32px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'rgba(255, 255, 255, 0.05)',
                    borderRadius: '8px',
                    flexShrink: 0,
                  }}
                >
                  {item.flag}
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: '14px',
                      fontWeight: 700,
                      color: isSelected ? '#38bdf8' : '#ffffff',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {item.name}
                  </div>
                  <div
                    style={{
                      fontSize: '11px',
                      color: '#94a3b8',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      marginTop: '2px',
                    }}
                  >
                    {item.displayName}
                  </div>
                </div>

                {/* Warp Action Tag */}
                <div
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    color: isSelected ? '#38bdf8' : 'rgba(255, 255, 255, 0.4)',
                    background: isSelected ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                    padding: '4px 8px',
                    borderRadius: '6px',
                    letterSpacing: '0.05em',
                    flexShrink: 0,
                  }}
                >
                  WARP ⚡
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
