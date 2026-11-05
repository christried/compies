import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import GameHistory from '~/components/GameHistory.vue'
import type { HistoryCorrections } from '~/utils/history-corrections'
import type { BoardTeam } from '~~/shared/event'
import { GAME_NAME_MAX, type RoundGame } from '~~/shared/game'
import type { ResultPlace } from '~~/shared/results'
import type { PointsTable } from '~~/shared/settings'
import type { ResultLineView, ResultView, RoundView } from '~~/shared/stage'
import { kitty, signInAs } from './auth'
import { dialog } from './event-page'

// The history (#274, 02-components § GameHistory): a numbered row per Result, in the order given, each opening to every Party's Place, points
// and Score; the open Rounds as dashed rows after them, without a number. The Host's history (`corrections`, #275) gives every numbered row a pencil that opens
// the result sheet on that Result; without `corrections` (a Member, a finished Event) there is no button and no sheet.

const game = (name: string): RoundGame => ({ id: `g-${name}`, name, imageUrl: null, youtubeId: null, clipStart: 0, clipLength: 30, playersMin: 2, playersMax: 4, suitabilities: [] })
const named = (names: (string | null)[]): BoardTeam[] => names.map((name, index) => ({ position: index + 1, name, frozen: name !== null }))
const three = named(['Wilde Gurken', 'Die Füchse', null])
const line = (team: number, place: number, points: number, score: string | null = null): ResultLineView => ({ team, place, points, score })
const result = (number: number, name: string, places: ResultLineView[], corrected = false): ResultView => ({
  roundId: `r${number}`, number, game: game(name), places, corrected, correctedAt: corrected ? '2026-11-02T21:00:00.000Z' : null, resultAt: '2026-11-02T20:00:00.000Z',
})
const openRound = (id: string, name: string): RoundView => ({ id, startedAt: '2026-11-02T20:00:00.000Z', setAt: '2026-11-02T20:00:00.000Z', game: game(name) })

/** Team 1 wins, 2 second, 3 third; linear points 2, 1, 0. */
const standard = (number: number, name: string, scores: (string | null)[] = [null, null, null], corrected = false) =>
  result(number, name, [line(1, 1, 2, scores[0]), line(2, 2, 1, scores[1]), line(3, 3, 0, scores[2])], corrected)

type Props = { results?: ResultView[], open?: RoundView[], teams?: BoardTeam[], corrections?: HistoryCorrections | null }
let page: VueWrapper | undefined

async function mount(props: Props = {}) {
  page = await mountSuspended(GameHistory, { props: { results: [standard(1, 'Halo')], open: [], teams: three, ...props } })
  return page
}

const items = () => page!.findAll('section > ol > li')
const numbered = () => page!.findAll('ol > li details')
const winners = (index = 0) => numbered()[index]!.get('[data-winners]')

beforeEach(() => {
  signInAs(kitty)
  document.body.innerHTML = ''
})

