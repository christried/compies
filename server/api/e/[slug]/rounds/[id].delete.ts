import { defineEventHandler, getRouterParam } from 'h3'
import { useClock } from '../../../../utils/clock'
import { changeEvent } from '../../../../utils/event-access'
import { putBackRound } from '../../../../utils/rounds'
import type { RoundPutBack } from '../../../../../shared/event'

// The Host puts an open Round back (#228, spec #218 § Rounds): the Round is gone, its game returns to the Game pool if it came
// from there. A DELETE, like removing a Session: the Round leaves the stage for everybody, though the row stays (soft removal,
// because Vetoes spent in it stay spent). Only a set Round that stands can be put back.
export default defineEventHandler((event): Promise<RoundPutBack> => changeEvent(event, { hostOnly: true, lock: 'update' }, change => putBackRound(change, useClock(event).now(), getRouterParam(event, 'id'))))
