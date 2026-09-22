import type { TranslateFn } from './i18n.js'

/**
 * Trophy modal strings (`trophy_` prefix) + localized trophy catalogue.
 * Keys `trophy_<id>_name` / `trophy_<id>_desc` mirror every trophy id in
 * `lib/trophies.ts` (`fr` = exact current text). Components render names
 * via `trophyName` / `trophyDesc`, which fall back to the raw string when
 * the key is missing (same pattern as `destName` in dict-travel.ts).
 */
export function trophyName(t: TranslateFn, id: string, fallback: string): string {
  const key = `trophy_${id}_name`
  const value = t(key, undefined, undefined, { silent: true })
  return value === key ? fallback : value
}

export function trophyDesc(t: TranslateFn, id: string, fallback: string): string {
  const key = `trophy_${id}_desc`
  const value = t(key, undefined, undefined, { silent: true })
  return value === key ? fallback : value
}

// Convention: `fr` is the reference (exact current French copy); `en`/`es`
// are typed as `typeof fr` so a missing or extra key fails typecheck.
// NOTE: no `as const` here — with `as const`, `typeof fr` would freeze the
// French values as literal types and every translated value would fail
// typecheck. Without it, values widen to `string` while keys stay exact.

export const fr = {
  trophy_title: 'TROPHÉES & CLASSEMENT',
  trophy_tab_trophies: '🏆 TROPHÉES',
  trophy_tab_trophies_count: '🏆 TROPHÉES ({unlocked}/{total})',
  trophy_tab_leaderboard: '📊 CLASSEMENT',
  trophy_cat_distance: 'Distance totale',
  trophy_cat_jump: 'Sauts',
  trophy_cat_cities: 'Villes explorées',
  trophy_cat_playtime: 'Temps de jeu',
  trophy_metric_distance: 'Distance',
  trophy_metric_jump: 'Sauts',
  trophy_metric_cities: 'Villes',
  trophy_metric_playtime: 'Temps',
  trophy_metric_trophies: 'Trophées',
  trophy_progress_offline: 'Progression indisponible hors-ligne.',
  trophy_loading: 'Chargement…',
  trophy_board_offline: 'Classement indisponible hors-ligne.',
  trophy_board_empty: 'Personne au classement pour l’instant — roule pour être le premier !',
  trophy_you_suffix: ' (toi)',
  trophy_unlocked: 'Trophée débloqué !',
  trophy_dist_10k_name: 'Premiers tours de roues',
  trophy_dist_10k_desc: 'Parcourir 10 km au total',
  trophy_dist_100k_name: 'Routard',
  trophy_dist_100k_desc: 'Parcourir 100 km au total',
  trophy_dist_500k_name: 'Grand voyageur',
  trophy_dist_500k_desc: 'Parcourir 500 km au total',
  trophy_dist_2000k_name: 'Légende de l’asphalte',
  trophy_dist_2000k_desc: 'Parcourir 2 000 km au total',
  trophy_jump_10_name: 'Petit saut',
  trophy_jump_10_desc: 'Un saut de 10 m en voiture',
  trophy_jump_25_name: 'Cascadeur',
  trophy_jump_25_desc: 'Un saut de 25 m en voiture',
  trophy_jump_50_name: 'Vol plané',
  trophy_jump_50_desc: 'Un saut de 50 m en voiture',
  trophy_jump_100_name: 'Icare',
  trophy_jump_100_desc: 'Un saut de 100 m en voiture',
  trophy_cities_2_name: 'Explorateur',
  trophy_cities_2_desc: 'Conduire dans 2 villes',
  trophy_cities_6_name: 'Globe-trotter',
  trophy_cities_6_desc: 'Conduire dans 6 villes',
  trophy_cities_12_name: 'Citoyen du monde',
  trophy_cities_12_desc: 'Conduire dans 12 villes',
  trophy_time_1h_name: 'Pilote du dimanche',
  trophy_time_1h_desc: '1 heure de jeu cumulée',
  trophy_time_10h_name: 'Accro du volant',
  trophy_time_10h_desc: '10 heures de jeu cumulées',
  trophy_time_50h_name: 'Vétéran',
  trophy_time_50h_desc: '50 heures de jeu cumulées',
}

export type TrophyDict = typeof fr

