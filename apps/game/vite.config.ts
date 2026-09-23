import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { nitro } from 'nitro/vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'url'

export default defineConfig({
  plugins: [
    tanstackStart(),
    // Multiplayer WebSocket route (/api/mp, see src/multiplayer/mp-ws-handler.ts).
    // Served by Nitro in both `vite dev` and production — no separate process/port.
    nitro({
      features: { websocket: true },
      handlers: [{ route: '/api/mp', handler: './src/multiplayer/mp-ws-handler.ts' }],
    }),
    // react's vite plugin must come after start's vite plugin
    react(),
  ],
  resolve: {
    tsconfigPaths: true,
    alias: {
      '@world-drive/math': fileURLToPath(new URL('../../packages/math/src/index.ts', import.meta.url)),
      '@world-drive/shared': fileURLToPath(new URL('../../packages/shared/src/index.ts', import.meta.url)),
      '@world-drive/protocol': fileURLToPath(new URL('../../packages/protocol/src/index.ts', import.meta.url)),
      '@world-drive/world-data': fileURLToPath(new URL('../../packages/world-data/src/index.ts', import.meta.url)),
    },
  },
  optimizeDeps: {
    exclude: ['@dimforge/rapier3d-compat'],
  },
  server: {
    port: 5173,
  },
})
