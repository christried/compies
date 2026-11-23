/** One finished Event in the Archive (`GET /api/archive`, #882). Times are UTC ISO strings. */
export interface ArchiveEntry {
  slug: string
  name: string
  /** When the Host finished the Event; null only for a hand-edited row (it is listed last and shows no date). */
  finishedAt: string | null
  /** The Event's Format with team count and size; null for an Event from before 1.3 whose settings were never set. */
  format: { teamCount: number, teamSize: number } | null
  /** Rounds with a Result (`rounds.resultAt` not null). */
  gameCount: number
  memberCount: number
  isHost: boolean
  /** The viewer has a team seat (`event_members.team` is not null); false = on the Stands. */
  seated: boolean
}

export interface ArchiveView { events: ArchiveEntry[] }
