import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { getQuery } from 'h3'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ActivityFeed from '~/components/ActivityFeed.vue'
import { formatSlotWhen } from '~/utils/berlin-time'
import type { ActivityEntry, ActivityPage } from '~~/shared/activity'
import { envelope, type RoomMessage } from '~~/shared/realtime'

// The Activity feed (#159, spec #153 § Activity feed): it loads the first page from the feed endpoint, adds what the
// room sends at once, keeps an entry once, and loads older entries on request. The room is a fake that the test sends
// messages on (the component asks for `on` and `state` only).
const sanne = { id: 'u-sanne', name: 'Sanne' }
let testNumber = 0

function entry(id: string, minutesAgo: number, extra: Partial<ActivityEntry> = {}): ActivityEntry {
  return { id, at: new Date(Date.now() - minutesAgo * 60_000).toISOString(), actor: sanne, people: {}, type: 'member_joined', params: {}, ...extra } as ActivityEntry
}

/** A feed endpoint for one test: pages by `before`, newest first, `limit` entries; counts its reads. */
function serveFeed(all: ActivityEntry[], { pageSize = 50 }: { pageSize?: number } = {}) {
  testNumber += 1
  const slug = `feed-${testNumber}`
  const served = { reads: 0, failing: false }
  registerEndpoint(`/api/e/${slug}/activity`, {
    method: 'GET',
    handler: (event) => {
      served.reads += 1
      if (served.failing) throw createError({ statusCode: 500 })
      const newestFirst = [...all].reverse()
      const { before } = getQuery(event)
      const start = typeof before === 'string' ? newestFirst.findIndex(item => item.id === before) + 1 : 0
      const entries = newestFirst.slice(start, start + pageSize)
      const next = start + pageSize < newestFirst.length ? entries[entries.length - 1]!.id : null
      return { entries, next } satisfies ActivityPage
    },
  })
  return { slug, served }
}

/** The room as the feed uses it: `on` registers a handler, `send` plays a message to it; `state` is the connection. */
function fakeRoom() {
  const handlers = new Map<string, ((message: unknown) => void)[]>()
  const state = ref<'connecting' | 'open' | 'closed'>('open')
  return {
    room: {
      enabled: true,
      state,
      retry: () => undefined,
      on: (type: string, handler: (message: never) => void) => {
        handlers.set(type, [...(handlers.get(type) ?? []), handler as (message: unknown) => void])
        return () => undefined
      },
    },
    send(message: RoomMessage | Record<string, unknown>) {
      for (const handler of handlers.get(message.type as string) ?? []) handler(envelope(message as RoomMessage, Date.now()))
    },
    state,
  }
}

const settle = () => new Promise(resolve => setTimeout(resolve))

async function mountFeed(all: ActivityEntry[], options: { pageSize?: number } = {}) {
  const feed = serveFeed(all, options)
  const live = fakeRoom()
  const wrapper = await mountSuspended(ActivityFeed, { props: { slug: feed.slug, room: live.room } })
  await vi.waitFor(() => expect(feed.served.reads).toBeGreaterThan(0))
  await settle()
  return { ...feed, ...live, wrapper }
}

const lines = (wrapper: Awaited<ReturnType<typeof mountFeed>>['wrapper']) => wrapper.findAll('[role="log"] li').map(item => item.text())

