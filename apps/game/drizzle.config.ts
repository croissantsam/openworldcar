import { defineConfig } from 'drizzle-kit'

// Prod (Turso) quand TURSO_DATABASE_URL est défini, sinon SQLite local.
// Les migrations SQL générées sont compatibles (Turso = SQLite distant).
const tursoUrl = process.env['TURSO_DATABASE_URL']

export default tursoUrl
  ? defineConfig({
      schema: './src/lib/db/schema.ts',
      out: './drizzle',
      dialect: 'turso',
      dbCredentials: {
        url: tursoUrl,
        authToken: process.env['TURSO_AUTH_TOKEN'] ?? '',
      },
    })
  : defineConfig({
      schema: './src/lib/db/schema.ts',
      out: './drizzle',
      dialect: 'sqlite',
      dbCredentials: {
        url: './.data/app.db',
      },
    })
