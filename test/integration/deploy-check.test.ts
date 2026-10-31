import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import deployCheck from '../../server/api/internal/deploy-check.get'
import { events, sessions, users } from '../../server/db/schema'
import { ROOM_CALL_SIGNATURE_HEADER, ROOM_CALL_TIMESTAMP_HEADER, signRoomCall } from '../../shared/room-auth'
import { createTestDb, createTestServer } from './harness'

// The game-day guard of the Worker deploy (#157, spec #153 § Deploys): the deploy workflow asks this endpoint
// whether a Session is dated today before it drops every socket. Signed like a call to a room, with the same keys.
const HOUR = 3_600_000

describe('GET /api/internal/deploy-check', () => {
  let testDb: Awaited<ReturnType<typeof createTestDb>>
  let request: ReturnType<typeof createTestServer>
  let hostId: string

  beforeAll(async () => {
    testDb = await createTestDb()
    request = createTestServer(testDb.db, { 'GET /api/internal/deploy-check': deployCheck })
  })

  afterAll(async () => {
    await testDb.client.close()
  })

  beforeEach(async () => {
    vi.stubEnv('ROOM_INTERNAL_SECRET', 'internal-secret')
    vi.stubEnv('ROOM_INTERNAL_SECRET_PREVIOUS', 'old-internal-secret')
    await testDb.db.delete(sessions)
    await testDb.db.delete(events)
    await testDb.db.delete(users)
    const [host] = await testDb.db.insert(users).values({ name: 'Hostess', email: 'host@example.com' }).returning()
    hostId = host!.id
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  let counter = 0

  /** An Event with one Session per given Date (a Date of null is a Session still to be dated). */
  async function eventWith(dates: (Date | null)[], options: { deleted?: boolean, removed?: boolean, running?: boolean, startedAt?: Date } = {}) {
    counter++
    const [eventRow] = await testDb.db.insert(events).values({
      slug: `game-day-${counter}`,
      inviteToken: `invite-${counter}`,
      hostId,
      name: 'Freitags-Zocken',
      phase: 'date_set',
      deletedAt: options.deleted ? new Date() : null,
    }).returning()
    await testDb.db.insert(sessions).values(dates.map(startsAt => ({
      eventId: eventRow!.id,
      startsAt,
      removedAt: options.removed ? new Date() : null,
      startedAt: options.startedAt ?? (options.running ? new Date() : null),
    })))
  }

  /** Whole-day distances in hours: a Berlin day is 23 to 25 hours long, so 36 hours is always another day. */
  const now = () => new Date()
  const hoursFromNow = (hours: number) => new Date(Date.now() + hours * HOUR)

  async function ask(options: { secret?: string, at?: number, signed?: boolean } = {}) {
    const headers: Record<string, string> = {}
    if (options.signed !== false) {
      const call = await signRoomCall('', options.secret ?? 'internal-secret', options.at ?? Date.now())
      headers[ROOM_CALL_TIMESTAMP_HEADER] = call.timestamp
      headers[ROOM_CALL_SIGNATURE_HEADER] = call.signature
    }
    return request('/api/internal/deploy-check', { headers })
  }

  it('says not ok, with the reason, when a Session is dated today', async () => {
    await eventWith([now()])

    const response = await ask()

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: false, reason: expect.stringContaining('game day') })
  })

  it('counts every dated Session of today in the reason', async () => {
    await eventWith([now(), null])
    await eventWith([now()])

    const body = await (await ask()).json() as { ok: boolean, reason: string }

    expect(body.ok).toBe(false)
    expect(body.reason).toContain('2 Sessions')
  })

  it('says ok on a day without a Session today: yesterday, tomorrow, undated, nothing at all', async () => {
    expect(await (await ask()).json()).toEqual({ ok: true, reason: null })

    await eventWith([hoursFromNow(-36), hoursFromNow(36), null])

    expect(await (await ask()).json()).toEqual({ ok: true, reason: null })
  })

  it('ignores a Session of a deleted Event and a removed Session', async () => {
    await eventWith([now()], { deleted: true })
    await eventWith([now()], { removed: true })

    expect(await (await ask()).json()).toEqual({ ok: true, reason: null })
  })

  it('says not ok while a Session runs (started, not ended), also when its Date is not today (#164)', async () => {
    await eventWith([hoursFromNow(-36)], { running: true })

    const body = await (await ask()).json() as { ok: boolean, reason: string }

    expect(body.ok).toBe(false)
    expect(body.reason).toContain('running')
  })

  it('says ok when the only Running Session started 16 h or more ago (#200)', async () => {
    await eventWith([hoursFromNow(-36)], { startedAt: hoursFromNow(-17) })

    expect(await (await ask()).json()).toEqual({ ok: true, reason: null })
  })

  it('does not count a Session that ended, a running one that was removed or one of a deleted Event', async () => {
    await eventWith([hoursFromNow(-36)], { removed: true, running: true })
    await eventWith([hoursFromNow(-36)], { deleted: true, running: true })
    const [ended] = await testDb.db.insert(events).values({ slug: 'ended', inviteToken: 'invite-ended', hostId, name: 'Vorbei', phase: 'running' }).returning()
    await testDb.db.insert(sessions).values({ eventId: ended!.id, startsAt: hoursFromNow(-36), startedAt: hoursFromNow(-35), endedAt: hoursFromNow(-30) })

    expect(await (await ask()).json()).toEqual({ ok: true, reason: null })
  })

  it('accepts a call signed with the previous key while a key rotates', async () => {
    await eventWith([now()])

    const response = await ask({ secret: 'old-internal-secret' })

    expect(response.status).toBe(200)
    expect(((await response.json()) as { ok: boolean }).ok).toBe(false)
  })

  it('refuses an unsigned call, a wrong key and a stale call with the same 401', async () => {
    const unsigned = await ask({ signed: false })
    const wrongKey = await ask({ secret: 'someone-elses-secret' })
    const stale = await ask({ at: Date.now() - 2 * 60_000 })

    for (const refused of [unsigned, wrongKey, stale]) expect(refused.status).toBe(401)
    const [unsignedBody, wrongKeyBody, staleBody] = [await unsigned.json(), await wrongKey.json(), await stale.json()]
    expect(wrongKeyBody).toEqual(unsignedBody)
    expect(staleBody).toEqual(unsignedBody)
  })

  it('refuses every call when this deployment has no internal secret', async () => {
    vi.stubEnv('ROOM_INTERNAL_SECRET', '')
    vi.stubEnv('ROOM_INTERNAL_SECRET_PREVIOUS', '')

    expect((await ask({ secret: 'internal-secret' })).status).toBe(401)
  })
})
