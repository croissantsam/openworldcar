import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { ChunkState } from './ChunkState.js'

describe('ChunkState lifecycle', () => {
  let warn: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    warn.mockRestore()
  })

  it('walks the full streaming lifecycle', () => {
    const s = new ChunkState()
    expect(s.status).toBe('REQUESTED')
    s.transition('LOADING')
    s.transition('ACTIVE')
    s.transition('UNLOADING')
    s.transition('UNLOADED')
    expect(s.status).toBe('UNLOADED')
  })

  it('allows direct eviction of queued chunks', () => {
    const s = new ChunkState()
    s.transition('LOADING')
    s.transition('UNLOADED')
    expect(s.status).toBe('UNLOADED')
  })

  it('rejects invalid transitions without changing status', () => {
    const s = new ChunkState()
    s.transition('ACTIVE') // REQUESTED → ACTIVE is illegal
    expect(s.status).toBe('REQUESTED')
    expect(warn).toHaveBeenCalledOnce()
  })
})
