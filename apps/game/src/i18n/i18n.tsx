import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react'
import type { Locale } from './locales.js'

/** Flat string table: every feature file uses a unique key prefix. */
export type Dictionary = Record<string, string>

export type TranslateVars = Record<string, string | number>

export type TranslateOpts = { silent?: boolean }

export type TranslateFn = (key: string, vars?: TranslateVars, count?: number, opts?: TranslateOpts) => string

function format(template: string, vars?: TranslateVars): string {
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    vars[name] !== undefined ? String(vars[name]) : match,
  )
}

export function createTranslator(dictionary: Dictionary): TranslateFn {
  return (key, vars, count, opts) => {
    let template = dictionary[key]
    // Optional plural: "<key>_one" / "<key>_other" win when `count` is given.
    if (count !== undefined) {
      const plural = dictionary[count === 1 ? `${key}_one` : `${key}_other`]
      if (plural !== undefined) template = plural
    }
    if (template === undefined) {
      if (!opts?.silent && typeof import.meta !== 'undefined' && (import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV) {
        console.warn(`[i18n] missing key "${key}"`)
      }
      return key
    }
    return format(template, count !== undefined ? { ...(vars ?? {}), count } : vars)
  }
}

const LocaleContext = createContext<{ locale: Locale; t: TranslateFn } | null>(null)

export function LocaleProvider({
  locale,
  dictionary,
  children,
}: {
  locale: Locale
  dictionary: Dictionary
  children: ReactNode
}) {
  useEffect(() => {
    try {
      document.documentElement.lang = locale
    } catch {
      // non-DOM environment — ignore
    }
  }, [locale])
  const value = useMemo(() => ({ locale, t: createTranslator(dictionary) }), [locale, dictionary])
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
}

export function useLocale(): { locale: Locale; t: TranslateFn } {
  const ctx = useContext(LocaleContext)
  if (!ctx) throw new Error('useLocale must be used inside <LocaleProvider>')
  return ctx
}
