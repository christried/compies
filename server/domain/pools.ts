import { isUuid } from './uuid'

// The Game pool of an Event (#146): the one pool since 0.8, the game ids the Host put in it (ADR 0014, #279, #286).

/** The most games the Game pool takes; far above any real Event, it only bounds the request. */
export const POOL_GAMES_MAX = 200

function parseList(raw: unknown): string[] | null {
  if (!Array.isArray(raw) || raw.length > POOL_GAMES_MAX) return null
  if (!raw.every((id): id is string => isUuid(id))) return null
  return new Set(raw.map(id => id.toLowerCase())).size === raw.length ? raw : null
}

/**
 * The `pool` of a settings change: the Game pool's list, when it was given, replaces the pool (#183). Absent means no
 * list (`pool` is undefined). Whether the games exist is for the handler.
 */
export function parsePoolChange(raw: unknown): { ok: true, pool: string[] | undefined } | { ok: false, error: 'invalid_pools' } {
  if (raw === undefined) return { ok: true, pool: undefined }
  const pool = parseList(raw)
  if (!pool) return { ok: false, error: 'invalid_pools' }
  return { ok: true, pool }
}

/**
 * The `pool` of the create request. Absent means an empty Game pool (empty pools are allowed). Whether the games exist
 * is for the handler.
 */
export function parsePools(raw: unknown): { ok: true, pool: string[] } | { ok: false, error: 'invalid_pools' } {
  const parsed = parsePoolChange(raw)
  if (!parsed.ok) return parsed
  return { ok: true, pool: parsed.pool ?? [] }
}
