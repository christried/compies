// The Activity feed (GLOSSARY: Activity feed, spec #153, #159): the types the table, the API and the room share.
// An entry's params hold ids, numbers, instants and places only, never a game's name, image or video, so a Hidden wheel
// stays hidden in the feed (spec stories 69, 71); ActivityParams checks that at compile time (#226, review 1.4 A6). The one wide
// string is a Team name under the key `teamNames` (#440, ADR 0016): it is composed from Team words, which every Member sees anyway.

import type { Place } from './board'

/**
 * Every entry type. The database enum is built from this list, so a new type needs an enum migration: one per Release,
 * which adds every type the Release writes (0.7: the six after `team_size_changed`, migration 0016, #226; 0.8: the three at the end,
 * migration 0022, #273).
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
  'result_entered',
  'result_corrected',
  'event_finished',
] as const
export type ActivityType = (typeof ACTIVITY_TYPES)[number]

/**
 * The entry types whose entry waits for its instant (#229, spec #218 § Deadlines): written with `at` set to the instant they
 * may be read from, not published, and left out of the feed until then (the clients refetch it when the instant passes). The
 * others have an `at` the database stamps, which a test clock must not hide. `vetoes_revealed` (#231) waits for the end of its
 * Veto window, `coin_tossed` (#235) for the coin's landing. recordActivity takes `at` for exactly these types (review 0.7, F16).
 */
export const INSTANT_ACTIVITY_TYPES = ['game_drawn', 'vetoes_revealed', 'coin_tossed'] as const satisfies readonly ActivityType[]
export type InstantActivityType = (typeof INSTANT_ACTIVITY_TYPES)[number]

/**
 * The Team names an entry names (#440), keyed by the team's position as a string (JSON keys are strings): the name the team had
 * (the Team words in the order their Players joined), or `null` for a team without words, which the client shows by its colour.
 * It holds exactly the teams the entry's sentence names (`activityTeams`).
 */
export type TeamNames = Record<string, string | null>

/**
 * The entry types whose sentence names a team, and so store its Team name (#440). `recordActivity` demands `teamNames` for exactly
 * these. `result_corrected` is not one: its params hold no team position and its sentence names none. A test keeps this list in
 * step with `ACTIVITY_NAMES`.
 */
export const TEAM_NAMING_TYPES = ['member_moved', 'team_name_reset', 'bonus_veto_granted', 'vetoes_revealed', 'result_entered', 'event_finished'] as const satisfies readonly ActivityType[]
export type TeamNamingType = (typeof TEAM_NAMING_TYPES)[number]

/** An instant in the params: an ISO string, built from a `Date` by `isoInstant` (the stored rows already hold these). */
export type IsoInstant = `${number}-${number}-${number}T${string}`

/** The ISO instant of a `Date`, in the shape the params hold. */
export function isoInstant(at: Date): IsoInstant {
  return at.toISOString() as IsoInstant
}

