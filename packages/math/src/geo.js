/**
 * Geographic and world coordinate system.
 *
 * World units: 1 unit = 1 metre.
 * Projection: Web Mercator (EPSG:3857), origin-relative to avoid float precision issues.
 * The Y axis of Three.js maps to altitude; X/Z map to horizontal plane.
 */
/** Earth radius in metres (Web Mercator uses this). */
const EARTH_RADIUS = 6_378_137;
/**
 * Project a WGS84 lat/lon to EPSG:3857 metres.
 * Returns absolute Mercator x/y (not relative to any origin).
 */
function geoToMercator(lat, lon) {
    const mx = EARTH_RADIUS * (lon * Math.PI) / 180;
    const my = EARTH_RADIUS *
        Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
    return { mx, my };
}
/**
 * The world origin in Mercator metres.
 * Set once at startup (or when the player travels far enough to need re-centering).
 *
 * Default: Paris 2e arrondissement  (lat 48.8648, lon 2.3490)
 */
let _originMx = 0;
let _originMy = 0;
let _originSet = false;
/**
 * Set the world origin from a geographic position.
 * Must be called before any geoToWorld conversions.
 */
export function setWorldOrigin(geo) {
    const { mx, my } = geoToMercator(geo.latitude, geo.longitude);
    _originMx = mx;
    _originMy = my;
    _originSet = true;
}
/** Returns true if the world origin has been configured. */
export function isWorldOriginSet() {
    return _originSet;
}
/** Default origin: Paris 2e arrondissement. */
export const DEFAULT_ORIGIN = {
    latitude: 48.8648,
    longitude: 2.349,
};
/**
 * Convert a geographic position to a world-space position.
 * Requires setWorldOrigin() to have been called first.
 */
export function geoToWorld(geo) {
    const { mx, my } = geoToMercator(geo.latitude, geo.longitude);
    return {
        x: mx - _originMx,
        y: geo.altitude ?? 0,
        // In Three.js, Z points towards the viewer (south), so we negate Y delta.
        z: -(my - _originMy),
    };
}
/**
 * Convert a world-space position back to a geographic position.
 */
export function worldToGeo(world) {
    const mx = world.x + _originMx;
    const my = -world.z + _originMy;
    const lon = (mx / EARTH_RADIUS) * (180 / Math.PI);
    const lat = (2 * Math.atan(Math.exp(my / EARTH_RADIUS)) - Math.PI / 2) *
        (180 / Math.PI);
    return { latitude: lat, longitude: lon, altitude: world.y };
}
//# sourceMappingURL=geo.js.map