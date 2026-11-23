import { eq } from 'drizzle-orm'
import { events } from '../db/schema'
import { CEREMONY_LEAD_MS, ceremonyRejection, nextGag } from '../../shared/ceremony'
import { leadersOf } from '../../shared/finish'
import type { CeremonyStarted } from '../../shared/stage'
import { settingsFromRow } from '../../shared/settings'
import { ceremonyViewOf } from '../domain/ceremony'
import { apiError } from './errors'
import type { ChangeCore } from './event-access'
import { readEventState } from './event-state'
import { requireSettings } from './settings'

// The Award ceremony of an Event (GLOSSARY: Award ceremony; spec #308, #309). The start and the gag are two columns of `events`; the
// server stamps the start with the request's clock plus the lead (ADR 0013, amended 2026-10-31) and the run's end follows from the Party
// count, the Winner count and the gag (shared/ceremony.ts), so it is never stored. The Winner count is the Parties on rank 1 of the
// Standings; a finished Event is read-only (no reopening), so it cannot change after the Finish and no column keeps it (#315).

/**
 * The Host starts the ceremony (#309): refused with the reason of ceremonyRejection, else the start is `now` plus the lead and the gag the
 * other one than last time (the first start picks through `randomInt`). A restart overwrites both columns. No Activity entry and no
 * message of its own: `changeEvent` tells the room `event.changed`, and the clients refetch the Event read, which carries the ceremony.
 */
export async function startCeremony({ tx, eventRow, user, now }: ChangeCore, randomInt: (n: number) => number): Promise<CeremonyStarted> {
  const isHost = eventRow.hostId === user.id
  // not_host and wrong_phase need no Standings, so they are refused before the read (#315, review 0.9).
  const early = ceremonyRejection({ isHost, phase: eventRow.phase, latest: null, now })
  if (early) throw apiError(early)
  // The previous run's end depends on the Winner count (#315), so the Standings are read before ceremony_running is decided.
  const known = settingsFromRow(eventRow)
  const winners = known === null ? 0 : leadersOf((await readEventState(tx, eventRow, now, ['rounds'])).standing!.standings).length
  const rejection = ceremonyRejection({ isHost, phase: eventRow.phase, latest: ceremonyViewOf(eventRow, winners), now })
  if (rejection) throw apiError(rejection)

  requireSettings(eventRow)
  const ceremonyStartsAt = new Date(now.getTime() + CEREMONY_LEAD_MS)
  const ceremonyGag = nextGag(eventRow.ceremonyGag, randomInt)
  await tx.update(events).set({ ceremonyStartsAt, ceremonyGag, ceremonyShown: true }).where(eq(events.id, eventRow.id))
  return ceremonyViewOf({ ...eventRow, ceremonyStartsAt, ceremonyGag }, winners)!
}
