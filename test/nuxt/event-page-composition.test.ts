import { mountSuspended } from '@nuxt/test-utils/runtime'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import EventPage from '~/pages/e/[slug]/index.vue'
import type { BoardTeam, MemberView } from '~~/shared/event'
import { defaultSettings } from '~~/shared/settings'
import { kitty, signInAs } from './auth'
import { clickButton, LARSI, regionHeadings, restoreScreen, SANNE, serve, stubScreen, viewWithSessions, type EventOverrides } from './event-page'

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
  const member = (id: string, name: string, isHost: boolean, seat: Seat = { zone: 'bench' }): MemberView => ({
    id, name, image: `https://example.com/${name}.png`, isHost, zone: seat.zone, team: seat.zone === 'team' ? seat.team ?? 1 : null, teamWord: null,
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
  const page = await mountSuspended(EventPage, { route: `/e/${slug}` })
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
      const done = await pill({ sessions: [ended], missing: 0, phase: 'running' })
      expect(done).toContain('Vorbei')
      expect(done).not.toContain('Läuft')
    })
  })
})
