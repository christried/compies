import { isRecord } from '../../shared/record'
import { isUuid } from './uuid'

// The pools of an Event (#146). Since 0.8 there is one, the Game pool: the game ids the Host put in it (ADR 0014, #279).
// A `tiebreaker` list in a request is accepted and ignored, because the 0.7 client can still send one during the switch-over.

/** The most games the Game pool takes; far above any real Event, it only bounds the request. */
export const POOL_GAMES_MAX = 200

export interface NewPools {
  main: string[]
}

function parseList(raw: unknown): string[] | null {
  if (raw === undefined) return []
  if (!Array.isArray(raw) || raw.length > POOL_GAMES_MAX) return null
  if (!raw.every((id): id is string => isUuid(id))) return null
  return new Set(raw.map(id => id.toLowerCase())).size === raw.length ? raw : null
}

/**
 * The `pools` of a settings change: the Game pool's list, when it was given, replaces the pool (#183). Absent means no
 * list. Every other key is ignored unvalidated. Whether the games exist is for the handler.
 */
export function parsePoolChange(raw: unknown): { ok: true, pools: Partial<NewPools> } | { ok: false, error: 'invalid_pools' } {
  if (raw === undefined) return { ok: true, pools: {} }
  if (!isRecord(raw)) return { ok: false, error: 'invalid_pools' }
  if (raw.main === undefined) return { ok: true, pools: {} }
  const main = parseList(raw.main)
  if (!main) return { ok: false, error: 'invalid_pools' }
  return { ok: true, pools: { main } }
}

/**
 * The `pools` of the create request. Absent means an empty Game pool (empty pools are allowed); the list may be missing
 * too. Whether the games exist is for the handler.
 */
export function parsePools(raw: unknown): { ok: true, pools: NewPools } | { ok: false, error: 'invalid_pools' } {
  const parsed = parsePoolChange(raw)
  if (!parsed.ok) return parsed
  return { ok: true, pools: { main: parsed.pools.main ?? [] } }
}
