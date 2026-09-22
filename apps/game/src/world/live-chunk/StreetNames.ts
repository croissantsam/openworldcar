/**
 * Localized Street Names — deterministic OpenStreetMap-style street names
 * matching exact district and geographic location.
 */

import { type ChunkId, type GeoPosition } from '@world-drive/math'

export interface StreetNameSet {
  mainEW: string
  mainNS: string
  sec1: string
  sec2: string
  sec3: string
  sec4: string
  diagonal: string
}

function chunkSeed(chunkId: ChunkId): number {
  return Math.abs((chunkId.x * 37) ^ (chunkId.z * 19))
}

function regionSeed(chunkId: ChunkId): number {
  return Math.abs((chunkId.x * 12345) ^ (chunkId.z * 67890))
}

const regionBounds: Array<{
  name: string
  lat: number
  lon: number
  radius: number
  getNames: (seed: number) => StreetNameSet
}> = [
  {
    name: 'Marseille',
    lat: 43.30,
    lon: 5.38,
    radius: 0.25,
    getNames: (seed) => {
      const avenues = [
        'La Canebière', 'Quai du Port', 'Quai des Belges', 'Rue de la République',
        'Boulevard Longchamp', 'Boulevard Michelet', 'Avenue du Prado', 'Quai de Rive-Neuve',
      ]
      const streets = [
        'Rue Paradis', 'Rue Sainte', 'Rue Breteuil', 'Rue de Rome',
        'Rue Grignan', 'Rue Saint-Ferréol', 'Rue Caisserie', 'Rue du Petit Puits',
        'Place de Lenche', 'Rue Neuve Sainte-Catherine',
      ]
      return {
        mainEW: avenues[seed % avenues.length]!,
        mainNS: avenues[(seed + 2) % avenues.length]!,
        sec1: streets[(seed + 1) % streets.length]!,
        sec2: streets[(seed + 3) % streets.length]!,
        sec3: streets[(seed + 4) % streets.length]!,
        sec4: streets[(seed + 6) % streets.length]!,
        diagonal: 'Corniche du Président John Fitzgerald Kennedy',
      }
    },
  },
  {
    name: 'Lyon',
    lat: 45.76,
    lon: 4.84,
    radius: 0.25,
    getNames: (seed) => {
      const avenues = [
        'Rue de la République', 'Place Bellecour', 'Quai Saint-Antoine',
        'Cours Lafayette', 'Boulevard des Belges', 'Quai Jean Moulin',
      ]
      const streets = [
        'Rue Victor Hugo', 'Rue Mercière', 'Rue Saint-Jean', 'Rue du Bœuf',
        'Rue Grenette', 'Rue Édouard Herriot', 'Rue de Brest',
      ]
      return {
        mainEW: avenues[seed % avenues.length]!,
        mainNS: avenues[(seed + 2) % avenues.length]!,
        sec1: streets[(seed + 1) % streets.length]!,
        sec2: streets[(seed + 3) % streets.length]!,
        sec3: streets[(seed + 4) % streets.length]!,
        sec4: streets[(seed + 6) % streets.length]!,
        diagonal: 'Montée du Gourguillon',
      }
    },
  },
  {
    name: 'Tokyo',
    lat: 35.68,
    lon: 139.75,
    radius: 0.8,
    getNames: (seed) => {
      const avenues = ['Shibuya Dori', 'Meiji Dori', 'Omotesando', 'Aoyama Dori', 'Roppongi Dori', 'Sotobori Dori', 'Chuo Dori', 'Harumi Dori']
      const streets = ['Center Gai', 'Cat Street', 'Dogenzaka', 'Takeshita Dori', 'Nonbei Yokocho', 'Spain Zaka', 'Inokashira Dori']
      return {
        mainEW: avenues[seed % avenues.length]!,
        mainNS: avenues[(seed + 3) % avenues.length]!,
        sec1: streets[(seed + 1) % streets.length]!,
        sec2: streets[(seed + 2) % streets.length]!,
        sec3: streets[(seed + 4) % streets.length]!,
        sec4: streets[(seed + 5) % streets.length]!,
        diagonal: 'Omotesando Boulevard',
      }
    },
  },
  {
    name: 'New York',
    lat: 40.75,
    lon: -73.98,
    radius: 0.8,
    getNames: (seed) => {
      const avenues = ['Broadway', '5th Avenue', '7th Avenue', 'Madison Avenue', 'Park Avenue', 'Lexington Avenue', '6th Avenue', '8th Avenue']
      const streets = [`${30 + (seed % 60)}th Street`, `${10 + (seed % 40)}th Street`, 'Crosby Street', 'Spring Street', 'Bleeker Street', 'Houston Street']
      return {
        mainEW: avenues[seed % avenues.length]!,
        mainNS: avenues[(seed + 3) % avenues.length]!,
        sec1: streets[(seed + 1) % streets.length]!,
        sec2: streets[(seed + 2) % streets.length]!,
        sec3: streets[(seed + 4) % streets.length]!,
        sec4: streets[(seed + 5) % streets.length]!,
        diagonal: 'Broadway Boulevard',
      }
    },
  },
  {
    name: 'London',
    lat: 51.5,
    lon: -0.12,
    radius: 0.8,
    getNames: (seed) => {
      const avenues = ['Oxford Street', 'Regent Street', 'Piccadilly', 'The Strand', 'Whitehall', 'Victoria Embankment', 'Kingsway', 'Shaftesbury Avenue']
      const streets = ['Baker Street', 'Fleet Street', 'Abbey Road', 'Carnaby Street', 'Bond Street', 'Coventry Street', 'Haymarket']
      return {
        mainEW: avenues[seed % avenues.length]!,
        mainNS: avenues[(seed + 3) % avenues.length]!,
        sec1: streets[(seed + 1) % streets.length]!,
        sec2: streets[(seed + 2) % streets.length]!,
        sec3: streets[(seed + 4) % streets.length]!,
        sec4: streets[(seed + 5) % streets.length]!,
        diagonal: 'The Mall',
      }
    },
  },
  {
    name: 'Rome',
    lat: 41.9,
    lon: 12.5,
    radius: 0.8,
    getNames: (seed) => {
      const avenues = ['Via del Corso', 'Corso Vittorio Emanuele', 'Via Nazionale', 'Via dei Fori Imperiali', 'Viale Trastevere', 'Via Veneto']
      const streets = ['Via Condotti', 'Via Giulia', 'Via del Babuino', 'Via di Ripetta', 'Via Margutta']
      return {
        mainEW: avenues[seed % avenues.length]!,
        mainNS: avenues[(seed + 3) % avenues.length]!,
        sec1: streets[(seed + 1) % streets.length]!,
        sec2: streets[(seed + 2) % streets.length]!,
        sec3: streets[(seed + 4) % streets.length]!,
        sec4: streets[(seed + 5) % streets.length]!,
        diagonal: 'Via Appia Nuova',
      }
    },
  },
  {
    name: 'Berlin',
    lat: 52.5,
    lon: 13.4,
    radius: 0.8,
    getNames: (seed) => {
      const avenues = ['Unter den Linden', 'Friedrichstraße', 'Kurfürstendamm', 'Karl-Marx-Allee', 'Potsdamer Straße']
      const streets = ['Torstraße', 'Oranienstraße', 'Kastanienallee', 'Bergmannstraße', 'Kantstraße']
      return {
        mainEW: avenues[seed % avenues.length]!,
        mainNS: avenues[(seed + 3) % avenues.length]!,
        sec1: streets[(seed + 1) % streets.length]!,
        sec2: streets[(seed + 2) % streets.length]!,
        sec3: streets[(seed + 4) % streets.length]!,
        sec4: streets[(seed + 5) % streets.length]!,
        diagonal: 'Karl-Liebknecht-Straße',
      }
    },
  },
]

function inRegion(geo: GeoPosition, centerLat: number, centerLon: number, radius: number): boolean {
  return Math.abs(geo.latitude - centerLat) < radius && Math.abs(geo.longitude - centerLon) < radius
}

export function getLocalizedStreetNames(geo: GeoPosition, chunkId: ChunkId): StreetNameSet {
  const seed = chunkSeed(chunkId)

  // Curated cities share one uniform lookup — no city gets special handling.
  for (const region of regionBounds) {
    if (inRegion(geo, region.lat, region.lon, region.radius)) {
      return region.getNames(seed)
    }
  }

  // Fallback generic
  return {
    mainEW: 'Avenue Principale',
    mainNS: 'Boulevard Central',
    sec1: 'Rue des Voyageurs',
    sec2: 'Voie Panoramique',
    sec3: 'Rue du Commerce',
    sec4: 'Passage des Arts',
    diagonal: 'Grand Boulevard Circulaire',
  }
}

export { regionSeed }