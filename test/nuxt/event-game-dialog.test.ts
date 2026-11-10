import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import EventPage from '~/pages/e/[slug]/index.vue'
import type { PoolGame, RoundGame } from '~~/shared/game'
import type { RoundView, SpinView, WheelView } from '~~/shared/stage'
import { defaultSettings } from '~~/shared/settings'
import { kitty, signInAs } from './auth'
import { serve, viewWithSessions } from './event-page'

// The game dialog on the Event page, through the whole page (#443, #444): the Spielepool in „So wird gespielt“, „Zuletzt gezogen“ under the wheel
// and „Gerade dran“, with the props threaded through EventStage and StageWheel. A Member's tiles open the same dialog without Tags and Notes (#444).

const STARTED = '2026-10-30T19:30:00.000Z'
const STOP = '2026-10-30T19:45:10.000Z'
const iso = (ms: number) => new Date(ms).toISOString()

const PRICE = { cents: 1999, source: 'steam' as const, checkedAt: '2026-11-03T10:00:00.000Z' }
const base: PoolGame = { id: 'g-halo', name: 'Halo', imageUrl: null, youtubeId: null, clipStart: 0, clipLength: 30, playersMin: 2, playersMax: 4, suitabilities: ['teams'], notes: 'Hausregel: keine Raketen', price: null }
const pong: PoolGame = { ...base, id: 'g-pong', name: 'Pong', notes: null }
const kart: PoolGame = { ...base, id: 'g-kart', name: 'Kart', notes: 'Kart-Notizen', price: PRICE }
// A game set from the library: it is in no pool.
const schach: PoolGame = { ...base, id: 'g-schach', name: 'Schach', notes: 'Schach-Notizen' }
const pool = [base, pong, kart]

const roundGame = (game: PoolGame): RoundGame => {
  const { notes: _notes, ...shown } = game
  return shown
}
const round = (id: string, game: PoolGame, notes?: string): RoundView => ({ id, startedAt: STARTED, setAt: STARTED, game: roundGame(game), ...(notes ? { notes } : {}) })

// The Tags and Notes the Host's read carries for every game its tiles show: the pool, the open Rounds and the spin.
const hostGames = {
  'g-halo': { tags: [{ key: 'koop', label: 'Koop-Halo' }], notes: base.notes },
  'g-pong': { tags: [{ key: 'retro', label: 'Retro-Pong' }], notes: null },
  'g-kart': { tags: [{ key: 'rennen', label: 'Rennen-Kart' }], notes: kart.notes },
  'g-schach': { tags: [{ key: 'denken', label: 'Denken-Schach' }], notes: schach.notes },
}

const spin: SpinView = {
  roundId: 'r-spin', drawId: 'd1', spinStartAt: iso(Date.parse(STOP) - 6000), stopAt: STOP, slices: 3, resultIndex: 0, resultOffset: 0.5,
  labels: null, game: roundGame(kart), current: true,
}
const wheel: WheelView = { count: 2, slices: null, spin, vetoes: { left: [], own: null, revealed: null, draw: null } }

function serveHost(host: boolean) {
  return serve(slug => viewWithSessions(slug, [{ number: null, startsAt: '2026-10-30T19:00:00.000Z', startedAt: STARTED }], 0, {
    event: { isHost: host, phase: 'running' },
    settings: { ...defaultSettings(), selectionMode: 'lucky_wheel', hiddenWheel: false, vetoAllowance: 0 },
    runningSessionId: `session-${slug}-0`,
    // A Member sees the pool tiles only with the preview on: the faces here.
    pool: host ? pool : pool.map(({ id, name, imageUrl, youtubeId, price, playersMin, playersMax, suitabilities }) => ({ id, name, imageUrl, youtubeId, price, playersMin, playersMax, suitabilities })),
    // The Round's own Notes are the Host's: the server leaves them out of a Member's read.
    rounds: host ? [round('r1', base, base.notes!), round('r2', schach, schach.notes!)] : [round('r1', base), round('r2', schach)],
    wheel,
    hostGames: host ? hostGames : null,
  }))
}

