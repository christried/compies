import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import GameDialog from '~/components/GameDialog.vue'
import GameTile from '~/components/GameTile.vue'
import { GAME_NAME_MAX, GAME_NOTES_MAX, TAG_MAX, TAGS_PER_GAME_MAX, type HostGameFacts, type PoolGameFace } from '~~/shared/game'
import { colorTags } from '~~/shared/tag-colors'
import { kitty, signInAs } from './auth'

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
const FACTS: HostGameFacts = { tags: EIGHT_TAGS, notes: NOTES }

let wrapper: VueWrapper | undefined

async function open(props: { game?: PoolGameFace, audience?: 'host' | 'member', facts?: HostGameFacts | null } = {}) {
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

  it('keeps the Notes\' line breaks and renders them as text, not as markup or links', async () => {
    await open({ facts: { tags: [], notes: 'Zeile eins\nZeile <b>zwei</b>\nhttps://example.com/x' } })

    const notes = [...dialog().querySelectorAll('p')].find(p => p.textContent?.includes('Zeile eins'))!
    expect(notes.textContent).toBe('Zeile eins\nZeile <b>zwei</b>\nhttps://example.com/x')
    expect(notes.className).toContain('whitespace-pre-wrap')
    expect(dialog().querySelector('b')).toBeNull()
    expect(dialog().querySelector('a[href^="https://example.com"]')).toBeNull()
    expect(notes.closest('section')?.querySelector('h3')?.textContent).toBe('Notizen')
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

  it('holds the longest name allowed, without spaces, and 1000-character Notes', async () => {
    const name = 'x'.repeat(GAME_NAME_MAX)
    const notes = 'n'.repeat(GAME_NOTES_MAX - 1) + 'z'
    await open({ game: { ...FULL, name }, facts: { tags: [], notes } })

    expect(dialog().querySelector('h2')?.textContent).toBe(name)
    expect(dialog().querySelector('h2')?.className).toContain('[overflow-wrap:anywhere]')
    expect(text()).toContain(notes)
    expect(notes).toHaveLength(GAME_NOTES_MAX)
  })

  it('shows no link to the library to a viewer who may not see it (Host permission withdrawn)', async () => {
    signInAs({ ...kitty, canHost: false, isAdmin: false })
    await open()

    expect(link()).toBeNull()
    expect(text()).toContain('Notizen')
  })

  it('shows the link to a Platform admin', async () => {
    signInAs({ ...kitty, canHost: false, isAdmin: true })
    await open()

    expect(link()).not.toBeNull()
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
    await open({ audience: 'member', facts: FACTS })

    expect(dialog().querySelector('h2')?.textContent).toBe('Mario Kart')
    expect(dialog().querySelector('img')?.getAttribute('src')).toBe('/api/images/kart.webp')
    expect(pills()).toHaveLength(3)
    expect(pills()[2]).toContain('19,99 €')
    expect(dialog().querySelector('ul[aria-label="Tags"]')).toBeNull()
    for (const tag of EIGHT_TAGS) expect(text()).not.toContain(tag.label)
    expect(text()).not.toContain('Notizen')
    expect(text()).not.toContain('Erste Zeile')
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
