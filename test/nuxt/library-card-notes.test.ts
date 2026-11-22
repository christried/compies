import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import GameBrowser from '~/components/GameBrowser.vue'
import LibraryPage from '~/pages/bibliothek/index.vue'
import { GAME_NAME_MAX, NO_FILTERS, type GameView } from '~~/shared/game'
import { notesFromLines } from '~~/shared/notes-doc'
import { signInAs } from './auth'
import { restoreScreen, stubScreen } from './event-page'
import { BLANK_NOTES } from './helpers/formatted-notes'
import { game, host, settle } from './helpers/library'

// The Notes button on the library's cards (#837): a card shows it when its game has Game notes, the notes open without opening the game, and
// the footer „Bearbeiten“ leads to the game's form. The pickers' browser (compact) does not draw it on the cover: where it goes there is #859.

const ID = (n: number) => `00000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`
const TRIGGER = 'button[aria-label^="Notizen zu "]'
const LONG_NAME = 'W'.repeat(GAME_NAME_MAX)

let list: GameView[] = []
let page: VueWrapper | undefined

registerEndpoint('/api/games', {
  method: 'GET',
  handler: () => ({ games: list, tagsInUse: [] }),
})

const withNotes = game({ id: ID(1), name: 'Mario Kart', notes: notesFromLines(['Settings: 3 Runden']) })
const without = game({ id: ID(2), name: 'Pong' })
const blank = game({ id: ID(3), name: 'Leer', notes: BLANK_NOTES[0]! })

const cardOf = (name: string) => [...document.querySelectorAll<HTMLElement>('ul li')].find(li => li.querySelector('b, a')!.textContent!.trim() === name)!
const popover = () => document.querySelector<HTMLElement>('[role="dialog"]:not([data-sheet])')
const sheet = () => document.querySelector<HTMLElement>('[data-sheet="panel"]')

async function mountLibrary(route = '/bibliothek') {
  page = await mountSuspended(LibraryPage, { route, attachTo: document.body })
  await settle(page)
  await flushPromises()
  return page
}

beforeEach(async () => {
  document.body.innerHTML = ''
  stubScreen(true)
  signInAs(host)
  await useRouter().push('/bibliothek')
  list = []
  await clearNuxtData('games')
  useState('game-library').value = null
})

afterEach(() => {
  page?.unmount()
  page = undefined
  restoreScreen()
})

describe('the Notes button on a library card (#837)', () => {
  it('shows it on the card of a game with notes and on no other, a blank document being none', async () => {
    list = [withNotes, without, blank]
    await mountLibrary()

    expect(cardOf('Mario Kart').querySelector(TRIGGER)).not.toBeNull()
    expect(cardOf('Pong').querySelector(TRIGGER)).toBeNull()
    expect(cardOf('Leer').querySelector(TRIGGER)).toBeNull()
    expect(document.querySelectorAll(TRIGGER)).toHaveLength(1)
  })

  it('opens the notes on a click and leaves the route where it is', async () => {
    list = [withNotes]
    await mountLibrary()

    cardOf('Mario Kart').querySelector<HTMLButtonElement>(TRIGGER)!.click()
    await flushPromises()

    expect(popover()!.textContent).toContain('Settings: 3 Runden')
    expect(useRouter().currentRoute.value.path).toBe('/bibliothek')
  })

  it('opens the notes as a sheet below 980 px, from the same button', async () => {
    stubScreen(false)
    list = [withNotes]
    await mountLibrary()

    cardOf('Mario Kart').querySelector<HTMLButtonElement>(TRIGGER)!.click()
    await flushPromises()

    expect(sheet()!.textContent).toContain('Settings: 3 Runden')
    expect(useRouter().currentRoute.value.path).toBe('/bibliothek')
  })

  it('leads to the game’s form from the footer „Bearbeiten“', async () => {
    list = [withNotes]
    await mountLibrary()

    cardOf('Mario Kart').querySelector<HTMLButtonElement>(TRIGGER)!.click()
    await flushPromises()

    const edit = [...popover()!.querySelectorAll('a')].find(link => link.textContent!.includes('Bearbeiten'))!
    expect(edit.getAttribute('href')).toBe(`/bibliothek/${ID(1)}/bearbeiten`)
  })

  it('keeps the button on an Archived card, next to „Wiederherstellen“, notes first', async () => {
    list = [{ ...withNotes, archived: true }]
    await mountLibrary('/bibliothek?archived=1')

    const buttons = [...cardOf('Mario Kart').querySelectorAll('button')]
    const notes = buttons.find(button => button.matches(TRIGGER))!
    const restore = buttons.find(button => button.textContent === 'Wiederherstellen')!
    expect(notes).toBeDefined()
    expect(restore).toBeDefined()
    expect(notes.compareDocumentPosition(restore) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('labels the button with a game name of the longest allowed length in full', async () => {
    list = [{ ...withNotes, name: LONG_NAME }]
    await mountLibrary()

    expect(document.querySelector(TRIGGER)!.getAttribute('aria-label')).toBe(`Notizen zu ${LONG_NAME}`)
  })
})

describe('the picker’s game browser (#837)', () => {
  it('draws no Notes button on its cards: the cover button is the library page’s, the picker’s is #859', async () => {
    list = [withNotes, without]
    page = await mountSuspended(GameBrowser, { props: { compact: true, filters: { ...NO_FILTERS } }, attachTo: document.body })
    await settle(page)
    await flushPromises()

    expect(document.querySelectorAll('ul li').length).toBe(2)
    expect(document.querySelectorAll(TRIGGER)).toHaveLength(0)
  })
})
