import { createError, defineEventHandler, getRouterParam, setHeader } from 'h3'
import de from '../../../../i18n/locales/de.json'
import { buildIcs, sessionEntries } from '../../../domain/ics'
import { useDb } from '../../../utils/db'
import { eventUrl } from '../../../utils/links'
import { loadEvent } from '../../../utils/event-access'
import { eventSessions } from '../../../utils/sessions'
import { requireUser } from '../../../utils/user'

// The calendar file for an Event's Dates (#1 § Domain rules, #53). Members only: a non-Member gets the
// same 404 as an unknown slug (ADR 0006). One entry per Session with a Date. The UID is the Session's id,
// so a Reschedule or a changed number keeps the calendar entry and only bumps its SEQUENCE. The migration
// gives an Event's first Session the Event's id, so entries imported before #48 keep their UID. Without
// any Date there is nothing to download.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const db = useDb(event)
  const eventRow = await loadEvent(db, getRouterParam(event, 'slug') ?? '', user.id)
  const url = eventUrl(event, eventRow.slug)
  const entries = sessionEntries({
    eventName: eventRow.name,
    url,
    sessions: await eventSessions(db, eventRow.id),
    copy: de.mvp.ics,
  })
  if (entries.length === 0) throw createError({ statusCode: 404, statusMessage: 'No Date set' })

  const file = buildIcs(entries, new Date())

  setHeader(event, 'content-type', 'text/calendar; charset=utf-8')
  setHeader(event, 'content-disposition', `attachment; filename="${eventRow.slug}.ics"`)
  return file
})
