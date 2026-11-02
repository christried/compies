import { defineEventHandler } from 'h3'
import { parseGrantBonusVeto } from '../../../domain/bonus-vetoes'
import { useClock } from '../../../utils/clock'
import { changeEvent } from '../../../utils/event-access'
import { apiError } from '../../../utils/errors'
import { grantBonusVeto } from '../../../utils/vetoes'
import type { BonusVetoGranted } from '../../../../shared/stage'

// The Host grants a Party a Bonus Veto (#233, spec #218 § Bonus Vetoes): `{ team }`. The Event row is locked, so two grants cannot both
// pass the limit of 9. The change broadcasts `event.changed` (everyone may know) and its feed entry, which names the Party.
export default defineEventHandler((event): Promise<BonusVetoGranted> => changeEvent(event, { hostOnly: true, lock: 'update' }, async (change) => {
  const parsed = parseGrantBonusVeto(change.body)
  if (!parsed.ok) throw apiError(parsed.error)
  return await grantBonusVeto(change, useClock(event).now(), parsed.team)
}))
