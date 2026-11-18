import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { createError, readBody } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import GameBrowser from '~/components/GameBrowser.vue'
import DetailPage from '~/pages/bibliothek/[id]/index.vue'
import LibraryPage from '~/pages/bibliothek/index.vue'
import { GAME_NAME_MAX, NO_FILTERS, type GameFilters, type GameView } from '~~/shared/game'
import { signInAs } from './auth'
import { game, host, settle } from './helpers/library'

// Archived games in the library (#467, spec #717 § B): the normal list leaves them out, the chip „Archiviert“ shows only them, a card there
// restores its game, and the game's page has the switch. The list is the mocked `/api/games`; the PUT changes it the way the server would.

const ID = (n: number) => `00000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`
const LONG_NAME = 'W'.repeat(GAME_NAME_MAX)

let list: GameView[] = []
let detail: GameView = game({ id: ID(1), name: 'Mario Kart' })
let putFails = false
const archivePut = vi.fn<(id: string, body: unknown) => void>()

registerEndpoint('/api/games', {
  method: 'GET',
  handler: () => ({ games: list, tagsInUse: [] }),
})

// One PUT and one GET endpoint per game used below; each id is registered once for the file.
for (const n of [1, 2, 3]) {
  registerEndpoint(`/api/games/${ID(n)}/archived`, {
    method: 'PUT',
    handler: async (event) => {
      const body = await readBody(event)
      archivePut(ID(n), body)
      if (putFails) throw createError({ statusCode: 400, statusMessage: 'invalid_value' })
      list = list.map(item => (item.id === ID(n) ? { ...item, archived: body.archived } : item))
      detail = { ...detail, archived: body.archived }
      return detail
    },
  })
}
registerEndpoint(`/api/games/${ID(1)}`, {
  method: 'GET',
  handler: () => detail,
})

const names = (page: VueWrapper) => page.findAll('main ul li').map(card => card.get('b, a').text())
const chip = (page: VueWrapper, text: string) => page.findAll('main button').find(button => button.text() === text)!
const query = () => useRouter().currentRoute.value.query
const restoreButtons = (page: VueWrapper) => page.findAll('main ul li button').filter(button => button.text() === 'Wiederherstellen')
const toasts = () => (useState('toasts').value as { tone: string, text: string }[]).map(({ tone, text }) => ({ tone, text }))

const normal = game({ id: ID(1), name: 'Mario Kart' })
const old = game({ id: ID(2), name: 'Alt Halo', archived: true })
const oldLong = game({ id: ID(3), name: LONG_NAME, archived: true })

beforeEach(async () => {
  signInAs(host)
  await useRouter().push('/bibliothek')
  list = []
  detail = normal
  putFails = false
  archivePut.mockClear()
  useState('toasts').value = []
  await clearNuxtData('games')
  useState('game-library').value = null
  await clearNuxtData(`game-${ID(1)}`)
})

