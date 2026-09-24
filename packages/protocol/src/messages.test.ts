import { describe, expect, it } from 'vitest'
import {
  serializeMessage,
  parseClientMessage,
  parseServerMessage,
  type ClientMessage,
  type ServerMessage,
} from './messages.js'
import type { PlayerSnapshot, NPCSnapshot } from '@world-drive/shared'

const SNAP: PlayerSnapshot = {
  id: 'p1',
  position: { x: 10, y: 0.5, z: -20 },
  geo: { latitude: 48.8648, longitude: 2.349 },
  rotation: { x: 0, y: 1.2, z: 0, w: 1 },
  velocity: { x: 3, y: 0, z: 1 },
  tick: 42,
}

const NPC: NPCSnapshot = {
  id: 'npc-1',
  position: { x: 30, y: 0, z: 40 },
  rotation: { x: 0, y: 0, z: 0 },
  speed: 8,
}

describe('network protocol', () => {
  const clientCases: ClientMessage[] = [
    { type: 'join', playerId: 'abc' },
    { type: 'player_input', input: { throttle: 1, brake: 0, steering: -0.5, timestamp: 123 }, seq: 7 },
    {
      type: 'player_state',
      state: {
        position: SNAP.position,
        ...(SNAP.geo ? { geo: SNAP.geo } : {}),
        rotation: SNAP.rotation,
        velocity: SNAP.velocity,
      },
      seq: 8,
    },
    { type: 'ping', timestamp: 999 },
    { type: 'request_chunk', chunkId: { x: 1, z: -2, level: 0 } },
    { type: 'player_respawn' },
    { type: 'player_hit', targetId: 'p2', damage: 25, point: { x: 1, y: 1, z: 1 } },
    { type: 'leave' },
  ]
  it.each(clientCases)('round-trips client message $type', (msg) => {
    expect(parseClientMessage(serializeMessage(msg))).toEqual(msg)
  })

  const serverCases: ServerMessage[] = [
    { type: 'welcome', playerId: 'abc', tickRate: 20, playerCount: 1 },
    { type: 'world_snapshot', tick: 100, lastProcessedSeq: 9, players: [SNAP], npcs: [NPC], playerCount: 2 },
    {
      type: 'chunk',
      chunk: { id: { x: 0, z: 0, level: 0 }, roads: [], buildings: [], pointsOfInterest: [], waterways: [], parks: [] },
    },
    { type: 'pong', timestamp: 999, serverTime: 1000 },
    { type: 'player_joined', snapshot: SNAP },
    { type: 'player_left', playerId: 'p2' },
    { type: 'damage_taken', from: 'p2', damage: 10, health: 90, point: { x: 0, y: 1, z: 0 } },
    { type: 'destroyed', by: 'p2' },
    { type: 'error', code: 'BAD_INPUT', message: 'nope' },
  ]
  it.each(serverCases)('round-trips server message $type', (msg) => {
    expect(parseServerMessage(serializeMessage(msg))).toEqual(msg)
  })

  it('keeps optional snapshot fields absent when unknown (older peer compat)', () => {
    const minimal: PlayerSnapshot = {
      id: 'anon',
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      tick: 1,
    }
    const parsed = parseServerMessage(
      serializeMessage({ type: 'player_joined', snapshot: minimal }),
    )
    expect(parsed.type).toBe('player_joined')
    if (parsed.type === 'player_joined') {
      expect('name' in parsed.snapshot).toBe(false)
      expect('vehicle' in parsed.snapshot).toBe(false)
    }
  })

  it('rejects malformed wire data', () => {
    expect(() => parseClientMessage('not-json{{{')).toThrow()
  })
})
