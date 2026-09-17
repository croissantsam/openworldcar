/**
 * Normalize raw OSM GeoJSON features into game types.
 */
import { lonLatArrayToWorld } from '../geo/projection.js';
import { isWantedHighway, isWantedBuilding, isWantedPoi } from './filter.js';
const DEFAULT_FLOOR_HEIGHT = 3.5; // metres
function parseMaxSpeed(raw) {
    if (!raw)
        return undefined;
    const n = parseInt(raw, 10);
    return isNaN(n) ? undefined : n;
}
function normalizeLanes(raw, highway) {
    if (raw) {
        const n = parseInt(raw, 10);
        if (!isNaN(n))
            return Math.max(1, n);
    }
    // Sensible defaults by road type
    if (highway === 'motorway' || highway === 'trunk')
        return 3;
    if (highway === 'primary' || highway === 'secondary')
        return 2;
    return 1;
}
function normalizeHighwayType(raw) {
    if (raw.endsWith('_link'))
        raw = raw.replace('_link', '');
    const map = {
        motorway: 'motorway',
        trunk: 'trunk',
        primary: 'primary',
        secondary: 'secondary',
        tertiary: 'tertiary',
        residential: 'residential',
        service: 'service',
        living_street: 'residential',
        unclassified: 'unclassified',
        road: 'unclassified',
    };
    return map[raw] ?? 'unclassified';
}
export function normalizeRoad(way) {
    if (!isWantedHighway(way.tags))
        return null;
    const points = lonLatArrayToWorld(way.coords);
    if (points.length < 2)
        return null;
    const highway = way.tags['highway'] ?? 'unclassified';
    const name = way.tags['name'];
    const maxSpeed = parseMaxSpeed(way.tags['maxspeed']);
    return {
        id: way.id,
        highway: normalizeHighwayType(highway),
        ...(name !== undefined ? { name } : {}),
        lanes: normalizeLanes(way.tags['lanes'], highway),
        ...(maxSpeed !== undefined ? { maxSpeed } : {}),
        bridge: way.tags['bridge'] === 'yes',
        tunnel: way.tags['tunnel'] === 'yes',
        points,
    };
}
export function normalizeBuilding(way) {
    if (!isWantedBuilding(way.tags))
        return null;
    const footprint = lonLatArrayToWorld(way.coords);
    if (footprint.length < 3)
        return null;
    const levels = parseInt(way.tags['building:levels'] ?? '0', 10) || 2;
    const heightTag = parseFloat(way.tags['height'] ?? '0');
    const height = heightTag > 0 ? heightTag : levels * DEFAULT_FLOOR_HEIGHT;
    return {
        id: way.id,
        footprint,
        height,
        levels,
    };
}
function resolvePoiCategory(tags) {
    const amenity = tags['amenity'];
    if (amenity === 'fuel')
        return 'fuel';
    if (amenity === 'parking')
        return 'parking';
    if (amenity === 'restaurant' || amenity === 'fast_food')
        return 'restaurant';
    if (amenity === 'hospital')
        return 'hospital';
    if (amenity === 'police')
        return 'police';
    if (tags['shop'])
        return 'shop';
    return 'other';
}
export function normalizePoi(node, worldPos) {
    if (!isWantedPoi(node.tags))
        return null;
    return {
        id: node.id,
        category: resolvePoiCategory(node.tags),
        name: node.tags['name'],
        position: worldPos,
    };
}
//# sourceMappingURL=normalize.js.map