describe('the library list and the filter „Archiviert“ (#467)', () => {
  it('leaves Archived games out of the normal list and shows only them with the chip pressed, written to the address', async () => {
    list = [normal, old]
    const page = await mountSuspended(LibraryPage, { route: '/bibliothek' })
    await settle(page)

    expect(names(page)).toEqual(['Mario Kart'])
    expect(chip(page, 'Archiviert').attributes('aria-pressed')).toBe('false')

    await chip(page, 'Archiviert').trigger('click')

    expect(names(page)).toEqual(['Alt Halo'])
    expect(chip(page, 'Archiviert').attributes('aria-pressed')).toBe('true')
    expect(chip(page, 'Alle').attributes('aria-pressed')).toBe('false')
    await vi.waitFor(() => expect(query().archived).toBe('1'))
  })

  it('„Alle“ clears the filter and shows the normal list again', async () => {
    list = [normal, old]
    const page = await mountSuspended(LibraryPage, { route: '/bibliothek?archived=1' })
    await settle(page)
    expect(names(page)).toEqual(['Alt Halo'])

    await chip(page, 'Alle').trigger('click')

    expect(names(page)).toEqual(['Mario Kart'])
    expect(chip(page, 'Archiviert').attributes('aria-pressed')).toBe('false')
    await vi.waitFor(() => expect(query().archived).toBeUndefined())
  })

  it('loads the filter from ?archived=1, and an address without it is the normal list', async () => {
    list = [normal, old]
    const filtered = await mountSuspended(LibraryPage, { route: '/bibliothek?archived=1' })
    await settle(filtered)
    expect(names(filtered)).toEqual(['Alt Halo'])
    expect(chip(filtered, 'Archiviert').attributes('aria-pressed')).toBe('true')
    filtered.unmount()

    await useRouter().push('/bibliothek?q=kart')
    const plain = await mountSuspended(LibraryPage, { route: '/bibliothek?q=kart' })
    await settle(plain)
    expect(names(plain)).toEqual(['Mario Kart'])
    expect(chip(plain, 'Archiviert').attributes('aria-pressed')).toBe('false')
  })

  it('counts the games of the current list in the search placeholder, at 0, 1 and 2 Archived games', async () => {
    list = [normal]
    const none = await mountSuspended(LibraryPage, { route: '/bibliothek' })
    await settle(none)
    expect(none.get('input[type="search"]').attributes('placeholder')).toBe('1 Spiel durchsuchen')
    await chip(none, 'Archiviert').trigger('click')
    expect(names(none)).toEqual([])
    expect(none.get('input[type="search"]').attributes('placeholder')).toBe('0 Spiele durchsuchen')
    none.unmount()

    await clearNuxtData('games')
    useState('game-library').value = null
    await useRouter().push('/bibliothek')
    list = [normal, old]
    const one = await mountSuspended(LibraryPage, { route: '/bibliothek' })
    await settle(one)
    expect(one.get('input[type="search"]').attributes('placeholder')).toBe('1 Spiel durchsuchen')
    await chip(one, 'Archiviert').trigger('click')
    expect(names(one)).toEqual(['Alt Halo'])
    expect(one.get('input[type="search"]').attributes('placeholder')).toBe('1 Spiel durchsuchen')
    one.unmount()

    await clearNuxtData('games')
    useState('game-library').value = null
    await useRouter().push('/bibliothek')
    list = [normal, old, oldLong]
    const two = await mountSuspended(LibraryPage, { route: '/bibliothek' })
    await settle(two)
    expect(two.get('input[type="search"]').attributes('placeholder')).toBe('1 Spiel durchsuchen')
    await chip(two, 'Archiviert').trigger('click')
    expect(names(two)).toEqual(['Alt Halo', LONG_NAME])
    expect(two.get('input[type="search"]').attributes('placeholder')).toBe('2 Spiele durchsuchen')
  })

  it('shows the filter row and „Nix gefunden.“ in the normal list of a library whose games are all Archived', async () => {
    list = [old, oldLong]
    const page = await mountSuspended(LibraryPage, { route: '/bibliothek' })
    await settle(page)

    expect(page.text()).toContain('Nix gefunden.')
    expect(page.find('main ul li').exists()).toBe(false)
    expect(chip(page, 'Archiviert')).toBeTruthy()

    await chip(page, 'Archiviert').trigger('click')
    expect(names(page)).toEqual(['Alt Halo', LONG_NAME])
  })

  it('shows „Nix gefunden.“ in the filter when no game is Archived', async () => {
    list = [normal]
    const page = await mountSuspended(LibraryPage, { route: '/bibliothek?archived=1' })
    await settle(page)

    expect(page.text()).toContain('Nix gefunden.')
  })
})

describe('the compact browser of the pickers (#467)', () => {
  it('has no chip „Archiviert“ and lists no Archived game', async () => {
    list = [normal, old]
    const page = await mountSuspended(GameBrowser, { props: { compact: true, filters: { ...NO_FILTERS } as GameFilters } })
    await settle(page)

    expect(page.findAll('button').map(button => button.text())).not.toContain('Archiviert')
    expect(page.findAll('li').map(card => card.get('b, a').text())).toEqual(['Mario Kart'])
  })
})

