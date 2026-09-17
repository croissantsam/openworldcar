/**
 * OSM data fetcher — uses Overpass API (for development/world-builder only).
 * Never call this during gameplay.
 */
export type OverpassQuery = {
    south: number;
    west: number;
    north: number;
    east: number;
};
export type OverpassElement = {
    type: 'node' | 'way' | 'relation';
    id: number;
    tags?: Record<string, string>;
    geometry?: Array<{
        lat: number;
        lon: number;
    }>;
    lat?: number;
    lon?: number;
};
export type OverpassResponse = {
    elements: OverpassElement[];
};
/** Fetch OSM data for a bounding box from Overpass. */
export declare function fetchOsmData(bbox: OverpassQuery): Promise<OverpassResponse>;
//# sourceMappingURL=parser.d.ts.map