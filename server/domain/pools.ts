import { isRecord } from '../../shared/record'
import { POOLS } from '../../shared/settings'
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
 * The `pools` of a settings change: only the lists that were given, each of which replaces that pool (#183). Absent
 * means no list. Whether the games exist is for the handler.
 */
export function parsePoolChange(raw: unknown): { ok: true, pools: Partial<NewPools> } | { ok: false, error: 'invalid_pools' } {
  if (raw === undefined) return { ok: true, pools: {} }
  if (!isRecord(raw)) return { ok: false, error: 'invalid_pools' }
  const pools: Partial<NewPools> = {}
  for (const pool of POOLS) {
    if (raw[pool] === undefined) continue
    const ids = parseList(raw[pool])
    if (!ids) return { ok: false, error: 'invalid_pools' }
    pools[pool] = ids
  }
  return { ok: true, pools }
}

/**
 * The `pools` of the create request. Absent means two empty pools (empty pools are allowed); a list may be missing
 * too. Whether the games exist is for the handler.
 */
export function parsePools(raw: unknown): { ok: true, pools: NewPools } | { ok: false, error: 'invalid_pools' } {
  const parsed = parsePoolChange(raw)
  if (!parsed.ok) return parsed
  return { ok: true, pools: { main: parsed.pools.main ?? [], tiebreaker: parsed.pools.tiebreaker ?? [] } }
}
