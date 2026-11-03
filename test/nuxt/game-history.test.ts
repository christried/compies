import { mountSuspended } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import GameHistory from '~/components/GameHistory.vue'
import type { BoardTeam } from '~~/shared/event'
import type { RoundGame } from '~~/shared/game'
import type { ResultLineView, ResultView, RoundView } from '~~/shared/stage'

// The history (#274, 02-components § GameHistory): a numbered row per Result, in the order given, each opening to every Party's Place, points
// and Score; the open Rounds as dashed rows after them, without a number. It has no button: a Correction is #275's.

const game = (name: string): RoundGame => ({ id: `g-${name}`, name, imageUrl: null, youtubeId: null, clipStart: 0, clipLength: 30, playersMin: 2, playersMax: 4, suitabilities: [] })
const named = (names: (string | null)[]): BoardTeam[] => names.map((name, index) => ({ position: index + 1, name, frozen: name !== null }))
const three = named(['Wilde Gurken', 'Die Füchse', null])
const line = (team: number, place: number, points: number, score: string | null = null): ResultLineView => ({ team, place, points, score })
const result = (number: number, name: string, places: ResultLineView[], corrected = false): ResultView => ({
  roundId: `r${number}`, number, game: game(name), places, corrected, resultAt: '2026-11-02T20:00:00.000Z',
})
const openRound = (id: string, name: string): RoundView => ({ id, startedAt: '2026-11-02T20:00:00.000Z', setAt: '2026-11-02T20:00:00.000Z', game: game(name) })

/** Team 1 wins, 2 second, 3 third; linear points 2, 1, 0. */
const standard = (number: number, name: string, scores: (string | null)[] = [null, null, null], corrected = false) =>
  result(number, name, [line(1, 1, 2, scores[0]), line(2, 2, 1, scores[1]), line(3, 3, 0, scores[2])], corrected)

type Props = { results?: ResultView[], open?: RoundView[], teams?: BoardTeam[] }
let page: VueWrapper | undefined

async function mount(props: Props = {}) {
  page = await mountSuspended(GameHistory, { props: { results: [standard(1, 'Halo')], open: [], teams: three, ...props } })
  return page
}

const items = () => page!.findAll('section > ol > li')
const numbered = () => page!.findAll('ol > li details')
const winners = (index = 0) => numbered()[index]!.get('[data-winners]')

afterEach(() => {
  page?.unmount()
  page = undefined
})

