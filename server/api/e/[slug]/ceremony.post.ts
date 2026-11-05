import { randomInt } from 'node:crypto'
import { defineEventHandler } from 'h3'
import { changeEvent } from '../../../utils/event-access'
import { startCeremony } from '../../../utils/ceremony'
import type { CeremonyStarted } from '../../../../shared/stage'

// The Host starts the Award ceremony of a finished Event (#309, spec #308): no body. The server stamps the start with the request's clock plus the
// lead, picks the gag (random the first time, the other one after) and answers the start. The Event row is locked, so two starts cannot both pass the rule.
export default defineEventHandler((event): Promise<CeremonyStarted> => changeEvent(event, { hostOnly: true, lock: 'update', allowFinished: true }, change => startCeremony(change, randomInt)))