// The rule for a param: a number, a boolean, null, an instant, a string literal (`'heads' | 'tails'`), a Place, or an
// array or object of those. A wide `string` is allowed only under a key that ends in `Id` (`userId`, `sessionId`,
// `roundId`, `drawId`, `gameId`), so a game's name has no key to sit under, and as a value of the one key `teamNames`, a
// `Record<string, string | null>` (#440): the Team names an entry names, keyed by position. Functions and everything else are refused.
type IsTeamNamesKey<K> = [K] extends [never] ? false : K extends 'teamNames' ? true : false
type SafeParam<V, K>
  = V extends null | number | boolean ? true
    : IsTeamNamesKey<K> extends true ? ([V] extends [Record<string, string | null>] ? true : false)
      : V extends string ? (string extends V ? (K extends `${string}Id` ? true : false) : true)
        : V extends (...args: never[]) => unknown ? false
          : V extends readonly (infer E)[] ? SafeParam<E, K>
            : V extends object ? { [P in keyof V]-?: SafeParam<Exclude<V[P], undefined>, P> }[keyof V]
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
 * the stop instant on. `teamNames` (#440, TEAM_NAMING_TYPES): every entry that names a team stores the Team name that team had
 * right before the change the entry records, so old entries read as they were (ADR 0016). It sits beside the other params, never
 * inside them (`publicParams` rebuilds a Veto's `vetoes`). Optional only because a row written before 0.12, or by the previous
 * deployment during the switch-over, lacks it: the client then resolves the name as the kind did before.
 */
export type ActivityParams = CheckedParams<{
  member_joined: Record<string, never>
  member_moved: { userId: string, from: Place, to: Place, teamNames?: TeamNames }
  date_set: { sessionId: string, number: number | null, startsAt: IsoInstant }
  date_rescheduled: { sessionId: string, number: number | null, from: IsoInstant, to: IsoInstant }
  date_reopened: { sessionId: string, number: number | null, previousStartsAt: IsoInstant }
  session_added: { sessionId: string, startsAt: IsoInstant | null }
  session_removed: { sessionId: string, number: number | null, startsAt: IsoInstant | null }
  session_started: { sessionId: string, number: number | null }
  session_ended: { sessionId: string, number: number | null }
  team_name_reset: { team: number, teamNames?: TeamNames }
  game_count_changed: { from: number, to: number }
  team_size_changed: { from: number, to: number }
  game_drawn: { roundId: string, drawId: string, gameId: string }
  vetoes_revealed: { roundId: string, drawId: string, gameId: string, vetoes: { team: number }[], teamNames?: TeamNames }
  game_set: { roundId: string, gameId: string }
  game_put_back: { roundId: string, gameId: string }
  bonus_veto_granted: { team: number, teamNames?: TeamNames }
  coin_tossed: { side: 'heads' | 'tails' }
  // 0.8 (#273): a Result names its Round's number and game; `first` is the team positions on Place 1, ascending (the sentence's winners).
  result_entered: { roundId: string, number: number, gameId: string, first: number[], teamNames?: TeamNames }
  result_corrected: { roundId: string, number: number, gameId: string }
  event_finished: { winners: number[], teamNames?: TeamNames }
}>

/**
 * Whom an entry names, which games it names and which teams (GLOSSARY: Activity feed; #226, #228, #273, #440): the ids of the Users in
 * its params, whose names the client needs (`people`), the ids of the games, whose names the sentence needs (`games`), and the
 * positions of the teams, whose Team names the entry stores (`teams`). Only the types that name someone, a game or a team have an entry;
 * an absent type or key names nobody, no game, no team. The server resolves a game's name only for a game this viewer may know
 * (server/utils/activity.ts).
 */
export const ACTIVITY_NAMES: { [T in ActivityType]?: { people?: (params: ActivityParams[T]) => string[], games?: (params: ActivityParams[T]) => string[], teams?: (params: ActivityParams[T]) => number[] } } = {
  // A move names the team it goes to, never the one it leaves (#440); a move to the Stands names none.
  member_moved: { people: params => [params.userId], teams: params => (params.to.zone === 'team' ? [params.to.team] : []) },
  team_name_reset: { teams: params => [params.team] },
  bonus_veto_granted: { teams: params => [params.team] },
  // A Veto names its Party, never its caster (#355): no `people`.
  vetoes_revealed: { games: params => [params.gameId], teams: params => params.vetoes.map(veto => veto.team) },
  game_drawn: { games: params => [params.gameId] },
  game_set: { games: params => [params.gameId] },
  game_put_back: { games: params => [params.gameId] },
  result_entered: { games: params => [params.gameId], teams: params => params.first },
  result_corrected: { games: params => [params.gameId] },
  event_finished: { teams: params => params.winners },
}

/** The User ids an entry's params name (ACTIVITY_NAMES), for one entry of this type. */
export function activityPeople<T extends ActivityType>(type: T, params: ActivityParams[T]): string[] {
  return ACTIVITY_NAMES[type]?.people?.(params) ?? []
}

/** The game ids an entry's params name (ACTIVITY_NAMES), for one entry of this type. */
export function activityGames<T extends ActivityType>(type: T, params: ActivityParams[T]): string[] {
  return ACTIVITY_NAMES[type]?.games?.(params) ?? []
}

/** The team positions an entry's params name (ACTIVITY_NAMES), for one entry of this type: the teams whose Team names it stores (#440). */
export function activityTeams<T extends ActivityType>(type: T, params: ActivityParams[T]): number[] {
  return ACTIVITY_NAMES[type]?.teams?.(params) ?? []
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
