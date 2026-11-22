import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import type { Ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import GameDialog from '~/components/GameDialog.vue'
import GameTile from '~/components/GameTile.vue'
import RichNotesEditor from '~/components/RichNotesEditor.vue'
import { EVENT_NOTES_MAX, type EventNotesChange } from '~~/shared/event'
import { GAME_NAME_MAX, GAME_NOTES_MAX, TAG_MAX, TAGS_PER_GAME_MAX, type HostGameFacts, type PoolGameFace } from '~~/shared/game'
import { notesFromLines, type NotesDoc } from '~~/shared/notes-doc'
import { colorTags } from '~~/shared/tag-colors'
import { kitty, signInAs } from './auth'
import type { EventNotesContext } from '~/composables/useEventNotes'
import { eventNotesContext } from './helpers/event-notes-context'
import { BLANK_NOTES, FORMATTED_HREF, FORMATTED_NOTES, readFormatted } from './helpers/formatted-notes'
import { editorOf, ensureGeometry } from './helpers/notes-editor'

// The game dialog (#443, #444): the library entry's parts in the sheet shell, read-only. The Host gets everything the library knows but a Clip;
// a Member's audience gets picture, name, players, Suitabilities and Price, never Tags, Notes or the link, whatever the caller hands it. The sheet is teleported, so the tests read the document.

const PRICE = { cents: 1999, source: 'steam' as const, checkedAt: '2026-11-03T10:00:00.000Z' }
const FULL: PoolGameFace = {
  id: '00000000-0000-4000-8000-0000000000a1',
  name: 'Mario Kart',
  imageUrl: '/api/images/kart.webp',
  youtubeId: 'dQw4w9WgXcQ',
  playersMin: 2,
  playersMax: 6,
  suitabilities: ['teams', 'one_v_one'],
  price: PRICE,
}
const longTag = (n: number) => `${String.fromCharCode(65 + n)}`.repeat(TAG_MAX)
const EIGHT_TAGS = Array.from({ length: TAGS_PER_GAME_MAX }, (_, n) => ({ key: longTag(n).toLowerCase(), label: longTag(n) }))
const NOTES = 'Erste Zeile\nZweite Zeile\n\nDritte Zeile nach Leerzeile'
// The first line is bold, so the Member tests prove that formatted notes stay out of a Member's read (#728). No list in it: pills() counts the dialog's lists.
const FACTS: HostGameFacts = {
  tags: EIGHT_TAGS,
  notes: {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'Erste Zeile', marks: [{ type: 'bold' }] }] },
      ...notesFromLines(NOTES.split('\n').slice(1))!.content,
    ],
  },
}

let wrapper: VueWrapper | undefined

type Save = (gameId: string, change: EventNotesChange) => Promise<boolean>
// The Event notes of the game, its Event's name, whether it is finished and the page's save are the Event page's context's (#821), not props: `event` is the one the page holds,
// so a test refetches or finishes the Event by changing it.
let event: Ref<EventNotesContext | null>
async function open({ eventNotes = null, eventName, eventFinished = false, saveEventNotes = null, game = FULL, ...props }: { game?: PoolGameFace, open?: boolean, edit?: 'event' | 'game' | null, audience?: 'host' | 'member', facts?: HostGameFacts | null, eventNotes?: NotesDoc | null, eventName?: string, eventFinished?: boolean, saveEventNotes?: Save | null } = {}) {
  const { context, global } = eventNotesContext({ notes: eventNotes ? { [game.id]: eventNotes } : null, finished: eventFinished, save: saveEventNotes, ...(eventName === undefined ? {} : { eventName }) })
  event = context
  wrapper = await mountSuspended(GameDialog, { props: { open: true, game, audience: 'host', facts: FACTS, ...props }, global })
  await flushPromises()
  return wrapper
}

const dialog = () => document.querySelector('[role="dialog"]') as HTMLElement
const text = () => dialog().textContent ?? ''
const pills = () => [...dialog().querySelectorAll('ul:not([aria-label="Tags"]) > li')].map(item => item.textContent?.trim())
const tagChips = () => [...dialog().querySelectorAll('ul[aria-label="Tags"] > li')] as HTMLElement[]
const link = () => dialog().querySelector('a[href^="/bibliothek/"]')

beforeEach(() => {
  document.body.innerHTML = ''
  signInAs({ ...kitty, canHost: true })
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
})

