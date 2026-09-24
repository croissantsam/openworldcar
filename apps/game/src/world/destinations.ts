import type { GeoPosition, WorldPosition } from '@world-drive/math'

export type WorldDestination = {
  id: string
  name: string
  city: string
  country: string
  flag: string
  description: string
  origin: GeoPosition
  spawnPosition?: WorldPosition
  spawnHeading?: number // in radians
  landmarks: Array<{
    name: string
    icon: string
    category: string
  }>
}

export const WORLD_DESTINATIONS: WorldDestination[] = [
  {
    id: 'paris_etoile',
    name: 'Paris — Place Charles de Gaulle',
    city: 'Paris',
    country: 'France',
    flag: '🇫🇷',
    description: 'Le rond-point mythique de l’Arc de Triomphe, au sommet des Champs-Élysées.',
    origin: { latitude: 48.8738, longitude: 2.295 },
    spawnPosition: { x: 95, y: 0.5, z: 0 },
    spawnHeading: Math.PI,
    landmarks: [
      { name: 'Arc de Triomphe', icon: '🏛️', category: 'monument' },
      { name: 'Place Charles de Gaulle', icon: '⭐', category: 'square' },
      { name: 'Avenue des Champs-Élysées', icon: '🛍️', category: 'avenue' },
    ],
  },
  {
    id: 'paris_2e',
    name: 'Paris — 2e Arrondissement',
    city: 'Paris',
    country: 'France',
    flag: '🇫🇷',
    description: 'Le quartier historique de la Bourse, du Sentier et des passages couverts parisiens.',
    origin: { latitude: 48.8648, longitude: 2.349 },
    spawnPosition: { x: 3.7, y: 0.5, z: 158.3 },
    spawnHeading: 1.22,
    landmarks: [
      { name: 'Palais Brongniart', icon: '🏛️', category: 'monument' },
      { name: 'Rue Montorgueil', icon: '🥖', category: 'street' },
      { name: 'Grands Boulevards', icon: '🎭', category: 'culture' },
    ],
  },
  {
    id: 'paris_eiffel',
    name: 'Paris — Tour Eiffel & Seine',
    city: 'Paris',
    country: 'France',
    flag: '🇫🇷',
    description: "Conduisez au pied de la Dame de Fer, traversez le Pont d'Iéna et longez les quais de Seine.",
    origin: { latitude: 48.8584, longitude: 2.2945 },
    spawnPosition: { x: -117.8, y: 0.5, z: -112.4 },
    spawnHeading: -2.83,
    landmarks: [
      { name: 'Tour Eiffel', icon: '🗼', category: 'monument' },
      { name: 'Champ de Mars', icon: '🌳', category: 'park' },
      { name: "Pont d'Iéna", icon: '🌉', category: 'bridge' },
      { name: 'Quai Branly', icon: '🏛️', category: 'museum' },
    ],
  },
  {
    id: 'paris_champs_elysees',
    name: 'Paris — Champs-Élysées & Étoile',
    city: 'Paris',
    country: 'France',
    flag: '🇫🇷',
    description: "La plus belle avenue du monde avec le rond-point mythique de l'Arc de Triomphe.",
    origin: { latitude: 48.8738, longitude: 2.295 },
    spawnPosition: { x: 131.1, y: 0.5, z: 65.3 },
    spawnHeading: 1.13,
    landmarks: [
      { name: 'Arc de Triomphe', icon: '🏛️', category: 'monument' },
      { name: 'Avenue des Champs-Élysées', icon: '🛍️', category: 'avenue' },
      { name: 'Place Charles de Gaulle', icon: '⭐', category: 'square' },
    ],
  },
  {
    id: 'tokyo_shibuya',
    name: 'Tokyo — Shibuya Crossing',
    city: 'Tokyo',
    country: 'Japon',
    flag: '🇯🇵',
    description: 'Le carrefour le plus célèbre du monde, entouré d’écrans géants néons et des ruelles de Center-Gai.',
    origin: { latitude: 35.6595, longitude: 139.7004 },
    spawnPosition: { x: 11.9, y: 0.5, z: -1.4 },
    spawnHeading: -2.05,
    landmarks: [
      { name: 'Shibuya Scramble Crossing', icon: '🚦', category: 'crossing' },
      { name: 'Statue Hachiko', icon: '🐕', category: 'monument' },
      { name: 'Shibuya Center-Gai', icon: '🏮', category: 'street' },
      { name: 'Miyashita Park', icon: '🛹', category: 'park' },
    ],
  },
  {
    id: 'nyc_times_square',
    name: 'New York — Times Square',
    city: 'New York',
    country: 'États-Unis',
    flag: '🇺🇸',
    description: 'Le cœur de Manhattan, ses gratte-ciels iconiques, Broadway et la 7ème Avenue.',
    origin: { latitude: 40.758, longitude: -73.9855 },
    spawnPosition: { x: 70.8, y: 0.5, z: -306.4 },
    spawnHeading: -0.88,
    landmarks: [
      { name: 'Times Square', icon: '✨', category: 'square' },
      { name: 'Broadway Theatres', icon: '🎭', category: 'theatre' },
      { name: '7th Avenue', icon: '🚕', category: 'avenue' },
      { name: 'Bryant Park', icon: '🌲', category: 'park' },
    ],
  },
  {
    id: 'london_westminster',
    name: 'London — Westminster & Big Ben',
    city: 'Londres',
    country: 'Royaume-Uni',
    flag: '🇬🇧',
    description: 'Le Parlement britannique, Big Ben, Westminster Bridge et les rives de la Tamise.',
    origin: { latitude: 51.5007, longitude: -0.1246 },
    spawnPosition: { x: 69.1, y: 0.5, z: -41.9 },
    spawnHeading: 1.48,
    landmarks: [
      { name: 'Big Ben & Elizabeth Tower', icon: '🕰️', category: 'monument' },
      { name: 'Palace of Westminster', icon: '👑', category: 'palace' },
      { name: 'Westminster Bridge', icon: '🌉', category: 'bridge' },
      { name: 'London Eye', icon: '🎡', category: 'attraction' },
    ],
  },
  {
    id: 'rome_colosseum',
    name: 'Rome — Colisée & Centre Historique',
    city: 'Rome',
    country: 'Italie',
    flag: '🇮🇹',
    description: 'La cité éternelle, le Colisée et les avenues de la Rome impériale générés en temps réel.',
    origin: { latitude: 41.8902, longitude: 12.4922 },
    spawnPosition: { x: 62.5, y: 0.5, z: 62.5 },
    spawnHeading: 0,
    landmarks: [
      { name: 'Colisée', icon: '🏛️', category: 'monument' },
      { name: 'Forum Romain', icon: '🏺', category: 'history' },
      { name: 'Via dei Fori Imperiali', icon: '🛣️', category: 'street' },
    ],
  },
  {
    id: 'sf_downtown',
    name: 'San Francisco — Downtown & Market St',
    city: 'San Francisco',
    country: 'États-Unis',
    flag: '🇺🇸',
    description: 'Les rues pentues californiennes, Market Street et la skyline de la baie.',
    origin: { latitude: 37.7897, longitude: -122.4014 },
    spawnPosition: { x: 62.5, y: 0.5, z: 62.5 },
    spawnHeading: Math.PI / 3,
    landmarks: [
      { name: 'Market Street', icon: '🚋', category: 'avenue' },
      { name: 'Union Square', icon: '🛍️', category: 'square' },
      { name: 'Financial District', icon: '🏢', category: 'skyline' },
    ],
  },
  {
    id: 'dubai_burj',
    name: 'Dubai — Downtown & Burj Khalifa',
    city: 'Dubaï',
    country: 'Émirats Arabes Unis',
    flag: '🇦🇪',
    description: 'La métropole futuriste, le gratte-ciel le plus haut du monde et les boulevards géants.',
    origin: { latitude: 25.1972, longitude: 55.2744 },
    spawnPosition: { x: 62.5, y: 0.5, z: 62.5 },
    spawnHeading: -Math.PI / 4,
    landmarks: [
      { name: 'Burj Khalifa', icon: '🏙️', category: 'skyscraper' },
      { name: 'Dubai Mall', icon: '🛍️', category: 'mall' },
      { name: 'Sheikh Mohammed Blvd', icon: '🌴', category: 'boulevard' },
    ],
  },
  {
    id: 'sydney_harbour',
    name: 'Sydney — Opéra & Port',
    city: 'Sydney',
    country: 'Australie',
    flag: '🇦🇺',
    description: 'La baie de Sydney, le célèbre opéra aux voiles blanches et Harbour Bridge.',
    origin: { latitude: -33.8568, longitude: 151.2153 },
    spawnPosition: { x: 62.5, y: 0.5, z: 62.5 },
    spawnHeading: Math.PI / 2,
    landmarks: [
      { name: 'Sydney Opera House', icon: '🎭', category: 'monument' },
      { name: 'Harbour Bridge', icon: '🌉', category: 'bridge' },
      { name: 'Circular Quay', icon: '⛴️', category: 'harbour' },
    ],
  },
  {
    id: 'berlin_brandenburg',
    name: 'Berlin — Porte de Brandebourg',
    city: 'Berlin',
    country: 'Allemagne',
    flag: '🇩🇪',
    description: 'Le cœur historique allemand, Unter den Linden et le Tiergarten.',
    origin: { latitude: 52.5163, longitude: 13.3777 },
    spawnPosition: { x: 62.5, y: 0.5, z: 62.5 },
    spawnHeading: 0,
    landmarks: [
      { name: 'Brandenburger Tor', icon: '🏛️', category: 'monument' },
      { name: 'Unter den Linden', icon: '🌳', category: 'avenue' },
      { name: 'Reichstag', icon: '⭐', category: 'history' },
    ],
  },
]

