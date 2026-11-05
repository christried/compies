import { asRecord } from '../../shared/record'
import type { FinishRequest } from '../../shared/results'
import { TEAM_COUNT_MAX } from '../../shared/settings'

// What the Host sends to finish the Event (#277, spec #272): `{ outcome: 'winner' | 'tie', winners: [team positions] }`. The outcome is
// the one the Host held (#278 sends 'tie'), `winners` the Parties he saw on Place 1; the rule (finishRejection, shared/results.ts) decides
// whether both are the Standings' now. Any other value, and a body without `winners`, is null (invalid_value).

export function parseFinishBody(body: unknown): FinishRequest | null {
  const { outcome, winners } = asRecord(body)
  if (outcome !== 'winner' && outcome !== 'tie') return null
  if (!Array.isArray(winners) || winners.length > TEAM_COUNT_MAX) return null
  const positions: number[] = []
  for (const team of winners) {
    if (typeof team !== 'number' || !Number.isInteger(team) || team < 1 || team > TEAM_COUNT_MAX) return null
    positions.push(team)
  }
  return { outcome, winners: positions }
}
