/**
 * Address-search strings (`search_` prefix): default placeholder, empty /
 * error messages, quick-suggestion section title, warp tag.
 * The `placeholder` / `onClose` props stay parent-driven; suggestion
 * labels + queries are place names and stay raw (never translated).
 * Convention: `fr` is the reference (exact current French copy); `en`/`es`
 * are typed as `typeof fr` so a missing or extra key fails typecheck.
 * NOTE: no `as const` here — with `as const`, `typeof fr` would freeze the
 * French values as literal types and every translated value would fail
 * typecheck. Without it, values widen to `string` while keys stay exact.
 */

export const fr = {
  search_placeholder_default: 'Rechercher une adresse, une rue ou un monument...',
  search_empty: 'Aucun lieu trouvé. Essayez avec un nom de rue, de monument ou de ville.',
  search_error: 'Erreur de recherche. Vérifiez votre connexion.',
  search_quick_title: 'Suggestions rapides :',
  search_warp_tag: 'WARP ⚡',
}

export type SearchDict = typeof fr

export const en: SearchDict = {
  search_placeholder_default: 'Search for an address, a street or a landmark...',
  search_empty: 'No place found. Try a street, landmark or city name.',
  search_error: 'Search error. Check your connection.',
  search_quick_title: 'Quick suggestions:',
  search_warp_tag: 'WARP ⚡',
}

export const es: SearchDict = {
  search_placeholder_default: 'Buscar una dirección, una calle o un monumento...',
  search_empty: 'Ningún lugar encontrado. Pruebe con un nombre de calle, monumento o ciudad.',
  search_error: 'Error de búsqueda. Compruebe su conexión.',
  search_quick_title: 'Sugerencias rápidas:',
  search_warp_tag: 'WARP ⚡',
}
