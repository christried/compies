import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { testClock } from '../../server/utils/clock'
import { memoryRoomNotifier } from '../../server/utils/room-notifier'
import { createTestApp, errorOf, sendVia } from './app'
import { createTestDb, resetDatabase } from './harness'
import { playersJoin, readEvent, startRunningEvent, type Stage } from './scenario'
import { stubAuthEnv } from './sign-in'

// The Event scenario module (#418 part B): glossary verbs over the HTTP surface, which the integration tests use in place of their
// local `running()` builders. Each case reads the result the way a User or the API does: responses and the Event read.
const host = { provider: 'discord', id: '1', name: 'Hostess', email: 'host@example.com' } as const
const players = {
  one: { provider: 'discord', id: '2', name: 'Eins', email: 'one@example.com' },
  two: { provider: 'discord', id: '3', name: 'Zwei', email: 'two@example.com' },
} as const
const outsider = { provider: 'twitch', id: '8', name: 'Fremder', email: 'outsider@example.com' } as const

describe('the Event scenario', () => {
  let testDb: Awaited<ReturnType<typeof createTestDb>>
  let stage: Stage
  const notifier = memoryRoomNotifier()
  const clock = testClock('2090-10-30T10:00:00.000Z')

  beforeAll(async () => {
    testDb = await createTestDb()
    stage = { request: createTestApp(testDb.db, { roomNotifier: notifier, clock }), db: testDb.db, clock, notifier }
  })

  afterAll(async () => {
    await testDb.client.close()
  })

  beforeEach(async () => {
    stubAuthEnv()
    clock.set('2090-10-30T10:00:00.000Z')
    notifier.clear()
    await resetDatabase(testDb.db)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  const send = sendVia(() => stage.request)

  describe('startRunningEvent', () => {
    it('starts a Session of two teams of one Player: the Host reads a running Event, and an outsider is no Member until the invite joins them', async () => {
      const ev = await startRunningEvent(stage, {
        host, players, outsiders: { outsider },
        seats: [['one', 1], ['two', 2]],
        settings: { teamSize: 1 },
      })

      const view = await readEvent(stage, ev.host.cookie, ev.slug)
      expect(view.event.phase).toBe('running')
      expect(view.runningSessionId).not.toBeNull()
      expect(view.members.filter(member => member.team === 1).map(member => member.id)).toEqual([ev.players.one.id])
      expect(view.members.filter(member => member.team === 2).map(member => member.id)).toEqual([ev.players.two.id])

      expect(await errorOf(await send('GET', `/api/e/${ev.slug}`, ev.outsiders.outsider.cookie))).toEqual({ status: 404, code: 'Event not found' })
      await playersJoin(stage, ev, [ev.outsiders.outsider])
      expect((await readEvent(stage, ev.outsiders.outsider.cookie, ev.slug)).members.map(member => member.id)).toContain(ev.outsiders.outsider.id)
    })
  })
})
