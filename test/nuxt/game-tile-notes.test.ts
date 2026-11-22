import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import GameTile from '~/components/GameTile.vue'
import { GAME_NAME_MAX, type HostGameFacts, type PoolGameFace } from '~~/shared/game'
import { notesFromLines, type NotesDoc } from '~~/shared/notes-doc'
import { kitty, signInAs } from './auth'
import { restoreScreen, stubScreen } from './event-page'
import { eventNotesContext } from './helpers/event-notes-context'
import { BLANK_NOTES } from './helpers/formatted-notes'
import { ensureGeometry } from './helpers/notes-editor'
import type { EventNotesContext } from '~/composables/useEventNotes'

// The Notes button on the Event page's tiles (#858): a tile of the Spielepool and the wheel's result card show it to the Host, for a game with Event notes or Game notes; its
// footer „Bearbeiten“ closes the popover or the sheet and opens that tile's game dialog in the edit mode. The Round card's tile (`notesButton` unset) and a Member's have none.
// The popover is itself `role="dialog"` and the notes sheet's title is the game's name, so the game dialog is told apart by its content, never by `[role="dialog"]` or an `h2`.

const GAME: PoolGameFace = {
  id: '00000000-0000-4000-8000-0000000000a1',
  name: 'Halo',
  imageUrl: null,
  youtubeId: null,
  playersMin: 2,
  playersMax: 4,
  suitabilities: [],
  price: null,
}
const GAME_DOC = notesFromLines(['Game-Zeile'])!
const EVENT_DOC = notesFromLines(['Heute nur Bo1'])!
const WITH_GAME: HostGameFacts = { tags: [], notes: GAME_DOC }
const NO_GAME: HostGameFacts = { tags: [], notes: null }

let wrapper: VueWrapper | undefined
let context: ReturnType<typeof eventNotesContext>['context']
let setWide: (next: boolean) => void
const save = vi.fn(() => Promise.resolve(true))

interface Options {
  audience?: 'host' | 'member'
  facts?: HostGameFacts | null
  eventNotes?: NotesDoc | null
  finished?: boolean
  saveNotes?: EventNotesContext['save']
  notesButton?: boolean
  game?: PoolGameFace
}

async function mountTile({ audience = 'host', facts = WITH_GAME, eventNotes = null, finished = false, saveNotes = save, notesButton = true, game = GAME }: Options = {}) {
  const made = eventNotesContext({ notes: eventNotes ? { [game.id]: eventNotes } : null, finished, save: saveNotes })
  context = made.context
  wrapper = await mountSuspended(GameTile, { props: { game, audience, facts, notesButton }, global: made.global, attachTo: document.body })
  await flushPromises()
  return wrapper
}

const trigger = () => document.querySelector<HTMLButtonElement>('button[aria-label^="Notizen zu "]')
const nameButton = () => document.querySelector<HTMLButtonElement>('button[data-lift-owner]')!
/** The notes' popover (from 980 px) or sheet (below), told apart from the game dialog: it is the one with the Notes block of the Event page. */
const notesOpen = () => trigger()?.getAttribute('aria-expanded') === 'true'
const popover = () => document.querySelector<HTMLElement>('[role="dialog"][aria-label^="Notizen zu "]')
const textboxes = () => [...document.querySelectorAll<HTMLElement>('[role="textbox"]')]
const libraryLink = () => [...document.querySelectorAll('a')].find(link => link.textContent?.includes('In der Bibliothek öffnen'))
/** The game dialog is open once it shows an editor or the library link, which the notes' popover and sheet never have. */
const gameDialogOpen = () => textboxes().length > 0 || libraryLink() !== undefined
const editButton = () => [...document.querySelectorAll<HTMLButtonElement>('footer button')].find(button => button.textContent?.includes('Bearbeiten'))
async function openNotes() {
  trigger()!.focus()
  trigger()!.click()
  await flushPromises()
}
async function pressEdit() {
  const button = editButton()
  expect(button, 'the footer „Bearbeiten“').toBeDefined()
  button!.click()
  await flushPromises()
}
const escape = (within: Element) => within.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
const gameDialog = () => [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].find(el => !el.getAttribute('aria-label')?.startsWith('Notizen zu '))!

