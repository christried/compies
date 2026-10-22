import { createError, defineEventHandler, getRouterParam, setHeader } from 'h3'
import de from '../../../../i18n/locales/de.json'
import { buildIcs, fillCopy } from '../../../domain/ics'
import { useDb } from '../../../utils/db'
import { sessionUrl } from '../../../utils/links'
import { loadSession } from '../../../utils/session-access'
import { requireUser } from '../../../utils/user'

// The calendar file for a Session's Date (#1 § Domain rules). Members only: a non-Member gets the
// same 404 as an unknown slug (ADR 0006). The UID is the Session id, so a Reschedule or Reopen keeps the
// calendar event and only bumps SEQUENCE. Without a Date (poll phase) there is nothing to download.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const session = await loadSession(useDb(event), getRouterParam(event, 'slug') ?? '', user.id)
  if (!session.startsAt) throw createError({ statusCode: 404, statusMessage: 'No Date set' })

  const url = sessionUrl(event, session.slug)
  const file = buildIcs({
    uid: `${session.id}@compies`,
    sequence: session.icsSequence,
    startsAt: session.startsAt,
    now: new Date(),
    summary: fillCopy(de.mvp.ics.summary, { session: session.name }),
    description: fillCopy(de.mvp.ics.description, { url }),
    alarm: fillCopy(de.mvp.ics.alarm, { session: session.name }),
    url,
  })

  setHeader(event, 'content-type', 'text/calendar; charset=utf-8')
  setHeader(event, 'content-disposition', `attachment; filename="${session.slug}.ics"`)
  return file
})
