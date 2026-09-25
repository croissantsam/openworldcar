import type { WorldPosition } from './geo.js'

/**
 * Chunk identifier. A chunk is a square cell of the world grid.
 * x / z are integer indices; level allows future multi-resolution support.
 */
export type ChunkId = {
  x: number
  z: number
  /** LOD level. 0 = finest grain (V1 uses 0 only). */
  level: number
}

/**
 * Side length of a chunk in world units (metres).
 * Must match the value used by the world-builder pipeline.
 */
export const CHUNK_SIZE = 500

/**
 * Convert a world position to the ChunkId it belongs to.
 */
export function worldToChunk(world: WorldPosition, level = 0): ChunkId {
  const size = CHUNK_SIZE * Math.pow(2, level)
  return {
    x: Math.floor(world.x / size),
    z: Math.floor(world.z / size),
    level,
  }
}

/**
 * Return the world-space origin (south-west corner) of a chunk.
 */
export function chunkToWorld(chunk: ChunkId): WorldPosition {
  const size = CHUNK_SIZE * Math.pow(2, chunk.level)
  return {
    x: chunk.x * size,
    y: 0,
    z: chunk.z * size,
  }
}

/** Return the world-space centre of a chunk. */
export function chunkCenter(chunk: ChunkId): WorldPosition {
  const origin = chunkToWorld(chunk)
  const half = (CHUNK_SIZE * Math.pow(2, chunk.level)) / 2
  return { x: origin.x + half, y: 0, z: origin.z + half }
}

/** Serialise a ChunkId to a stable string key. */
export function chunkKey(chunk: ChunkId): string {
  return `${chunk.x}:${chunk.z}:${chunk.level}`
}
/** Parse a chunk key back to a ChunkId. */
export function parseChunkKey(key: string): ChunkId {
  const parts = key.split(':')
  if (parts.length !== 3) throw new Error(`Invalid chunk key: ${key}`)
  const [x, z, level] = parts.map(Number) as [number, number, number]
  return { x, z, level }
}

/**
 * Gap in metres between a world position and a chunk square (0 when inside).
 * Used for the hard unload bound: beyond MAX_UNLOAD_METRES nothing is kept,
 * no matter the direction (Chebyshev chunk rings keep far corners alive).
 */
export function distanceToChunkM(world: WorldPosition, chunk: ChunkId): number {
  const size = CHUNK_SIZE * Math.pow(2, chunk.level)
  const x0 = chunk.x * size
  const x1 = x0 + size
  const z0 = chunk.z * size
  const z1 = z0 + size
  const dx = Math.max(x0 - world.x, 0, world.x - x1)
  const dz = Math.max(z0 - world.z, 0, world.z - z1)
  return Math.sqrt(dx * dx + dz * dz)
}

/**
 * Return all ChunkIds within `radius` chunks of `center`.
 * radius=1 → 3×3 grid (9 chunks), radius=2 → 5×5, etc.
 */
export function surroundingChunks(
  center: ChunkId,
  radius: number,
): ChunkId[] {
  const chunks: ChunkId[] = []
  for (let dz = -radius; dz <= radius; dz++) {
    for (let dx = -radius; dx <= radius; dx++) {
      chunks.push({ x: center.x + dx, z: center.z + dz, level: center.level })
    }
  }
  return chunks
}
