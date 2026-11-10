import { registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { refreshEvent } from '~/composables/useEventView'
import type { ActivityEntry, ActivityPage } from '~~/shared/activity'
import { CEREMONY_LEAD_MS, ceremonyTimeline } from '~~/shared/ceremony'
import type { RoundGame } from '~~/shared/game'
import { defaultSettings } from '~~/shared/settings'
import type { CeremonyView, ResultView } from '~~/shared/stage'
import { kitty, signInAs } from './auth'
import { dialog, hostActionElement, regionHeadings, stubScreen, viewWithSessions, serve, type EventOverrides } from './event-page'
import { ENDED, FIRST, members, mount, type Seat, SESSION, STARTED, team, unmountPage } from './event-page-states'
import { motion } from './motion'

// The finished page waits for the Award ceremony (#445, spec #425): until the Host has started it, for every Member, the Host included, the stage has the Head
// without the Winner, a card that says the ceremony is pending and the Sessions cards; the Standings, the Spielverlauf, the row with „Bild teilen“, the Tabelle tab
// (side panel and phone), the party hat and the Winners of the feed wait. Once shown, everything is there, except for a viewer who saw the page pending: for them it
// waits until their run of the first start is over (their end frame, a skip or a close). A page that loads with the ceremony stored shows everything at once.
// Per viewer: the Host, a Player in the winning team, a Member on the Stands.

const halo: RoundGame = { id: 'g-halo', name: 'Halo', imageUrl: null, youtubeId: null, clipStart: 0, clipLength: 30, playersMin: 2, playersMax: 4, suitabilities: [], price: null }
const resultOf = (number: number, winner: number): ResultView => ({
  roundId: `r${number}`,
  number,
  game: { ...halo, id: `g-${number}`, name: `Spiel ${number}` },
  places: [1, 2].sort((a, b) => (a === winner ? -1 : b === winner ? 1 : a - b)).map((position, index) => ({ team: position, place: index + 1, points: index === 0 ? 3 : 0, score: null })),
  corrected: false,
  correctedAt: null,
  resultAt: STARTED,
})
const ENDED_ONE = SESSION(1, FIRST, { startedAt: STARTED, endedAt: ENDED })

/** The read of a finished Event: Wilde Gurken won all three games, or (a Tie) both Parties won the same. */
const finishedRead = (tie: boolean, overrides: EventOverrides = {}): EventOverrides => ({
  teams: [team(1, 'Wilde Gurken'), team(2, 'Nacht Eulen')],
  results: [resultOf(1, 1), resultOf(2, tie ? 2 : 1), resultOf(3, 1)],
  standings: tie ? [{ team: 1, rank: 1, points: 6 }, { team: 2, rank: 1, points: 6 }] : [{ team: 1, rank: 1, points: 9 }, { team: 2, rank: 2, points: 0 }],
  end: { played: 3, gameCount: 3, complete: true, tie: null, finish: null, lastGame: null },
  ...overrides,
})

const VIEWERS: [string, { host: boolean, seat: Seat }][] = [
  ['the Host', { host: true, seat: { zone: 'team', team: 1 } }],
  ['a Player in the winning team', { host: false, seat: { zone: 'team', team: 1 } }],
  ['a Member on the Stands', { host: false, seat: { zone: 'stands' } }],
]

/** The length of the first run for 2 Parties with one Winner (a wide screen's), where the page's layer ends its show. */
const RUN_MS = ceremonyTimeline({ partyCount: 2, winners: 1, gag: 'trip' }).endMs
const startAt = (startsAt: number): CeremonyView => ({ startsAt: new Date(startsAt).toISOString(), endsAt: new Date(startsAt + RUN_MS).toISOString(), gag: 'trip' })
/** A run that is on, and ends `left` ms from now. */
const endingIn = (left: number) => startAt(Date.now() + left - RUN_MS)

interface Setup { host: boolean, seat: Seat, tie?: boolean, shown?: boolean, ceremony?: CeremonyView | null }

/** A finished Event with the viewer (Kitty) seated, its feed with the end of the Event, and `read` for the next read of the page. */
function serveFinished({ host, seat, tie = false, shown = false, ceremony = null }: Setup) {
  const state = { host, seat, tie }
  const served = serve(slug => viewWithSessions(slug, [ENDED_ONE], 0, {
    event: { phase: 'finished', isHost: host },
    settings: defaultSettings(),
    members: members({ kitty: seat }),
    ...finishedRead(tie, { ceremonyShown: shown, ceremony }),
  }))
  const feed: ActivityEntry[] = [{ id: 'finished', at: new Date(Date.now() - 60_000).toISOString(), actor: { id: 'u-sanne', name: 'Sanne' }, people: {}, games: {}, type: 'event_finished', params: { winners: tie ? [1, 2] : [1] } } as ActivityEntry]
  registerEndpoint(`/api/e/${served.slug}/activity`, { method: 'GET', handler: () => ({ entries: feed, next: null }) satisfies ActivityPage })
  return {
    slug: served.slug,
    /** The page's next read: the ceremony shown or not, with this ceremony. Refetched at once, as the room's `event.changed` does. */
    async read(next: { shown: boolean, ceremony: CeremonyView | null }) {
      served.set(viewWithSessions(served.slug, [ENDED_ONE], 0, {
        event: { phase: 'finished', isHost: state.host },
        settings: defaultSettings(),
        members: members({ kitty: state.seat }),
        ...finishedRead(state.tie, { ceremonyShown: next.shown, ceremony: next.ceremony }),
      }))
      await refreshEvent(served.slug)
      await flushPromises()
    },
  }
}

const mainButtons = (page: VueWrapper) => page.findAll('main button').map(button => button.text())
const sideTabs = (page: VueWrapper) => page.get('aside[aria-label="Seitenleiste"]')
const hat = (page: VueWrapper) => page.get('header .compibert').find('.compibert-hat').exists()

/** The stage of the shown page: the Winner, the Standings, the Spielverlauf, the row of buttons, the party hat of a Player in the winning team. */
function expectShown(page: VueWrapper, { tie = false, hatOn = false }: { tie?: boolean, hatOn?: boolean } = {}) {
  expect(regionHeadings(page)).toEqual(['Tabelle', 'Spielverlauf', 'Sessions', 'So wird gespielt'])
  expect(page.get('main h1').text()).toBe(tie ? 'Unentschieden' : 'Wilde Gurken gewinnt das Event')
  expect(mainButtons(page)).toContain('Bild teilen')
  expect(page.find('main table').exists()).toBe(true)
  expect(hat(page)).toBe(hatOn)
}

/**
 * Shown at the moment of the click or the end frame, not later: the Winner, the Standings, the row, the hat and the side panel are there in the same tick. Only the card's own leave
 * (the stage's TransitionGroup, which this ticket gives no motion of its own) may still be on its way out; it is gone a moment later.
 */
async function expectShownAtOnce(page: VueWrapper, { hatOn }: { hatOn: boolean }) {
  expect(page.get('main h1').text()).toBe('Wilde Gurken gewinnt das Event')
  expect(page.find('main table').exists()).toBe(true)
  expect(mainButtons(page)).toContain('Bild teilen')
  expect(sideTabs(page).find('table').exists()).toBe(true)
  expect(hat(page)).toBe(hatOn)
  await vi.waitFor(() => expectShown(page, { hatOn }))
}

/** The stage of the page that waits: no Winner in the Head, the card, the Sessions cards, and none of the rest. */
function expectWaiting(page: VueWrapper, { host }: { host: boolean }) {
  expect(regionHeadings(page)).toEqual(['Siegerehrung', 'Sessions', 'So wird gespielt'])
  expect(page.get('main h1').text()).toBe('Das Event ist beendet')
  expect(page.get('main').text()).not.toContain('Wilde Gurken gewinnt')
  const card = page.get('main section[aria-labelledby]')
  expect(card.text()).toContain(host ? 'Starte sie mit „Siegerehrung starten“ im Host-Dock, sobald ihr so weit seid.' : 'Die Siegerehrung steht noch aus.')
  expect(card.text()).toContain('Die Siegerehrung steht noch aus.')
  expect(page.find('main table').exists()).toBe(false)
  expect(page.get('main').text()).not.toContain('Spielverlauf')
  const buttons = mainButtons(page)
  expect(buttons).not.toContain('Bild teilen')
  expect(buttons).not.toContain('Siegerehrung ansehen')
  expect(hat(page)).toBe(false)
}

beforeEach(() => {
  signInAs(kitty)
  stubScreen(true)
  motion('full')
})

afterEach(() => {
  unmountPage()
  vi.restoreAllMocks()
})

for (const [who, { host, seat }] of VIEWERS) {
  describe(`the finished page before the Award ceremony, for ${who}`, () => {
    it('has the Head without the Winner, the pending card and the Sessions cards, and none of the rest', async () => {
      const page = await mount(serveFinished({ host, seat }).slug)

      expectWaiting(page, { host })
    })

    it('keeps the plain head for a Tie too: no „Unentschieden“, no Party named', async () => {
      const page = await mount(serveFinished({ host, seat, tie: true }).slug)

      expectWaiting(page, { host })
      expect(page.get('main h1').text()).not.toContain('Unentschieden')
    })

    it('shows the card in the Tabelle tab of the side panel, with no Standings and no history', async () => {
      const page = await mount(serveFinished({ host, seat }).slug)

      const panel = sideTabs(page)
      expect(panel.text()).toContain('Die Siegerehrung steht noch aus.')
      expect(panel.find('table').exists()).toBe(false)
      expect(panel.text()).not.toContain('Spielverlauf')
    })

    it('shows the card in the Tabelle tab of the phone, under its title, with no Standings and no history', async () => {
      stubScreen(false)
      const page = await mount(serveFinished({ host, seat }).slug)
      await page.findAll('nav[aria-label="Event"] button').find(item => item.text() === 'Tabelle')!.trigger('click')
      await flushPromises()

      const view = page.get('section[aria-labelledby="standings-title"]')
      expect(view.get('h1').text()).toBe('Tabelle')
      expect(view.text()).toContain('Die Siegerehrung steht noch aus.')
      expect(view.find('table').exists()).toBe(false)
      expect(view.text()).not.toContain('Spielverlauf')
    })

    for (const tie of [false, true]) {
      it(`says „Event beendet“ in the feed without the Winners, ${tie ? 'for a Tie' : 'for one Winner'}, in the side panel`, async () => {
        const page = await mount(serveFinished({ host, seat, tie }).slug)
        await flushPromises()

        const feed = sideTabs(page).text()
        expect(feed).toContain('Event beendet')
        expect(feed).not.toContain('Wilde Gurken')
        expect(feed).not.toContain('gewinnt')
        expect(feed).not.toContain('Unentschieden')
      })
    }

    it('says „Event beendet“ in the feed of the phone too', async () => {
      stubScreen(false)
      const page = await mount(serveFinished({ host, seat }).slug)
      await page.findAll('nav[aria-label="Event"] button').find(item => item.text() === 'Aktivität')!.trigger('click')
      await flushPromises()

      const view = page.get('section[aria-labelledby="activity-title"]')
      await vi.waitFor(() => expect(view.text()).toContain('Event beendet'))
      expect(view.text()).not.toContain('Wilde Gurken')
    })

    it('shows everything once the ceremony has been shown, with no run on the page to hold it', async () => {
      const served = serveFinished({ host, seat })
      const page = await mount(served.slug)
      expectWaiting(page, { host })

      // A start through the previous deployment, long over: the page that saw it pending has its layer say nothing, so the hold ends with the run's end.
      await served.read({ shown: true, ceremony: startAt(Date.now() - 120_000) })
      await vi.waitFor(() => expectShown(page, { hatOn: seat.zone === 'team' }))
    })

    it('shows everything at once for a page that loads with the ceremony stored (a late joiner, a reload)', async () => {
      const ceremony = startAt(Date.now() - 120_000)
      const page = await mount(serveFinished({ host, seat, shown: true, ceremony }).slug)

      expectShown(page, { hatOn: seat.zone === 'team' })
    })
  })
}

describe('the Host\'s dock before the Award ceremony', () => {
  it('still offers „Siegerehrung starten“, enabled', async () => {
    const page = await mount(serveFinished({ host: true, seat: { zone: 'team', team: 1 } }).slug)

    expect((await hostActionElement(page, 'Siegerehrung starten')).getAttribute('aria-disabled')).toBeNull()
  })
})

// The hold: the first run of a viewer who saw the page pending (#445). What waits stays hidden for that viewer until their run is over, so the side panel does not spoil the ceremony.
for (const [who, { host, seat }] of VIEWERS) {
  describe(`the first run, for ${who}`, () => {
    const hatOn = seat.zone === 'team'

    /** The page mounted pending, then the read that carries the start. */
    async function pendingThen(ceremony: CeremonyView) {
      const served = serveFinished({ host, seat })
      const page = await mount(served.slug)
      expectWaiting(page, { host })
      await served.read({ shown: true, ceremony })
      return { page, served }
    }

    it('keeps everything hidden at the read that carries the start, during the lead, with no layer yet', async () => {
      const { page } = await pendingThen(startAt(Date.now() + CEREMONY_LEAD_MS))

      expect(dialog()).toBeNull()
      expectWaiting(page, { host })
      expect(sideTabs(page).text()).not.toContain('Wilde Gurken')
    })

    it('keeps the Winner out of the side panel\'s Tabelle tab and the feed while the run plays', async () => {
      const { page } = await pendingThen(startAt(Date.now() - 500))

      await vi.waitFor(() => expect(dialog()?.textContent).toContain('Siegerehrung!'))
      expectWaiting(page, { host })
      expect(sideTabs(page).find('table').exists()).toBe(false)
      expect(sideTabs(page).text()).not.toContain('Wilde Gurken')
      expect(sideTabs(page).text()).not.toContain('gewinnt')
    })

    it('shows everything when the run reaches its end frame', async () => {
      const { page } = await pendingThen(endingIn(900))
      expectWaiting(page, { host })

      await vi.waitFor(() => expect(dialog()?.getAttribute('data-frame')).toBe('end'), { timeout: 4000 })
      await vi.waitFor(() => expectShown(page, { hatOn }))
      expect(sideTabs(page).text()).toContain('Wilde Gurken gewinnt')
    })

    it('shows everything at the click on „Überspringen“', async () => {
      const { page } = await pendingThen(startAt(Date.now() - 500))
      await vi.waitFor(() => expect(dialog()?.textContent).toContain('Überspringen'))
      expectWaiting(page, { host })

      ;[...dialog()!.querySelectorAll('button')].find(button => button.textContent?.trim() === 'Überspringen')!.click()
      await flushPromises()

      await expectShownAtOnce(page, { hatOn })
    })

    it('shows everything at the click on the close button', async () => {
      const { page } = await pendingThen(startAt(Date.now() - 500))
      await vi.waitFor(() => expect(dialog()?.textContent).toContain('Überspringen'))

      dialog()!.querySelector<HTMLButtonElement>('button[aria-label="Schließen"]')!.click()
      await flushPromises()

      expect(dialog()).toBeNull()
      await expectShownAtOnce(page, { hatOn })
    })

    it('shows everything at open under reduced motion', async () => {
      motion('reduced')
      const { page } = await pendingThen(startAt(Date.now() - 500))

      await vi.waitFor(() => expect(dialog()?.getAttribute('data-frame')).toBe('end'))
      await expectShownAtOnce(page, { hatOn })
    })

    it('hides nothing after the release when the Host starts the ceremony again', async () => {
      const { page, served } = await pendingThen(startAt(Date.now() - 500))
      await vi.waitFor(() => expect(dialog()?.textContent).toContain('Überspringen'))
      ;[...dialog()!.querySelectorAll('button')].find(button => button.textContent?.trim() === 'Überspringen')!.click()
      await flushPromises()
      await expectShownAtOnce(page, { hatOn })

      await served.read({ shown: true, ceremony: startAt(Date.now() + CEREMONY_LEAD_MS) })

      await expectShownAtOnce(page, { hatOn })
    })
  })
}

describe('the first run, for a page that did not see the page pending', () => {
  it('shows everything at once for a page mounted while the run plays, whose layer opens from where the run is', async () => {
    const page = await mount(serveFinished({ host: false, seat: { zone: 'team', team: 1 }, shown: true, ceremony: startAt(Date.now() - 500) }).slug)

    await vi.waitFor(() => expect(dialog()?.textContent).toContain('Siegerehrung!'))
    expectShown(page, { hatOn: true })
  })

  it('shows everything at once for a page mounted after the run', async () => {
    const page = await mount(serveFinished({ host: false, seat: { zone: 'stands' }, shown: true, ceremony: startAt(Date.now() - 60_000) }).slug)

    expect(dialog()).toBeNull()
    expectShown(page)
  })
})

describe('the finished page with nothing to show', () => {
  it('waits with the card for an Event with no Result', async () => {
    const served = serve(slug => viewWithSessions(slug, [ENDED_ONE], 0, {
      event: { phase: 'finished', isHost: false },
      settings: defaultSettings(),
      teams: [team(1), team(2)],
      members: members(),
      ceremonyShown: false,
    }))

    const page = await mount(served.slug)

    expect(regionHeadings(page)).toEqual(['Siegerehrung', 'Sessions', 'So wird gespielt'])
    expect(page.get('main h1').text()).toBe('Das Event ist beendet')
  })
})