let page: Awaited<ReturnType<typeof mountSuspended>> | undefined
async function mount(slug: string) {
  page = await mountSuspended(EventPage, { route: `/e/${slug}`, attachTo: document.body })
  await vi.waitFor(() => expect(sectionOf('Zuletzt gezogen')).not.toBeNull())
  return page
}

/** The block (a `section`) a heading names, or for „Zuletzt gezogen“ the result card inside the wheel's. */
function sectionOf(heading: string): HTMLElement | null {
  if (heading === 'Zuletzt gezogen') return [...document.querySelectorAll<HTMLElement>('p')].find(p => p.textContent?.trim() === heading)?.parentElement ?? null
  const h2 = [...document.querySelectorAll('h2')].find(item => item.textContent?.trim() === heading)
  return h2?.closest('section') ?? null
}
const tileButton = (heading: string, name: string) => [...sectionOf(heading)!.querySelectorAll<HTMLButtonElement>('button[aria-haspopup="dialog"]')].find(button => button.textContent?.trim() === name)
const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]')

beforeEach(() => {
  document.body.innerHTML = ''
})

afterEach(() => {
  page?.unmount()
  page = undefined
})

describe('the Host\'s game dialog on the Event page (#443)', () => {
  beforeEach(() => signInAs({ ...kitty, canHost: true }))

  it('opens from the Spielepool with the game\'s Tags and Notes and the link to its library entry', async () => {
    const { slug } = serveHost(true)
    await mount(slug)

    tileButton('So wird gespielt', 'Pong')!.click()
    await flushPromises()

    expect(dialog()!.querySelector('h2')?.textContent).toBe('Pong')
    expect(dialog()!.textContent).toContain('Retro-Pong')
    expect(dialog()!.textContent).not.toContain('Notizen')
    expect(dialog()!.querySelector('a')?.getAttribute('href')).toBe('/bibliothek/g-pong')
  })

  it('opens from „Zuletzt gezogen“ with the drawn game\'s Tags and Notes', async () => {
    const { slug } = serveHost(true)
    await mount(slug)

    const button = [...sectionOf('Zuletzt gezogen')!.querySelectorAll<HTMLButtonElement>('button[aria-haspopup="dialog"]')][0]!
    expect(button.textContent?.trim()).toBe('Kart')
    button.click()
    await flushPromises()

    expect(dialog()!.querySelector('h2')?.textContent).toBe('Kart')
    expect(dialog()!.textContent).toContain('Rennen-Kart')
    expect(dialog()!.textContent).toContain('Kart-Notizen')
  })

  it('opens from „Gerade dran“ for a pool game and for a game set from the library outside the pool, and keeps the Round\'s Notes open under the tile', async () => {
    const { slug } = serveHost(true)
    await mount(slug)
    const rounds = sectionOf('Gerade dran')!

    tileButton('Gerade dran', 'Halo')!.click()
    await flushPromises()
    expect(dialog()!.querySelector('h2')?.textContent).toBe('Halo')
    expect(dialog()!.textContent).toContain('Koop-Halo')
    expect(dialog()!.textContent).toContain('Hausregel: keine Raketen')
    dialog()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await flushPromises()
    await vi.waitFor(() => expect(dialog()).toBeNull())

    tileButton('Gerade dran', 'Schach')!.click()
    await flushPromises()
    expect(dialog()!.querySelector('h2')?.textContent).toBe('Schach')
    expect(dialog()!.textContent).toContain('Denken-Schach')
    expect(dialog()!.textContent).toContain('Schach-Notizen')
    expect(dialog()!.querySelector('a')?.getAttribute('href')).toBe('/bibliothek/g-schach')
    // The Round's own Notes stay open under its tile, and its buttons stay.
    expect(rounds.textContent).toContain('Hausregel: keine Raketen')
    expect(rounds.textContent).toContain('Ergebnis eintragen')
  })
})

