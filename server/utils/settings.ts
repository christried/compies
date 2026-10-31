import { and, eq } from 'drizzle-orm'
import { eventPoolGames, events } from '../db/schema'
import { parsePoolChange } from '../domain/pools'
import { POOLS, checkSettingsChange, settingsEditable, settingsFromRow, type EventSettings } from '../../shared/settings'
import type { Place } from '../../shared/board'
import { moveMember, readSeats } from './board'
import type { Db } from './db'
import { apiError } from './errors'
import type { EventChange, EventRow } from './event-access'
import { assertGamesExist } from './pools'
import { settingsFloors } from './settings-floors'
import { asRecord } from '../../shared/record'

const BENCH: Place = { zone: 'bench' }

/**
 * The Host's change of an Event's settings and pools (#147, #183), inside the caller's transaction on the locked Event.
 * `settings` is a partial change merged over the stored settings (or the full payload for an Event that is not set
 * up); each pool list that is given replaces that pool. The floors are read here, under the lock. A refusal throws and
 * leaves settings and pools as they were. Returns the settings before and after (`before` is null for an Event that
 * was not set up), so a caller can name what changed (changedKeys). A lowered team count moves the Players of the
 * removed teams to the Bench (#163), in the Host's name, so `publish` and the Host's id come with the change.
 */
export async function applySettingsChange(
  tx: Db,
  eventRow: EventRow,
  body: unknown,
  { publish, hostId }: { publish: EventChange['publish'], hostId: string },
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
  if (before !== null && after.teamCount < before.teamCount) await benchRemovedTeams(tx, publish, eventRow.id, after.teamCount, hostId)
  return { before, after }
}

/**
 * Every Player seated in a team the lowered team count removes goes to the Bench (#163). Each one is a move made by the
 * Host, written the way the move endpoint writes it (moveMember).
 */
async function benchRemovedTeams(tx: Db, publish: EventChange['publish'], eventId: string, teamCount: number, hostId: string): Promise<void> {
  const removed = (await readSeats(tx, eventId)).filter(seat => seat.place.zone === 'team' && seat.place.team > teamCount)
  for (const { userId, place } of removed) {
    await moveMember(tx, publish, eventId, hostId, userId, place, BENCH)
  }
}
