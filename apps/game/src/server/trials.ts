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
  // Start/finish beacons (world meters, origin-relative) + world origin.
  // Optional (offline queue from older clients); null = no teleport.
  fromX?: number
  fromZ?: number
  toX?: number
  toZ?: number
  originLat?: number
  originLng?: number
}

/** Finite number or null (junk in → null, never NaN in the DB). */
function finiteOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
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
      fromX: finiteOrNull(data.trial.fromX),
      fromZ: finiteOrNull(data.trial.fromZ),
      toX: finiteOrNull(data.trial.toX),
      toZ: finiteOrNull(data.trial.toZ),
      originLat: finiteOrNull(data.trial.originLat),
      originLng: finiteOrNull(data.trial.originLng),
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
export const getTrialLeaderboard = createServerFn({ method: 'POST' })
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

export interface TrialHistoryRow {
  trialId: string
  destinationId: string
  label: string
  fromName: string
  toName: string
  distanceM: number
  bestMs: number
  runs: number
  lastAt: string
  fromX: number | null
  fromZ: number | null
  toX: number | null
  toZ: number | null
  originLat: number | null
  originLng: number | null
}

/**
 * Every distinct trial the player has run (signed-in player), most recent
 * first — powers the CHRONO "MES CHRONOS" tab with teleport-to-redo.
 * Grouped by (trial, destination): the same monument pair raced from two
 * destinations is two entries (leaderboards stay shared by trial id, but
 * each entry teleports to its own start beacon).
 */
export const getMyTrialHistory = createServerFn({ method: 'GET' }).handler(
  async (): Promise<TrialHistoryRow[]> => {
    const userId = await requireUserId()
    try {
      const runs = await db
        .select({
          trialId: trialTimes.trialId,
          destinationId: trialTimes.destinationId,
          label: trialTimes.label,
          fromName: trialTimes.fromName,
          toName: trialTimes.toName,
          distanceM: trialTimes.distanceM,
          timeMs: trialTimes.timeMs,
          fromX: trialTimes.fromX,
          fromZ: trialTimes.fromZ,
          toX: trialTimes.toX,
          toZ: trialTimes.toZ,
          originLat: trialTimes.originLat,
          originLng: trialTimes.originLng,
          createdAt: trialTimes.createdAt,
        })
        .from(trialTimes)
        .where(eq(trialTimes.userId, userId))
        .orderBy(sql`${trialTimes.createdAt} desc`)
        .limit(500)
      const byKey = new Map<string, TrialHistoryRow>()
      for (const r of runs) {
        const key = `${r.trialId} ${r.destinationId}`
        const prev = byKey.get(key)
        if (!prev) {
          byKey.set(key, {
            trialId: r.trialId,
            destinationId: r.destinationId,
            label: r.label,
            fromName: r.fromName,
            toName: r.toName,
            distanceM: r.distanceM,
            bestMs: r.timeMs,
            runs: 1,
            lastAt: r.createdAt.toISOString(),
            fromX: r.fromX,
            fromZ: r.fromZ,
            toX: r.toX,
            toZ: r.toZ,
            originLat: r.originLat,
            originLng: r.originLng,
          })
        } else {
          prev.runs++
          if (r.timeMs < prev.bestMs) prev.bestMs = r.timeMs
        }
      }
      return [...byKey.values()]
    } catch (err) {
      console.error('[trials] getMyTrialHistory failed:', err instanceof Error ? err.message : err)
      throw err
    }
  },
)
