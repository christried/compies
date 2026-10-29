import { eq } from 'drizzle-orm'
import { createError, defineEventHandler, readBody } from 'h3'
import { pollSlots, eventPoolGames, events, sessions } from '../../db/schema'
import { parseNewEvent } from '../../domain/event'
import { phaseOf } from '../../domain/phase'
import { parsePools } from '../../domain/pools'
import { createInviteToken, createSlug } from '../../domain/slug'
import { useDb, type Db } from '../../utils/db'
import { apiError } from '../../utils/errors'
import { addMember } from '../../utils/invite'
import { inviteUrl } from '../../utils/links'
import { assertGamesExist } from '../../utils/pools'
import { requireUser } from '../../utils/user'
import type { CreatedEvent } from '../../../shared/event'
import { asRecord } from '../../../shared/record'
import { POOLS, parseSettings } from '../../../shared/settings'

const SLUG_ATTEMPTS = 5

// Create an Event (screen M2). Only Users with the Host permission may create one (ADR 0002).
// The Event with its settings, its Sessions, its Slots and the Host's membership are written in one transaction.
// Settings are required (#144): an Event without them is one from before 1.3. The Game pool and the Tiebreaker
// pool (#146) are optional lists of library game ids, written in the same transaction.
export default defineEventHandler(async (event): Promise<CreatedEvent> => {
  const user = await requireUser(event)
  if (!user.canHost) throw apiError('no_host_permission')

  const body = await readBody(event)
  const parsed = parseNewEvent(body, new Date())
  if (!parsed.ok) throw apiError(parsed.error)
  const input = parsed.event
  const parsedSettings = parseSettings(asRecord(body).settings)
  if (!parsedSettings.ok) throw apiError(parsedSettings.error)
  const { settings } = parsedSettings
  const parsedPools = parsePools(asRecord(body).pools)
  if (!parsedPools.ok) throw apiError(parsedPools.error)
  const { pools } = parsedPools

  const db = useDb(event)
  const slug = await freeSlug(db, input.name)
  const inviteToken = createInviteToken()
  // Poll Sessions wait for a Date from the poll; direct ones have their Dates from the start. The Event
  // is in the poll phase while any Session has no Date (ADR 0011).
  const startsAt: (Date | null)[] = input.dateMode === 'poll'
    ? Array.from({ length: input.sessions }, () => null)
    : input.startsAt
  const phase = phaseOf(startsAt)

  // The one Event write that does not go through changeEvent: the Event does not exist yet, so there is nothing to
  // load by slug, and no one is in its room to tell (#183).
  // eslint-disable-next-line no-restricted-syntax -- creating an Event has no Event to load and no one to publish to
  await db.transaction(async (tx) => {
    await assertGamesExist(tx, pools.main, pools.tiebreaker)
    const [row] = await tx
      .insert(events)
      .values({ slug, inviteToken, hostId: user.id, name: input.name, phase, ...settings })
      .returning({ id: events.id })
    await tx.insert(sessions).values(startsAt.map(date => ({ eventId: row!.id, startsAt: date })))
    const poolRows = POOLS.flatMap(pool => pools[pool].map(gameId => ({ eventId: row!.id, gameId, pool })))
    if (poolRows.length > 0) await tx.insert(eventPoolGames).values(poolRows)
    await addMember(tx, row!.id, user.id)
    if (input.dateMode === 'poll') {
      await tx.insert(pollSlots).values(input.slots.map(startsAt => ({ eventId: row!.id, startsAt })))
    }
  })

  return { slug, inviteUrl: inviteUrl(event, slug, inviteToken) }
})

/** A slug that no Event uses yet. The random suffix makes a clash rare; the unique column is the last guard. */
async function freeSlug(db: Db, name: string): Promise<string> {
  for (let attempt = 0; attempt < SLUG_ATTEMPTS; attempt++) {
    const slug = createSlug(name)
    const [taken] = await db.select({ id: events.id }).from(events).where(eq(events.slug, slug))
    if (!taken) return slug
  }
  throw createError({ statusCode: 500, statusMessage: 'Could not reserve an Event link' })
}
