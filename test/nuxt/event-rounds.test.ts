import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { createError, readBody } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import EventRounds from '~/components/EventRounds.vue'
import EventPage from '~/pages/e/[slug]/index.vue'
import type { BoardTeam, EventPools } from '~~/shared/event'
import type { EndView, RoundView, SetGameView } from '~~/shared/stage'
import type { GameView, PoolGame } from '~~/shared/game'
import { defaultSettings } from '~~/shared/settings'
import { kitty, signInAs } from './auth'
import { clickButton, clickHostAction, dialog, hostActionElement, regionHeadings, serve, shownToasts, viewWithSessions, type Mounted, type Wrapper } from './event-page'

// The open Rounds on the stage and „Nächstes Spiel setzen“ (#228, 11-event-seite § EventPage, screen 15): the Round card with
// „wird gespielt“, its Game notes open for the Host only, „Zurücklegen“ as the Host's hold, the picker that lists the Game pool
// first and then the library, and the dock action that is disabled with its reason.

const FIRST = '2026-10-30T19:00:00.000Z'
const STARTED = '2026-10-30T19:30:00.000Z'
const ENDED = '2026-10-30T22:00:00.000Z'

const halo: PoolGame = { id: 'g-halo', name: 'Halo', imageUrl: null, youtubeId: null, clipStart: 0, clipLength: 30, playersMin: 2, playersMax: 4, suitabilities: [], notes: 'Hausregel: keine Raketen' }
const kart: PoolGame = { ...halo, id: 'g-kart', name: 'Kart', notes: null }
const pong: PoolGame = { ...halo, id: 'g-pong', name: 'Pong', notes: null }
const schach: GameView = { ...halo, id: 'g-schach', name: 'Schach', notes: null, createdBy: { id: kitty.id, name: 'Kitty' }, createdAt: '2026-01-15T10:00:00.000Z', canEdit: true }

const round = (id: string, game: PoolGame, notes?: string): RoundView => {
  const { notes: _notes, ...shown } = game
  return { id, startedAt: STARTED, setAt: STARTED, game: shown, ...(notes ? { notes } : {}) }
}

const pools: EventPools = { main: [halo, kart, pong] }
const pill = (page: Mounted) => [...page.element.querySelectorAll('[role="toolbar"] button')].map(button => button.textContent?.replace(/\s+/g, ' ').trim())

type Options = { host: boolean, rounds?: RoundView[], setGame?: SetGameView | null, sessions?: Parameters<typeof viewWithSessions>[1], phase?: string, teams?: BoardTeam[], end?: EndView | null }

/** A running Event, set up for Host pick: the Host's or a Member's read of it, with these open Rounds. */
function serveRunning({ host, rounds = [], setGame, sessions, phase = 'running', teams, end }: Options) {
  return serve(slug => viewWithSessions(slug, sessions ?? [{ number: null, startsAt: FIRST, startedAt: STARTED }], 0, {
    event: { isHost: host, phase },
    settings: defaultSettings(),
    runningSessionId: sessions ? undefined : `session-${slug}-0`,
    rounds,
    setGame,
    teams,
    ...(end === undefined ? {} : { end }),
    pools: host ? pools : null,
  }))
}

let page: Awaited<ReturnType<typeof mountSuspended>> | undefined
async function mount(slug: string, attachTo?: HTMLElement) {
  page = await mountSuspended(EventPage, { route: `/e/${slug}`, attachTo })
  return page
}

beforeEach(() => {
  signInAs(kitty)
  useState('toasts').value = []
  document.body.innerHTML = ''
})

afterEach(() => {
  page?.unmount()
  page = undefined
  vi.useRealTimers()
})

