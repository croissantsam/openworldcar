import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

const root = dirname(fileURLToPath(import.meta.url))

/**
 * Root vitest config — runs colocated `*.test.ts` suites.
 *
 * Workspace `@world-drive/*` imports resolve to package SOURCES (not
 * `dist/`), mirroring `apps/game/tsconfig.json#paths`, so tests run without
 * a prior `pnpm build`. Tested code is Node-safe by construction: no package
 * under `packages/` imports three.js, Rapier, or browser APIs.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@world-drive/math': resolve(root, 'packages/math/src/index.ts'),
      '@world-drive/shared': resolve(root, 'packages/shared/src/index.ts'),
      '@world-drive/protocol': resolve(root, 'packages/protocol/src/index.ts'),
      '@world-drive/world-data': resolve(root, 'packages/world-data/src/index.ts'),
    },
  },
  test: {
    include: ['packages/*/src/**/*.test.ts', 'apps/game/src/**/*.test.ts'],
    environment: 'node',
  },
})
