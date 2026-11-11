import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import NextGamePicker from '~/components/NextGamePicker.vue'
import type { GameTag, GameView, PoolGame } from '~~/shared/game'
import { kitty, signInAs } from './auth'
import { clickButton, dialog, restoreScreen, stubScreen } from './event-page'

// The switch „Veto erlauben“ in the picker for the next game (#232, spec #218 § „Nächstes Spiel setzen“, stories 50 and 53): off every
// time the sheet opens, there only in a Selection mode with a wheel, and its value goes out with the game that is picked.

const halo: PoolGame = { id: 'g-halo', name: 'Halo', imageUrl: null, youtubeId: null, clipStart: 0, clipLength: 30, playersMin: 2, playersMax: 4, suitabilities: [], notes: null, price: null }

let page: Awaited<ReturnType<typeof mountSuspended>> | undefined

async function mount(props: { open?: boolean, vetoSwitch?: boolean, pool?: PoolGame[] } = {}) {
  page = await mountSuspended(NextGamePicker, { props: { open: true, pool: [halo], busy: false, ...props } })
  await flushPromises()
  return page
}

const vetoSwitch = () => dialog()?.querySelector<HTMLButtonElement>('button[role="switch"]') ?? null
const pickHalo = async () => {
  dialog()!.querySelector<HTMLButtonElement>('button[aria-label="Halo auswählen"]')!.click()
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

describe('the Veto switch of the picker', () => {
  it('is off by default, named „Veto erlauben“ with the 60 seconds as its help', async () => {
    await mount({ vetoSwitch: true })

    const toggle = vetoSwitch()!
    expect(toggle.getAttribute('aria-checked')).toBe('false')
    expect(toggle.textContent).toContain('Veto erlauben')
    expect(toggle.textContent).toContain('Die Parteien können das Spiel dann im Veto-Fenster ablehnen.')
  })

  it('is absent without the switch prop, as under Host pick', async () => {
    await mount()

    expect(vetoSwitch()).toBeNull()
    expect(dialog()!.textContent).not.toContain('Veto erlauben')
  })

  it('shows "Setzen" as disabled (dashed, flat) until a game is chosen (F22)', async () => {
    await mount()

    const button = [...dialog()!.querySelectorAll('button')].find(element => element.textContent?.trim() === 'Setzen')!
    expect(button.disabled).toBe(true)
    expect(button.className).toContain('disabled:border-dashed')
    expect(button.className).toContain('disabled:bg-paper-2')
  })

  it('sends the game with no Veto allowed when the switch stays off', async () => {
    await mount({ vetoSwitch: true })
    await pickHalo()

    await clickButton(dialog(), 'Setzen')

    expect(page!.emitted('pick')).toEqual([['g-halo', false]])
  })

  it('sends the game with the Veto allowed when the switch is on', async () => {
    await mount({ vetoSwitch: true })
    await pickHalo()
    vetoSwitch()!.click()
    await flushPromises()
    expect(vetoSwitch()!.getAttribute('aria-checked')).toBe('true')

    await clickButton(dialog(), 'Setzen')

    expect(page!.emitted('pick')).toEqual([['g-halo', true]])
  })

  it('is off again when the sheet opens the next time', async () => {
    await mount({ vetoSwitch: true })
    vetoSwitch()!.click()
    await flushPromises()
    expect(vetoSwitch()!.getAttribute('aria-checked')).toBe('true')

    await page!.setProps({ open: false })
    await page!.setProps({ open: true })
    await flushPromises()

    expect(vetoSwitch()!.getAttribute('aria-checked')).toBe('false')
  })
})

describe('the sheet\'s footer', () => {
  it('keeps „Setzen“ in the sticky footer, so it stays in view under a long library list (#218)', async () => {
    const pool = Array.from({ length: 40 }, (_, index) => ({ ...halo, id: `g-${index}`, name: `Spiel ${index}` }))
    await mount({ vetoSwitch: true, pool })

    const footer = dialog()!.querySelector('footer')!
    expect(footer.textContent).toContain('Setzen')
    expect(footer.className).toContain('sticky')
    expect(footer.className).toContain('-bottom-5')
  })
})

// The library list the sheet's game browser fetches (#336): one endpoint for the file, each test sets what it answers.
function libraryGame(n: number, name: string, overrides: Partial<GameView> = {}): GameView {
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    name,
    imageUrl: null,
    youtubeId: null,
    clipStart: 0,
    clipLength: 30,
    playersMin: null,
    playersMax: null,
    suitabilities: [],
    createdBy: { id: kitty.id, name: 'Kitty' },
    createdAt: '2026-01-15T10:00:00.000Z',
    canEdit: true,
    notes: null,
    tags: [],
    price: null,
    ...overrides,
  }
}

