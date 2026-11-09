import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import LibraryPage from '~/pages/bibliothek/index.vue'
import type { GameView } from '~~/shared/game'
import { signInAs } from './auth'
import { game, host, settle } from './helpers/library'
import { stubInView } from './in-view'

// The library list drawn 40 cards a page (#369): the search and the filters run over every game.
let list: { games: GameView[] } = { games: [] }
registerEndpoint('/api/games', {
  method: 'GET',
  handler: () => ({ games: list.games, tagsInUse: [] }),
})

describe('the library paging (#369)', () => {
  beforeEach(async () => {
    signInAs(host)
    // The test before may have navigated away; each test starts on the library page.
    await useRouter().push('/bibliothek')
    list = { games: [] }
    await clearNuxtData('games')
    useState('game-library').value = null
  })

  const names = (page: VueWrapper) => page.findAll('main ul li').map(card => card.get('b, a').text())
  const chip = (page: VueWrapper, text: string) => page.findAll('main button').find(button => button.text() === text)!

  const nameOf = (i: number) => 'Spiel ' + String(i + 1).padStart(4, '0')
  const listed = (n: number) => Array.from({ length: n }, (_, i) => nameOf(i))
  const library = (n: number, overrides: (i: number) => Partial<GameView> = () => ({})) => Array.from(
    { length: n },
    (_, i) => game({ id: '00000000-0000-4000-8000-' + String(i + 1).padStart(12, '0'), name: nameOf(i), ...overrides(i) }),
  )
  const moreButton = (page: VueWrapper) => page.findAll('main button').find(button => button.text() === 'Mehr laden')
  const status = (page: VueWrapper) => page.find('[role="status"]')
  const sentinel = (page: VueWrapper) => page.find('[aria-hidden="true"].h-px')
  const mountLibrary = async () => {
    const page = await mountSuspended(LibraryPage, { route: '/bibliothek' })
    await settle(page)
    return page
  }

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows the empty state and no paging for an empty library', async () => {
    list = { games: [] }

    const page = await mountLibrary()

    expect(moreButton(page)).toBeUndefined()
    expect(status(page).exists()).toBe(false)
  })

  it('shows one card and no paging for a library of one game', async () => {
    list = { games: library(1) }

    const page = await mountLibrary()

    expect(names(page)).toEqual(listed(1))
    expect(moreButton(page)).toBeUndefined()
    expect(status(page).exists()).toBe(false)
  })

  it('shows all 40 cards of a page without paging', async () => {
    list = { games: library(40) }

    const page = await mountLibrary()

    expect(names(page)).toEqual(listed(40))
    expect(moreButton(page)).toBeUndefined()
    expect(status(page).exists()).toBe(false)
    expect(sentinel(page).exists()).toBe(false)
  })

  it('draws 40 of 41 games, and „Mehr laden“ draws the last one and moves the focus to the count', async () => {
    list = { games: library(41) }
    const page = await mountSuspended(LibraryPage, { route: '/bibliothek', attachTo: document.body })
    await settle(page)

    expect(names(page)).toEqual(listed(40))
    expect(status(page).text()).toBe('40 von 41 Spielen')

    await moreButton(page)!.trigger('click')
    await flushPromises()

    expect(names(page)).toEqual(listed(41))
    expect(moreButton(page)).toBeUndefined()
    expect(status(page).text()).toBe('41 von 41 Spielen')
    expect(document.activeElement).toBe(status(page).element)
    page.unmount()
  })

  it('loads the next 40 when the sentinel comes into view, and keeps the list in order', async () => {
    const observers = stubInView()
    list = { games: library(176) }
    const page = await mountLibrary()
    expect(names(page)).toEqual(listed(40))

    await moreButton(page)!.trigger('click')
    await flushPromises()
    expect(names(page)).toEqual(listed(80))

    observers.see(true)
    await flushPromises()
    expect(names(page)).toEqual(listed(120))
    observers.see(true)
    await flushPromises()
    expect(names(page)).toEqual(listed(160))
    observers.see(true)
    await flushPromises()

    expect(names(page)).toEqual(listed(176))
    expect(moreButton(page)).toBeUndefined()
    expect(sentinel(page).exists()).toBe(false)
  })

  it('draws nothing while the sentinel is out of view', async () => {
    const observers = stubInView()
    list = { games: library(176) }
    const page = await mountLibrary()

    observers.see(false)
    await flushPromises()

    expect(names(page)).toEqual(listed(40))
  })

  it('still draws the next page by „Mehr laden“ without IntersectionObserver', async () => {
    list = { games: library(41) }
    const page = await mountLibrary()
    // NuxtLink creates its shared IntersectionObserver in an idle callback after the cards mount; the global goes away after that.
    await new Promise(resolve => setTimeout(resolve, 20))
    vi.stubGlobal('IntersectionObserver', undefined)

    await moreButton(page)!.trigger('click')
    await flushPromises()

    expect(names(page)).toEqual(listed(41))
  })

  it('pages the full dev library of 1500 games, and the search still counts the whole library', async () => {
    list = { games: library(1500) }

    const page = await mountLibrary()

    expect(names(page)).toEqual(listed(40))
    expect(status(page).text()).toBe('40 von 1500 Spielen')
    expect(page.get('input[type="search"]').attributes('placeholder')).toBe('1500 Spiele durchsuchen')
  })

  it('searches every game, not only the cards drawn so far', async () => {
    list = { games: library(176) }
    const page = await mountLibrary()

    await page.get('input[type="search"]').setValue('Spiel 0150')

    expect(names(page)).toEqual(['Spiel 0150'])
    expect(moreButton(page)).toBeUndefined()
    expect(status(page).exists()).toBe(false)
  })

  it('counts „Von mir“ over every game, not only the cards drawn so far', async () => {
    list = { games: library(176, i => (i < 100 ? { createdBy: { id: 'anna', name: 'Anna' } } : {})) }
    const page = await mountLibrary()

    await chip(page, 'Von mir').trigger('click')

    expect(names(page)).toEqual(listed(176).slice(100, 140))
    expect(status(page).text()).toBe('40 von 76 Spielen')
  })

  it('starts at 40 cards again after a search narrows the list and „Alle“ widens it', async () => {
    list = { games: library(176, i => (i < 30 ? { name: 'Rarität ' + String(i + 1).padStart(2, '0') } : {})) }
    const page = await mountLibrary()
    await moreButton(page)!.trigger('click')
    await flushPromises()
    expect(names(page)).toHaveLength(80)

    await page.get('input[type="search"]').setValue('Rarität')
    expect(names(page)).toHaveLength(30)
    expect(moreButton(page)).toBeUndefined()

    await chip(page, 'Alle').trigger('click')
    await flushPromises()

    expect(names(page)).toHaveLength(40)
    expect(moreButton(page)).toBeDefined()
  })

  it('starts at 40 cards again when a filter leaves more than one page', async () => {
    list = { games: library(176, i => (i < 76 ? { createdBy: { id: 'anna', name: 'Anna' } } : {})) }
    const page = await mountLibrary()
    await moreButton(page)!.trigger('click')
    await flushPromises()
    await moreButton(page)!.trigger('click')
    await flushPromises()
    expect(names(page)).toHaveLength(120)

    await chip(page, 'Von mir').trigger('click')
    await flushPromises()

    expect(names(page)).toHaveLength(40)
    expect(status(page).text()).toBe('40 von 100 Spielen')
  })

  it('keeps the cards drawn so far when the library list is refreshed', async () => {
    list = { games: library(176) }
    const page = await mountLibrary()
    await moreButton(page)!.trigger('click')
    await flushPromises()
    expect(names(page)).toHaveLength(80)

    await refreshGameLibrary()
    await flushPromises()

    expect(names(page)).toHaveLength(80)
  })
})