export function createCustomDestination(
  lat: number,
  lon: number,
  customName?: string,
): WorldDestination {
  const safeName = customName?.trim() || `GPS (${lat.toFixed(4)}°, ${lon.toFixed(4)}°)`
  return {
    id: `custom_${Date.now()}`,
    name: safeName,
    city: safeName,
    country: 'Monde Entier',
    flag: '🌐',
    description: `Zone explorée et générée en temps réel autour des coordonnées ${lat.toFixed(5)}°, ${lon.toFixed(5)}°.`,
    origin: { latitude: lat, longitude: lon },
    spawnPosition: { x: 62.5, y: 0.5, z: 62.5 },
    spawnHeading: 0,
    landmarks: [
      { name: 'Point de spawn', icon: '📍', category: 'spawn' },
    ],
  }
}

/**
 * HUD location label for the current destination. Fully generic on purpose:
 * no city gets hardcoded special cases — the label comes from live
 * destination data (worldwide search / GPS travel), and the precise street
 * name comes from OSM chunk data. Works identically everywhere on Earth.
 */
export function getDistrictLabel(dest?: WorldDestination): string {
  if (!dest) return 'Monde Ouvert'
  const city = dest.city?.trim() ?? ''
  const name = dest.name?.trim() ?? ''
  if (city && name) {
    if (city === name || name.startsWith(city)) return name
    return `${city} — ${name}`
  }
  return name || city || 'Monde Ouvert'
}