describe('the open Rounds on the stage', () => {
  it('lists every open Round as a card with „wird gespielt“, above the Game board, in the order they started', async () => {
    const { slug } = serveRunning({ host: false, rounds: [round('r1', halo), round('r2', kart)] })

    const stage = await mount(slug)

    expect(regionHeadings(stage)).toEqual(['Gerade dran', 'Spielbrett', 'Sessions', 'So wird gespielt'])
    const cards = stage.get('[aria-label="Offene Spiele"]').findAll('li')
    expect(cards.map((card: Wrapper) => card.text())).toEqual([expect.stringContaining('Halo'), expect.stringContaining('Kart')])
    for (const card of cards) expect(card.text()).toContain('wird gespielt')
  })

  it('shows the player count of the game and no number on the Round', async () => {
    const { slug } = serveRunning({ host: false, rounds: [round('r1', halo)] })

    const stage = await mount(slug)

    const card = stage.get('[aria-label="Offene Spiele"] li')
    expect(card.text()).toMatch(/2.?4/)
    expect(card.text()).not.toMatch(/Spiel \d/)
  })

  it('has no block while no Round is open', async () => {
    const { slug } = serveRunning({ host: false })

    const stage = await mount(slug)

    expect(regionHeadings(stage)).toEqual(['Spielbrett', 'Sessions', 'So wird gespielt'])
  })

  it('shows the Rounds between two Sessions, where their Results are entered too (#273)', async () => {
    const { slug } = serveRunning({
      host: false,
      rounds: [round('r1', halo)],
      sessions: [{ number: 1, startsAt: FIRST, startedAt: STARTED, endedAt: ENDED }, { number: 2, startsAt: '2026-10-31T19:00:00.000Z' }],
    })

    const stage = await mount(slug)

    expect(regionHeadings(stage)).toContain('Gerade dran')
    expect(stage.get('[aria-label="Offene Spiele"]').text()).toContain('Halo')
  })

  it('shows the Rounds when every Session has ended', async () => {
    const { slug } = serveRunning({ host: false, rounds: [round('r1', halo)], sessions: [{ number: 1, startsAt: FIRST, startedAt: STARTED, endedAt: ENDED }] })

    const stage = await mount(slug)

    expect(regionHeadings(stage)).toContain('Gerade dran')
  })

  it('opens the Game notes of the Round for the Host', async () => {
    const { slug } = serveRunning({ host: true, rounds: [round('r1', halo, halo.notes!)] })

    const stage = await mount(slug)

    const disclosure = stage.get('[aria-label="Offene Spiele"]').get('button[aria-expanded]')
    expect(disclosure.text()).toBe('Notizen')
    expect(disclosure.attributes('aria-expanded')).toBe('true')
    expect(stage.get('[aria-label="Offene Spiele"]').text()).toContain('Hausregel: keine Raketen')
  })

  it('shows a Member the Round without any Game notes, as the server leaves them out', async () => {
    const { slug } = serveRunning({ host: false, rounds: [round('r1', halo)] })

    const stage = await mount(slug)

    const rounds = stage.get('[aria-label="Offene Spiele"]')
    expect(rounds.text()).not.toContain('Hausregel')
    expect(rounds.text()).not.toContain('Notizen')
  })

  it('offers „Zurücklegen“ to the Host only', async () => {
    const asHost = serveRunning({ host: true, rounds: [round('r1', halo)] })
    const hostStage = await mount(asHost.slug)
    expect(hostStage.get('[aria-label="Offene Spiele"]').text()).toContain('Zurücklegen')
    hostStage.unmount()

    const asMember = serveRunning({ host: false, rounds: [round('r1', halo)] })
    const memberStage = await mount(asMember.slug)
    expect(memberStage.get('[aria-label="Offene Spiele"]').text()).not.toContain('Zurücklegen')
    page = memberStage
  })

  it('puts the Round back only after the one second hold', async () => {
    const puts: string[] = []
    const { slug } = serveRunning({ host: true, rounds: [round('r1', halo)] })
    registerEndpoint(`/api/e/${slug}/rounds/r1`, { method: 'DELETE', handler: () => {
      puts.push('r1')
      return { roundId: 'r1' }
    } })
    const stage = await mount(slug)
    const hold = stage.get('[aria-label="Offene Spiele"]').findAll('button').find((button: Wrapper) => button.text().startsWith('Zurücklegen'))!

    await hold.trigger('click')
    expect(puts).toEqual([])

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    await hold.trigger('pointerdown')
    vi.advanceTimersByTime(900)
    await flushPromises()
    expect(puts).toEqual([])

    vi.advanceTimersByTime(100)
    vi.useRealTimers()
    await vi.waitFor(() => expect(puts).toEqual(['r1']))
  })

  it('lets a row fade in as a UI element does (04-motion § UI enters: 0.22 s, ease-out) and out faster (0.14 s, ease-in)', async () => {
    const rounds = await mountSuspended(EventRounds, { props: { rounds: [round('r1', halo)], isHost: false, putBack: () => Promise.resolve(true), teams: [], pointsTable: null, enterResult: () => Promise.resolve(true), end: null } })

    const list = rounds.findComponent({ name: 'TransitionGroup' })
    expect(list.exists()).toBe(true)
    // The classes are the theme's: animate-enter is cp-fade-in over --cp-dur-base (220 ms) with --cp-ease-out; dur-fast is 140 ms.
    expect(list.props('enterActiveClass')).toBe('animate-enter')
    expect(list.props('leaveActiveClass')).toBe('transition-opacity dur-fast ease-in')
    expect(list.props('leaveToClass')).toBe('opacity-0')
    rounds.unmount()
  })
})

