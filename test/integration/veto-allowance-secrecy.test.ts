import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { events } from '../../server/db/schema'
import { eq } from 'drizzle-orm'
import { testClock } from '../../server/utils/clock'
import { memoryRoomNotifier } from '../../server/utils/room-notifier'
import { createTestApp, sendVia, type TestRequest } from './app'
import { PLAYER, sweepGets } from './hidden-wheel-world'
import { createTestDb, resetDatabase } from './harness'
import { hostEndsSession, hostStartsSession, readEvent, readEventText, readFeed, readFeedText, setUpEvent, type Rig } from './scenario'
import { stubAuthEnv } from './sign-in'

// The Veto allowance stays the Host's until the Event starts (#453, spec #502, GLOSSARY: Veto allowance): through the HTTP API as a
// Player, a search of the whole response for the number, and the room, the feed and every GET route. The rule itself is unit-tested
// in settings.test.ts; this file checks what a Member can observe.

const host = { provider: 'discord', id: '1', name: 'Hostess', email: 'host@example.com', image: undefined } as const
const players = {
  one: { provider: 'discord', id: '2', name: 'Eins', email: 'one@example.com', image: undefined },
  two: { provider: 'discord', id: '3', name: 'Zwei', email: 'two@example.com', image: undefined },
  fan: { provider: 'discord', id: '4', name: 'Zuschauer', email: 'fan@example.com', image: undefined },
} as const

const T0 = '2090-10-30T10:00:00.000Z'
// A number no other number of the read equals: 2 teams of 1, 10 games.
const ALLOWANCE = 7

/** Every number in a parsed JSON value, at any depth, object keys excluded. */
function numbersIn(value: unknown): number[] {
  if (typeof value === 'number') return [value]
  if (Array.isArray(value)) return value.flatMap(numbersIn)
  if (value !== null && typeof value === 'object') return Object.values(value).flatMap(numbersIn)
  return []
}

const asJson = (text: string): unknown => JSON.parse(text)

