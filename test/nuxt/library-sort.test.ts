import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import LibraryPage from '~/pages/bibliothek/index.vue'
import type { GameView } from '~~/shared/game'
import { signInAs } from './auth'
import { game, host, settle } from './helpers/library'
import { stubInView } from './in-view'

// The sort „Lange nicht gespielt“ in the library (#901): a select beside the filters, its own address key `sort`, the list
// ordered by the Berlin day of each game's latest Result (`lastPlayed`, #900), the games never played first. The sort hides
// nothing: „Alle“ and the filters leave it alone, and a change of it returns the paging to 40 cards (as a filter does).

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

let list: GameView[] = []
// `undefined` is the answer of the previous deployment, which has no `lastPlayed` (#900).
let lastPlayed: Record<string, string> | undefined = {}
registerEndpoint('/api/games', {
  method: 'GET',
  handler: () => (lastPlayed === undefined
    ? { games: list, tagsInUse: [], eventCounts: {} }
    : { games: list, tagsInUse: [], eventCounts: {}, lastPlayed }),
})

const names = (page: VueWrapper) => page.findAll('main ul li').map(card => card.get('b, a').text())
const chip = (page: VueWrapper, text: string) => page.findAll('main button').find(button => button.text() === text)!
const sortSelect = (page: VueWrapper) => page.get('select[aria-label="Sortierung"]')
const moreButton = (page: VueWrapper) => page.findAll('main button').find(button => button.text() === 'Mehr laden')
const query = () => useRouter().currentRoute.value.query

const alfa = game({ id: ID(1), name: 'Alfa' })
const bravo = game({ id: ID(2), name: 'Bravo' })
const charlie = game({ id: ID(3), name: 'Charlie' })
const delta = game({ id: ID(4), name: 'Delta' })

