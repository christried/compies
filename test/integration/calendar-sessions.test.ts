import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import getMe from '../../server/api/me.get'
import createEvent from '../../server/api/e/index.post'
import downloadIcs from '../../server/api/e/[slug]/ics.get'
import rescheduleSession from '../../server/api/e/[slug]/sessions/[id]/reschedule.post'
import { pollSlots, pollVotes, eventMembers, events, sessions, users } from '../../server/db/schema'
import { TEST_SETTINGS } from './fixtures'
import { createTestDb, createTestServer } from './harness'
import { setAllowlist, signIn, stubAuthEnv } from './sign-in'

// One calendar file for all Sessions (#53): one entry per Session with a Date, stable UIDs, the Session's own
// SEQUENCE, the numbered title with several Sessions, and the sequence raised when a Reschedule changes the
// order. Dates are in 2090, so the "in the future" rule holds without a fake clock. Berlin is UTC+1 in November.
const host = { provider: 'discord', id: '1', name: 'Hostess', email: 'host@example.com', image: undefined } as const

describe('the calendar file for several Sessions', () => {
  let testDb: Awaited<ReturnType<typeof createTestDb>>
  let request: ReturnType<typeof createTestServer>

  beforeAll(async () => {
    testDb = await createTestDb()
    request = createTestServer(testDb.db, {
      'GET /api/me': getMe,
      'POST /api/e': createEvent,
      'GET /api/e/:slug/ics': downloadIcs,
      'POST /api/e/:slug/sessions/:id/reschedule': rescheduleSession,
    })
  })

  afterAll(async () => {
    await testDb.client.close()
  })

  beforeEach(async () => {
    stubAuthEnv()
    await testDb.db.delete(pollVotes)
    await testDb.db.delete(pollSlots)
    await testDb.db.delete(eventMembers)
    await testDb.db.delete(events)
    await testDb.db.delete(users)
    setAllowlist({ hosts: 'discord:1' })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  async function signInAsHost() {
    return (await signIn(testDb.db, host)).cookie
  }

  /** A direct Event with one Session per Date (given ascending), named `name`. Returns the slug and the Session ids in Date order. */
  async function createSessions(cookie: string, name: string, dates: string[]) {
    const response = await request('/api/e', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ name, dateMode: 'direct', sessions: dates.length, startsAt: dates, settings: TEST_SETTINGS }),
    })
    const { slug } = await response.json() as { slug: string }
    const [event] = await testDb.db.select().from(events).where(eq(events.slug, slug))
    const rows = await sessionRowsOf(event!.id)
    return { slug, eventId: event!.id, ids: rows.map(row => row.id) }
  }

  async function sessionRowsOf(eventId: string) {
    return testDb.db.select().from(sessions).where(eq(sessions.eventId, eventId)).orderBy(sessions.startsAt)
  }

  function ics(cookie: string, slug: string) {
    return request(`/api/e/${slug}/ics`, { headers: { cookie } })
  }

  function reschedule(cookie: string, slug: string, sessionId: string, startsAt: string) {
    return request(`/api/e/${slug}/sessions/${sessionId}/reschedule`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ startsAt }),
    })
  }

  /** The file split into its VEVENT blocks, each one a list of unfolded property lines. */
  async function entriesOf(cookie: string, slug: string): Promise<string[][]> {
    const lines = (await (await ics(cookie, slug)).text()).replace(/\r\n /g, '').split('\r\n')
    const blocks: string[][] = []
    let current: string[] | null = null
    for (const line of lines) {
      if (line === 'BEGIN:VEVENT') {
        current = []
      }
      else if (line === 'END:VEVENT' && current) {
        blocks.push(current)
        current = null
      }
      else if (current) {
        current.push(line)
      }
    }
    return blocks
  }

  /** The entry's property value by name, e.g. `SUMMARY`. */
  function property(entry: string[], name: string): string | undefined {
    return entry.find(line => line.startsWith(`${name}:`))?.slice(name.length + 1)
  }

  it('gives one entry per Session with a Date, each with its own stable UID and sequence, numbered in the titles', async () => {
    const cookie = await signInAsHost()
    const { slug, ids } = await createSessions(cookie, 'Freitags-Zocken', ['2090-11-07T20:00', '2090-11-08T20:00'])

    const entries = await entriesOf(cookie, slug)

    expect(entries).toHaveLength(2)
    expect(entries.map(entry => property(entry, 'UID'))).toEqual([`${ids[0]}@compies`, `${ids[1]}@compies`])
    expect(entries.map(entry => property(entry, 'SEQUENCE'))).toEqual(['0', '0'])
    expect(entries.map(entry => property(entry, 'SUMMARY'))).toEqual([
      'Freitags-Zocken · Session 1 (Compies)',
      'Freitags-Zocken · Session 2 (Compies)',
    ])
    expect(entries.map(entry => property(entry, 'DTSTART'))).toEqual(['20901107T190000Z', '20901108T190000Z'])
    expect(entries.map(entry => property(entry, 'DTEND'))).toEqual(['20901108T020000Z', '20901109T020000Z'])
    expect(entries.map(entry => property(entry, 'DESCRIPTION'))).toEqual([
      `Zum Event: ${property(entries[0]!, 'URL')}`,
      `Zum Event: ${property(entries[1]!, 'URL')}`,
    ])
  })

  it('keeps the plain title with one Session, and the UID is that Session’s id', async () => {
    const cookie = await signInAsHost()
    const { slug, ids } = await createSessions(cookie, 'Freitags-Zocken', ['2090-11-07T20:00'])

    const [entry] = await entriesOf(cookie, slug)

    expect(property(entry!, 'SUMMARY')).toBe('Freitags-Zocken (Compies)')
    expect(property(entry!, 'UID')).toBe(`${ids[0]}@compies`)
  })

  it('leaves an undated Session out of the file and answers 404 when no Session has a Date', async () => {
    const cookie = await signInAsHost()
    const { slug, eventId } = await createSessions(cookie, 'Freitags-Zocken', ['2090-11-07T20:00'])
    await testDb.db.insert(sessions).values({ eventId, startsAt: null })

    expect(await entriesOf(cookie, slug)).toHaveLength(1)

    await testDb.db.delete(sessions).where(eq(sessions.eventId, eventId))
    await testDb.db.insert(sessions).values({ eventId, startsAt: null })
    expect((await ics(cookie, slug)).status).toBe(404)
  })

  it('keeps the UIDs when the Sessions are rescheduled and raises the sequence of a Session whose number changed', async () => {
    const cookie = await signInAsHost()
    const { slug, ids } = await createSessions(cookie, 'Freitags-Zocken', ['2090-11-07T20:00', '2090-11-08T20:00', '2090-11-09T20:00'])
    const before = await entriesOf(cookie, slug)

    // The first Session moves to the 10th: the others move up one number each.
    expect((await reschedule(cookie, slug, ids[0]!, '2090-11-10T20:00')).status).toBe(200)

    const after = await entriesOf(cookie, slug)
    expect(before.map(entry => property(entry, 'UID')).sort()).toEqual(after.map(entry => property(entry, 'UID')).sort())
    // The file lists the entries by Session number, so the moved Session comes last now.
    expect(after.map(entry => [property(entry, 'UID'), property(entry, 'SEQUENCE'), property(entry, 'SUMMARY')])).toEqual([
      [`${ids[1]}@compies`, '1', 'Freitags-Zocken · Session 1 (Compies)'],
      [`${ids[2]}@compies`, '1', 'Freitags-Zocken · Session 2 (Compies)'],
      [`${ids[0]}@compies`, '1', 'Freitags-Zocken · Session 3 (Compies)'],
    ])
  })

  it('raises only the moved Session when a Reschedule keeps the order', async () => {
    const cookie = await signInAsHost()
    const { slug, ids } = await createSessions(cookie, 'Freitags-Zocken', ['2090-11-07T20:00', '2090-11-08T20:00', '2090-11-09T20:00'])

    expect((await reschedule(cookie, slug, ids[1]!, '2090-11-08T21:30')).status).toBe(200)

    const rows = await sessionRowsOf((await testDb.db.select().from(events).where(eq(events.slug, slug)))[0]!.id)
    expect(rows.map(row => row.icsSequence)).toEqual([0, 1, 0])
    const entries = await entriesOf(cookie, slug)
    expect(entries.map(entry => property(entry, 'SEQUENCE'))).toEqual(['0', '1', '0'])
    expect(entries.map(entry => property(entry, 'DTSTART'))).toEqual(['20901107T190000Z', '20901108T203000Z', '20901109T190000Z'])
  })
})
