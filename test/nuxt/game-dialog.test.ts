import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import GameDialog from '~/components/GameDialog.vue'
import GameTile from '~/components/GameTile.vue'
import { GAME_NAME_MAX, GAME_NOTES_MAX, TAG_MAX, TAGS_PER_GAME_MAX, type HostGameFacts, type PoolGameFace } from '~~/shared/game'
import { notesFromLines, type NotesDoc } from '~~/shared/notes-doc'
import { colorTags } from '~~/shared/tag-colors'
import { kitty, signInAs } from './auth'
import { BLANK_NOTES, FORMATTED_HREF, FORMATTED_NOTES, readFormatted } from './helpers/formatted-notes'

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

async function open(props: { game?: PoolGameFace, audience?: 'host' | 'member', facts?: HostGameFacts | null, eventNotes?: NotesDoc | null, eventName?: string, eventFinished?: boolean } = {}) {
  wrapper = await mountSuspended(GameDialog, { props: { open: true, game: FULL, audience: 'host', facts: FACTS, ...props } })
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
    expect(facts[1]).toBe('Teams, 1 gegen 1')
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

    expect(pills()).toEqual(['bis 6', 'Teams, 1 gegen 1'])
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

    expect(pills()).toEqual(['bis 6', 'Teams, 1 gegen 1', expect.stringMatching(/^19,99 € bei Steam · Stand 3\. Nov\./)])
    expect(dialog().querySelector('iframe')).toBeNull()
    expect(text()).not.toContain('Clip')
  })

  it('shows no Price pill and no gap for a game without a Price', async () => {
    await open({ audience: 'member', game: { ...FULL, price: null } })

    expect(pills()).toEqual(['bis 6', 'Teams, 1 gegen 1'])
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

    expect(pills()).toEqual(['Jeder gegen jeden'])
  })

  it('shows a game with one player count as one pill', async () => {
    await open({ audience: 'member', game: { ...FULL, playersMin: 1, playersMax: 1, suitabilities: [], price: null } })

    expect(pills()).toEqual(['1 Spieler'])
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
    expect(pills()).toEqual(['bis 6', 'Teams, 1 gegen 1', expect.stringContaining('19,99 €')])
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