beforeEach(async () => {
  signInAs(host)
  await useRouter().push('/bibliothek')
  list = []
  lastPlayed = {}
  await clearNuxtData('games')
  useState('game-library').value = null
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the sort select of the library (#901)', () => {
  it('shows „Sortierung“ after the Tag select, with „Name“ and „Lange nicht gespielt“, and the chip „Archiviert“ after it', async () => {
    list = [alfa]
    const page = await mountSuspended(LibraryPage, { route: '/bibliothek' })
    await settle(page)

    expect(page.findAll('main select').map(select => select.attributes('aria-label'))).toEqual(['Spielerzahl', 'Passt zu', 'Tag', 'Sortierung'])
    expect(sortSelect(page).findAll('option').map(option => [option.attributes('value') ?? '', option.text()])).toEqual([
      ['', 'Name'],
      ['last_played', 'Lange nicht gespielt'],
    ])
    expect((sortSelect(page).element as HTMLSelectElement).value).toBe('')
    expect(sortSelect(page).element.compareDocumentPosition(chip(page, 'Archiviert').element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('lists the never played games first in the list\'s order, then by day, oldest first, and „Name“ brings the list back', async () => {
    list = [alfa, bravo, charlie, delta]
    lastPlayed = { [ID(1)]: '2026-11-02T18:00:00.000Z', [ID(3)]: '2026-11-01T18:00:00.000Z' }
    const page = await mountSuspended(LibraryPage, { route: '/bibliothek' })
    await settle(page)
    expect(names(page)).toEqual(['Alfa', 'Bravo', 'Charlie', 'Delta'])

    await sortSelect(page).setValue('last_played')

    await vi.waitFor(() => expect(names(page)).toEqual(['Bravo', 'Delta', 'Charlie', 'Alfa']))
    expect((sortSelect(page).element as HTMLSelectElement).value).toBe('last_played')
    expect(chip(page, 'Alle').attributes('aria-pressed')).toBe('true')
    await vi.waitFor(() => expect(query().sort).toBe('last_played'))

    await sortSelect(page).setValue('')

    await vi.waitFor(() => expect(names(page)).toEqual(['Alfa', 'Bravo', 'Charlie', 'Delta']))
    await vi.waitFor(() => expect(query().sort).toBeUndefined())
  })

  it('sorts the games a filter keeps, and the games a typed search keeps', async () => {
    list = [
      { ...alfa, suitabilities: ['teams'] },
      { ...bravo, suitabilities: ['teams'] },
      { ...charlie, suitabilities: ['teams'] },
      { ...delta, suitabilities: ['ffa'] },
    ]
    lastPlayed = { [ID(1)]: '2026-11-02T18:00:00.000Z', [ID(3)]: '2026-11-01T18:00:00.000Z' }
    const page = await mountSuspended(LibraryPage, { route: '/bibliothek?suitability=teams' })
    await settle(page)
    expect(names(page)).toEqual(['Alfa', 'Bravo', 'Charlie'])

    await sortSelect(page).setValue('last_played')
    await vi.waitFor(() => expect(names(page)).toEqual(['Bravo', 'Charlie', 'Alfa']))

    await page.get('input[type="search"]').setValue('e')
    await vi.waitFor(() => expect(names(page)).toEqual(['Charlie']))
    await page.get('input[type="search"]').setValue('')
    await vi.waitFor(() => expect(names(page)).toEqual(['Bravo', 'Charlie', 'Alfa']))
  })

  it('sorts the Archived games too, under the chip „Archiviert“', async () => {
    const oldAlfa = game({ id: ID(5), name: 'Alfa', archived: true })
    const oldBravo = game({ id: ID(6), name: 'Bravo', archived: true })
    list = [oldAlfa, oldBravo, charlie]
    lastPlayed = { [ID(5)]: '2026-11-02T18:00:00.000Z' }
    const page = await mountSuspended(LibraryPage, { route: '/bibliothek' })
    await settle(page)

    await chip(page, 'Archiviert').trigger('click')
    await vi.waitFor(() => expect(names(page)).toEqual(['Alfa', 'Bravo']))

    await sortSelect(page).setValue('last_played')
    await vi.waitFor(() => expect(names(page)).toEqual(['Bravo', 'Alfa']))
  })

  it('returns the paging to 40 cards when the sort changes, after „Mehr laden“ had drawn more', async () => {
    // The sentinel's observer sees nothing here: the page draws its next 40 only by „Mehr laden“.
    stubInView()
    const many = Array.from({ length: 45 }, (_, i) => game({ id: ID(100 + i + 1), name: `Spiel ${String(i + 1).padStart(2, '0')}` }))
    list = many
    lastPlayed = { [ID(100 + 45)]: '2026-01-01T10:00:00.000Z', [ID(100 + 1)]: '2026-02-01T10:00:00.000Z' }
    const page = await mountSuspended(LibraryPage, { route: '/bibliothek' })
    await settle(page)
    expect(names(page)).toHaveLength(40)

    await sortSelect(page).setValue('last_played')
    await vi.waitFor(() => expect(names(page)[0]).toBe('Spiel 02'))
    expect(names(page)).toHaveLength(40)
    expect(names(page)).not.toContain('Spiel 01')
    expect(moreButton(page)).toBeDefined()

    await moreButton(page)!.trigger('click')
    await vi.waitFor(() => expect(names(page)).toHaveLength(45))
    expect(names(page).slice(-2)).toEqual(['Spiel 45', 'Spiel 01'])

    await sortSelect(page).setValue('')
    await vi.waitFor(() => expect(names(page)).toHaveLength(40))
    expect(names(page)[0]).toBe('Spiel 01')
  })

  it('keeps „Alle“ from clearing the sort: the select stays, the list stays sorted, and the address keeps only `sort`', async () => {
    const halo = game({ id: ID(7), name: 'Halo' })
    list = [alfa, bravo, halo]
    lastPlayed = { [ID(7)]: '2026-11-02T18:00:00.000Z', [ID(2)]: '2026-11-01T18:00:00.000Z' }
    const page = await mountSuspended(LibraryPage, { route: '/bibliothek?q=halo&sort=last_played' })
    await settle(page)
    expect(names(page)).toEqual(['Halo'])

    await chip(page, 'Alle').trigger('click')

    await vi.waitFor(() => expect(names(page)).toEqual(['Alfa', 'Bravo', 'Halo']))
    expect((sortSelect(page).element as HTMLSelectElement).value).toBe('last_played')
    await vi.waitFor(() => expect(query()).toEqual({ sort: 'last_played' }))
  })

  it('leaves the sort out of the filter count: „Alle“ is pressed with only the sort chosen', async () => {
    list = [alfa, bravo]
    const page = await mountSuspended(LibraryPage, { route: '/bibliothek?sort=last_played' })
    await settle(page)

    expect(chip(page, 'Alle').attributes('aria-pressed')).toBe('true')
    expect((sortSelect(page).element as HTMLSelectElement).value).toBe('last_played')
  })

  it('reads the sort from the address, and an unknown value as „Name“ without rewriting it', async () => {
    list = [alfa, bravo]
    lastPlayed = { [ID(2)]: '2026-11-01T18:00:00.000Z' }
    const sorted = await mountSuspended(LibraryPage, { route: '/bibliothek?sort=last_played' })
    await settle(sorted)
    expect(names(sorted)).toEqual(['Alfa', 'Bravo'])
    expect((sortSelect(sorted).element as HTMLSelectElement).value).toBe('last_played')
    sorted.unmount()

    const unknown = await mountSuspended(LibraryPage, { route: '/bibliothek?sort=bogus' })
    await settle(unknown)
    expect((sortSelect(unknown).element as HTMLSelectElement).value).toBe('')
    expect(names(unknown)).toEqual(['Alfa', 'Bravo'])
    expect(query().sort).toBe('bogus')
  })

  it('follows back: a push of the plain address returns the select to „Name“', async () => {
    list = [alfa, bravo]
    lastPlayed = { [ID(2)]: '2026-11-01T18:00:00.000Z' }
    const page = await mountSuspended(LibraryPage, { route: '/bibliothek?sort=last_played' })
    await settle(page)
    expect(names(page)).toEqual(['Alfa', 'Bravo'])

    await useRouter().push('/bibliothek')

    await vi.waitFor(() => expect((sortSelect(page).element as HTMLSelectElement).value).toBe(''))
  })

  it('sorts without an error when the answer has no `lastPlayed` (the previous deployment): every game is never played', async () => {
    lastPlayed = undefined
    list = [alfa, bravo, charlie]
    const page = await mountSuspended(LibraryPage, { route: '/bibliothek' })
    await settle(page)

    await sortSelect(page).setValue('last_played')

    await vi.waitFor(() => expect(chip(page, 'Alle').attributes('aria-pressed')).toBe('true'))
    expect(names(page)).toEqual(['Alfa', 'Bravo', 'Charlie'])
  })

  it('shows no select for an empty library, and one card with the select for a library of one game', async () => {
    list = []
    const empty = await mountSuspended(LibraryPage, { route: '/bibliothek' })
    await settle(empty)
    expect(empty.find('select[aria-label="Sortierung"]').exists()).toBe(false)
    empty.unmount()

    await clearNuxtData('games')
    useState('game-library').value = null
    list = [alfa]
    const one = await mountSuspended(LibraryPage, { route: '/bibliothek' })
    await settle(one)
    expect(one.find('select[aria-label="Sortierung"]').exists()).toBe(true)
    expect(names(one)).toEqual(['Alfa'])
  })
})