describe('a Member\'s tiles on the Event page open the dialog (#444)', () => {
  beforeEach(() => signInAs(kitty))

  /** What a Member's dialog shows of a game and never shows: the facts, and none of the Tags and Notes the Host's read carries. */
  function expectMemberDialog(name: string) {
    expect(dialog()!.querySelector('h2')?.textContent).toBe(name)
    expect(dialog()!.textContent).toContain('2 bis 4')
    expect(dialog()!.textContent).toContain('Teams')
    for (const hidden of ['Koop-Halo', 'Retro-Pong', 'Rennen-Kart', 'Denken-Schach', 'Hausregel: keine Raketen', 'Kart-Notizen', 'Schach-Notizen', 'Notizen']) expect(dialog()!.textContent).not.toContain(hidden)
    expect(dialog()!.querySelector('a')).toBeNull()
    expect(dialog()!.querySelector('footer')).toBeNull()
  }
  async function close() {
    dialog()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await flushPromises()
    await vi.waitFor(() => expect(dialog()).toBeNull())
  }

  it('opens from the Spielepool with the game\'s players, Suitabilities and Price, and a tap on another tile opens that one', async () => {
    const { slug } = serveHost(false)
    await mount(slug)
    expect(dialog()).toBeNull()

    tileButton('So wird gespielt', 'Kart')!.click()
    await flushPromises()
    expectMemberDialog('Kart')
    expect(dialog()!.textContent).toContain('19,99 €')
    expect(dialog()!.textContent).toContain('Stand')
    await close()

    tileButton('So wird gespielt', 'Pong')!.click()
    await flushPromises()
    expectMemberDialog('Pong')
  })

  it('opens from „Zuletzt gezogen“ with the drawn game\'s facts', async () => {
    const { slug } = serveHost(false)
    await mount(slug)

    const button = [...sectionOf('Zuletzt gezogen')!.querySelectorAll<HTMLButtonElement>('button[aria-haspopup="dialog"]')][0]!
    expect(button.textContent?.trim()).toBe('Kart')
    button.click()
    await flushPromises()

    expectMemberDialog('Kart')
    expect(dialog()!.textContent).toContain('19,99 €')
  })

  it('opens from „Gerade dran“ for a pool game and for a game set from the library outside the pool, with no Host parts on the Round', async () => {
    const { slug } = serveHost(false)
    await mount(slug)
    const rounds = sectionOf('Gerade dran')!

    tileButton('Gerade dran', 'Halo')!.click()
    await flushPromises()
    expectMemberDialog('Halo')
    await close()

    tileButton('Gerade dran', 'Schach')!.click()
    await flushPromises()
    expectMemberDialog('Schach')
    // The Round's Notes and buttons are the Host's: a Member's read has none of them.
    expect(rounds.textContent).not.toContain('Hausregel: keine Raketen')
    expect(rounds.textContent).not.toContain('Ergebnis eintragen')
    expect(rounds.textContent).not.toContain('Zurücklegen')
  })

  it('has no pool tile for a Member who sees no pool, and the Rounds and the drawn game still open', async () => {
    const { slug } = serve(s => viewWithSessions(s, [{ number: null, startsAt: '2026-10-30T19:00:00.000Z', startedAt: STARTED }], 0, {
      event: { isHost: false, phase: 'running' },
      settings: { ...defaultSettings(), selectionMode: 'lucky_wheel', hiddenWheel: true, poolPreview: false, vetoAllowance: 0 },
      runningSessionId: `session-${s}-0`,
      pool: null,
      rounds: [round('r1', base)],
      wheel,
      hostGames: null,
    }))
    await mount(slug)

    expect(sectionOf('So wird gespielt')!.querySelector('[aria-haspopup]')).toBeNull()
    tileButton('Gerade dran', 'Halo')!.click()
    await flushPromises()
    expectMemberDialog('Halo')
  })
})
