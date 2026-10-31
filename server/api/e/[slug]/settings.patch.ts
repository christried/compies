import { defineEventHandler } from 'h3'
import { recordActivity } from '../../../utils/activity'
import { changeEvent } from '../../../utils/event-access'
import { applySettingsChange } from '../../../utils/settings'
import { changedKeys, type EventSettings } from '../../../../shared/settings'

// The Host changes an Event's settings and pools (#147), through applySettingsChange. Everything happens in one
// transaction: a refusal leaves settings and pools as they were. A change of the game count or the Team size goes into
// the Activity feed (#159); setting an Event up for the first time is not a change, and pools never appear there.
export default defineEventHandler((event): Promise<{ settings: EventSettings }> => changeEvent(event, { hostOnly: true, lock: 'update' }, async ({ tx, eventRow, user, publish, body }) => {
  const { before, after } = await applySettingsChange(tx, eventRow, body, { publish, hostId: user.id })
  if (before !== null) {
    const changed = changedKeys(before, after)
    if (changed.includes('gameCount')) await recordActivity(tx, publish, eventRow.id, { type: 'game_count_changed', actorId: user.id, params: { from: before.gameCount, to: after.gameCount } })
    if (changed.includes('teamSize')) await recordActivity(tx, publish, eventRow.id, { type: 'team_size_changed', actorId: user.id, params: { from: before.teamSize, to: after.teamSize } })
  }
  return { settings: after }
}))
