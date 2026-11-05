import { cutToCharacters } from '~~/shared/text'
import { normalizeScore, partyPoints, placesFromOrder, SCORE_MAX, type ResultPlace } from '~~/shared/results'
import type { PointsTable } from '~~/shared/settings'
import type { ResultLineView } from '~~/shared/stage'

// The result sheet's state rules (#273, GLOSSARY: Result, Place, Shared place): the order of the Parties, which neighbours share a Place,
// the Scores as typed, and what they make of them. Pure and immutable, so the sheet only draws a draft and the rules are tested without
// it. The sheet starts from `newResultDraft` every time it opens; nothing of a draft is stored or sent before „Ergebnis speichern“.

export interface ResultDraft {
  /** The team positions, the top row first. */
  order: number[]
  /** `level[i]` (i >= 1): row i shares the Place of row i-1. Index 0 has no row above and is never set. */
  level: boolean[]
  /** The Scores as typed, by team position (raw: trimmed only when sent). */
  scores: Record<number, string>
}

/** The Parties in team order, none level, no Score. */
export function newResultDraft(teamCount: number): ResultDraft {
  return { order: Array.from({ length: teamCount }, (_, index) => index + 1), level: Array.from({ length: teamCount }, () => false), scores: {} }
}

/** The sheet's draft for a saved Result (#275): the Parties in Place order (team order inside a Shared place), `level[i]` set where row i has the Place of row i-1, the Scores as stored ('' for none). */
export function draftFromResult(places: readonly Pick<ResultLineView, 'team' | 'place' | 'score'>[]): ResultDraft {
  const sorted = [...places].sort((a, b) => a.place - b.place || a.team - b.team)
  return {
    order: sorted.map(entry => entry.team),
    level: sorted.map((entry, index) => index > 0 && entry.place === sorted[index - 1]!.place),
    scores: Object.fromEntries(sorted.map(entry => [entry.team, entry.score ?? ''])),
  }
}

/**
 * The draft with row `from` moved to row `to`. The flag of every gap that touches a row from `min(from, to)` to `max(from, to)` is
 * cleared, because those neighbours are new; the flags of the gaps outside that range stay. The same draft when nothing moves.
 */
export function moveRow(draft: ResultDraft, from: number, to: number): ResultDraft {
  const last = draft.order.length - 1
  if (from === to || from < 0 || to < 0 || from > last || to > last) return draft
  const order = [...draft.order]
  const [moved] = order.splice(from, 1)
  order.splice(to, 0, moved!)
  const low = Math.min(from, to)
  const high = Math.max(from, to)
  // Gap i sits between rows i-1 and i, so rows low..high touch the gaps low..high+1.
  const level = draft.level.map((flag, gap) => (gap >= low && gap <= high + 1 ? false : flag))
  return { ...draft, order, level }
}

/** The draft with the flag of the gap above row `index` flipped; unchanged for row 0 and for an index out of range. */
export function toggleLevel(draft: ResultDraft, index: number): ResultDraft {
  if (index < 1 || index >= draft.order.length) return draft
  return { ...draft, level: draft.level.map((flag, gap) => (gap === index ? !flag : flag)) }
}

/** The draft with a team's Score as typed, cut to SCORE_MAX characters as the User sees them. */
export function setScore(draft: ResultDraft, team: number, raw: string): ResultDraft {
  return { ...draft, scores: { ...draft.scores, [team]: cutToCharacters(raw, SCORE_MAX) } }
}

/** What the sheet sends: the rows top to bottom with their Places and Scores (trimmed; null when empty). */
export function draftPlaces(draft: ResultDraft): ResultPlace[] {
  return placesFromOrder(draft.order, draft.level).map(entry => ({ ...entry, score: normalizeScore(draft.scores[entry.team] ?? '') }))
}

/** The points each row earns for the draft, top to bottom. */
export function draftPoints(draft: ResultDraft, table: Pick<PointsTable, 'values'>): number[] {
  const points = partyPoints(placesFromOrder(draft.order, draft.level), table)
  return draft.order.map(team => points[team - 1]!)
}

/** What the history needs of the page to offer a Correction (#275); null/absent = no „Korrigieren“ (a Member, or the Event has finished). */
export interface HistoryCorrections {
  pointsTable: PointsTable
  /** The Game count, for the sheet's kicker „Korrektur: Spiel 2 von 6“. */
  total: number
  /** Sends the corrected Places of a Round; resolves to whether the server took them (the sheet closes then). The page passes `actions.enterResult`: it is the same PUT. */
  save: (roundId: string, places: ResultPlace[]) => Promise<boolean>
}
