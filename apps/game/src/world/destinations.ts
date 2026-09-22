import type { GeoPosition, WorldPosition } from '@world-drive/math'

export type WorldDestination = {
  id: string
  name: string
  city: string
  country: string
  flag: string
  description: string
  origin: GeoPosition
  chunkDir: string
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
    id: 'paris_saussure',
    name: 'Paris — 164 Rue de Saussure (17e)',
    city: 'Paris',
    country: 'France',
    flag: '🇫🇷',
    description: '164 Rue de Saussure dans le 17e arrondissement de Paris, quartier des Batignolles et Parc Martin Luther King.',
    origin: { latitude: 48.890169, longitude: 2.305174 },
    chunkDir: '/chunks/paris_saussure',
    spawnPosition: { x: -15.4, y: 0.5, z: 8.6 },
    spawnHeading: 1.106,
    landmarks: [
      { name: '164 Rue de Saussure', icon: '🏠', category: 'address' },
      { name: 'Parc Martin Luther King', icon: '🌳', category: 'park' },
      { name: 'Boulevard Berthier', icon: '🛣️', category: 'street' },
      { name: 'Pont Cardinet', icon: '🚆', category: 'station' },
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
    chunkDir: '/chunks',
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
    chunkDir: '/chunks/paris_eiffel',
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
    chunkDir: '/chunks/paris_champs_elysees',
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
    chunkDir: '/chunks/tokyo_shibuya',
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
    chunkDir: '/chunks/nyc_times_square',
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
    chunkDir: '/chunks/london_westminster',
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
    chunkDir: '/chunks/rome_colosseum',
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
    chunkDir: '/chunks/sf_downtown',
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
    chunkDir: '/chunks/dubai_burj',
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
    chunkDir: '/chunks/sydney_harbour',
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
    chunkDir: '/chunks/berlin_brandenburg',
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
  const dirKey = `custom_${Math.round(lat * 1000)}_${Math.round(lon * 1000)}`
  return {
    id: `custom_${Date.now()}`,
    name: safeName,
    city: safeName,
    country: 'Monde Entier',
    flag: '🌐',
    description: `Zone explorée et générée en temps réel autour des coordonnées ${lat.toFixed(5)}°, ${lon.toFixed(5)}°.`,
    origin: { latitude: lat, longitude: lon },
    chunkDir: `/chunks/${dirKey}`,
    spawnPosition: { x: 62.5, y: 0.5, z: 62.5 },
    spawnHeading: 0,
    landmarks: [
      { name: 'Point de spawn', icon: '📍', category: 'spawn' },
    ],
  }
}

/**
 * Communes de Petite Couronne collées à Paris. Sans elles, Levallois,
 * Neuilly, Boulogne… tombent dans le bbox francilien et héritent à tort
 * du fallback « Paris Intra-Muros ».
 */
const PARIS_SUBURBS: Array<{ lat: number; lon: number; r: number; label: string }> = [
  { lat: 48.8932, lon: 2.2875, r: 0.012, label: 'Levallois-Perret' },
  { lat: 48.8847, lon: 2.2695, r: 0.01, label: 'Neuilly-sur-Seine' },
  { lat: 48.9111, lon: 2.2864, r: 0.012, label: 'Asnières-sur-Seine' },
  { lat: 48.9043, lon: 2.3059, r: 0.011, label: 'Clichy' },
  { lat: 48.9116, lon: 2.3332, r: 0.012, label: 'Saint-Ouen-sur-Seine' },
  { lat: 48.9356, lon: 2.3539, r: 0.014, label: 'Saint-Denis' },
  { lat: 48.9133, lon: 2.3798, r: 0.012, label: 'Aubervilliers' },
  { lat: 48.8964, lon: 2.4012, r: 0.012, label: 'Pantin' },
  { lat: 48.8614, lon: 2.4434, r: 0.013, label: 'Montreuil' },
  { lat: 48.8474, lon: 2.4392, r: 0.01, label: 'Vincennes' },
  { lat: 48.8468, lon: 2.4193, r: 0.009, label: 'Saint-Mandé' },
  { lat: 48.8132, lon: 2.3844, r: 0.012, label: 'Ivry-sur-Seine' },
  { lat: 48.8117, lon: 2.3622, r: 0.01, label: 'Le Kremlin-Bicêtre' },
  { lat: 48.8156, lon: 2.3434, r: 0.009, label: 'Gentilly' },
  { lat: 48.8176, lon: 2.3179, r: 0.01, label: 'Montrouge' },
  { lat: 48.8138, lon: 2.2989, r: 0.009, label: 'Malakoff' },
  { lat: 48.8219, lon: 2.2892, r: 0.009, label: 'Vanves' },
  { lat: 48.8246, lon: 2.2748, r: 0.012, label: 'Issy-les-Moulineaux' },
  { lat: 48.835, lon: 2.2419, r: 0.014, label: 'Boulogne-Billancourt' },
  { lat: 48.8926, lon: 2.2364, r: 0.013, label: 'Courbevoie — La Défense' },
  { lat: 48.8703, lon: 2.2226, r: 0.011, label: 'Suresnes' },
  { lat: 48.9188, lon: 2.2546, r: 0.012, label: 'Colombes' },
]

/**
 * Returns authentic real-time district, arrondissement, and neighborhood
 * from GPS coordinates for Paris and worldwide cities.
 */
export function getDistrictLabel(geo: GeoPosition, dest?: WorldDestination): string {
  // Paris region (within ~20km of Notre-Dame)
  if (Math.abs(geo.latitude - 48.8566) < 0.18 && Math.abs(geo.longitude - 2.3522) < 0.20) {
    if (Math.hypot(geo.latitude - 48.8584, geo.longitude - 2.2945) < 0.013) return 'Paris (7e) — Tour Eiffel & Seine'
    if (Math.hypot(geo.latitude - 48.8738, geo.longitude - 2.2950) < 0.013) return 'Paris (8e) — Champs-Élysées & Étoile'
    if (Math.hypot(geo.latitude - 48.8680, geo.longitude - 2.3420) < 0.009) return 'Paris (2e) — Bourse & Sentier'
    if (Math.hypot(geo.latitude - 48.8620, geo.longitude - 2.3360) < 0.009) return 'Paris (1er) — Louvre & Palais-Royal'
    if (Math.hypot(geo.latitude - 48.8640, geo.longitude - 2.3600) < 0.010) return 'Paris (3e) — Le Marais & République'
    if (Math.hypot(geo.latitude - 48.8540, geo.longitude - 2.3580) < 0.010) return 'Paris (4e) — Île de la Cité & Notre-Dame'
    if (Math.hypot(geo.latitude - 48.8760, geo.longitude - 2.3370) < 0.011) return 'Paris (9e) — Opéra & Grands Boulevards'
    if (Math.hypot(geo.latitude - 48.8760, geo.longitude - 2.3600) < 0.011) return 'Paris (10e) — Canal St-Martin & Gares'
    if (Math.hypot(geo.latitude - 48.8500, geo.longitude - 2.3320) < 0.011) return 'Paris (6e) — Saint-Germain-des-Prés'
    if (Math.hypot(geo.latitude - 48.8450, geo.longitude - 2.3500) < 0.011) return 'Paris (5e) — Quartier Latin & Panthéon'
    if (Math.hypot(geo.latitude - 48.8590, geo.longitude - 2.3780) < 0.013) return 'Paris (11e) — Bastille & Oberkampf'
    // Petite Couronne : testée après les arrondissements (prioritaires sur
    // les zones frontalières) mais avant le fallback générique.
    for (const s of PARIS_SUBURBS) {
      if (Math.hypot(geo.latitude - s.lat, geo.longitude - s.lon) < s.r) return s.label
    }
    // Destination non-parisienne (recherche, GPS libre) : ne jamais
    // l'écraser avec « Paris Intra-Muros ».
    const destCity = dest?.city?.trim() ?? ''
    if (destCity && destCity !== 'Paris' && !destCity.startsWith('Paris ')) {
      const destName = dest?.name?.trim() ?? ''
      if (destName && destName !== destCity) return `${destCity} — ${destName}`
      return destCity
    }
    // Hors périphérique (bbox approximatif) sans match précis : banlieue,
    // pas Intra-Muros.
    if (geo.latitude > 48.9022 || geo.latitude < 48.8155 || geo.longitude < 2.2241 || geo.longitude > 2.4699) {
      return 'Banlieue Parisienne'
    }
    return 'Paris Intra-Muros'
  }

  // Marseille region
  if (Math.abs(geo.latitude - 43.30) < 0.20 && Math.abs(geo.longitude - 5.38) < 0.20) {
    if (Math.hypot(geo.latitude - 43.2965, geo.longitude - 5.3698) < 0.015) return 'Marseille — Vieux-Port & Canebière'
    if (Math.hypot(geo.latitude - 43.2980, geo.longitude - 5.3660) < 0.012) return 'Marseille — Le Panier & Major'
    if (Math.hypot(geo.latitude - 43.2840, geo.longitude - 5.3710) < 0.015) return 'Marseille — Notre-Dame de la Garde'
    return 'Marseille — Cité Phocéenne'
  }

  // Lyon region
  if (Math.abs(geo.latitude - 45.76) < 0.20 && Math.abs(geo.longitude - 4.84) < 0.20) {
    if (Math.hypot(geo.latitude - 45.7578, geo.longitude - 4.8320) < 0.015) return 'Lyon — Presqu’île & Bellecour'
    if (Math.hypot(geo.latitude - 45.7620, geo.longitude - 4.8270) < 0.015) return 'Lyon — Vieux Lyon & Fourvière'
    return 'Lyon — Métropole'
  }

  // Bordeaux region
  if (Math.abs(geo.latitude - 44.84) < 0.20 && Math.abs(geo.longitude - -0.58) < 0.20) {
    return 'Bordeaux — Centre Historique & Quais'
  }

  // Tokyo
  if (Math.abs(geo.latitude - 35.66) < 0.25 && Math.abs(geo.longitude - 139.7) < 0.25) {
    if (Math.hypot(geo.latitude - 35.6595, geo.longitude - 139.7004) < 0.018) return 'Tokyo — Shibuya Scramble'
    return 'Tokyo — Métropole'
  }

  // New York
  if (Math.abs(geo.latitude - 40.75) < 0.25 && Math.abs(geo.longitude - -73.98) < 0.25) {
    if (Math.hypot(geo.latitude - 40.758, geo.longitude - -73.9855) < 0.018) return 'New York — Times Square'
    return 'New York — Manhattan'
  }

  // London
  if (Math.abs(geo.latitude - 51.5) < 0.25 && Math.abs(geo.longitude - -0.12) < 0.25) {
    if (Math.hypot(geo.latitude - 51.5007, geo.longitude - -0.1246) < 0.018) return 'Londres — Westminster & Big Ben'
    return 'Londres — Grand Londres'
  }

  // Rome
  if (Math.abs(geo.latitude - 41.89) < 0.25 && Math.abs(geo.longitude - 12.49) < 0.25) {
    return 'Rome — Centro Storico & Colosseo'
  }

  // Berlin
  if (Math.abs(geo.latitude - 52.51) < 0.25 && Math.abs(geo.longitude - 13.38) < 0.25) {
    return 'Berlin — Mitte & Brandenburger Tor'
  }

  if (dest) {
    if (dest.city && dest.name && dest.city !== dest.name) {
      return `${dest.city} — ${dest.name}`
    }
    return dest.name || dest.city || 'Monde Ouvert'
  }

  return 'Monde Ouvert'
}

