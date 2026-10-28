import { and, eq } from 'drizzle-orm'
import { defineEventHandler, getRouterParam, readBody } from 'h3'
import { eventPoolGames, events } from '../../../db/schema'
import { parsePools } from '../../../domain/pools'
import { useDb } from '../../../utils/db'
import { apiError } from '../../../utils/errors'
import { loadEvent } from '../../../utils/event-access'
import { assertGamesExist } from '../../../utils/pools'
import { requireUser } from '../../../utils/user'
import { SETTINGS_FLOORS } from '../../../utils/settings-floors'
import { POOLS, checkSettingsChange, settingsEditable, settingsFromRow, type EventSettings } from '../../../../shared/settings'

// The Host changes an Event's settings and pools (#147). `settings` is a partial change merged over the stored
// settings (or the full payload for an Event that is not set up); each pool list that is given replaces that pool.
// Everything happens in one transaction: a refusal leaves settings and pools as they were.
export default defineEventHandler(async (event): Promise<{ settings: EventSettings }> => {
  const user = await requireUser(event)
  const body = (await readBody(event)) as { settings?: unknown, pools?: unknown } | null
  const parsedPools = parsePools(body?.pools)
  if (!parsedPools.ok) throw apiError(parsedPools.error)
  const rawPools = (body?.pools ?? {}) as Record<string, unknown>

  const db = useDb(event)
  return await db.transaction(async (tx) => {
    const row = await loadEvent(tx, getRouterParam(event, 'slug') ?? '', user.id, { hostOnly: true, lock: 'update' })
    // checkSettingsChange checks the Phase too, but a request with pools only never reaches it.
    if (!settingsEditable(row.phase)) throw apiError('wrong_phase')

    const current = settingsFromRow(row)
    // An Event that is not set up must get its settings first: pools alone are not enough.
    if (current === null && body?.settings === undefined) throw apiError('invalid_settings')
    let settings = current
    if (body?.settings !== undefined) {
      const checked = checkSettingsChange(current, body.settings, { phase: row.phase, floors: SETTINGS_FLOORS })
      if (!checked.ok) throw apiError(checked.error)
      settings = checked.settings
    }

    const given = POOLS.filter(pool => rawPools[pool] !== undefined)
    await assertGamesExist(tx, ...given.map(pool => parsedPools.pools[pool]))
    if (body?.settings !== undefined) await tx.update(events).set(settings!).where(eq(events.id, row.id))
    for (const pool of given) {
      await tx.delete(eventPoolGames).where(and(eq(eventPoolGames.eventId, row.id), eq(eventPoolGames.pool, pool)))
      const ids = parsedPools.pools[pool]
      if (ids.length > 0) await tx.insert(eventPoolGames).values(ids.map(gameId => ({ eventId: row.id, gameId, pool })))
    }
    return { settings: settings! }
  })
})
