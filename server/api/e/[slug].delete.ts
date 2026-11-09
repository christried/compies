import { eq } from 'drizzle-orm'
import { defineEventHandler } from 'h3'
import { events } from '../../db/schema'
import { apiError } from '../../utils/errors'
import { changeEvent } from '../../utils/event-access'
import { eventSessions } from '../../utils/sessions'
import { runningOf } from '../../../shared/session-state'
import type { EventDeleted } from '../../../shared/event'

// The Host deletes the Event (#333, spec #332, GLOSSARY: Deleted Event): a soft delete that sets the deleted mark and writes nothing else.
// Every Phase, the finished Event included (allowFinished), except while a Running Session exists (session_running). The access rule
// (server/domain/access.ts) turns the mark into 410 „Event deleted“ for every Event route from now on, so a second delete answers 410 too.
// changeEvent publishes the usual event.changed after the response (ADR 0013): every open page refetches, gets the 410 and shows „Event gelöscht“.
export default defineEventHandler((event): Promise<EventDeleted> => changeEvent(event, { hostOnly: true, lock: 'update', allowFinished: true }, async ({ tx, now, eventRow }) => {
  if (runningOf(await eventSessions(tx, eventRow.id))) throw apiError('session_running')
  await tx.update(events).set({ deletedAt: now }).where(eq(events.id, eventRow.id))
  return { slug: eventRow.slug }
}))
