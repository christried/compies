import { randomInt } from 'node:crypto'
import { defineEventHandler } from 'h3'
import { changeEvent } from '../../../../utils/event-access'
import { spinWheel } from '../../../../utils/rounds'
import type { RoundSpun } from '../../../../../shared/stage'

// The Host spins the Lucky Wheel (#229, spec #218 § Drawing): no body. The server draws one of the games left with the
// platform's random source (the spin's length of 6 to 10 s too, #520), stamps the instants with the request's clock and answers the Round and the draw. The Event row is
// locked, so two spins cannot both pass the rule (a Round being drawn). The room hears `event.changed` and the client refetches the Event read.
export default defineEventHandler((event): Promise<RoundSpun> => changeEvent(event, { hostOnly: true, lock: 'update' }, change => spinWheel(change, randomInt)))
