import { defineEventHandler } from 'h3'
import { parseFinishBody } from '../../../domain/finish'
import { apiError } from '../../../utils/errors'
import { changeEvent } from '../../../utils/event-access'
import { finishEvent } from '../../../utils/finish'
import type { EventFinished } from '../../../../shared/event'

// The Host finishes the Event (#277, spec #272): `{ outcome: 'winner' | 'tie', winners }` (#278 sends the tie), once every Round up to the Game count has its
// Result. The rule is in finishEvent (utils/finish.ts); the change is plain changeEvent, not changeSessions, which would write the Phase it loaded before.
// The change broadcasts `event.changed` and the feed entry: everybody may know the Event ended (ADR 0013).
export default defineEventHandler((event): Promise<EventFinished> => changeEvent(event, { hostOnly: true, lock: 'update' }, async (change) => {
  const request = parseFinishBody(change.body)
  if (request === null) throw apiError('invalid_value')
  return await finishEvent(change, request)
}))
