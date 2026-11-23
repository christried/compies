import type { ArchiveEntry, ArchiveWinner } from '../../shared/archive'
import { composeTeamNames, type TeamMember } from '../../shared/board'
import { ceremonyRunning } from '../../shared/ceremony'
import { leadersOf, standingsAndEnd } from '../../shared/finish'
import type { Instant } from '../../shared/instant'
import type { ResultPlace } from '../../shared/results'
import { settingsFromRow } from '../../shared/settings'
import { ceremonyShownOf, ceremonyViewOf, type CeremonyRow } from '../utils/ceremony'
import type { EventRow } from '../utils/event-access'

// Archive rules (#882, #883, spec #683). Pure functions: the read loads the rows and passes them in, and the clock with them (ADR 0013).

/** What the list needs of one finished Event's row, with the viewer's own seat (`team` is null on the Stands). */
export interface ArchiveRow {
  slug: string
  name: string
  finishedAt: Date | null
  hostId: string
  teamCount: number | null
  teamSize: number | null
  team: number | null
}

/** What a card may show of the result once it is open (#883): the Winners and the viewer's own rank. */
export interface ArchiveResult { winners: ArchiveWinner[], rank: number | null }

/**
 * The columns the result of an entry is derived from: the ceremony's and the settings' (`CeremonyRow`) and the viewer's seat. `gameCount` here is
 * the Game count the settings plan, never the Rounds played (the entry's own `gameCount`).
 */
export type ArchiveResultRow = CeremonyRow & Pick<EventRow, 'ceremonyShown'> & Pick<ArchiveRow, 'team'>

/**
 * One entry of the Archive. `format` is set only when both settings columns are (an Event from before 1.3 has neither); `seated` is a
 * team seat, which the schema ties to the zone `team`, so the legacy zone `bench` reads as the Stands. `result` is `archiveResult`'s: null
 * is a closed entry, which gets no `winners` and no `rank` key at all (#883, CODING_STANDARDS § Secrecy).
 */
export function archiveEntry({ row, gameCount, memberCount, viewerId, result }: {
  row: ArchiveRow
  gameCount: number
  memberCount: number
  viewerId: string
  result: ArchiveResult | null
}): ArchiveEntry {
  return {
    slug: row.slug,
    name: row.name,
    finishedAt: row.finishedAt?.toISOString() ?? null,
    format: row.teamCount !== null && row.teamSize !== null ? { teamCount: row.teamCount, teamSize: row.teamSize } : null,
    gameCount,
    memberCount,
    isHost: row.hostId === viewerId,
    seated: row.team !== null,
    resultOpen: result !== null,
    ...result,
  }
}

/**
 * Whether the result of a finished Event is open (#883): the Award ceremony has been started at least once (`shown`, `ceremonyShownOf`) and no
 * run is going at `now`. `endsAt` is the end of the latest run, null when no run is known (a stored flag without a start, or no settings), which
 * counts as over. The lead counts as running, and the instant `endsAt` itself is over (`ceremonyRunning`).
 */
export function resultOpen({ shown, endsAt, now }: { shown: boolean, endsAt: Instant | null, now: Date }): boolean {
  return shown && (endsAt === null || !ceremonyRunning({ endsAt }, now.getTime()))
}

/**
 * The result of one entry: null while it is closed, else the Winners (the Parties on rank 1 with their Team names) and the viewer's rank. The
 * Standings are the Event page's own (`standingsAndEnd` from the Rounds' Places, one list per Round with a Result), and the run's end is
 * `ceremonyViewOf`'s, from the Winner count of those Standings, so the card opens exactly when the page's ceremony has ended (#883). Nothing is
 * worked out for an Event whose ceremony was never started. With no settings or no Round with a Result there is nothing to show: every Party would
 * lead at 0 points, as the page's `leadingTeams` guards (`hasResults`), so the result is open and empty. `members` and `stored` are the
 * Event's Member rows and `event_teams` rows, for `composeTeamNames`.
 */
export function archiveResult({ row, groups, members, stored, now }: {
  row: ArchiveResultRow
  groups: readonly (readonly Pick<ResultPlace, 'team' | 'place'>[])[]
  members: readonly TeamMember[]
  stored: readonly { position: number, frozenName: string | null }[]
  now: Date
}): ArchiveResult | null {
  const shown = ceremonyShownOf(row)
  if (!shown) return null
  const settings = settingsFromRow(row)
  const standings = settings === null ? [] : standingsAndEnd(groups, settings).standings
  const leaders = leadersOf(standings)
  if (!resultOpen({ shown, endsAt: ceremonyViewOf(row, leaders.length)?.endsAt ?? null, now })) return null
  if (settings === null || groups.length === 0) return { winners: [], rank: null }
  const names = composeTeamNames({ members, teamCount: settings.teamCount, stored })
  return {
    winners: leaders.map(position => ({ position, name: names.find(team => team.position === position)?.name ?? null })),
    rank: standings.find(standing => standing.team === row.team)?.rank ?? null,
  }
}

/** The list's order: the newest Finish first, an Event without one last, a tie by creation (newest first). A new array; the input stays as it was. */
export function arrangeArchive<T extends { finishedAt: Date | null, createdAt: Date }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => {
    if (a.finishedAt && b.finishedAt) {
      const byFinish = b.finishedAt.getTime() - a.finishedAt.getTime()
      if (byFinish !== 0) return byFinish
    }
    else if (a.finishedAt || b.finishedAt) {
      return a.finishedAt ? -1 : 1
    }
    return b.createdAt.getTime() - a.createdAt.getTime()
  })
}