beforeEach(() => {
  document.body.innerHTML = ''
  ensureGeometry()
  save.mockClear()
  setWide = stubScreen(true)
  signInAs({ ...kitty, canHost: true })
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  restoreScreen()
})

describe('the Notes button on a tile, for the Host (#858)', () => {
  it.each([
    ['Event notes only', { facts: NO_GAME, eventNotes: EVENT_DOC }],
    ['Game notes only', { facts: WITH_GAME, eventNotes: null }],
    ['both', { facts: WITH_GAME, eventNotes: EVENT_DOC }],
  ])('has the button for a game with %s, labelled with the game', async (_name, options) => {
    await mountTile(options)

    expect(trigger()!.getAttribute('aria-label')).toBe('Notizen zu Halo')
    expect(nameButton().textContent!.trim()).toBe('Halo')
  })

  it('still has it for a game with Event notes when the Host’s read has no facts of the game yet', async () => {
    await mountTile({ facts: null, eventNotes: EVENT_DOC })

    expect(trigger()).not.toBeNull()
    await openNotes()
    expect(popover()!.textContent).toContain('Heute nur Bo1')
  })

  it.each([
    ['no notes', { facts: NO_GAME, eventNotes: null }],
    ['no facts and no Event notes', { facts: null, eventNotes: null }],
    ['blank Game notes', { facts: { tags: [], notes: BLANK_NOTES[0] ?? null }, eventNotes: null }],
    ['blank Event notes', { facts: NO_GAME, eventNotes: BLANK_NOTES[1] ?? null }],
  ])('has none for a game with %s', async (_name, options) => {
    await mountTile(options)

    expect(trigger()).toBeNull()
  })

  it('has none when `notesButton` is unset, which is the Round card’s call, whatever notes the game has', async () => {
    await mountTile({ facts: WITH_GAME, eventNotes: EVENT_DOC, notesButton: false })

    expect(trigger()).toBeNull()
    expect(nameButton().textContent!.trim()).toBe('Halo')
  })

  it('keeps a game name of the longest allowed length in the label', async () => {
    const name = 'W'.repeat(GAME_NAME_MAX)
    await mountTile({ game: { ...GAME, name } })

    expect(trigger()!.getAttribute('aria-label')).toBe(`Notizen zu ${name}`)
  })

  it('lists the Event notes above the Game notes in the popover', async () => {
    await mountTile({ eventNotes: EVENT_DOC })
    await openNotes()

    const text = popover()!.textContent!
    expect(text).toContain('Notizen für dieses Event')
    expect(text.indexOf('Heute nur Bo1')).toBeLessThan(text.indexOf('Game-Zeile'))
  })

  it('shows the Game notes the Host’s read brings later, after a refetch, without a remount', async () => {
    await mountTile({ facts: null, eventNotes: EVENT_DOC })

    await wrapper!.setProps({ facts: WITH_GAME })
    await openNotes()

    expect(popover()!.textContent).toContain('Game-Zeile')
  })
})

describe('the Notes button on a Member’s tile (#858)', () => {
  it('has none, even when the tile is handed facts with notes and a context with Event notes and a save', async () => {
    signInAs({ ...kitty, canHost: false })
    await mountTile({ audience: 'member', facts: WITH_GAME, eventNotes: EVENT_DOC })

    expect(trigger()).toBeNull()
    expect(document.querySelector('[aria-label^="Notizen zu "]')).toBeNull()
    // The tile itself is still there and opens its dialog.
    expect(nameButton().textContent!.trim()).toBe('Halo')
  })
})

