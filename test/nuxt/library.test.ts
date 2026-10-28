import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { createError } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import DetailPage from '~/pages/bibliothek/[id].vue'
import LibraryPage from '~/pages/bibliothek/index.vue'
import NewGamePage from '~/pages/bibliothek/neu.vue'
import type { GameList, GameView } from '~~/shared/game'
import { kitty, signInAs } from './auth'

const host = { ...kitty, canHost: true }

function game(overrides: Partial<GameView>): GameView {
  return {
    id: '00000000-0000-4000-8000-0000000000a1',
    name: 'Mario Kart',
    imageUrl: null,
    youtubeId: null,
    clipStart: 0,
    clipLength: 30,
    playersMin: null,
    playersMax: null,
    formats: [],
    createdBy: { id: kitty.id, name: 'Sanne' },
    createdAt: '2026-01-15T10:00:00.000Z',
    canEdit: true,
    ...overrides,
  }
}

const withClip = game({ id: '00000000-0000-4000-8000-0000000000a2', name: 'Counter-Strike 2', youtubeId: 'dQw4w9WgXcQ', clipStart: 72, clipLength: 30 })
const withoutClip = game({ id: '00000000-0000-4000-8000-0000000000a3', name: 'Brettspiel' })

// One endpoint per path for the file (a second registration is not replaced); each test sets what it returns.
let list: GameList = { games: [] }
let listMode: 'ok' | 'hang' = 'ok'
let detail: GameView | null = withClip

registerEndpoint('/api/games', {
  method: 'GET',
  handler: () => (listMode === 'hang' ? new Promise(() => {}) : list),
})
registerEndpoint(`/api/games/${withClip.id}`, {
  method: 'GET',
  handler: () => {
    if (!detail) throw createError({ statusCode: 404, statusMessage: 'Not Found' })
    return detail
  },
})
registerEndpoint('/api/games/00000000-0000-4000-8000-0000000000ff', {
  method: 'GET',
  handler: () => {
    throw createError({ statusCode: 404, statusMessage: 'Not Found' })
  },
})

async function settle(page: Awaited<ReturnType<typeof mountSuspended>>) {
  await vi.waitFor(() => expect(page.find('[aria-busy="true"]').exists()).toBe(false))
}

describe('the library page', () => {
  beforeEach(async () => {
    signInAs(host)
    list = { games: [] }
    listMode = 'ok'
    detail = withClip
    await clearNuxtData('games')
    await clearNuxtData(`game-${withClip.id}`)
  })

  it('shows a Member without the Host permission the generic Construction page and asks for nothing', async () => {
    signInAs(kitty)
    list = { games: [withClip] }

    const page = await mountSuspended(LibraryPage, { route: '/bibliothek' })

    expect(page.get('h1').text()).toBe('Hier wird noch gebaut.')
    expect(page.text()).not.toContain('Counter-Strike 2')
  })

  it('shows the Platform admin the library', async () => {
    signInAs({ ...kitty, isAdmin: true })

    const page = await mountSuspended(LibraryPage, { route: '/bibliothek' })
    await settle(page)

    expect(page.get('h1').text()).toBe('Bibliothek')
  })

  it('shows the Host the cards, linked to the game, with the YouTube thumbnail or the placeholder', async () => {
    list = { games: [withoutClip, withClip] }

    const page = await mountSuspended(LibraryPage, { route: '/bibliothek' })
    await settle(page)

    expect(page.get('h1').text()).toBe('Bibliothek')
    expect(page.text()).toContain('Global, für alle Hosts')
    const cards = page.findAll('main li')
    expect(cards.map(card => card.text())).toEqual(['Brettspiel', 'Counter-Strike 2'])
    expect(cards[1]!.get('a').attributes('href')).toBe(`/bibliothek/${withClip.id}`)
    expect(cards[1]!.get('img').attributes('src')).toBe('https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg')
    expect(cards[0]!.find('img').exists()).toBe(false)
    expect(cards[0]!.find('[data-cover="placeholder"]').exists()).toBe(true)
  })

  it('leads to the form with „Spiel anlegen“', async () => {
    list = { games: [withClip] }

    const page = await mountSuspended(LibraryPage, { route: '/bibliothek' })
    await settle(page)

    const cta = page.findAll('main a').find(link => link.text().includes('Spiel anlegen'))
    expect(cta?.attributes('href')).toBe('/bibliothek/neu')
  })

  it('shows skeleton cards on a busy grid while the list loads', async () => {
    listMode = 'hang'

    const page = await mountSuspended(LibraryPage, { route: '/bibliothek' })

    const busy = page.get('[aria-busy="true"]')
    expect(busy.attributes('aria-label')).toBe('Bibliothek lädt')
    expect(busy.findAll('[aria-hidden="true"]').length).toBeGreaterThanOrEqual(6)
  })

  it('shows the empty state with the way to the first game', async () => {
    const page = await mountSuspended(LibraryPage, { route: '/bibliothek' })
    await settle(page)

    expect(page.text()).toContain('Die Bibliothek ist leer.')
    const cta = page.findAll('main a').filter(link => link.text().includes('Spiel anlegen'))
    expect(cta.length).toBeGreaterThan(0)
    expect(cta.every(link => link.attributes('href') === '/bibliothek/neu')).toBe(true)
  })
})

