import { createFileRoute } from '@tanstack/react-router'
import { getMultiplayerServer } from '../../multiplayer/get-server.js'

/**
 * GET /api/mp-stats — GameServer observability snapshot (§30).
 *
 * Tick budget (avg/p95), interest-filter cost, population and counters.
 * Polled by the DebugOverlay (~every 5 s); doubles as a liveness probe.
 */
export const Route = createFileRoute('/api/mp-stats')({
  server: {
    handlers: {
      GET: async () => {
        try {
          const server = await getMultiplayerServer()
          return Response.json(server.getMetrics())
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : 'stats unavailable'
          return Response.json({ error: message }, { status: 500 })
        }
      },
    },
  },
})
