import { index, integer, real, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core'
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

/**
 * Cumulative gameplay stats (one row per user, guests included).
 * Updated with deltas reported by the client (~every 20s of play).
 */
export const playerStats = sqliteTable('player_stats', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: 'cascade' }),
  /** Total driven/flown distance, meters. */
  totalDistanceM: real('total_distance_m').notNull().default(0),
  /** Total jump (airborne) distance, meters. */
  totalJumpDistanceM: real('total_jump_distance_m').notNull().default(0),
  /** Best single jump, meters. */
  maxJumpM: real('max_jump_m').notNull().default(0),
  /** Total play time, seconds. */
  totalPlayTimeS: real('total_play_time_s').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .$defaultFn(() => new Date())
    .notNull(),
})

/** Distinct destinations a player has driven in (cities explored). */
export const playerCityVisits = sqliteTable(
  'player_city_visits',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    destinationId: text('destination_id').notNull(),
    visitedAt: integer('visited_at', { mode: 'timestamp_ms' })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (t) => [unique('player_city_visits_user_destination').on(t.userId, t.destinationId)],
)

/** Unlocked trophies. */
export const playerTrophies = sqliteTable(
  'player_trophies',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    trophyId: text('trophy_id').notNull(),
    unlockedAt: integer('unlocked_at', { mode: 'timestamp_ms' })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (t) => [unique('player_trophies_user_trophy').on(t.userId, t.trophyId)],
)

export type PlayerStats = typeof playerStats.$inferSelect

/**
 * Individual time-trial runs. Trials are generated client-side with
 * deterministic, destination-independent ids (`tt_<poiA>_<poiB>`, OSM poi
 * ids sorted), so leaderboards merge across players, destinations and
 * searches without server-side generation. Every run is kept;
 * leaderboards use each player's best.
 */
export const trialTimes = sqliteTable(
  'trial_times',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    trialId: text('trial_id').notNull(),
    destinationId: text('destination_id').notNull(),
    label: text('label').notNull(),
    fromName: text('from_name').notNull(),
    toName: text('to_name').notNull(),
    distanceM: real('distance_m').notNull(),
    /** Run duration, milliseconds. */
    timeMs: integer('time_ms').notNull(),
    // Start/finish beacons (world meters, origin-relative) + world origin at
    // record time — powers CHRONO history teleport ("refaire"). Null for runs
    // recorded before these columns existed (teleport unavailable for those).
    fromX: real('from_x'),
    fromZ: real('from_z'),
    toX: real('to_x'),
    toZ: real('to_z'),
    originLat: real('origin_lat'),
    originLng: real('origin_lng'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (t) => [index('trial_times_trial_time').on(t.trialId, t.timeMs)],
)
