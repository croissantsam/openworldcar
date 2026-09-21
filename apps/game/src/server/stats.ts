import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { count, desc, eq, sql } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { auth } from '../lib/auth.js'
import { db } from '../lib/db.js'
import { playerCityVisits, playerProfile, playerStats, playerTrophies } from '../lib/db/schema.js'
import { TROPHY_IDS } from '../lib/trophies.js'

export interface StatsTotals {
  totalDistanceM: number
  totalJumpDistanceM: number
  maxJumpM: number
  totalPlayTimeS: number
}

export interface MyProgress {
  stats: StatsTotals
  cities: string[]
  trophies: Array<{ trophyId: string; unlockedAt: string }>
}

const EMPTY_STATS: StatsTotals = { totalDistanceM: 0, totalJumpDistanceM: 0, maxJumpM: 0, totalPlayTimeS: 0 }

async function optionalUserId(): Promise<string | null> {
  try {
    const session = await auth.api.getSession({ headers: getRequest().headers })
    return session?.user?.id ?? null
  } catch {
    return null
  }
}

async function requireUserId(): Promise<string> {
  const userId = await optionalUserId()
  if (!userId) throw new Error('UNAUTHORIZED')
  return userId
}

/** Full trophy progress of the signed-in player (stats + cities + unlocks). */
export const getMyProgress = createServerFn({ method: 'GET' }).handler(
  async (): Promise<MyProgress> => {
    const userId = await requireUserId()
    const statRows = await db.select().from(playerStats).where(eq(playerStats.userId, userId)).limit(1)
    const s = statRows[0]
    const cityRows = await db
      .select({ destinationId: playerCityVisits.destinationId })
      .from(playerCityVisits)
      .where(eq(playerCityVisits.userId, userId))
    const trophyRows = await db
      .select({ trophyId: playerTrophies.trophyId, unlockedAt: playerTrophies.unlockedAt })
      .from(playerTrophies)
      .where(eq(playerTrophies.userId, userId))
    return {
      stats: s
        ? {
            totalDistanceM: s.totalDistanceM,
            totalJumpDistanceM: s.totalJumpDistanceM,
            maxJumpM: s.maxJumpM,
            totalPlayTimeS: s.totalPlayTimeS,
          }
        : EMPTY_STATS,
      cities: cityRows.map((r) => r.destinationId),
      trophies: trophyRows.map((r) => ({ trophyId: r.trophyId, unlockedAt: r.unlockedAt.toISOString() })),
    }
  },
)

export interface StatsDelta {
  distanceM: number
  jumpM: number
  playTimeS: number
  maxJumpM: number
}

/** Add session deltas to the cumulative totals (creates the row on first play). */
export const reportStats = createServerFn({ method: 'POST' })
  .validator((data: StatsDelta) => data)
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const userId = await requireUserId()
    const distanceM = finite(data.distanceM)
    const jumpM = finite(data.jumpM)
    const playTimeS = finite(data.playTimeS)
    const maxJumpM = finite(data.maxJumpM)
    if (distanceM === 0 && jumpM === 0 && playTimeS === 0 && maxJumpM === 0) return { ok: true }

    const existing = await db
      .select({ id: playerStats.id })
      .from(playerStats)
      .where(eq(playerStats.userId, userId))
      .limit(1)
    if (!existing[0]) {
      await db.insert(playerStats).values({
        id: randomUUID(),
        userId,
        totalDistanceM: distanceM,
        totalJumpDistanceM: jumpM,
        maxJumpM,
        totalPlayTimeS: playTimeS,
      })
      return { ok: true }
    }
    await db
      .update(playerStats)
      .set({
        totalDistanceM: sql`${playerStats.totalDistanceM} + ${distanceM}`,
        totalJumpDistanceM: sql`${playerStats.totalJumpDistanceM} + ${jumpM}`,
        maxJumpM: sql`max(${playerStats.maxJumpM}, ${maxJumpM})`,
        totalPlayTimeS: sql`${playerStats.totalPlayTimeS} + ${playTimeS}`,
        updatedAt: new Date(),
      })
      .where(eq(playerStats.userId, userId))
    return { ok: true }
  })

