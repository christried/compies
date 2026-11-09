import { mockNuxtImport, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { getQuery, readBody } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Leaderboard from '~/components/Leaderboard.vue'
import { refreshEvent } from '~/composables/useEventView'
import type { RoundGame } from '~~/shared/game'
import type { CeremonyView, ResultView } from '~~/shared/stage'
import { defaultSettings } from '~~/shared/settings'
import { kitty, signInAs } from './auth'
import { clickButton, clickHostAction, dialog, hostActionElement, openHostMenu, regionHeadings, shownToasts, stubScreen, viewWithSessions, type EventOverrides } from './event-page'
import { afterResult, ENDED, FIRST, members, mount, mountedPage, openRound, played, SECOND, SESSION, serveState, STARTED, team, unmountPage, type Seat, type Setup } from './event-page-states'

// Counts the GSAP chunk's loads (ADR 0015): opening a finished Event after the run's end must not ask for it, a click on a replay may. Calls through.
const chunk = vi.hoisted(() => ({ loads: 0 }))
mockNuxtImport('loadGsap', async () => {
  const { loadGsap: real } = await vi.importActual<typeof import('~/utils/gsap')>('~/utils/gsap')
  return () => {
    chunk.loads++
    return real()
  }
})

// The Standings and the finished Event on the Event page (#274, #275, #276, #277, #283): the Standings as a block of the stage and as a tab, the news they
// play, the Host's Corrections and the history, and a finished Event read-only for everybody.

// The finished Event (#277): read-only for everybody, and its stage is the winner, the Standings and the history.
describe('the finished Event page', () => {
  const halo: RoundGame = { id: 'g-halo', name: 'Halo', imageUrl: null, youtubeId: null, clipStart: 0, clipLength: 30, playersMin: 2, playersMax: 4, suitabilities: [], price: null }
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

  afterEach(unmountPage)

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

  // „Bild teilen“ (#313): the row at the top of the finished stage, for everybody, right under the Head and before the Standings.
  describe('„Bild teilen“', () => {
    const shareButton = (page: VueWrapper) => page.findAll('main button').find(button => button.text() === 'Bild teilen')

    for (const host of [true, false]) {
      it(`is the first thing of the stage after the Head, before the Standings, for ${host ? 'the Host' : 'a Member'}`, async () => {
        const { slug } = serveState({ sessions: [ENDED_ONE], missing: 0, phase: 'finished', host, overrides: finishedRead() })

        const page = await mount(slug)

        const button = shareButton(page)!.element
        expect(button).toBeDefined()
        const standings = page.findAll('main section').find(section => section.find('h2').text() === 'Tabelle')!.element
        expect(button.compareDocumentPosition(standings) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
        expect(page.get('main h1').element.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      })
    }

    it('is on no other page state, and not in a finished Event without a Result', async () => {
      const running = serveState({ sessions: [SESSION(1, FIRST, { startedAt: STARTED })], missing: 0, phase: 'running', overrides: finishedRead({ end: null }) })
      expect(shareButton(await mount(running.slug))).toBeUndefined()

      const empty = serveState({ sessions: [ENDED_ONE], missing: 0, phase: 'finished', overrides: finishedRead({ results: [], standings: null, end: null }) })
      expect(shareButton(await mount(empty.slug))).toBeUndefined()
    })

    it('opens the share sheet, with the picture of the Event asked for', async () => {
      const { slug } = serveState({ sessions: [ENDED_ONE], missing: 0, phase: 'finished', overrides: finishedRead() })
      const asked: string[] = []
      registerEndpoint(`/api/e/${slug}/share-image`, {
        method: 'GET',
        handler: (event) => {
          asked.push(String(getQuery(event).format))
          return new Blob(['png'], { type: 'image/png' })
        },
      })
      URL.createObjectURL = vi.fn(() => 'blob:page')
      URL.revokeObjectURL = vi.fn()
      const page = await mount(slug)
      expect(dialog()).toBeNull()

      await clickButton(page.element, 'Bild teilen')
      await flushPromises()

      expect(dialog()!.textContent).toContain('Ergebnis teilen')
      expect(asked).toEqual(['wide'])
    })
  })

  it('gives a Member no dock, and the Host one that holds Siegerehrung starten, Einladen and Mehr and nothing else', async () => {
    const member = serveState({ sessions: [ENDED_ONE], missing: 0, phase: 'finished', overrides: finishedRead() })
    expect(toolbar(await mount(member.slug))).toEqual([])

    const host = serveState({ sessions: [ENDED_ONE], missing: 0, phase: 'finished', host: true, overrides: finishedRead({ end: { played: 3, gameCount: 3, complete: true, tie: null, finish: { rejection: 'wrong_phase' }, lastGame: null } }) })
    const page = await mount(host.slug)
    expect(toolbar(page)).toEqual(['Siegerehrung starten', 'Einladen', 'Mehr'])
    const menu = await openHostMenu(page)
    // „Mehr“ lists every action but a hold or dockOnly one in the pill, so the tap primary repeats there as Rad drehen does in a Session (event-session-start).
    expect([...menu.querySelectorAll('[role="menuitem"]')].map(item => item.textContent?.trim())).toEqual(['Siegerehrung starten', 'Event löschen', 'Einladen'])
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

  // The Award ceremony (#309) on the page: the layer opens for a Member inside the run, and the Host's dock action holds its reason until the run is over.
  describe('the Award ceremony', () => {
    /** A run that started a second ago and plays for a minute more. */
    const running = (): CeremonyView => ({ startsAt: new Date(Date.now() - 1000).toISOString(), endsAt: new Date(Date.now() + 60_000).toISOString(), gag: 'trip' })
    /** The same kind of start, its run over a minute ago: the read the page gets after the run. */
    const over = (): CeremonyView => ({ startsAt: new Date(Date.now() - 120_000).toISOString(), endsAt: new Date(Date.now() - 60_000).toISOString(), gag: 'trip' })
    /** The finished Event's read with this ceremony, for the Host or a Member. */
    const readWith = (slug: string, ceremony: CeremonyView, host: boolean) => viewWithSessions(slug, [ENDED_ONE], 0, {
      event: { phase: 'finished', isHost: host },
      settings: defaultSettings(),
      teams: [team(1), team(2)],
      members: members(),
      ...finishedRead({ ceremony }),
    })

    it('opens the layer for a Member who has the page inside the run', async () => {
      const { slug } = serveState({ sessions: [ENDED_ONE], missing: 0, phase: 'finished', overrides: finishedRead({ ceremony: running() }) })

      await mount(slug)

      await vi.waitFor(() => expect(dialog()?.textContent).toContain('Siegerehrung!'))
    })

    it('holds Siegerehrung starten disabled with its reason during the run, and posts once the run is over', async () => {
      const served = serveState({ sessions: [ENDED_ONE], missing: 0, phase: 'finished', host: true, overrides: finishedRead({ ceremony: running() }) })
      let posts = 0
      registerEndpoint(`/api/e/${served.slug}/ceremony`, { method: 'POST', handler: () => {
        posts += 1
        return running()
      } })

      const page = await mount(served.slug)

      const action = await hostActionElement(page, 'Siegerehrung starten')
      expect(action.getAttribute('aria-disabled')).toBe('true')
      expect(page.get(`#${action.getAttribute('aria-describedby')}`).text()).toBe('Die Siegerehrung läuft noch.')
      await clickHostAction(page, 'Siegerehrung starten')
      expect(shownToasts().map(toast => toast.text)).toContain('Die Siegerehrung läuft noch.')
      expect(posts).toBe(0)

      // The run is over: the page's read after its end has the ceremony past it, and the action is free and posts once.
      served.set(readWith(served.slug, over(), true))
      await refreshEvent(served.slug)
      await flushPromises()
      expect((await hostActionElement(page, 'Siegerehrung starten')).getAttribute('aria-disabled')).toBeNull()
      await clickHostAction(page, 'Siegerehrung starten')
      await vi.waitFor(() => expect(posts).toBe(1))
    })

    // „Siegerehrung ansehen“ (#314): once the Host has started the ceremony, everybody can play it again for themselves; nothing plays on its own.
    describe('„Siegerehrung ansehen“', () => {
      const watchButton = (page: VueWrapper) => page.findAll('main button').find(button => button.text() === 'Siegerehrung ansehen')
      /** The page of a finished Event whose ceremony ran a minute ago; counts the posts to the ceremony route. */
      function afterTheRun({ host = false, kitty: seat }: { host?: boolean, kitty?: Seat } = {}) {
        const served = serveState({ sessions: [ENDED_ONE], missing: 0, phase: 'finished', host, overrides: finishedRead({ ceremony: over(), ...(seat ? { members: members({ kitty: seat }) } : {}) }) })
        const posts = { count: 0 }
        registerEndpoint(`/api/e/${served.slug}/ceremony`, { method: 'POST', handler: () => {
          posts.count += 1
          return over()
        } })
        return { ...served, posts }
      }

      it('is not there before the Host has started the ceremony', async () => {
        const { slug } = serveState({ sessions: [ENDED_ONE], missing: 0, phase: 'finished', overrides: finishedRead() })

        const page = await mount(slug)

        expect(watchButton(page)).toBeUndefined()
        expect(page.findAll('main button').some(button => button.text() === 'Bild teilen')).toBe(true)
      })

      it('is there once the ceremony has started, after „Bild teilen“ and before the Standings, with nothing playing and no GSAP asked for', async () => {
        const { slug } = afterTheRun()
        const loadsBefore = chunk.loads

        const page = await mount(slug)
        await flushPromises()

        const button = watchButton(page)!.element
        const share = page.findAll('main button').find(item => item.text() === 'Bild teilen')!.element
        const standings = page.findAll('main section').find(section => section.find('h2').text() === 'Tabelle')!.element
        expect(share.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
        expect(button.compareDocumentPosition(standings) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
        expect(dialog()).toBeNull()
        expect(chunk.loads).toBe(loadsBefore)
      })

      const SEATS: [string, boolean, Seat | undefined][] = [
        ['the Host', true, undefined],
        ['a Player', false, { zone: 'team', team: 1 }],
        ['a Spectator', false, { zone: 'stands' }],
        ['a Member on the Bench', false, { zone: 'bench' }],
      ]
      for (const [who, host, seat] of SEATS) {
        it(`opens the layer at its first frame for ${who}, and sends nothing`, async () => {
          const { slug, posts } = afterTheRun({ host, kitty: seat })
          const page = await mount(slug)

          await watchButton(page)!.trigger('click')

          await vi.waitFor(() => expect(dialog()?.textContent).toContain('Siegerehrung!'))
          expect(dialog()!.getAttribute('data-frame')).toBe('run')
          expect(dialog()!.textContent).toContain('Überspringen')
          expect(posts.count).toBe(0)
        })
      }

      it('leaves the Host\'s „Siegerehrung starten“ free, with the replay open and closed', async () => {
        const { slug, posts } = afterTheRun({ host: true })
        const page = await mount(slug)
        expect((await hostActionElement(page, 'Siegerehrung starten')).getAttribute('aria-disabled')).toBeNull()

        await watchButton(page)!.trigger('click')
        await vi.waitFor(() => expect(dialog()).not.toBeNull())
        expect((await hostActionElement(page, 'Siegerehrung starten')).getAttribute('aria-disabled')).toBeNull()

        dialog()!.querySelector<HTMLButtonElement>('button[aria-label="Schließen"]')!.click()
        await vi.waitFor(() => expect(dialog()).toBeNull())
        expect((await hostActionElement(page, 'Siegerehrung starten')).getAttribute('aria-disabled')).toBeNull()
        expect(posts.count).toBe(0)
      })
    })
  })
})

// The Standings (#274): a stage block after the open Rounds once the first Result exists, and the „Tabelle“ tab in the side panel and on the phone.
describe('the Standings on the Event page', () => {
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

  afterEach(unmountPage)

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
      // One heading „Tabelle“: the h1 that the phone view shows; the Standings below it have no h2 of their own (#274).
      expect(page.findAll('main h2').map(heading => heading.text())).toEqual(['Spielverlauf'])
      expect(page.findAll('main h1, main h2').filter(heading => heading.text() === 'Tabelle').map(heading => heading.element.tagName)).toEqual(['H1'])
      expect(page.text()).toContain('wird gespielt')
      expect(page.find('[role="log"]').exists()).toBe(false)
    })
  })

  // The Standings in motion (#276): the page holds one `news` (useStandingsNews) and hands it to every Leaderboard; only the stage's celebrates.
  // The one polite live region is the page's, outside the branches of the stage and the phone views. Nothing plays on a load or in a finished Event.
  describe('in motion', () => {
    // A `p`: the page has other polite regions (the toasts), and this one is the Standings' announcement.
    const live = () => mountedPage()!.find('p[role="status"][aria-live="polite"]')
    const boards = (): VueWrapper<InstanceType<typeof Leaderboard>>[] => mountedPage()!.findAllComponents(Leaderboard)
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
      expect(mountedPage()!.findAll('[data-delta]')).toHaveLength(0)
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
      expect(mountedPage()!.findAll('[data-stamp]')).toHaveLength(1)
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

      expect(mountedPage()!.findAll('p[role="status"][aria-live="polite"]')).toHaveLength(1)
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
      expect(mountedPage()!.findAll('[data-delta]')).toHaveLength(0)
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
