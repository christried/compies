import { defineEventHandler } from 'h3'
import { changeEvent } from '../../../utils/event-access'
import { uncoverWheel } from '../../../utils/uncover'
import type { WheelUncovered } from '../../../../shared/event'

// The Host uncovers the Hidden wheel (#957, spec #961 § Uncover): no body. Plain changeEvent, so a finished Event refuses it as read-only
// (wrong_phase). The change broadcasts `event.changed`: from now on every Member may know the games on the wheel.
export default defineEventHandler((event): Promise<WheelUncovered> => changeEvent(event, { hostOnly: true, lock: 'update' }, change => uncoverWheel(change)))
