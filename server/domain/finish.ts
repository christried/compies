import { asRecord } from '../../shared/record'
import type { FinishOutcome } from '../../shared/results'

// What the Host sends to finish the Event (#277, spec #272): `{ outcome: 'winner' }`. The rule (finishRejection, shared/results.ts) decides
// whether that outcome is the Standings' now. `'tie'` is #278's: the parser refuses it until the Tie ends an Event, so null (invalid_value).

export function parseFinishBody(body: unknown): FinishOutcome | null {
  const { outcome } = asRecord(body)
  return outcome === 'winner' ? 'winner' : null
}
