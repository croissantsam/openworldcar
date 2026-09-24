/**
 * Geocoding Service — OpenStreetMap Nominatim Integration.
 *
 * Allows searching any street address, landmark, avenue, or city globally
 * and immediately warping the player car to that location with live procedural generation.
 */

import type { WorldDestination } from '../world/destinations.js'

export interface GeocodingResult {
  placeId: string | number
  name: string
  displayName: string
  road?: string
  city?: string
  district?: string
  state?: string
  country?: string
  countryCode?: string
  flag: string
  latitude: number
  longitude: number
  category?: string
  type?: string
}

// In-memory query cache to avoid redundant queries and respect OSM policies
const cache = new Map<string, GeocodingResult[]>()

/**
 * Converts a 2-letter ISO country code (e.g. 'fr', 'us', 'jp') to an emoji flag.
 */
export function countryCodeToFlag(code?: string): string {
  if (!code || code.length !== 2) return '📍'
  const upper = code.toUpperCase()
  const offset = 127397
  try {
    return String.fromCodePoint(...[...upper].map((c) => c.charCodeAt(0) + offset))
  } catch {
    return '📍'
  }
}

/**
 * Searches for addresses, monuments, or cities via OpenStreetMap Nominatim.
 */
export async function searchAddress(
  query: string,
  signal?: AbortSignal,
): Promise<GeocodingResult[]> {
  const clean = query.trim()
  if (clean.length < 2) return []

  const cached = cache.get(clean.toLowerCase())
  if (cached) return cached

  // 1. First try local server route /api/geocode
  // 2. Fallback to direct Nominatim public API if the server route is unavailable
  let rawData: any[] = []

  try {
    const proxyUrl = `/api/geocode?q=${encodeURIComponent(clean)}`
    const res = await fetch(proxyUrl, {
      ...(signal ? { signal } : {}),
    })
    if (res.ok) {
      rawData = await res.json()
    } else {
      throw new Error(`Proxy returned status ${res.status}`)
    }
  } catch {
    // Fallback to direct Nominatim query
    try {
      const directUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
        clean,
      )}&limit=6&addressdetails=1`
      const res = await fetch(directUrl, {
        headers: {
          'Accept-Language': 'fr,en',
          ...(typeof window === 'undefined'
            ? { 'User-Agent': 'OpenWorldCar-Game/1.0 (https://github.com/openworldcar)' }
            : {}),
        },
        ...(signal ? { signal } : {}),
      })
      if (res.ok) {
        rawData = await res.json()
      }
    } catch (directErr) {
      console.warn('[Geocoding] Direct Nominatim query failed:', directErr)
      return []
    }
  }

  if (!Array.isArray(rawData)) return []

  const results: GeocodingResult[] = rawData.map((item: any) => {
    const addr = item.address || {}
    const road = addr.road || addr.pedestrian || addr.footway || addr.path
    const city =
      addr.city ||
      addr.town ||
      addr.village ||
      addr.municipality ||
      addr.suburb ||
      addr.city_district ||
      ''
    const district = addr.suburb || addr.city_district || addr.quarter || ''
    const country = addr.country || ''
    const countryCode = (addr.country_code || '').toLowerCase()
    const flag = countryCodeToFlag(countryCode)

    const mainName =
      item.name ||
      road ||
      item.display_name.split(',')[0]?.trim() ||
      'Lieu OpenStreetMap'

    return {
      placeId: item.place_id,
      name: mainName,
      displayName: item.display_name,
      road,
      city,
      district,
      state: addr.state,
      country,
      countryCode,
      flag,
      latitude: parseFloat(item.lat),
      longitude: parseFloat(item.lon),
      category: item.class,
      type: item.type,
    }
  })

  cache.set(clean.toLowerCase(), results)
  return results
}

/**
 * Transforms a GeocodingResult into a playable WorldDestination.
 */
export function geocodingResultToDestination(
  result: GeocodingResult,
): WorldDestination {
  const id = `osm_loc_${result.placeId || Date.now()}`
  const cityLabel = result.city || result.state || result.country || 'Ville'

  return {
    id,
    name: result.name,
    city: cityLabel,
    country: result.country || 'Monde',
    flag: result.flag,
    description: result.displayName,
    origin: {
      latitude: result.latitude,
      longitude: result.longitude,
    },
    // Spawn right on the primary crossroad intersection of chunk (0,0) with safe height
    spawnPosition: { x: 62.5, y: 1.0, z: 62.5 },
    spawnHeading: 0,
    landmarks: [
      {
        name: result.name,
        icon: result.category === 'tourism' || result.type === 'monument' ? '🏛️' : '📍',
        category: result.type || 'destination',
      },
    ],
  }
}
