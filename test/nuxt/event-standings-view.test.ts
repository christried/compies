import { mountSuspended } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import EventStandingsView from '~/components/EventStandingsView.vue'
import StandingsTab from '~/components/StandingsTab.vue'
import type { HistoryCorrections } from '~/utils/result-draft'
import type { BoardTeam } from '~~/shared/event'
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

const corrections: HistoryCorrections = { pointsTable: { preset: 'linear', values: [1, 0] }, total: 6, save: vi.fn(async () => true) }
const pencils = (wrapper: VueWrapper) => wrapper.findAll('button[aria-label="Spiel 1 korrigieren"]')

let page: VueWrapper | undefined
afterEach(() => {
  page?.unmount()
  page = undefined
})

describe('the Tabelle tab', () => {
  it('holds the Standings and then the history', async () => {
    page = await mountSuspended(StandingsTab, { props: { view } })

    expect(page.findAll('h2').map(heading => heading.text())).toEqual(['Tabelle', 'Spielverlauf'])
    expect(page.findAll('tbody tr')).toHaveLength(2)
    expect(page.text()).toContain('Nach Spiel 1 von 6')
    expect(page.text()).toContain('wird gespielt')
  })

  it('shows only the history for an Event that is not set up', async () => {
    page = await mountSuspended(StandingsTab, { props: { view: { ...view, standings: null, end: null, results: [], rounds: [] } } })

    expect(page.findAll('h2').map(heading => heading.text())).toEqual(['Spielverlauf'])
    expect(page.text()).toContain('Noch kein Spiel gespielt.')
  })

  it('says that there is no Result yet before the first one, and lists the open Rounds as dashed rows', async () => {
    page = await mountSuspended(StandingsTab, { props: { view: { ...view, standings: [{ team: 1, rank: 1, points: 0 }, { team: 2, rank: 1, points: 0 }], end: { played: 0, gameCount: 6, complete: false, tie: null, finish: null, lastGame: null }, results: [] } } })

    expect(page.find('table').exists()).toBe(false)
    expect(page.text()).toContain('Noch kein Ergebnis.')
    expect(page.findAll('section > ol > li')).toHaveLength(1)
  })

  it('forwards `corrections` to the history: a pencil per Result with it, none without', async () => {
    page = await mountSuspended(StandingsTab, { props: { view, corrections } })
    expect(pencils(page)).toHaveLength(1)

    page.unmount()
    page = await mountSuspended(StandingsTab, { props: { view } })
    expect(pencils(page)).toHaveLength(0)
  })
})

describe('the phone\'s Tabelle view', () => {
  it('has the title „Tabelle“ as its h1, then the Standings and the history', async () => {
    page = await mountSuspended(EventStandingsView, { props: { view } })

    expect(page.findAll('h1').map(heading => heading.text())).toEqual(['Tabelle'])
    expect(page.find('table').exists()).toBe(true)
    expect(page.findAll('h2').map(heading => heading.text())).toEqual(['Tabelle', 'Spielverlauf'])
  })

  it('forwards `corrections` through the Standings tab: a pencil with it, none without', async () => {
    page = await mountSuspended(EventStandingsView, { props: { view, corrections } })
    expect(pencils(page)).toHaveLength(1)

    page.unmount()
    page = await mountSuspended(EventStandingsView, { props: { view } })
    expect(pencils(page)).toHaveLength(0)
  })
})
