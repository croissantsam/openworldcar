import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { chunkKey } from '@world-drive/math'
import type { WorldChunk } from '@world-drive/shared'
import { ChunkManager } from './ChunkManager.js'

describe('ChunkManager stationary loading on teleport', () => {
  const origin = { latitude: 48.8584, longitude: 2.2945 }
  const id = { x: 0, z: 0, level: 0 }
  const key = chunkKey(id)

  const testChunk: WorldChunk = {
    id,
    roads: [
      {
        id: '101',
        highway: 'primary',
        points: [
          { x: -50, y: 0, z: 0 },
          { x: 50, y: 0, z: 0 },
        ],
        lanes: 2,
        bridge: false,
        tunnel: false,
        layer: 0,
        elevationMode: 'ground',
        surface: 'asphalt',
      },
    ],
    buildings: [],
    pointsOfInterest: [],
    waterways: [],
    parks: [],
  }

  it('delivers OSM data and builds features for chunks awaiting data while stationary', async () => {
    const scene = new THREE.Scene()
    const cm = new ChunkManager(scene)
    cm.resetToOrigin(origin)

    // Player arrives at (0, 0) and does not move
    const playerPos = { x: 0, y: 0.5, z: 0 }
    cm.update(playerPos)

    // Allow promise microtasks to settle
    await Promise.resolve()
    await Promise.resolve()

    // Chunk (0, 0) should exist in awaitingData status with a ground slab
    const managed = (cm as any).chunks.get(key)
    expect(managed).toBeDefined()
    expect(managed.awaitingData).toBe(true)
    expect(managed.slab).not.toBeNull()
    expect(managed.group).toBeNull()

    // OSM data arrives (via addRealOsmChunks)
    cm.addRealOsmChunks(new Map([[key, testChunk]]))

    // awaitingData must now be false and a job queued
    expect(managed.awaitingData).toBe(false)
    expect((cm as any).queue.length).toBeGreaterThan(0)

    // Pump chunk manager frame updates while stationary (player does not move)
    for (let frame = 0; frame < 15; frame++) {
      cm.update(playerPos)
    }

    // After building and flushing, the chunk must have its geometry group and slab removed
    expect(managed.group).not.toBeNull()
    expect(managed.slab).toBeNull()
    expect(scene.children.includes(managed.group)).toBe(true)

    cm.dispose()
  })
})
