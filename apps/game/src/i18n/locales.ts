/** Supported game locales: French, English, Spanish. */

export const SUPPORTED_LOCALES = ['fr', 'en', 'es'] as const

export type Locale = (typeof SUPPORTED_LOCALES)[number]

export function isLocale(value: unknown): value is Locale {
  return value === 'fr' || value === 'en' || value === 'es'
}

const STORAGE_KEY = 'world-drive-locale'

/** Explicit choice saved from the burger menu (null when never chosen). */
export function loadSavedLocale(): Locale | null {
  try {
    if (typeof window === 'undefined') return null
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return isLocale(raw) ? raw : null
  } catch {
    return null
  }
}

export function saveLocale(locale: Locale): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, locale)
  } catch {
    // private mode etc. — locale still applies to the current session
  }
}

/** Computer's language mapped onto a supported locale (English fallback). */
export function detectLocale(): Locale {
  try {
    const raw =
      typeof navigator !== 'undefined'
        ? navigator.language || (navigator as { userLanguage?: string }).userLanguage || ''
        : ''
    const prefix = raw.toLowerCase().split(/[-_]/)[0]
    if (prefix === 'fr') return 'fr'
    if (prefix === 'es') return 'es'
    if (prefix === 'en') return 'en'
  } catch {
    // ignore — fallback below
  }
  return 'en'
}

/** Default locale: saved choice first, otherwise the computer's language. */
export function resolveInitialLocale(): Locale {
  return loadSavedLocale() ?? detectLocale()
}

/** Native language names (never translated). */
export const LOCALE_LABELS: Record<Locale, string> = {
  fr: 'Français',
  en: 'English',
  es: 'Español',
}