describe('the Veto allowance is hidden until the Event starts (#453)', () => {
  let testDb: Awaited<ReturnType<typeof createTestDb>>
  let request: TestRequest
  let rig: Rig
  const notifier = memoryRoomNotifier()
  const clock = testClock(T0)

  beforeAll(async () => {
    testDb = await createTestDb()
    request = createTestApp(testDb.db, { roomNotifier: notifier, clock })
    rig = { request, db: testDb.db, clock, notifier }
  })

  afterAll(async () => {
    await testDb.client.close()
  })

  beforeEach(async () => {
    stubAuthEnv()
    clock.set(T0)
    notifier.clear()
    await resetDatabase(testDb.db)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  const send = sendVia(() => request)

  /**
   * An Event of two teams of one with a Lucky Wheel (or Host pick) and the Veto allowance 7, not started. `confirmed` Dates decide the
   * Phase: 0 is `poll`, 1 of 1 Session is `date_set`; two Sessions keep the Event `running` between them.
   */
  async function event({ mode = 'lucky_wheel', sessions = 1, confirmed = sessions }: { mode?: 'lucky_wheel' | 'admin_pick', sessions?: number, confirmed?: number } = {}) {
    const made = await setUpEvent(rig, {
      host,
      players,
      // No seat before a Date is set (the Event is still in its poll).
      seats: confirmed === 0 ? [] : [['one', 1], ['two', 2]],
      sessions,
      confirmed,
      settings: { teamSize: 1, selectionMode: mode, vetoAllowance: mode === 'lucky_wheel' ? ALLOWANCE : null },
    })
    return { ...made, hostCookie: made.host.cookie, one: made.players.one.cookie, fan: made.players.fan.cookie }
  }

  type Party = Awaited<ReturnType<typeof event>>

  const hostPatches = (party: Party, vetoAllowance: number) => send('PATCH', `/api/e/${party.slug}/settings`, party.hostCookie, { settings: { vetoAllowance } })

  const expectHidden = async (party: Party, cookie: string) => {
    const text = await readEventText(rig, cookie, party.slug)
    const view = asJson(text) as { settings: { vetoAllowance: number | null }, vetoAllowanceHidden: boolean }
    expect(numbersIn(view), 'no number of the allowance anywhere in the read').not.toContain(ALLOWANCE)
    expect(text).not.toMatch(/"vetoAllowance":\s*\d/)
    expect(view.settings.vetoAllowance).toBeNull()
    expect(view.vetoAllowanceHidden).toBe(true)
  }

  const expectKnown = async (party: Party, cookie: string, allowance: number | null = ALLOWANCE) => {
    const view = await readEvent(rig, cookie, party.slug)
    expect(view.settings?.vetoAllowance).toBe(allowance)
    expect(view.vetoAllowanceHidden).toBe(false)
  }

  it('control: the Host reads the number before the start', async () => {
    const party = await event()
    const view = await readEvent(rig, party.hostCookie, party.slug)
    expect(numbersIn(view)).toContain(ALLOWANCE)
    expect(view.settings?.vetoAllowance).toBe(ALLOWANCE)
    expect(view.vetoAllowanceHidden).toBe(false)
  })

  it.each([
    ['poll', 0],
    ['date_set', 1],
  ])('a Player reads no number in Phase %s, only that it is hidden', async (phase, confirmed) => {
    const party = await event({ confirmed })
    expect((await readEvent(rig, party.hostCookie, party.slug)).event.phase).toBe(phase)
    await expectHidden(party, party.one)
    await expectHidden(party, party.fan)
  })

  it('answers the Player the same whatever the allowance is (0, 1 or 9)', async () => {
    const party = await event()
    const first = await readEventText(rig, party.one, party.slug)
    for (const allowance of [0, 1, 9]) {
      expect((await hostPatches(party, allowance)).status).toBe(200)
      expect((await readEvent(rig, party.hostCookie, party.slug)).settings?.vetoAllowance, 'the patch landed').toBe(allowance)
      expect(await readEventText(rig, party.one, party.slug)).toBe(first)
    }
  })

  it('shows the number to every Member from the start on, between Sessions too', async () => {
    const party = await event({ sessions: 2 })
    await expectHidden(party, party.one)
    await hostStartsSession(rig, party)
    await expectKnown(party, party.one)
    await expectKnown(party, party.fan)
    await hostEndsSession(rig, party)
    const between = await readEvent(rig, party.one, party.slug)
    expect(between.event.phase).toBe('running')
    await expectKnown(party, party.one)
    await expectKnown(party, party.fan)
  })

  it('always shows the number to the Host', async () => {
    const party = await event({ sessions: 2 })
    await expectKnown(party, party.hostCookie)
    await hostStartsSession(rig, party)
    await expectKnown(party, party.hostCookie)
  })

  it('has no allowance to hide under Host pick, before and after the start', async () => {
    const party = await event({ mode: 'admin_pick' })
    await expectKnown(party, party.one, null)
    await hostStartsSession(rig, party)
    await expectKnown(party, party.one, null)
  })

  it('has nothing to hide in an Event that is not set up', async () => {
    const party = await event()
    await testDb.db.update(events).set({ format: null, teamCount: null, teamSize: null, gameCount: null, pointsTable: null, selectionMode: null, hiddenWheel: null, vetoAllowance: null }).where(eq(events.slug, party.slug))
    const view = await readEvent(rig, party.one, party.slug)
    expect(view.settings).toBeNull()
    expect(view.vetoAllowanceHidden).toBe(false)
  })

  it('keeps the number out of the feed and the room before the start; a Bonus Veto keeps its entry', async () => {
    const party = await event()
    expect((await hostPatches(party, 4)).status).toBe(200)
    expect((await hostPatches(party, ALLOWANCE)).status).toBe(200)
    expect((await send('POST', `/api/e/${party.slug}/bonus-vetoes`, party.hostCookie, { team: 1 })).status).toBe(200)

    const entries = await readFeed(rig, party.one, party.slug, 'limit=100')
    const granted = entries.filter(entry => entry.type === 'bonus_veto_granted')
    expect(granted).toHaveLength(1)
    expect(granted[0]!.params).toMatchObject({ team: 1 })
    expect(entries.some(entry => /allowance/i.test(entry.type))).toBe(false)

    const feed = await readFeedText(rig, party.one, party.slug, 'limit=100')
    expect(numbersIn(asJson(feed))).not.toContain(ALLOWANCE)
    expect(feed).not.toContain('vetoAllowance')
    const room = JSON.stringify(notifier.messages(party.eventId))
    expect(numbersIn(asJson(room))).not.toContain(ALLOWANCE)
    expect(room).not.toContain('vetoAllowance')
    await expectHidden(party, party.one)
  })

  it('has the number in no GET route a Player can read before the start', async () => {
    const party = await event()
    const sweep = await sweepGets(request, { viewers: [{ who: PLAYER, cookie: party.one }], event: { slug: party.slug, inviteToken: party.inviteToken }, games: [] })
    expect(sweep.length).toBeGreaterThan(5)
    for (const entry of sweep) {
      if (entry.body === null) continue
      expect(entry.body, `${entry.label} as ${entry.who}`).not.toMatch(/"vetoAllowance":\s*\d/)
      if (entry.contentType?.includes('json')) expect(numbersIn(asJson(entry.body)), `${entry.label} as ${entry.who}`).not.toContain(ALLOWANCE)
    }
  })
})