// The cards that stay glide to their new cell, and the blocks below glide up, when a card leaves (#276, F4 of the s5 check). jsdom has no layout and no
// transitions: this proves what the groups ask for, not that they glide: the browser check (scripts/browser/standings.mjs) does.
describe('when a Round leaves the open Rounds (#276)', () => {
  const noop = () => Promise.resolve(true)
  const props = (rounds: RoundView[]) => ({ rounds, isHost: false, putBack: noop, teams: [], pointsTable: null, enterResult: noop, end: null })
  const cards = (list: Awaited<ReturnType<typeof mountSuspended>>) => list.findAll('[aria-label="Offene Spiele"] > li')
  /** The real TransitionGroup: Vue Test Utils stubs it, and the stub has no hooks. */
  const realGroup = { global: { stubs: { TransitionGroup: false } } }

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('asks the cards to glide like the page\'s blocks do: a transform, ease-out, the slow duration, and nothing under reduced motion', async () => {
    const rounds = await mountSuspended(EventRounds, { props: props([round('r1', halo), round('r2', kart)]) })

    const moveClass = String(rounds.findComponent({ name: 'TransitionGroup' }).props('moveClass')).split(' ')
    expect(moveClass).toEqual(expect.arrayContaining(['transition-transform', 'dur-slow', 'ease-out', 'motion-reduce:transition-none', 'reduced:transition-none']))
    expect(moveClass).not.toContain('ease-spring')
  })

  it('asks for no glide while the tab is hidden, and for one while it shows', async () => {
    const visibility = vi.spyOn(document, 'visibilityState', 'get')
    visibility.mockReturnValue('hidden')
    const hidden = await mountSuspended(EventRounds, { props: props([round('r1', halo)]) })
    expect(String(hidden.findComponent({ name: 'TransitionGroup' }).props('moveClass') ?? '')).not.toContain('transition-transform')
    hidden.unmount()

    visibility.mockReturnValue('visible')
    const shown = await mountSuspended(EventRounds, { props: props([round('r1', halo)]) })
    expect(String(shown.findComponent({ name: 'TransitionGroup' }).props('moveClass'))).toContain('transition-transform')
  })

  it('pins the leaving card where it is, out of the flow, in the render that starts its fade; the card that stays is untouched', async () => {
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(320)
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(96)
    vi.spyOn(HTMLElement.prototype, 'offsetTop', 'get').mockReturnValue(108)
    const list = await mountSuspended(EventRounds, { props: props([round('r1', halo), round('r2', kart)]), ...realGroup })
    expect(list.get('ul').classes()).toContain('relative')

    await list.setProps(props([round('r2', kart)]))

    const leaver = cards(list).find((card: Wrapper) => card.text().includes('Halo'))!
    expect(leaver.attributes('style')).toContain('position: absolute')
    expect(leaver.attributes('style')).toContain('width: 320px')
    expect(leaver.attributes('style')).toContain('height: 96px')
    expect(leaver.attributes('style')).toContain('top: 108px')
    expect(leaver.attributes('inert')).toBeDefined()
    expect(cards(list).find((card: Wrapper) => card.text().includes('Kart'))!.attributes('style')).toBeUndefined()
    list.unmount()
  })

  // The edges (CODING_STANDARDS § Tests): no Round, one (the last card: the section goes with it), two and four.
  it.each([0, 1, 2, 4])('with %i open Rounds: the section is there for some, and when one goes the others stay in the flow', async (count) => {
    const games = [halo, kart, pong, { ...halo, id: 'g-x', name: 'Xonix' }]
    const open = games.slice(0, count).map((game, index) => round(`r${index}`, game))
    const list = await mountSuspended(EventRounds, { props: props(open), ...realGroup })

    expect(cards(list)).toHaveLength(count)
    expect(list.find('section').exists()).toBe(count > 0)

    await list.setProps(props(open.slice(1)))

    expect(list.find('section').exists()).toBe(count > 1)
    if (count > 1) expect(cards(list).filter((card: Wrapper) => card.attributes('inert') === undefined)).toHaveLength(count - 1)
    list.unmount()
  })
})

