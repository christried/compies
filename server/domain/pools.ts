import { isUuid } from './uuid'

// The pools of a new Event (#146): the game ids the Host put in the Game pool and the Tiebreaker pool.

/** The most games one pool takes; far above any real Event, it only bounds the request. */
export const POOL_GAMES_MAX = 200

export interface NewPools {
  main: string[]
  tiebreaker: string[]
}

function parseList(raw: unknown): string[] | null {
  if (raw === undefined) return []
  if (!Array.isArray(raw) || raw.length > POOL_GAMES_MAX) return null
  if (!raw.every((id): id is string => isUuid(id))) return null
  // A game may sit in both pools, but only once in one.
  return new Set(raw.map(id => id.toLowerCase())).size === raw.length ? raw : null
}

/**
 * The `pools` of the create request. Absent means two empty pools (empty pools are allowed); a list may be missing
 * too. Whether the games exist is for the handler.
 */
export function parsePools(raw: unknown): { ok: true, pools: NewPools } | { ok: false, error: 'invalid_pools' } {
  if (raw === undefined) return { ok: true, pools: { main: [], tiebreaker: [] } }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ok: false, error: 'invalid_pools' }
  const { main, tiebreaker } = raw as { main?: unknown, tiebreaker?: unknown }
  const mainIds = parseList(main)
  const tiebreakerIds = parseList(tiebreaker)
  if (!mainIds || !tiebreakerIds) return { ok: false, error: 'invalid_pools' }
  return { ok: true, pools: { main: mainIds, tiebreaker: tiebreakerIds } }
}
