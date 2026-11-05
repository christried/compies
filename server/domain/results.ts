import { asRecord, isRecord } from '../../shared/record'
import { normalizeScore, type ResultPlace } from '../../shared/results'
import { TEAM_COUNT_MAX } from '../../shared/settings'

// What the Host sends as a Result (#273, spec #272): `{ places: [{ team, place, score? }] }`, one entry per Party. The parser checks
// the types only; that the Places form a Result of the Event is resultShapeValid's (shared/results.ts), called by the rules.

const whole = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value)

/** The Places of the body, or null when it is not a list of Places: whole numbers for team and place, a Score absent, null or a string. */
export function parseResultBody(body: unknown): ResultPlace[] | null {
  const { places } = asRecord(body)
  if (!Array.isArray(places) || places.length > TEAM_COUNT_MAX) return null
  const parsed: ResultPlace[] = []
  for (const entry of places) {
    if (!isRecord(entry)) return null
    const { team, place, score } = entry
    if (!whole(team) || !whole(place)) return null
    if (score !== undefined && score !== null && typeof score !== 'string') return null
    parsed.push({ team, place, score: typeof score === 'string' ? normalizeScore(score) : null })
  }
  return parsed
}