describe('entering a Result (#273)', () => {
  const pair: BoardTeam[] = [{ position: 1, name: 'Wilde Gurken', frozen: true }, { position: 2, name: null, frozen: false }]
  const enterButtons = (stage: Awaited<ReturnType<typeof mount>>) => stage.get('[aria-label="Offene Spiele"]').findAll('button').filter((button: Wrapper) => button.text() === 'Ergebnis eintragen')
  const HOST_ENTERS = 'Das Ergebnis trägt der Host ein'

  it('gives the Host „Ergebnis eintragen“ on every open Round, next to „Zurücklegen“, and no line about the Host', async () => {
    const { slug } = serveRunning({ host: true, teams: pair, rounds: [round('r1', halo), round('r2', kart)] })

    const stage = await mount(slug)

    expect(enterButtons(stage)).toHaveLength(2)
    const list = stage.get('[aria-label="Offene Spiele"]')
    expect(list.text()).not.toContain(HOST_ENTERS)
    expect(list.text().match(/Zurücklegen/g)).toHaveLength(2)
  })

  it('tells everyone but the Host under each open Round that the Host enters the Result, with no button', async () => {
    const { slug } = serveRunning({ host: false, teams: pair, rounds: [round('r1', halo), round('r2', kart)] })

    const stage = await mount(slug)

    const list = stage.get('[aria-label="Offene Spiele"]')
    for (const card of list.findAll('li')) expect(card.text()).toContain(HOST_ENTERS)
    expect(list.text()).not.toContain('Ergebnis eintragen')
  })

  it('offers the Host no button while there is no Points table to preview', async () => {
    const rounds = await mountSuspended(EventRounds, { props: { rounds: [round('r1', halo)], isHost: true, putBack: () => Promise.resolve(true), teams: pair, pointsTable: null, enterResult: () => Promise.resolve(true), end: null } })

    expect(rounds.text()).toContain('Zurücklegen')
    expect(rounds.text()).not.toContain('Ergebnis eintragen')
    rounds.unmount()
  })

  it('opens the sheet for the Round whose button was pressed, with the game\'s name above the rows', async () => {
    const { slug } = serveRunning({ host: true, teams: pair, rounds: [round('r1', halo), round('r2', kart)] })
    const stage = await mount(slug)

    await enterButtons(stage)[1]!.trigger('click')

    await vi.waitFor(() => expect(dialog()).not.toBeNull())
    expect(dialog()!.querySelector('h2')?.textContent).toBe('Ergebnis eintragen')
    expect(dialog()!.textContent).toContain('Kart')
    expect([...dialog()!.querySelectorAll('[data-name]')].map(name => name.textContent)).toEqual(['Wilde Gurken', 'Team Orange'])
  })

  describe('the sheet\'s kicker (#274)', () => {
    const kicker = () => [...dialog()!.querySelectorAll('p')].find(line => /^Spiel \d+ von \d+$/.test(line.textContent?.trim() ?? ''))?.textContent?.trim()

    it('is „Spiel {played + 1} von {gameCount}“: the Round being scored gets the next number', async () => {
      const { slug } = serveRunning({ host: true, teams: pair, rounds: [round('r1', halo)], end: { played: 2, gameCount: 6, complete: false, tie: null, finish: null, lastGame: null } })
      const stage = await mount(slug)

      await enterButtons(stage)[0]!.trigger('click')

      await vi.waitFor(() => expect(dialog()).not.toBeNull())
      expect(kicker()).toBe('Spiel 3 von 6')
    })

    it('moves up when another Result arrives while the sheet is open, and keeps the draft', async () => {
      const rounds = await mountSuspended(EventRounds, { props: { rounds: [round('r1', halo)], isHost: true, putBack: () => Promise.resolve(true), teams: pair, pointsTable: defaultSettings().pointsTable, enterResult: () => Promise.resolve(true), end: { played: 0, gameCount: 6, complete: false, tie: null, finish: null, lastGame: null } } })
      await [...rounds.findAll('button')].find((button: Wrapper) => button.text() === 'Ergebnis eintragen')!.trigger('click')
      await vi.waitFor(() => expect(dialog()).not.toBeNull())
      expect(kicker()).toBe('Spiel 1 von 6')
      dialog()!.querySelector<HTMLButtonElement>('button[aria-label="Nach unten: Wilde Gurken"]')!.click()
      await flushPromises()

      await rounds.setProps({ end: { played: 1, gameCount: 6, complete: false, tie: null, finish: null, lastGame: null } })

      expect(kicker()).toBe('Spiel 2 von 6')
      expect([...dialog()!.querySelectorAll('[data-name]')].map(name => name.textContent)).toEqual(['Team Orange', 'Wilde Gurken'])
      rounds.unmount()
    })

    it('is absent while the Event read has no end', async () => {
      const { slug } = serveRunning({ host: true, teams: pair, rounds: [round('r1', halo)], end: null })
      const stage = await mount(slug)

      await enterButtons(stage)[0]!.trigger('click')

      await vi.waitFor(() => expect(dialog()).not.toBeNull())
      expect(kicker()).toBeUndefined()
    })
  })

  describe('saving', () => {
    let puts: unknown[]

    beforeEach(() => {
      puts = []
    })

    /** A Host's Event with these open Rounds; the PUT for r1 runs `onPut` (which may throw a refusal) and answers like the server. */
    function serveSaving(rounds: RoundView[], onPut: (served: ReturnType<typeof serveRunning>) => void = () => undefined) {
      const served = serveRunning({ host: true, teams: pair, rounds })
      registerEndpoint(`/api/e/${served.slug}/rounds/r1/result`, { method: 'PUT', handler: async (event) => {
        puts.push(await readBody(event))
        onPut(served)
        return { roundId: 'r1', number: 1 }
      } })
      return served
    }

    async function openFirst(stage: Awaited<ReturnType<typeof mount>>) {
      await enterButtons(stage)[0]!.trigger('click')
      await vi.waitFor(() => expect(dialog()).not.toBeNull())
    }

    it('sends PUT rounds/:id/result with the Places and closes the sheet when the server took it', async () => {
      const served = serveSaving([round('r1', halo)])
      const stage = await mount(served.slug)
      await openFirst(stage)
      dialog()!.querySelector<HTMLButtonElement>('button[aria-label="Nach unten: Wilde Gurken"]')!.click()
      await flushPromises()

      await clickButton(dialog(), 'Ergebnis speichern')

      await vi.waitFor(() => expect(puts).toEqual([{ places: [{ team: 2, place: 1, score: null }, { team: 1, place: 2, score: null }] }]))
      await vi.waitFor(() => expect(dialog()).toBeNull())
    })

    it('keeps the sheet open with the refusal as a toast while the Round is still open', async () => {
      const served = serveSaving([round('r1', halo)], () => {
        throw createError({ statusCode: 409, statusMessage: 'round_not_open' })
      })
      const stage = await mount(served.slug)
      await openFirst(stage)

      await clickButton(dialog(), 'Ergebnis speichern')

      await vi.waitFor(() => expect(shownToasts().map(toast => toast.text)).toEqual(['Zu diesem Spiel kann gerade kein Ergebnis eingetragen werden. Vielleicht hat es schon eins.']))
      expect(dialog()).not.toBeNull()
      expect(puts).toHaveLength(1)
    })

    it('closes the sheet when its Round leaves the open Rounds, after a refusal that refetched the Event', async () => {
      const served = serveSaving([round('r1', halo), round('r2', kart)], (current) => {
        current.set(viewWithSessions(current.slug, [{ number: null, startsAt: FIRST, startedAt: STARTED }], 0, {
          event: { isHost: true, phase: 'running' },
          settings: defaultSettings(),
          runningSessionId: `session-${current.slug}-0`,
          rounds: [round('r2', kart)],
          teams: pair,
          pools,
        }))
        throw createError({ statusCode: 409, statusMessage: 'round_not_open' })
      })
      const stage = await mount(served.slug)
      await openFirst(stage)

      await clickButton(dialog(), 'Ergebnis speichern')

      await vi.waitFor(() => expect(dialog()).toBeNull())
      expect(enterButtons(stage)).toHaveLength(1)
      expect(shownToasts()).toHaveLength(1)
    })

    // The save removes the Round whose card opened the sheet, so focus has nowhere to return to (#274, Q3 of the Release review): it goes on to the
    // next open Round's „Ergebnis eintragen“, and without one to the stage's heading. Never to the body, where a keyboard or screen-reader Host starts over.
    describe('focus', () => {
      /** The Event as the next read has it: the saved Round gone from the open Rounds. */
      const without = (rest: RoundView[]) => (current: ReturnType<typeof serveRunning>) => current.set(viewWithSessions(current.slug, [{ number: null, startsAt: FIRST, startedAt: STARTED }], 0, {
        event: { isHost: true, phase: 'running' },
        settings: defaultSettings(),
        runningSessionId: `session-${current.slug}-0`,
        rounds: rest,
        teams: pair,
        pools,
      }))

      /** Presses the button of the Round the way a Host does: it has the focus, and the sheet opens from it. */
      async function pressEnter(stage: Awaited<ReturnType<typeof mount>>, game: string) {
        const card = stage.findAll('[aria-label="Offene Spiele"] > li').find((item: Wrapper) => item.text().includes(game))!
        const button = card.findAll('button').find((item: Wrapper) => item.text() === 'Ergebnis eintragen')!
        ;(button.element as HTMLElement).focus()
        await button.trigger('click')
        await vi.waitFor(() => expect(dialog()).not.toBeNull())
      }

      it('goes to the heading of the stage after the last open Round\'s Result is saved', async () => {
        const served = serveSaving([round('r1', halo)], without([]))
        const stage = await mount(served.slug, document.body)
        await pressEnter(stage, 'Halo')

        await clickButton(dialog(), 'Ergebnis speichern')

        await vi.waitFor(() => expect(dialog()).toBeNull())
        await vi.waitFor(() => expect(document.activeElement).toBe(stage.get('h1').element))
        expect(stage.find('[aria-label="Offene Spiele"]').exists()).toBe(false)
      })

      it('goes to the other Round\'s „Ergebnis eintragen“ after one of two is saved', async () => {
        const served = serveSaving([round('r1', halo), round('r2', kart)], without([round('r2', kart)]))
        const stage = await mount(served.slug, document.body)
        await pressEnter(stage, 'Halo')

        await clickButton(dialog(), 'Ergebnis speichern')

        await vi.waitFor(() => expect(dialog()).toBeNull())
        const other = stage.findAll('[aria-label="Offene Spiele"] > li').find((item: Wrapper) => item.text().includes('Kart'))!
        await vi.waitFor(() => expect(document.activeElement).toBe(other.findAll('button').find((item: Wrapper) => item.text() === 'Ergebnis eintragen')!.element))
        expect(document.activeElement).not.toBe(document.body)
      })

      it('goes to the next Round in the list, not the first, when a middle one is saved', async () => {
        const third = round('r3', pong)
        const served = serveSaving([round('r1', halo), round('r2', kart), third], without([round('r1', halo), third]))
        // The PUT in `serveSaving` is for r1: the middle Round's own endpoint.
        registerEndpoint(`/api/e/${served.slug}/rounds/r2/result`, { method: 'PUT', handler: () => {
          without([round('r1', halo), third])(served)
          return { roundId: 'r2', number: 1 }
        } })
        const stage = await mount(served.slug, document.body)
        await pressEnter(stage, 'Kart')

        await clickButton(dialog(), 'Ergebnis speichern')

        await vi.waitFor(() => expect(dialog()).toBeNull())
        const next = stage.findAll('[aria-label="Offene Spiele"] > li').find((item: Wrapper) => item.text().includes('Pong'))!
        await vi.waitFor(() => expect(document.activeElement).toBe(next.findAll('button').find((item: Wrapper) => item.text() === 'Ergebnis eintragen')!.element))
      })

      it('stays where Escape put it: back on the Round\'s own button, which is still there', async () => {
        const served = serveSaving([round('r1', halo), round('r2', kart)])
        const stage = await mount(served.slug, document.body)
        await pressEnter(stage, 'Kart')
        const button = stage.findAll('[aria-label="Offene Spiele"] > li').find((item: Wrapper) => item.text().includes('Kart'))!.findAll('button').find((item: Wrapper) => item.text() === 'Ergebnis eintragen')!

        dialog()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))

        await vi.waitFor(() => expect(dialog()).toBeNull())
        await flushPromises()
        expect(document.activeElement).toBe(button.element)
      })
    })
  })
})

