import {
  geoToWorld,
  setWorldOrigin,
  type GeoPosition,
} from '@world-drive/math'
import type { WorldPosition } from '@world-drive/math'

export { geoToWorld, setWorldOrigin }

/**
 * Compute the approximate metres-per-degree scale at a given latitude.
 * Useful for bounding-box distance calculations.
 */
export function metersPerDegreeAt(latitude: number): {
  lat: number
  lon: number
} {
  const EARTH_RADIUS = 6_378_137
  const latRad = (latitude * Math.PI) / 180
  return {
    lat: (Math.PI * EARTH_RADIUS) / 180,
    lon: (Math.PI * EARTH_RADIUS * Math.cos(latRad)) / 180,
  }
}

/**
 * Expand a centre point by `radiusMetres` in all directions.
 * Returns a bounding box [minLat, minLon, maxLat, maxLon].
 */
export function geoBoundingBox(
  centre: GeoPosition,
  radiusMetres: number,
): [number, number, number, number] {
  const scale = metersPerDegreeAt(centre.latitude)
  const dLat = radiusMetres / scale.lat
  const dLon = radiusMetres / scale.lon
  return [
    centre.latitude - dLat,
    centre.longitude - dLon,
    centre.latitude + dLat,
    centre.longitude + dLon,
  ]
}

/** Convert an array of [lon, lat] pairs to WorldPosition[]. */
export function lonLatArrayToWorld(
  coords: [number, number][],
): WorldPosition[] {
  return coords.map(([lon, lat]) =>
    geoToWorld({ latitude: lat, longitude: lon }),
  )
}
