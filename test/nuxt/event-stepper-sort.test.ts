import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CreatePage from '~/pages/neu.vue'
import type { GameView } from '~~/shared/game'
import { kitty, signInAs } from './auth'

// The sort „Lange nicht gespielt“ at the Game pool step (#901): the step's browser has the select and orders its picker's cards,
// the sort stays out of the address, and the „zuletzt am“ pills of the step still show (#900). The sort is local to the step.

const host = { ...kitty, canHost: true }

function game(n: number, name: string, overrides: Partial<GameView> = {}): GameView {
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    name,
    imageUrl: null,
    youtubeId: null,
    clipStart: 0,
    clipLength: 30,
    playersMin: 2,
    playersMax: 8,
    suitabilities: ['teams'],
    updatedAt: '2026-01-15T10:00:00.000Z',
    notes: null,
    tags: [],
    archived: false,
    price: null,
    ...overrides,
  }
}

const alfa = game(1, 'Alfa')
const bravo = game(2, 'Bravo')
const charlie = game(3, 'Charlie')

let library: GameView[] = []
let libraryLastPlayed: Record<string, string> = {}
registerEndpoint('/api/games', {
  method: 'GET',
  handler: () => ({ games: library, tagsInUse: [{ key: 'retro', label: 'Retro' }], eventCounts: {}, lastPlayed: libraryLastPlayed }),
})
registerEndpoint('/api/games/tags', { method: 'GET', handler: () => [{ key: 'retro', label: 'Retro' }] })

type Page = VueWrapper

const mounted: Page[] = []
afterEach(() => {
  mounted.splice(0).forEach(page => page.unmount())
})

async function mountCreate(): Promise<Page> {
  signInAs(host)
  const page = await mountSuspended(CreatePage, { route: '/neu', attachTo: document.body })
  mounted.push(page)
  return page
}

const cta = (page: Page) => page.get('button[type="submit"]')
const picker = (page: Page) => page.get('ul[aria-label="Bibliothek"]')
const sortSelect = (page: Page) => page.get('select[aria-label="Sortierung"]')

async function settle(page: Page) {
  await vi.waitFor(() => expect(page.find('[aria-busy="true"]').exists()).toBe(false))
  await vi.waitFor(() => expect(page.find('ul[aria-label="Bibliothek"]').exists()).toBe(true))
}

/** Names the Session and stands on the Game pool step (step 6 of 7). */
async function toPoolStep(page: Page) {
  await page.get('input[type="text"]').setValue('Freitags-Zocken')
  for (let i = 0; i < 5; i++) await cta(page).trigger('click')
  await settle(page)
}

describe('the Game pool step sorts by „Lange nicht gespielt“ (#901)', () => {
  beforeEach(async () => {
    useState('toasts').value = []
    library = [alfa, bravo, charlie]
    libraryLastPlayed = { [alfa.id]: '2026-11-02T18:00:00.000Z', [charlie.id]: '2026-11-01T18:00:00.000Z' }
    await clearNuxtData('games')
    useState('game-library').value = null
  })

  it('has the select beside the filters, on the step only, and orders the picker\'s cards by it', async () => {
    const page = await mountCreate()
    await toPoolStep(page)
    expect(picker(page).findAll('li').map(card => card.get('b').text())).toEqual(['Alfa', 'Bravo', 'Charlie'])

    expect((sortSelect(page).element as HTMLSelectElement).value).toBe('')
    await sortSelect(page).setValue('last_played')

    await vi.waitFor(() => expect(picker(page).findAll('li').map(card => card.get('b').text())).toEqual(['Bravo', 'Charlie', 'Alfa']))
    expect((sortSelect(page).element as HTMLSelectElement).value).toBe('last_played')
  })

  it('keeps the sort out of the address, and the „zuletzt am“ pills still show', async () => {
    const page = await mountCreate()
    await toPoolStep(page)
    await sortSelect(page).setValue('last_played')
    await vi.waitFor(() => expect(picker(page).findAll('li').map(card => card.get('b').text())).toEqual(['Bravo', 'Charlie', 'Alfa']))

    expect(useRouter().currentRoute.value.query).toEqual({})
    expect(picker(page).text()).toContain('zuletzt am')
  })
})
