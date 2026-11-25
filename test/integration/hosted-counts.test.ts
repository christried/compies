import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { eventMembers, events, games } from '../../server/db/schema'
import type { HostedCounts } from '../../shared/auth'
import { createTestApp, sendVia, type TestRequest } from './app'
import { createTestDb, resetDatabase } from './harness'
import { hostCreatesEvent, signInAs, type Rig, type Signed } from './scenario'
import { setAllowlist, stubAuthEnv } from './sign-in'

// What a User's deletion would remove, counted (#918, spec #907): GET /api/me/hosted answers the number of Events they host and the number of games in their library,
// the two numbers the Profil page's „Konto löschen“ sheet shows before the hold. It counts exactly the sets `deleteUser` removes (server/utils/delete-user.ts).

const hostA = { provider: 'discord', id: '1', name: 'Hostess', email: 'host@example.com', image: undefined } as const
const hostB = { provider: 'discord', id: '2', name: 'Zweite', email: 'zweite@example.com', image: undefined } as const
const player = { provider: 'twitch', id: '3', name: 'Wombat', email: 'wombat@example.com', image: undefined } as const

describe('what a deletion would remove (#918)', () => {
  let testDb: Awaited<ReturnType<typeof createTestDb>>
  let request: TestRequest
  let rig: Rig

  beforeAll(async () => {
    testDb = await createTestDb()
    request = createTestApp(testDb.db)
    rig = { request, db: testDb.db }
  })

  afterAll(async () => {
    await testDb.client.close()
  })

  beforeEach(async () => {
    stubAuthEnv()
    setAllowlist({ hosts: 'discord:1,discord:2' })
    await resetDatabase(testDb.db)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  const send = sendVia(() => request)
  const read = async (who: Signed) => await (await send('GET', '/api/me/hosted', who.cookie)).json() as HostedCounts
  const eventOf = (who: Signed, name: string) => hostCreatesEvent(rig, who, { name })
  const gamesOf = async (who: Signed, count: number, archived = 0) => {
    const rows = Array.from({ length: count }, (_, index) => ({ name: `Spiel ${who.id.slice(0, 4)} ${index}`, createdBy: who.id, ...(index < archived ? { archivedAt: new Date() } : {}) }))
    await testDb.db.insert(games).values(rows)
  }

  it('answers 401 to a signed-out request', async () => {
    expect((await send('GET', '/api/me/hosted', undefined)).status).toBe(401)
  })

  it('reads 0 and 0 for a User who hosts nothing and has no library', async () => {
    const who = await signInAs(rig, hostA)
    expect(await read(who)).toEqual({ events: 0, games: 0 })
  })

  it('counts the Events at the edges 1 and 2', async () => {
    const who = await signInAs(rig, hostA)
    await eventOf(who, 'Eins')
    expect((await read(who)).events).toBe(1)
    await eventOf(who, 'Zwei')
    expect((await read(who)).events).toBe(2)
  })

  it('counts a finished and a Deleted Event with an open one: three', async () => {
    const who = await signInAs(rig, hostA)
    const open = await eventOf(who, 'Offen')
    const finished = await eventOf(who, 'Fertig')
    const deleted = await eventOf(who, 'Gelöscht')
    await testDb.db.update(events).set({ phase: 'finished', finishedAt: new Date() }).where(eq(events.id, finished.eventId))
    expect((await send('DELETE', `/api/e/${deleted.slug}`, who.cookie)).status).toBe(200)
    expect(open.slug).toBeTruthy()
    expect((await read(who)).events).toBe(3)
  })

  it('never counts another User\'s Events, and a Member of an Event hosts nothing', async () => {
    const first = await signInAs(rig, hostA)
    const second = await signInAs(rig, hostB)
    const guest = await signInAs(rig, player)
    const shared = await eventOf(first, 'Gemeinsam')
    await testDb.db.insert(eventMembers).values({ eventId: shared.eventId, userId: guest.id })
    await eventOf(second, 'Anderes 1')
    await eventOf(second, 'Anderes 2')
    await eventOf(second, 'Anderes 3')
    expect((await read(first)).events).toBe(1)
    expect((await read(second)).events).toBe(3)
    expect((await read(guest)).events).toBe(0)
  })

  it('counts the library, an archived game included, and never another User\'s games', async () => {
    const first = await signInAs(rig, hostA)
    const second = await signInAs(rig, hostB)
    await gamesOf(first, 3, 1)
    await gamesOf(second, 5)
    expect((await read(first)).games).toBe(3)
    expect((await read(second)).games).toBe(5)
  })
})
