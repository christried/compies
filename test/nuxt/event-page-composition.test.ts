import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { readBody } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Leaderboard from '~/components/Leaderboard.vue'
import { refreshEvent } from '~/composables/useEventView'
import EventPage from '~/pages/e/[slug]/index.vue'
import type { BoardTeam, MemberView } from '~~/shared/event'
import type { RoundGame } from '~~/shared/game'
import type { ResultView, RoundView } from '~~/shared/stage'
import { defaultSettings } from '~~/shared/settings'
import { kitty, signInAs } from './auth'
import { clickButton, dialog, LARSI, memberView, openHostMenu, regionHeadings, restoreScreen, SANNE, serve, stubScreen, viewWithSessions, type EventOverrides } from './event-page'

// The composition of the Event page (#166, 11-event-seite § EventPage): what has to happen now goes on top. The order of
// the regions' headings per state of the page, for the Host and for a Member, the poll that is only there while a Session
// waits for a Date and quiet once another Session is dated, and the notices that belong to a state.

const FIRST = '2026-10-30T19:00:00.000Z'
const SECOND = '2026-10-31T19:00:00.000Z'
const STARTED = '2026-10-30T19:34:00.000Z'
const ENDED = '2026-10-30T22:12:00.000Z'

type Seat = { zone: 'bench' | 'stands' | 'team', team?: number }
const team = (position: number, name: string | null = null): BoardTeam => ({ position, name, frozen: false })

/** Kitty, Larsi and Sanne (the Host) with the seats a test gives them; everyone else sits on the Bench. */
function members(seats: { kitty?: Seat, larsi?: Seat, sanne?: Seat } = {}): MemberView[] {
  const member = (id: string, name: string, isHost: boolean, seat: Seat = { zone: 'bench' }) => memberView({
    id, name, isHost, zone: seat.zone, team: seat.zone === 'team' ? seat.team ?? 1 : null,
  })
  return [member(kitty.id, 'Kitty', false, seats.kitty), member(LARSI, 'Larsi', false, seats.larsi), member(SANNE, 'Sanne', true, seats.sanne)]
}

type SessionSpec = Parameters<typeof viewWithSessions>[1]
interface Setup {
  sessions: SessionSpec
  missing: number
  host?: boolean
  settings?: boolean
  phase?: string
  teamChoiceOpen?: boolean
  running?: number
  overrides?: EventOverrides
}

/** An Event in one state of the page: the Sessions as the server sends them, set up unless the test says not. */
function serveState({ sessions, missing, host = false, settings = true, phase = 'poll', teamChoiceOpen = false, running, overrides = {} }: Setup) {
  return serve(slug => viewWithSessions(slug, sessions, missing, {
    event: { phase, isHost: host },
    settings: settings ? defaultSettings() : null,
    teams: settings ? [team(1), team(2)] : [],
    teamChoiceOpen,
    members: members(),
    ...(running === undefined ? {} : { runningSessionId: `session-${slug}-${running}` }),
    ...overrides,
  }))
}

const SESSION = (number: number, startsAt: string | null, times: { startedAt?: string, endedAt?: string } = {}) => ({ number: startsAt === null ? null : number, startsAt, ...times })

// One page at a time: the page follows the route, so a second mount would move the first, and an old page only slows the tests down.
let mounted: Awaited<ReturnType<typeof mountSuspended>> | undefined
async function mount(slug: string) {
  mounted?.unmount()
  // Vue Test Utils stubs TransitionGroup with an element of its own, which would take the place of the Leaderboard's `tbody`: the real one renders it.
  const page = await mountSuspended(EventPage, { route: `/e/${slug}`, global: { stubs: { TransitionGroup: false } } })
  mounted = page
  return page
}

