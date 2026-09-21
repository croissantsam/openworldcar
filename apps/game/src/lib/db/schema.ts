import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { user } from './auth-schema.js'

export * from './auth-schema.js'

/**
 * Per-player persistent save: spawn point + game settings.
 *
 * One row per user (guest or permanent). `settings` is a JSON blob so new
 * preferences can be added without migrations:
 * `{ viewDistance, customLoadRadius, customUnloadRadius, customCameraFar,
 *    customFogDensity }`.
 */
export const playerProfile = sqliteTable('player_profile', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: 'cascade' }),
  displayName: text('display_name'),
  /** Destination id from world/destinations.ts or `osm_loc_…` for searches. */
  destinationId: text('destination_id'),
  /** JSON snapshot { id, name, city, country, flag, description, chunkDir } for full restore. */
  destination: text('destination'),
  /** World origin (GPS) of the saved spawn. */
  spawnOriginLat: real('spawn_origin_lat'),
  spawnOriginLng: real('spawn_origin_lng'),
  /** Player position (world meters, origin-relative) + heading. */
  spawnX: real('spawn_x'),
  spawnY: real('spawn_y'),
  spawnZ: real('spawn_z'),
  spawnHeading: real('spawn_heading'),
  settings: text('settings'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .$defaultFn(() => new Date())
    .notNull(),
})

export type PlayerProfile = typeof playerProfile.$inferSelect
export type NewPlayerProfile = typeof playerProfile.$inferInsert
