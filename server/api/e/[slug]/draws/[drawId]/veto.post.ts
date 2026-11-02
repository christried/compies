import { defineEventHandler, getRouterParam } from 'h3'
import { useClock } from '../../../../../utils/clock'
import { changeEvent } from '../../../../../utils/event-access'
import { castVeto } from '../../../../../utils/rounds'
import type { VetoCast } from '../../../../../../shared/event'

// A Player casts their Party's Veto on a draw (#231, spec #218 § Vetoes): no body, any Member (the rule decides who may). The Event
// row is locked, so two teammates racing for the Party's one Veto cannot both pass. The cast is sealed until the window ends:
// `broadcast: false` keeps `event.changed` from telling every Party that someone vetoed; the Users of the casting Party get
// the named `veto.cast`, and nobody else hears anything.
export default defineEventHandler((event): Promise<VetoCast> => changeEvent(event, { lock: 'update', broadcast: false }, change => castVeto(change, useClock(event).now(), getRouterParam(event, 'drawId') ?? '')))