describe('„Nächstes Spiel setzen“', () => {
  let posted: unknown[]

  beforeEach(() => {
    posted = []
  })

  function serveHostPick(setGame: SetGameView) {
    const served = serveRunning({ host: true, setGame })
    registerEndpoint(`/api/e/${served.slug}/rounds`, { method: 'POST', handler: async (event) => {
      posted.push(await readBody(event))
      return { roundId: 'r-new' }
    } })
    return served
  }

  it('is disabled with its reason while the rule refuses, and answers a click with that reason and no sheet', async () => {
    const { slug } = serveHostPick({ rejection: 'teams_uneven', spinRejection: 'no_wheel', respin: false, left: [], poolWarning: null })
    const stage = await mount(slug)

    const action = stage.findAll('[role="toolbar"] button')[0]!
    expect(action.text()).toBe('Nächstes Spiel setzen')
    expect(action.attributes('aria-disabled')).toBe('true')
    expect(stage.get(`#${action.attributes('aria-describedby')}`).text()).toBe('Geht erst, wenn alle Teams gleich groß sind.')

    await clickHostAction(stage, 'Nächstes Spiel setzen')

    expect(shownToasts().map(toast => toast.text)).toEqual(['Geht erst, wenn alle Teams gleich groß sind.'])
    expect(dialog()).toBeNull()
  })

  it.each([
    ['game_count_reached', 'Alle Spiele dieses Events sind schon gestartet.'],
    ['round_being_drawn', 'Gerade wird ein Spiel gezogen.'],
  ] as const)('says %s in words', async (rejection, text) => {
    const { slug } = serveHostPick({ rejection, spinRejection: 'no_wheel', respin: false, left: [], poolWarning: null })
    const stage = await mount(slug)

    const action = stage.findAll('[role="toolbar"] button')[0]!
    expect(stage.get(`#${action.attributes('aria-describedby')}`).text()).toBe(text)
  })

  it('opens a sheet that lists the games left in the Game pool first, then the library', async () => {
    registerEndpoint('/api/games', { method: 'GET', handler: () => ({ games: [kart, schach] }) })
    signInAs({ ...kitty, canHost: true })
    const { slug } = serveHostPick({ rejection: null, spinRejection: 'no_wheel', respin: false, left: [halo.id, pong.id], poolWarning: null })
    const stage = await mount(slug)

    await clickHostAction(stage, 'Nächstes Spiel setzen')

    await vi.waitFor(() => expect(dialog()).not.toBeNull())
    const sheet = dialog()!
    expect(sheet.querySelector('h2')?.textContent).toBe('Nächstes Spiel setzen')
    const headings = [...sheet.querySelectorAll('h3')].map(heading => heading.textContent?.trim())
    expect(headings).toEqual(['Aus dem Pool: noch 2', 'Oder aus der ganzen Bibliothek'])
    // Kart was drawn already, so the pool list holds Halo and Pong only; the library below lists every game.
    const poolList = sheet.querySelector('ul[aria-label="Spiele, die im Pool noch übrig sind"]')!
    expect([...poolList.querySelectorAll('li')].map(item => item.textContent)).toEqual([expect.stringContaining('Halo'), expect.stringContaining('Pong')])
    await vi.waitFor(() => expect(sheet.querySelector('ul[aria-label="Bibliothek"]')?.textContent).toContain('Schach'))
    const order = [...sheet.querySelectorAll('h3, ul[aria-label="Bibliothek"]')].map(element => element.tagName === 'H3' ? element.textContent?.trim() : 'Bibliothek')
    expect(order).toEqual(['Aus dem Pool: noch 2', 'Oder aus der ganzen Bibliothek', 'Bibliothek'])
  })

  it('sets the chosen game from the bar and closes once the server took it', async () => {
    registerEndpoint('/api/games', { method: 'GET', handler: () => ({ games: [kart, schach] }) })
    signInAs({ ...kitty, canHost: true })
    const { slug } = serveHostPick({ rejection: null, spinRejection: 'no_wheel', respin: false, left: [halo.id, pong.id], poolWarning: null })
    const stage = await mount(slug)
    await clickHostAction(stage, 'Nächstes Spiel setzen')
    await vi.waitFor(() => expect(dialog()).not.toBeNull())

    const set = [...dialog()!.querySelectorAll('button')].find(button => button.textContent?.trim() === 'Setzen')!
    expect(set.disabled).toBe(true)
    expect(dialog()!.textContent).toContain('Such dir ein Spiel aus.')

    dialog()!.querySelector<HTMLButtonElement>('button[aria-label="Pong auswählen"]')!.click()
    await flushPromises()
    expect(dialog()!.querySelector('button[aria-label="Pong ist ausgewählt"]')?.getAttribute('aria-pressed')).toBe('true')
    expect(dialog()!.textContent).toContain('Alle sehen es sofort.')
    await clickButton(dialog(), 'Setzen')

    await vi.waitFor(() => expect(posted).toEqual([{ gameId: pong.id, vetoAllowed: false }]))
    await vi.waitFor(() => expect(dialog()).toBeNull())
  })

  it('has no Veto switch under Host pick (#232)', async () => {
    const { slug } = serveHostPick({ rejection: null, spinRejection: 'no_wheel', respin: false, left: [halo.id], poolWarning: null })
    const stage = await mount(slug)

    await clickHostAction(stage, 'Nächstes Spiel setzen')

    await vi.waitFor(() => expect(dialog()).not.toBeNull())
    expect(dialog()!.querySelector('button[role="switch"]')).toBeNull()
  })

  it('sets the game with the Veto allowed when the Host switches „Veto erlauben“ on in the Lucky Wheel (#232)', async () => {
    const served = serve(slug => viewWithSessions(slug, [{ number: null, startsAt: FIRST, startedAt: STARTED }], 0, {
      event: { isHost: true, phase: 'running' },
      settings: { ...defaultSettings(), selectionMode: 'lucky_wheel' },
      runningSessionId: `session-${slug}-0`,
      pools,
      setGame: { rejection: null, spinRejection: null, respin: false, left: [halo.id, pong.id], poolWarning: null },
    }))
    registerEndpoint(`/api/e/${served.slug}/rounds`, { method: 'POST', handler: async (event) => {
      posted.push(await readBody(event))
      return { roundId: 'r-new' }
    } })
    const stage = await mount(served.slug)
    await clickHostAction(stage, 'Nächstes Spiel setzen')
    await vi.waitFor(() => expect(dialog()).not.toBeNull())

    const toggle = dialog()!.querySelector<HTMLButtonElement>('button[role="switch"]')!
    expect(toggle.getAttribute('aria-checked')).toBe('false')
    toggle.click()
    await flushPromises()
    dialog()!.querySelector<HTMLButtonElement>('button[aria-label="Pong auswählen"]')!.click()
    await flushPromises()
    await clickButton(dialog(), 'Setzen')

    await vi.waitFor(() => expect(posted).toEqual([{ gameId: pong.id, vetoAllowed: true }]))
  })

  it('can pick a game of the library that is not in the pool', async () => {
    registerEndpoint('/api/games', { method: 'GET', handler: () => ({ games: [kart, schach] }) })
    signInAs({ ...kitty, canHost: true })
    const { slug } = serveHostPick({ rejection: null, spinRejection: 'no_wheel', respin: false, left: [halo.id], poolWarning: null })
    const stage = await mount(slug)
    await clickHostAction(stage, 'Nächstes Spiel setzen')
    await vi.waitFor(() => expect(dialog()?.querySelector('ul[aria-label="Bibliothek"]')).not.toBeNull())

    dialog()!.querySelector<HTMLButtonElement>('ul[aria-label="Bibliothek"] button[aria-label="Schach auswählen"]')!.click()
    await flushPromises()
    await clickButton(dialog(), 'Setzen')

    await vi.waitFor(() => expect(posted).toEqual([{ gameId: schach.id, vetoAllowed: false }]))
  })

  it('offers the pool only to a Host without the library permission', async () => {
    const { slug } = serveHostPick({ rejection: null, spinRejection: 'no_wheel', respin: false, left: [halo.id], poolWarning: null })
    const stage = await mount(slug)

    await clickHostAction(stage, 'Nächstes Spiel setzen')

    await vi.waitFor(() => expect(dialog()).not.toBeNull())
    expect([...dialog()!.querySelectorAll('h3')].map(heading => heading.textContent?.trim())).toEqual(['Aus dem Pool: noch 1'])
  })

  it('says so when the pool has nothing left, and still offers the library', async () => {
    registerEndpoint('/api/games', { method: 'GET', handler: () => ({ games: [schach] }) })
    signInAs({ ...kitty, canHost: true })
    const { slug } = serveHostPick({ rejection: null, spinRejection: 'no_wheel', respin: false, left: [], poolWarning: null })
    const stage = await mount(slug)

    await clickHostAction(stage, 'Nächstes Spiel setzen')

    await vi.waitFor(() => expect(dialog()).not.toBeNull())
    expect(dialog()!.textContent).toContain('Im Pool ist nichts mehr übrig.')
    expect(dialog()!.textContent).toContain('Oder aus der ganzen Bibliothek')
  })

  it('has no such action for a Member', async () => {
    const { slug } = serveRunning({ host: false })
    const stage = await mount(slug)

    expect(stage.find('[role="toolbar"]').exists()).toBe(false)
    expect(pill(stage)).toEqual([])
  })
})

