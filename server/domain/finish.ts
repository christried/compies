import { asRecord } from '../../shared/record'
import type { FinishOutcome } from '../../shared/results'

// What the Host sends to finish the Event (#277, spec #272): `{ outcome: 'winner' }`, or `{ outcome: 'tie' }` for a Tie (#278). The rule
// (finishRejection, shared/results.ts) decides whether that outcome is the Standings' now. Any other value is null (invalid_value).

export function parseFinishBody(body: unknown): FinishOutcome | null {
  const { outcome } = asRecord(body)
  return outcome === 'winner' || outcome === 'tie' ? outcome : null
}
