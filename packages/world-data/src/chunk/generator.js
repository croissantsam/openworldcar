/**
 * Chunk generator — splits world features into ChunkId-keyed buckets.
 */
import { worldToChunk, chunkKey, CHUNK_SIZE, } from '@world-drive/math';
/**
 * Assign each road to every chunk it passes through.
 * A road segment can span multiple chunks.
 */
function chunksForRoad(road, level) {
    const seen = new Set();
    const result = [];
    for (const pt of road.points) {
        const id = worldToChunk(pt, level);
        const k = chunkKey(id);
        if (!seen.has(k)) {
            seen.add(k);
            result.push(id);
        }
    }
    return result;
}
/**
 * Build a map of ChunkId → WorldChunk from flat feature lists.
 */
export function generateChunks(roads, buildings, pois, level = 0) {
    const chunks = new Map();
    function getOrCreate(id) {
        const k = chunkKey(id);
        if (!chunks.has(k)) {
            chunks.set(k, { id, roads: [], buildings: [], pointsOfInterest: [] });
        }
        return chunks.get(k);
    }
    for (const road of roads) {
        for (const chunkId of chunksForRoad(road, level)) {
            getOrCreate(chunkId).roads.push(road);
        }
    }
    for (const building of buildings) {
        // Assign building to the chunk containing its first footprint point.
        if (building.footprint.length > 0) {
            const chunkId = worldToChunk(building.footprint[0], level);
            getOrCreate(chunkId).buildings.push(building);
        }
    }
    for (const poi of pois) {
        const chunkId = worldToChunk(poi.position, level);
        getOrCreate(chunkId).pointsOfInterest.push(poi);
    }
    return chunks;
}
export { CHUNK_SIZE };
//# sourceMappingURL=generator.js.map