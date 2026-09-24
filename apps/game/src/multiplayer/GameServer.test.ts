import { describe, expect, it } from 'vitest'
import { GameServer } from './GameServer.js'

describe('GameServer observability (§30)', () => {
  it('reports zeroed metrics before start', () => {
    const server = new GameServer()
    const m = server.getMetrics()
    expect(m.tickRate).toBe(20)
    expect(m.tick).toBe(0)
    expect(m.players).toBe(0)
    expect(m.npcs).toBe(0)
    expect(m.tickMsAvg).toBe(0)
    expect(m.tickMsP95).toBe(0)
    expect(m.interestMsAvg).toBe(0)
    expect(m.messagesIn).toBe(0)
    expect(m.snapshotsOut).toBe(0)
    expect(m.uptimeS).toBeGreaterThanOrEqual(0)
  })
})