describe('the stage of the Event page', () => {
  beforeEach(() => {
    signInAs(kitty)
    stubScreen(true)
  })

  afterEach(() => {
    mounted?.unmount()
    mounted = undefined
    restoreScreen()
    document.body.innerHTML = ''
  })

  describe('in the order of its state', () => {
    for (const host of [true, false]) {
      const who = host ? 'the Host' : 'a Member'

      it(`puts the poll first while no Session is dated, for ${who}`, async () => {
        const { slug } = serveState({ sessions: [SESSION(1, null), SESSION(2, null)], missing: 2, host })

        const page = await mount(slug)

        expect(regionHeadings(page)).toEqual(['Termin für Session 1', 'Spielbrett', 'Sessions', 'So wird gespielt'])
        expect(page.get('h1').text()).toBe('Wann zocken wir?')
      })

      it(`puts the Game board first once a Session is dated and the poll of another one below it, for ${who}`, async () => {
        const { slug } = serveState({ sessions: [SESSION(1, FIRST), SESSION(2, null)], missing: 1, host, phase: 'poll', teamChoiceOpen: true })

        const page = await mount(slug)

        expect(regionHeadings(page)).toEqual(['Spielbrett', 'Termin für Session 2', 'Sessions', 'So wird gespielt'])
        expect(page.get('h1').text()).toBe('Rein in die Teams')
      })

      it(`has no poll once every Session is dated, for ${who}`, async () => {
        const { slug } = serveState({ sessions: [SESSION(1, FIRST), SESSION(2, SECOND)], missing: 0, host, phase: 'date_set', teamChoiceOpen: true })

        const page = await mount(slug)

        expect(regionHeadings(page)).toEqual(['Spielbrett', 'Sessions', 'So wird gespielt'])
      })

      it(`keeps the Game board on top while a Session runs, for ${who}`, async () => {
        const { slug } = serveState({ sessions: [SESSION(1, FIRST, { startedAt: STARTED }), SESSION(2, null)], missing: 1, host, phase: 'running', running: 0 })

        const page = await mount(slug)

        expect(regionHeadings(page)).toEqual(['Spielbrett', 'Termin für Session 2', 'Sessions', 'So wird gespielt'])
        expect(page.get('h1').text()).toBe('Session 1 läuft')
      })

      it(`puts the Sessions card first between two Sessions, for ${who}`, async () => {
        const { slug } = serveState({ sessions: [SESSION(1, FIRST, { startedAt: STARTED, endedAt: ENDED }), SESSION(2, SECOND)], missing: 0, host, phase: 'running' })

        const page = await mount(slug)

        expect(regionHeadings(page)).toEqual(['Sessions', 'So wird gespielt', 'Spielbrett'])
        expect(page.get('h1').text()).toBe('Halbzeit')
      })

      it(`keeps the poll of a later Session below the board between two Sessions, for ${who}`, async () => {
        const { slug } = serveState({ sessions: [SESSION(1, FIRST, { startedAt: STARTED, endedAt: ENDED }), SESSION(2, null)], missing: 1, host, phase: 'running' })

        const page = await mount(slug)

        expect(regionHeadings(page)).toEqual(['Sessions', 'So wird gespielt', 'Spielbrett', 'Termin für Session 2'])
      })

      it(`ends with the board after the last Session, for ${who}`, async () => {
        const { slug } = serveState({ sessions: [SESSION(1, FIRST, { startedAt: STARTED, endedAt: ENDED })], missing: 0, host, phase: 'running' })

        const page = await mount(slug)

        expect(regionHeadings(page)).toEqual(['Sessions', 'So wird gespielt', 'Spielbrett'])
        expect(page.get('h1').text()).toBe('Gut gespielt')
      })

      it(`puts the notice before the board in an Event that was never set up, for ${who}`, async () => {
        const { slug } = serveState({ sessions: [SESSION(1, null)], missing: 1, host, settings: false })

        const page = await mount(slug)

        // The old Event's poll is still open, so it comes before the board.
        expect(regionHeadings(page)).toEqual(['Terminumfrage', 'Spielbrett', 'Sessions', 'So wird gespielt'])
        const notice = page.findAll('[role="status"]').find(element => element.text().includes(host ? 'Event einrichten' : 'richtet das Event noch ein'))
        expect(notice).toBeDefined()
        const heading = page.get('h2').element
        expect(notice!.element.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
        expect(page.get('h1').text()).toBe(host ? 'Erst einrichten, dann zocken' : 'Gleich geht’s los')
      })
    }

    it('has exactly one h1, and the Reopen notice of a withdrawn Date right under it', async () => {
      const { slug } = serveState({
        sessions: [{ ...SESSION(1, null), previousStartsAt: FIRST } as SessionSpec[number]],
        missing: 1,
      })

      const page = await mount(slug)

      expect(page.findAll('h1')).toHaveLength(1)
      const notice = page.findAll('[role="status"]').find(element => element.text().includes('wurde aufgehoben'))!
      const firstRegion = page.get('section[aria-labelledby]').element
      expect(page.get('h1').element.compareDocumentPosition(notice.element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      expect(notice.element.compareDocumentPosition(firstRegion) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })
  })

  describe('the poll', () => {
    const toggle = (page: Awaited<ReturnType<typeof mount>>) => page.findAll('button').find(button => button.text().startsWith('Wer kann wann?'))

    it('is the full poll with „Wer kann wann?“ open while no Session is dated', async () => {
      const { slug } = serveState({ sessions: [SESSION(1, null), SESSION(2, null)], missing: 2 })

      const page = await mount(slug)

      expect(toggle(page)).toBeUndefined()
      expect(page.findAll('h3').map(heading => heading.text())).toContain('Wer kann wann?')
    })

    it('is quiet once another Session is dated: „Wer kann wann?“ is folded behind a button that says how many voted', async () => {
      const { slug } = serveState({ sessions: [SESSION(1, FIRST), SESSION(2, null)], missing: 1 })

      const page = await mount(slug)

      const button = toggle(page)!
      expect(button.text()).toBe('Wer kann wann? · 2 von 3')
      expect(button.attributes('aria-expanded')).toBe('false')
      expect(page.findAll('h3').map(heading => heading.text())).not.toContain('Wer kann wann?')

      await button.trigger('click')

      expect(button.attributes('aria-expanded')).toBe('true')
      expect(page.findAll('h3').map(heading => heading.text())).toContain('Wer kann wann?')
      expect(page.find(`[id="${button.attributes('aria-controls')}"]`).text()).toContain('Wer kann wann?')
    })

    it('leaves „Termin festlegen“ on a Slot card primary only in the full poll', async () => {
      const full = serveState({ sessions: [SESSION(1, null), SESSION(2, null)], missing: 2, host: true })
      const quiet = serveState({ sessions: [SESSION(1, FIRST), SESSION(2, null)], missing: 1, host: true })

      // One page at a time: the page follows the route, so a second mount would move the first.
      const pick = (page: Awaited<ReturnType<typeof mount>>) => page.findAll('article button').filter(button => button.text() === 'Termin festlegen')
      const fullPage = await mount(full.slug)
      expect(pick(fullPage).some(button => button.classes().includes('bg-primary'))).toBe(true)
      fullPage.unmount()

      const quietPage = await mount(quiet.slug)
      expect(pick(quietPage).length).toBeGreaterThan(0)
      expect(pick(quietPage).some(button => button.classes().includes('bg-primary'))).toBe(false)
    })

    it('sits right of the Head: the Head links to it and the link moves focus to the poll\'s heading', async () => {
      const { slug } = serveState({ sessions: [SESSION(1, FIRST), SESSION(2, null)], missing: 1 })
      const page = await mountSuspended(EventPage, { route: `/e/${slug}`, attachTo: document.body })

      await page.get('h1 ~ a').trigger('click')

      expect(document.activeElement?.id).toBe('poll-session-2')
      expect(document.activeElement?.textContent).toBe('Termin für Session 2')
      page.unmount()
    })
  })

  describe('the notices', () => {
    const notices = (page: Awaited<ReturnType<typeof mount>>) => page.findAll('[role="status"]').map(element => element.text())
    const has = (page: Awaited<ReturnType<typeof mount>>, text: string) => notices(page).some(notice => notice.includes(text))

    it('tells the Host in a team that the dock stays the same, and the Host on the Tribüne too, and nothing on the Bench', async () => {
      const inTeam = serveState({ sessions: [SESSION(1, FIRST)], missing: 0, host: true, phase: 'date_set', teamChoiceOpen: true, overrides: { members: members({ kitty: { zone: 'team', team: 2 } }) } })
      const onStands = serveState({ sessions: [SESSION(1, FIRST)], missing: 0, host: true, phase: 'date_set', teamChoiceOpen: true, overrides: { members: members({ kitty: { zone: 'stands' } }) } })
      const onBench = serveState({ sessions: [SESSION(1, FIRST)], missing: 0, host: true, phase: 'date_set', teamChoiceOpen: true })

      expect(has(await mount(inTeam.slug), 'Du spielst mit, in Team Orange. Das Host-Dock bleibt genau gleich.')).toBe(true)
      expect(has(await mount(onStands.slug), 'Du sitzt auf der Tribüne und spielst nicht mit. Das Host-Dock bleibt genau gleich.')).toBe(true)
      expect(has(await mount(onBench.slug), 'Das Host-Dock bleibt genau gleich')).toBe(false)
    })

    it('shows the seat note only to the Host, with their role badge, and lets them close it', async () => {
      const member = serveState({ sessions: [SESSION(1, FIRST)], missing: 0, phase: 'date_set', teamChoiceOpen: true, overrides: { members: members({ kitty: { zone: 'team', team: 1 } }) } })
      const host = serveState({ sessions: [SESSION(1, FIRST)], missing: 0, host: true, phase: 'date_set', teamChoiceOpen: true, overrides: { members: members({ kitty: { zone: 'stands' } }) } })

      expect(has(await mount(member.slug), 'Host-Dock')).toBe(false)
      const hostPage = await mount(host.slug)
      const seat = hostPage.findAll('[role="status"]').find(element => element.text().includes('Host-Dock'))!
      expect(seat.text()).toContain('Nur du siehst das')

      await seat.get('button[aria-label="Schließen"]').trigger('click')

      expect(has(hostPage, 'Host-Dock')).toBe(false)
    })

    it('tells a Player which team looks for somebody while Team choice is open, and the Host that the start waits', async () => {
      const uneven = { members: members({ larsi: { zone: 'team', team: 1 }, sanne: { zone: 'team', team: 1 } }) }
      const member = serveState({ sessions: [SESSION(1, FIRST)], missing: 0, phase: 'date_set', teamChoiceOpen: true, overrides: uneven })
      const host = serveState({ sessions: [SESSION(1, FIRST)], missing: 0, host: true, phase: 'date_set', teamChoiceOpen: true, overrides: uneven })

      expect(has(await mount(member.slug), 'Team Orange sucht noch jemanden. Rück rein, dann kann’s losgehen.')).toBe(true)
      const hostPage = await mount(host.slug)
      expect(has(hostPage, 'Team Orange hat 0, die anderen haben 2.')).toBe(true)
      expect(has(hostPage, 'sucht noch jemanden')).toBe(false)
    })

    it('says the teams are locked while a Session runs, but not between two Sessions, where „Die Teams bleiben“ says it', async () => {
      const running = serveState({ sessions: [SESSION(1, FIRST, { startedAt: STARTED }), SESSION(2, SECOND)], missing: 0, phase: 'running', running: 0 })
      const between = serveState({ sessions: [SESSION(1, FIRST, { startedAt: STARTED, endedAt: ENDED }), SESSION(2, SECOND)], missing: 0, phase: 'running' })

      const runningPage = await mount(running.slug)
      expect(has(runningPage, 'Gesperrt seit dem Start')).toBe(false)
      expect(has(runningPage, 'Das Event läuft.')).toBe(true)
      expect(has(runningPage, 'Die Teams bleiben fürs ganze Event')).toBe(false)

      const betweenPage = await mount(between.slug)
      expect(has(betweenPage, 'Das Event läuft.')).toBe(false)
      expect(has(betweenPage, 'Die Teams bleiben fürs ganze Event. Wenn du bei Session 2 nicht kannst, setz dich auf die Bench.')).toBe(true)
    })

    it('tells the Host who replaces whom between two Sessions, and says „der nächsten“ while that Session has no Date', async () => {
      const dated = serveState({ sessions: [SESSION(1, FIRST, { startedAt: STARTED, endedAt: ENDED }), SESSION(2, SECOND)], missing: 0, host: true, phase: 'running' })
      const waiting = serveState({ sessions: [SESSION(1, FIRST, { startedAt: STARTED, endedAt: ENDED }), SESSION(2, null)], missing: 1, host: true, phase: 'running' })

      expect(has(await mount(dated.slug), 'Die Teams bleiben fürs ganze Event. Wer bei Session 2 fehlt, ersetzt du von der Bench.')).toBe(true)
      expect(has(await mount(waiting.slug), 'Wer bei der nächsten Session fehlt, ersetzt du von der Bench.')).toBe(true)
    })

    it('keeps telling the Host about uneven teams between two Sessions, because the next start is blocked again', async () => {
      const { slug } = serveState({
        sessions: [SESSION(1, FIRST, { startedAt: STARTED, endedAt: ENDED }), SESSION(2, SECOND)],
        missing: 0,
        host: true,
        phase: 'running',
        overrides: { members: members({ larsi: { zone: 'team', team: 1 } }) },
      })

      expect(has(await mount(slug), 'Die Session startet erst, wenn alle Teams gleich groß sind.')).toBe(true)
    })

    it('gives the Host in an Event that was never set up a way to the editor, and closes it with its ✕', async () => {
      const { slug } = serveState({ sessions: [SESSION(1, null)], missing: 1, host: true, settings: false })
      const page = await mount(slug)

      const setup = page.findAll('[role="status"]').find(element => element.text().includes('Event einrichten'))!
      expect(setup.text()).toContain('Nur du siehst das')
      expect(setup.get('a').text()).toBe('Jetzt einrichten')

      await setup.get('button[aria-label="Schließen"]').trigger('click')

      expect(page.findAll('[role="status"]').some(element => element.text().includes('Jetzt einrichten'))).toBe(false)
    })

    it('tells a Member the Host sets the Event up, by the Host\'s name', async () => {
      const { slug } = serveState({ sessions: [SESSION(1, null)], missing: 1, settings: false })

      expect(has(await mount(slug), 'Sanne richtet das Event noch ein. Bis dahin: Bench oder Tribüne.')).toBe(true)
    })
  })

  describe('the header', () => {
    it('shows the Host an Einladen button that opens the invite sheet', async () => {
      const { slug } = serveState({ sessions: [SESSION(1, FIRST)], missing: 0, host: true, phase: 'date_set', overrides: { inviteUrl: 'https://compies.test/e/x-abc' } })
      const page = await mount(slug)

      const invite = page.get('header').findAll('button').find(button => button.text() === 'Einladen')!
      expect(invite.classes()).toContain('max-md:hidden')
      await clickButton(invite.element.parentElement, 'Einladen')

      await vi.waitFor(() => expect([...document.querySelectorAll<HTMLInputElement>('[role="dialog"] input[readonly]')].some(input => input.value === 'https://compies.test/e/x-abc')).toBe(true))
    })

    it('has no Einladen for a Member', async () => {
      const { slug } = serveState({ sessions: [SESSION(1, FIRST)], missing: 0, phase: 'date_set' })
      const page = await mount(slug)

      expect(page.get('header').findAll('button').some(button => button.text() === 'Einladen')).toBe(false)
    })

    it('names the Session in the Phase pill while one runs in an Event with several, and the Phase otherwise', async () => {
      const running = serveState({ sessions: [SESSION(1, FIRST, { startedAt: STARTED }), SESSION(2, SECOND)], missing: 0, phase: 'running', running: 0 })
      const single = serveState({ sessions: [SESSION(1, FIRST, { startedAt: STARTED })], missing: 0, phase: 'running', running: 0 })
      const between = serveState({ sessions: [SESSION(1, FIRST, { startedAt: STARTED, endedAt: ENDED }), SESSION(2, SECOND)], missing: 0, phase: 'running' })

      expect((await mount(running.slug)).get('header').text()).toContain('Läuft · Session 1 von 2')
      expect((await mount(single.slug)).get('header').text()).not.toContain('Session 1 von')
      expect((await mount(between.slug)).get('header').text()).not.toContain('Session 1 von')
    })

    it('follows the state of the page, not the Event\'s Phase, which stays running after the first start', async () => {
      const pill = async (setup: Setup) => (await mount(serveState(setup).slug)).get('header').text()
      const ended = SESSION(1, FIRST, { startedAt: STARTED, endedAt: ENDED })

      expect(await pill({ sessions: [SESSION(1, null), SESSION(2, null)], missing: 2 })).toContain('Terminumfrage')
      expect(await pill({ sessions: [SESSION(1, FIRST), SESSION(2, null)], missing: 1 })).toContain('Termin steht')
      expect(await pill({ sessions: [ended, SESSION(2, SECOND)], missing: 0, phase: 'running' })).toContain('Termin steht')
      expect(await pill({ sessions: [ended, SESSION(2, null)], missing: 1, phase: 'running' })).toContain('Terminumfrage')
      // No Session left, the Host has not finished the Event: „Kein Termin“, not „Beendet“ (#277).
      const done = await pill({ sessions: [ended], missing: 0, phase: 'running' })
      expect(done).toContain('Kein Termin')
      expect(done).not.toContain('Vorbei')
      expect(done).not.toContain('Beendet')
      expect(done).not.toContain('Läuft')
    })
  })
})

// The finished Event (#277): read-only for everybody, and its stage is the winner, the Standings and the history.
describe('the finished Event page', () => {
  const halo: RoundGame = { id: 'g-halo', name: 'Halo', imageUrl: null, youtubeId: null, clipStart: 0, clipLength: 30, playersMin: 2, playersMax: 4, suitabilities: [] }
  const resultOf = (number: number, winner: number, teams = 2): ResultView => ({
    roundId: `r${number}`,
    number,
    game: { ...halo, id: `g-${number}`, name: `Spiel ${number}` },
    places: Array.from({ length: teams }, (_, index) => index + 1).sort((a, b) => (a === winner ? -1 : b === winner ? 1 : a - b)).map((position, index) => ({ team: position, place: index + 1, points: index === 0 ? 3 : 0, score: null })),
    corrected: false,
    correctedAt: null,
    resultAt: STARTED,
  })
  const ENDED_ONE = SESSION(1, FIRST, { startedAt: STARTED, endedAt: ENDED })
  /** The read of a finished Event: Team 1 (Wilde Gurken) won all three games, the count is complete, the Host has nothing to finish any more. */
  const finishedRead = (overrides: EventOverrides = {}): EventOverrides => ({
    teams: [team(1, 'Wilde Gurken'), team(2)],
    results: [resultOf(1, 1), resultOf(2, 1), resultOf(3, 1)],
    standings: [{ team: 1, rank: 1, points: 9 }, { team: 2, rank: 2, points: 0 }],
    end: { played: 3, gameCount: 3, complete: true, tie: null, finish: null, lastGame: null },
    ...overrides,
  })
  const toolbar = (page: { findAll: (selector: string) => { text: () => string }[] }) => page.findAll('[role="toolbar"] button').map(button => button.text())

  beforeEach(() => {
    signInAs(kitty)
    stubScreen(true)
  })

  afterEach(() => {
    mounted?.unmount()
    mounted = undefined
    restoreScreen()
    document.body.innerHTML = ''
  })

  for (const host of [true, false]) {
    const who = host ? 'the Host' : 'a Member'

    it(`shows the winner, the Standings, the history and the cards, and nothing that plays on, for ${who}`, async () => {
      const { slug } = serveState({ sessions: [ENDED_ONE], missing: 0, phase: 'finished', host, overrides: finishedRead() })

      const page = await mount(slug)

      expect(regionHeadings(page)).toEqual(['Tabelle', 'Spielverlauf', 'Sessions', 'So wird gespielt'])
      expect(page.findAll('h1').map(heading => heading.text())).toEqual(['Wilde Gurken gewinnt das Event'])
      expect(page.get('main').text()).toContain('Event beendet')
      const standings = page.findAll('main section').find(section => section.find('h2').text() === 'Tabelle')!
      expect(standings.text()).toContain('Nach Spiel 3 von 3')
      expect(standings.findAll('tbody tr').map(row => row.attributes('data-team'))).toEqual(['1', '2'])
      expect(page.findAll('main ol [data-number]').map(number => number.text())).toEqual(['1', '2', '3'])
      // No Game board, no open Rounds, no poll: a read-only board was never asked for.
      expect(page.text()).not.toContain('Gerade dran')
      expect(page.text()).not.toContain('Wann zocken wir?')
    })

    it(`says Beendet in the header pill, for ${who}`, async () => {
      const { slug } = serveState({ sessions: [ENDED_ONE], missing: 0, phase: 'finished', host, overrides: finishedRead() })

      const page = await mount(slug)

      expect(page.get('header').text()).toContain('Beendet')
      expect(page.get('header').text()).not.toContain('Kein Termin')
    })
  }

  it('gives a Member no dock, and the Host one that holds Einladen and Mehr and nothing else', async () => {
    const member = serveState({ sessions: [ENDED_ONE], missing: 0, phase: 'finished', overrides: finishedRead() })
    expect(toolbar(await mount(member.slug))).toEqual([])

    const host = serveState({ sessions: [ENDED_ONE], missing: 0, phase: 'finished', host: true, overrides: finishedRead({ end: { played: 3, gameCount: 3, complete: true, tie: null, finish: { rejection: 'wrong_phase' }, lastGame: null } }) })
    const page = await mount(host.slug)
    expect(toolbar(page)).toEqual(['Einladen', 'Mehr'])
    const menu = await openHostMenu(page)
    expect([...menu.querySelectorAll('[role="menuitem"]')].map(item => item.textContent?.trim())).toEqual(['Einladen'])
  })

  it('names the winner by the colour when the Team has no frozen name', async () => {
    const { slug } = serveState({ sessions: [ENDED_ONE], missing: 0, phase: 'finished', overrides: finishedRead({
      teams: [team(1), team(2)],
      results: [resultOf(1, 2)],
      standings: [{ team: 2, rank: 1, points: 3 }, { team: 1, rank: 2, points: 0 }],
      end: { played: 1, gameCount: 1, complete: true, tie: null, finish: null, lastGame: null },
    }) })

    const page = await mount(slug)

    expect(page.get('h1').text()).toBe('Team Orange gewinnt das Event')
  })

  it('keeps the notice of a Session that was removed with the finish, and closes it with the ×', async () => {
    const { slug } = serveState({ sessions: [ENDED_ONE], missing: 0, phase: 'finished', overrides: finishedRead({ removedSessions: [{ id: 'removed', previousStartsAt: SECOND }] }) })

    const page = await mount(slug)

    const notice = page.findAll('[role="status"]').find(element => element.text().includes('wurde aufgehoben'))
    expect(notice, 'the notice').toBeDefined()
    await notice!.get('button[aria-label="Schließen"]').trigger('click')
    expect(page.findAll('[role="status"]').some(element => element.text().includes('wurde aufgehoben'))).toBe(false)
  })

  it('lists the Sessions read-only: no add, remove or reschedule, and the Sessions that ended', async () => {
    const { slug } = serveState({ sessions: [ENDED_ONE], missing: 0, phase: 'finished', host: true, overrides: finishedRead() })

    const page = await mount(slug)

    const sessions = page.findAll('main section').find(section => section.find('h2').text() === 'Sessions')!
    expect(sessions.text()).not.toContain('Session hinzufügen')
    expect(sessions.text()).not.toContain('Neue Terminsuche')
    expect(sessions.text()).not.toContain('Entfernen')
    expect(sessions.text()).not.toContain('Verschieben')
  })

  it('shows every Round of a long Event, 30 of them with 8 Parties', async () => {
    const eight = Array.from({ length: 8 }, (_, index) => team(index + 1))
    const results = Array.from({ length: 30 }, (_, index) => resultOf(index + 1, (index % 8) + 1, 8))
    const { slug } = serveState({ sessions: [ENDED_ONE], missing: 0, phase: 'finished', overrides: finishedRead({
      teams: eight,
      results,
      standings: eight.map(item => ({ team: item.position, rank: item.position === 1 ? 1 : 2, points: 0 })),
      end: { played: 30, gameCount: 30, complete: true, tie: null, finish: null, lastGame: null },
    }) })

    const page = await mount(slug)

    expect(page.findAll('main ol [data-number]')).toHaveLength(30)
    expect(page.findAll('main tbody tr')).toHaveLength(8)
  })

  it('keeps „Tabelle“ and „Aktivität“ in the side panel on a wide screen', async () => {
    const { slug } = serveState({ sessions: [ENDED_ONE], missing: 0, phase: 'finished', host: true, overrides: finishedRead() })

    const page = await mount(slug)

    expect(page.get('aside[aria-label="Seitenleiste"]').findAll('[role="tab"]').map(tab => tab.text())).toEqual(['Tabelle', 'Aktivität'])
  })

  it('keeps three items in the phone\'s bar', async () => {
    stubScreen(false)
    const { slug } = serveState({ sessions: [ENDED_ONE], missing: 0, phase: 'finished', overrides: finishedRead() })

    const page = await mount(slug)

    expect(page.findAll('nav[aria-label="Event"] button').map(item => item.text())).toEqual(['Event', 'Tabelle', 'Aktivität'])
    expect(page.get('h1').text()).toBe('Wilde Gurken gewinnt das Event')
  })
})

// A Tie (#278): everybody but the Host reads that the Host decides, right under the Head and above the Standings; the Host has the dock instead.
describe('the Tie banner on the Event page', () => {
  const TEXT = 'Gleichstand auf Platz 1. Der Host entscheidet.'
  const tied: EventOverrides = {
    teams: [team(1), team(2)],
    results: [],
    standings: [{ team: 1, rank: 1, points: 1 }, { team: 2, rank: 1, points: 1 }],
    end: { played: 2, gameCount: 2, complete: true, tie: [1, 2], finish: null, lastGame: null },
  }
  const RUNNING_ONE = SESSION(1, FIRST, { startedAt: STARTED })
  const ENDED_ONE = SESSION(1, FIRST, { startedAt: STARTED, endedAt: ENDED })
  const banner = (page: Awaited<ReturnType<typeof mount>>) => page.findAll('[role="status"]').filter(element => element.text().includes(TEXT))

  beforeEach(() => {
    signInAs(kitty)
    stubScreen(true)
  })

  afterEach(() => {
    mounted?.unmount()
    mounted = undefined
    restoreScreen()
    document.body.innerHTML = ''
  })

  const STATES: { name: string, setup: Omit<Setup, 'host' | 'overrides'> }[] = [
    { name: 'while a Session runs', setup: { sessions: [RUNNING_ONE], missing: 0, phase: 'running', running: 0 } },
    { name: 'between Sessions', setup: { sessions: [ENDED_ONE, SESSION(2, SECOND)], missing: 0, phase: 'running' } },
    { name: 'after the last Session', setup: { sessions: [ENDED_ONE], missing: 0, phase: 'running' } },
  ]

  for (const { name, setup } of STATES) {
    it(`tells a Player, a Bench Member and a Stands Member that the Host decides, ${name}, above the Standings`, async () => {
      for (const seat of [{ zone: 'team', team: 1 }, { zone: 'bench' }, { zone: 'stands' }] as Seat[]) {
        const { slug } = serveState({ ...setup, overrides: { ...tied, members: members({ kitty: seat }) } })

        const page = await mount(slug)

        expect(banner(page)).toHaveLength(1)
        const standings = page.findAll('main section').find(section => section.find('h2').text() === 'Tabelle')!
        expect(banner(page)[0]!.element.compareDocumentPosition(standings.element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      }
    })

    it(`shows the Host no banner, ${name}`, async () => {
      const { slug } = serveState({ ...setup, host: true, overrides: { ...tied, end: { ...tied.end!, finish: { rejection: null }, lastGame: { rejection: null } } } })

      expect(banner(await mount(slug))).toHaveLength(0)
    })
  }

  it('shows no banner without a Tie, and none in a finished Event even though its end still has the Tie', async () => {
    const sole = serveState({ sessions: [RUNNING_ONE], missing: 0, phase: 'running', running: 0, overrides: { ...tied, standings: [{ team: 1, rank: 1, points: 2 }, { team: 2, rank: 2, points: 0 }], end: { ...tied.end!, tie: null } } })
    expect(banner(await mount(sole.slug))).toHaveLength(0)

    const finished = serveState({ sessions: [ENDED_ONE], missing: 0, phase: 'finished', overrides: tied })
    expect(banner(await mount(finished.slug))).toHaveLength(0)
  })
})

// The Standings (#274): a stage block after the open Rounds once the first Result exists, and the „Tabelle“ tab in the side panel and on the phone.
describe('the Standings on the Event page', () => {
  const halo: RoundGame = { id: 'g-halo', name: 'Halo', imageUrl: null, youtubeId: null, clipStart: 0, clipLength: 30, playersMin: 2, playersMax: 4, suitabilities: [] }
  const openRound: RoundView = { id: 'r2', startedAt: STARTED, setAt: STARTED, game: { ...halo, id: 'g-kart', name: 'Kart' } }
  const played: ResultView = { roundId: 'r1', number: 1, game: halo, places: [{ team: 2, place: 1, points: 1, score: null }, { team: 1, place: 2, points: 0, score: null }], corrected: false, correctedAt: null, resultAt: STARTED }
  /** The read after one Result (team 2 won) with one more Round open. */
  const afterResult: EventOverrides = {
    rounds: [openRound],
    results: [played],
    standings: [{ team: 2, rank: 1, points: 1 }, { team: 1, rank: 2, points: 0 }],
    end: { played: 1, gameCount: 6, complete: false, tie: null, finish: null, lastGame: null },
  }
  const beforeResult: EventOverrides = {
    rounds: [openRound],
    results: [],
    standings: [{ team: 1, rank: 1, points: 0 }, { team: 2, rank: 1, points: 0 }],
    end: { played: 0, gameCount: 6, complete: false, tie: null, finish: null, lastGame: null },
  }
  const ENDED_ONE = SESSION(1, FIRST, { startedAt: STARTED, endedAt: ENDED })
  const RUNNING_ONE = SESSION(1, FIRST, { startedAt: STARTED })

  beforeEach(() => {
    signInAs(kitty)
    stubScreen(true)
  })

  afterEach(() => {
    mounted?.unmount()
    mounted = undefined
    restoreScreen()
    document.body.innerHTML = ''
  })

  describe('as a block of the stage', () => {
    it('has none before the first Result, and none when the read has no end', async () => {
      const before = serveState({ sessions: [RUNNING_ONE], missing: 0, phase: 'running', running: 0, overrides: beforeResult })
      expect(regionHeadings(await mount(before.slug))).toEqual(['Gerade dran', 'Spielbrett', 'Sessions', 'So wird gespielt'])

      const none = serveState({ sessions: [RUNNING_ONE], missing: 0, phase: 'running', running: 0, overrides: { rounds: [openRound] } })
      expect(regionHeadings(await mount(none.slug))).toEqual(['Gerade dran', 'Spielbrett', 'Sessions', 'So wird gespielt'])
    })

    it('follows the open Rounds once the first Result exists, while a Session runs', async () => {
      const { slug } = serveState({ sessions: [RUNNING_ONE], missing: 0, phase: 'running', running: 0, overrides: afterResult })

      const page = await mount(slug)

      expect(regionHeadings(page)).toEqual(['Gerade dran', 'Tabelle', 'Spielbrett', 'Sessions', 'So wird gespielt'])
      const block = page.findAll('main section').find(section => section.find('h2').text() === 'Tabelle')!
      expect(block.text()).toContain('Nach Spiel 1 von 6')
      expect(block.findAll('tbody tr').map(row => row.attributes('data-team'))).toEqual(['2', '1'])
      expect(block.classes()).toContain('shadow-card')
    })

    it('follows the open Rounds between two Sessions and after the last one', async () => {
      const between = serveState({ sessions: [ENDED_ONE, SESSION(2, SECOND)], missing: 0, phase: 'running', overrides: afterResult })
      expect(regionHeadings(await mount(between.slug))).toEqual(['Gerade dran', 'Tabelle', 'Sessions', 'So wird gespielt', 'Spielbrett'])

      const done = serveState({ sessions: [ENDED_ONE], missing: 0, phase: 'running', overrides: afterResult })
      expect(regionHeadings(await mount(done.slug))).toEqual(['Gerade dran', 'Tabelle', 'Sessions', 'So wird gespielt', 'Spielbrett'])
    })

    it('is not on the stage in the poll and teams states', async () => {
      const poll = serveState({ sessions: [SESSION(1, null)], missing: 1, overrides: afterResult })
      expect(regionHeadings(await mount(poll.slug))).not.toContain('Tabelle')

      const teams = serveState({ sessions: [SESSION(1, FIRST)], missing: 0, phase: 'date_set', overrides: afterResult })
      expect(regionHeadings(await mount(teams.slug))).not.toContain('Tabelle')
    })
  })

  describe('as a tab', () => {
    it('is the first of two tabs of the side panel, which still opens on „Aktivität“, and holds the Standings and the history', async () => {
      const { slug } = serveState({ sessions: [RUNNING_ONE], missing: 0, phase: 'running', running: 0, overrides: afterResult })

      const page = await mount(slug)

      const panel = page.get('aside[aria-label="Seitenleiste"]')
      const tabs = panel.findAll('[role="tab"]')
      expect(tabs.map(tab => tab.text())).toEqual(['Tabelle', 'Aktivität'])
      expect(tabs.map(tab => tab.attributes('aria-selected'))).toEqual(['false', 'true'])
      const tabpanel = panel.get(`[id="${tabs[0]!.attributes('aria-controls')}"]`)
      expect(tabpanel.attributes('role')).toBe('tabpanel')
      expect(tabpanel.findAll('h2').map(heading => heading.text())).toEqual(['Tabelle', 'Spielverlauf'])
      expect(tabpanel.find('div.overflow-y-auto').exists()).toBe(true)

      await tabs[0]!.trigger('click')
      expect(tabpanel.attributes('style') ?? '').not.toContain('display: none')
      expect(tabpanel.findAll('tbody tr')).toHaveLength(2)
    })

    it('is the second of three items in the phone\'s bar, and replaces the stage with the Standings and the history', async () => {
      stubScreen(false)
      const { slug } = serveState({ sessions: [RUNNING_ONE], missing: 0, phase: 'running', running: 0, overrides: afterResult })

      const page = await mount(slug)

      const items = page.findAll('nav[aria-label="Event"] button')
      expect(items.map(item => item.text())).toEqual(['Event', 'Tabelle', 'Aktivität'])
      expect(page.get('h1').text()).toBe('Die Session läuft')

      await items[1]!.trigger('click')

      expect(page.findAll('h1').map(heading => heading.text())).toEqual(['Tabelle'])
      expect(page.findAll('nav[aria-label="Event"] button').map(item => item.attributes('aria-current'))).toEqual([undefined, 'page', undefined])
      expect(page.findAll('main h2').map(heading => heading.text())).toEqual(['Tabelle', 'Spielverlauf'])
      expect(page.text()).toContain('wird gespielt')
      expect(page.find('[role="log"]').exists()).toBe(false)
    })
  })

  // The Standings in motion (#276): the page holds one `news` (useStandingsNews) and hands it to every Leaderboard; only the stage's celebrates.
  // The one polite live region is the page's, outside the branches of the stage and the phone views. Nothing plays on a load or in a finished Event.
  describe('in motion', () => {
    // A `p`: the page has other polite regions (the toasts), and this one is the Standings' announcement.
    const live = () => mounted!.find('p[role="status"][aria-live="polite"]')
    const boards = (): VueWrapper<InstanceType<typeof Leaderboard>>[] => mounted!.findAllComponents(Leaderboard)
    const stageBoard = () => boards().find(board => board.props('framed') === true)
    const serveResult = (extra: Partial<Setup> = {}) => serveState({ sessions: [RUNNING_ONE], missing: 0, phase: 'running', running: 0, overrides: beforeResult, ...extra })
    /** The Host enters Spiel 1 while the page is open: the next read of the Event has the Result. */
    async function readsResult(served: ReturnType<typeof serveResult>, slug: string, overrides: EventOverrides = afterResult, phase = 'running') {
      served.set(viewWithSessions(slug, [RUNNING_ONE], 0, {
        event: { phase, isHost: false },
        settings: defaultSettings(),
        teams: [team(1), team(2)],
        members: members(),
        runningSessionId: `session-${slug}-0`,
        ...overrides,
      }))
      await refreshEvent(slug)
      await flushPromises()
    }

    it('has no news on the first render, also with a Result already there, and keeps an empty live region ready', async () => {
      const { slug } = serveState({ sessions: [RUNNING_ONE], missing: 0, phase: 'running', running: 0, overrides: afterResult })

      await mount(slug)

      expect(boards().length).toBeGreaterThan(0)
      for (const board of boards()) expect(board.props('news')).toBeNull()
      expect(live().exists()).toBe(true)
      expect(live().text()).toBe('')
      expect(mounted!.findAll('[data-delta]')).toHaveLength(0)
    })

    it('hands the news of a new Result to the stage\'s Leaderboard with `celebrate`, and to the panel\'s without', async () => {
      const served = serveResult()
      await mount(served.slug)
      expect(stageBoard()).toBeUndefined()

      await readsResult(served, served.slug)

      const stage = stageBoard()!
      expect(stage.props('celebrate')).toBe(true)
      expect(stage.props('news')).toMatchObject({ kind: 'entered', number: 1, winners: [2] })
      const others = boards().filter(board => !board.props('framed'))
      expect(others.length).toBeGreaterThan(0)
      for (const board of others) {
        expect(board.props('celebrate')).toBe(false)
        expect(board.props('news')).toEqual(stage.props('news'))
      }
    })

    it('stamps the winner on the stage block when the first Result arrives, and the panel has none', async () => {
      const served = serveResult()
      await mount(served.slug)

      await readsResult(served, served.slug)

      expect(stageBoard()!.findAll('[data-stamp]').map(stamp => stamp.text())).toEqual(['Sieg in Spiel 1!'])
      expect(mounted!.findAll('[data-stamp]')).toHaveLength(1)
    })

    it('hands the news to the phone\'s „Tabelle“ view too, without `celebrate`', async () => {
      stubScreen(false)
      const served = serveResult()
      const page = await mount(served.slug)
      await page.findAll('nav[aria-label="Event"] button')[1]!.trigger('click')

      await readsResult(served, served.slug)

      expect(boards()).toHaveLength(1)
      expect(boards()[0]!.props('celebrate')).toBe(false)
      expect(boards()[0]!.props('news')).toMatchObject({ kind: 'entered', number: 1 })
    })

    it('reads the announcement once in the page\'s live region, which was there before the text', async () => {
      const served = serveResult()
      await mount(served.slug)
      const region = live().element
      expect(region.textContent).toBe('')

      await readsResult(served, served.slug)

      expect(mounted!.findAll('p[role="status"][aria-live="polite"]')).toHaveLength(1)
      expect(live().element).toBe(region)
      expect(live().text()).toBe('Spiel 1 ist eingetragen. Team Rot ist jetzt auf Rang 2.')
      expect(live().classes()).toContain('sr-only')
      // No Leaderboard has a live region of its own: the stage and the panel would read it twice.
      for (const board of boards()) expect(board.find('[aria-live]').exists()).toBe(false)
    })

    it('keeps the live region across a switch of the phone\'s views', async () => {
      stubScreen(false)
      const served = serveResult()
      const page = await mount(served.slug)
      const region = live().element

      await page.findAll('nav[aria-label="Event"] button')[1]!.trigger('click')
      await page.findAll('nav[aria-label="Event"] button')[0]!.trigger('click')

      expect(live().element).toBe(region)
    })

    it('makes no news in a finished Event, and the live region stays empty', async () => {
      const served = serveResult({ phase: 'finished' })
      await mount(served.slug)

      await readsResult(served, served.slug, afterResult, 'finished')

      for (const board of boards()) expect(board.props('news')).toBeNull()
      expect(live().text()).toBe('')
      expect(mounted!.findAll('[data-delta]')).toHaveLength(0)
    })

    it('makes news for a Correction of a Result the page already knows', async () => {
      const served = serveState({ sessions: [RUNNING_ONE], missing: 0, phase: 'running', running: 0, overrides: afterResult })
      await mount(served.slug)

      await readsResult(served, served.slug, {
        ...afterResult,
        results: [{ ...played, places: [{ team: 1, place: 1, points: 1, score: null }, { team: 2, place: 2, points: 0, score: null }], corrected: true, correctedAt: '2026-10-30T20:00:00.000Z' }],
        standings: [{ team: 1, rank: 1, points: 1 }, { team: 2, rank: 2, points: 0 }],
      })

      expect(stageBoard()!.props('news')).toMatchObject({ kind: 'corrected', number: 1, winners: [1] })
      expect(live().text()).toContain('Spiel 1 wurde korrigiert.')
    })
  })

  // The Host's „Korrigieren“ (#275): a pencil per numbered row of the history, until the Event finishes; it opens the result sheet and the save is the same PUT.
  describe('the Host\'s Corrections', () => {
    const pencil = (page: Awaited<ReturnType<typeof mount>>) => page.findAll('button[aria-label="Spiel 1 korrigieren"]')
    const hostEvent = (extra: Partial<Setup> = {}) => serveState({ sessions: [RUNNING_ONE], missing: 0, phase: 'running', running: 0, overrides: afterResult, ...extra })

    it('puts a pencil on every numbered row of the panel\'s „Tabelle“ tab for the Host', async () => {
      const { slug } = hostEvent({ host: true })

      const page = await mount(slug)
      const tabs = page.get('aside[aria-label="Seitenleiste"]').findAll('[role="tab"]')
      await tabs[0]!.trigger('click')

      const panel = page.get(`[id="${tabs[0]!.attributes('aria-controls')}"]`)
      expect(panel.findAll('button[aria-label="Spiel 1 korrigieren"]')).toHaveLength(1)
      expect(panel.findAll('button').filter(button => /korrigieren/i.test(button.attributes('aria-label') ?? ''))).toHaveLength(1)
    })

    it('puts one on the phone\'s „Tabelle“ view too', async () => {
      stubScreen(false)
      const { slug } = hostEvent({ host: true })

      const page = await mount(slug)
      await page.findAll('nav[aria-label="Event"] button')[1]!.trigger('click')

      expect(pencil(page)).toHaveLength(1)
    })

    it('gives a Member none, on either view', async () => {
      const { slug } = hostEvent({ host: false })
      const wide = await mount(slug)
      expect(pencil(wide)).toHaveLength(0)
      expect(document.body.querySelectorAll('button[aria-label$="korrigieren"]')).toHaveLength(0)

      stubScreen(false)
      const phone = await mount(hostEvent({ host: false }).slug)
      await phone.findAll('nav[aria-label="Event"] button')[1]!.trigger('click')
      expect(pencil(phone)).toHaveLength(0)
    })

    it('gives the Host none once the Event has finished, though the history is there', async () => {
      const { slug } = hostEvent({ host: true, phase: 'finished' })

      const page = await mount(slug)

      expect(page.text()).toContain('Spielverlauf')

      expect(document.body.querySelectorAll('button[aria-label$="korrigieren"]')).toHaveLength(0)
      expect(pencil(page)).toHaveLength(0)
    })

    it('opens the sheet prefilled, and saving PUTs rounds/:id/result with the Places', async () => {
      stubScreen(false)
      const puts: unknown[] = []
      const { slug } = hostEvent({ host: true })
      registerEndpoint(`/api/e/${slug}/rounds/r1/result`, { method: 'PUT', handler: async (event) => {
        puts.push(await readBody(event))
        return { roundId: 'r1', number: 1 }
      } })

      const page = await mount(slug)
      await page.findAll('nav[aria-label="Event"] button')[1]!.trigger('click')
      await pencil(page)[0]!.trigger('click')
      await vi.waitFor(() => expect(dialog()).not.toBeNull())

      expect(dialog()!.querySelector('h2')?.textContent).toBe('Spiel 1 korrigieren')
      expect(dialog()!.textContent).toContain('Korrektur: Spiel 1 von 6')
      await clickButton(dialog(), 'Korrektur speichern')
      await flushPromises()

      await vi.waitFor(() => expect(puts).toEqual([{ places: [{ team: 2, place: 1, score: null }, { team: 1, place: 2, score: null }] }]))
      await vi.waitFor(() => expect(dialog()).toBeNull())
    })
  })
})