describe('ActivityFeed', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('shows the entries oldest to newest, each with its time, under „Vor dem Start“, as a polite log', async () => {
    const old = new Date('2026-10-24T18:00:00Z').toISOString()
    const { wrapper } = await mountFeed([
      entry('a', 0, { at: old, actor: { id: 'u-larsi', name: 'Larsi' } }),
      entry('b', 5, { type: 'game_count_changed', params: { from: 10, to: 12 } }),
      entry('c', 1, { type: 'date_set', actor: null, params: { sessionId: 's', number: 1, startsAt: '2090-10-30T19:30:00.000Z' } }),
    ].sort((x, y) => x.at.localeCompare(y.at)))

    const log = wrapper.find('[role="log"]')
    expect(log.attributes('aria-live')).toBe('polite')
    expect(log.attributes('aria-label')).toBe('Aktivität')
    expect(wrapper.text()).toContain('Vor dem Start')
    const shown = lines(wrapper)
    expect(shown).toHaveLength(3)
    expect(shown[0]).toContain('Larsi ist dem Event beigetreten')
    expect(shown[0]).toContain(formatSlotWhen(new Date(old)))
    expect(shown[1]).toContain('Sanne hat die Anzahl Spiele auf 12 geändert')
    expect(shown[1]).toMatch(/\d\d:\d\d/)
    expect(shown[2]).toContain('Termin für Session 1 steht: Mo 30.10. 20:30')
  })

  it('leaves out an entry no ticket has a sentence for yet', async () => {
    const { wrapper } = await mountFeed([
      entry('a', 3),
      entry('b', 2, { type: 'session_started', params: { sessionId: 's', number: null } }),
    ])

    expect(lines(wrapper)).toHaveLength(1)
  })

  it('says what it promises in an empty state, without a log entry', async () => {
    const { wrapper } = await mountFeed([])

    expect(wrapper.text()).toContain('Noch nichts passiert. Ab jetzt steht hier, wer dazukommt und was sich am Event ändert.')
    expect(lines(wrapper)).toEqual([])
  })

  it('adds an entry the room sends at once, without reading the feed again', async () => {
    const { wrapper, served, send } = await mountFeed([entry('a', 3)])
    const reads = served.reads

    send({ type: 'activity.added', entry: entry('b', 0, { actor: { id: 'u-larsi', name: 'Larsi' } }) })
    await settle()

    expect(lines(wrapper)).toHaveLength(2)
    expect(lines(wrapper)[1]).toContain('Larsi ist dem Event beigetreten')
    expect(served.reads).toBe(reads)
  })

  it('shows an entry once when the room and the feed both bring it', async () => {
    const { wrapper, send, state, served } = await mountFeed([entry('a', 3), entry('b', 2)])
    const reads = served.reads

    send({ type: 'activity.added', entry: entry('b', 2) })
    send({ type: 'activity.added', entry: entry('b', 2) })
    await settle()
    expect(lines(wrapper)).toHaveLength(2)

    // A reconnect reads the first page again, which overlaps what is shown.
    state.value = 'closed'
    await settle()
    state.value = 'open'
    await vi.waitFor(() => expect(served.reads).toBe(reads + 1))
    await settle()
    expect(lines(wrapper)).toHaveLength(2)
  })

  it('ignores a message that is no entry', async () => {
    const { wrapper, send } = await mountFeed([entry('a', 3)])

    send({ type: 'activity.added' })
    send({ type: 'activity.added', entry: { id: 'x' } })
    await settle()

    expect(lines(wrapper)).toHaveLength(1)
  })

  it('loads older entries on „Ältere laden“ in front of the newer ones, while the feed has more', async () => {
    const all = [entry('a', 5, { actor: { id: 'u-larsi', name: 'Larsi' } }), entry('b', 4), entry('c', 3), entry('d', 2)]
    const { wrapper } = await mountFeed(all, { pageSize: 2 })
    expect(lines(wrapper)).toHaveLength(2)

    const older = wrapper.findAll('button').find(button => button.text() === 'Ältere laden')
    expect(older).toBeDefined()
    await older!.trigger('click')
    await vi.waitFor(() => expect(lines(wrapper)).toHaveLength(4))

    expect(lines(wrapper)[0]).toContain('Larsi')
    expect(wrapper.findAll('button').find(button => button.text() === 'Ältere laden')).toBeUndefined()
  })

  it('shows no „Ältere laden“ when the first page is all there is', async () => {
    const { wrapper } = await mountFeed([entry('a', 3)])

    expect(wrapper.findAll('button').find(button => button.text() === 'Ältere laden')).toBeUndefined()
  })

  it('says so when the feed could not be loaded, and tries again on request', async () => {
    const feed = serveFeed([entry('a', 3)])
    feed.served.failing = true
    const live = fakeRoom()
    const wrapper = await mountSuspended(ActivityFeed, { props: { slug: feed.slug, room: live.room } })
    await vi.waitFor(() => expect(wrapper.text()).toContain('Die Aktivität konnte nicht geladen werden.'))

    feed.served.failing = false
    await wrapper.findAll('button').find(button => button.text() === 'Nochmal versuchen')!.trigger('click')

    await vi.waitFor(() => expect(lines(wrapper)).toHaveLength(1))
    expect(wrapper.text()).not.toContain('konnte nicht geladen')
  })
})
