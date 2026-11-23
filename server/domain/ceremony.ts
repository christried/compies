import { isoInstant } from '../../shared/activity'
import { ceremonyEndsAt } from '../../shared/ceremony'
import { settingsFromRow } from '../../shared/settings'
import type { CeremonyView } from '../../shared/stage'

// The pure reads of an Event's Award ceremony (GLOSSARY: Award ceremony; spec #308, #309): what the Event read and the Archive derive from the
// row's columns. They live here, not in server/utils/ceremony.ts (the Host's start, which reads and writes the database), so the Archive's
// domain file imports nothing from server/utils/ (#984).

/** The columns `ceremonyViewOf` reads: the settings' (the Party count) and the ceremony's own. The Archive's read selects exactly these (#883). */
export type CeremonyRow = Parameters<typeof settingsFromRow>[0] & {
  ceremonyStartsAt: Date | null
  ceremonyGag: CeremonyView['gag'] | null
}

/**
 * The ceremony as the Event read sends it (ISO instants): the latest start, its end and its gag, the same for every viewer. Null before the
 * first start, and for an Event without settings (no Party count, no end). `winners` is the Winner count of the Standings (#315); the end is
 * the one of the default layout, never of a viewer's screen.
 */
export function ceremonyViewOf(row: CeremonyRow, winners: number): CeremonyView | null {
  const settings = settingsFromRow(row)
  if (row.ceremonyStartsAt === null || row.ceremonyGag === null || settings === null) return null
  return {
    startsAt: isoInstant(row.ceremonyStartsAt),
    endsAt: isoInstant(new Date(ceremonyEndsAt(row.ceremonyStartsAt, { partyCount: settings.teamCount, winners, gag: row.ceremonyGag }))),
    gag: row.ceremonyGag,
  }
}

/**
 * Whether the Award ceremony has been started at least once (#445): the finished page shows its result only from then on. The stored flag, or a stored start: the previous
 * deployment starts a ceremony by writing the start and the gag only (ADR 0007), and a start is shown by definition. A restart changes nothing.
 */
export function ceremonyShownOf(row: { ceremonyShown: boolean, ceremonyStartsAt: Date | null }): boolean {
  return row.ceremonyShown || row.ceremonyStartsAt !== null
}
