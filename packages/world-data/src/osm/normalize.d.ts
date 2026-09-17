/**
 * Normalize raw OSM GeoJSON features into game types.
 */
import type { Road, Building, PointOfInterest } from '@world-drive/shared';
import type { WorldPosition } from '@world-drive/math';
import { type OsmTags } from './filter.js';
export type RawOsmWay = {
    id: string;
    tags: OsmTags;
    /** [lon, lat] pairs */
    coords: [number, number][];
};
export type RawOsmNode = {
    id: string;
    tags: OsmTags;
    lon: number;
    lat: number;
};
export declare function normalizeRoad(way: RawOsmWay): Road | null;
export declare function normalizeBuilding(way: RawOsmWay): Building | null;
export declare function normalizePoi(node: RawOsmNode, worldPos: WorldPosition): PointOfInterest | null;
//# sourceMappingURL=normalize.d.ts.map