/**
 * OSM data fetcher — uses Overpass API (for development/world-builder only).
 * Never call this during gameplay.
 */
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
/** Build an Overpass QL query for roads, buildings, and POIs in a bounding box. */
function buildQuery(bbox) {
    const { south, west, north, east } = bbox;
    const bb = `${south},${west},${north},${east}`;
    return `
[out:json][timeout:60];
(
  way["highway"](${bb});
  way["building"](${bb});
  node["amenity"](${bb});
  node["shop"](${bb});
);
out body geom;
`.trim();
}
/** Fetch OSM data for a bounding box from Overpass. */
export async function fetchOsmData(bbox) {
    const query = buildQuery(bbox);
    const response = await fetch(OVERPASS_URL, {
        method: 'POST',
        body: `data=${encodeURIComponent(query)}`,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    if (!response.ok) {
        throw new Error(`Overpass API error: ${response.status} ${response.statusText}`);
    }
    return response.json();
}
//# sourceMappingURL=parser.js.map