let libraryGames: GameView[] = []
let libraryTags: GameTag[] = []
registerEndpoint('/api/games', {
  method: 'GET',
  handler: () => ({ games: libraryGames, tagsInUse: libraryTags }),
})

describe('the Tag filter of the library list (#336)', () => {
  const retroKart = libraryGame(1, 'Retro Kart', { tags: [{ key: 'retro', label: 'Retro' }] })
  const coop = libraryGame(2, 'Pandemie', { tags: [{ key: 'co-op', label: 'Co-op' }] })
  const chess = libraryGame(3, 'Schach')

  const tagSelect = () => dialog()!.querySelector<HTMLSelectElement>('select[aria-label="Tag"]')!
  const cardNames = (list: string) => [...dialog()!.querySelectorAll(`${list} li`)].map(card => card.querySelector('b, a')!.textContent!.trim())
  const libraryCards = () => cardNames('ul[aria-label="Bibliothek"]')
  const poolCards = () => cardNames('ul[aria-label="Spiele, die im Pool noch übrig sind"]')
  const pick = async (value: string) => {
    tagSelect().value = value
    tagSelect().dispatchEvent(new Event('change'))
    await flushPromises()
  }

  beforeEach(async () => {
    signInAs({ ...kitty, canHost: true })
    await clearNuxtData('games')
    useState('game-library').value = null
    libraryGames = [retroKart, coop, chess]
    libraryTags = [{ key: 'retro', label: 'Retro' }, { key: 'co-op', label: 'Co-op' }]
  })

  it('offers the Tags in use by label, next to „Alle“ and „Von mir“, and no player count or „Passt zu“', async () => {
    await mount()
    await vi.waitFor(() => expect(libraryCards()).toHaveLength(3))

    expect([...tagSelect().querySelectorAll('option')].map(option => option.textContent!.trim())).toEqual(['Tag', 'Co-op', 'Retro'])
    expect(dialog()!.querySelector('select[aria-label="Spielerzahl"]')).toBeNull()
    expect(dialog()!.querySelector('select[aria-label="Passt zu"]')).toBeNull()
  })

  it('narrows the library cards to the Tag and leaves the pool list alone; „Alle“ resets it', async () => {
    await mount()
    await vi.waitFor(() => expect(libraryCards()).toHaveLength(3))

    await pick('retro')

    expect(libraryCards()).toEqual(['Retro Kart'])
    expect(poolCards()).toEqual(['Halo'])

    const all = [...dialog()!.querySelectorAll('button')].find(button => button.textContent?.trim() === 'Alle')!
    all.click()
    await flushPromises()

    expect(libraryCards()).toHaveLength(3)
    expect(tagSelect().value).toBe('')
  })

  it('keeps the ✓ of a library card in the last child of its card, on the bottom edge (#351)', async () => {
    await mount()
    await vi.waitFor(() => expect(libraryCards()).toHaveLength(3))

    const check = dialog()!.querySelector<HTMLButtonElement>('button[aria-label="Retro Kart auswählen"]')!
    const card = check.closest('ul[aria-label="Bibliothek"] > li')!.firstElementChild as HTMLElement
    expect(card.lastElementChild!.contains(check)).toBe(true)
  })

  it('starts each opening of the sheet without a Tag', async () => {
    await mount()
    await vi.waitFor(() => expect(libraryCards()).toHaveLength(3))
    await pick('co-op')
    expect(tagSelect().value).toBe('co-op')

    await page!.setProps({ open: false })
    await page!.setProps({ open: true })
    await flushPromises()

    await vi.waitFor(() => expect(tagSelect().value).toBe(''))
  })
})

