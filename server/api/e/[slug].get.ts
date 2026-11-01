import { defineEventHandler, getRouterParam } from 'h3'
import { useClock } from '../../utils/clock'
import { useDb } from '../../utils/db'
import { loadEvent } from '../../utils/event-access'
import { boardSection, countdownSection, inviteSection, membersSection, poolsSection, pollSection, readEventRows, roundsSection, sessionSection, startSection } from '../../utils/event-read'
import { settleBeforeRead } from '../../utils/rounds'
import { requireUser } from '../../utils/user'
import type { EventView } from '../../../shared/event'

// The Event link (ADR 0006): only Members can open it. A non-Member and an unknown slug get the
// same 404, so nobody can probe which Events exist. A former Member of a deleted Event gets
// 410 "Event deleted" instead (#10).
// The poll UI refetches this every 15 s (ADR 0001). The answer is composed from the section builders of
// server/utils/event-read.ts, whose reads run at the same time (#183).
// A draw whose stop has passed is settled first (#229, ADR 0013: no timer runs, the first read or write after an instant settles
// it): a cheap select finds it, and only then a locked transaction sets its game. A read with nothing due takes no lock.
export default defineEventHandler(async (event): Promise<EventView> => {
  const user = await requireUser(event)
  const db = useDb(event)
  const now = useClock(event).now()
  const eventRow = await loadEvent(db, getRouterParam(event, 'slug') ?? '', user.id)
  const viewer = { id: user.id, isHost: eventRow.hostId === user.id }
  await settleBeforeRead(db, eventRow, now)

  const [rows, pools] = await Promise.all([readEventRows(db, eventRow), poolsSection(db, eventRow, viewer)])
  const roundSections = await roundsSection(db, eventRow, rows, viewer, now)
  const countdown = await countdownSection(db, eventRow, rows)
  return {
    event: {
      slug: eventRow.slug,
      name: eventRow.name,
      phase: eventRow.phase,
      isHost: viewer.isHost,
    },
    ...pools,
    ...sessionSection(rows),
    ...inviteSection(event, eventRow, viewer),
    viewerId: user.id,
    ...pollSection(rows, viewer, now),
    ...membersSection(eventRow, rows),
    ...boardSection(eventRow, rows),
    ...startSection(eventRow, rows, viewer),
    ...roundSections,
    ...countdown,
  }
})
