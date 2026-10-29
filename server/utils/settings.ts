import { and, eq } from 'drizzle-orm'
import { eventPoolGames, events } from '../db/schema'
import { parsePoolChange } from '../domain/pools'
import { POOLS, checkSettingsChange, settingsEditable, settingsFromRow, type EventSettings } from '../../shared/settings'
import type { Db } from './db'
import { apiError } from './errors'
import type { EventRow } from './event-access'
import { assertGamesExist } from './pools'
import { settingsFloors } from './settings-floors'
import { asRecord } from '../../shared/record'

/**
 * The Host's change of an Event's settings and pools (#147, #183), inside the caller's transaction on the locked Event.
 * `settings` is a partial change merged over the stored settings (or the full payload for an Event that is not set
 * up); each pool list that is given replaces that pool. The floors are read here, under the lock. A refusal throws and
 * leaves settings and pools as they were. Returns the settings before and after (`before` is null for an Event that
 * was not set up), so a caller can name what changed (changedKeys).
 */
export async function applySettingsChange(
  tx: Db,
  eventRow: EventRow,
  body: unknown,
): Promise<{ before: EventSettings | null, after: EventSettings }> {
  const { settings: change, pools: rawPools } = asRecord(body)
  const parsedPools = parsePoolChange(rawPools)
  if (!parsedPools.ok) throw apiError(parsedPools.error)
  const { pools } = parsedPools

  // checkSettingsChange checks the Phase too, but a request with pools only never reaches it.
  if (!settingsEditable(eventRow.phase)) throw apiError('wrong_phase')
  const before = settingsFromRow(eventRow)
  let after: EventSettings
  if (change !== undefined) {
    const checked = checkSettingsChange(before, change, { phase: eventRow.phase, floors: await settingsFloors(tx, eventRow.id) })
    if (!checked.ok) throw apiError(checked.error)
    after = checked.settings
  }
  // An Event that is not set up must get its settings first: pools alone are not enough.
  else if (before === null) throw apiError('invalid_settings')
  else after = before

  const given = POOLS.flatMap((pool) => {
    const ids = pools[pool]
    return ids ? [{ pool, ids }] : []
  })
  await assertGamesExist(tx, ...given.map(({ ids }) => ids))
  if (change !== undefined) await tx.update(events).set(after).where(eq(events.id, eventRow.id))
  for (const { pool, ids } of given) {
    await tx.delete(eventPoolGames).where(and(eq(eventPoolGames.eventId, eventRow.id), eq(eventPoolGames.pool, pool)))
    if (ids.length > 0) await tx.insert(eventPoolGames).values(ids.map(gameId => ({ eventId: eventRow.id, gameId, pool })))
  }
  return { before, after }
}
