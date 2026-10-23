import { createError, defineEventHandler, getRouterParam, setHeader } from 'h3'
import de from '../../../../i18n/locales/de.json'
import { buildIcs, fillCopy } from '../../../domain/ics'
import { useDb } from '../../../utils/db'
import { eventUrl } from '../../../utils/links'
import { loadEvent } from '../../../utils/event-access'
import { eventSession } from '../../../utils/sessions'
import { requireUser } from '../../../utils/user'

// The calendar file for an Event's Date (#1 § Domain rules). Members only: a non-Member gets the
// same 404 as an unknown slug (ADR 0006). The UID is the Session's id, so a Reschedule or Reopen keeps
// the calendar event and only bumps the Session's SEQUENCE. The migration gives an Event's first Session
// the Event's id, so entries imported before #48 keep their UID. Without a Date there is nothing to download.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const db = useDb(event)
  const eventRow = await loadEvent(db, getRouterParam(event, 'slug') ?? '', user.id)
  const session = await eventSession(db, eventRow.id)
  if (!session.startsAt) throw createError({ statusCode: 404, statusMessage: 'No Date set' })

  const url = eventUrl(event, eventRow.slug)
  const file = buildIcs({
    uid: `${session.id}@compies`,
    sequence: session.icsSequence,
    startsAt: session.startsAt,
    now: new Date(),
    summary: fillCopy(de.mvp.ics.summary, { event: eventRow.name }),
    description: fillCopy(de.mvp.ics.description, { url }),
    alarm: fillCopy(de.mvp.ics.alarm, { event: eventRow.name }),
    url,
  })

  setHeader(event, 'content-type', 'text/calendar; charset=utf-8')
  setHeader(event, 'content-disposition', `attachment; filename="${eventRow.slug}.ics"`)
  return file
})
