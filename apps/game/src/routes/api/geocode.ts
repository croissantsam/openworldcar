import { createFileRoute } from '@tanstack/react-router'

/**
 * GET /api/geocode?q=… — Nominatim address search proxy.
 *
 * Keeps the browser out of Nominatim's usage-policy crossfire (User-Agent,
 * language headers) and preserves the previous Vite dev-middleware contract
 * so `searchAddress()` in services/geocoding.ts works unchanged.
 */
export const Route = createFileRoute('/api/geocode')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url)
          const query = url.searchParams.get('q')

          if (!query || query.trim().length < 2) {
            return Response.json({ error: 'Query parameter "q" required' }, { status: 400 })
          }

          const nominatimUrl =
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query.trim())}` +
            `&limit=6&addressdetails=1`

          const response = await fetch(nominatimUrl, {
            headers: {
              'User-Agent': 'OpenWorldCar-Game/1.0 (https://github.com/openworldcar)',
              'Accept-Language': 'fr,en',
            },
          })

          const data = await response.json()
          return Response.json(data, { status: response.status })
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : 'Geocoding failed'
          return Response.json({ error: message }, { status: 500 })
        }
      },
    },
  },
})
