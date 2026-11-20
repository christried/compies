import { defineEventHandler, getQuery, getRouterParam } from 'h3'
import type { MessagePage } from '../../../../../shared/chat'
import { parsePageQuery } from '../../../../domain/paging'
import { readMessagePage } from '../../../../utils/chat'
import { useDb } from '../../../../utils/db'
import { apiError } from '../../../../utils/errors'
import { loadEvent } from '../../../../utils/event-access'
import { requireUser } from '../../../../utils/user'

// The Chat of an Event (#759, spec #719 § A): only Members read it, with the same answers as the Event read (401, 404, 410). A page of the Messages, newest
// first, `limit` of them (default 50, at most 100) older than the Message `before`; `next` is the `before` of the following page, null at the oldest. A deleted
// Message is its line, with no text. The read asks no clock and settles nothing: nothing in the Chat waits for an instant, and a finished Event reads as usual.
export default defineEventHandler(async (event): Promise<MessagePage> => {
  const user = await requireUser(event)
  const db = useDb(event)
  const eventRow = await loadEvent(db, getRouterParam(event, 'slug') ?? '', user.id)

  const query = parsePageQuery(getQuery(event))
  if (!query.ok) throw apiError(query.error)
  return readMessagePage(db, eventRow.id, query.before, query.limit)
})
