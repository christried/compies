import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { readBody } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import EventRounds from '~/components/EventRounds.vue'
import EventPage from '~/pages/e/[slug]/index.vue'
import type { EventPools, RoundView, SetGameView } from '~~/shared/event'
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

const pools: EventPools = { main: [halo, kart, pong], tiebreaker: [] }
const pill = (page: Mounted) => [...page.element.querySelectorAll('[role="toolbar"] button')].map(button => button.textContent?.replace(/\s+/g, ' ').trim())

type Options = { host: boolean, rounds?: RoundView[], setGame?: SetGameView | null, sessions?: Parameters<typeof viewWithSessions>[1], phase?: string }

/** A running Event, set up for Host pick: the Host's or a Member's read of it, with these open Rounds. */
function serveRunning({ host, rounds = [], setGame, sessions, phase = 'running' }: Options) {
  return serve(slug => viewWithSessions(slug, sessions ?? [{ number: null, startsAt: FIRST, startedAt: STARTED }], 0, {
    event: { isHost: host, phase },
    settings: defaultSettings(),
    runningSessionId: sessions ? undefined : `session-${slug}-0`,
    rounds,
    setGame,
    pools: host ? pools : null,
  }))
}

let page: Awaited<ReturnType<typeof mountSuspended>> | undefined
async function mount(slug: string) {
  page = await mountSuspended(EventPage, { route: `/e/${slug}` })
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

  it('shows no Rounds between two Sessions: they wait for the next one', async () => {
    const { slug } = serveRunning({
      host: false,
      rounds: [round('r1', halo)],
      sessions: [{ number: 1, startsAt: FIRST, startedAt: STARTED, endedAt: ENDED }, { number: 2, startsAt: '2026-10-31T19:00:00.000Z' }],
    })

    const stage = await mount(slug)

    expect(regionHeadings(stage)).not.toContain('Gerade dran')
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
    const rounds = await mountSuspended(EventRounds, { props: { rounds: [round('r1', halo)], isHost: false, putBack: () => Promise.resolve(true) } })

    const list = rounds.findComponent({ name: 'TransitionGroup' })
    expect(list.exists()).toBe(true)
    // The classes are the theme's: animate-enter is cp-fade-in over --cp-dur-base (220 ms) with --cp-ease-out; dur-fast is 140 ms.
    expect(list.props('enterActiveClass')).toBe('animate-enter')
    expect(list.props('leaveActiveClass')).toBe('transition-opacity dur-fast ease-in')
    expect(list.props('leaveToClass')).toBe('opacity-0')
    rounds.unmount()
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
    const { slug } = serveHostPick({ rejection: 'teams_uneven', spinRejection: 'no_wheel', left: [] })
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
    const { slug } = serveHostPick({ rejection, spinRejection: 'no_wheel', left: [] })
    const stage = await mount(slug)

    const action = stage.findAll('[role="toolbar"] button')[0]!
    expect(stage.get(`#${action.attributes('aria-describedby')}`).text()).toBe(text)
  })

  it('opens a sheet that lists the games left in the Game pool first, then the library', async () => {
    registerEndpoint('/api/games', { method: 'GET', handler: () => ({ games: [kart, schach] }) })
    signInAs({ ...kitty, canHost: true })
    const { slug } = serveHostPick({ rejection: null, spinRejection: 'no_wheel', left: [halo.id, pong.id] })
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
    const { slug } = serveHostPick({ rejection: null, spinRejection: 'no_wheel', left: [halo.id, pong.id] })
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

    await vi.waitFor(() => expect(posted).toEqual([{ gameId: pong.id }]))
    await vi.waitFor(() => expect(dialog()).toBeNull())
  })

  it('can pick a game of the library that is not in the pool', async () => {
    registerEndpoint('/api/games', { method: 'GET', handler: () => ({ games: [kart, schach] }) })
    signInAs({ ...kitty, canHost: true })
    const { slug } = serveHostPick({ rejection: null, spinRejection: 'no_wheel', left: [halo.id] })
    const stage = await mount(slug)
    await clickHostAction(stage, 'Nächstes Spiel setzen')
    await vi.waitFor(() => expect(dialog()?.querySelector('ul[aria-label="Bibliothek"]')).not.toBeNull())

    dialog()!.querySelector<HTMLButtonElement>('ul[aria-label="Bibliothek"] button[aria-label="Schach auswählen"]')!.click()
    await flushPromises()
    await clickButton(dialog(), 'Setzen')

    await vi.waitFor(() => expect(posted).toEqual([{ gameId: schach.id }]))
  })

  it('offers the pool only to a Host without the library permission', async () => {
    const { slug } = serveHostPick({ rejection: null, spinRejection: 'no_wheel', left: [halo.id] })
    const stage = await mount(slug)

    await clickHostAction(stage, 'Nächstes Spiel setzen')

    await vi.waitFor(() => expect(dialog()).not.toBeNull())
    expect([...dialog()!.querySelectorAll('h3')].map(heading => heading.textContent?.trim())).toEqual(['Aus dem Pool: noch 1'])
  })

  it('says so when the pool has nothing left, and still offers the library', async () => {
    registerEndpoint('/api/games', { method: 'GET', handler: () => ({ games: [schach] }) })
    signInAs({ ...kitty, canHost: true })
    const { slug } = serveHostPick({ rejection: null, spinRejection: 'no_wheel', left: [] })
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
  const wheel = { count: 2, slices: [{ id: halo.id, name: 'Halo' }, { id: pong.id, name: 'Pong' }], spin: null }
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
    const { slug } = serveWheel({ host: true, setGame: { rejection: null, spinRejection: null, left: [halo.id, pong.id] } })
    const stage = await mount(slug)

    expect(pill(stage).slice(0, 2)).toEqual([expect.stringContaining('Rad drehen'), expect.stringContaining('Session beenden')])
    await clickHostAction(stage, 'Rad drehen')

    await vi.waitFor(() => expect(posted).toBe(1))
  })

  it('looks disabled with the reason while the wheel cannot be spun, and spins nothing on a click', async () => {
    const { slug } = serveWheel({ host: true, setGame: { rejection: null, spinRejection: 'pool_empty', left: [] } })
    const stage = await mount(slug)

    const action = stage.findAll('[role="toolbar"] button')[0]!
    expect(action.text()).toBe('Rad drehen')
    expect(action.attributes('aria-disabled')).toBe('true')
    expect(stage.get(`#${action.attributes('aria-describedby')}`).text()).toBe('Auf dem Rad ist kein Spiel mehr.')

    await clickHostAction(stage, 'Rad drehen')

    expect(shownToasts().map(toast => toast.text)).toEqual(['Auf dem Rad ist kein Spiel mehr.'])
    expect(posted).toBe(0)
  })

  it('keeps Nächstes Spiel setzen in Mehr', async () => {
    const { slug } = serveWheel({ host: true, setGame: { rejection: null, spinRejection: null, left: [halo.id] } })
    const stage = await mount(slug)

    expect(pill(stage)).not.toContain('Nächstes Spiel setzen')
    const item = await hostActionElement(stage, 'Nächstes Spiel setzen')

    expect(item.getAttribute('role')).toBe('menuitem')
  })
})
