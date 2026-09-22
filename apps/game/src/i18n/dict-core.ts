/**
 * Core strings: language switcher (burger menu) and loading states.
 * Convention for every dict-*.ts file: `fr` is the reference (exact current
 * French copy), `en`/`es` are typed as `typeof fr` so a missing or extra key
 * fails typecheck. Keys use a unique per-feature prefix.
 */

export const fr = {
  core_language_title: 'Langue',
  core_loading_game: 'CHARGEMENT DU JEU…',
}

export type CoreDict = typeof fr

export const en: CoreDict = {
  core_language_title: 'Language',
  core_loading_game: 'LOADING GAME…',
}

export const es: CoreDict = {
  core_language_title: 'Idioma',
  core_loading_game: 'CARGANDO EL JUEGO…',
}
