import type { Dictionary } from './i18n.js'
import type { Locale } from './locales.js'
import { fr as coreFr, en as coreEn, es as coreEs } from './dict-core.js'
import { fr as hudFr, en as hudEn, es as hudEs } from './dict-hud.js'
import { fr as travelFr, en as travelEn, es as travelEs } from './dict-travel.js'
import { fr as searchFr, en as searchEn, es as searchEs } from './dict-search.js'
import { fr as mapFr, en as mapEn, es as mapEs } from './dict-map.js'
import { fr as touchFr, en as touchEn, es as touchEs } from './dict-touch.js'
import { fr as authFr, en as authEn, es as authEs } from './dict-auth.js'
import { fr as trophyFr, en as trophyEn, es as trophyEs } from './dict-trophy.js'
import { fr as trialFr, en as trialEn, es as trialEs } from './dict-trial.js'

// Feature dictionaries (one file per screen, unique key prefix each).

const dictionaries: Record<Locale, Dictionary> = {
  fr: { ...coreFr, ...hudFr, ...travelFr, ...searchFr, ...mapFr, ...touchFr, ...authFr, ...trophyFr, ...trialFr },
  en: { ...coreEn, ...hudEn, ...travelEn, ...searchEn, ...mapEn, ...touchEn, ...authEn, ...trophyEn, ...trialEn },
  es: { ...coreEs, ...hudEs, ...travelEs, ...searchEs, ...mapEs, ...touchEs, ...authEs, ...trophyEs, ...trialEs },
}

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale]
}

export * from './locales.js'
export { LocaleProvider, useLocale, createTranslator } from './i18n.js'
export type { Dictionary, TranslateFn, TranslateVars } from './i18n.js'
