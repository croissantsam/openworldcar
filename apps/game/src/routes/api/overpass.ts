import { createFileRoute } from '@tanstack/react-router'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * POST /api/overpass — Overpass API proxy for lightweight queries
 * (monument radar, road corridors for time trials).
 *
 * Full-geometry /map downloads stay on /api/osm-map (50k-node budget);
 * Overpass serves targeted queries (a few KB). Responses are cached on
 * disk by query hash; files live in <app-cwd>/.cache/osm (gitignored).
 */

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter'
const CACHE_DIR = join(process.cwd(), '.cache', 'osm')
const MAX_QUERY_LEN = 2000

function isAllowedQuery(query: string): boolean {
  const q = query.trim()
  return (
    q.length > 0 &&
    q.length <= MAX_QUERY_LEN &&
    q.startsWith('[out:xml]') &&
    (q.includes('node[') || q.includes('way[') || q.includes('nwr['))
  )
}

export const Route = createFileRoute('/api/overpass')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json().catch(() => null)) as { query?: unknown } | null
          const query = typeof body?.query === 'string' ? body.query : ''
          if (!isAllowedQuery(query)) {
            return Response.json({ error: 'Invalid or disallowed Overpass query' }, { status: 400 })
          }

          const hash = createHash('sha256').update(query).digest('hex').slice(0, 32)
          const file = join(CACHE_DIR, `overpass_${hash}.xml`)
          try {
            const cached = await readFile(file, 'utf8')
            if (cached.length > 50 && cached.includes('<osm')) {
              return new Response(cached, {
                headers: { 'Content-Type': 'application/xml', 'X-Overpass-Cache': 'HIT' },
              })
            }
          } catch {
            // cache miss — fetch upstream
          }

          const upstream = await fetch(OVERPASS_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'User-Agent': 'OpenWorldCar-Game/1.0 (https://github.com/openworldcar)',
            },
            body: `data=${encodeURIComponent(query)}`,
          })
          const text = await upstream.text()
          if (!upstream.ok || text.length < 50 || !text.includes('<osm')) {
            return Response.json({ error: 'Overpass query failed' }, { status: 502 })
          }

          try {
            await mkdir(CACHE_DIR, { recursive: true })
            await writeFile(file, text, 'utf8')
          } catch {
            // best effort
          }
          return new Response(text, {
            headers: { 'Content-Type': 'application/xml', 'X-Overpass-Cache': 'MISS' },
          })
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : 'Overpass proxy failed'
          return Response.json({ error: message }, { status: 500 })
        }
      },
    },
  },
})
