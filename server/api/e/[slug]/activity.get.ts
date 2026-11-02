import { defineEventHandler, getQuery, getRouterParam } from 'h3'
import { readActivityPage } from '../../../utils/activity'
import { parseActivityQuery } from '../../../domain/activity'
import { useClock } from '../../../utils/clock'
import { useDb } from '../../../utils/db'
import { apiError } from '../../../utils/errors'
import { loadEvent } from '../../../utils/event-access'
import { settleBeforeRead } from '../../../utils/rounds'
import { requireUser } from '../../../utils/user'
import type { ActivityPage } from '../../../../shared/activity'

// The Activity feed of an Event (#159, spec #153 § API contracts): only Members read it, with the same answers as the
// Event read (401, 404). Newest first, `limit` entries (default 50, at most 100) older than the entry `before`; `next`
// is the `before` of the following page, null at the oldest entry. A draw that is due is settled first, as in the Event read
// (#231): the entry that reveals the Vetoes is written when the window's end is settled, and the page refetches the feed
// at that instant in parallel with the Event read, so neither may depend on the other having run.
export default defineEventHandler(async (event): Promise<ActivityPage> => {
  const user = await requireUser(event)
  const db = useDb(event)
  const now = useClock(event).now()
  const eventRow = await loadEvent(db, getRouterParam(event, 'slug') ?? '', user.id)

  const query = parseActivityQuery(getQuery(event))
  if (!query.ok) throw apiError(query.error)
  await settleBeforeRead(db, eventRow, now)
  return readActivityPage(db, eventRow.id, query.before, query.limit, now)
})