function finite(v: number): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.min(v, 1e9) : 0
}

/** Record a destination visit (idempotent). Returns the explored-cities count. */
export const visitCity = createServerFn({ method: 'POST' })
  .validator((destinationId: string) => destinationId)
  .handler(async ({ data }): Promise<{ citiesCount: number }> => {
    const userId = await requireUserId()
    const destinationId = data.slice(0, 120)
    if (destinationId.length > 0) {
      await db
        .insert(playerCityVisits)
        .values({ id: randomUUID(), userId, destinationId })
        .onConflictDoNothing()
    }
    const rows = await db
      .select({ n: count() })
      .from(playerCityVisits)
      .where(eq(playerCityVisits.userId, userId))
    return { citiesCount: rows[0]?.n ?? 0 }
  })

/** Persist newly earned trophies (unknown ids rejected, duplicates ignored). */
export const unlockTrophies = createServerFn({ method: 'POST' })
  .validator((ids: string[]) => ids)
  .handler(async ({ data }): Promise<{ unlocked: string[] }> => {
    const userId = await requireUserId()
    const ids = [...new Set(data)].filter((id) => TROPHY_IDS.has(id)).slice(0, 32)
    const unlocked: string[] = []
    for (const trophyId of ids) {
      const res = await db
        .insert(playerTrophies)
        .values({ id: randomUUID(), userId, trophyId })
        .onConflictDoNothing()
        .returning({ trophyId: playerTrophies.trophyId })
      if (res[0]) unlocked.push(res[0].trophyId)
    }
    return { unlocked }
  })

export type LeaderboardMetric = 'distance' | 'jump' | 'cities' | 'playtime' | 'trophies'

export interface LeaderboardRow {
  rank: number
  label: string
  value: number
  you: boolean
}

const METRIC_SQL: Record<LeaderboardMetric, ReturnType<typeof sql<number>>> = {
  distance: sql<number>`coalesce(${playerStats.totalDistanceM}, 0)`,
  jump: sql<number>`coalesce(${playerStats.maxJumpM}, 0)`,
  cities: sql<number>`(select count(*) from ${playerCityVisits} where ${playerCityVisits.userId} = ${playerStats.userId})`,
  playtime: sql<number>`coalesce(${playerStats.totalPlayTimeS}, 0)`,
  trophies: sql<number>`(select count(*) from ${playerTrophies} where ${playerTrophies.userId} = ${playerStats.userId})`,
}

/**
 * Public leaderboard (no login required): display names + metric values only.
 * Guests without a pseudo appear as "Invité AB12".
 */
export const getLeaderboard = createServerFn({ method: 'GET' })
  .validator((metric: LeaderboardMetric) => metric)
  .handler(async ({ data }): Promise<LeaderboardRow[]> => {
    const metric = (['distance', 'jump', 'cities', 'playtime', 'trophies'] as const).includes(data)
      ? data
      : 'distance'
    const me = await optionalUserId()
    const value = METRIC_SQL[metric]
    const rows = await db
      .select({
        userId: playerStats.userId,
        displayName: playerProfile.displayName,
        value,
      })
      .from(playerStats)
      .leftJoin(playerProfile, eq(playerProfile.userId, playerStats.userId))
      .orderBy(desc(value))
      .limit(25)
    return rows.map((r, i) => ({
      rank: i + 1,
      label: r.displayName?.trim() ? r.displayName.trim().slice(0, 24) : `Invité ${r.userId.slice(0, 4).toUpperCase()}`,
      value: Math.round(r.value * 10) / 10,
      you: me !== null && r.userId === me,
    }))
  })
