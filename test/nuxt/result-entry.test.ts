import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AppSheet from '~/components/AppSheet.vue'
import ResultEntry from '~/components/ResultEntry.vue'
import type { BoardTeam } from '~~/shared/event'
import { GAME_NAME_MAX } from '~~/shared/game'
import type { ResultView } from '~~/shared/stage'
import type { RoundGame } from '~~/shared/game'
import type { ResultPlace } from '~~/shared/results'
import type { PointsTable } from '~~/shared/settings'
import { kitty, signInAs } from './auth'
import { dialog } from './event-page'

// The result sheet (#273, spec #272, screen 16): the Parties in team order, ordered with the arrow buttons (the drag is the same move), „gleichauf“
// between neighbours, an optional Score, the points each row earns, and one save that sends the Places. Nothing goes out before the save.

const game: RoundGame = { id: 'g-kart', name: 'Mario Kart', imageUrl: null, youtubeId: null, clipStart: 0, clipLength: 30, playersMin: 2, playersMax: 4, suitabilities: [], price: null }
const teams = (names: (string | null)[]): BoardTeam[] => names.map((name, index) => ({ position: index + 1, name, frozen: name !== null }))
const three = teams(['Wilde Gurken', 'Die Füchse', null])
const linear3: PointsTable = { preset: 'linear', values: [2, 1, 0] }

type Props = { open?: boolean, game?: RoundGame, teams?: BoardTeam[], pointsTable?: PointsTable, kicker?: { number: number, total: number } | null, correction?: Pick<ResultView, 'number' | 'places'> | null, save?: (places: ResultPlace[]) => Promise<boolean> }
let page: Awaited<ReturnType<typeof mountSuspended>> | undefined

async function mount(props: Props = {}) {
  page = await mountSuspended(ResultEntry, { props: { open: true, game, teams: three, pointsTable: linear3, save: async () => true, ...props } })
  await flushPromises()
  return page
}

const sheet = () => dialog()!
const rows = () => [...sheet().querySelectorAll<HTMLElement>('[aria-label="Platzierung"] > li')]
const nameOf = (row: HTMLElement) => row.querySelector('[data-name]')!.textContent!.trim()
const placeOf = (row: HTMLElement) => row.querySelector('[data-place] [aria-hidden="true"]')!.textContent!.trim()
const earnsOf = (row: HTMLElement) => row.querySelector('[data-earns]')!.textContent!.trim()
const names = () => rows().map(nameOf)
const places = () => rows().map(placeOf)
const switches = () => [...sheet().querySelectorAll<HTMLButtonElement>('[role="switch"]')]
const button = (label: string) => sheet().querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!
const scoreField = (team: string) => sheet().querySelector<HTMLInputElement>(`input[aria-label="Score ${team} (optional)"]`)!
const footerButton = (label: string) => [...sheet().querySelectorAll<HTMLButtonElement>('footer button')].find(item => item.textContent?.trim() === label)!
const saveButton = () => footerButton('Ergebnis speichern')
const status = () => sheet().querySelector('[role="status"]')!.textContent!.trim()

async function click(element: HTMLElement) {
  element.click()
  await flushPromises()
}

async function type(input: HTMLInputElement, text: string) {
  input.value = text
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await flushPromises()
}

beforeEach(() => {
  signInAs(kitty)
  document.body.innerHTML = ''
})

afterEach(() => {
  page?.unmount()
  page = undefined
})

