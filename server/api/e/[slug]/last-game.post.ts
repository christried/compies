import { defineEventHandler } from 'h3'
import { changeEvent } from '../../../utils/event-access'
import { addLastGame } from '../../../utils/last-game'
import type { LastGameAdded } from '../../../../shared/event'

// The Host adds the last game (#278, spec #272): no body. Plain changeEvent, not changeSessions, so the read-only rule of #277 refuses it
// in a finished Event by itself (wrong_phase). The change broadcasts `event.changed` and the feed entry: everybody may know the count went up.
export default defineEventHandler((event): Promise<LastGameAdded> => changeEvent(event, { hostOnly: true, lock: 'update' }, change => addLastGame(change)))
