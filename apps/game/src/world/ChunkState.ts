/**
 * Chunk state machine.
 *
 * Lifecycle:
 *   REQUESTED → LOADING → ACTIVE → UNLOADING → UNLOADED
 */

export type ChunkStatus =
  | 'REQUESTED'
  | 'LOADING'
  | 'ACTIVE'
  | 'UNLOADING'
  | 'UNLOADED'

export class ChunkState {
  status: ChunkStatus = 'REQUESTED'

  transition(to: ChunkStatus): void {
    const valid = this._isValid(this.status, to)
    if (!valid) {
      console.warn(`Invalid chunk state transition: ${this.status} → ${to}`)
      return
    }
    this.status = to
  }

  private _isValid(from: ChunkStatus, to: ChunkStatus): boolean {
    const transitions: Record<ChunkStatus, ChunkStatus[]> = {
      REQUESTED: ['LOADING', 'UNLOADED'],
      LOADING: ['ACTIVE', 'UNLOADED'],
      ACTIVE: ['UNLOADING'],
      UNLOADING: ['UNLOADED'],
      UNLOADED: [],
    }
    return transitions[from]?.includes(to) ?? false
  }
}
