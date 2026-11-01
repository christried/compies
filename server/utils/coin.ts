import { desc, eq } from 'drizzle-orm'
import { coinTosses } from '../db/schema'
import { COIN_DURATION_MS, COIN_LEAD_MS, coinRejection } from '../../shared/coin'
import { isoInstant } from '../../shared/activity'
import type { CoinTossed, CoinView } from '../../shared/event'
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

/** The Event's latest toss, or undefined before the first one. */
export async function readLatestToss(db: Db, eventId: string): Promise<CoinRow | undefined> {
  const [row] = await db.select().from(coinTosses).where(eq(coinTosses.eventId, eventId)).orderBy(desc(coinTosses.startedAt)).limit(1)
  return row
}

/** The toss as the Event read sends it (ISO instants). */
export function coinView(row: CoinRow): CoinView {
  return { id: row.id, side: row.side, startedAt: row.startedAt.toISOString(), landsAt: row.landsAt.toISOString() }
}

type Change = Pick<EventChange, 'tx' | 'eventRow' | 'user' | 'publish'>

/**
 * The Host tosses the coin (#235): refused with the reason of coinRejection, else a toss that starts a lead after `now` and lands a
 * duration later. The side comes from the platform's random source (`randomInt`). The feed entry is written with the landing as
 * its `at` and is not published (INSTANT_ACTIVITY_TYPES); the room hears `coin.tossed` with the side and the instants.
 */
export async function tossCoin({ tx, eventRow, user, publish }: Change, now: Date, randomInt: (n: number) => number): Promise<CoinTossed> {
  const latest = await readLatestToss(tx, eventRow.id)
  const rejection = coinRejection({
    isHost: eventRow.hostId === user.id,
    sessions: await eventSessions(tx, eventRow.id),
    latest: latest ?? null,
    nowMs: now.getTime(),
  })
  if (rejection) throw apiError(rejection)

  const side = COIN_SIDES[randomInt(COIN_SIDES.length)]!
  const startedAt = new Date(now.getTime() + COIN_LEAD_MS)
  const landsAt = new Date(startedAt.getTime() + COIN_DURATION_MS)
  const [toss] = await tx
    .insert(coinTosses)
    .values({ eventId: eventRow.id, side, tossedBy: user.id, startedAt, landsAt })
    .returning({ id: coinTosses.id })
  await recordActivity(tx, publish, eventRow.id, { type: 'coin_tossed', actorId: null, params: { side }, at: landsAt })
  publish({ type: 'coin.tossed', tossId: toss!.id, side, startedAt: isoInstant(startedAt), landsAt: isoInstant(landsAt) })
  return { tossId: toss!.id, side, startedAt: isoInstant(startedAt), landsAt: isoInstant(landsAt) }
}

/**
 * The toss the Event read shows (#235): the Event's latest toss, when it was started in the running Session, else null. Nothing
 * is shown without a running Session, so the Session end clears it.
 */
export async function readShownToss(db: Db, eventRow: Pick<EventRow, 'id'>, sessions: readonly SessionTimes[]): Promise<CoinRow | undefined> {
  const running = runningOf(sessions)
  if (!running) return undefined
  const latest = await readLatestToss(db, eventRow.id)
  return latest && latest.startedAt.getTime() >= new Date(running.startedAt).getTime() ? latest : undefined
}
