import { mountSuspended } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { h } from 'vue'
import { afterEach, describe, expect, it } from 'vitest'
import GameCard from '~/components/GameCard.vue'
import { GAME_NAME_MAX, type GameView } from '~~/shared/game'

// The card's structure (#351): the actions sit in the card's last child, and the body grows, so in a stretched grid row the
// buttons of every card share one bottom edge, whatever the length of the name, the player count, Suitabilities, Price and Tags.

type Props = Partial<Pick<GameView, 'playersMin' | 'playersMax' | 'suitabilities' | 'tags' | 'price' | 'imageUrl' | 'youtubeId'>> & { name: string }
type Layout = 'card' | 'row' | 'responsive' | 'tile'

let page: VueWrapper | undefined

async function mount(game: Props, layout: Layout, withActions = true) {
  const { name, ...rest } = game
  page = await mountSuspended(GameCard, {
    props: {
      game: { id: 'g-1', imageUrl: null, youtubeId: null, playersMin: null, playersMax: null, suitabilities: [], tags: [], price: null, ...rest, name },
      layout,
    },
    slots: withActions ? { actions: () => h('button', { type: 'button' }, 'Hinzufügen') } : {},
  })
  return page
}

// The root's children: the cover, the body (the element that holds the name `<b>`), and the actions wrapper when there is one.
const root = () => page!.element as HTMLElement
const body = () => root().querySelector('b')!.parentElement as HTMLElement
const lastChild = () => root().lastElementChild as HTMLElement

const LONG_NAME = 'x'.repeat(GAME_NAME_MAX)
const FULL = { playersMin: 2, playersMax: 6, suitabilities: ['teams', 'one_v_one'] as GameView['suitabilities'], tags: [{ key: 'a', label: 'Retro' }, { key: 'b', label: 'Koop' }, { key: 'c', label: 'Party' }], price: { cents: 1999, source: 'steam' as const, checkedAt: '2026-11-01T10:00:00.000Z' } }

afterEach(() => {
  page?.unmount()
  page = undefined
})

describe('the game card structure (#351)', () => {
  it('in the responsive layout, the actions are the last child and the body grows in the md column', async () => {
    await mount({ name: 'Mario Kart' }, 'responsive')

    expect(lastChild().querySelector('button')?.textContent).toBe('Hinzufügen')
    expect(root().className).toContain('md:flex-col')
    expect(root().className).toContain('md:items-stretch')
    expect(body().className).toContain('md:flex-auto')
    expect(body().className).not.toContain('md:flex-none')
  })

  it('in the card layout, the card is a column, the body grows, and the actions are the last child', async () => {
    await mount({ name: 'Mario Kart' }, 'card')

    expect(root().className).toContain('flex-col')
    expect(body().className).toContain('flex-auto')
    expect(lastChild().querySelector('button')?.textContent).toBe('Hinzufügen')
  })

  it('in the row layout, the card is no column, and the actions are still the last child', async () => {
    await mount({ name: 'Mario Kart' }, 'row')

    expect(root().className).not.toContain('flex-col')
    expect(lastChild().querySelector('button')?.textContent).toBe('Hinzufügen')
  })

  it('keeps the same structure for a long card and a short one, so the row can stretch them to one height', async () => {
    await mount({ name: LONG_NAME, ...FULL }, 'responsive')
    const longRoot = root().className
    const longLast = lastChild().querySelector('button') !== null
    page!.unmount()

    await mount({ name: 'Pong' }, 'responsive')

    expect(root().className).toBe(longRoot)
    expect(longLast).toBe(true)
    expect(lastChild().querySelector('button')?.textContent).toBe('Hinzufügen')
    expect(body().className).toContain('md:flex-auto')
  })

  it('without an actions slot there is no actions wrapper, and the body is the last child', async () => {
    await mount({ name: 'Mario Kart' }, 'responsive', false)

    expect(lastChild()).toBe(body())
    expect(lastChild().querySelector('button')).toBeNull()
  })
})

