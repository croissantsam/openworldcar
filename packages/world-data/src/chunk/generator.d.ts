/**
 * Chunk generator — splits world features into ChunkId-keyed buckets.
 */
import { CHUNK_SIZE } from '@world-drive/math';
import type { Road, Building, PointOfInterest, WorldChunk } from '@world-drive/shared';
export type ChunkMap = Map<string, WorldChunk>;
/**
 * Build a map of ChunkId → WorldChunk from flat feature lists.
 */
export declare function generateChunks(roads: Road[], buildings: Building[], pois: PointOfInterest[], level?: number): ChunkMap;
export { CHUNK_SIZE };
//# sourceMappingURL=generator.d.ts.map