describe('restoring from a card (#467)', () => {
  it('puts a Wiederherstellen button on every card of the filter and none in the normal list', async () => {
    list = [normal, old, oldLong]
    const page = await mountSuspended(LibraryPage, { route: '/bibliothek' })
    await settle(page)
    expect(restoreButtons(page)).toHaveLength(0)

    await chip(page, 'Archiviert').trigger('click')

    expect(restoreButtons(page)).toHaveLength(2)
    expect(restoreButtons(page).map(button => button.attributes('aria-label'))).toEqual(['Alt Halo wiederherstellen', `${LONG_NAME} wiederherstellen`])
  })

  it('keeps the button on the card\'s bottom edge for the longest allowed name', async () => {
    list = [oldLong]
    const page = await mountSuspended(LibraryPage, { route: '/bibliothek?archived=1' })
    await settle(page)

    const card = page.get('main ul li > *').element as HTMLElement
    expect(card.lastElementChild!.querySelector('button')?.textContent?.trim()).toBe('Wiederherstellen')
  })

  it('sends the restore, shows the toast, and the card leaves the filter after the refetch', async () => {
    list = [normal, old]
    const page = await mountSuspended(LibraryPage, { route: '/bibliothek?archived=1' })
    await settle(page)

    await restoreButtons(page)[0]!.trigger('click')

    await vi.waitFor(() => expect(names(page)).toEqual([]))
    expect(archivePut).toHaveBeenCalledWith(ID(2), { archived: false })
    expect(toasts()).toEqual([{ tone: 'success', text: 'Wiederhergestellt.' }])
    await chip(page, 'Alle').trigger('click')
    expect(names(page).sort()).toEqual(['Alt Halo', 'Mario Kart'])
  })

  it('shows the error toast and keeps the card when the call fails', async () => {
    list = [old]
    putFails = true
    const page = await mountSuspended(LibraryPage, { route: '/bibliothek?archived=1' })
    await settle(page)

    await restoreButtons(page)[0]!.trigger('click')

    await vi.waitFor(() => expect(toasts().map(toast => toast.tone)).toEqual(['error']))
    expect(names(page)).toEqual(['Alt Halo'])
  })
})

describe('the switch on the game\'s page (#467)', () => {
  const archivedSwitch = (page: VueWrapper) => page.get('[role="switch"]')

  it('is off for a normal game, with its help line', async () => {
    const page = await mountSuspended(DetailPage, { route: `/bibliothek/${ID(1)}` })
    await settle(page)

    expect(archivedSwitch(page).text()).toContain('Archiviert')
    expect(archivedSwitch(page).attributes('aria-checked')).toBe('false')
    expect(archivedSwitch(page).text()).toContain('Archivierte Spiele zeigt die Bibliothek nur im Filter „Archiviert“. Du kannst sie jederzeit zurückholen.')
  })

  it('is on for an Archived game', async () => {
    detail = { ...normal, archived: true }
    const page = await mountSuspended(DetailPage, { route: `/bibliothek/${ID(1)}` })
    await settle(page)

    expect(archivedSwitch(page).attributes('aria-checked')).toBe('true')
  })

  it('archives on a click, shows the new state and the toast, and restores on the next click; the page stays open', async () => {
    const page = await mountSuspended(DetailPage, { route: `/bibliothek/${ID(1)}` })
    await settle(page)

    await archivedSwitch(page).trigger('click')

    await vi.waitFor(() => expect(archivedSwitch(page).attributes('aria-checked')).toBe('true'))
    expect(archivePut).toHaveBeenLastCalledWith(ID(1), { archived: true })
    expect(toasts()).toEqual([{ tone: 'success', text: 'Archiviert.' }])
    expect(page.get('h1').text()).toBe('Mario Kart')

    await archivedSwitch(page).trigger('click')

    await vi.waitFor(() => expect(archivedSwitch(page).attributes('aria-checked')).toBe('false'))
    expect(archivePut).toHaveBeenLastCalledWith(ID(1), { archived: false })
    expect(toasts().at(-1)).toEqual({ tone: 'success', text: 'Wiederhergestellt.' })
  })

  it('keeps the switch where it was and shows the error toast when the call fails', async () => {
    putFails = true
    const page = await mountSuspended(DetailPage, { route: `/bibliothek/${ID(1)}` })
    await settle(page)

    await archivedSwitch(page).trigger('click')

    await vi.waitFor(() => expect(toasts().map(toast => toast.tone)).toEqual(['error']))
    expect(archivedSwitch(page).attributes('aria-checked')).toBe('false')
  })
})
