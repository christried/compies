/** A Party on rank 1 of a finished Event (#883). `name` is the Team name (BoardTeam's): null = the Team colour's name, which the client shows. */
export interface ArchiveWinner { position: number, name: string | null }

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
  /** The Award ceremony has been started at least once and no run is going at the moment of the read (#883). The same for every viewer. */
  resultOpen: boolean
  /**
   * Only when `resultOpen`: the Parties on rank 1 (`leadersOf`), ascending by `position`; more than one is „Unentschieden“. Empty when there is
   * nothing to show (no settings, no Result). A closed entry does not carry the key, nor anything derived from it (CODING_STANDARDS § Secrecy).
   */
  winners?: ArchiveWinner[]
  /** Only when `resultOpen`: the viewer's rank (`Standing.rank`, shared as it is), null for a Member on the Stands. Absent on a closed entry. */
  rank?: number | null
}

export interface ArchiveView { events: ArchiveEntry[] }
