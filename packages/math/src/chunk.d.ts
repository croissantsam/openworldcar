import type { WorldPosition } from './geo.js';
/**
 * Chunk identifier. A chunk is a square cell of the world grid.
 * x / z are integer indices; level allows future multi-resolution support.
 */
export type ChunkId = {
    x: number;
    z: number;
    /** LOD level. 0 = finest grain (V1 uses 0 only). */
    level: number;
};
/**
 * Side length of a chunk in world units (metres).
 * Must match the value used by the world-builder pipeline.
 */
export declare const CHUNK_SIZE = 500;
/**
 * Convert a world position to the ChunkId it belongs to.
 */
export declare function worldToChunk(world: WorldPosition, level?: number): ChunkId;
/**
 * Return the world-space origin (south-west corner) of a chunk.
 */
export declare function chunkToWorld(chunk: ChunkId): WorldPosition;
/** Return the world-space centre of a chunk. */
export declare function chunkCenter(chunk: ChunkId): WorldPosition;
/** Serialise a ChunkId to a stable string key. */
export declare function chunkKey(chunk: ChunkId): string;
/** Parse a chunk key back to a ChunkId. */
export declare function parseChunkKey(key: string): ChunkId;
/**
 * Return all ChunkIds within `radius` chunks of `center`.
 * radius=1 → 3×3 grid (9 chunks), radius=2 → 5×5, etc.
 */
export declare function surroundingChunks(center: ChunkId, radius: number): ChunkId[];
//# sourceMappingURL=chunk.d.ts.map