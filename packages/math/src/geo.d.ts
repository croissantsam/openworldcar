/**
 * Geographic and world coordinate system.
 *
 * World units: 1 unit = 1 metre.
 * Projection: Web Mercator (EPSG:3857), origin-relative to avoid float precision issues.
 * The Y axis of Three.js maps to altitude; X/Z map to horizontal plane.
 */
/** A position in geo space (WGS84). */
export type GeoPosition = {
    latitude: number;
    longitude: number;
    /** Altitude in metres above sea level. Defaults to 0. */
    altitude?: number;
};
/** A position in world space (metres, Three.js coordinate system). */
export type WorldPosition = {
    x: number;
    /** Vertical (altitude) axis in Three.js. */
    y: number;
    z: number;
};
/**
 * Set the world origin from a geographic position.
 * Must be called before any geoToWorld conversions.
 */
export declare function setWorldOrigin(geo: GeoPosition): void;
/** Returns true if the world origin has been configured. */
export declare function isWorldOriginSet(): boolean;
/** Default origin: Paris 2e arrondissement. */
export declare const DEFAULT_ORIGIN: GeoPosition;
/**
 * Convert a geographic position to a world-space position.
 * Requires setWorldOrigin() to have been called first.
 */
export declare function geoToWorld(geo: GeoPosition): WorldPosition;
/**
 * Convert a world-space position back to a geographic position.
 */
export declare function worldToGeo(world: WorldPosition): GeoPosition;
//# sourceMappingURL=geo.d.ts.map