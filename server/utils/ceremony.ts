import { eq } from 'drizzle-orm'
import { events } from '../db/schema'
import { CEREMONY_LEAD_MS, ceremonyEndsAt, ceremonyRejection, nextGag } from '../../shared/ceremony'
import { isoInstant } from '../../shared/activity'
import type { CeremonyStarted, CeremonyView } from '../../shared/stage'
import { settingsFromRow } from '../../shared/settings'
import { apiError } from './errors'
import type { ChangeCore, EventRow } from './event-access'
import { requireSettings } from './settings'

// The Award ceremony of an Event (GLOSSARY: Award ceremony; spec #308, #309). The start and the gag are two columns of `events`; the
// server stamps the start with the request's clock plus the lead (ADR 0013, amended 2026-10-31) and the run's end follows from the Party
// count and the gag (shared/ceremony.ts), so it is never stored. The rules are shared/ceremony.ts.

/**
 * The ceremony as the Event read sends it (ISO instants): the latest start, its end and its gag, the same for every viewer. Null before the
 * first start, and for an Event without settings (no Party count, no end).
 */
export function ceremonyViewOf(row: EventRow): CeremonyView | null {
  const settings = settingsFromRow(row)
  if (row.ceremonyStartsAt === null || row.ceremonyGag === null || settings === null) return null
  return {
    startsAt: isoInstant(row.ceremonyStartsAt),
    endsAt: isoInstant(new Date(ceremonyEndsAt(row.ceremonyStartsAt, settings.teamCount, row.ceremonyGag))),
    gag: row.ceremonyGag,
  }
}

/**
 * The Host starts the ceremony (#309): refused with the reason of ceremonyRejection, else the start is `now` plus the lead and the gag the
 * other one than last time (the first start picks through `randomInt`). A restart overwrites both columns. No Activity entry and no
 * message of its own: `changeEvent` tells the room `event.changed`, and the clients refetch the Event read, which carries the ceremony.
 */
export async function startCeremony({ tx, eventRow, user, now }: ChangeCore, randomInt: (n: number) => number): Promise<CeremonyStarted> {
  const rejection = ceremonyRejection({ isHost: eventRow.hostId === user.id, phase: eventRow.phase, latest: ceremonyViewOf(eventRow), now })
  if (rejection) throw apiError(rejection)

  requireSettings(eventRow)
  const ceremonyStartsAt = new Date(now.getTime() + CEREMONY_LEAD_MS)
  const ceremonyGag = nextGag(eventRow.ceremonyGag, randomInt)
  await tx.update(events).set({ ceremonyStartsAt, ceremonyGag }).where(eq(events.id, eventRow.id))
  return ceremonyViewOf({ ...eventRow, ceremonyStartsAt, ceremonyGag })!
}