describe('the result sheet', () => {
  it('is the full-screen sheet titled „Ergebnis eintragen“, with the game\'s name above the rows', async () => {
    const entry = await mount()

    expect(sheet().querySelector('h2')?.textContent).toBe('Ergebnis eintragen')
    expect(entry.findComponent(AppSheet).props('full')).toBe(true)
    expect(sheet().textContent).toContain('Mario Kart')
    expect(sheet().textContent).toContain('Ordne die Parteien per Ziehen am Griff oder mit den Pfeil-Buttons.')
  })

  it('shows the longest game name allowed in full, also without a space in it', async () => {
    const longest = 'W'.repeat(GAME_NAME_MAX)
    await mount({ game: { ...game, name: longest } })

    expect(sheet().textContent).toContain(longest)
  })

  describe('the kicker (#274)', () => {
    const kickerLine = () => [...sheet().querySelectorAll('p')].find(line => line.textContent?.trim().startsWith('Spiel '))

    it('says which game it will be above the game\'s name, when the page knows', async () => {
      await mount({ kicker: { number: 3, total: 6 } })

      const kicker = kickerLine()
      expect(kicker?.textContent?.trim()).toBe('Spiel 3 von 6')
      const name = [...sheet().querySelectorAll('p')].find(line => line.textContent?.trim() === 'Mario Kart')!
      expect(kicker!.compareDocumentPosition(name) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })

    it('shows no such line without a kicker', async () => {
      await mount()
      expect(kickerLine()).toBeUndefined()
      expect(sheet().textContent).not.toContain(' von ')

      page!.unmount()
      await mount({ kicker: null })
      expect(kickerLine()).toBeUndefined()
    })
  })

  describe('in correction mode (#275)', () => {
    const line = (team: number, place: number, score: string | null = null) => ({ team, place, points: 0, score })
    /** Team 1 and 2 share Place 1, team 3 is third; Scores on 1 and 3. */
    const shared = { number: 3, places: [line(1, 1, '16'), line(2, 1), line(3, 3, '8')] }
    const correctionSave = () => footerButton('Korrektur speichern')
    const noteLine = () => [...sheet().querySelectorAll('[role="status"]')].find(item => item.textContent?.includes('rechnet nach dem Speichern neu'))

    it('is titled „Spiel 3 korrigieren“ with the kicker „Korrektur: Spiel 3 von 6“, the note and „Korrektur speichern“', async () => {
      await mount({ correction: shared, kicker: { number: 3, total: 6 } })

      expect(sheet().querySelector('h2')?.textContent).toBe('Spiel 3 korrigieren')
      expect([...sheet().querySelectorAll('p')].some(line => line.textContent?.trim() === 'Korrektur: Spiel 3 von 6')).toBe(true)
      expect(noteLine()?.textContent).toContain('In der Aktivität steht, dass du Spiel 3 korrigiert hast.')
      expect(correctionSave()).toBeDefined()
      expect(footerButton('Ergebnis speichern')).toBeUndefined()
      expect(sheet().textContent).toContain('Mario Kart')
    })

    it('opens with the saved order, Places, Scores and points: a stored 1, 1, 3 shows 1, 1, 3 with „gleichauf“ on', async () => {
      await mount({ correction: shared })

      expect(names()).toEqual(['Wilde Gurken', 'Die Füchse', 'Team Gelb'])
      expect(places()).toEqual(['1', '1', '3'])
      expect(rows().map(earnsOf)).toEqual(['+2 Punkte', '+2 Punkte', '+0 Punkte'])
      expect(switches().map(item => item.getAttribute('aria-checked'))).toEqual(['true', 'false'])
      expect(scoreField('Wilde Gurken').value).toBe('16')
      expect(scoreField('Die Füchse').value).toBe('')
      expect(scoreField('Team Gelb').value).toBe('8')
    })

    it('starts from the saved order when it is not team order', async () => {
      await mount({ correction: { number: 1, places: [line(3, 1), line(1, 2), line(2, 3)] } })

      expect(names()).toEqual(['Team Gelb', 'Wilde Gurken', 'Die Füchse'])
      expect(places()).toEqual(['1', '2', '3'])
    })

    it('sends exactly the stored Places when nothing was touched', async () => {
      const save = vi.fn(async (_places: ResultPlace[]) => true)
      await mount({ correction: shared, save })

      await click(correctionSave())

      expect(save).toHaveBeenCalledWith([
        { team: 1, place: 1, score: '16' },
        { team: 2, place: 1, score: null },
        { team: 3, place: 3, score: '8' },
      ])
    })

    it('sends a changed order and a changed Score as changed', async () => {
      const save = vi.fn(async (_places: ResultPlace[]) => true)
      await mount({ correction: shared, save })

      await click(button('Nach unten: Die Füchse'))
      await type(scoreField('Team Gelb'), '9')
      await click(correctionSave())

      expect(save).toHaveBeenCalledWith([
        { team: 1, place: 1, score: '16' },
        { team: 3, place: 2, score: '9' },
        { team: 2, place: 3, score: null },
      ])
    })

    it('stays open with the draft when the server refused, and closes when it took the Correction', async () => {
      const save = vi.fn(async (_places: ResultPlace[]) => false)
      const entry = await mount({ correction: shared, save })

      await type(scoreField('Die Füchse'), '5')
      await click(correctionSave())
      expect(save).toHaveBeenCalledTimes(1)
      expect(entry.emitted('close')).toBeUndefined()
      expect(scoreField('Die Füchse').value).toBe('5')

      save.mockResolvedValue(true)
      await click(correctionSave())
      expect(entry.emitted('close')).toHaveLength(1)
    })

    it('starts from the saved Result again after closing, not from the edited draft', async () => {
      const entry = await mount({ correction: shared })
      await click(button('Nach unten: Wilde Gurken'))
      await type(scoreField('Team Gelb'), '1')

      await entry.setProps({ open: false })
      await entry.setProps({ open: true })
      await flushPromises()

      expect(names()).toEqual(['Wilde Gurken', 'Die Füchse', 'Team Gelb'])
      expect(places()).toEqual(['1', '1', '3'])
      expect(scoreField('Team Gelb').value).toBe('8')
    })

    it('shows another Result when it opens for another Round', async () => {
      const entry = await mount({ correction: shared })

      await entry.setProps({ open: false })
      await entry.setProps({ open: true, correction: { number: 5, places: [line(2, 1, '3'), line(1, 2), line(3, 3)] } })
      await flushPromises()

      expect(sheet().querySelector('h2')?.textContent).toBe('Spiel 5 korrigieren')
      expect(names()).toEqual(['Die Füchse', 'Wilde Gurken', 'Team Gelb'])
      expect(scoreField('Die Füchse').value).toBe('3')
    })

    it('shows nothing of it without a correction', async () => {
      await mount()

      expect(sheet().querySelector('h2')?.textContent).toBe('Ergebnis eintragen')
      expect(noteLine()).toBeUndefined()
      expect(sheet().textContent).not.toContain('Korrektur')
      expect(footerButton('Korrektur speichern')).toBeUndefined()
    })

    it('holds 2 and 8 Parties', async () => {
      await mount({ teams: teams(['Eins', 'Zwei']), correction: { number: 1, places: [line(2, 1, '3'), line(1, 2)] } })
      expect(names()).toEqual(['Zwei', 'Eins'])
      expect(places()).toEqual(['1', '2'])

      page!.unmount()
      const eight = teams(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'])
      await mount({ teams: eight, pointsTable: { preset: 'linear', values: [7, 6, 5, 4, 3, 2, 1, 0] }, correction: { number: 2, places: eight.map(team => line(team.position, 1)) } })
      expect(names()).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'])
      expect(places()).toEqual(Array(8).fill('1'))
      expect(switches().every(item => item.getAttribute('aria-checked') === 'true')).toBe(true)
    })
  })

  it('opens with the Parties in team order, Places 1, 2, 3, empty Scores and each row\'s points', async () => {
    await mount()

    expect(names()).toEqual(['Wilde Gurken', 'Die Füchse', 'Team Gelb'])
    expect(places()).toEqual(['1', '2', '3'])
    expect(rows().map(earnsOf)).toEqual(['+2 Punkte', '+1 Punkt', '+0 Punkte'])
    for (const input of sheet().querySelectorAll<HTMLInputElement>('input')) expect(input.value).toBe('')
  })

  it('moves a row with the buttons and says where the Party stands now', async () => {
    await mount()

    await click(button('Nach unten: Wilde Gurken'))

    expect(names()).toEqual(['Die Füchse', 'Wilde Gurken', 'Team Gelb'])
    expect(places()).toEqual(['1', '2', '3'])
    expect(status()).toBe('Wilde Gurken jetzt Platz 2.')
    await click(button('Nach oben: Team Gelb'))
    expect(names()).toEqual(['Die Füchse', 'Team Gelb', 'Wilde Gurken'])
    expect(status()).toBe('Team Gelb jetzt Platz 2.')
  })

  it('disables „Nach oben“ on the first row and „Nach unten“ on the last', async () => {
    await mount()

    expect(button('Nach oben: Wilde Gurken').disabled).toBe(true)
    expect(button('Nach unten: Wilde Gurken').disabled).toBe(false)
    expect(button('Nach unten: Team Gelb').disabled).toBe(true)
    expect(button('Nach oben: Team Gelb').disabled).toBe(false)
  })

  it('has a handle per row, named for its Party', async () => {
    await mount()

    expect(rows().map(row => row.querySelector('button[aria-label$="verschieben"]')?.getAttribute('aria-label'))).toEqual([
      'Wilde Gurken verschieben', 'Die Füchse verschieben', 'Team Gelb verschieben',
    ])
  })

  it('has n-1 „gleichauf“ switches; turning one on gives the lower row the upper row\'s Place and points (1, 1, 3)', async () => {
    await mount()

    expect(switches()).toHaveLength(2)
    expect(switches().map(item => item.getAttribute('aria-checked'))).toEqual(['false', 'false'])
    expect(switches()[0]!.textContent?.trim()).toBe('gleichauf')
    expect(switches()[0]!.getAttribute('aria-label')).toBe('Die Füchse gleichauf mit Wilde Gurken')

    await click(switches()[0]!)

    expect(switches()[0]!.getAttribute('aria-checked')).toBe('true')
    expect(places()).toEqual(['1', '1', '3'])
    expect(rows().map(earnsOf)).toEqual(['+2 Punkte', '+2 Punkte', '+0 Punkte'])
    await click(switches()[1]!)
    expect(places()).toEqual(['1', '1', '1'])
    expect(rows().map(earnsOf)).toEqual(['+2 Punkte', '+2 Punkte', '+2 Punkte'])
    await click(switches()[0]!)
    expect(places()).toEqual(['1', '2', '2'])
  })

  it('clears the „gleichauf“ flags that touch the moved rows and keeps the ones outside', async () => {
    await mount({ teams: teams(['A', 'B', 'C', 'D', 'E']), pointsTable: { preset: 'linear', values: [4, 3, 2, 1, 0] } })
    for (const index of [0, 1, 2, 3]) await click(switches()[index]!)
    expect(places()).toEqual(['1', '1', '1', '1', '1'])

    await click(button('Nach unten: B'))

    // B and C swapped: the gaps above B, between B and C and below C are new neighbours; the gap between D and E is outside the move.
    expect(names()).toEqual(['A', 'C', 'B', 'D', 'E'])
    expect(switches().map(item => item.getAttribute('aria-checked'))).toEqual(['false', 'false', 'false', 'true'])
    expect(places()).toEqual(['1', '2', '3', '4', '4'])
  })

  it('cuts a Score at 7 characters as the User sees them', async () => {
    await mount()

    await type(scoreField('Wilde Gurken'), '123456789')
    expect(scoreField('Wilde Gurken').value).toBe('1234567')

    const family = '👨‍👩‍👧'
    await type(scoreField('Die Füchse'), family.repeat(7))
    expect(scoreField('Die Füchse').value).toBe(family.repeat(7))
    await type(scoreField('Die Füchse'), family.repeat(9))
    expect(scoreField('Die Füchse').value).toBe(family.repeat(7))
  })

  it('previews the points of a custom table by the order', async () => {
    await mount({ pointsTable: { preset: 'custom', values: [5, 3, 0] } })

    expect(rows().map(earnsOf)).toEqual(['+5 Punkte', '+3 Punkte', '+0 Punkte'])
    await click(button('Nach unten: Wilde Gurken'))
    expect(nameOf(rows()[1]!)).toBe('Wilde Gurken')
    expect(rows().map(earnsOf)).toEqual(['+5 Punkte', '+3 Punkte', '+0 Punkte'])
    await click(switches()[1]!)
    expect(rows().map(earnsOf)).toEqual(['+5 Punkte', '+3 Punkte', '+3 Punkte'])
  })

  it('sends nothing while ordering, toggling and typing', async () => {
    const save = vi.fn(async () => true)
    await mount({ save })

    await click(button('Nach unten: Wilde Gurken'))
    await click(switches()[0]!)
    await type(scoreField('Die Füchse'), '16')

    expect(save).not.toHaveBeenCalled()
  })

  it('saves the Places in row order with trimmed Scores, null for an empty one, and Places 1, 1, 3', async () => {
    const save = vi.fn(async (_places: ResultPlace[]) => true)
    await mount({ save })
    await click(button('Nach unten: Wilde Gurken'))
    await click(switches()[0]!)
    await type(scoreField('Wilde Gurken'), ' 16 ')
    await type(scoreField('Team Gelb'), '0')

    await click(saveButton())

    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith([
      { team: 2, place: 1, score: null },
      { team: 1, place: 1, score: '16' },
      { team: 3, place: 3, score: '0' },
    ])
  })

  it('sends once when „Ergebnis speichern“ is pressed again while the save is pending, then closes on true', async () => {
    let answer: (taken: boolean) => void = () => undefined
    const save = vi.fn(() => new Promise<boolean>((resolve) => {
      answer = resolve
    }))
    const entry = await mount({ save })

    await click(saveButton())
    await click(saveButton())

    expect(save).toHaveBeenCalledTimes(1)
    expect(saveButton().disabled).toBe(true)
    expect(entry.emitted('close')).toBeUndefined()

    answer(true)
    await flushPromises()
    expect(entry.emitted('close')).toHaveLength(1)
  })

  it('stays open with the order and the Scores when the server refused, and can save again', async () => {
    const save = vi.fn(async () => false)
    const entry = await mount({ save })
    await click(button('Nach unten: Wilde Gurken'))
    await type(scoreField('Die Füchse'), '16:12')

    await click(saveButton())

    expect(entry.emitted('close')).toBeUndefined()
    expect(dialog()).not.toBeNull()
    expect(names()).toEqual(['Die Füchse', 'Wilde Gurken', 'Team Gelb'])
    expect(scoreField('Die Füchse').value).toBe('16:12')
    expect(saveButton().disabled).toBe(false)
    await click(saveButton())
    expect(save).toHaveBeenCalledTimes(2)
  })

  it('discards the draft on close and starts from team order when it opens again', async () => {
    const entry = await mount()
    await click(button('Nach unten: Wilde Gurken'))
    await click(switches()[0]!)
    await type(scoreField('Die Füchse'), '9')

    await entry.setProps({ open: false })
    await entry.setProps({ open: true })
    await flushPromises()

    expect(names()).toEqual(['Wilde Gurken', 'Die Füchse', 'Team Gelb'])
    expect(places()).toEqual(['1', '2', '3'])
    expect(scoreField('Die Füchse').value).toBe('')
    expect(status()).toBe('')
  })

  it('holds 2 Parties and 8 Parties', async () => {
    await mount({ teams: teams([null, null]), pointsTable: { preset: 'linear', values: [1, 0] } })
    expect(names()).toEqual(['Team Rot', 'Team Orange'])
    expect(switches()).toHaveLength(1)
    page!.unmount()
    document.body.innerHTML = ''

    await mount({ teams: teams([null, null, null, null, null, null, null, null]), pointsTable: { preset: 'linear', values: [7, 6, 5, 4, 3, 2, 1, 0] } })
    expect(rows()).toHaveLength(8)
    expect(switches()).toHaveLength(7)
    expect(rows().map(earnsOf)[0]).toBe('+7 Punkte')
    expect(button('Nach unten: Team Nacht').disabled).toBe(true)
  })

  it('shortens a very long Team name in the row and keeps the whole name in its title', async () => {
    const long = 'Die allerwildesten Gurken der Welt und Umgebung'
    await mount({ teams: teams([long, null, null]) })

    const name = rows()[0]!.querySelector('[data-name]')!
    expect(name.getAttribute('title')).toBe(long)
    expect(name.className).toContain('truncate')
  })

  describe('dragging by the handle', () => {
    // The rows stand 100 px apart (60 px high), so their middles are 30, 130 and 230.
    beforeEach(() => {
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
        const index = rows().findIndex(row => row.contains(this))
        const top = index < 0 ? 0 : index * 100
        return { top, bottom: top + 60, left: 0, right: 300, width: 300, height: 60, x: 0, y: top, toJSON: () => ({}) }
      })
    })

    afterEach(() => {
      vi.restoreAllMocks()
      vi.useRealTimers()
    })

    const pointer = (type: string, init: PointerEventInit, target: EventTarget = window) => target.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 1, ...init }))
    const handle = (team: string) => button(`${team} verschieben`)

    it('lifts the row after a few pixels of the mouse, shows where it would land and moves it on release', async () => {
      await mount()

      pointer('pointerdown', { button: 0, pointerType: 'mouse', clientX: 10, clientY: 30 }, handle('Wilde Gurken'))
      pointer('pointermove', { pointerType: 'mouse', clientX: 10, clientY: 100 })
      await flushPromises()

      expect(rows()[0]!.querySelector('[data-team]')!.className).toContain('shadow-lift')
      expect(rows()[1]!.querySelector('span.absolute.bg-primary')).not.toBeNull()
      expect(names()).toEqual(['Wilde Gurken', 'Die Füchse', 'Team Gelb'])

      pointer('pointerup', { pointerType: 'mouse', clientX: 10, clientY: 100 })
      await flushPromises()

      expect(names()).toEqual(['Die Füchse', 'Wilde Gurken', 'Team Gelb'])
      expect(status()).toBe('Wilde Gurken jetzt Platz 2.')
      expect(sheet().querySelector('.shadow-lift')).toBeNull()
    })

    it('does not pick up on a click, and Escape cancels a drag without closing the sheet', async () => {
      const entry = await mount()
      pointer('pointerdown', { button: 0, pointerType: 'mouse', clientX: 10, clientY: 30 }, handle('Wilde Gurken'))
      pointer('pointermove', { pointerType: 'mouse', clientX: 11, clientY: 31 })
      pointer('pointerup', { pointerType: 'mouse', clientX: 11, clientY: 31 })
      await flushPromises()
      expect(names()).toEqual(['Wilde Gurken', 'Die Füchse', 'Team Gelb'])

      pointer('pointerdown', { button: 0, pointerType: 'mouse', clientX: 10, clientY: 30 }, handle('Wilde Gurken'))
      pointer('pointermove', { pointerType: 'mouse', clientX: 10, clientY: 240 })
      await flushPromises()
      expect(sheet().querySelector('.shadow-lift')).not.toBeNull()
      sheet().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      await flushPromises()

      expect(sheet().querySelector('.shadow-lift')).toBeNull()
      expect(names()).toEqual(['Wilde Gurken', 'Die Füchse', 'Team Gelb'])
      expect(entry.emitted('close')).toBeUndefined()
    })

    it('lifts a row for a finger only after the long press, and a finger that moves before is scrolling', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
      await mount()

      pointer('pointerdown', { button: 0, pointerType: 'touch', clientX: 10, clientY: 30 }, handle('Wilde Gurken'))
      pointer('pointermove', { pointerType: 'touch', clientX: 10, clientY: 60 })
      vi.advanceTimersByTime(400)
      await flushPromises()
      expect(sheet().querySelector('.shadow-lift')).toBeNull()

      pointer('pointerdown', { button: 0, pointerType: 'touch', clientX: 10, clientY: 30 }, handle('Wilde Gurken'))
      vi.advanceTimersByTime(299)
      await flushPromises()
      expect(sheet().querySelector('.shadow-lift')).toBeNull()
      vi.advanceTimersByTime(1)
      await flushPromises()
      expect(sheet().querySelector('.shadow-lift')).not.toBeNull()
      pointer('pointermove', { pointerType: 'touch', clientX: 10, clientY: 250 })
      pointer('pointerup', { pointerType: 'touch', clientX: 10, clientY: 250 })
      await flushPromises()

      expect(names()).toEqual(['Die Füchse', 'Team Gelb', 'Wilde Gurken'])
    })
  })

  it('glides the rows with the spring over the slow duration, and not under reduced motion (04-motion, CODING_STANDARDS § Motion)', async () => {
    const entry = await mount()

    const list = entry.findComponent({ name: 'TransitionGroup' })
    expect(list.exists()).toBe(true)
    const moveClass = String(list.props('moveClass')).split(' ')
    expect(moveClass).toEqual(expect.arrayContaining(['transition-transform', 'dur-slower', 'ease-spring', 'motion-reduce:transition-none', 'reduced:transition-none']))
  })
})
