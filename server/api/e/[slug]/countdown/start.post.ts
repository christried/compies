import { defineEventHandler } from 'h3'
import { useClock } from '../../../../utils/clock'
import { changeEvent } from '../../../../utils/event-access'
import { startCountdown } from '../../../../utils/countdown'
import type { CountdownView } from '../../../../../shared/event'

// The Host starts the Countdown, from ready or paused (#236, spec #218 § Countdown). Refused by the rules of shared/countdown.ts.
// The room hears `countdown.changed`; the client refetches the Event read.
export default defineEventHandler((event): Promise<CountdownView> => changeEvent(event, { hostOnly: true, lock: 'update' }, change => startCountdown(change, useClock(event).now())))