describe('the library list of the picker (#369)', () => {
  const cardNames = (list: string) => [...dialog()!.querySelectorAll(`${list} li`)].map(card => card.querySelector('b, a')!.textContent!.trim())
  const libraryCards = () => cardNames('ul[aria-label="Bibliothek"]')
  const poolCards = () => cardNames('ul[aria-label="Spiele, die im Pool noch übrig sind"]')
  const moreButton = () => [...dialog()!.querySelectorAll('button')].find(button => button.textContent?.trim() === 'Mehr laden')
  const pool = Array.from({ length: 45 }, (_, index) => ({ ...halo, id: `g-pool-${index}`, name: `Pool ${index + 1}` }))

  beforeEach(async () => {
    signInAs({ ...kitty, canHost: true })
    await clearNuxtData('games')
    useState('game-library').value = null
    libraryGames = Array.from({ length: 41 }, (_, index) => libraryGame(index + 1, `Spiel ${index + 1}`))
    libraryTags = []
  })

  it('draws the first 40 library cards, and the pool list in full', async () => {
    await mount({ pool })
    await vi.waitFor(() => expect(libraryCards()).toHaveLength(40))

    expect(poolCards()).toHaveLength(45)
  })

  it('draws card 41 with „Mehr laden“, and its ✓ picks it for the footer', async () => {
    await mount({ pool })
    await vi.waitFor(() => expect(libraryCards()).toHaveLength(40))

    moreButton()!.click()
    await flushPromises()
    expect(libraryCards()).toHaveLength(41)
    dialog()!.querySelector<HTMLButtonElement>('button[aria-label="Spiel 41 auswählen"]')!.click()
    await flushPromises()

    expect(dialog()!.querySelector('footer')!.textContent).toContain('Spiel 41')
    const set = [...dialog()!.querySelectorAll('button')].find(button => button.textContent?.trim() === 'Setzen')!
    expect(set.disabled).toBe(false)
  })

  it('starts each opening of the sheet on the first 40 cards', async () => {
    await mount({ pool })
    await vi.waitFor(() => expect(libraryCards()).toHaveLength(40))
    moreButton()!.click()
    await flushPromises()
    expect(libraryCards()).toHaveLength(41)

    await page!.setProps({ open: false })
    await page!.setProps({ open: true })
    await flushPromises()

    await vi.waitFor(() => expect(libraryCards()).toHaveLength(40))
  })
})

// The Notes button of a game in the picker (#436): on a pool game and a library game with Notes, and on no other; Escape closes its
// popover, the sheet stays open and the focus goes back to the button.
describe('the Notes button of a game in the picker (#436)', () => {
  const poolWithNotes: PoolGame = { ...halo, notes: 'Settings: 3 Runden\nWarmup: Lobby' }
  const poolWithout: PoolGame = { ...halo, id: 'g-pong', name: 'Pong', notes: null }
  const poolList = () => dialog()!.querySelector<HTMLElement>('ul[aria-label="Spiele, die im Pool noch übrig sind"]')!
  const libraryList = () => dialog()!.querySelector<HTMLElement>('ul[aria-label="Bibliothek"]')!
  const notesButtons = (root: ParentNode) => root.querySelectorAll<HTMLButtonElement>('button[aria-label="Notizen ansehen"]')
  const rowOf = (list: HTMLElement, name: string) => [...list.querySelectorAll<HTMLElement>('li')].find(row => row.querySelector('b')?.textContent?.trim() === name)!
  const popover = () => document.querySelector<HTMLElement>('[role="dialog"]:not([data-sheet])')
  const sheet = () => document.querySelector('[data-sheet="panel"]')

  beforeEach(async () => {
    stubScreen(true)
    signInAs({ ...kitty, canHost: true })
    await clearNuxtData('games')
    useState('game-library').value = null
    libraryGames = [libraryGame(1, 'Retro Kart', { notes: 'Setup: Tisch' }), libraryGame(2, 'Schach')]
    libraryTags = []
  })

  afterEach(() => restoreScreen())

  it('shows it on the pool game with Notes next to its ✓, and on none of the others', async () => {
    await mount({ pool: [poolWithNotes, poolWithout] })

    expect(notesButtons(rowOf(poolList(), 'Halo'))).toHaveLength(1)
    expect(rowOf(poolList(), 'Halo').querySelector('button[aria-label="Halo auswählen"]')).not.toBeNull()
    expect(notesButtons(rowOf(poolList(), 'Pong'))).toHaveLength(0)
  })

  it('shows it on the library game with Notes in the browser only', async () => {
    await mount({ pool: [poolWithout] })
    await vi.waitFor(() => expect(libraryList().querySelectorAll('li')).toHaveLength(2))

    expect(notesButtons(rowOf(libraryList(), 'Retro Kart'))).toHaveLength(1)
    expect(notesButtons(rowOf(libraryList(), 'Schach'))).toHaveLength(0)
    expect(notesButtons(poolList())).toHaveLength(0)
  })

  it('closes its popover on Escape, keeps the picker sheet open and gives the focus back to the button', async () => {
    await mount({ pool: [poolWithNotes] })
    const trigger = notesButtons(poolList())[0]!
    trigger.click()
    await flushPromises()
    expect(popover()).not.toBeNull()

    popover()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await flushPromises()

    expect(popover()).toBeNull()
    expect(sheet()).not.toBeNull()
    expect(document.activeElement).toBe(trigger)
  })
})
