import { eq } from 'drizzle-orm'
import { eventPoolGames, events } from '../db/schema'
import { parsePoolChange } from '../domain/pools'
import { checkSettingsChange, floorsAt, settingsEditable, settingsFromRow, type EventSettings } from '../../shared/settings'
import type { Place } from '../../shared/board'
import { moveMember } from './board'
import type { Db } from './db'
import { apiError } from './errors'
import type { EventChange, EventRow } from './event-access'
import { floorsOf, readEventState, roundBeingDrawnOf, seatOf, type EventState } from './event-state'
import { assertGamesExist, assertNoOldPools } from './pools'
import { asRecord } from '../../shared/record'

const STANDS: Place = { zone: 'stands' }

/**
 * The Event's settings for a rule that needs them (#288): an Event that is not set up cannot be running, so the rule's order
 * gives it wrong_phase.
 */
export function requireSettings(eventRow: EventRow): EventSettings {
  const settings = settingsFromRow(eventRow)
  if (settings === null) throw apiError('wrong_phase')
  return settings
}

/**
 * The Host's change of an Event's settings and pools (#147, #183), inside the caller's transaction on the locked Event.
 * `settings` is a partial change merged over the stored settings (or the full payload for an Event that is not set
 * up); the Game pool's list, when it is given, replaces the pool (#279). The floors are read here, under the lock. A refusal throws and
 * leaves settings and pools as they were. Returns the settings before and after (`before` is null for an Event that
 * was not set up), so a caller can name what changed (changedKeys). A lowered team count moves the Players of the
 * removed teams to the Stands (#163), in the Host's name, so `publish` and the Host's id come with the change.
 */
export async function applySettingsChange(
  tx: Db,
  eventRow: EventRow,
  body: unknown,
  { publish, hostId, now }: { publish: EventChange['publish'], hostId: string, now: Date },
): Promise<{ before: EventSettings | null, after: EventSettings }> {
  const record = asRecord(body)
  assertNoOldPools(record)
  const { settings: change, pool: rawPool } = record
  const parsedPool = parsePoolChange(rawPool)
  if (!parsedPool.ok) throw apiError(parsedPool.error)
  const { pool } = parsedPool

  // checkSettingsChange checks the Phase too, but a request with a pool only never reaches it.
  if (!settingsEditable(eventRow.phase)) throw apiError('wrong_phase')
  // A body with neither key would change nothing; a top-level `{ poolPreview }` is the likely slip, so refuse it (retro 0.6).
  if (change === undefined && rawPool === undefined) throw apiError('invalid_settings')
  const before = settingsFromRow(eventRow)
  let after: EventSettings
  // The state is read only for a change of the settings: a pool alone reads nothing (the budget under the lock, #416).
  let state: EventState<'members' | 'rounds' | 'vetoes'> | null = null
  if (change !== undefined) {
    state = await readEventState(tx, eventRow, now, ['members', 'rounds', 'vetoes'])
    const facts = floorsOf(state)
    const checked = checkSettingsChange(before, change, { phase: eventRow.phase, floors: teamCount => floorsAt(facts, teamCount), roundBeingDrawn: roundBeingDrawnOf(state) })
    if (!checked.ok) throw apiError(checked.error)
    after = checked.settings
  }
  // An Event that is not set up must get its settings first: a pool alone is not enough.
  else if (before === null) throw apiError('invalid_settings')
  else after = before

  if (pool !== undefined) await assertGamesExist(tx, pool)
  if (change !== undefined) await tx.update(events).set(after).where(eq(events.id, eventRow.id))
  if (pool !== undefined) {
    await tx.delete(eventPoolGames).where(eq(eventPoolGames.eventId, eventRow.id))
    if (pool.length > 0) await tx.insert(eventPoolGames).values(pool.map(gameId => ({ eventId: eventRow.id, gameId })))
  }
  // A lowered team count only comes with a change of the settings, so the state above has the Members.
  if (state && before !== null && after.teamCount < before.teamCount) await standsRemovedTeams(tx, publish, now, eventRow.id, after.teamCount, hostId, state)
  return { before, after }
}

/**
 * Every Player seated in a team the lowered team count removes goes to the Stands (#163). Each one is a move made by the
 * Host, written the way the move endpoint writes it (moveMember). The Players come from the Members the state read before the change (#416).
 */
async function standsRemovedTeams(tx: Db, publish: EventChange['publish'], now: Date, eventId: string, teamCount: number, hostId: string, state: EventState<'members'>): Promise<void> {
  for (const { id } of state.members) {
    const place = seatOf(state, id)
    if (place?.zone === 'team' && place.team > teamCount) await moveMember(tx, publish, now, eventId, hostId, id, place, STANDS)
  }
}
