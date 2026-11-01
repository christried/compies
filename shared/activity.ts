// The Activity feed (GLOSSARY: Activity feed, spec #153, #159): the types the table, the API and the room share.
// An entry's params hold ids, numbers, instants and places only, never a game's name, image or video, so a Hidden wheel
// stays hidden in the feed (spec stories 69, 71); ActivityParams checks that at compile time (#226, review 1.4 A6).

import type { Place } from './board'

/**
 * Every entry type. The database enum is built from this list, so a new type needs an enum migration: one per Release,
 * which adds every type the Release writes (0.7: the six after `team_size_changed`, migration 0016, #226).
 */
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
  'game_drawn',
  'vetoes_revealed',
  'game_set',
  'game_put_back',
  'bonus_veto_granted',
  'coin_tossed',
] as const
export type ActivityType = (typeof ACTIVITY_TYPES)[number]

/**
 * The entry types whose entry waits for its instant (#229, spec #218 § Deadlines): written with `at` set to the instant they
 * may be read from, not published, and left out of the feed until then (the clients refetch it when the instant passes). The
 * others have an `at` the database stamps, which a test clock must not hide. `vetoes_revealed` (#231) waits for the end of its
 * Veto window. #235 adds `coin_tossed`.
 */
export const INSTANT_ACTIVITY_TYPES: readonly ActivityType[] = ['game_drawn', 'vetoes_revealed']

/** An instant in the params: an ISO string, built from a `Date` by `isoInstant` (the stored rows already hold these). */
export type IsoInstant = `${number}-${number}-${number}T${string}`

/** The ISO instant of a `Date`, in the shape the params hold. */
export function isoInstant(at: Date): IsoInstant {
  return at.toISOString() as IsoInstant
}

// The rule for a param: a number, a boolean, null, an instant, a string literal (`'heads' | 'tails'`), a Place, or an
// array or object of those. A wide `string` is allowed only under a key that ends in `Id` (`userId`, `sessionId`,
// `roundId`, `drawId`, `gameId`), so a game's name has no key to sit under. Functions and everything else are refused.
type SafeParam<V, K>
  = V extends null | number | boolean ? true
    : V extends string ? (string extends V ? (K extends `${string}Id` ? true : false) : true)
      : V extends (...args: never[]) => unknown ? false
        : V extends readonly (infer E)[] ? SafeParam<E, K>
          : V extends object ? { [P in keyof V]: SafeParam<V[P], P> }[keyof V]
            : false

/** `true` when the params type `P` obeys the rule above, else `false`. */
export type ParamsSafe<P> = [SafeParam<P, never>] extends [true] ? true : false

/** What `CheckedParams` demands of a table of params types: the same table, every entry obeying the rule. */
export type ParamRules<D> = { [T in keyof D]: ParamsSafe<D[T]> extends true ? D[T] : never }

/** The table itself, or a compile error naming the entry whose params break the rule. */
export type CheckedParams<D extends ParamRules<D>> = D

/**
 * The params of each entry type. Instants are `IsoInstant`; `number` is the number the Session was shown with; `team` is
 * the team's position (a Party's team number). A drawn game's id is fine here: 0.7-04 makes its entry readable only from
 * the stop instant on.
 */
export type ActivityParams = CheckedParams<{
  member_joined: Record<string, never>
  member_moved: { userId: string, from: Place, to: Place }
  date_set: { sessionId: string, number: number | null, startsAt: IsoInstant }
  date_rescheduled: { sessionId: string, number: number | null, from: IsoInstant, to: IsoInstant }
  date_reopened: { sessionId: string, number: number | null, previousStartsAt: IsoInstant }
  session_added: { sessionId: string, startsAt: IsoInstant | null }
  session_removed: { sessionId: string, number: number | null, startsAt: IsoInstant | null }
  session_started: { sessionId: string, number: number | null }
  session_ended: { sessionId: string, number: number | null }
  team_name_reset: { team: number }
  game_count_changed: { from: number, to: number }
  team_size_changed: { from: number, to: number }
  game_drawn: { roundId: string, drawId: string, gameId: string }
  vetoes_revealed: { roundId: string, drawId: string, gameId: string, vetoes: { team: number, userId: string }[] }
  game_set: { roundId: string, gameId: string }
  game_put_back: { roundId: string, gameId: string }
  bonus_veto_granted: { team: number }
  coin_tossed: { side: 'heads' | 'tails' }
}>

/** Whom an entry names: the ids of the Users in its params, whose names the client needs (`people`). */
export type ActivityPeople = { [T in ActivityType]: (params: ActivityParams[T]) => string[] }

/** Every entry type says whom it names; a type without an entry here does not compile. */
export const ACTIVITY_PEOPLE: ActivityPeople = {
  member_joined: () => [],
  member_moved: params => [params.userId],
  date_set: () => [],
  date_rescheduled: () => [],
  date_reopened: () => [],
  session_added: () => [],
  session_removed: () => [],
  session_started: () => [],
  session_ended: () => [],
  team_name_reset: () => [],
  game_count_changed: () => [],
  team_size_changed: () => [],
  game_drawn: () => [],
  vetoes_revealed: params => params.vetoes.map(veto => veto.userId),
  game_set: () => [],
  game_put_back: () => [],
  bonus_veto_granted: () => [],
  coin_tossed: () => [],
}

/** The User ids an entry's params name (ACTIVITY_PEOPLE), for one entry of this type. */
export function activityPeople<T extends ActivityType>(type: T, params: ActivityParams[T]): string[] {
  return ACTIVITY_PEOPLE[type](params)
}

/** Which games an entry names: the ids of the games in its params, whose names the sentence needs (`games`, #228). */
export type ActivityGames = { [T in ActivityType]: (params: ActivityParams[T]) => string[] }

/**
 * Every entry type says which games it names, as it says whom (ACTIVITY_PEOPLE): a type without an entry here does not
 * compile. The server resolves a name only for a game this viewer may know (server/utils/activity.ts).
 */
export const ACTIVITY_GAMES: ActivityGames = {
  member_joined: () => [],
  member_moved: () => [],
  date_set: () => [],
  date_rescheduled: () => [],
  date_reopened: () => [],
  session_added: () => [],
  session_removed: () => [],
  session_started: () => [],
  session_ended: () => [],
  team_name_reset: () => [],
  game_count_changed: () => [],
  team_size_changed: () => [],
  game_drawn: params => [params.gameId],
  vetoes_revealed: params => [params.gameId],
  game_set: params => [params.gameId],
  game_put_back: params => [params.gameId],
  bonus_veto_granted: () => [],
  coin_tossed: () => [],
}

/** The game ids an entry's params name (ACTIVITY_GAMES), for one entry of this type. */
export function activityGames<T extends ActivityType>(type: T, params: ActivityParams[T]): string[] {
  return ACTIVITY_GAMES[type](params)
}

interface EntryBase {
  id: string
  /** ISO instant. */
  at: string
  /** Who did it; null when the app did (no one acted). */
  actor: { id: string, name: string } | null
  /** The name of every User id inside `params`, so the client never needs the members list (`shownName`). */
  people: Record<string, string>
  /**
   * The name of every game id inside `params` that this viewer may know yet (#228): a game that was set, from the moment it
   * was set. An id that is missing here is a game nobody may name yet, and the sentence is left out. Never a game's picture or notes.
   */
  games: Record<string, string>
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