describe('the Lucky Wheel on the stage (#229)', () => {
  const wheelSettings = { ...defaultSettings(), selectionMode: 'lucky_wheel', vetoAllowance: 3 } as const
  const wheel = { count: 2, slices: [{ id: halo.id, name: 'Halo' }, { id: pong.id, name: 'Pong' }], spin: null, vetoes: { left: [3, 3], own: null, revealed: null, draw: null } }
  let posted: number

  beforeEach(() => {
    posted = 0
  })

  function serveWheel({ host, setGame, rounds = [] }: { host: boolean, setGame?: SetGameView, rounds?: RoundView[] }) {
    const served = serve(slug => viewWithSessions(slug, [{ number: null, startsAt: FIRST, startedAt: STARTED }], 0, {
      event: { isHost: host, phase: 'running' },
      settings: wheelSettings,
      runningSessionId: `session-${slug}-0`,
      rounds,
      setGame,
      wheel,
      pools: host ? pools : null,
    }))
    registerEndpoint(`/api/e/${served.slug}/rounds/spin`, { method: 'POST', handler: () => {
      posted += 1
      return { roundId: 'r-new', drawId: 'd-new' }
    } })
    return served
  }

  it('shows the wheel with its games on top of the open Rounds, to a Member too', async () => {
    const { slug } = serveWheel({ host: false, rounds: [round('r1', kart)] })

    const stage = await mount(slug)

    expect(regionHeadings(stage)).toEqual(['Glücksrad', 'Gerade dran', 'Spielbrett', 'Sessions', 'So wird gespielt'])
    expect(stage.get('[role="img"][aria-label="Glücksrad mit 2 Spielen"]').text()).toContain('Halo')
  })

  it('has no wheel under Host pick', async () => {
    const { slug } = serveRunning({ host: false })

    const stage = await mount(slug)

    expect(regionHeadings(stage)).not.toContain('Glücksrad')
  })

  it('makes Rad drehen the Host\'s primary with Session beenden beside it, and spins on a click', async () => {
    const { slug } = serveWheel({ host: true, setGame: { rejection: null, spinRejection: null, respin: false, left: [halo.id, pong.id], poolWarning: null } })
    const stage = await mount(slug)

    expect(pill(stage).slice(0, 2)).toEqual([expect.stringContaining('Rad drehen'), expect.stringContaining('Session beenden')])
    await clickHostAction(stage, 'Rad drehen')

    await vi.waitFor(() => expect(posted).toBe(1))
  })

  it('looks disabled with the reason while the wheel cannot be spun, and spins nothing on a click', async () => {
    const { slug } = serveWheel({ host: true, setGame: { rejection: null, spinRejection: 'pool_empty', respin: false, left: [], poolWarning: null } })
    const stage = await mount(slug)

    const action = stage.findAll('[role="toolbar"] button')[0]!
    expect(action.text()).toBe('Rad drehen')
    expect(action.attributes('aria-disabled')).toBe('true')
    expect(stage.get(`#${action.attributes('aria-describedby')}`).text()).toBe('Auf dem Rad ist kein Spiel mehr. Mit „Nächstes Spiel setzen“ kannst du eines aus der Bibliothek setzen.')

    await clickHostAction(stage, 'Rad drehen')

    expect(shownToasts().map(toast => toast.text)).toEqual(['Auf dem Rad ist kein Spiel mehr. Mit „Nächstes Spiel setzen“ kannst du eines aus der Bibliothek setzen.'])
    expect(posted).toBe(0)
  })

  it('keeps Nächstes Spiel setzen in Mehr', async () => {
    const { slug } = serveWheel({ host: true, setGame: { rejection: null, spinRejection: null, respin: false, left: [halo.id], poolWarning: null } })
    const stage = await mount(slug)

    expect(pill(stage)).not.toContain('Nächstes Spiel setzen')
    const item = await hostActionElement(stage, 'Nächstes Spiel setzen')

    expect(item.getAttribute('role')).toBe('menuitem')
  })
})
