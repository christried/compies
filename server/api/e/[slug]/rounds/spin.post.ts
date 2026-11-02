import { randomInt } from 'node:crypto'
import { defineEventHandler } from 'h3'
import { useClock } from '../../../../utils/clock'
import { changeEvent } from '../../../../utils/event-access'
import { spinWheel } from '../../../../utils/rounds'
import type { RoundSpun } from '../../../../../shared/event'

// The Host spins the Lucky Wheel (#229, spec #218 § Drawing): no body. The server draws one of the games left with the
// platform's random source, stamps the instants with the request's clock and answers the Round and the draw. The Event row is
// locked, so two spins cannot both pass the rule (a Round being drawn). The room hears `round.spun` without any game.
export default defineEventHandler((event): Promise<RoundSpun> => changeEvent(event, { hostOnly: true, lock: 'update' }, change => spinWheel(change, useClock(event).now(), randomInt)))
