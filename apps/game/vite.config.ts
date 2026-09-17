import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

function geocodeProxyPlugin(): Plugin {
  return {
    name: 'geocode-proxy',
    configureServer(server) {
      server.middlewares.use('/api/geocode', async (req, res) => {
        try {
          const host = req.headers.host || 'localhost:5173'
          const parsed = new URL(req.url || '', `http://${host}`)
          const query = parsed.searchParams.get('q')

          if (!query || query.trim().length < 2) {
            res.statusCode = 400
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'Query parameter "q" required' }))
            return
          }

          const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
            query.trim(),
          )}&limit=6&addressdetails=1`

          const response = await fetch(nominatimUrl, {
            headers: {
              'User-Agent': 'OpenWorldCar-Game/1.0 (https://github.com/openworldcar)',
              'Accept-Language': 'fr,en',
            },
          })

          const data = await response.json()
          res.statusCode = response.status
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(data))
        } catch (err: any) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: err.message || 'Geocoding failed' }))
        }
      })

      server.middlewares.use('/api/osm-map', async (req, res) => {
        try {
          const host = req.headers.host || 'localhost:5173'
          const parsed = new URL(req.url || '', `http://${host}`)
          const bbox = parsed.searchParams.get('bbox')

          if (!bbox) {
            res.statusCode = 400
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'Query parameter "bbox" required (west,south,east,north)' }))
            return
          }

          const osmUrl = `https://api.openstreetmap.org/api/0.6/map?bbox=${bbox}`
          const response = await fetch(osmUrl, {
            headers: {
              'User-Agent': 'OpenWorldCar-Game/1.0 (https://github.com/openworldcar)',
              'Accept': 'application/xml',
            },
          })

          const text = await response.text()
          res.statusCode = response.status
          res.setHeader('Content-Type', 'application/xml')
          res.end(text)
        } catch (err: any) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: err.message || 'OSM map fetch failed' }))
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), geocodeProxyPlugin()],
  resolve: {
    alias: {
      '@world-drive/math': path.resolve('../../packages/math/src/index.ts'),
      '@world-drive/shared': path.resolve('../../packages/shared/src/index.ts'),
      '@world-drive/protocol': path.resolve('../../packages/protocol/src/index.ts'),
      '@world-drive/world-data': path.resolve('../../packages/world-data/src/index.ts'),
    },
  },
  optimizeDeps: {
    exclude: ['@dimforge/rapier3d-compat'],
  },
  server: {
    port: 5173,
  },
})

