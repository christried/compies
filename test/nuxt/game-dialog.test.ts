import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import type { Ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import GameDialog from '~/components/GameDialog.vue'
import GameTile from '~/components/GameTile.vue'
import RichNotesEditor from '~/components/RichNotesEditor.vue'
import { EVENT_NOTES_MAX } from '~~/shared/event'
import { GAME_NAME_MAX, GAME_NOTES_MAX, TAG_MAX, TAGS_PER_GAME_MAX, type HostGameFacts, type PoolGameFace } from '~~/shared/game'
import { notesFromLines, type NotesDoc } from '~~/shared/notes-doc'
import { colorTags } from '~~/shared/tag-colors'
import { kitty, signInAs } from './auth'
import type { EventNotesContext } from '~/composables/useEventNotes'
import { eventNotesContext } from './helpers/event-notes-context'
import { BLANK_NOTES, FORMATTED_HREF, FORMATTED_NOTES, readFormatted } from './helpers/formatted-notes'
import { editorOf, ensureGeometry, type } from './helpers/notes-editor'

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

type Save = (gameId: string, notes: NotesDoc | null) => Promise<boolean>
// The Event notes of the game, its Event's name, whether it is finished and the page's save are the Event page's context's (#821), not props: `event` is the one the page holds,
// so a test refetches or finishes the Event by changing it.
let event: Ref<EventNotesContext | null>
async function open({ eventNotes = null, eventName, eventFinished = false, saveEventNotes = null, game = FULL, ...props }: { game?: PoolGameFace, audience?: 'host' | 'member', facts?: HostGameFacts | null, eventNotes?: NotesDoc | null, eventName?: string, eventFinished?: boolean, saveEventNotes?: Save | null } = {}) {
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

describe('the Host writes the Event notes in the dialog (#464)', () => {
  const EVENT_DOC = notesFromLines(['Heute nur Bo1'])!
  const OTHER_DOC = notesFromLines(['Ganz anders'])!
  const letters = (n: number): NotesDoc => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a'.repeat(n) }] }] })
  const EDIT = 'Notizen für dieses Event bearbeiten'
  const ADD = 'Notizen für dieses Event hinzufügen'

  // What the dialog asked its page to save, and what the page answers: by default the server took it.
  let saved: { gameId: string, notes: NotesDoc | null }[]
  let answer: () => Promise<boolean>
  const saveEventNotes: Save = (gameId, notes) => {
    saved.push({ gameId, notes })
    return answer()
  }

  beforeEach(() => {
    ensureGeometry()
    saved = []
    answer = () => Promise.resolve(true)
  })

  const pencil = () => dialog().querySelector<HTMLButtonElement>(`button[aria-label="${EDIT}"]`)
  const addButton = () => [...dialog().querySelectorAll('button')].find(button => button.textContent?.trim() === ADD) ?? null
  const footerButton = (label: string) => [...dialog().querySelectorAll<HTMLButtonElement>('footer button')].find(button => button.textContent?.trim() === label)
  const textbox = () => dialog().querySelector<HTMLElement>('[role="textbox"]')
  const editor = () => editorOf(wrapper!.findComponent(RichNotesEditor))
  const eventLabels = () => [...dialog().querySelectorAll('h3')].filter(h => h.textContent === EVENT_LABEL)
  const EVENT_LABEL = 'Notizen für dieses Event'

  /** Presses the entry (the pencil, or the add button) and waits for the lazy editor. */
  async function startEditing() {
    const entry = pencil() ?? addButton()
    expect(entry, 'the entry to edit').not.toBeNull()
    entry!.click()
    await vi.waitFor(() => expect(textbox()).not.toBeNull())
    await flushPromises()
  }
  async function press(label: string) {
    const button = footerButton(label)
    expect(button, label).toBeDefined()
    button!.click()
    await flushPromises()
  }
  /** The page's answer to a save: the Event is refetched before the dialog hears whether it was taken, as `send` does. */
  function takes(next: NotesDoc | null) {
    answer = async () => {
      event.value!.notes = next ? { [FULL.id]: next } : null
      await flushPromises()
      return true
    }
  }
  const escape = () => dialog().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  function enter(init: KeyboardEventInit = { ctrlKey: true }) {
    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, ...init })
    textbox()!.dispatchEvent(event)
    return event
  }

  describe('the entry', () => {
    it('is a pencil in the header of the Event block, named after the notes, for the Host of a running Event', async () => {
      await open({ eventNotes: EVENT_DOC, saveEventNotes })

      const button = pencil()
      expect(button).not.toBeNull()
      expect(button!.closest('section')!.querySelector('h3')?.textContent).toBe(EVENT_LABEL)
      // The game's own block has none: its notes are edited in the library.
      expect([...dialog().querySelectorAll('button')].filter(b => b.getAttribute('aria-label')?.startsWith('Notizen'))).toHaveLength(1)
    })

    it('is an add button above the Game notes for a game without Event notes', async () => {
      await open({ eventNotes: null, saveEventNotes })

      const button = addButton()
      expect(button).not.toBeNull()
      expect(eventLabels()).toHaveLength(0)
      const gameLabel = [...dialog().querySelectorAll('h3')].find(h => h.textContent === 'Notizen')!
      expect(button!.compareDocumentPosition(gameLabel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })

    it('shows the add button, not an empty block, for stored notes without a visible character', async () => {
      for (const blank of BLANK_NOTES) {
        await open({ eventNotes: blank, saveEventNotes })

        expect(addButton()).not.toBeNull()
        expect(pencil()).toBeNull()
        expect(eventLabels()).toHaveLength(0)
        wrapper!.unmount()
      }
    })

    it.each([
      ['a caller that hands no function to save with', { saveEventNotes: undefined }],
      ['a Member\'s audience, though it is handed the notes and the function', { audience: 'member' as const }],
      ['a finished Event', { eventFinished: true }],
    ])('is not there for %s', async (_case, extra) => {
      for (const eventNotes of [EVENT_DOC, null]) {
        await open({ eventNotes, saveEventNotes, ...extra })

        expect(pencil()).toBeNull()
        expect(addButton()).toBeNull()
        expect(textbox()).toBeNull()
        wrapper!.unmount()
      }
    })

    it('leaves a finished Event\'s block frozen: the chip and the text, no editor', async () => {
      await open({ eventNotes: EVENT_DOC, saveEventNotes, eventFinished: true })

      expect(text()).toContain('Event beendet')
      expect(text()).toContain('Heute nur Bo1')
      expect(textbox()).toBeNull()
    })
  })

  describe('edit mode', () => {
    it('opens the editor with the stored notes, hides the cover and the facts, keeps the Game notes read-only and swaps the footer', async () => {
      await open({ eventNotes: EVENT_DOC, saveEventNotes })
      expect(link()).not.toBeNull()

      await startEditing()

      expect(editor().getJSON()).toEqual(EVENT_DOC)
      expect(dialog().querySelector('img')).toBeNull()
      expect(dialog().querySelector('[data-cover]')).toBeNull()
      expect(pills()).toEqual([])
      const gameBlock = [...dialog().querySelectorAll('section')].find(s => s.querySelector('h3')?.textContent === 'Notizen')!
      expect(gameBlock.textContent).toContain('Erste Zeile')
      expect(gameBlock.querySelector('[contenteditable]')).toBeNull()
      expect([...dialog().querySelectorAll('footer button')].map(b => b.textContent?.trim())).toEqual(['Abbrechen', 'Speichern'])
      expect(link()).toBeNull()
      expect(dialog().querySelector('label')?.textContent).toBe(EVENT_LABEL)
    })

    it('puts the caret in the editor, and for the add button too', async () => {
      await open({ eventNotes: EVENT_DOC, saveEventNotes })
      await startEditing()
      expect(document.activeElement).toBe(textbox())
      wrapper!.unmount()

      await open({ eventNotes: null, saveEventNotes })
      await startEditing()
      expect(editor().getJSON().content?.[0]?.content).toBeUndefined()
      expect(document.activeElement).toBe(textbox())
    })

    it('loads no editor before the Host presses the entry', async () => {
      await open({ eventNotes: EVENT_DOC, saveEventNotes })
      await flushPromises()

      expect(textbox()).toBeNull()
      expect(wrapper!.findComponent(RichNotesEditor).exists()).toBe(false)
    })
  })

  describe('saving', () => {
    it('sends the typed document with the game\'s id, then shows the saved text and puts the focus on the pencil', async () => {
      await open({ eventNotes: EVENT_DOC, saveEventNotes })
      await startEditing()
      type(wrapper!.findComponent(RichNotesEditor), ' und Mirror aus')
      const typed = notesFromLines(['Heute nur Bo1 und Mirror aus'])!
      takes(typed)

      await press('Speichern')

      await vi.waitFor(() => expect(textbox()).toBeNull())
      expect(saved).toEqual([{ gameId: FULL.id, notes: typed }])
      expect(text()).toContain('Heute nur Bo1 und Mirror aus')
      expect(footerButton('Speichern')).toBeUndefined()
      expect(link()).not.toBeNull()
      expect(document.activeElement).toBe(pencil())
    })

    it('keeps the editor and the typed text when the server refused, and moves no focus', async () => {
      await open({ eventNotes: EVENT_DOC, saveEventNotes })
      await startEditing()
      type(wrapper!.findComponent(RichNotesEditor), ' und Mirror aus')
      answer = () => Promise.resolve(false)
      const focused = document.activeElement

      await press('Speichern')

      expect(saved).toHaveLength(1)
      expect(textbox()).not.toBeNull()
      expect(editor().getJSON()).toEqual(notesFromLines(['Heute nur Bo1 und Mirror aus']))
      expect(textbox()!.getAttribute('aria-disabled')).toBeNull()
      expect(document.activeElement).toBe(focused)
      expect(footerButton('Speichern')).toBeDefined()
    })

    it('locks the editor with „Wird gespeichert …“ while the save runs, and a second press saves nothing more', async () => {
      await open({ eventNotes: EVENT_DOC, saveEventNotes })
      await startEditing()
      type(wrapper!.findComponent(RichNotesEditor), '!')
      let release!: (taken: boolean) => void
      answer = () => new Promise(resolve => (release = resolve))

      await press('Speichern')
      expect(textbox()!.getAttribute('aria-disabled')).toBe('true')
      expect(text()).toContain('Wird gespeichert …')
      await press('Speichern')

      release(true)
      await flushPromises()
      expect(saved.map(save => save.notes)).toEqual([notesFromLines(['Heute nur Bo1!'])])
    })

    it('clears the note by saving an empty editor, and the focus lands on the add button', async () => {
      await open({ eventNotes: EVENT_DOC, saveEventNotes })
      await startEditing()
      editor().commands.clearContent(true)
      takes(null)

      await press('Speichern')

      await vi.waitFor(() => expect(textbox()).toBeNull())
      expect(saved).toEqual([{ gameId: FULL.id, notes: null }])
      expect(eventLabels()).toHaveLength(0)
      expect(document.activeElement).toBe(addButton())
    })

    it('writes a first note through the add button', async () => {
      await open({ eventNotes: null, saveEventNotes })
      await startEditing()
      type(wrapper!.findComponent(RichNotesEditor), 'Heute nur Bo1')
      takes(EVENT_DOC)

      await press('Speichern')

      await vi.waitFor(() => expect(textbox()).toBeNull())
      expect(saved).toEqual([{ gameId: FULL.id, notes: EVENT_DOC }])
      expect(addButton()).toBeNull()
      expect(document.activeElement).toBe(pencil())
    })

    it('leaves edit mode with no request when nothing was typed', async () => {
      await open({ eventNotes: EVENT_DOC, saveEventNotes })
      await startEditing()

      await press('Speichern')

      expect(textbox()).toBeNull()
      expect(saved).toEqual([])
      expect(document.activeElement).toBe(pencil())
    })
  })

  describe('the limit', () => {
    it('blocks Speichern at 2001 characters with the error and the reason, and saves exactly 2000', async () => {
      await open({ eventNotes: EVENT_DOC, saveEventNotes })
      await startEditing()

      editor().commands.setContent(letters(EVENT_NOTES_MAX + 1) as never, { emitUpdate: true })

      await vi.waitFor(() => expect(footerButton('Speichern')!.getAttribute('aria-disabled')).toBe('true'))
      expect(text()).toContain('Höchstens 2000 Zeichen.')
      expect(text()).toContain('Erst die Notizen kürzen.')
      const reason = dialog().querySelector(`[id="${footerButton('Speichern')!.getAttribute('aria-describedby')}"]`)
      expect(reason?.textContent).toBe('Erst die Notizen kürzen.')
      await press('Speichern')
      enter()
      await flushPromises()
      expect(saved).toEqual([])
      expect(textbox()).not.toBeNull()

      editor().commands.setContent(letters(EVENT_NOTES_MAX) as never, { emitUpdate: true })
      takes(letters(EVENT_NOTES_MAX))
      await vi.waitFor(() => expect(footerButton('Speichern')!.getAttribute('aria-disabled')).not.toBe('true'))
      expect(text()).not.toContain('Erst die Notizen kürzen.')
      await press('Speichern')

      await vi.waitFor(() => expect(textbox()).toBeNull())
      expect(saved).toEqual([{ gameId: FULL.id, notes: letters(EVENT_NOTES_MAX) }])
    })

    it('opens notes of exactly 2000 characters without a block, and saves one more character typed into 1999', async () => {
      await open({ eventNotes: letters(EVENT_NOTES_MAX), saveEventNotes })
      await startEditing()
      expect(footerButton('Speichern')!.getAttribute('aria-disabled')).not.toBe('true')
      expect(editor().getJSON()).toEqual(letters(EVENT_NOTES_MAX))
      wrapper!.unmount()

      await open({ eventNotes: letters(EVENT_NOTES_MAX - 1), saveEventNotes })
      await startEditing()
      type(wrapper!.findComponent(RichNotesEditor), 'b')
      takes(letters(EVENT_NOTES_MAX))
      await press('Speichern')
      expect(saved).toHaveLength(1)
      const notes = saved[0]!.notes!
      expect(notes.content[0]).toEqual({ type: 'paragraph', content: [{ type: 'text', text: `${'a'.repeat(EVENT_NOTES_MAX - 1)}b` }] })
    })
  })

  describe('Strg + Enter', () => {
    it.each([
      ['Strg + Enter', { ctrlKey: true }],
      ['⌘ + Enter', { metaKey: true }],
    ])('saves with %s from inside the editor and types no line break', async (_name, init) => {
      await open({ eventNotes: EVENT_DOC, saveEventNotes })
      await startEditing()
      type(wrapper!.findComponent(RichNotesEditor), '!')
      takes(notesFromLines(['Heute nur Bo1!']))

      expect(enter(init).defaultPrevented).toBe(true)

      await vi.waitFor(() => expect(textbox()).toBeNull())
      expect(saved.map(save => save.notes)).toEqual([notesFromLines(['Heute nur Bo1!'])])
    })

    it('leaves a bare Enter to the editor, a Shift or Alt chord and a held key save nothing', async () => {
      await open({ eventNotes: EVENT_DOC, saveEventNotes })
      await startEditing()
      type(wrapper!.findComponent(RichNotesEditor), '!')

      enter({})
      enter({ ctrlKey: true, shiftKey: true })
      enter({ ctrlKey: true, altKey: true })
      enter({ ctrlKey: true, isComposing: true })
      enter({ ctrlKey: true, repeat: true })
      await flushPromises()

      expect(saved).toEqual([])
      expect(textbox()).not.toBeNull()
    })
  })

  describe('cancelling', () => {
    it('goes back to view mode with „Abbrechen“, sends nothing and puts the focus on the pencil, and the draft does not come back', async () => {
      const page = await open({ eventNotes: EVENT_DOC, saveEventNotes })
      await startEditing()
      type(wrapper!.findComponent(RichNotesEditor), ' weg damit')

      await press('Abbrechen')

      expect(textbox()).toBeNull()
      expect(saved).toEqual([])
      expect(page.emitted('close')).toBeUndefined()
      expect(document.activeElement).toBe(pencil())
      expect(text()).not.toContain('weg damit')
      await startEditing()
      expect(editor().getJSON()).toEqual(EVENT_DOC)
    })

    it('cancels on Escape, and only the next Escape closes the dialog', async () => {
      const page = await open({ eventNotes: EVENT_DOC, saveEventNotes })
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
      const page = await open({ eventNotes: EVENT_DOC, saveEventNotes })
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

    it('forgets the draft when the dialog closes', async () => {
      const page = await open({ eventNotes: EVENT_DOC, saveEventNotes })
      await startEditing()
      type(wrapper!.findComponent(RichNotesEditor), ' weg damit')

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
      await open({ eventNotes: EVENT_DOC, saveEventNotes })
      await startEditing()

      event.value!.finished = true
      await flushPromises()

      expect(textbox()).toBeNull()
      expect(pencil()).toBeNull()
      expect(text()).toContain('Event beendet')
      expect(text()).toContain('Heute nur Bo1')
    })

    it('keeps the typed text when a refetch brings other notes', async () => {
      await open({ eventNotes: EVENT_DOC, saveEventNotes })
      await startEditing()
      type(wrapper!.findComponent(RichNotesEditor), '!')

      event.value!.notes = { [FULL.id]: OTHER_DOC }
      await flushPromises()

      expect(editor().getJSON()).toEqual(notesFromLines(['Heute nur Bo1!']))
      expect(text()).not.toContain('Ganz anders')
    })
  })
})
