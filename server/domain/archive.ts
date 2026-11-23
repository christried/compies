import type { ArchiveEntry } from '../../shared/archive'

// Archive rules (#882, spec #683). Pure functions: the read loads the rows and passes them in. No clock: nothing in the list depends on now.

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

/**
 * One entry of the Archive. `format` is set only when both settings columns are (an Event from before 1.3 has neither); `seated` is a
 * team seat, which the schema ties to the zone `team`, so the legacy zone `bench` reads as the Stands.
 */
export function archiveEntry({ row, gameCount, memberCount, viewerId }: {
  row: ArchiveRow
  gameCount: number
  memberCount: number
  viewerId: string
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
