/**
 * OSM tag filter.
 *
 * Determines which OSM elements are relevant for the game.
 * Run before normalization to reduce data volume.
 */
export type OsmTags = Record<string, string>;
export declare function isWantedHighway(tags: OsmTags): boolean;
export declare function isWantedBuilding(tags: OsmTags): boolean;
export declare function isWantedPoi(tags: OsmTags): boolean;
//# sourceMappingURL=filter.d.ts.map