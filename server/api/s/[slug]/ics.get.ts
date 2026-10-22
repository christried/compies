import { eq } from 'drizzle-orm'
import { createError, defineEventHandler, getRequestURL, getRouterParam, setHeader } from 'h3'
import de from '../../../../i18n/locales/de.json'
import { sessions } from '../../../db/schema'
import { buildIcs } from '../../../domain/ics'
import { useDb } from '../../../utils/db'
import { isMember, sessionNotFound } from '../../../utils/invite'
import { requireUser } from '../../../utils/user'

// The calendar file for a Session's Date (#1 § Domain rules). Members only: a non-Member gets the
// same 404 as an unknown slug (ADR 0006). The UID is the Session id, so a Reschedule or Reopen keeps the
// calendar event and only bumps SEQUENCE. Without a Date (poll phase) there is nothing to download.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const slug = getRouterParam(event, 'slug') ?? ''

  const db = useDb(event)
  const [session] = await db.select().from(sessions).where(eq(sessions.slug, slug))
  if (!session || !(await isMember(db, session.id, user.id))) throw sessionNotFound()
  if (session.deletedAt) throw createError({ statusCode: 410, statusMessage: 'Session deleted' })
  if (!session.startsAt) throw createError({ statusCode: 404, statusMessage: 'No Date set' })

  const url = `${getRequestURL(event).origin}/s/${session.slug}`
  const file = buildIcs({
    uid: `${session.id}@compies`,
    sequence: session.icsSequence,
    startsAt: session.startsAt,
    now: new Date(),
    summary: de.mvp.ics.summary.replace('{session}', session.name),
    description: de.mvp.ics.description.replace('{url}', url),
    alarm: de.mvp.ics.alarm.replace('{session}', session.name),
    url,
  })

  setHeader(event, 'content-type', 'text/calendar; charset=utf-8')
  setHeader(event, 'content-disposition', `attachment; filename="${session.slug}.ics"`)
  return file
})
