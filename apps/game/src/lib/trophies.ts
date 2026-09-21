/**
 * Trophy catalogue (shared client + server).
 *
 * Categories map to cumulative player stats; each trophy is a threshold on
 * one metric. Thresholds are in metric units (meters / seconds / cities).
 */

export type TrophyCategory = 'distance' | 'jump' | 'cities' | 'playtime'

export interface TrophyDef {
  id: string
  category: TrophyCategory
  /** Meters, seconds or city count depending on the category. */
  threshold: number
  name: string
  description: string
  icon: string
}

export const TROPHIES: TrophyDef[] = [
  // ── Distance totale (mètres) ──────────────────────────────────────────
  { id: 'dist_10k', category: 'distance', threshold: 10_000, name: 'Premiers tours de roues', description: 'Parcourir 10 km au total', icon: '🚗' },
  { id: 'dist_100k', category: 'distance', threshold: 100_000, name: 'Routard', description: 'Parcourir 100 km au total', icon: '🛣️' },
  { id: 'dist_500k', category: 'distance', threshold: 500_000, name: 'Grand voyageur', description: 'Parcourir 500 km au total', icon: '🌍' },
  { id: 'dist_2000k', category: 'distance', threshold: 2_000_000, name: 'Légende de l’asphalte', description: 'Parcourir 2 000 km au total', icon: '👑' },
  // ── Plus beau saut (mètres, un seul saut) ─────────────────────────────
  { id: 'jump_10', category: 'jump', threshold: 10, name: 'Petit saut', description: 'Un saut de 10 m en voiture', icon: '🐇' },
  { id: 'jump_25', category: 'jump', threshold: 25, name: 'Cascadeur', description: 'Un saut de 25 m en voiture', icon: '🤸' },
  { id: 'jump_50', category: 'jump', threshold: 50, name: 'Vol plané', description: 'Un saut de 50 m en voiture', icon: '🦅' },
  { id: 'jump_100', category: 'jump', threshold: 100, name: 'Icare', description: 'Un saut de 100 m en voiture', icon: '☀️' },
  // ── Villes explorées (destinations distinctes) ─────────────────────────
  { id: 'cities_2', category: 'cities', threshold: 2, name: 'Explorateur', description: 'Conduire dans 2 villes', icon: '🧭' },
  { id: 'cities_6', category: 'cities', threshold: 6, name: 'Globe-trotter', description: 'Conduire dans 6 villes', icon: '✈️' },
  { id: 'cities_12', category: 'cities', threshold: 12, name: 'Citoyen du monde', description: 'Conduire dans 12 villes', icon: '🌐' },
  // ── Temps de jeu (secondes) ───────────────────────────────────────────
  { id: 'time_1h', category: 'playtime', threshold: 3_600, name: 'Pilote du dimanche', description: '1 heure de jeu cumulée', icon: '☕' },
  { id: 'time_10h', category: 'playtime', threshold: 36_000, name: 'Accro du volant', description: '10 heures de jeu cumulées', icon: '🏁' },
  { id: 'time_50h', category: 'playtime', threshold: 180_000, name: 'Vétéran', description: '50 heures de jeu cumulées', icon: '🎖️' },
]

export const TROPHY_IDS = new Set(TROPHIES.map((t) => t.id))

export interface ProgressSnapshot {
  totalDistanceM: number
  maxJumpM: number
  totalPlayTimeS: number
  citiesCount: number
}

function metricFor(t: TrophyDef, p: ProgressSnapshot): number {
  switch (t.category) {
    case 'distance':
      return p.totalDistanceM
    case 'jump':
      return p.maxJumpM
    case 'cities':
      return p.citiesCount
    case 'playtime':
      return p.totalPlayTimeS
  }
}

/** Trophies newly earned given progress + already-unlocked ids. */
export function checkUnlocks(progress: ProgressSnapshot, unlockedIds: Set<string>): TrophyDef[] {
  return TROPHIES.filter((t) => !unlockedIds.has(t.id) && metricFor(t, progress) >= t.threshold)
}

/** 0..1 progress toward a trophy (for progress bars). */
export function trophyProgress(t: TrophyDef, p: ProgressSnapshot): number {
  if (t.threshold <= 0) return 1
  return Math.min(1, metricFor(t, p) / t.threshold)
}
