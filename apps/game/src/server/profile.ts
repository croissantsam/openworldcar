import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { eq } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { auth } from '../lib/auth.js'
import { db } from '../lib/db.js'
import { playerProfile } from '../lib/db/schema.js'
import type {
  DestinationSnapshot,
  PlayerProfileData,
  SettingsSave,
  SpawnSave,
} from '../lib/profile.js'

async function requireUserId(): Promise<string> {
  const session = await auth.api.getSession({ headers: getRequest().headers })
  if (!session?.user) throw new Error('UNAUTHORIZED')
  return session.user.id
}

function toData(row: typeof playerProfile.$inferSelect): PlayerProfileData {
  let settings: SettingsSave | null = null
  if (row.settings) {
    try {
      settings = JSON.parse(row.settings) as SettingsSave
    } catch {
      settings = null
    }
  }
  let destination: DestinationSnapshot | null = null
  if (row.destination) {
    try {
      destination = JSON.parse(row.destination) as DestinationSnapshot
    } catch {
      destination = null
    }
  }
  return {
    displayName: row.displayName,
    destination,
    originLat: row.spawnOriginLat,
    originLng: row.spawnOriginLng,
    x: row.spawnX,
    y: row.spawnY,
    z: row.spawnZ,
    heading: row.spawnHeading,
    settings,
  }
}

/** Current player's saved profile (spawn + settings), or null. */
export const getMyProfile = createServerFn({ method: 'GET' }).handler(
  async (): Promise<PlayerProfileData | null> => {
    const userId = await requireUserId()
    const rows = await db
      .select()
      .from(playerProfile)
      .where(eq(playerProfile.userId, userId))
      .limit(1)
    const row = rows[0]
    return row ? toData(row) : null
  },
)

async function upsert(userId: string, patch: Partial<typeof playerProfile.$inferInsert>): Promise<void> {
  await db
    .insert(playerProfile)
    .values({ id: randomUUID(), userId, ...patch, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: playerProfile.userId,
      set: { ...patch, updatedAt: new Date() },
    })
}

/** Persist the player's spawn point (destination + GPS origin + position). */
export const saveSpawn = createServerFn({ method: 'POST' })
  .validator((data: SpawnSave) => data)
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const userId = await requireUserId()
    await upsert(userId, {
      destinationId: data.destination.id,
      destination: JSON.stringify(data.destination),
      spawnOriginLat: data.originLat,
      spawnOriginLng: data.originLng,
      spawnX: data.x,
      spawnY: data.y,
      spawnZ: data.z,
      spawnHeading: data.heading,
    })
    return { ok: true }
  })

/** Persist the player's graphics/settings preferences. */
export const saveSettings = createServerFn({ method: 'POST' })
  .validator((data: SettingsSave) => data)
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const userId = await requireUserId()
    await upsert(userId, { settings: JSON.stringify(data) })
    return { ok: true }
  })

/** Persist the player's display name. */
export const saveDisplayName = createServerFn({ method: 'POST' })
  .validator((name: string) => name)
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const userId = await requireUserId()
    await upsert(userId, { displayName: data.slice(0, 40) })
    return { ok: true }
  })
