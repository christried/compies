import { defineEventHandler, getRouterParam } from 'h3'
import { parseResultBody } from '../../../../../domain/results'
import { changeEvent } from '../../../../../utils/event-access'
import { enterResult } from '../../../../../utils/results'
import type { ResultEntered } from '../../../../../../shared/stage'

// The Host enters the Result of an open Round (#273, spec #272): `{ places: [{ team, place, score? }] }`, one entry per Party. The Round
// gets the next number („Spiel 3“) and leaves the open Rounds; a Round with a Result is refused (`round_not_open`) until #275 makes it a
// Correction. The Event row is locked, so two Results cannot both get the same number. The room hears `event.changed` and the feed entry.
export default defineEventHandler((event): Promise<ResultEntered> => changeEvent(event, { hostOnly: true, lock: 'update' }, change => enterResult(change, getRouterParam(event, 'id'), parseResultBody(change.body))))
