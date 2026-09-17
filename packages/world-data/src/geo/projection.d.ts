import { geoToWorld, setWorldOrigin, type GeoPosition } from '@world-drive/math';
import type { WorldPosition } from '@world-drive/math';
export { geoToWorld, setWorldOrigin };
/**
 * Compute the approximate metres-per-degree scale at a given latitude.
 * Useful for bounding-box distance calculations.
 */
export declare function metersPerDegreeAt(latitude: number): {
    lat: number;
    lon: number;
};
/**
 * Expand a centre point by `radiusMetres` in all directions.
 * Returns a bounding box [minLat, minLon, maxLat, maxLon].
 */
export declare function geoBoundingBox(centre: GeoPosition, radiusMetres: number): [number, number, number, number];
/** Convert an array of [lon, lat] pairs to WorldPosition[]. */
export declare function lonLatArrayToWorld(coords: [number, number][]): WorldPosition[];
//# sourceMappingURL=projection.d.ts.map