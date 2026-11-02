import { defineEventHandler } from 'h3'
import { useClock } from '../../../../utils/clock'
import { skipClip } from '../../../../utils/clip'
import { changeEvent } from '../../../../utils/event-access'
import type { ClipSkipped } from '../../../../../shared/event'

// The Host skips the clip that runs, for everyone (#230, spec #218 § Clip): no body. The skip is stored on the draw, so a Member who
// joins later gets no clip either. Refused with 409 no_clip when none runs. The room hears `event.changed`; every client
// refetches the Event read and closes the player.
export default defineEventHandler((event): Promise<ClipSkipped> => changeEvent(event, { hostOnly: true, lock: 'update' }, change => skipClip(change, useClock(event).now())))