describe('„Bearbeiten“ on a tile (#858)', () => {
  it('only opens the notes when the button is clicked: no game dialog', async () => {
    await mountTile({ eventNotes: EVENT_DOC })
    await openNotes()

    expect(notesOpen()).toBe(true)
    expect(popover()).not.toBeNull()
    expect(gameDialogOpen()).toBe(false)
  })

  it('only opens the notes below 980 px, too: the one sheet is the notes’, with no editor and no library link', async () => {
    setWide(false)
    await mountTile({ eventNotes: EVENT_DOC })
    await openNotes()

    expect(notesOpen()).toBe(true)
    expect(document.querySelectorAll('[data-sheet="panel"]')).toHaveLength(1)
    expect(gameDialogOpen()).toBe(false)
  })

  it('opens the view mode on a tap on the name: no editor, the library link', async () => {
    await mountTile({ eventNotes: EVENT_DOC })

    nameButton().click()
    await flushPromises()

    expect(textboxes()).toHaveLength(0)
    expect(libraryLink()).toBeDefined()
    expect(trigger()!.getAttribute('aria-expanded')).toBe('false')
  })

  it('closes the popover and opens the game dialog in the edit mode, with the Event editor focused', async () => {
    await mountTile({ eventNotes: EVENT_DOC })
    await openNotes()

    await pressEdit()
    await vi.waitFor(() => expect(textboxes()).toHaveLength(2))
    await flushPromises()

    expect(popover()).toBeNull()
    expect(notesOpen()).toBe(false)
    expect(textboxes()[0]!.contains(document.activeElement)).toBe(true)
    expect(libraryLink()).toBeUndefined()
  })

  it('does the same below 980 px: the notes’ sheet gives way to the game dialog, with the Event editor focused', async () => {
    setWide(false)
    await mountTile({ eventNotes: EVENT_DOC })
    await openNotes()

    await pressEdit()
    await vi.waitFor(() => expect(textboxes()).toHaveLength(2))
    await flushPromises()

    expect(notesOpen()).toBe(false)
    expect(textboxes()[0]!.contains(document.activeElement)).toBe(true)
  })

  it('asks for the Event field also for a game with Game notes only, whose Event editor is empty', async () => {
    await mountTile({ facts: WITH_GAME, eventNotes: null })
    await openNotes()

    await pressEdit()
    await vi.waitFor(() => expect(textboxes()).toHaveLength(2))
    await flushPromises()

    expect(textboxes()[0]!.contains(document.activeElement)).toBe(true)
  })

  it('cancels the edit on Esc, closes the dialog on a second Esc, and the focus lands on the Notes button', async () => {
    await mountTile({ eventNotes: EVENT_DOC })
    await openNotes()
    await pressEdit()
    await vi.waitFor(() => expect(textboxes()).toHaveLength(2))
    await flushPromises()

    escape(gameDialog())
    await flushPromises()
    await vi.waitFor(() => expect(textboxes()).toHaveLength(0))
    expect(gameDialogOpen()).toBe(true)

    escape(gameDialog())
    await flushPromises()

    expect(gameDialogOpen()).toBe(false)
    expect(document.activeElement).toBe(trigger())
  })

  it('has the footer in a finished Event and the dialog opens', async () => {
    await mountTile({ eventNotes: EVENT_DOC, finished: true })
    await openNotes()

    expect(editButton()).toBeDefined()
    await pressEdit()

    expect(popover()).toBeNull()
    expect(gameDialogOpen()).toBe(true)
  })

  it('has no footer where the page provides no save', async () => {
    await mountTile({ eventNotes: EVENT_DOC, saveNotes: null })
    await openNotes()

    expect(popover()).not.toBeNull()
    expect(editButton()).toBeUndefined()
  })

  it('has the footer again once the page provides a save, as a refetch does', async () => {
    await mountTile({ eventNotes: EVENT_DOC, saveNotes: null })
    context.value = { ...context.value!, save }
    await openNotes()

    expect(editButton()).toBeDefined()
  })
})