afterEach(() => {
  page?.unmount()
  page = undefined
  document.body.innerHTML = ''
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

  it('names the first winner and „+7“ when 8 Parties are level, with at most 3 marks, the whole list in the title and for a screen reader', async () => {
    const eight = named(['Alpha Eins', 'Beta Zwei', 'Gamma Drei', 'Delta Vier', 'Epsilon Fünf', 'Zeta Sechs', 'Eta Sieben', 'Theta Acht'])
    await mount({ teams: eight, results: [result(1, 'Halo', eight.map(team => line(team.position, 1, 2)))] })

    const names = winners().get('[title]')
    expect(names.text()).toBe('Alpha Eins +7')
    expect(names.attributes('title')).toBe('Alpha Eins, Beta Zwei, Gamma Drei, Delta Vier, Epsilon Fünf, Zeta Sechs, Eta Sieben und Theta Acht')
    expect(names.classes()).toContain('line-clamp-2')
    expect(winners().find('.flex-none.-space-x-1\\.5').element.children).toHaveLength(3)
    expect(winners().text()).toContain('Theta Acht')
  })

  it('names three winners by the first and „+2“, and two by both', async () => {
    await mount({ results: [result(1, 'Halo', [line(1, 1, 2), line(2, 1, 2), line(3, 1, 2)]), result(2, 'Kart', [line(1, 1, 2), line(2, 1, 2), line(3, 3, 0)])] })

    expect(winners(0).get('[title]').text()).toBe('Wilde Gurken +2')
    expect(winners(0).find('.flex-none.-space-x-1\\.5').element.children).toHaveLength(3)
    expect(winners(1).get('[title]').text()).toBe('Wilde Gurken und Die Füchse')
    expect(winners(1).find('.flex-none.-space-x-1\\.5').element.children).toHaveLength(2)
  })

  it('lets the Scores give way before the names, in the row with and without the button', async () => {
    const eight = named(['Alpha Eins', 'Beta Zwei', 'Gamma Drei', 'Delta Vier', 'Epsilon Fünf', 'Zeta Sechs', 'Eta Sieben', 'Theta Acht'])
    await mount({ teams: eight, results: [result(1, 'Halo', eight.map(team => line(team.position, 1, 2, '1234567')))] })

    const scores = numbered()[0]!.get('[data-scores]')
    expect(scores.classes()).toContain('truncate')
    expect(scores.classes().some(name => name.startsWith('shrink-'))).toBe(true)
    expect(scores.attributes('title')).toBe(scores.text())
    expect(numbered()[0]!.get('summary > span:nth-child(2)').classes()).toContain('min-w-24')
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

  it('keeps a corrected row with two winners and three Scores whole, the chip on the winners\' line (#275)', async () => {
    await mount({ results: [result(1, 'Halo', [line(1, 1, 2, '20'), line(2, 1, 2, '15'), line(3, 3, 0, '10')], true)] })

    expect(numbered()[0]!.get('[data-scores]').text()).toBe('20 : 15 : 10')
    expect(numbered()[0]!.text().match(/korrigiert/g)).toHaveLength(1)
    expect(winners().text()).toContain('korrigiert')
    expect(winners().get('.line-clamp-2').text()).toBe('Wilde Gurken und Die Füchse')
  })

  it('carries the narrow-row classes on a corrected row, so the names keep the line below 440 px (#275)', async () => {
    await mount({ results: [result(1, 'Halo', [line(1, 1, 2, '20'), line(2, 1, 2, '15'), line(3, 3, 0, '10')], true)], corrections: { pointsTable: { preset: 'linear', values: [2, 1, 0] }, total: 6, save: async () => true } })

    const row = numbered()[0]!
    expect(row.element.closest('li')!.classList).toContain('@container')
    expect(row.get('summary').classes()).toEqual(expect.arrayContaining(['@max-[440px]:flex-wrap', '@max-[440px]:gap-y-0.5']))
    expect(row.get('summary > span:nth-child(2)').classes()).toContain('@max-[440px]:relative')
    expect(row.get('[data-game]').classes()).toContain('@max-[440px]:pr-16')
    const chip = winners().findAll('span').find(span => span.text() === 'korrigiert')!
    expect(chip.classes()).toEqual(expect.arrayContaining(['@max-[440px]:absolute', '@max-[440px]:top-0', '@max-[440px]:right-0']))
    expect(row.get('[data-scores]').classes()).toEqual(expect.arrayContaining(['@max-[440px]:order-1', '@max-[440px]:basis-full', '@max-[440px]:max-w-full', '@max-[440px]:pl-9']))
  })

  it('does not reserve the chip\'s room in the name of an uncorrected row (#275)', async () => {
    await mount({ results: [standard(1, 'Halo', ['20', '15', '10'])] })

    expect(numbered()[0]!.get('[data-game]').classes().some(name => name.includes('pr-16'))).toBe(false)
    expect(numbered()[0]!.get('[data-scores]').classes()).toContain('max-w-[38%]')
  })

  it('keeps the Scores\' width cap in the wide row, 30% with the button and 38% without (#275)', async () => {
    await mount({ results: [standard(1, 'Halo', ['20', '15', '10'], true)], corrections: { pointsTable: { preset: 'linear', values: [2, 1, 0] }, total: 6, save: async () => true } })

    expect(numbered()[0]!.get('[data-scores]').classes()).toContain('max-w-[30%]')
  })

  it('shows the chip once and no Scores for a corrected row with one winner and no Score (#275)', async () => {
    await mount({ results: [standard(1, 'Halo', [null, null, null], true)] })

    expect(numbered()[0]!.find('[data-scores]').exists()).toBe(false)
    expect(numbered()[0]!.text().match(/korrigiert/g)).toHaveLength(1)
    expect(winners().get('[title]').text()).toBe('Wilde Gurken')
  })

  it('shows the chip once for a corrected row with three winners named „+2“ (#275)', async () => {
    await mount({ results: [result(1, 'Halo', [line(1, 1, 2, '20'), line(2, 1, 2, '15'), line(3, 1, 2, '10')], true)] })

    expect(winners().get('[title]').text()).toBe('Wilde Gurken +2')
    expect(numbered()[0]!.text().match(/korrigiert/g)).toHaveLength(1)
    expect(winners().text()).toContain('korrigiert')
  })

  it('keeps the longest game name in a corrected row, cut with its title (#275)', async () => {
    const longest = 'X'.repeat(GAME_NAME_MAX)
    await mount({ results: [result(1, longest, [line(1, 1, 2, '20'), line(2, 1, 2, '15'), line(3, 3, 0, '10')], true)] })

    expect(numbered()[0]!.get('[data-game]').classes()).toContain('truncate')
    expect(numbered()[0]!.get('[data-game]').attributes('title')).toBe(longest)
    expect(numbered()[0]!.get('[data-game]').text()).toBe(longest)
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
})

describe('the Host\'s Corrections (#275)', () => {
  const linear: PointsTable = { preset: 'linear', values: [2, 1, 0] }
  const corrections = (save: HistoryCorrections['save'] = async () => true): HistoryCorrections => ({ pointsTable: linear, total: 6, save })
  const pencils = () => page!.findAll('button').filter(button => /korrigieren/i.test(button.attributes('aria-label') ?? ''))
  const sheet = () => dialog()
  const sheetNames = () => [...sheet()!.querySelectorAll('[aria-label="Platzierung"] [data-name]')].map(item => item.textContent!.trim())
  const sheetPlaces = () => [...sheet()!.querySelectorAll('[aria-label="Platzierung"] [data-place] [aria-hidden="true"]')].map(item => item.textContent!.trim())
  const sheetScore = (team: string) => sheet()!.querySelector<HTMLInputElement>(`input[aria-label="Score ${team} (optional)"]`)!.value
  const sheetSave = () => [...sheet()!.querySelectorAll<HTMLButtonElement>('footer button')].find(button => button.textContent?.trim() === 'Korrektur speichern')!
  const shared = result(2, 'Kart', [line(1, 1, 2, '16'), line(2, 1, 2), line(3, 3, 0, '8')])

  it('has no button and no dialog without `corrections`, also on an opened and a corrected row', async () => {
    await mount({ results: [standard(1, 'Halo', [null, null, null], true)], open: [openRound('o1', 'Kart')] })
    await numbered()[0]!.get('summary').trigger('click')

    expect(page!.find('button').exists()).toBe(false)
    expect(sheet()).toBeNull()

    page!.unmount()
    await mount({ results: [standard(1, 'Halo')], corrections: null })
    expect(page!.find('button').exists()).toBe(false)
  })

  it('has one button per numbered row, named for its game, and none on a dashed open row', async () => {
    await mount({ results: [standard(1, 'Halo'), shared], open: [openRound('o1', 'Pong')], corrections: corrections() })

    expect(pencils().map(button => button.attributes('aria-label'))).toEqual(['Spiel 1 korrigieren', 'Spiel 2 korrigieren'])
    expect(pencils().map(button => button.attributes('title'))).toEqual(['Spiel 1 korrigieren', 'Spiel 2 korrigieren'])
    expect(items()[2]!.find('button').exists()).toBe(false)
    expect(page!.findAll('button')).toHaveLength(2)
  })

  it('keeps the button outside the disclosure, at the end of the row', async () => {
    await mount({ corrections: corrections() })

    const button = pencils()[0]!
    expect(button.element.closest('details')).toBeNull()
    expect(button.element.closest('summary')).toBeNull()
    expect(button.element.parentElement).toBe(items()[0]!.element)
  })

  it('opens the sheet at once on that Result, with its Places, Scores and the points, and does not toggle the row', async () => {
    await mount({ results: [standard(1, 'Halo'), shared], corrections: corrections() })

    await pencils()[1]!.trigger('click')
    await flushPromises()

    expect(sheet()!.querySelector('h2')?.textContent).toBe('Spiel 2 korrigieren')
    expect(sheet()!.textContent).toContain('Korrektur: Spiel 2 von 6')
    expect(sheet()!.textContent).toContain('Kart')
    expect(sheetNames()).toEqual(['Wilde Gurken', 'Die Füchse', 'Team Gelb'])
    expect(sheetPlaces()).toEqual(['1', '1', '3'])
    expect(sheetScore('Wilde Gurken')).toBe('16')
    expect(sheetScore('Team Gelb')).toBe('8')
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1)
    expect(numbered()[1]!.attributes('open')).toBeUndefined()
    expect(numbered()[0]!.attributes('open')).toBeUndefined()
  })

  it('saves with the Round and the Places, closes when the server took them and stays when it refused', async () => {
    const save = vi.fn(async (_roundId: string, _places: ResultPlace[]) => false)
    await mount({ results: [shared], corrections: corrections(save) })
    await pencils()[0]!.trigger('click')
    await flushPromises()

    sheetSave().click()
    await flushPromises()
    expect(save).toHaveBeenCalledWith('r2', [
      { team: 1, place: 1, score: '16' },
      { team: 2, place: 1, score: null },
      { team: 3, place: 3, score: '8' },
    ])
    expect(sheet()).not.toBeNull()

    save.mockResolvedValue(true)
    sheetSave().click()
    await flushPromises()
    expect(save).toHaveBeenCalledTimes(2)
    expect(sheet()).toBeNull()
  })

  it('shows the Result of the row pressed next, after closing the first', async () => {
    await mount({ results: [standard(1, 'Halo', ['3', null, null]), shared], corrections: corrections() })

    await pencils()[0]!.trigger('click')
    await flushPromises()
    expect(sheet()!.querySelector('h2')?.textContent).toBe('Spiel 1 korrigieren')
    expect(sheetPlaces()).toEqual(['1', '2', '3'])
    sheet()!.querySelector<HTMLButtonElement>('header button[aria-label="Schließen"]')!.click()
    await flushPromises()
    expect(sheet()).toBeNull()

    await pencils()[1]!.trigger('click')
    await flushPromises()
    expect(sheet()!.querySelector('h2')?.textContent).toBe('Spiel 2 korrigieren')
    expect(sheetPlaces()).toEqual(['1', '1', '3'])
  })

  it('closes the sheet when `corrections` goes away (the Event finished) and does not reopen it when it comes back', async () => {
    await mount({ results: [standard(1, 'Halo')], corrections: corrections() })
    await pencils()[0]!.trigger('click')
    await flushPromises()
    expect(sheet()).not.toBeNull()

    await page!.setProps({ corrections: null })
    await flushPromises()
    expect(sheet()).toBeNull()
    expect(pencils()).toHaveLength(0)

    await page!.setProps({ corrections: corrections() })
    await flushPromises()
    expect(sheet()).toBeNull()
    expect(pencils()).toHaveLength(1)
  })

  it('shows the „korrigiert“ chip and the button together on a corrected row, and offers nothing else to do with the Result', async () => {
    await mount({ results: [standard(1, 'Halo', [null, null, null], true)], corrections: corrections() })
    await numbered()[0]!.get('summary').trigger('click')

    expect(numbered()[0]!.text()).toContain('korrigiert')
    expect(pencils()).toHaveLength(1)
    expect(page!.findAll('button')).toHaveLength(1)
    await pencils()[0]!.trigger('click')
    await flushPromises()
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1)
    expect(document.body.textContent).not.toMatch(/zurück|löschen|bestätig/i)
  })

  it('keeps the winners, the Scores and the button in the row for the longest names, a long Score and an emoji family', async () => {
    const family = '👨‍👩‍👧‍👦'
    const eight = named(['Die allerlängsten Parteinamen der Welt A', 'Die allerlängsten Parteinamen der Welt B', 'C', 'D', 'E', 'F', 'G', 'H'])
    await mount({ teams: eight, results: [result(1, 'Ein sehr langer Spielname, der nicht in die Zeile passt', eight.map(team => line(team.position, 1, 2, team.position === 1 ? `123456${family}` : null)))], corrections: corrections() })

    expect(pencils()).toHaveLength(1)
    expect(numbered()[0]!.find('[data-winners] .line-clamp-2').exists()).toBe(true)
    expect(numbered()[0]!.get('[data-scores]').classes()).toContain('truncate')
  })

  it('renders 30 rows, each with a button', async () => {
    await mount({ results: Array.from({ length: 30 }, (_, index) => standard(index + 1, `Spiel ${index + 1}`)), corrections: corrections() })

    expect(pencils()).toHaveLength(30)
    expect(pencils()[29]!.attributes('aria-label')).toBe('Spiel 30 korrigieren')
  })

  it('renders 1 and 2 rows', async () => {
    await mount({ results: [standard(1, 'Halo')], corrections: corrections() })
    expect(pencils()).toHaveLength(1)

    page!.unmount()
    await mount({ results: [standard(1, 'Halo'), standard(2, 'Kart')], corrections: corrections() })
    expect(pencils()).toHaveLength(2)
  })
})