export const en: TrophyDict = {
  trophy_title: 'TROPHIES & LEADERBOARD',
  trophy_tab_trophies: '🏆 TROPHIES',
  trophy_tab_trophies_count: '🏆 TROPHIES ({unlocked}/{total})',
  trophy_tab_leaderboard: '📊 LEADERBOARD',
  trophy_cat_distance: 'Total distance',
  trophy_cat_jump: 'Jumps',
  trophy_cat_cities: 'Cities explored',
  trophy_cat_playtime: 'Play time',
  trophy_metric_distance: 'Distance',
  trophy_metric_jump: 'Jumps',
  trophy_metric_cities: 'Cities',
  trophy_metric_playtime: 'Time',
  trophy_metric_trophies: 'Trophies',
  trophy_progress_offline: 'Progress unavailable offline.',
  trophy_loading: 'Loading…',
  trophy_board_offline: 'Leaderboard unavailable offline.',
  trophy_board_empty: 'Nobody on the leaderboard yet — drive to be the first!',
  trophy_you_suffix: ' (you)',
  trophy_unlocked: 'Trophy unlocked!',
  trophy_dist_10k_name: 'First spins of the wheels',
  trophy_dist_10k_desc: 'Drive 10 km in total',
  trophy_dist_100k_name: 'Road-tripper',
  trophy_dist_100k_desc: 'Drive 100 km in total',
  trophy_dist_500k_name: 'Long-distance traveller',
  trophy_dist_500k_desc: 'Drive 500 km in total',
  trophy_dist_2000k_name: 'Asphalt legend',
  trophy_dist_2000k_desc: 'Drive 2,000 km in total',
  trophy_jump_10_name: 'Little jump',
  trophy_jump_10_desc: 'A 10 m jump in a car',
  trophy_jump_25_name: 'Stunt performer',
  trophy_jump_25_desc: 'A 25 m jump in a car',
  trophy_jump_50_name: 'Gliding flight',
  trophy_jump_50_desc: 'A 50 m jump in a car',
  trophy_jump_100_name: 'Icarus',
  trophy_jump_100_desc: 'A 100 m jump in a car',
  trophy_cities_2_name: 'Explorer',
  trophy_cities_2_desc: 'Drive in 2 cities',
  trophy_cities_6_name: 'Globe-trotter',
  trophy_cities_6_desc: 'Drive in 6 cities',
  trophy_cities_12_name: 'Citizen of the world',
  trophy_cities_12_desc: 'Drive in 12 cities',
  trophy_time_1h_name: 'Sunday driver',
  trophy_time_1h_desc: '1 hour of total play time',
  trophy_time_10h_name: 'Driving addict',
  trophy_time_10h_desc: '10 hours of total play time',
  trophy_time_50h_name: 'Veteran',
  trophy_time_50h_desc: '50 hours of total play time',
}

export const es: TrophyDict = {
  trophy_title: 'TROFEOS Y CLASIFICACIÓN',
  trophy_tab_trophies: '🏆 TROFEOS',
  trophy_tab_trophies_count: '🏆 TROFEOS ({unlocked}/{total})',
  trophy_tab_leaderboard: '📊 CLASIFICACIÓN',
  trophy_cat_distance: 'Distancia total',
  trophy_cat_jump: 'Saltos',
  trophy_cat_cities: 'Ciudades exploradas',
  trophy_cat_playtime: 'Tiempo de juego',
  trophy_metric_distance: 'Distancia',
  trophy_metric_jump: 'Saltos',
  trophy_metric_cities: 'Ciudades',
  trophy_metric_playtime: 'Tiempo',
  trophy_metric_trophies: 'Trofeos',
  trophy_progress_offline: 'Progreso no disponible sin conexión.',
  trophy_loading: 'Cargando…',
  trophy_board_offline: 'Clasificación no disponible sin conexión.',
  trophy_board_empty: 'Nadie en la clasificación por ahora — ¡conduce para ser el primero!',
  trophy_you_suffix: ' (tú)',
  trophy_unlocked: '¡Trofeo desbloqueado!',
  trophy_dist_10k_name: 'Primeras vueltas',
  trophy_dist_10k_desc: 'Recorrer 10 km en total',
  trophy_dist_100k_name: 'Trotamundos',
  trophy_dist_100k_desc: 'Recorrer 100 km en total',
  trophy_dist_500k_name: 'Gran viajero',
  trophy_dist_500k_desc: 'Recorrer 500 km en total',
  trophy_dist_2000k_name: 'Leyenda del asfalto',
  trophy_dist_2000k_desc: 'Recorrer 2.000 km en total',
  trophy_jump_10_name: 'Pequeño salto',
  trophy_jump_10_desc: 'Un salto de 10 m en coche',
  trophy_jump_25_name: 'Especialista',
  trophy_jump_25_desc: 'Un salto de 25 m en coche',
  trophy_jump_50_name: 'Vuelo planeado',
  trophy_jump_50_desc: 'Un salto de 50 m en coche',
  trophy_jump_100_name: 'Ícaro',
  trophy_jump_100_desc: 'Un salto de 100 m en coche',
  trophy_cities_2_name: 'Explorador',
  trophy_cities_2_desc: 'Conducir en 2 ciudades',
  trophy_cities_6_name: 'Trotamundos',
  trophy_cities_6_desc: 'Conducir en 6 ciudades',
  trophy_cities_12_name: 'Ciudadano del mundo',
  trophy_cities_12_desc: 'Conducir en 12 ciudades',
  trophy_time_1h_name: 'Piloto dominguero',
  trophy_time_1h_desc: '1 hora de juego acumulada',
  trophy_time_10h_name: 'Adicto al volante',
  trophy_time_10h_desc: '10 horas de juego acumuladas',
  trophy_time_50h_name: 'Veterano',
  trophy_time_50h_desc: '50 horas de juego acumuladas',
}
