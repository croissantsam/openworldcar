import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { auth } from '../lib/auth.js'
import { db } from '../lib/db.js'
import { playerProfile, trialTimes } from '../lib/db/schema.js'

/** Plausibility cap: no run may average more than this (m/s). */
const MAX_AVG_SPEED_MPS = 120

export interface TrialMeta {
  id: string
  destinationId: string
  label: string
  fromName: string
  toName: string
  distanceM: number
}

async function requireUserId(): Promise<string> {
  let session = null
  try {
    session = await auth.api.getSession({ headers: getRequest().headers })
  } catch {
    session = null
  }
  if (!session?.user) throw new Error('UNAUTHORIZED')
  return session.user.id
}

async function optionalUserId(): Promise<string | null> {
  try {
    const session = await auth.api.getSession({ headers: getRequest().headers })
    return session?.user?.id ?? null
  } catch {
    return null
  }
}

/** Record a run; returns the player's best for this trial + record flag. */
export const submitTrialTime = createServerFn({ method: 'POST' })
  .validator((data: { trial: TrialMeta; timeMs: number }) => data)
  .handler(async ({ data }): Promise<{ bestMs: number; isRecord: boolean }> => {
    const userId = await requireUserId()
    const timeMs = Math.round(data.timeMs)
    const distanceM = data.trial.distanceM
    if (!Number.isFinite(timeMs) || timeMs < 1000 || timeMs > 7_200_000) {
      throw new Error('INVALID_TIME')
    }
    if (!Number.isFinite(distanceM) || distanceM <= 0 || distanceM / (timeMs / 1000) > MAX_AVG_SPEED_MPS) {
      throw new Error('IMPOSSIBLE_TIME')
    }
    const trialId = data.trial.id.slice(0, 200)
    await db.insert(trialTimes).values({
      id: randomUUID(),
      userId,
      trialId,
      destinationId: data.trial.destinationId.slice(0, 120),
      label: data.trial.label.slice(0, 160),
      fromName: data.trial.fromName.slice(0, 48),
      toName: data.trial.toName.slice(0, 48),
      distanceM,
      timeMs,
    })
    const best = await db
      .select({ best: sql<number>`min(${trialTimes.timeMs})` })
      .from(trialTimes)
      .where(and(eq(trialTimes.userId, userId), eq(trialTimes.trialId, trialId)))
    const bestMs = best[0]?.best ?? timeMs
    return { bestMs, isRecord: timeMs <= bestMs }
  })

export interface TrialLeaderboardRow {
  rank: number
  label: string
  timeMs: number
  you: boolean
}

/** Public leaderboard for one trial: best run per player. */
export const getTrialLeaderboard = createServerFn({ method: 'GET' })
  .validator((trialId: string) => trialId)
  .handler(async ({ data }): Promise<TrialLeaderboardRow[]> => {
    const trialId = data.slice(0, 200)
    const me = await optionalUserId()
    const best = sql<number>`min(${trialTimes.timeMs})`
    const rows = await db
      .select({
        userId: trialTimes.userId,
        displayName: playerProfile.displayName,
        best,
      })
      .from(trialTimes)
      .leftJoin(playerProfile, eq(playerProfile.userId, trialTimes.userId))
      .where(eq(trialTimes.trialId, trialId))
      .groupBy(trialTimes.userId, playerProfile.displayName)
      .orderBy(sql`${best} asc`)
      .limit(25)
    return rows.map((r, i) => ({
      rank: i + 1,
      label: r.displayName?.trim() ? r.displayName.trim().slice(0, 24) : `Invité ${r.userId.slice(0, 4).toUpperCase()}`,
      timeMs: r.best,
      you: me !== null && r.userId === me,
    }))
  })

/** Personal bests for a batch of trial ids (signed-in player). */
export const getMyTrialBests = createServerFn({ method: 'POST' })
  .validator((trialIds: string[]) => trialIds)
  .handler(async ({ data }): Promise<Record<string, number>> => {
    const userId = await requireUserId()
    const ids = [...new Set(data)].map((id) => id.slice(0, 200)).slice(0, 32)
    if (ids.length === 0) return {}
    const rows = await db
      .select({
        trialId: trialTimes.trialId,
        best: sql<number>`min(${trialTimes.timeMs})`,
      })
      .from(trialTimes)
      .where(and(eq(trialTimes.userId, userId), inArray(trialTimes.trialId, ids)))
      .groupBy(trialTimes.trialId)
    const out: Record<string, number> = {}
    for (const r of rows) out[r.trialId] = r.best
    return out
  })
