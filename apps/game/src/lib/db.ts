import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import * as schema from './db/schema.js'

/** Absolute path of the SQLite file (dev + prod run from apps/game). */
function resolveDbPath(): string {
  const raw = process.env['DATABASE_PATH'] ?? '.data/app.db'
  if (raw.startsWith('/')) return raw
  return join(process.cwd(), raw)
}

const dbPath = resolveDbPath()
mkdirSync(dirname(dbPath), { recursive: true })

const sqlite = new Database(dbPath)
sqlite.pragma('journal_mode = WAL')

export const db: BetterSQLite3Database<typeof schema> = drizzle(sqlite, { schema })
export type Db = typeof db
