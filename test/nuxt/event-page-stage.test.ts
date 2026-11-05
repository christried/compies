import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { refreshEvent } from '~/composables/useEventView'
import type { RoundGame } from '~~/shared/game'
import type { RoundView } from '~~/shared/stage'
import { kitty, signInAs } from './auth'
import { dialog, regionHeadings, stubScreen, type EventOverrides } from './event-page'
import { afterResult, ENDED, FIRST, members, mount, mountedPage, SECOND, SESSION, serveState, STARTED, team, unmountPage, type Seat, type Setup } from './event-page-states'

// The stage of the Event page while it plays (#166, #228, #283): the order of its blocks in a running Event, between two Sessions and after the last one,
// the Tie banner and the notice that the last game needs a Session, and the motion of the block group (the glide of a block that another one moves).

describe('the stage of an Event page that plays', () => {
  const RUNNING_ONE = SESSION(1, FIRST, { startedAt: STARTED })

  beforeEach(() => {
    signInAs(kitty)
    stubScreen(true)
  })

  afterEach(unmountPage)

  describe('in the order of its state', () => {
    for (const host of [true, false]) {
      const who = host ? 'the Host' : 'a Member'

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
    }
  })

  // The blocks glide when one above them leaves or arrives (#276, F4 of the s5 check): the page's group moves them with Vue's FLIP. This proves what the group
  // asks for, not that it glides: the browser check (scripts/browser/standings.mjs) does.
  describe('when a block above moves them', () => {
    /** The page's group of blocks: the group with the width of the page. */
    const blocks = () => mountedPage()!.findAllComponents({ name: 'TransitionGroup' }).find((group: VueWrapper) => group.classes().includes('max-w-[1100px]'))!

    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('glide like the Round cards do: a transform, ease-out, the slow duration, and nothing under reduced motion', async () => {
      const served = serveState({ sessions: [RUNNING_ONE], missing: 0, phase: 'running', running: 0, overrides: afterResult })

      await mount(served.slug)

      expect(String(blocks().props('moveClass')).split(' ')).toEqual(['transition-transform', 'dur-slow', 'ease-out', 'motion-reduce:transition-none', 'reduced:transition-none'])
    })

    it('are asked for no glide while the tab is hidden: they move at once, and nothing starts when the Member returns', async () => {
      vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
      const served = serveState({ sessions: [RUNNING_ONE], missing: 0, phase: 'running', running: 0, overrides: afterResult })

      await mount(served.slug)

      expect(String(blocks().props('moveClass') ?? '')).not.toContain('transition-transform')
    })
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

  afterEach(unmountPage)

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

// The dead end (#278): after the last Session the Game count is not reached and no Session is left, so the Host gets a notice with the way on.
describe('the session-needed notice on the Event page', () => {
  const TITLE = (n: number) => `Noch ${n} Spiel${n === 1 ? '' : 'e'} offen`
  const TEXT = 'Dafür braucht es eine neue Session. Leg sie an und starte sie, wenn ihr so weit seid.'
  const ENDED_ONE = SESSION(1, FIRST, { startedAt: STARTED, endedAt: ENDED })
  const RUNNING_ONE = SESSION(1, FIRST, { startedAt: STARTED })
  // The Event read of a Game count that is not reached: the Standings are there once a Result is (played > 0).
  const short = (played: number, gameCount: number): EventOverrides => ({
    end: { played, gameCount, complete: false, tie: null, finish: null, lastGame: null },
    results: [],
    standings: played > 0 ? [{ team: 1, rank: 1, points: 1 }, { team: 2, rank: 2, points: 0 }] : null,
  })
  const halo: RoundGame = { id: 'g-halo', name: 'Halo', imageUrl: null, youtubeId: null, clipStart: 0, clipLength: 30, playersMin: 2, playersMax: 4, suitabilities: [] }
  const openRound = (id: string): RoundView => ({ id, startedAt: STARTED, setAt: STARTED, game: { ...halo, id: `g-${id}`, name: `Spiel ${id}` } })
  const notice = (page: Awaited<ReturnType<typeof mount>>) => page.findAll('[role="status"]').filter(element => element.text().includes(TEXT))

  beforeEach(() => {
    signInAs(kitty)
    stubScreen(true)
  })

  afterEach(unmountPage)

  it('tells the Host after the last Session what is open, why, and offers Session hinzufügen, marked for the Host only', async () => {
    const { slug } = serveState({ sessions: [ENDED_ONE], missing: 0, host: true, phase: 'running', overrides: short(2, 3) })

    const page = await mount(slug)

    expect(notice(page)).toHaveLength(1)
    expect(notice(page)[0]!.text()).toContain(TITLE(1))
    expect(notice(page)[0]!.text()).toContain('Nur du siehst das')
    expect(notice(page)[0]!.findAll('button').map(button => button.text()).filter(Boolean)).toEqual(['Session hinzufügen'])
  })

  it('counts the open games in the title: three of five', async () => {
    const { slug } = serveState({ sessions: [ENDED_ONE], missing: 0, host: true, phase: 'running', overrides: short(2, 5) })

    expect(notice(await mount(slug))[0]!.text()).toContain(TITLE(3))
  })

  it('counts the Rounds that are open, and shows nothing when they fill the Game count', async () => {
    const { slug } = serveState({ sessions: [ENDED_ONE], missing: 0, host: true, phase: 'running', overrides: { ...short(0, 6), rounds: [openRound('a'), openRound('b'), openRound('c'), openRound('d')] } })
    expect(notice(await mount(slug))[0]!.text()).toContain(TITLE(2))

    const filled = serveState({ sessions: [ENDED_ONE], missing: 0, host: true, phase: 'running', overrides: { ...short(2, 3), rounds: [openRound('a')] } })
    expect(notice(await mount(filled.slug))).toHaveLength(0)
  })

  it('shows no notice to a Member, on the Bench or in a Team', async () => {
    for (const seat of [{ zone: 'bench' }, { zone: 'team', team: 1 }] as Seat[]) {
      const { slug } = serveState({ sessions: [ENDED_ONE], missing: 0, phase: 'running', overrides: { ...short(2, 3), members: members({ kitty: seat }) } })

      expect(notice(await mount(slug))).toHaveLength(0)
    }
  })

  it('shows no notice while a Session runs, between Sessions, before a Session started, or in the finished Event', async () => {
    const running = serveState({ sessions: [RUNNING_ONE], missing: 0, host: true, phase: 'running', running: 0, overrides: short(2, 3) })
    expect(notice(await mount(running.slug))).toHaveLength(0)

    const between = serveState({ sessions: [ENDED_ONE, SESSION(2, SECOND)], missing: 0, host: true, phase: 'running', overrides: short(2, 3) })
    expect(notice(await mount(between.slug))).toHaveLength(0)

    const polling = serveState({ sessions: [ENDED_ONE, SESSION(2, null)], missing: 1, host: true, phase: 'running', overrides: short(2, 3) })
    expect(notice(await mount(polling.slug))).toHaveLength(0)

    const fresh = serveState({ sessions: [SESSION(1, FIRST)], missing: 0, host: true, phase: 'date_set', overrides: short(0, 3) })
    expect(notice(await mount(fresh.slug))).toHaveLength(0)

    const finished = serveState({ sessions: [ENDED_ONE], missing: 0, host: true, phase: 'finished', overrides: short(2, 3) })
    expect(notice(await mount(finished.slug))).toHaveLength(0)
  })

  it('shows the setup notice alone while the Event has no settings, and no notice of this kind', async () => {
    const { slug } = serveState({ sessions: [ENDED_ONE], missing: 0, host: true, phase: 'running', settings: false })

    const page = await mount(slug)

    expect(page.text()).toContain('Event einrichten')
    expect(notice(page)).toHaveLength(0)
  })

  it('shows no notice with a Tie: the Host decides that banner', async () => {
    const tie: EventOverrides = { ...short(2, 2), end: { played: 2, gameCount: 2, complete: true, tie: [1, 2], finish: null, lastGame: null }, standings: [{ team: 1, rank: 1, points: 1 }, { team: 2, rank: 1, points: 1 }] }
    const { slug } = serveState({ sessions: [ENDED_ONE], missing: 0, host: true, phase: 'running', overrides: tie })

    expect(notice(await mount(slug))).toHaveLength(0)
  })

  it('shows no notice at the maximum of eight Sessions, though the games are open', async () => {
    const eight = Array.from({ length: 8 }, (_, index) => SESSION(index + 1, `2026-10-${String(10 + index).padStart(2, '0')}T19:00:00.000Z`, { startedAt: STARTED, endedAt: ENDED }))
    const { slug } = serveState({ sessions: eight, missing: 0, host: true, phase: 'running', overrides: short(8, 9) })

    expect(notice(await mount(slug))).toHaveLength(0)
  })

  it('sits above the Standings, under the Head', async () => {
    const { slug } = serveState({ sessions: [ENDED_ONE], missing: 0, host: true, phase: 'running', overrides: short(2, 3) })

    const page = await mount(slug)
    const standings = page.findAll('main section').find(section => section.find('h2').text() === 'Tabelle')
    expect(standings).toBeDefined()
    expect(notice(page)[0]!.element.compareDocumentPosition(standings!.element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('closes with its ×, and stays closed when the Event is read again', async () => {
    const { slug } = serveState({ sessions: [ENDED_ONE], missing: 0, host: true, phase: 'running', overrides: short(2, 3) })
    const page = await mount(slug)

    await notice(page)[0]!.get('button[aria-label="Schließen"]').trigger('click')
    expect(notice(page)).toHaveLength(0)

    await refreshEvent(slug)
    await flushPromises()
    expect(notice(page)).toHaveLength(0)
  })

  it('opens the add sheet from the notice, as the Sessions card does', async () => {
    const { slug } = serveState({ sessions: [ENDED_ONE], missing: 0, host: true, phase: 'running', overrides: short(2, 3) })
    const page = await mount(slug)

    await notice(page)[0]!.findAll('button').find(button => button.text() === 'Session hinzufügen')!.trigger('click')
    await flushPromises()

    expect(dialog()?.textContent).toContain('Session hinzufügen')
    dialog()!.querySelector<HTMLElement>('button[aria-label="Schließen"]')!.click()
    await vi.waitFor(() => expect(dialog()).toBeNull())

    // The Sessions card's own button is still there, below the notice, and opens the same sheet.
    const cardButton: HTMLButtonElement = [...page.element.querySelectorAll('button')].filter(button => button.textContent?.trim() === 'Session hinzufügen').at(-1)!
    cardButton.click()
    await flushPromises()
    expect(dialog()?.textContent).toContain('Session hinzufügen')
  })
})
