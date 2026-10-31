import type { H3Event } from 'h3'
import { datePollOpen } from '../../shared/event'
import { missingDates } from '../domain/session'
import { apiError } from './errors'
import { changeEvent, type EventChange } from './event-access'
import { eventSessions } from './sessions'

// A Host's Slot edit (#15). Runs through changeEvent and locks the Event row, so two edits of one Event queue up and
// the 8-Slot limit holds; Votes wait for the edit too. Same answers as the Event link (ADR 0006). Only the Host of
// this Event may edit its Slots (#1 § Domain rules), and only while the Date poll is open (datePollOpen, #164: also in a running Event while a Session waits for a Date).
export function changeSlots<T>(event: H3Event, change: (ctx: EventChange) => Promise<T>): Promise<T> {
  return changeEvent(event, { hostOnly: true, lock: 'update' }, async (ctx) => {
    const waiting = missingDates((await eventSessions(ctx.tx, ctx.eventRow.id)).map(row => row.startsAt))
    if (!datePollOpen(ctx.eventRow.phase, waiting)) throw apiError('wrong_phase')
    return change(ctx)
  })
}
