import { defineEventHandler } from 'h3'
import { parseSetGame } from '../../../../domain/rounds'
import { apiError } from '../../../../utils/errors'
import { useClock } from '../../../../utils/clock'
import { changeEvent } from '../../../../utils/event-access'
import { setNextGame } from '../../../../utils/rounds'
import type { RoundSet } from '../../../../../shared/event'

// The Host sets the next game (#228, spec #218 § „Nächstes Spiel setzen“): `{ gameId }`, any game of the library. A Round is
// set at once, with one `set` draw; several Rounds can be open at the same time. The Event row is locked, so two sets cannot
// both pass the rule (Game count, a Round being drawn). The room hears `round.set` without any game data and the client refetches.
export default defineEventHandler((event): Promise<RoundSet> => changeEvent(event, { hostOnly: true, lock: 'update' }, async (change) => {
  const parsed = parseSetGame(change.body)
  if (!parsed.ok) throw apiError(parsed.error)
  return await setNextGame(change, useClock(event).now(), parsed.gameId)
}))
