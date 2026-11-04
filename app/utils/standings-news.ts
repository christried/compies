import type { ResultView, StandingView } from '~~/shared/stage'

// What is new on the Standings (#276, spec #272): the Result the page has not seen yet, and how the Standings moved. Pure, so the rules
// hold without Vue. The page keeps the marks it last read (`marksOf`); a Result is fresh when its Round is new to the page, or when its
// mark is later than the one the page saw (a Correction, #275, moves it). Instants are UTC ISO strings (ADR 0003): they compare by `Date.parse`.

/** roundId → the instant the page last saw for that Result: `correctedAt ?? resultAt` (ISO UTC, ADR 0003). */
export function marksOf(results: readonly Pick<ResultView, 'roundId' | 'resultAt' | 'correctedAt'>[]): Map<string, string> {
  return new Map(results.map(result => [result.roundId, result.correctedAt ?? result.resultAt] as const))
}

export interface FreshResult { result: ResultView, kind: 'entered' | 'corrected' }

/**
 * The newest Result the page has not seen. A Result is fresh when its Round is not in `seen` ('entered', even when it already carries a
 * `correctedAt`: the page missed both) or when its mark is later than the one in `seen` ('corrected'). The newest is the one with the latest
 * mark, a tie by the higher number. A mark that is equal or earlier than the seen one is not fresh. null when nothing is.
 */
export function freshResult(seen: ReadonlyMap<string, string>, results: readonly ResultView[]): FreshResult | null {
  let newest: FreshResult | null = null
  let newestMark = 0
  for (const result of results) {
    const mark = Date.parse(result.correctedAt ?? result.resultAt)
    const previous = seen.get(result.roundId)
    if (previous !== undefined && mark <= Date.parse(previous)) continue
    if (newest === null || mark > newestMark || (mark === newestMark && result.number > newest.result.number)) {
      newest = { result, kind: previous === undefined ? 'entered' : 'corrected' }
      newestMark = mark
    }
  }
  return newest
}

export interface RankMove { team: number, from: number, to: number }

/** A Party whose rank changed between two Standings: `from` and `to` are ranks (1 = first). Parties missing from `before` are left out. In the order of `after`. */
export function rankMoves(before: readonly StandingView[], after: readonly StandingView[]): RankMove[] {
  const ranks = new Map(before.map(standing => [standing.team, standing.rank] as const))
  return after.flatMap((standing) => {
    const from = ranks.get(standing.team)
    return from === undefined || from === standing.rank ? [] : [{ team: standing.team, from, to: standing.rank }]
  })
}

/** Each Party's points gained from `before` to `after` (negative after a Correction); a Party missing from `before` counts from 0. Keyed by team position. */
export function pointsDelta(before: readonly StandingView[], after: readonly StandingView[]): Map<number, number> {
  const points = new Map(before.map(standing => [standing.team, standing.points] as const))
  return new Map(after.map(standing => [standing.team, standing.points - (points.get(standing.team) ?? 0)] as const))
}

/** What the page knows of the Result that is new, until it expires. One value per fresh Result; the Leaderboards read it, none keeps its own „last seen“. */
export interface StandingsNews {
  /** Increments with every news of the page; a Leaderboard tells a new news from the one it already played by this. */
  key: number
  kind: 'entered' | 'corrected'
  roundId: string
  /** The Round's number (Spiel 3). */
  number: number
  /** The Standings the page saw before (the Standings of the baseline); every Party at 0 and rank 1 when the page saw no Result yet. */
  before: StandingView[]
  /** Team positions on Place 1 of the new Result (`winnersOf(result.places)` of `shared/results.ts`, existing). */
  winners: number[]
  /** `Date.now()` when the news was made, so a Leaderboard that mounts much later (a tab opened after the celebration) stays calm. */
  at: number
  /** The sentence for the polite live region, built by `useStandingsNews` (the Standings announce rank changes once per page). */
  announcement: string
}
