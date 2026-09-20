/**
 * Hashing utilities — deterministic per-node variation.
 */

// ── Limits ────────────────────────────────────────────────────────────────
export const MAX_PER_KIND = 400
export const MAX_TREES = 600 // total real trees per chunk (all archetypes)
export const ROAD_MARGIN = 1.0 // metres added to the half road width for the "on the road" test

export function hash32(s: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return h
}

/** Uniform [0,1) from a hash and a salt. */
export function unit(h: number, salt: number): number {
  let x = (h ^ Math.imul(salt + 1, 0x9e3779b1)) >>> 0
  x = Math.imul(x ^ (x >>> 15), 0x85ebca6b) >>> 0
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

export function parseMetres(v: string | undefined): number | null {
  if (!v) return null
  const n = parseFloat(v.replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : null
}