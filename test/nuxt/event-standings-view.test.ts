import { mountSuspended } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import EventStandingsView from '~/components/EventStandingsView.vue'
import StandingsTab from '~/components/StandingsTab.vue'
import type { HistoryCorrections } from '~/utils/history-corrections'
import type { StandingsNews } from '~/utils/standings-news'
import type { BoardTeam, EventView } from '~~/shared/event'
import type { RoundGame } from '~~/shared/game'
import type { ResultView, RoundView } from '~~/shared/stage'

// The content of the „Tabelle“ tab and the phone's view of it (#274): the Standings, then the history; for an Event that is not set up only the history.
// Both hand the Host's `corrections` (#275) to the history, which gives its rows their pencils.

const halo: RoundGame = { id: 'g-halo', name: 'Halo', imageUrl: null, youtubeId: null, clipStart: 0, clipLength: 30, playersMin: 2, playersMax: 4, suitabilities: [] }
const teams: BoardTeam[] = [{ position: 1, name: 'Wilde Gurken', frozen: true }, { position: 2, name: null, frozen: false }]
const played: ResultView = { roundId: 'r1', number: 1, game: halo, places: [{ team: 2, place: 1, points: 1, score: '9' }, { team: 1, place: 2, points: 0, score: null }], corrected: false, correctedAt: null, resultAt: '2026-11-02T20:00:00.000Z' }
const open: RoundView = { id: 'r2', startedAt: '2026-11-02T21:00:00.000Z', setAt: '2026-11-02T21:00:00.000Z', game: { ...halo, id: 'g-kart', name: 'Kart' } }

const view = {
  standings: [{ team: 2, rank: 1, points: 1 }, { team: 1, rank: 2, points: 0 }],
  end: { played: 1, gameCount: 6, complete: false, tie: null, finish: null, lastGame: null },
  results: [played],
  rounds: [open],
  teams,
}

/** A news from long ago, so the Leaderboard stays calm: only what reaches it is under test. */
const news: StandingsNews = { key: 1, kind: 'entered', roundId: 'r1', number: 1, before: [{ team: 1, rank: 1, points: 0 }, { team: 2, rank: 1, points: 0 }], winners: [2], at: 0, announcement: 'Spiel 1 ist eingetragen.' }

const corrections: HistoryCorrections = { pointsTable: { preset: 'linear', values: [1, 0] }, total: 6, save: vi.fn(async () => true) }
const pencils = (wrapper: VueWrapper) => wrapper.findAll('button[aria-label="Spiel 1 korrigieren"]')

let page: VueWrapper | undefined

/** Vue Test Utils stubs TransitionGroup with an element of its own, which would take the place of the Leaderboard's `tbody`: the real one renders it. */
type Props = { view: Pick<EventView, 'standings' | 'end' | 'results' | 'rounds' | 'teams'>, corrections?: HistoryCorrections | null, news?: StandingsNews | null }
const global = { stubs: { TransitionGroup: false } }
const mountTab = (props: Props) => mountSuspended(StandingsTab, { props, global })
const mountPhone = (props: Props) => mountSuspended(EventStandingsView, { props, global })
afterEach(() => {
  page?.unmount()
  page = undefined
})

describe('the Tabelle tab', () => {
  it('holds the Standings and then the history', async () => {
    page = await mountTab({ view })

    expect(page.findAll('h2').map(heading => heading.text())).toEqual(['Tabelle', 'Spielverlauf'])
    expect(page.findAll('tbody tr')).toHaveLength(2)
    expect(page.text()).toContain('Nach Spiel 1 von 6')
    expect(page.text()).toContain('wird gespielt')
  })

  it('shows only the history for an Event that is not set up', async () => {
    page = await mountTab({ view: { ...view, standings: null, end: null, results: [], rounds: [] } })

    expect(page.findAll('h2').map(heading => heading.text())).toEqual(['Spielverlauf'])
    expect(page.text()).toContain('Noch kein Spiel gespielt.')
  })

  it('says that there is no Result yet before the first one, and lists the open Rounds as dashed rows', async () => {
    page = await mountTab({ view: { ...view, standings: [{ team: 1, rank: 1, points: 0 }, { team: 2, rank: 1, points: 0 }], end: { played: 0, gameCount: 6, complete: false, tie: null, finish: null, lastGame: null }, results: [] } })

    expect(page.find('table').exists()).toBe(false)
    expect(page.text()).toContain('Noch kein Ergebnis.')
    expect(page.findAll('section > ol > li')).toHaveLength(1)
  })

  it('forwards `corrections` to the history: a pencil per Result with it, none without', async () => {
    page = await mountTab({ view, corrections })
    expect(pencils(page)).toHaveLength(1)

    page.unmount()
    page = await mountTab({ view })
    expect(pencils(page)).toHaveLength(0)
  })

  it('hands the page\'s news to the Leaderboard, unframed and never celebrating: the stamp and the confetti are the stage\'s (#276)', async () => {
    page = await mountTab({ view, news })

    const board = page.findComponent({ name: 'Leaderboard' })
    expect(board.props('news')).toEqual(news)
    expect(board.props('framed')).toBe(false)
    expect(board.props('celebrate')).toBe(false)
  })

  it('has no news for the Leaderboard when the page has none', async () => {
    page = await mountTab({ view })

    expect(page.findComponent({ name: 'Leaderboard' }).props('news')).toBeNull()
  })
})

describe('the phone\'s Tabelle view', () => {
  it('has the title „Tabelle“ as its h1, then the Standings and the history', async () => {
    page = await mountPhone({ view })

    expect(page.findAll('h1').map(heading => heading.text())).toEqual(['Tabelle'])
    expect(page.find('table').exists()).toBe(true)
    expect(page.findAll('h2').map(heading => heading.text())).toEqual(['Spielverlauf'])
  })

  it('has exactly one heading named „Tabelle“, the h1, and the Standings table is named by it (#274)', async () => {
    page = await mountPhone({ view })

    const named = page.findAll('h1, h2').filter(heading => heading.text() === 'Tabelle')
    expect(named.map(heading => heading.element.tagName)).toEqual(['H1'])
    expect(page.get('table').attributes('aria-labelledby')).toBe(named[0]!.attributes('id'))
  })

  it('shows the Standings kicker after a Result, under the h1', async () => {
    page = await mountPhone({ view })

    expect(page.text()).toContain('Nach Spiel 1 von 6')
  })

  it('forwards `corrections` through the Standings tab: a pencil with it, none without', async () => {
    page = await mountPhone({ view, corrections })
    expect(pencils(page)).toHaveLength(1)

    page.unmount()
    page = await mountPhone({ view })
    expect(pencils(page)).toHaveLength(0)
  })

  it('hands the page\'s news through the Standings tab to the Leaderboard, unframed and never celebrating (#276)', async () => {
    page = await mountPhone({ view, news })

    const board = page.findComponent({ name: 'Leaderboard' })
    expect(board.props('news')).toEqual(news)
    expect(board.props('framed')).toBe(false)
    expect(board.props('celebrate')).toBe(false)
  })
})