describe('the history', () => {
  it('lists the played games under „Spielverlauf“, as an ordered list that the heading names', async () => {
    await mount({ results: [standard(1, 'Halo'), standard(2, 'Kart')] })

    const heading = page!.get('h2')
    expect(heading.text()).toBe('Spielverlauf')
    expect(page!.get('ol').attributes('aria-labelledby')).toBe(heading.attributes('id'))
  })

  it('shows a numbered row per Result in the order given, with the Round\'s number and the game\'s name', async () => {
    await mount({ results: [standard(3, 'Pong'), standard(1, 'Halo'), standard(2, 'Kart')] })

    expect(numbered().map(row => row.get('[data-number]').text())).toEqual(['3', '1', '2'])
    expect(numbered().map(row => row.get('[data-game]').text())).toEqual(['Pong', 'Halo', 'Kart'])
  })

  it('names one winner by the Team name it froze, or by its colour', async () => {
    await mount({ results: [standard(1, 'Halo'), result(2, 'Kart', [line(3, 1, 2), line(1, 2, 1), line(2, 3, 0)])] })

    expect(winners(0).get('[title]').text()).toBe('Wilde Gurken')
    expect(winners(1).get('[title]').text()).toBe('Team Gelb')
    expect(winners(0).get('.sr-only').text()).toBe('Gewonnen von')
  })

  it('names two winners on a shared first Place with „und“', async () => {
    await mount({ results: [result(1, 'Halo', [line(1, 1, 2), line(2, 1, 2), line(3, 3, 0)])] })

    expect(winners().get('[title]').text()).toBe('Wilde Gurken und Die Füchse')
  })

  it('names every Party when all of them are level, and keeps the full text in the title', async () => {
    const eight = named(['Alpha Eins', 'Beta Zwei', 'Gamma Drei', 'Delta Vier', 'Epsilon Fünf', 'Zeta Sechs', 'Eta Sieben', 'Theta Acht'])
    await mount({ teams: eight, results: [result(1, 'Halo', eight.map(team => line(team.position, 1, 2)))] })

    const names = winners().get('[title]')
    expect(names.attributes('title')).toBe('Alpha Eins, Beta Zwei, Gamma Drei, Delta Vier, Epsilon Fünf, Zeta Sechs, Eta Sieben und Theta Acht')
    expect(names.text()).toBe(names.attributes('title'))
    expect(names.classes()).toContain('line-clamp-2')
  })

  it('joins the Scores in Place order, with „–“ for a Party without one', async () => {
    await mount({ results: [standard(1, 'Halo', ['16', '12', null]), standard(2, 'Kart', [null, '7', null])] })

    expect(numbered().map(row => row.get('[data-scores]').text())).toEqual(['16 : 12 : –', '– : 7 : –'])
  })

  it('shows no Score text when no Party has a Score, and a long Score or an emoji family in one piece with its title', async () => {
    const family = '👨‍👩‍👧‍👦'
    await mount({ results: [standard(1, 'Halo'), standard(2, 'Kart', ['1234567', family, null])] })

    expect(numbered()[0]!.find('[data-scores]').exists()).toBe(false)
    const scores = numbered()[1]!.get('[data-scores]')
    expect(scores.text()).toBe(`1234567 : ${family} : –`)
    expect(scores.attributes('title')).toBe(scores.text())
    expect(scores.classes()).toContain('truncate')
  })

  it('marks „korrigiert“ on a corrected row only', async () => {
    await mount({ results: [standard(1, 'Halo'), standard(2, 'Kart', [null, null, null], true)] })

    expect(numbered().map(row => row.text().includes('korrigiert'))).toEqual([false, true])
  })

  it('keeps a row closed until it is opened, then lists every Party with its Place, points and Score', async () => {
    await mount({ results: [result(1, 'Halo', [line(1, 1, 2, '16'), line(2, 1, 2), line(3, 3, 0, '8')])] })
    const details = numbered()[0]!

    expect(details.attributes('open')).toBeUndefined()
    await details.get('summary').trigger('click')

    const lines = details.findAll('ol li')
    expect(lines).toHaveLength(3)
    expect(lines.map(item => item.get('[data-place]').text())).toEqual(['1.', '1.', '3.'])
    expect(lines.map(item => item.get('[data-name]').text())).toEqual(['Wilde Gurken', 'Die Füchse', 'Team Gelb'])
    expect(lines.map(item => item.get('[data-earns]').text())).toEqual(['+2 Punkte', '+2 Punkte', '+0 Punkte'])
    expect(lines.map(item => item.find('[data-score]').exists() ? item.get('[data-score]').text() : null)).toEqual(['16', null, '8'])
  })

  it('reads +1 Punkt for a single point', async () => {
    await mount({ results: [standard(1, 'Halo')] })

    const earns = numbered()[0]!.findAll('ol li [data-earns]').map(item => item.text())
    expect(earns).toEqual(['+2 Punkte', '+1 Punkt', '+0 Punkte'])
  })

  it('shows the open Rounds as dashed rows after the numbered ones, with „wird gespielt“, no number and no disclosure', async () => {
    await mount({ results: [standard(1, 'Halo')], open: [openRound('o1', 'Kart'), openRound('o2', 'Pong'), openRound('o3', 'Schach')] })

    expect(items()).toHaveLength(4)
    const dashed = items().slice(1)
    for (const row of dashed) {
      expect(row.find('details').exists()).toBe(false)
      expect(row.find('[data-number]').exists()).toBe(false)
      expect(row.html()).toContain('border-dashed')
      expect(row.text()).toContain('wird gespielt')
    }
    expect(dashed.map(row => row.get('[data-game]').text())).toEqual(['Kart', 'Pong', 'Schach'])
    expect(items()[0]!.find('details').exists()).toBe(true)
  })

  it('shows only dashed rows before the first Result', async () => {
    await mount({ results: [], open: [openRound('o1', 'Kart')] })

    expect(items()).toHaveLength(1)
    expect(numbered()).toHaveLength(0)
  })

  it('says so when no game was played and none is open', async () => {
    await mount({ results: [], open: [] })

    expect(page!.text()).toContain('Noch kein Spiel gespielt.')
    expect(page!.find('ol').exists()).toBe(false)
  })

  it('renders 30 rows', async () => {
    await mount({ results: Array.from({ length: 30 }, (_, index) => standard(index + 1, `Spiel ${index + 1}`)) })

    expect(numbered()).toHaveLength(30)
    expect(numbered()[29]!.get('[data-number]').text()).toBe('30')
  })

  it('has no button in any row: a Correction is not built here', async () => {
    await mount({ results: [standard(1, 'Halo', [null, null, null], true)], open: [openRound('o1', 'Kart')] })
    await numbered()[0]!.get('summary').trigger('click')

    expect(page!.find('button').exists()).toBe(false)
  })
})
