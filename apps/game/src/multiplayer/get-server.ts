/**
 * Shared multiplayer GameServer singleton.
 *
 * One instance per server process, used by the `/api/mp` Nitro
 * WebSocket route (`mp-ws-handler.ts`). Stored on `globalThis` so
 * dev restarts reuse the same simulation instead of double-ticking.
 */

import { GameServer } from './GameServer.js'

const GLOBAL_KEY = '__world_drive_mp_server__'

type GlobalWithServer = typeof globalThis & {
  [GLOBAL_KEY]?: { server: GameServer; starting: Promise<GameServer> } | undefined
}

/** Return the running GameServer, starting it on first call. */
export function getMultiplayerServer(): Promise<GameServer> {
  const g = globalThis as GlobalWithServer
  const existing = g[GLOBAL_KEY]
  if (existing) return existing.starting
  const server = new GameServer()
  const entry = { server, starting: server.start().then(() => server) }
  g[GLOBAL_KEY] = entry
  return entry.starting
}
