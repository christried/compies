import { defineEventHandler, getQuery, getRouterParam } from 'h3'
import { readActivityPage } from '../../../utils/activity'
import { useDb } from '../../../utils/db'
import { apiError } from '../../../utils/errors'
import { loadEvent } from '../../../utils/event-access'
import { requireUser } from '../../../utils/user'
import { ACTIVITY_PAGE_DEFAULT, ACTIVITY_PAGE_MAX, type ActivityPage } from '../../../../shared/activity'

const ENTRY_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// The Activity feed of an Event (#159, spec #153 § API contracts): only Members read it, with the same answers as the
// Event read (401, 404). Newest first, `limit` entries (default 50, at most 100) older than the entry `before`; `next`
// is the `before` of the following page, null at the oldest entry.
export default defineEventHandler(async (event): Promise<ActivityPage> => {
  const user = await requireUser(event)
  const db = useDb(event)
  const eventRow = await loadEvent(db, getRouterParam(event, 'slug') ?? '', user.id)

  const { before, limit } = getQuery(event)
  if (before !== undefined && (typeof before !== 'string' || !ENTRY_ID.test(before))) throw apiError('invalid_cursor')
  if (limit !== undefined && (typeof limit !== 'string' || !/^\d+$/.test(limit) || Number(limit) < 1 || Number(limit) > ACTIVITY_PAGE_MAX)) throw apiError('invalid_cursor')
  return readActivityPage(db, eventRow.id, before, limit === undefined ? ACTIVITY_PAGE_DEFAULT : Number(limit))
})
