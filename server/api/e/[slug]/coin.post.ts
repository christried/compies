import { randomInt } from 'node:crypto'
import { defineEventHandler } from 'h3'
import { useClock } from '../../../utils/clock'
import { changeEvent } from '../../../utils/event-access'
import { tossCoin } from '../../../utils/coin'
import type { CoinTossed } from '../../../../shared/event'

// The Host tosses the Coin flip (#235, spec #218 § Coin flip): no body. The server picks the side with the platform's random source,
// stamps the instants with the request's clock and answers the toss. The Event row is locked, so two tosses cannot both pass the rule
// (one coin at a time). The room hears `coin.tossed`; the client refetches the Event read, which carries the toss.
export default defineEventHandler((event): Promise<CoinTossed> => changeEvent(event, { hostOnly: true, lock: 'update' }, change => tossCoin(change, useClock(event).now(), randomInt)))
