import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import App from '../App.js'
import { LocaleProvider, getDictionary, isLocale, saveLocale } from '../i18n/index.js'

export const Route = createFileRoute('/$locale')({
  component: LocaleGamePage,
})

/** Game entry: locale comes from the URL (`/fr`, `/en`, `/es`). */
function LocaleGamePage() {
  const { locale } = Route.useParams()
  const navigate = useNavigate()

  useEffect(() => {
    if (isLocale(locale)) {
      saveLocale(locale)
    } else {
      navigate({ to: '/', replace: true })
    }
  }, [locale, navigate])

  if (!isLocale(locale)) {
    // Invalid locale (or SSR without params): fall through to `/`,
    // which redirects to the saved or computer language.
    return null
  }
  return (
    <LocaleProvider locale={locale} dictionary={getDictionary(locale)}>
      <App />
    </LocaleProvider>
  )
}
