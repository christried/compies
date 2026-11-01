import { ACTIVITY_PAGE_DEFAULT, ACTIVITY_PAGE_MAX } from '../../shared/activity'
import { isUuid } from './uuid'

// The query of the Activity feed (#159, spec #153 § API contracts): `before` is the id of an entry, `limit` a whole
// number from 1 to ACTIVITY_PAGE_MAX. A bad `before` is an invalid_cursor, a bad `limit` an invalid_value (N5, review 1.4).

export type ActivityQuery = { ok: true, before: string | undefined, limit: number } | { ok: false, error: 'invalid_cursor' | 'invalid_value' }

/** The feed's query string, read: the cursor and the page size, or the error the request earns. */
export function parseActivityQuery(query: { before?: unknown, limit?: unknown }): ActivityQuery {
  const { before, limit } = query
  if (before !== undefined && !isUuid(before)) return { ok: false, error: 'invalid_cursor' }
  if (limit === undefined) return { ok: true, before, limit: ACTIVITY_PAGE_DEFAULT }
  if (typeof limit !== 'string' || !/^\d+$/.test(limit) || Number(limit) < 1 || Number(limit) > ACTIVITY_PAGE_MAX) return { ok: false, error: 'invalid_value' }
  return { ok: true, before, limit: Number(limit) }
}
