import { and, desc, eq } from 'drizzle-orm'
import { coinTosses } from '../db/schema'
import { COIN_DURATION_MS, COIN_LEAD_MS, coinRejection } from '../../shared/coin'
import { isoInstant } from '../../shared/activity'
import type { CoinTossed, CoinView } from '../../shared/stage'
import { COIN_SIDES } from '../../shared/rounds'
import { runningOf, type SessionTimes } from '../../shared/session-state'
import { recordActivity } from './activity'
import type { Db } from './db'
import { apiError } from './errors'
import type { EventChange, EventRow } from './event-access'
import { eventSessions } from './sessions'

// The Coin flip of an Event (GLOSSARY: Coin flip; spec #218 § Coin flip, #235). Every toss is a row in `coin_tosses`; the server
// picks the side, stamps the instants with the request's clock (ADR 0013, amended 2026-10-31) and writes the feed entry with the
// landing as its instant, so the feed shows it only from the landing on. The rules are shared/coin.ts.

export type CoinRow = typeof coinTosses.$inferSelect

/** The latest toss made in this Session, or undefined before the first one (#259). A toss without a Session belongs to none. */
async function readLatestToss(db: Db, sessionId: string): Promise<CoinRow | undefined> {
  const [row] = await db.select().from(coinTosses).where(eq(coinTosses.sessionId, sessionId)).orderBy(desc(coinTosses.startedAt)).limit(1)
  return row
}

/** The toss as the Event read sends it (ISO instants). */
export function coinView(row: CoinRow): CoinView {
  return { id: row.id, side: row.side, startedAt: row.startedAt.toISOString(), landsAt: row.landsAt.toISOString() }
}

type Change = Pick<EventChange, 'tx' | 'eventRow' | 'user' | 'publish' | 'now'>

/**
 * The Host tosses the coin (#235): refused with the reason of coinRejection, else a toss that starts a lead after `now` and lands a
 * duration later. The side comes from the platform's random source (`randomInt`). The feed entry is written with the landing as
 * its `at` and is not published (INSTANT_ACTIVITY_TYPES); the room hears `coin.tossed` with the side and the instants. The toss is
 * stored with the Running Session, and only that Session's tosses count for `coin_in_air`: the flight of an earlier Session cannot block it (#259).
 */
export async function tossCoin({ tx, eventRow, user, publish, now }: Change, randomInt: (n: number) => number): Promise<CoinTossed> {
  const sessions = await eventSessions(tx, eventRow.id)
  const running = runningOf(sessions)
  const latest = running ? await readLatestToss(tx, running.id) : undefined
  const rejection = coinRejection({
    isHost: eventRow.hostId === user.id,
    sessions,
    latest: latest ?? null,
    nowMs: now.getTime(),
  })
  if (rejection) throw apiError(rejection)

  const side = COIN_SIDES[randomInt(COIN_SIDES.length)]!
  const startedAt = new Date(now.getTime() + COIN_LEAD_MS)
  const landsAt = new Date(startedAt.getTime() + COIN_DURATION_MS)
  const [toss] = await tx
    .insert(coinTosses)
    .values({ eventId: eventRow.id, sessionId: running!.id, side, tossedBy: user.id, startedAt, landsAt })
    .returning({ id: coinTosses.id })
  await recordActivity(tx, publish, eventRow.id, { type: 'coin_tossed', actorId: null, params: { side }, at: landsAt })
  publish({ type: 'coin.tossed', tossId: toss!.id, side, startedAt: isoInstant(startedAt), landsAt: isoInstant(landsAt) })
  return { tossId: toss!.id, side, startedAt: isoInstant(startedAt), landsAt: isoInstant(landsAt) }
}

/**
 * The toss the Event read shows (#235): the latest toss made in the Running Session (`session_id`, #259; no time comparison), else
 * none. Nothing is shown without a Running Session, so the Session end clears it, and a toss without a Session (one the 0.7 code
 * wrote during the switch-over) is shown in none.
 */
export async function readShownToss(db: Db, eventRow: Pick<EventRow, 'id'>, sessions: readonly (SessionTimes & { id: string })[]): Promise<CoinRow | undefined> {
  const running = runningOf(sessions)
  if (!running) return undefined
  const [row] = await db
    .select()
    .from(coinTosses)
    .where(and(eq(coinTosses.eventId, eventRow.id), eq(coinTosses.sessionId, running.id)))
    .orderBy(desc(coinTosses.startedAt))
    .limit(1)
  return row
}