describe('the game page', () => {
  beforeEach(async () => {
    signInAs(host)
    detail = withClip
    await clearNuxtData(`game-${withClip.id}`)
  })

  it('shows the name, the creator and month, the clip length and the excerpt of the clip', async () => {
    const page = await mountSuspended(DetailPage, { route: `/bibliothek/${withClip.id}` })
    await vi.waitFor(() => expect(page.find('h1').exists()).toBe(true))

    expect(page.get('h1').text()).toBe('Counter-Strike 2')
    expect(page.text()).toContain('Clip 30 s')
    expect(page.text()).toContain('Angelegt von Sanne im Januar 2026')
    expect(page.text()).toContain('Ausschnitt 1:12 – 1:42')
    expect(page.get('a[href="/bibliothek"]').text()).toContain('Bibliothek')
  })

  it('shows a game without a clip with the placeholder and no preview', async () => {
    detail = { ...withClip, youtubeId: null, clipStart: 0 }

    const page = await mountSuspended(DetailPage, { route: `/bibliothek/${withClip.id}` })
    await vi.waitFor(() => expect(page.find('h1').exists()).toBe(true))

    expect(page.text()).not.toContain('Ausschnitt')
    expect(page.text()).not.toContain('Clip 30 s')
    expect(page.find('[data-cover="placeholder"]').exists()).toBe(true)
  })

  it('looks like any missing page when the game does not exist', async () => {
    const page = await mountSuspended(DetailPage, { route: '/bibliothek/00000000-0000-4000-8000-0000000000ff' })

    await vi.waitFor(() => expect(page.get('h1').text()).toBe('Hier wird noch gebaut.'))
  })

  it('shows a Member without the Host permission the generic Construction page', async () => {
    signInAs(kitty)

    const page = await mountSuspended(DetailPage, { route: `/bibliothek/${withClip.id}` })

    expect(page.get('h1').text()).toBe('Hier wird noch gebaut.')
  })
})

describe('the new game page', () => {
  it('shows a Member without the Host permission the generic Construction page', async () => {
    signInAs(kitty)

    const page = await mountSuspended(NewGamePage, { route: '/bibliothek/neu' })

    expect(page.get('h1').text()).toBe('Hier wird noch gebaut.')
    expect(page.find('input').exists()).toBe(false)
  })

  it('says the game is in the library and opens it after saving', async () => {
    signInAs(host)
    registerEndpoint('/api/games', { method: 'POST', handler: () => withClip })
    useState('toasts').value = []
    const page = await mountSuspended(NewGamePage, { route: '/bibliothek/neu' })
    const name = page.findAll('label').find(label => label.text() === 'Name')!
    await page.get(`[id="${name.attributes('for')}"]`).setValue('Counter-Strike 2')

    await page.get('form').trigger('submit')

    await vi.waitFor(() => expect(useRouter().currentRoute.value.path).toBe(`/bibliothek/${withClip.id}`))
    expect(useState<{ text: string }[]>('toasts').value.map(toast => toast.text)).toEqual(['Counter-Strike 2 ist in der Bibliothek.'])
  })

  it('shows the Host the form under „Spiel anlegen“', async () => {
    signInAs(host)

    const page = await mountSuspended(NewGamePage, { route: '/bibliothek/neu' })

    expect(page.get('h1').text()).toBe('Spiel anlegen')
    expect(page.text()).toContain('Bibliothek')
    expect(page.find('input').exists()).toBe(true)
  })
})
