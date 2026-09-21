import { createFileRoute } from '@tanstack/react-router'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * GET /api/osm-map?bbox=west,south,east,north — OpenStreetMap /map proxy.
 *
 * The public OSM API is not meant for repeated bulk downloads: after a few
 * dozen 5 MB fetches it answers 509 "Bandwidth Limit Exceeded" for hours.
 * Every response is stored with its bounding box; a request is served from
 * disk when a stored area CONTAINS it (superset), and when the upstream API
 * fails we fall back to the stored area that overlaps the request the most.
 * Files live in <app-cwd>/.cache/osm (gitignored).
 *
 * Same contract as the previous Vite dev-middleware (including the
 * X-Osm-Cache header) so `fetchOsmXml()` in world/osm-parse.ts works unchanged.
 */

type Bbox = { west: number; south: number; east: number; north: number }
type CacheEntry = { file: string; bbox: Bbox; t: number }

const OSM_CACHE_DIR = join(process.cwd(), '.cache', 'osm')
const OSM_CACHE_INDEX = join(OSM_CACHE_DIR, 'index.json')
let osmIndex: CacheEntry[] | null = null

function parseBbox(str: string): Bbox | null {
  const p = str.split(',').map(Number)
  if (p.length !== 4 || p.some((v) => !Number.isFinite(v))) return null
  return { west: p[0]!, south: p[1]!, east: p[2]!, north: p[3]! }
}

function contains(a: Bbox, b: Bbox, eps = 1e-6): boolean {
  return a.west <= b.west + eps && a.south <= b.south + eps && a.east >= b.east - eps && a.north >= b.north - eps
}

function overlapArea(a: Bbox, b: Bbox): number {
  const w = Math.min(a.east, b.east) - Math.max(a.west, b.west)
  const h = Math.min(a.north, b.north) - Math.max(a.south, b.south)
  return w > 0 && h > 0 ? w * h : 0
}

async function loadIndex(): Promise<CacheEntry[]> {
  if (osmIndex) return osmIndex
  try {
    osmIndex = JSON.parse(await readFile(OSM_CACHE_INDEX, 'utf8')) as CacheEntry[]
  } catch {
    osmIndex = []
  }
  return osmIndex
}

async function saveIndex(): Promise<void> {
  await mkdir(OSM_CACHE_DIR, { recursive: true })
  await writeFile(OSM_CACHE_INDEX, JSON.stringify(osmIndex ?? []), 'utf8')
}

/** Best stored response for a bbox: exact/superset first, else the largest overlap (fallback only). */
async function findCached(
  bbox: Bbox,
  allowOverlap: boolean,
): Promise<{ entry: CacheEntry; kind: 'HIT' | 'SUPERSET' | 'OVERLAP' } | null> {
  const index = await loadIndex()
  let best: { entry: CacheEntry; kind: 'HIT' | 'SUPERSET' | 'OVERLAP'; score: number } | null = null
  for (const entry of index) {
    if (contains(entry.bbox, bbox)) {
      const exact = contains(bbox, entry.bbox)
      const score = exact
        ? Infinity
        : 1e6 / ((entry.bbox.east - entry.bbox.west) * (entry.bbox.north - entry.bbox.south))
      if (!best || score > best.score) best = { entry, kind: exact ? 'HIT' : 'SUPERSET', score }
    } else if (allowOverlap) {
      const ov = overlapArea(entry.bbox, bbox)
      if (ov > 0 && (!best || (best.kind === 'OVERLAP' && ov > best.score))) {
        best = { entry, kind: 'OVERLAP', score: ov }
      }
    }
  }
  return best ? { entry: best.entry, kind: best.kind } : null
}

async function storeResponse(bbox: Bbox, xml: string): Promise<void> {
  try {
    await mkdir(OSM_CACHE_DIR, { recursive: true })
    const index = await loadIndex()
    const file = `osm_${bbox.west.toFixed(5)}_${bbox.south.toFixed(5)}_${bbox.east.toFixed(5)}_${bbox.north.toFixed(5)}.xml`
    await writeFile(join(OSM_CACHE_DIR, file), xml, 'utf8')
    const existing = index.findIndex((e) => e.file === file)
    const entry: CacheEntry = { file, bbox, t: Date.now() }
    if (existing >= 0) index[existing] = entry
    else index.push(entry)
    await saveIndex()
  } catch {
    // best effort
  }
}

function xmlResponse(xml: string, cacheKind: string, status = 200): Response {
  return new Response(xml, {
    status,
    headers: {
      'Content-Type': 'application/xml',
      'X-Osm-Cache': cacheKind,
    },
  })
}

export const Route = createFileRoute('/api/osm-map')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url)
          const bbox = url.searchParams.get('bbox')

          if (!bbox) {
            return Response.json(
              { error: 'Query parameter "bbox" required (west,south,east,north)' },
              { status: 400 },
            )
          }

          const bboxParsed = parseBbox(bbox)
          if (!bboxParsed) {
            return Response.json({ error: 'Invalid bbox' }, { status: 400 })
          }

          // 1. Exact or superset area already on disk → no upstream call at all
          const cached = await findCached(bboxParsed, false)
          if (cached) {
            return xmlResponse(
              await readFile(join(OSM_CACHE_DIR, cached.entry.file), 'utf8'),
              cached.kind,
            )
          }

          // 2. Upstream
          const osmUrl = `https://api.openstreetmap.org/api/0.6/map?bbox=${bbox}`
          let response: Response | null = null
          let text = ''
          try {
            response = await fetch(osmUrl, {
              headers: {
                'User-Agent': 'OpenWorldCar-Game/1.0 (https://github.com/openworldcar)',
                Accept: 'application/xml',
              },
            })
            text = await response.text()
          } catch {
            response = null
          }

          if (response && response.ok && text.length > 50) {
            void storeResponse(bboxParsed, text)
            return xmlResponse(text, 'MISS')
          }

          // 3. Upstream failed (509 bandwidth limit, network…): serve the best overlapping area we have
          const fallback = await findCached(bboxParsed, true)
          if (fallback) {
            console.warn(
              `[osm-proxy] upstream ${response ? response.status : 'error'} for ${bbox}; serving cached ${fallback.kind} ${fallback.entry.file}`,
            )
            return xmlResponse(
              await readFile(join(OSM_CACHE_DIR, fallback.entry.file), 'utf8'),
              `STALE-${fallback.kind}`,
            )
          }

          return xmlResponse(text, 'ERROR', response ? response.status : 502)
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : 'OSM map fetch failed'
          return Response.json({ error: message }, { status: 500 })
        }
      },
    },
  },
})