describe('the game dialog for the Host (#443)', () => {
  it('is a dialog titled with the game\'s name and shows every part: picture, players, Suitabilities, Price with its day, every Tag, the Notes and the link', async () => {
    await open()

    expect(dialog().getAttribute('role')).toBe('dialog')
    expect(dialog().querySelector('h2')?.textContent).toBe('Mario Kart')
    expect(dialog().getAttribute('aria-labelledby')).toBe(dialog().querySelector('h2')?.id)
    expect(dialog().querySelector('img')?.getAttribute('src')).toBe('/api/images/kart.webp')
    const facts = pills()
    expect(facts[0]).toBe('bis 6')
    expect(facts[1]).toBe('Teams, 1v1')
    expect(facts[2]).toMatch(/^19,99 € bei Steam · Stand 3\. Nov\./)
    expect(text()).toContain('Notizen')
    expect(link()?.getAttribute('href')).toBe(`/bibliothek/${FULL.id}`)
    expect(link()?.textContent?.trim()).toBe('In der Bibliothek öffnen')
  })

  it('lists every one of eight Tags of 20 characters in the colour the game\'s Tag order gives it', async () => {
    await open()

    const colours = colorTags(EIGHT_TAGS).map(tag => tag.color)
    expect(tagChips().map(chip => chip.textContent?.trim())).toEqual(EIGHT_TAGS.map(tag => tag.label))
    tagChips().forEach((chip, index) => expect(chip.getAttribute('style'), chip.textContent ?? '').toContain(`var(--cp-team-${colours[index]})`))
    expect(dialog().querySelector('ul[aria-label="Tags"]')).not.toBeNull()
  })

  it('keeps the Notes\' lines, one paragraph each, and renders them as text, not as markup or links', async () => {
    await open({ facts: { tags: [], notes: notesFromLines(['Zeile eins', 'Zeile <b>zwei</b>', 'https://example.com/x']) } })

    const section = [...dialog().querySelectorAll('section')].find(s => s.textContent?.includes('Zeile eins'))!
    expect([...section.querySelectorAll('p')].map(p => p.textContent)).toEqual(['Zeile eins', 'Zeile <b>zwei</b>', 'https://example.com/x'])
    expect(dialog().querySelector('b')).toBeNull()
    expect(dialog().querySelector('a[href^="https://example.com"]')).toBeNull()
    expect(section.querySelector('h3')?.textContent).toBe('Notizen')
  })

  it('shows formatted Notes: the heading is an h4 under the h3 „Notizen“, the list, the bold text and the link open in a new tab (#728)', async () => {
    await open({ facts: { tags: [], notes: FORMATTED_NOTES } })

    const section = [...dialog().querySelectorAll('section')].find(s => s.textContent?.includes('Vorab'))!
    expect(section.querySelector('h3')?.textContent).toBe('Notizen')
    expect(readFormatted(section)).toEqual({
      heading: 'h4',
      headingText: 'Regeln',
      items: ['Erstens', 'Zweitens'],
      bold: 'Wichtig',
      link: { text: 'nachlesen', href: FORMATTED_HREF, target: '_blank', rel: 'noopener noreferrer' },
    })
  })

  it('shows no „Notizen“ section for notes without a visible character (#728)', async () => {
    for (const blank of BLANK_NOTES) {
      await open({ facts: { tags: [], notes: blank } })

      expect(text()).not.toContain('Notizen')
      wrapper!.unmount()
    }
  })

  it('shows the Event notes under their label above the Game notes (#732)', async () => {
    await open({ eventNotes: notesFromLines(['Heute nur Bo1']) })

    const label = [...dialog().querySelectorAll('h3')].find(h => h.textContent === 'Notizen für dieses Event')!
    const gameLabel = [...dialog().querySelectorAll('h3')].find(h => h.textContent === 'Notizen')!
    expect(label).toBeDefined()
    expect(text()).toContain('Heute nur Bo1')
    expect(label.compareDocumentPosition(gameLabel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('shows both blocks at md, the Event block framed first, the game block below it with „aus deiner Bibliothek“, no pencil in view mode (#729)', async () => {
    await open({ eventNotes: notesFromLines(['Heute nur Bo1']), eventName: 'Spieleabend bei Sanne' })

    const [first, second] = [...dialog().querySelectorAll('.cp-note')]
    expect(first!.classList).toContain('cp-note--md')
    expect(second!.classList).toContain('cp-note--md')
    expect(first!.textContent).toBe('Heute nur Bo1')
    expect(first!.parentElement!.className).toContain('border-2')
    expect(first!.parentElement!.classList).toContain('bg-surface')
    expect(second!.parentElement!.classList).toContain('bg-paper-2')
    expect(text()).toContain('aus deiner Bibliothek')
    expect(text()).toContain('Spieleabend bei Sanne')
    expect(dialog().querySelector('button[aria-label^="Notizen"]')).toBeNull()
  })

  it('shows the game block without the sub and the Event block without one when only one of them is there (#729)', async () => {
    await open({ eventNotes: null, eventName: 'Spieleabend bei Sanne' })
    expect(text()).not.toContain('aus deiner Bibliothek')
    wrapper!.unmount()

    await open({ facts: { tags: [], notes: null }, eventNotes: notesFromLines(['Heute nur Bo1']), eventName: 'Spieleabend bei Sanne' })
    expect(text()).not.toContain('Spieleabend bei Sanne')
  })

  it('marks a finished Event block with the dashed frame and the chip (#729)', async () => {
    await open({ eventNotes: notesFromLines(['Heute nur Bo1']), eventFinished: true })

    expect(dialog().querySelector('.border-dashed')).not.toBeNull()
    expect(text()).toContain('Event beendet')
  })

  it('shows the Event notes alone for a game without Game notes (#732)', async () => {
    await open({ facts: { tags: [], notes: null }, eventNotes: notesFromLines(['Heute nur Bo1']) })

    expect(text()).toContain('Heute nur Bo1')
    expect([...dialog().querySelectorAll('h3')].map(h => h.textContent)).toEqual(['Notizen für dieses Event'])
  })

  it('shows no label for a game without Event notes, null or blank (#732)', async () => {
    await open({ eventNotes: null })
    expect(text()).not.toContain('Notizen für dieses Event')
    wrapper!.unmount()

    for (const blank of BLANK_NOTES) {
      await open({ eventNotes: blank })
      expect(text()).not.toContain('Notizen für dieses Event')
      wrapper!.unmount()
    }
  })

  it('plays no Clip: no iframe and no Clip fact, for a game with a Clip', async () => {
    await open()

    expect(dialog().querySelector('iframe')).toBeNull()
    expect(text()).not.toContain('Clip')
  })

  it('has a picture of the Clip\'s thumbnail for a game without an image, and the placeholder for a game with neither', async () => {
    await open({ game: { ...FULL, imageUrl: null } })
    expect(dialog().querySelector('img')?.getAttribute('src')).toContain('dQw4w9WgXcQ')
    expect(dialog().querySelector('iframe')).toBeNull()
    wrapper!.unmount()
    document.body.innerHTML = ''

    await open({ game: { ...FULL, imageUrl: null, youtubeId: null } })
    expect(dialog().querySelector('img')).toBeNull()
    expect(dialog().querySelector('[data-cover="placeholder"]')).not.toBeNull()
  })

  it('shows no Price pill and no gap for a game without a Price', async () => {
    await open({ game: { ...FULL, price: null } })

    expect(pills()).toEqual(['bis 6', 'Teams, 1v1'])
    expect(text()).not.toContain('€')
    expect(text()).not.toContain('Stand')
  })

  it('shows no Tags heading or list for a game without Tags, and no Notes section for a game without Notes', async () => {
    await open({ facts: { tags: [], notes: null } })

    expect(dialog().querySelector('ul[aria-label="Tags"]')).toBeNull()
    expect(text()).not.toContain('Notizen')
    expect(link()).not.toBeNull()
  })

  it('shows only the picture and the name, and the link, for a game with no player count, Suitabilities, Price, Tags or Notes', async () => {
    await open({ game: { id: FULL.id, name: 'Pong', imageUrl: null, youtubeId: null, price: null, playersMin: null, playersMax: null, suitabilities: [] }, facts: { tags: [], notes: null } })

    expect(dialog().querySelector('h2')?.textContent).toBe('Pong')
    expect(dialog().querySelector('[data-cover="placeholder"]')).not.toBeNull()
    expect(dialog().querySelectorAll('li')).toHaveLength(0)
    expect(text()).not.toContain('Notizen')
  })

  it('shows a game that came without facts (the Host\'s read lacks it) as the tile\'s game alone, with the link', async () => {
    await open({ facts: null })

    expect(pills()).toHaveLength(3)
    expect(dialog().querySelector('ul[aria-label="Tags"]')).toBeNull()
    expect(text()).not.toContain('Notizen')
    expect(link()).not.toBeNull()
  })

  it('holds the longest name allowed, without spaces, and 2000-character Notes', async () => {
    const name = 'x'.repeat(GAME_NAME_MAX)
    const notes = 'n'.repeat(GAME_NOTES_MAX - 1) + 'z'
    await open({ game: { ...FULL, name }, facts: { tags: [], notes: notesFromLines([notes]) } })

    expect(dialog().querySelector('h2')?.textContent).toBe(name)
    expect(dialog().querySelector('h2')?.className).toContain('[overflow-wrap:anywhere]')
    expect([...dialog().querySelectorAll('p')].map(p => p.textContent)).toContain(notes)
    expect(notes).toHaveLength(GAME_NOTES_MAX)
  })

  it('shows no link to the library to a viewer who may not see it (Host permission withdrawn)', async () => {
    signInAs({ ...kitty, canHost: false, isAdmin: false })
    await open()

    expect(link()).toBeNull()
    expect(text()).toContain('Notizen')
  })

  it('shows the link to a Platform admin', async () => {
    signInAs({ ...kitty, canHost: true, isAdmin: true })
    await open()

    expect(link()).not.toBeNull()
  })

  it('shows no link to a Platform admin without the Host permission (#455)', async () => {
    signInAs({ ...kitty, canHost: false, isAdmin: true })
    await open()

    expect(link()).toBeNull()
  })

  it('takes the new name when the game prop changes', async () => {
    const page = await open()

    await page.setProps({ game: { ...FULL, name: 'Pong' } })
    await flushPromises()

    expect(dialog().querySelector('h2')?.textContent).toBe('Pong')
    expect(link()?.getAttribute('href')).toBe(`/bibliothek/${FULL.id}`)
  })

  it('emits close on Escape', async () => {
    const page = await open()

    dialog().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))

    expect(page.emitted('close')).toHaveLength(1)
  })
})

describe('the game dialog for a Member (#443, #444)', () => {
  it('shows picture, name, players, Suitabilities and the Price, and never Tags, Notes or the link, even when handed the facts', async () => {
    await open({ audience: 'member', facts: FACTS, eventNotes: notesFromLines(['Heute nur Bo1']) })

    expect(dialog().querySelector('h2')?.textContent).toBe('Mario Kart')
    expect(text()).not.toContain('Notizen für dieses Event')
    expect(text()).not.toContain('Heute nur Bo1')
    expect(dialog().querySelector('img')?.getAttribute('src')).toBe('/api/images/kart.webp')
    expect(pills()).toHaveLength(3)
    expect(pills()[2]).toContain('19,99 €')
    expect(dialog().querySelector('ul[aria-label="Tags"]')).toBeNull()
    for (const tag of EIGHT_TAGS) expect(text()).not.toContain(tag.label)
    expect(text()).not.toContain('Notizen')
    expect(text()).not.toContain('Erste Zeile')
    expect(dialog().querySelector('strong')).toBeNull()
    expect(link()).toBeNull()
    expect(dialog().querySelector('footer')).toBeNull()
  })

  it('shows a Member the link to no library page even when they could see the library', async () => {
    signInAs({ ...kitty, canHost: true })
    await open({ audience: 'member', facts: FACTS })

    expect(link()).toBeNull()
  })

  it('shows the Price with its day, and plays no Clip', async () => {
    await open({ audience: 'member' })

    expect(pills()).toEqual(['bis 6', 'Teams, 1v1', expect.stringMatching(/^19,99 € bei Steam · Stand 3\. Nov\./)])
    expect(dialog().querySelector('iframe')).toBeNull()
    expect(text()).not.toContain('Clip')
  })

  it('shows no Price pill and no gap for a game without a Price', async () => {
    await open({ audience: 'member', game: { ...FULL, price: null } })

    expect(pills()).toEqual(['bis 6', 'Teams, 1v1'])
    expect(text()).not.toContain('€')
    expect(text()).not.toContain('Stand')
  })

  it('shows picture and name only, with no empty pill row, for a game with no players, no Suitabilities and no Price', async () => {
    await open({ audience: 'member', game: { ...FULL, playersMin: null, playersMax: null, suitabilities: [], price: null } })

    expect(dialog().querySelector('h2')?.textContent).toBe('Mario Kart')
    expect(dialog().querySelector('img')).not.toBeNull()
    expect(dialog().querySelectorAll('ul')).toHaveLength(0)
    expect(dialog().querySelectorAll('li')).toHaveLength(0)
  })

  it('shows a game with only a Suitability as that one pill', async () => {
    await open({ audience: 'member', game: { ...FULL, playersMin: null, playersMax: null, suitabilities: ['ffa'], price: null } })

    expect(pills()).toEqual(['FFA'])
  })

  it('shows a game with one player count as one pill', async () => {
    await open({ audience: 'member', game: { ...FULL, playersMin: 1, playersMax: 1, suitabilities: [], price: null } })

    expect(pills()).toEqual(['1 Spielende'])
  })

  it('holds the longest name allowed, without spaces, wrapped in the title', async () => {
    const name = 'x'.repeat(GAME_NAME_MAX)
    await open({ audience: 'member', game: { ...FULL, name } })

    expect(dialog().querySelector('h2')?.textContent).toBe(name)
    expect(dialog().querySelector('h2')?.className).toContain('[overflow-wrap:anywhere]')
  })

  it('has the Clip\'s thumbnail and no player for a game with a Clip and no image, and the placeholder for a game with neither', async () => {
    await open({ audience: 'member', game: { ...FULL, imageUrl: null } })
    expect(dialog().querySelector('img')?.getAttribute('src')).toContain('dQw4w9WgXcQ')
    expect(dialog().querySelector('iframe')).toBeNull()
    expect(text()).not.toContain('Clip')
    wrapper!.unmount()
    document.body.innerHTML = ''

    await open({ audience: 'member', game: { ...FULL, imageUrl: null, youtubeId: null } })
    expect(dialog().querySelector('img')).toBeNull()
    expect(dialog().querySelector('[data-cover="placeholder"]')).not.toBeNull()
  })
})

describe('the game tile with its dialog (#443, #444)', () => {
  const mountTile = async (audience: 'host' | 'member', facts: HostGameFacts | null = FACTS) => {
    wrapper = await mountSuspended(GameTile, { props: { game: FULL, audience, facts }, attachTo: document.body })
    return wrapper
  }

  it('is a button named after the game for the Host, and opens the dialog on a tap', async () => {
    const tile = await mountTile('host')

    const button = tile.get('button')
    expect(button.text()).toBe('Mario Kart')
    expect(button.attributes('aria-haspopup')).toBe('dialog')
    expect(document.querySelector('[role="dialog"]')).toBeNull()

    await button.trigger('click')
    await flushPromises()

    expect(dialog().querySelector('h2')?.textContent).toBe('Mario Kart')
  })

  it('reserves two title lines on the tile\'s name button, the same for the Host and for a Member (#612)', async () => {
    const host = await mountTile('host')
    const hostName = host.get('button').element.className
    host.unmount()

    signInAs({ ...kitty, canHost: false })
    const member = await mountTile('member')
    const memberName = member.get('button').element.className

    expect(hostName.split(' ')).toContain('min-h-[2lh]')
    expect(memberName.split(' ')).toContain('min-h-[2lh]')
    expect(memberName).toBe(hostName)
  })

  it('lifts on hover, the same for the Host and for a Member: the tile opens a dialog (#608)', async () => {
    const host = await mountTile('host')
    expect(host.get('button').element.closest('.lift')).not.toBeNull()
    host.unmount()

    signInAs({ ...kitty, canHost: false })
    const member = await mountTile('member')
    expect(member.get('button').element.closest('.lift')).not.toBeNull()
  })

  it('moves focus into the dialog, closes on Escape and returns focus to the tile', async () => {
    const tile = await mountTile('host')
    const button = tile.get('button').element as HTMLButtonElement
    button.focus()

    await tile.get('button').trigger('click')
    await flushPromises()
    expect(dialog().contains(document.activeElement)).toBe(true)

    dialog().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await flushPromises()

    expect(document.activeElement).toBe(button)
  })

  it.each([
    ['a Member', { ...kitty, canHost: false }],
    ['a Member who holds the Host permission for other Events', { ...kitty, canHost: true }],
  ])('is a button named after the game for %s, and a tap opens the dialog without Tags, Notes, a footer or the library link, even with the facts handed in (#444)', async (_who, user) => {
    signInAs(user)
    const tile = await mountTile('member')

    const button = tile.get('button')
    expect(button.text()).toBe('Mario Kart')
    expect(button.attributes('aria-haspopup')).toBe('dialog')
    expect(document.querySelector('[role="dialog"]')).toBeNull()

    await button.trigger('click')
    await flushPromises()

    expect(dialog().querySelector('h2')?.textContent).toBe('Mario Kart')
    expect(dialog().querySelector('img')?.getAttribute('src')).toBe('/api/images/kart.webp')
    expect(pills()).toEqual(['bis 6', 'Teams, 1v1', expect.stringContaining('19,99 €')])
    expect(text()).toContain('Stand')
    expect(dialog().querySelector('ul[aria-label="Tags"]')).toBeNull()
    expect(text()).not.toContain('Notizen')
    expect(text()).not.toContain('Erste Zeile')
    expect(dialog().querySelector('strong')).toBeNull()
    expect(dialog().querySelector('a[href^="/bibliothek/"]')).toBeNull()
    expect(dialog().querySelector('footer')).toBeNull()
  })

  it('closes a Member\'s dialog on Escape and returns focus to the tile', async () => {
    const tile = await mountTile('member')
    const button = tile.get('button').element as HTMLButtonElement
    button.focus()

    await tile.get('button').trigger('click')
    await flushPromises()
    expect(dialog().contains(document.activeElement)).toBe(true)

    dialog().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await flushPromises()

    expect(document.activeElement).toBe(button)
  })
})

describe('the Host writes the notes in the dialog (#464, #835)', () => {
  const EVENT_DOC = notesFromLines(['Heute nur Bo1'])!
  const OTHER_DOC = notesFromLines(['Ganz anders'])!
  const GAME_DOC = notesFromLines(['Immer Mirror aus'])!
  const letters = (n: number): NotesDoc => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a'.repeat(n) }] }] })
  const EDIT = 'Notizen für dieses Event bearbeiten'
  const EDIT_GAME = 'Notizen bearbeiten'
  const ADD = 'Notizen für dieses Event hinzufügen'
  const ADD_BOTH = 'Notizen hinzufügen'
  const EVENT_LABEL = 'Notizen für dieses Event'
  // The facts of a game with Game notes, and of one without.
  const WITH_GAME: HostGameFacts = { tags: [], notes: GAME_DOC }
  const WITHOUT_GAME: HostGameFacts = { tags: [], notes: null }

  // What the dialog asked its page to save, and what the page answers: by default the server took it.
  let saved: { gameId: string, change: EventNotesChange }[]
  let answer: () => Promise<boolean>
  const saveEventNotes: Save = (gameId, change) => {
    saved.push({ gameId, change })
    return answer()
  }

  beforeEach(() => {
    ensureGeometry()
    saved = []
    answer = () => Promise.resolve(true)
  })

  const buttonLabelled = (label: string) => dialog().querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
  const buttonTexted = (label: string) => [...dialog().querySelectorAll('button')].find(button => button.textContent?.trim() === label) ?? null
  const pencil = () => buttonLabelled(EDIT)
  const gamePencil = () => buttonLabelled(EDIT_GAME)
  const addButton = () => buttonTexted(ADD)
  const addBothButton = () => buttonTexted(ADD_BOTH)
  const footerButton = (label: string) => [...dialog().querySelectorAll<HTMLButtonElement>('footer button')].find(button => button.textContent?.trim() === label)
  const textboxes = () => [...dialog().querySelectorAll<HTMLElement>('[role="textbox"]')]
  const textbox = () => textboxes()[0] ?? null
  const editors = () => wrapper!.findAllComponents(RichNotesEditor)
  /** The Event editor is the first of the two, the Game editor the second. */
  const editorWrapper = (field: 'event' | 'game' = 'event') => editors()[field === 'event' ? 0 : 1]!
  const editor = (field: 'event' | 'game' = 'event') => editorOf(editorWrapper(field))
  const eventLabels = () => [...dialog().querySelectorAll('h3')].filter(h => h.textContent === EVENT_LABEL)
  const entries = () => ({
    pencil: pencil() !== null,
    gamePencil: gamePencil() !== null,
    add: addButton() !== null,
    addBoth: addBothButton() !== null,
  })

  /** Waits for both lazy editors. */
  async function editorsLoaded() {
    await vi.waitFor(() => expect(textboxes()).toHaveLength(2))
    await flushPromises()
  }
  /** Presses the entry, by default the Event pencil or one of the add buttons, and waits for the lazy editors. */
  async function startEditing(entry: HTMLButtonElement | null = pencil() ?? addButton() ?? addBothButton()) {
    expect(entry, 'the entry to edit').not.toBeNull()
    entry!.click()
    await editorsLoaded()
  }
  async function press(label: string) {
    const button = footerButton(label)
    expect(button, label).toBeDefined()
    button!.click()
    await flushPromises()
  }
  /** Replaces one field's content as a typing User would leave it: the editor emits it to the dialog. */
  function fill(field: 'event' | 'game', doc: NotesDoc) {
    editor(field).commands.setContent(doc as never, { emitUpdate: true })
  }
  /** The page's answer to a save: the Event is refetched before the dialog hears whether it was taken, as `send` does; both notes arrive with it. */
  function takes({ notes, gameNotes }: { notes?: NotesDoc | null, gameNotes?: NotesDoc | null }) {
    answer = async () => {
      if (notes !== undefined) event.value!.notes = notes ? { [FULL.id]: notes } : null
      if (gameNotes !== undefined) await wrapper!.setProps({ facts: { tags: [], notes: gameNotes } })
      await flushPromises()
      return true
    }
  }
  const escape = () => dialog().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  function enter(init: KeyboardEventInit = { ctrlKey: true }, field: 'event' | 'game' = 'event') {
    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, ...init })
    textboxes()[field === 'event' ? 0 : 1]!.dispatchEvent(event)
    return event
  }

  describe('the entries', () => {
    it('are a pencil on each block where the game has Event notes and Game notes, and nothing else', async () => {
      await open({ eventNotes: EVENT_DOC, facts: WITH_GAME, saveEventNotes })

      expect(entries()).toEqual({ pencil: true, gamePencil: true, add: false, addBoth: false })
      expect(pencil()!.closest('section')!.querySelector('h3')?.textContent).toBe(EVENT_LABEL)
      expect(gamePencil()!.closest('section')!.querySelector('h3')?.textContent).toBe('Notizen')
    })

    it('are a pencil on the Event block alone where the game has Event notes only: the edit mode offers the Game notes', async () => {
      await open({ eventNotes: EVENT_DOC, facts: WITHOUT_GAME, saveEventNotes })

      expect(entries()).toEqual({ pencil: true, gamePencil: false, add: false, addBoth: false })
      expect([...dialog().querySelectorAll('section')]).toHaveLength(1)
    })

    it('are a pencil on the Game block and the add button above it where the game has Game notes only', async () => {
      await open({ eventNotes: null, facts: WITH_GAME, saveEventNotes })

      expect(entries()).toEqual({ pencil: false, gamePencil: true, add: true, addBoth: false })
      expect(eventLabels()).toHaveLength(0)
      const gameLabel = [...dialog().querySelectorAll('h3')].find(h => h.textContent === 'Notizen')!
      expect(addButton()!.compareDocumentPosition(gameLabel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })

    it('are one button „Notizen hinzufügen“ where the game has no notes at all', async () => {
      await open({ eventNotes: null, facts: WITHOUT_GAME, saveEventNotes })

      expect(entries()).toEqual({ pencil: false, gamePencil: false, add: false, addBoth: true })
      expect([...dialog().querySelectorAll('section')]).toHaveLength(0)
    })

    it('count a block without a visible character as absent', async () => {
      for (const blank of BLANK_NOTES) {
        await open({ eventNotes: blank, facts: { tags: [], notes: blank }, saveEventNotes })
        expect(entries(), 'both blank').toEqual({ pencil: false, gamePencil: false, add: false, addBoth: true })
        wrapper!.unmount()

        await open({ eventNotes: blank, facts: WITH_GAME, saveEventNotes })
        expect(entries(), 'Event blank').toEqual({ pencil: false, gamePencil: true, add: true, addBoth: false })
        expect(eventLabels()).toHaveLength(0)
        wrapper!.unmount()

        await open({ eventNotes: EVENT_DOC, facts: { tags: [], notes: blank }, saveEventNotes })
        expect(entries(), 'Game blank').toEqual({ pencil: true, gamePencil: false, add: false, addBoth: false })
        wrapper!.unmount()
      }
    })

    it.each([
      ['a caller that hands no function to save with', { saveEventNotes: undefined }],
      ['a Member\'s audience, though it is handed the notes and the function', { audience: 'member' as const }],
      ['a finished Event', { eventFinished: true }],
    ])('are not there for %s', async (_case, extra) => {
      for (const [eventNotes, facts] of [[EVENT_DOC, WITH_GAME], [EVENT_DOC, WITHOUT_GAME], [null, WITH_GAME], [null, WITHOUT_GAME]] as const) {
        await open({ eventNotes, facts, saveEventNotes, ...extra })

        expect(entries()).toEqual({ pencil: false, gamePencil: false, add: false, addBoth: false })
        expect(textbox()).toBeNull()
        wrapper!.unmount()
      }
    })

    it('leave a finished Event\'s block frozen: the chip and the text, no editor', async () => {
      await open({ eventNotes: EVENT_DOC, saveEventNotes, eventFinished: true })

      expect(text()).toContain('Event beendet')
      expect(text()).toContain('Heute nur Bo1')
      expect(textbox()).toBeNull()
    })
  })

  describe('edit mode', () => {
    it('opens both editors, the Event notes first and the Game notes under them, with the stored documents; the cover and the facts are hidden and the footer swapped', async () => {
      await open({ eventNotes: EVENT_DOC, facts: WITH_GAME, saveEventNotes })
      expect(link()).not.toBeNull()

      await startEditing()

      expect(editor('event').getJSON()).toEqual(EVENT_DOC)
      expect(editor('game').getJSON()).toEqual(GAME_DOC)
      expect([...dialog().querySelectorAll('label')].map(label => label.textContent)).toEqual([EVENT_LABEL, 'Notizen'])
      expect(textboxes()[0]!.compareDocumentPosition(textboxes()[1]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      expect(dialog().querySelector('img')).toBeNull()
      expect(dialog().querySelector('[data-cover]')).toBeNull()
      expect(pills()).toEqual([])
      // No read-only block is left under the editors.
      expect(dialog().querySelectorAll('section')).toHaveLength(0)
      expect([...dialog().querySelectorAll('footer button')].map(b => b.textContent?.trim())).toEqual(['Abbrechen', 'Speichern'])
      expect(link()).toBeNull()
    })

    it.each([
      ['the Event pencil', { eventNotes: EVENT_DOC, facts: WITH_GAME }, () => pencil(), 0],
      ['the Game pencil', { eventNotes: EVENT_DOC, facts: WITH_GAME }, () => gamePencil(), 1],
      ['the add button', { eventNotes: null, facts: WITH_GAME }, () => addButton(), 0],
      ['„Notizen hinzufügen“', { eventNotes: null, facts: WITHOUT_GAME }, () => addBothButton(), 0],
    ])('puts the caret in the field of %s, and in no other', async (_name, props, entry, focused) => {
      await open({ ...props, saveEventNotes })

      await startEditing(entry())

      expect(textboxes()).toHaveLength(2)
      expect(document.activeElement).toBe(textboxes()[focused])
    })

    it('shows empty editors for a game with neither note', async () => {
      await open({ eventNotes: null, facts: WITHOUT_GAME, saveEventNotes })

      await startEditing()

      expect(editor('event').getJSON().content?.[0]?.content).toBeUndefined()
      expect(editor('game').getJSON().content?.[0]?.content).toBeUndefined()
    })

    it('loads no editor before the Host presses an entry', async () => {
      await open({ eventNotes: EVENT_DOC, saveEventNotes })
      await flushPromises()

      expect(textbox()).toBeNull()
      expect(wrapper!.findComponent(RichNotesEditor).exists()).toBe(false)
    })
  })

  describe('saving', () => {
    it('sends the typed Event notes alone with the game\'s id, then shows the saved text and puts the focus on the pencil', async () => {
      await open({ eventNotes: EVENT_DOC, facts: WITH_GAME, saveEventNotes })
      await startEditing()
      const typed = notesFromLines(['Heute nur Bo1 und Mirror aus'])!
      fill('event', typed)
      takes({ notes: typed })

      await press('Speichern')

      await vi.waitFor(() => expect(textbox()).toBeNull())
      expect(saved).toEqual([{ gameId: FULL.id, change: { notes: typed } }])
      expect(text()).toContain('Heute nur Bo1 und Mirror aus')
      expect(footerButton('Speichern')).toBeUndefined()
      expect(link()).not.toBeNull()
      expect(document.activeElement).toBe(pencil())
    })

    it('sends the typed Game notes alone, and the new text shows in the Game block without a reload', async () => {
      await open({ eventNotes: EVENT_DOC, facts: WITH_GAME, saveEventNotes })
      await startEditing(gamePencil())
      const typed = notesFromLines(['Immer Mirror an'])!
      fill('game', typed)
      takes({ gameNotes: typed })

      await press('Speichern')

      await vi.waitFor(() => expect(textbox()).toBeNull())
      expect(saved).toEqual([{ gameId: FULL.id, change: { gameNotes: typed } }])
      expect(text()).toContain('Immer Mirror an')
      expect(text()).not.toContain('Immer Mirror aus')
      expect(document.activeElement).toBe(gamePencil())
    })

    it('sends both in one request when both were typed, and nothing but what changed otherwise', async () => {
      await open({ eventNotes: EVENT_DOC, facts: WITH_GAME, saveEventNotes })
      await startEditing()
      fill('event', OTHER_DOC)
      fill('game', letters(5))
      takes({ notes: OTHER_DOC, gameNotes: letters(5) })

      await press('Speichern')

      await vi.waitFor(() => expect(textbox()).toBeNull())
      expect(saved).toEqual([{ gameId: FULL.id, change: { notes: OTHER_DOC, gameNotes: letters(5) } }])
    })

    it('clears a field by saving it empty: null for it alone, and the focus lands on the add button after an Event clear', async () => {
      await open({ eventNotes: EVENT_DOC, facts: WITH_GAME, saveEventNotes })
      await startEditing()
      editor('event').commands.clearContent(true)
      takes({ notes: null })

      await press('Speichern')

      await vi.waitFor(() => expect(textbox()).toBeNull())
      expect(saved).toEqual([{ gameId: FULL.id, change: { notes: null } }])
      expect(eventLabels()).toHaveLength(0)
      expect(document.activeElement).toBe(addButton())
      wrapper!.unmount()

      saved = []
      await open({ eventNotes: EVENT_DOC, facts: WITH_GAME, saveEventNotes })
      await startEditing(gamePencil())
      editor('game').commands.clearContent(true)
      takes({ gameNotes: null })

      await press('Speichern')

      await vi.waitFor(() => expect(textbox()).toBeNull())
      expect(saved).toEqual([{ gameId: FULL.id, change: { gameNotes: null } }])
      expect(entries()).toEqual({ pencil: true, gamePencil: false, add: false, addBoth: false })
    })

    it('writes a first Event note through the add button, and the focus lands on the new pencil', async () => {
      await open({ eventNotes: null, facts: WITH_GAME, saveEventNotes })
      await startEditing()
      fill('event', EVENT_DOC)
      takes({ notes: EVENT_DOC })

      await press('Speichern')

      await vi.waitFor(() => expect(textbox()).toBeNull())
      expect(saved).toEqual([{ gameId: FULL.id, change: { notes: EVENT_DOC } }])
      expect(addButton()).toBeNull()
      expect(document.activeElement).toBe(pencil())
    })

    it('writes the first notes of a game that has none through „Notizen hinzufügen“, in the field that was typed in', async () => {
      await open({ eventNotes: null, facts: WITHOUT_GAME, saveEventNotes })
      await startEditing()
      fill('game', GAME_DOC)
      takes({ gameNotes: GAME_DOC })

      await press('Speichern')

      await vi.waitFor(() => expect(textbox()).toBeNull())
      expect(saved).toEqual([{ gameId: FULL.id, change: { gameNotes: GAME_DOC } }])
      expect(entries()).toEqual({ pencil: false, gamePencil: true, add: true, addBoth: false })
      // The entry used is gone: the first one that is there takes the focus.
      expect(document.activeElement).toBe(addButton() ?? gamePencil())
      expect(dialog().contains(document.activeElement)).toBe(true)
    })

    it('keeps the editors and both drafts when the server refused, and moves no focus', async () => {
      await open({ eventNotes: EVENT_DOC, facts: WITH_GAME, saveEventNotes })
      await startEditing()
      fill('event', OTHER_DOC)
      fill('game', letters(5))
      answer = () => Promise.resolve(false)
      const focused = document.activeElement

      await press('Speichern')

      expect(saved).toHaveLength(1)
      expect(textboxes()).toHaveLength(2)
      expect(editor('event').getJSON()).toEqual(OTHER_DOC)
      expect(editor('game').getJSON()).toEqual(letters(5))
      expect(textbox()!.getAttribute('aria-disabled')).toBeNull()
      expect(document.activeElement).toBe(focused)
      expect(footerButton('Speichern')).toBeDefined()
    })

    it('locks both editors with „Wird gespeichert …“ while the save runs, and a second press saves nothing more', async () => {
      await open({ eventNotes: EVENT_DOC, facts: WITH_GAME, saveEventNotes })
      await startEditing()
      fill('game', letters(3))
      let release!: (taken: boolean) => void
      answer = () => new Promise(resolve => (release = resolve))

      await press('Speichern')
      expect(textboxes().map(box => box.getAttribute('aria-disabled'))).toEqual(['true', 'true'])
      expect(text()).toContain('Wird gespeichert …')
      await press('Speichern')

      release(true)
      await flushPromises()
      expect(saved.map(save => save.change)).toEqual([{ gameNotes: letters(3) }])
    })

    it('leaves edit mode with no request when nothing was typed in either field', async () => {
      await open({ eventNotes: EVENT_DOC, facts: WITH_GAME, saveEventNotes })
      await startEditing()

      await press('Speichern')

      expect(textbox()).toBeNull()
      expect(saved).toEqual([])
      expect(document.activeElement).toBe(pencil())
    })

    it('shows the Game notes saved by the page after the refetch, in the Game block of the view', async () => {
      await open({ eventNotes: null, facts: WITH_GAME, saveEventNotes })
      await startEditing(gamePencil())
      fill('game', OTHER_DOC)
      takes({ gameNotes: OTHER_DOC })

      await press('Speichern')

      await vi.waitFor(() => expect(textbox()).toBeNull())
      expect(text()).toContain('Ganz anders')
      expect(text()).not.toContain('Immer Mirror aus')
    })
  })

  describe('the limit', () => {
    it.each([
      ['Event', 'event' as const, EVENT_NOTES_MAX],
      ['Game', 'game' as const, GAME_NOTES_MAX],
    ])('blocks Speichern at 2001 characters in the %s field with the error and the reason, and saves exactly 2000', async (_name, field, max) => {
      await open({ eventNotes: EVENT_DOC, facts: WITH_GAME, saveEventNotes })
      await startEditing()

      fill(field, letters(max + 1))

      await vi.waitFor(() => expect(footerButton('Speichern')!.getAttribute('aria-disabled')).toBe('true'))
      expect(text()).toContain('Höchstens 2000 Zeichen.')
      expect(text()).toContain('Erst die Notizen kürzen.')
      const reason = dialog().querySelector(`[id="${footerButton('Speichern')!.getAttribute('aria-describedby')}"]`)
      expect(reason?.textContent).toBe('Erst die Notizen kürzen.')
      await press('Speichern')
      enter({ ctrlKey: true }, field)
      await flushPromises()
      expect(saved).toEqual([])
      expect(textboxes()).toHaveLength(2)

      fill(field, letters(max))
      takes(field === 'event' ? { notes: letters(max) } : { gameNotes: letters(max) })
      await vi.waitFor(() => expect(footerButton('Speichern')!.getAttribute('aria-disabled')).not.toBe('true'))
      expect(text()).not.toContain('Erst die Notizen kürzen.')
      await press('Speichern')

      await vi.waitFor(() => expect(textbox()).toBeNull())
      expect(saved).toEqual([{ gameId: FULL.id, change: field === 'event' ? { notes: letters(max) } : { gameNotes: letters(max) } }])
    })

    it('stays blocked while either field is over, and unblocks only when both are fine', async () => {
      await open({ eventNotes: EVENT_DOC, facts: WITH_GAME, saveEventNotes })
      await startEditing()

      fill('event', letters(EVENT_NOTES_MAX + 1))
      fill('game', letters(GAME_NOTES_MAX + 1))
      await vi.waitFor(() => expect(footerButton('Speichern')!.getAttribute('aria-disabled')).toBe('true'))
      fill('event', letters(10))
      await flushPromises()
      expect(footerButton('Speichern')!.getAttribute('aria-disabled')).toBe('true')

      fill('game', letters(10))
      await vi.waitFor(() => expect(footerButton('Speichern')!.getAttribute('aria-disabled')).not.toBe('true'))
    })

    it('opens notes of exactly 2000 characters without a block, in either field', async () => {
      await open({ eventNotes: letters(EVENT_NOTES_MAX), facts: { tags: [], notes: letters(GAME_NOTES_MAX) }, saveEventNotes })
      await startEditing()

      expect(footerButton('Speichern')!.getAttribute('aria-disabled')).not.toBe('true')
      expect(editor('event').getJSON()).toEqual(letters(EVENT_NOTES_MAX))
      expect(editor('game').getJSON()).toEqual(letters(GAME_NOTES_MAX))
    })
  })

  describe('Strg + Enter', () => {
    it.each([
      ['Strg + Enter in the Event editor', { ctrlKey: true }, 'event' as const],
      ['⌘ + Enter in the Event editor', { metaKey: true }, 'event' as const],
      ['Strg + Enter in the Game editor', { ctrlKey: true }, 'game' as const],
      ['⌘ + Enter in the Game editor', { metaKey: true }, 'game' as const],
    ])('saves with %s and types no line break', async (_name, init, field) => {
      await open({ eventNotes: EVENT_DOC, facts: WITH_GAME, saveEventNotes })
      await startEditing()
      fill(field, letters(4))
      takes(field === 'event' ? { notes: letters(4) } : { gameNotes: letters(4) })

      expect(enter(init, field).defaultPrevented).toBe(true)

      await vi.waitFor(() => expect(textbox()).toBeNull())
      expect(saved.map(save => save.change)).toEqual([field === 'event' ? { notes: letters(4) } : { gameNotes: letters(4) }])
    })

    it('leaves a bare Enter to the editor, a Shift or Alt chord and a held key save nothing', async () => {
      await open({ eventNotes: EVENT_DOC, facts: WITH_GAME, saveEventNotes })
      await startEditing()
      fill('game', letters(4))

      enter({}, 'game')
      enter({ ctrlKey: true, shiftKey: true }, 'game')
      enter({ ctrlKey: true, altKey: true }, 'game')
      enter({ ctrlKey: true, isComposing: true }, 'game')
      enter({ ctrlKey: true, repeat: true }, 'game')
      await flushPromises()

      expect(saved).toEqual([])
      expect(textboxes()).toHaveLength(2)
    })
  })

  describe('cancelling', () => {
    it('goes back to view mode with „Abbrechen“, sends nothing and puts the focus on the pencil, and neither draft comes back', async () => {
      const page = await open({ eventNotes: EVENT_DOC, facts: WITH_GAME, saveEventNotes })
      await startEditing()
      fill('event', notesFromLines(['Event weg damit'])!)
      fill('game', notesFromLines(['Spiel weg damit'])!)

      await press('Abbrechen')

      expect(textbox()).toBeNull()
      expect(saved).toEqual([])
      expect(page.emitted('close')).toBeUndefined()
      expect(document.activeElement).toBe(pencil())
      expect(text()).not.toContain('weg damit')
      await startEditing()
      expect(editor('event').getJSON()).toEqual(EVENT_DOC)
      expect(editor('game').getJSON()).toEqual(GAME_DOC)
    })

    it('returns the focus to the Game pencil when the edit began there', async () => {
      await open({ eventNotes: EVENT_DOC, facts: WITH_GAME, saveEventNotes })
      await startEditing(gamePencil())

      await press('Abbrechen')

      expect(document.activeElement).toBe(gamePencil())
    })

    it('cancels on Escape, and only the next Escape closes the dialog', async () => {
      const page = await open({ eventNotes: EVENT_DOC, facts: WITH_GAME, saveEventNotes })
      await startEditing()

      escape()
      await flushPromises()

      expect(textbox()).toBeNull()
      expect(page.emitted('close')).toBeUndefined()
      expect(document.activeElement).toBe(pencil())
      escape()
      expect(page.emitted('close')).toHaveLength(1)
    })

    it('cancels on the ✕ and on the scrim while editing, and closes on them in view mode', async () => {
      const page = await open({ eventNotes: EVENT_DOC, facts: WITH_GAME, saveEventNotes })
      await startEditing()

      dialog().querySelector<HTMLButtonElement>('button[aria-label="Schließen"]')!.click()
      await flushPromises()
      expect(textbox()).toBeNull()
      expect(page.emitted('close')).toBeUndefined()

      await startEditing()
      document.querySelector<HTMLElement>('[data-sheet="overlay"]')!.click()
      await flushPromises()
      expect(textbox()).toBeNull()
      expect(page.emitted('close')).toBeUndefined()

      document.querySelector<HTMLElement>('[data-sheet="overlay"]')!.click()
      expect(page.emitted('close')).toHaveLength(1)
    })

    it('forgets both drafts when the dialog closes', async () => {
      const page = await open({ eventNotes: EVENT_DOC, facts: WITH_GAME, saveEventNotes })
      await startEditing()
      fill('event', notesFromLines(['Event weg damit'])!)
      fill('game', notesFromLines(['Spiel weg damit'])!)

      await page.setProps({ open: false })
      await flushPromises()
      await page.setProps({ open: true })
      await flushPromises()

      expect(textbox()).toBeNull()
      expect(pencil()).not.toBeNull()
      expect(text()).not.toContain('weg damit')
    })
  })

  describe('while the Event changes under the edit', () => {
    it('ends the edit when the Event finishes: the frozen block shows, no editor', async () => {
      await open({ eventNotes: EVENT_DOC, facts: WITH_GAME, saveEventNotes })
      await startEditing()

      event.value!.finished = true
      await flushPromises()

      expect(textbox()).toBeNull()
      expect(entries()).toEqual({ pencil: false, gamePencil: false, add: false, addBoth: false })
      expect(text()).toContain('Event beendet')
      expect(text()).toContain('Heute nur Bo1')
    })

    it('keeps the typed text when a refetch brings other notes', async () => {
      await open({ eventNotes: EVENT_DOC, facts: WITH_GAME, saveEventNotes })
      await startEditing()
      fill('event', letters(3))
      fill('game', letters(4))

      event.value!.notes = { [FULL.id]: OTHER_DOC }
      await wrapper!.setProps({ facts: { tags: [], notes: notesFromLines(['Von woanders'])! } })
      await flushPromises()

      expect(editor('event').getJSON()).toEqual(letters(3))
      expect(editor('game').getJSON()).toEqual(letters(4))
      expect(text()).not.toContain('Ganz anders')
      expect(text()).not.toContain('Von woanders')
    })
  })

  // The seam for the tiles and the Round card (#858, #836): the dialog opens straight into the edit mode, with the named field focused. It is read each time `open`
  // turns true, and it never opens an editor the dialog would not allow.
  describe('the edit prop', () => {
    it.each([
      ['game', 1],
      ['event', 0],
    ] as const)('opens straight into the edit mode with the %s field focused', async (field, focused) => {
      await open({ eventNotes: EVENT_DOC, facts: WITH_GAME, saveEventNotes, edit: field })
      await editorsLoaded()

      expect(footerButton('Speichern')).toBeDefined()
      expect(entries()).toEqual({ pencil: false, gamePencil: false, add: false, addBoth: false })
      expect(document.activeElement).toBe(textboxes()[focused])
    })

    it('opens an editor for a game with no notes, too', async () => {
      await open({ eventNotes: null, facts: WITHOUT_GAME, saveEventNotes, edit: 'game' })
      await editorsLoaded()

      expect(document.activeElement).toBe(textboxes()[1])
    })

    it.each([
      ['a Member\'s dialog', { audience: 'member' as const }],
      ['a page that provides no save', { saveEventNotes: undefined }],
      ['a finished Event', { eventFinished: true }],
    ])('opens no editor in %s, whatever the value', async (_case, extra) => {
      for (const edit of ['event', 'game'] as const) {
        await open({ eventNotes: EVENT_DOC, facts: WITH_GAME, saveEventNotes, edit, ...extra })
        await flushPromises()

        expect(textbox()).toBeNull()
        expect(footerButton('Speichern')).toBeUndefined()
        wrapper!.unmount()
      }
    })

    it('is read when the dialog opens, not while it stays open', async () => {
      const page = await open({ eventNotes: EVENT_DOC, facts: WITH_GAME, saveEventNotes, open: false })
      await flushPromises()
      expect(document.querySelector('[role="dialog"]')).toBeNull()

      await page.setProps({ open: true, edit: 'game' })
      await editorsLoaded()
      expect(document.activeElement).toBe(textboxes()[1])

      // Closed and opened again with no value: the view mode, whatever the last open had.
      await page.setProps({ open: false })
      await flushPromises()
      await page.setProps({ open: true, edit: null })
      await flushPromises()
      expect(textbox()).toBeNull()
      expect(pencil()).not.toBeNull()

      // A value that changes while the dialog stays open does nothing.
      await page.setProps({ edit: 'event' })
      await flushPromises()
      expect(textbox()).toBeNull()

      await page.setProps({ open: false })
      await flushPromises()
      await page.setProps({ open: true })
      await editorsLoaded()
      expect(document.activeElement).toBe(textboxes()[0])
    })

    it('returns the focus to an entry of the view mode when the edit it opened is cancelled', async () => {
      await open({ eventNotes: EVENT_DOC, facts: WITH_GAME, saveEventNotes, edit: 'game' })
      await editorsLoaded()

      await press('Abbrechen')

      expect(document.activeElement).toBe(gamePencil())
    })
  })
})
