import { createClient } from '@libsql/client'
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import * as schema from './db/schema.js'

export type Db = LibSQLDatabase<typeof schema>

/**
 * Driver unique (libsql) pour les deux environnements :
 * - prod : `TURSO_DATABASE_URL` (+ `TURSO_AUTH_TOKEN`) → SQLite distant,
 *   aucun module natif chargé (compatible serverless Vercel/Lambda) ;
 * - dev local : `DATABASE_PATH` (défaut `.data/app.db`) ouvert via une URL
 *   `file:`, sans `better-sqlite3`.
 *
 * Le schéma `sqlite-core` est identique dans les deux cas, donc les requêtes
 * drizzle et les migrations existantes s'appliquent aux deux sans changement.
 */
function createDb(): Db {
  const tursoUrl = process.env['TURSO_DATABASE_URL']
  if (tursoUrl) {
    const authToken = process.env['TURSO_AUTH_TOKEN']
    const client = createClient(authToken ? { url: tursoUrl, authToken } : { url: tursoUrl })
    return drizzle(client, { schema })
  }

  const raw = process.env['DATABASE_PATH'] ?? '.data/app.db'
  const abs = raw.startsWith('/') ? raw : join(process.cwd(), raw)
  try {
    mkdirSync(dirname(abs), { recursive: true })
  } catch (err) {
    throw new Error(
      `[db] impossible de créer ${dirname(abs)}. En prod (Vercel/Lambda, FS read-only), ` +
        `définis TURSO_DATABASE_URL/TURSO_AUTH_TOKEN pour utiliser Turso.`,
      { cause: err },
    )
  }
  return drizzle(createClient({ url: `file:${abs}` }), { schema })
}

export const db: Db = createDb()
