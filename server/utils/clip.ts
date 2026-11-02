import { and, desc, eq, lte } from 'drizzle-orm'
import { draws, games, rounds } from '../db/schema'
import { clipWindow } from '../../shared/clip'
import type { ClipSkipped, ClipView } from '../../shared/event'
import { runningOf } from '../../shared/session-state'
import type { Db } from './db'
import { apiError } from './errors'
import type { EventChange } from './event-access'
import { roundGameView } from './library'
import { settleDue } from './rounds'
import { eventSessions, type SessionRow } from './sessions'

// The synced clip (GLOSSARY: Clip; spec #218 § Clip, #230). A clip is a read of a draw's instants, not a row: no timer runs, and
// the only thing stored is the Host's skip (`draws.clip_skipped_at`), so it reaches Members who join later. The rule is
// shared/clip.ts; every instant comes from the request's clock (ADR 0013, amended 2026-10-31).

/** The clip that runs at `now` in a Running Session, the same for every Member, or null. */
export async function readClip(db: Db, eventId: string, sessions: readonly SessionRow[], now: Date): Promise<ClipView | null> {
  if (!runningOf(sessions)) return null
  // The latest draw that has stopped, and only that one: a draw skipped or put back does not hand its clip back to an earlier one.
  // Selecting only draws with `stopAt <= now` keeps the game out of a read before the stop (secrecy under a Hidden wheel).
  const [latest] = await db
    .select({ draw: draws, game: games, putBackAt: rounds.putBackAt })
    .from(draws)
    .innerJoin(rounds, eq(draws.roundId, rounds.id))
    .innerJoin(games, eq(draws.gameId, games.id))
    .where(and(eq(rounds.eventId, eventId), lte(draws.stopAt, now)))
    .orderBy(desc(draws.stopAt), desc(draws.committedAt), desc(draws.id))
    .limit(1)
  if (!latest || latest.draw.clipSkippedAt !== null || latest.putBackAt !== null) return null
  const window = clipWindow(latest.draw, latest.game)
  if (now.getTime() >= window.endsAt) return null
  return { drawId: latest.draw.id, startAt: new Date(window.startAt).toISOString(), endsAt: new Date(window.endsAt).toISOString(), game: roundGameView(latest.game) }
}

type Change = Pick<EventChange, 'tx' | 'eventRow'>

/**
 * The Host skips the clip that runs (#230, spec #218 § Clip): for everyone, also for those who join later, because the instant is
 * stored on the draw. A draw that stopped is settled first (#229), then the clip is the one the read would show at `now`; none
 * is `no_clip`. `changeEvent` publishes `event.changed` after the commit, so every client refetches and closes its player.
 */
export async function skipClip({ tx, eventRow }: Change, now: Date): Promise<ClipSkipped> {
  await settleDue(tx, eventRow, now)
  const clip = await readClip(tx, eventRow.id, await eventSessions(tx, eventRow.id), now)
  if (!clip) throw apiError('no_clip')
  await tx.update(draws).set({ clipSkippedAt: now }).where(eq(draws.id, clip.drawId))
  return { drawId: clip.drawId }
}
