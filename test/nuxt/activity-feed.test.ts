import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { getQuery } from 'h3'
import { flushPromises } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ActivityFeed from '~/components/ActivityFeed.vue'
import TeamMark from '~/components/TeamMark.vue'
import type { FeedSession } from '~/utils/activity'
import { formatSlotWhen } from '~/utils/berlin-time'
import type { ActivityEntry, ActivityPage, TeamNames } from '~~/shared/activity'
import type { BoardTeam } from '~~/shared/event'
import { GAME_NAME_MAX } from '~~/shared/game'
import { envelope, type RoomMessage } from '~~/shared/realtime'

// The Activity feed (#159, spec #153 § Activity feed): it loads the first page from the feed endpoint, adds what the
// room sends at once, keeps an entry once, and loads older entries on request. The room is a fake that the test sends
// messages on (the component asks for `on` and `state` only).
const sanne = { id: 'u-sanne', name: 'Sanne' }
let testNumber = 0

function entry(id: string, minutesAgo: number, extra: Partial<ActivityEntry> = {}): ActivityEntry {
  return { id, at: new Date(Date.now() - minutesAgo * 60_000).toISOString(), actor: sanne, people: {}, games: {}, type: 'member_joined', params: {}, ...extra } as ActivityEntry
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

async function mountFeed(all: ActivityEntry[], options: { pageSize?: number, sessions?: FeedSession[], nextNumber?: number | null } = {}) {
  const feed = serveFeed(all, options)
  const live = fakeRoom()
  const wrapper = await mountSuspended(ActivityFeed, { props: { slug: feed.slug, room: live.room, sessions: options.sessions, nextNumber: options.nextNumber } })
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

  it('reads an entry the Bench wrote before 0.12 as the Tribüne, and a team move as before (#437)', async () => {
    // Stored entries still hold { zone: 'bench' }, a place the type no longer has: the feed is not rewritten, it reads it as the Tribüne.
    const legacy = { userId: 'u-larsi', from: { zone: 'team', team: 1 }, to: { zone: 'bench' } } as never
    const { wrapper } = await mountFeed([
      entry('a', 3, { type: 'member_moved', actor: { id: 'u-larsi', name: 'Larsi' }, people: { 'u-larsi': 'Larsi' }, params: legacy }),
      entry('b', 2, { type: 'member_moved', people: { 'u-larsi': 'Larsi' }, params: legacy }),
      entry('c', 1, { type: 'member_moved', people: { 'u-larsi': 'Larsi' }, params: { userId: 'u-larsi', from: { zone: 'stands' }, to: { zone: 'team', team: 2 } } }),
    ])

    const shown = lines(wrapper)
    expect(shown[0]).toContain('Larsi ist jetzt auf der Tribüne')
    expect(shown[1]).toContain('Sanne hat Larsi auf die Tribüne verschoben')
    expect(shown[2]).toContain('Sanne hat Larsi nach Team Orange verschoben')
    expect(wrapper.text()).not.toContain('Bench')
  })

  it('puts a header over each stretch: before the start, the Session, and before the next one (#164)', async () => {
    const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000).toISOString()
    const sessions: FeedSession[] = [{ id: 's1', number: 1, startedAt: at(50), endedAt: at(20) }]
    const { wrapper } = await mountFeed([
      entry('a', 60),
      entry('b', 49, { type: 'session_started', params: { sessionId: 's1', number: 1 } }),
      entry('c', 19, { type: 'member_joined' }),
    ], { sessions, nextNumber: 2 })

    const headers = wrapper.findAll('[role="log"] h3').map(heading => heading.text())
    expect(headers).toEqual(['Vor dem Start', 'Session 1', 'Vor Session 2'])
    expect(lines(wrapper)[1]).toContain('Sanne hat Session 1 gestartet')
  })

  it('says „Nach Session n“ when no Session is left, and „Session“ for the only Session of an Event', async () => {
    const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000).toISOString()
    const after = await mountFeed([entry('a', 10)], { sessions: [{ id: 's1', number: 2, startedAt: at(50), endedAt: at(20) }], nextNumber: null })
    expect(after.wrapper.findAll('[role="log"] h3').map(heading => heading.text())).toEqual(['Nach Session 2'])

    const single = await mountFeed([entry('b', 30, { type: 'session_started', params: { sessionId: 's1', number: null } })], { sessions: [{ id: 's1', number: null, startedAt: at(40), endedAt: null }] })
    expect(single.wrapper.findAll('[role="log"] h3').map(heading => heading.text())).toEqual(['Session'])
  })

  it('says what it promises in an empty state, without a log entry', async () => {
    const { wrapper } = await mountFeed([])

    expect(wrapper.text()).toContain('Noch nichts passiert. Ab jetzt steht hier, wer dazukommt und wechselt.')
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

  describe('the end of the Event (#277)', () => {
    const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000).toISOString()
    const sessions: FeedSession[] = [{ id: 's1', number: 2, startedAt: at(50), endedAt: at(20) }]
    const teams = [{ position: 1, name: null }, { position: 2, name: 'Wilde Gurken' }]

    it('says who won, in bold, under „Nach Session n“ with the medal', async () => {
      const finished = entry('f', 10, { type: 'event_finished', params: { winners: [2] } })
      const feed = serveFeed([finished])
      const wrapper = await mountSuspended(ActivityFeed, { props: { slug: feed.slug, room: fakeRoom().room, sessions, nextNumber: null, teams } })
      await vi.waitFor(() => expect(lines(wrapper)).toHaveLength(1))

      expect(wrapper.findAll('[role="log"] h3').map(heading => heading.text())).toEqual(['Nach Session 2'])
      expect(lines(wrapper)[0]).toContain('Event beendet: Wilde Gurken gewinnt')
      expect(wrapper.findAll('[role="log"] li b').map(bold => bold.text())).toEqual(['Wilde Gurken'])
      expect(wrapper.get('[role="log"] li svg').classes()).toContain('lucide-medal')
    })

    it('says Unentschieden and names every Party of a Tie, in bold, under „Nach Session n“ with the medal (#278)', async () => {
      const finished = entry('f', 10, { type: 'event_finished', params: { winners: [1, 2] } })
      const feed = serveFeed([finished])
      const wrapper = await mountSuspended(ActivityFeed, { props: { slug: feed.slug, room: fakeRoom().room, sessions, nextNumber: null, teams } })
      await vi.waitFor(() => expect(lines(wrapper)).toHaveLength(1))

      expect(wrapper.findAll('[role="log"] h3').map(heading => heading.text())).toEqual(['Nach Session 2'])
      expect(lines(wrapper)[0]).toContain('Unentschieden: Team Rot und Wilde Gurken')
      expect(wrapper.findAll('[role="log"] li b').map(bold => bold.text())).toEqual(['Team Rot', 'Wilde Gurken'])
      expect(wrapper.get('[role="log"] li svg').classes()).toContain('lucide-medal')
    })
  })

  describe('a Result (#273)', () => {
    const result = entry('r', 1, { type: 'result_entered', params: { roundId: 'r1', number: 3, gameId: 'g1', first: [2] }, games: { g1: 'Mario Kart' } })
    const teams = [{ position: 1, name: null }, { position: 2, name: 'Wilde Gurken' }]

    it('names the winner by the Team name when the feed has the teams', async () => {
      const feed = serveFeed([result])
      const wrapper = await mountSuspended(ActivityFeed, { props: { slug: feed.slug, room: fakeRoom().room, teams } })
      await vi.waitFor(() => expect(lines(wrapper)).toHaveLength(1))

      expect(lines(wrapper)[0]).toContain('Spiel 3: Mario Kart, Wilde Gurken gewinnt')
      expect(wrapper.findAll('[role="log"] li b').map(bold => bold.text())).toEqual(['Mario Kart', 'Wilde Gurken'])
    })

    it('names the winner by its colour without the teams', async () => {
      const feed = serveFeed([result])
      const wrapper = await mountSuspended(ActivityFeed, { props: { slug: feed.slug, room: fakeRoom().room } })
      await vi.waitFor(() => expect(lines(wrapper)).toHaveLength(1))

      expect(lines(wrapper)[0]).toContain('Spiel 3: Mario Kart, Team Orange gewinnt')
    })

    it('names the longest game name allowed in full, also without a space in it (#273)', async () => {
      const longest = 'W'.repeat(GAME_NAME_MAX)
      const feed = serveFeed([{ ...result, games: { g1: longest } } as ActivityEntry])
      const wrapper = await mountSuspended(ActivityFeed, { props: { slug: feed.slug, room: fakeRoom().room, teams } })
      await vi.waitFor(() => expect(lines(wrapper)).toHaveLength(1))

      expect(lines(wrapper)[0]).toContain(`Spiel 3: ${longest}, Wilde Gurken gewinnt`)
    })
  })

  // The Team names an entry stored (#440, ADR 0016): the name of that moment, with the Team colour's mark right before it.
  describe('the Team names of an entry (#440)', () => {
    const live: BoardTeam[] = [{ position: 1, name: 'Neue Bande' }, { position: 2, name: null }]
    const kinds = (teamNames?: TeamNames) => ({
      moved: entry('m', 6, { actor: { id: 'u-host', name: 'Hostess' }, people: { 'u-larsi': 'Larsi' }, type: 'member_moved', params: { userId: 'u-larsi', from: { zone: 'stands' }, to: { zone: 'team', team: 1 }, ...(teamNames && { teamNames }) } }),
      reset: entry('r', 5, { type: 'team_name_reset', params: { team: 1, ...(teamNames && { teamNames }) } }),
      bonus: entry('b', 4, { type: 'bonus_veto_granted', params: { team: 1, ...(teamNames && { teamNames }) } }),
      veto: entry('v', 3, { actor: null, type: 'vetoes_revealed', params: { roundId: 'r1', drawId: 'd1', gameId: 'g1', vetoes: [{ team: 1 }], ...(teamNames && { teamNames }) } }),
      result: entry('e', 2, { type: 'result_entered', games: { g1: 'Mario Kart' }, params: { roundId: 'r1', number: 3, gameId: 'g1', first: [1], ...(teamNames && { teamNames }) } }),
      finished: entry('f', 1, { type: 'event_finished', params: { winners: [1], ...(teamNames && { teamNames }) } }),
    })

    async function mountWith(all: ActivityEntry[], props: { teams?: BoardTeam[], winnersHidden?: boolean } = {}) {
      const feed = serveFeed(all)
      const live = fakeRoom()
      const wrapper = await mountSuspended(ActivityFeed, { props: { slug: feed.slug, room: live.room, ...props } })
      await vi.waitFor(() => expect(lines(wrapper)).toHaveLength(all.length))
      return { wrapper, send: live.send }
    }
    /** The bold names of a line, each with the position of the mark in front of it (null: no mark). */
    const named = (wrapper: Awaited<ReturnType<typeof mountWith>>['wrapper'], index: number) => wrapper.findAll('[role="log"] li')[index]!.findAll('b').map((bold) => {
      const mark = bold.findComponent(TeamMark)
      return { text: bold.text(), mark: mark.exists() ? mark.props('team') : null, markFirst: mark.exists() && bold.html().indexOf('<svg') < bold.html().indexOf(bold.text().split(' ')[0]!) }
    })

    it('shows the stored name with its TeamMark right before it, in every kind that names a team, whatever the team is called now', async () => {
      const all = Object.values(kinds({ 1: 'Wilde Gurken' }))
      const { wrapper } = await mountWith(all, { teams: live })

      const shown = lines(wrapper)
      expect(shown[0]).toContain('Hostess hat Larsi nach Wilde Gurken verschoben')
      expect(shown[1]).toContain('Sanne hat den Namen von Wilde Gurken zurückgesetzt')
      expect(shown[2]).toContain('Sanne hat Wilde Gurken ein Bonus-Veto gegeben')
      expect(shown[3]).toContain('Veto von Wilde Gurken')
      expect(shown[4]).toContain('Spiel 3: Mario Kart, Wilde Gurken gewinnt')
      expect(shown[5]).toContain('Event beendet: Wilde Gurken gewinnt')
      for (let index = 0; index < 6; index++) expect(named(wrapper, index).filter(item => item.mark !== null), `line ${index}`).toEqual([{ text: 'Wilde Gurken', mark: 1, markFirst: true }])
      // The mark is decorative: the sentence already says the name.
      expect(wrapper.findAll('[role="log"] li [role="img"]')).toHaveLength(0)
    })

    it('names the colour, with its mark, for a stored null: a team that had no words', async () => {
      const { wrapper } = await mountWith(Object.values(kinds({ 1: null })), { teams: live })

      const shown = lines(wrapper)
      expect(shown[0]).toContain('nach Team Rot verschoben')
      expect(shown[1]).toContain('den Namen von Team Rot zurückgesetzt')
      expect(shown[2]).toContain('Sanne hat Team Rot ein Bonus-Veto gegeben')
      expect(shown[3]).toContain('Veto von Team Rot')
      expect(shown[4]).toContain('Mario Kart, Team Rot gewinnt')
      expect(shown[5]).toContain('Event beendet: Team Rot gewinnt')
      for (let index = 0; index < 6; index++) expect(named(wrapper, index).filter(item => item.mark !== null), `line ${index}`).toEqual([{ text: 'Team Rot', mark: 1, markFirst: true }])
    })

    it('resolves an entry without stored names as its kind did before 0.12: live for the Veto, the Result and the Event end, the colour for the others', async () => {
      const { wrapper } = await mountWith(Object.values(kinds()), { teams: live })

      const shown = lines(wrapper)
      expect(shown[0]).toContain('nach Team Rot verschoben')
      expect(shown[1]).toContain('den Namen von Team Rot zurückgesetzt')
      expect(shown[2]).toContain('Sanne hat Team Rot ein Bonus-Veto gegeben')
      expect(shown[3]).toContain('Veto von Neue Bande')
      expect(shown[4]).toContain('Mario Kart, Neue Bande gewinnt')
      expect(shown[5]).toContain('Event beendet: Neue Bande gewinnt')
      // Every named team has its mark, an old entry too.
      for (let index = 0; index < 6; index++) expect(named(wrapper, index).filter(item => item.mark === 1), `line ${index}`).toHaveLength(1)
    })

    it('gives each Party of a Tie its own mark and name: eight Parties', async () => {
      const names = Object.fromEntries(Array.from({ length: 8 }, (_, index) => [index + 1, index % 2 === 0 ? `Name ${index + 1}` : null]))
      const { wrapper } = await mountWith([entry('t', 1, { type: 'event_finished', params: { winners: [1, 2, 3, 4, 5, 6, 7, 8], teamNames: names } })])

      expect(wrapper.findAllComponents(TeamMark).map(mark => mark.props('team'))).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
      expect(wrapper.findAll('[role="log"] li b').map(bold => bold.text())).toEqual(['Name 1', 'Team Orange', 'Name 3', 'Team Himmel', 'Name 5', 'Team Blau', 'Name 7', 'Team Nacht'])
      expect(lines(wrapper)[0]).toContain('Unentschieden: Name 1, Team Orange, Name 3, Team Himmel, Name 5, Team Blau, Name 7 und Team Nacht')
    })

    it('keeps the longest name whole in the DOM, and a word of wide capitals without a break', async () => {
      const longest = Array.from({ length: 6 }, () => 'Zwölfzeichen').join(' ')
      const wide = 'W'.repeat(12)
      const { wrapper } = await mountWith([
        entry('l', 2, { type: 'bonus_veto_granted', params: { team: 1, teamNames: { 1: longest } } }),
        entry('w', 1, { type: 'bonus_veto_granted', params: { team: 2, teamNames: { 2: wide } } }),
      ])

      expect(lines(wrapper)[0]).toContain(`Sanne hat ${longest} ein Bonus-Veto gegeben`)
      expect(named(wrapper, 0)).toEqual([{ text: 'Sanne', mark: null, markFirst: false }, { text: longest, mark: 1, markFirst: true }])
      expect(lines(wrapper)[1]).toContain(`${wide} ein Bonus-Veto`)
    })

    it('shows an entry the room sends with its stored name and mark', async () => {
      const { wrapper, send } = await mountWith([entry('a', 5)], { teams: live })

      send({ type: 'activity.added', entry: kinds({ 1: 'Wilde Gurken' }).bonus })

      await vi.waitFor(() => expect(lines(wrapper)).toHaveLength(2))
      expect(lines(wrapper)[1]).toContain('Sanne hat Wilde Gurken ein Bonus-Veto gegeben')
      expect(named(wrapper, 1).filter(item => item.mark !== null)).toEqual([{ text: 'Wilde Gurken', mark: 1, markFirst: true }])
    })

    it('names nobody and sets no mark at the Event end while the Winners wait, stored names or not (#445)', async () => {
      const { wrapper } = await mountWith([kinds({ 1: 'Wilde Gurken' }).finished], { teams: live, winnersHidden: true })

      expect(lines(wrapper)[0]).toContain('Event beendet')
      expect(lines(wrapper)[0]).not.toContain('Wilde Gurken')
      expect(wrapper.findAllComponents(TeamMark)).toHaveLength(0)
      expect(wrapper.findAll('[role="log"] li b')).toHaveLength(0)
    })

    it('sets a mark beside no one else: the actor and the person are bold without one', async () => {
      const { wrapper } = await mountWith([kinds({ 1: 'Wilde Gurken' }).moved])

      expect(named(wrapper, 0)).toEqual([
        { text: 'Hostess', mark: null, markFirst: false },
        { text: 'Larsi', mark: null, markFirst: false },
        { text: 'Wilde Gurken', mark: 1, markFirst: true },
      ])
    })
  })

  describe('a Correction (#275)', () => {
    const corrected = (games: Record<string, string>) => entry('c', 1, { actor: { id: 'u-host', name: 'Hostess' }, type: 'result_corrected', params: { roundId: 'r1', number: 3, gameId: 'g1' }, games })

    it('says who corrected which game, with the name and the game in bold', async () => {
      const feed = serveFeed([corrected({ g1: 'Mario Kart' })])
      const wrapper = await mountSuspended(ActivityFeed, { props: { slug: feed.slug, room: fakeRoom().room } })
      await vi.waitFor(() => expect(lines(wrapper)).toHaveLength(1))

      expect(lines(wrapper)[0]).toContain('Hostess hat Spiel 3 (Mario Kart) korrigiert')
      expect(wrapper.findAll('[role="log"] li b').map(bold => bold.text())).toEqual(['Hostess', 'Mario Kart'])
    })

    it('shows no line while the entry has no name for the game', async () => {
      const feed = serveFeed([corrected({})])
      const wrapper = await mountSuspended(ActivityFeed, { props: { slug: feed.slug, room: fakeRoom().room } })
      await vi.waitFor(() => expect(feed.served.reads).toBeGreaterThan(0))
      await flushPromises()

      expect(lines(wrapper).filter(line => line.includes('korrigiert'))).toEqual([])
    })
  })
})
