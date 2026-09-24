/**
 * Geographic and world coordinate system.
 *
 * World units: 1 unit = 1 metre.
 * Projection: Web Mercator (EPSG:3857), origin-relative to avoid float precision issues.
 * The Y axis of Three.js maps to altitude; X/Z map to horizontal plane.
 */

/** A position in geo space (WGS84). */
export type GeoPosition = {
  latitude: number
  longitude: number
  /** Altitude in metres above sea level. Defaults to 0. */
  altitude?: number
}

/** A position in world space (metres, Three.js coordinate system). */
export type WorldPosition = {
  x: number
  /** Vertical (altitude) axis in Three.js. */
  y: number
  z: number
}

/** Earth radius in metres (Web Mercator uses this). */
const EARTH_RADIUS = 6_378_137

/**
 * Project a WGS84 lat/lon to EPSG:3857 metres.
 * Returns absolute Mercator x/y (not relative to any origin).
 */
function geoToMercator(lat: number, lon: number): { mx: number; my: number } {
  const mx = EARTH_RADIUS * (lon * Math.PI) / 180
  const my =
    EARTH_RADIUS *
    Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))
  return { mx, my }
}

/**
 * The world origin in Mercator metres.
 * Set once at startup (or when the player travels far enough to need re-centering).
 *
 * Default: Paris 2e arrondissement  (lat 48.8648, lon 2.3490)
 */
let _originMx = 0
let _originMy = 0
let _originSet = false
let _originGeo: GeoPosition = { latitude: 48.890169, longitude: 2.305174 }

/**
 * Set the world origin from a geographic position.
 * Must be called before any geoToWorld conversions.
 */
export function setWorldOrigin(geo: GeoPosition): void {
  const { mx, my } = geoToMercator(geo.latitude, geo.longitude)
  _originMx = mx
  _originMy = my
  _originSet = true
  _originGeo = { latitude: geo.latitude, longitude: geo.longitude }
}

/** The geographic position the world origin was last set to (a copy). */
export function getWorldOrigin(): GeoPosition {
  return { latitude: _originGeo.latitude, longitude: _originGeo.longitude }
}

/** Returns true if the world origin has been configured. */
export function isWorldOriginSet(): boolean {
  return _originSet
}

/** Default origin: 164 Rue de Saussure, 75017 Paris, France. */
export const DEFAULT_ORIGIN: GeoPosition = {
  latitude: 48.890169,
  longitude: 2.305174,
}

/**
 * Great-circle distance in metres between two WGS84 positions (haversine).
 * Canonical shared helper: interest management and origin-rebase checks must
 * agree on Earth distance even when local XYZ frames differ.
 */
export function geoDistanceMeters(a: GeoPosition, b: GeoPosition): number {
  const R = 6_371_000
  const toRad = Math.PI / 180
  const dLat = (b.latitude - a.latitude) * toRad
  const dLon = (b.longitude - a.longitude) * toRad
  const s =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(a.latitude * toRad) * Math.cos(b.latitude * toRad) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)))
}

/**
 * Convert a geographic position to a world-space position.
 * Requires setWorldOrigin() to have been called first.
 */
export function geoToWorld(geo: GeoPosition): WorldPosition {
  const { mx, my } = geoToMercator(geo.latitude, geo.longitude)
  return {
    x: mx - _originMx,
    y: geo.altitude ?? 0,
    // In Three.js, Z points towards the viewer (south), so we negate Y delta.
    z: -(my - _originMy),
  }
}

/**
 * Convert a world-space position back to a geographic position.
 */
export function worldToGeo(world: WorldPosition): GeoPosition {
  const mx = world.x + _originMx
  const my = -world.z + _originMy

  const lon = (mx / EARTH_RADIUS) * (180 / Math.PI)
  const lat =
    (2 * Math.atan(Math.exp(my / EARTH_RADIUS)) - Math.PI / 2) *
    (180 / Math.PI)

  return { latitude: lat, longitude: lon, altitude: world.y }
}
