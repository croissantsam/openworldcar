/**
 * Side length of a chunk in world units (metres).
 * Must match the value used by the world-builder pipeline.
 */
export const CHUNK_SIZE = 500;
/**
 * Convert a world position to the ChunkId it belongs to.
 */
export function worldToChunk(world, level = 0) {
    const size = CHUNK_SIZE * Math.pow(2, level);
    return {
        x: Math.floor(world.x / size),
        z: Math.floor(world.z / size),
        level,
    };
}
/**
 * Return the world-space origin (south-west corner) of a chunk.
 */
export function chunkToWorld(chunk) {
    const size = CHUNK_SIZE * Math.pow(2, chunk.level);
    return {
        x: chunk.x * size,
        y: 0,
        z: chunk.z * size,
    };
}
/** Return the world-space centre of a chunk. */
export function chunkCenter(chunk) {
    const origin = chunkToWorld(chunk);
    const half = (CHUNK_SIZE * Math.pow(2, chunk.level)) / 2;
    return { x: origin.x + half, y: 0, z: origin.z + half };
}
/** Serialise a ChunkId to a stable string key. */
export function chunkKey(chunk) {
    return `${chunk.x}:${chunk.z}:${chunk.level}`;
}
/** Parse a chunk key back to a ChunkId. */
export function parseChunkKey(key) {
    const parts = key.split(':');
    if (parts.length !== 3)
        throw new Error(`Invalid chunk key: ${key}`);
    const [x, z, level] = parts.map(Number);
    return { x, z, level };
}
/**
 * Return all ChunkIds within `radius` chunks of `center`.
 * radius=1 → 3×3 grid (9 chunks), radius=2 → 5×5, etc.
 */
export function surroundingChunks(center, radius) {
    const chunks = [];
    for (let dz = -radius; dz <= radius; dz++) {
        for (let dx = -radius; dx <= radius; dx++) {
            chunks.push({ x: center.x + dx, z: center.z + dz, level: center.level });
        }
    }
    return chunks;
}
//# sourceMappingURL=chunk.js.map