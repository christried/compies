import { eq } from 'drizzle-orm'
import { countdowns } from '../db/schema'
import { countdownRejection, remainingMsAt, type CountdownAction } from '../../shared/countdown'
import { runningOf } from '../../shared/session-state'
import type { CountdownView } from '../../shared/event'
import type { Db } from './db'
import { apiError } from './errors'
import type { EventChange } from './event-access'
import { eventSessions } from './sessions'

// The Countdown of an Event (GLOSSARY: Countdown; spec #218 § Countdown, #236). One row per Event, during its Running Session
// only. Every instant comes from the request's clock (ADR 0013, amended 2026-10-31); the rules are shared/countdown.ts. Ending the
// Session deletes the row (sessions/end.post.ts), so no Countdown outlives its Session.

export type CountdownRow = typeof countdowns.$inferSelect

/** The Event's Countdown, or undefined while it has none. */
export async function readCountdown(db: Db, eventId: string): Promise<CountdownRow | undefined> {
  const [row] = await db.select().from(countdowns).where(eq(countdowns.eventId, eventId))
  return row
}

/** The Countdown as the Event read and the change answers send it: the stored facts; the time left is computed from them. */
export function countdownView(row: Pick<CountdownRow, 'durationMs' | 'remainingMs' | 'startedAt'>): CountdownView {
  return { durationMs: row.durationMs, remainingMs: row.remainingMs, startedAt: row.startedAt?.toISOString() ?? null }
}

type Change = Pick<EventChange, 'tx' | 'eventRow' | 'publish'>

/** Refuses with no_running_session unless the Event has a Running Session (the same answer as ending one). */
async function requireRunningSession({ tx, eventRow }: Change): Promise<void> {
  if (!runningOf(await eventSessions(tx, eventRow.id))) throw apiError('no_running_session')
}

/** The Host sets the Countdown to `seconds` (ready at its full duration), creating it or replacing a paused or ended one. */
export async function setCountdown(change: Change, now: Date, seconds: number): Promise<CountdownView> {
  await requireRunningSession(change)
  const current = await readCountdown(change.tx, change.eventRow.id)
  const rejection = countdownRejection('set', current ?? null, now.getTime())
  if (rejection) throw apiError(rejection)

  const durationMs = seconds * 1000
  const [row] = await change.tx
    .insert(countdowns)
    .values({ eventId: change.eventRow.id, durationMs, remainingMs: durationMs, startedAt: null })
    .onConflictDoUpdate({ target: countdowns.eventId, set: { durationMs, remainingMs: durationMs, startedAt: null } })
    .returning()
  change.publish({ type: 'countdown.changed' })
  return countdownView(row!)
}

/** Starts the Countdown from ready or paused (a paused one resumes from the time it has left). */
export function startCountdown(change: Change, now: Date): Promise<CountdownView> {
  return changeRunning('start', change, now)
}

/** Pauses the running Countdown with the time it has left at `now`. */
export function pauseCountdown(change: Change, now: Date): Promise<CountdownView> {
  return changeRunning('pause', change, now)
}

/** Resets the Countdown to its full duration, not running. */
export function resetCountdown(change: Change, now: Date): Promise<CountdownView> {
  return changeRunning('reset', change, now)
}

async function changeRunning(action: Exclude<CountdownAction, 'set'>, change: Change, now: Date): Promise<CountdownView> {
  await requireRunningSession(change)
  const row = await readCountdown(change.tx, change.eventRow.id)
  const rejection = countdownRejection(action, row ?? null, now.getTime())
  if (rejection) throw apiError(rejection)

  const next = action === 'start'
    ? { startedAt: now }
    : action === 'pause'
      ? { remainingMs: remainingMsAt(row!, now.getTime()), startedAt: null }
      : { remainingMs: row!.durationMs, startedAt: null }
  const [updated] = await change.tx.update(countdowns).set(next).where(eq(countdowns.eventId, change.eventRow.id)).returning()
  change.publish({ type: 'countdown.changed' })
  return countdownView(updated!)
}
