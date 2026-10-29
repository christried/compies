import { defineEventHandler } from 'h3'
import { changeEvent } from '../../../utils/event-access'
import { applySettingsChange } from '../../../utils/settings'
import type { EventSettings } from '../../../../shared/settings'

// The Host changes an Event's settings and pools (#147), through applySettingsChange. Everything happens in one
// transaction: a refusal leaves settings and pools as they were.
export default defineEventHandler((event): Promise<{ settings: EventSettings }> => changeEvent(event, { hostOnly: true, lock: 'update' }, async ({ tx, eventRow, body }) => {
  const { after } = await applySettingsChange(tx, eventRow, body)
  return { settings: after }
}))
