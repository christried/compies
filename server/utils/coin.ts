import { coinTosses } from '../db/schema'
import { COIN_DURATION_MS, COIN_LEAD_MS } from '../../shared/coin'
import { isoInstant } from '../../shared/activity'
import type { CoinTossed, CoinView } from '../../shared/stage'
import { COIN_SIDES } from '../../shared/rounds'
import { runningOf } from '../../shared/session-state'
import { recordActivity } from './activity'
import { apiError } from './errors'
import type { ChangeCore } from './event-access'
import { coinReason, readEventState } from './event-state'

// The Coin flip of an Event (GLOSSARY: Coin flip; spec #218 § Coin flip, #235). Every toss is a row in `coin_tosses`; the server
// picks the side, stamps the instants with the request's clock (ADR 0013, amended 2026-10-31) and writes the feed entry with the
// landing as its instant, so the feed shows it only from the landing on. The rules are shared/coin.ts; the latest toss the rule and the
// Event read ask about is the Event state's (event-state.ts, #416).

export type CoinRow = typeof coinTosses.$inferSelect

/** The toss as the Event read sends it (ISO instants). */
export function coinView(row: CoinRow): CoinView {
  return { id: row.id, side: row.side, startedAt: isoInstant(row.startedAt), landsAt: isoInstant(row.landsAt) }
}

/**
 * The Host tosses the coin (#235): refused with the reason of coinReason, else a toss that starts a lead after `now` and lands a
 * duration later. The side comes from the platform's random source (`randomInt`). The feed entry is written with the landing as
 * its `at` and is not published (INSTANT_ACTIVITY_TYPES); the room hears `event.changed` only, and the clients refetch the Event read,
 * which carries the toss and shows its side from the landing on (#258). The toss is
 * stored with the Running Session, and only that Session's tosses count for `coin_in_air`: the flight of an earlier Session cannot block it (#259).
 */
export async function tossCoin({ tx, eventRow, user, publish, now }: ChangeCore, randomInt: (n: number) => number): Promise<CoinTossed> {
  const state = await readEventState(tx, eventRow, now, ['sessions', 'toss'])
  const rejection = coinReason(state, eventRow.hostId === user.id)
  if (rejection) throw apiError(rejection)
  // The rule above refused an Event without a Running Session.
  const running = runningOf(state.sessions)

  const side = COIN_SIDES[randomInt(COIN_SIDES.length)]!
  const startedAt = new Date(now.getTime() + COIN_LEAD_MS)
  const landsAt = new Date(startedAt.getTime() + COIN_DURATION_MS)
  const [toss] = await tx
    .insert(coinTosses)
    .values({ eventId: eventRow.id, sessionId: running!.id, side, tossedBy: user.id, startedAt, landsAt })
    .returning({ id: coinTosses.id })
  await recordActivity(tx, publish, eventRow.id, { type: 'coin_tossed', actorId: null, params: { side }, at: landsAt })
  return { tossId: toss!.id, side, startedAt: isoInstant(startedAt), landsAt: isoInstant(landsAt) }
}