// Each Tag chip wears a Team colour by its key (#427); `tag-colors.test.ts` pins the colours of these keys (retro 7, co-op 1,
// koop 2, horror 5, indie 7). The „+N“ stays neutral.
describe('the Tag chips on a game card (#427)', () => {
  const chips = () => [...root().querySelectorAll<HTMLElement>('[role="group"] > span')]

  it('colours each shown Tag by its key, with its ink, and leaves the „+N“ neutral', async () => {
    const tags = [{ key: 'retro', label: 'Retro' }, { key: 'co-op', label: 'Co-op' }, { key: 'koop', label: 'Koop' }, { key: 'horror', label: 'Horror' }]
    await mount({ name: 'Mario Kart', tags }, 'card')

    const [retro, coop, koop, more] = chips()
    expect(retro!.getAttribute('style')).toContain('var(--cp-team-7)')
    expect(retro!.getAttribute('style')).toContain('var(--cp-team-7-ink)')
    expect(coop!.getAttribute('style')).toContain('var(--cp-team-1)')
    expect(koop!.getAttribute('style')).toContain('var(--cp-team-2)')
    expect(more!.textContent).toBe('+1')
    expect(more!.getAttribute('style') ?? '').not.toContain('--cp-team')
  })

  it('gives a Tag whose colour an earlier Tag wears the next free one, as on the game page', async () => {
    // „Indie“ has the colour 7 of its own, like „Retro“ before it.
    const tags = [{ key: 'retro', label: 'Retro' }, { key: 'indie', label: 'Indie' }]
    await mount({ name: 'Mario Kart', tags }, 'card')

    expect(chips()[0]!.getAttribute('style')).toContain('var(--cp-team-7)')
    expect(chips()[1]!.getAttribute('style')).toContain('var(--cp-team-8)')
  })
})

// The tile (#435): on the Event page a game is its picture and its name, nothing else. The tile is a plain element: no link, no
// button, and no actions slot, so the Spielepool, „Zuletzt gezogen“ and „Gerade dran“ show the same thing for the Host and a Member.
describe('the tile layout (#435)', () => {
  const FULL_TILE = { name: 'Mario Kart', ...FULL, imageUrl: '/api/images/kart.webp' }

  it('shows the cover and the name only, even given players, Suitabilities, Tags and a Price', async () => {
    await mount(FULL_TILE, 'tile')

    expect(root().querySelector('img')?.getAttribute('src')).toBe('/api/images/kart.webp')
    expect(root().textContent).toContain('Mario Kart')
    expect(root().textContent).not.toContain('2–6')
    expect(root().textContent).not.toContain('Teams')
    expect(root().textContent).not.toContain('Retro')
    expect(root().textContent).not.toContain('Party')
    expect(root().textContent).not.toContain('€')
    expect(root().querySelector('[role="group"]')).toBeNull()
    expect(root().querySelector('svg')).toBeNull()
  })

  it('has no actions wrapper: the body is the last child, as no consumer gives the tile an actions slot', async () => {
    await mount({ name: 'Mario Kart', ...FULL }, 'tile', false)

    expect(lastChild()).toBe(body())
  })

  it('is no link and no button: the name is a plain element and the card holds no interactive control', async () => {
    await mount({ name: 'Mario Kart', ...FULL }, 'tile', false)

    expect(root().querySelector('a')).toBeNull()
    expect(root().querySelector('button')).toBeNull()
    expect(root().querySelector('b')?.textContent).toBe('Mario Kart')
  })

  it('takes its cover from the image, else the Clip’s YouTube thumbnail, else the placeholder', async () => {
    await mount({ name: 'Mario Kart', imageUrl: '/api/images/kart.webp', youtubeId: 'dQw4w9WgXcQ' }, 'tile', false)
    expect(root().querySelector('[data-cover]')?.getAttribute('data-cover')).toBe('image')
    expect(root().querySelector('img')?.getAttribute('src')).toBe('/api/images/kart.webp')
    page!.unmount()

    await mount({ name: 'Mario Kart', imageUrl: null, youtubeId: 'dQw4w9WgXcQ' }, 'tile', false)
    expect(root().querySelector('[data-cover]')?.getAttribute('data-cover')).toBe('image')
    expect(root().querySelector('img')?.getAttribute('src')).toContain('dQw4w9WgXcQ')
    page!.unmount()

    await mount({ name: 'Mario Kart', imageUrl: null, youtubeId: null }, 'tile', false)
    expect(root().querySelector('[data-cover]')?.getAttribute('data-cover')).toBe('placeholder')
    expect(root().querySelector('img')).toBeNull()
  })

  it('wraps a name of GAME_NAME_MAX characters without spaces inside the tile, at most two lines', async () => {
    await mount({ name: LONG_NAME }, 'tile', false)

    const name = root().querySelector('b')!
    expect(name.className).toContain('break-words')
    expect(name.className).toContain('line-clamp-2')
  })
})
