import { defineEventHandler, getQuery, getRouterParam } from 'h3'
import { readActivityPage } from '../../../utils/activity'
import { parseActivityQuery } from '../../../domain/activity'
import { useClock } from '../../../utils/clock'
import { useDb } from '../../../utils/db'
import { apiError } from '../../../utils/errors'
import { loadEvent } from '../../../utils/event-access'
import { requireUser } from '../../../utils/user'
import type { ActivityPage } from '../../../../shared/activity'

// The Activity feed of an Event (#159, spec #153 § API contracts): only Members read it, with the same answers as the
// Event read (401, 404). Newest first, `limit` entries (default 50, at most 100) older than the entry `before`; `next`
// is the `before` of the following page, null at the oldest entry.
export default defineEventHandler(async (event): Promise<ActivityPage> => {
  const user = await requireUser(event)
  const db = useDb(event)
  const eventRow = await loadEvent(db, getRouterParam(event, 'slug') ?? '', user.id)

  const query = parseActivityQuery(getQuery(event))
  if (!query.ok) throw apiError(query.error)
  return readActivityPage(db, eventRow.id, query.before, query.limit, useClock(event).now())
})
