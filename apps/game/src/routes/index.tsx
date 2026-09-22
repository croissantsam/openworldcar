import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import App from '../App.js'
import { LocaleProvider, getDictionary, isLocale, resolveInitialLocale } from '../i18n/index.js'

export const Route = createFileRoute('/')({
  component: LocaleRedirect,
})

/** `/` has no locale: bounce to the saved or computer language (no HUD involved). */
function LocaleRedirect() {
  const navigate = useNavigate()
  useEffect(() => {
    navigate({
      to: '/$locale',
      params: { locale: resolveInitialLocale() },
      replace: true,
    })
  }, [navigate])
  return (
    <div
      style={{
        width: '100%',
        height: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#000',
        color: '#fff',
        fontFamily: "'Orbitron', sans-serif",
        fontSize: 28,
        fontWeight: 900,
        letterSpacing: 4,
      }}
    >
      WORLD DRIVE
    </div>
  )
}
