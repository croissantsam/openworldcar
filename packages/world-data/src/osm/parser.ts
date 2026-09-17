/**
 * OSM data fetcher — uses Overpass API (for development/world-builder only).
 * Never call this during gameplay.
 */

const OVERPASS_URLS = [
  'https://lz4.overpass-api.de/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
]

export type OverpassQuery = {
  south: number
  west: number
  north: number
  east: number
}

/** Build an Overpass QL query for roads, buildings, and POIs in a bounding box. */
function buildQuery(bbox: OverpassQuery): string {
  const { south, west, north, east } = bbox
  const bb = `${south},${west},${north},${east}`
  return `
[out:json][timeout:90][maxsize:536870912];
(
  way["highway"](${bb});
  way["building"](${bb});
  node["amenity"](${bb});
  node["shop"](${bb});
);
out body geom qt;
`.trim()
}

export type OverpassElement = {
  type: 'node' | 'way' | 'relation'
  id: number
  tags?: Record<string, string>
  /* way geometry */
  geometry?: Array<{ lat: number; lon: number }>
  /* node */
  lat?: number
  lon?: number
}

export type OverpassResponse = {
  elements: OverpassElement[]
}

/** Fetch OSM data for a bounding box from Overpass. */
export async function fetchOsmData(
  bbox: OverpassQuery,
): Promise<OverpassResponse> {
  const query = buildQuery(bbox)
  let lastError: Error | null = null

  for (const url of OVERPASS_URLS) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        body: `data=${encodeURIComponent(query)}`,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'WorldDrive/1.0 (https://github.com/world-drive; contact@worlddrive.dev)',
        },
      })

      if (!response.ok) {
        throw new Error(`Overpass API error (${url}): ${response.status} ${response.statusText}`)
      }

      return (await response.json()) as OverpassResponse
    } catch (err) {
      lastError = err as Error
      console.warn(`[world-data] Endpoint ${url} failed: ${lastError.message}, trying next...`)
    }
  }

  throw lastError ?? new Error('Failed to fetch OSM data from all endpoints')
}

