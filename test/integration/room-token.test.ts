import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import createEvent from '../../server/api/e/index.post'
import roomToken from '../../server/api/e/[slug]/room.post'
import { eventMembers, events, pollSlots, users } from '../../server/db/schema'
import { verifyRoomToken } from '../../shared/room-auth'
import { TEST_SETTINGS } from './fixtures'
import { createTestDb, createTestServer } from './harness'
import { setAllowlist, signIn, stubAuthEnv } from './sign-in'

// The room token (#156, spec #153 § Room access): a Member trades their login for 60 seconds of access to one
// Event's room. A stranger and a missing Event answer alike (ADR 0006).
const host = { provider: 'discord', id: '1', name: 'Hostess', email: 'host@example.com', image: undefined } as const
const member = { provider: 'discord', id: '2', name: 'Gast', email: 'member@example.com', image: undefined } as const
const stranger = { provider: 'twitch', id: '3', name: 'Fremd', email: 'stranger@example.com', image: undefined } as const

describe('POST /api/e/:slug/room', () => {
  let testDb: Awaited<ReturnType<typeof createTestDb>>
  let request: ReturnType<typeof createTestServer>

  beforeAll(async () => {
    testDb = await createTestDb()
    request = createTestServer(testDb.db, { 'POST /api/e': createEvent, 'POST /api/e/:slug/room': roomToken })
  })

  afterAll(async () => {
    await testDb.client.close()
  })

  beforeEach(async () => {
    stubAuthEnv()
    vi.stubEnv('REALTIME_URL', 'https://compies-rt-staging.example.workers.dev')
    vi.stubEnv('ROOM_TOKEN_SECRET', 'token-secret')
    await testDb.db.delete(pollSlots)
    await testDb.db.delete(eventMembers)
    await testDb.db.delete(events)
    await testDb.db.delete(users)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  async function eventWithMember() {
    setAllowlist({ hosts: 'discord:1' })
    const hostCookie = (await signIn(testDb.db, host)).cookie
    const memberCookie = (await signIn(testDb.db, member)).cookie
    const strangerCookie = (await signIn(testDb.db, stranger)).cookie
    const created = await request('/api/e', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cookie': hostCookie },
      body: JSON.stringify({ name: 'Freitags-Zocken', dateMode: 'poll', slots: ['2090-10-30T20:30'], settings: TEST_SETTINGS }),
    })
    const { slug } = await created.json() as { slug: string }
    const [eventRow] = await testDb.db.select().from(events).where(eq(events.slug, slug))
    const [hostRow] = await testDb.db.select().from(users).where(eq(users.email, host.email))
    const [memberRow] = await testDb.db.select().from(users).where(eq(users.email, member.email))
    await testDb.db.insert(eventMembers).values({ eventId: eventRow!.id, userId: memberRow!.id })
    return { slug, eventId: eventRow!.id, hostId: hostRow!.id, memberId: memberRow!.id, hostCookie, memberCookie, strangerCookie }
  }

  const ask = (slug: string, cookie?: string) => request(`/api/e/${slug}/room`, { method: 'POST', headers: cookie ? { cookie } : {} })

  it('gives a Member the Worker and a token for this Event, this User and their role', async () => {
    const { slug, eventId, hostId, memberId, hostCookie, memberCookie } = await eventWithMember()

    const asMember = await ask(slug, memberCookie)
    expect(asMember.status).toBe(200)
    const memberTicket = await asMember.json() as { url: string, room: string, token: string }
    expect(memberTicket.url).toBe('https://compies-rt-staging.example.workers.dev')
    expect(memberTicket.room).toBe(eventId)
    const verified = await verifyRoomToken(memberTicket.token, { secrets: ['token-secret'], now: Date.now(), eventId })
    expect(verified).toEqual({ ok: true, claims: { sub: memberId, evt: eventId, host: false, exp: expect.any(Number), jti: expect.any(String) } })

    const hostTicket = await (await ask(slug, hostCookie)).json() as { token: string }
    expect(await verifyRoomToken(hostTicket.token, { secrets: ['token-secret'], now: Date.now(), eventId })).toMatchObject({ ok: true, claims: { sub: hostId, host: true } })
  })

  it('lets the token live for 60 seconds and gives every token its own id', async () => {
    const { slug, memberCookie } = await eventWithMember()
    const before = Date.now()

    const first = await (await ask(slug, memberCookie)).json() as { token: string }
    const second = await (await ask(slug, memberCookie)).json() as { token: string }

    const claims = async (token: string) => {
      const result = await verifyRoomToken(token, { secrets: ['token-secret'], now: Date.now() })
      if (!result.ok) throw new Error(result.reason)
      return result.claims
    }
    const [one, two] = [await claims(first.token), await claims(second.token)]
    expect(one.exp * 1000).toBeGreaterThanOrEqual(before + 59_000)
    expect(one.exp * 1000).toBeLessThanOrEqual(Date.now() + 60_000)
    expect(one.jti).not.toBe(two.jti)
  })

  it('answers a stranger as it answers a missing Event, and a signed-out User with 401', async () => {
    const { slug, strangerCookie } = await eventWithMember()

    const stranded = await ask(slug, strangerCookie)
    const missing = await ask('no-such-event-0000', strangerCookie)
    expect(stranded.status).toBe(404)
    expect(await stranded.json()).toEqual(await missing.json())

    expect((await ask(slug)).status).toBe(401)
  })

  it('refuses with no_live_connection when this deployment has no Worker', async () => {
    const { slug, memberCookie } = await eventWithMember()
    vi.stubEnv('REALTIME_URL', '')

    const response = await ask(slug, memberCookie)

    expect(response.status).toBe(503)
    expect(((await response.json()) as { statusMessage: string }).statusMessage).toBe('no_live_connection')
  })

  it('refuses the same way when the token secret is missing', async () => {
    const { slug, memberCookie } = await eventWithMember()
    vi.stubEnv('ROOM_TOKEN_SECRET', '')

    expect((await ask(slug, memberCookie)).status).toBe(503)
  })
})
