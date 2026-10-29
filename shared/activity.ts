// The Activity feed (GLOSSARY: Activity feed, spec #153, #159): the types the table, the API and the room share.
// An entry's params hold ids, numbers and instants only, never a game (no name, id, image, video), so a Hidden wheel
// stays hidden in the feed (spec stories 69, 71).

import type { Place } from './board'

/** Every entry type of 1.4. All of them are in the database enum now, so later tickets need no enum migration. */
export const ACTIVITY_TYPES = [
  'member_joined',
  'member_moved',
  'date_set',
  'date_rescheduled',
  'date_reopened',
  'session_added',
  'session_removed',
  'session_started',
  'session_ended',
  'team_name_reset',
  'game_count_changed',
  'team_size_changed',
] as const
export type ActivityType = (typeof ACTIVITY_TYPES)[number]

/** Where a Member stands on the Game board: the Bench, the Stands (Tribüne) or a team by its position. */
export type Place = { zone: 'bench' | 'stands' } | { zone: 'team', team: number }

/** The params of each entry type. Instants are ISO strings; `number` is the number the Session was shown with. */
export interface ActivityParams {
  member_joined: Record<string, never>
  member_moved: { userId: string, from: Place, to: Place }
  date_set: { sessionId: string, number: number | null, startsAt: string }
  date_rescheduled: { sessionId: string, number: number | null, from: string, to: string }
  date_reopened: { sessionId: string, number: number | null, previousStartsAt: string }
  session_added: { sessionId: string, startsAt: string | null }
  session_removed: { sessionId: string, number: number | null, startsAt: string | null }
  session_started: { sessionId: string, number: number | null }
  session_ended: { sessionId: string, number: number | null }
  team_name_reset: { team: number }
  game_count_changed: { from: number, to: number }
  team_size_changed: { from: number, to: number }
}

interface EntryBase {
  id: string
  /** ISO instant. */
  at: string
  /** Who did it; null when the app did (no one acted). */
  actor: { id: string, name: string } | null
  /** The name of every User id inside `params`, so the client never needs the members list (`shownName`). */
  people: Record<string, string>
}

/** One entry as the feed endpoint and the room send it: the type decides the shape of the params. */
export type ActivityEntry = { [T in ActivityType]: EntryBase & { type: T, params: ActivityParams[T] } }[ActivityType]

/** What the feed endpoint answers: newest first; `next` is the cursor for the page before these, null at the end. */
export interface ActivityPage {
  entries: ActivityEntry[]
  next: string | null
}

export const ACTIVITY_PAGE_DEFAULT = 50
export const ACTIVITY_PAGE_MAX = 100
