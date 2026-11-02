import { asRecord } from '../../shared/record'

// What the Host sends to grant a Bonus Veto (#233, spec #218 § Bonus Vetoes): `{ team }`, a whole number. Whether that team is one of the
// Event's Parties is the rule's (bonusVetoRejection, `invalid_value`), so the parser checks the shape only.

export function parseGrantBonusVeto(body: unknown): { ok: true, team: number } | { ok: false, error: 'invalid_value' } {
  const { team } = asRecord(body)
  return typeof team === 'number' && Number.isInteger(team) ? { ok: true, team } : { ok: false, error: 'invalid_value' }
}
