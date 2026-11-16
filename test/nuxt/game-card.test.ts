import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { h } from 'vue'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import GameCard from '~/components/GameCard.vue'
import { build, parse, themeBlock } from '../unit/css-tokens'
import { GAME_NAME_MAX, TAG_MAX, type GameView } from '~~/shared/game'

// The card's structure (#351): the actions sit in the card's last child, and the body grows, so in a stretched grid row the
// buttons of every card share one bottom edge, whatever the length of the name, the player count, Suitabilities, Price and Tags.

type Props = Partial<Pick<GameView, 'playersMin' | 'playersMax' | 'suitabilities' | 'tags' | 'price' | 'imageUrl' | 'youtubeId'>> & { name: string, inEvents?: number }
type Layout = 'card' | 'row' | 'responsive' | 'tile'

let page: VueWrapper | undefined

async function mount(game: Props, layout: Layout, withActions = true, attachTo?: HTMLElement) {
  const { name, inEvents, ...rest } = game
  page = await mountSuspended(GameCard, {
    props: {
      game: { id: 'g-1', imageUrl: null, youtubeId: null, playersMin: null, playersMax: null, suitabilities: [], tags: [], price: null, ...rest, name },
      layout,
      inEvents,
    },
    slots: withActions ? { actions: () => h('button', { type: 'button' }, 'Hinzufügen') } : {},
    attachTo,
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
  const moreButton = () => root().querySelector<HTMLButtonElement>('[role="group"] > button')

  it('colours each shown Tag by its key, with its ink, and leaves the „+N“ neutral', async () => {
    const tags = [{ key: 'retro', label: 'Retro' }, { key: 'co-op', label: 'Co-op' }, { key: 'koop', label: 'Koop' }, { key: 'horror', label: 'Horror' }]
    await mount({ name: 'Mario Kart', tags }, 'card')

    const [retro, coop, koop] = chips()
    expect(retro!.getAttribute('style')).toContain('var(--cp-team-7)')
    expect(retro!.getAttribute('style')).toContain('var(--cp-team-7-ink)')
    expect(coop!.getAttribute('style')).toContain('var(--cp-team-1)')
    expect(koop!.getAttribute('style')).toContain('var(--cp-team-2)')
    expect(moreButton()!.textContent).toBe('+1')
    expect(moreButton()!.getAttribute('style') ?? '').not.toContain('--cp-team')
  })

  it('gives a Tag whose colour an earlier Tag wears the next free one, as on the game page', async () => {
    // „Indie“ has the colour 7 of its own, like „Retro“ before it.
    const tags = [{ key: 'retro', label: 'Retro' }, { key: 'indie', label: 'Indie' }]
    await mount({ name: 'Mario Kart', tags }, 'card')

    expect(chips()[0]!.getAttribute('style')).toContain('var(--cp-team-7)')
    expect(chips()[1]!.getAttribute('style')).toContain('var(--cp-team-8)')
  })

  it('renders no Tag group for a game without Tags', async () => {
    await mount({ name: 'Mario Kart', tags: [] }, 'card')

    expect(root().querySelector('[role="group"]')).toBeNull()
    expect(chips()).toHaveLength(0)
  })

  it('renders one Tag as one chip in its colour, and no „+N“', async () => {
    await mount({ name: 'Mario Kart', tags: [{ key: 'co-op', label: 'Co-op' }] }, 'card')

    expect(chips()).toHaveLength(1)
    expect(chips()[0]!.getAttribute('style')).toContain('var(--cp-team-1)')
    expect(chips()[0]!.getAttribute('style')).toContain('var(--cp-team-1-ink)')
    expect(root().textContent).not.toContain('+')
  })

  it('renders a Tag with the longest allowed label in its colour, cut inside the card', async () => {
    const label = 'M'.repeat(TAG_MAX)
    await mount({ name: 'Mario Kart', tags: [{ key: label.toLowerCase(), label }] }, 'card')

    const chip = chips()[0]!
    expect(chip.textContent!.trim()).toBe(label)
    // 4: the key's own colour (see the unit test)
    expect(chip.getAttribute('style')).toContain('var(--cp-team-4)')
    expect(chip.getAttribute('style')).toContain('var(--cp-team-4-ink)')
    expect(chip.className).toContain('truncate')
    expect(chip.className).toContain('max-w-[9rem]')
  })
})

// The „+N“ button (#614): it names its count, sits on the chips' line and opens a popover of every Tag. Using it never follows the card's link.
describe('the „+N“ button and its popover (#614)', () => {
  const FIVE = [{ key: 'retro', label: 'Retro' }, { key: 'co-op', label: 'Co-op' }, { key: 'koop', label: 'Koop' }, { key: 'horror', label: 'Horror' }, { key: 'indie', label: 'Indie' }]
  const chips = () => [...root().querySelectorAll<HTMLElement>('[role="group"] > span')]
  const moreButton = () => root().querySelector<HTMLButtonElement>('[role="group"] > button')
  const popover = () => document.querySelector<HTMLElement>('[role="note"]')
  const popoverChips = () => [...popover()!.querySelectorAll<HTMLElement>('[role="group"] > span')]
  const hover = async (target: HTMLElement) => {
    target.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }))
    await flushPromises()
  }

  it('is a button named by the Tags beyond three, with no native tooltip: „+2“ for five, „+1“ for four', async () => {
    await mount({ name: 'Mario Kart', tags: FIVE }, 'card')

    expect(moreButton()!.tagName).toBe('BUTTON')
    expect(moreButton()!.textContent).toBe('+2')
    expect(moreButton()!.getAttribute('aria-label')).toBe('2 weitere Tags')
    expect(moreButton()!.hasAttribute('title')).toBe(false)
    page!.unmount()

    await mount({ name: 'Mario Kart', tags: FIVE.slice(0, 4) }, 'card')

    expect(moreButton()!.textContent).toBe('+1')
    expect(moreButton()!.getAttribute('aria-label')).toBe('1 weiterer Tag')
  })

  it('shows no „+N“ and no popover at three Tags or fewer', async () => {
    await mount({ name: 'Mario Kart', tags: FIVE.slice(0, 3) }, 'card')

    expect(chips()).toHaveLength(3)
    expect(moreButton()).toBeNull()
    expect(root().querySelector('button[aria-haspopup]')).toBeNull()
  })

  it('opens on hover a popover of every Tag, in the game’s order, with the colours the chips wear', async () => {
    await mount({ name: 'Mario Kart', tags: FIVE }, 'card')
    expect(popover()).toBeNull()

    await hover(moreButton()!)

    expect(popover()).not.toBeNull()
    expect(popover()!.parentElement).toBe(document.body)
    expect(popover()!.querySelector('[role="group"]')!.getAttribute('aria-label')).toBe('Tags')
    expect(popoverChips().map(chip => chip.textContent!.trim())).toEqual(['Retro', 'Co-op', 'Koop', 'Horror', 'Indie'])
    // The first three wear the colours of the card's chips; „Horror“ its own, „Indie“ the next free one after „Retro“ (#427).
    expect(popoverChips()[0]!.getAttribute('style')).toBe(chips()[0]!.getAttribute('style'))
    expect(popoverChips()[1]!.getAttribute('style')).toBe(chips()[1]!.getAttribute('style'))
    expect(popoverChips()[2]!.getAttribute('style')).toBe(chips()[2]!.getAttribute('style'))
    expect(popoverChips()[3]!.getAttribute('style')).toContain('var(--cp-team-5)')
    expect(popoverChips()[4]!.getAttribute('style')).toContain('var(--cp-team-8)')
  })

  it('does not follow the card’s link: a click on „+N“ leaves the link and the router alone', async () => {
    page = await mountSuspended(GameCard, {
      props: { game: { id: 'g-1', name: 'Mario Kart', imageUrl: null, youtubeId: null, playersMin: null, playersMax: null, suitabilities: [], tags: FIVE, price: null }, layout: 'card', to: '/bibliothek/g-1' },
    })
    const link = root().querySelector('a')!
    const onLinkClick = vi.fn()
    link.addEventListener('click', onLinkClick)
    const pushState = vi.spyOn(window.history, 'pushState')

    moreButton()!.click()
    await flushPromises()

    expect(onLinkClick).not.toHaveBeenCalled()
    expect(pushState).not.toHaveBeenCalled()
    expect(popover()).not.toBeNull()
    pushState.mockRestore()
  })

  it('does not press the picker’s own button: a click on „+N“ on a row without a link leaves the actions alone', async () => {
    const onPick = vi.fn()
    page = await mountSuspended(GameCard, {
      props: { game: { id: 'g-1', name: 'Mario Kart', imageUrl: null, youtubeId: null, playersMin: null, playersMax: null, suitabilities: [], tags: FIVE, price: null }, layout: 'row' },
      slots: { actions: () => h('button', { type: 'button', onClick: onPick }, 'Wählen') },
    })

    moreButton()!.click()
    await flushPromises()

    expect(onPick).not.toHaveBeenCalled()
    expect(popover()).not.toBeNull()
  })

  it('has a 44 px hit area, and keeps its own height, font and line (#658, #614)', async () => {
    await mount({ name: 'Mario Kart', tags: FIVE }, 'card')

    const classes = moreButton()!.classList
    expect(classes.contains('hit-44')).toBe(true)
    // What #614 built stays: the hit area is a pseudo-element, so the button's look and the card's layout do not change.
    for (const kept of ['h-6', 'px-1.5', 'text-[12px]', 'leading-5', 'font-bold']) expect(classes.contains(kept)).toBe(true)
  })

  it('closes on Esc and keeps the focus on „+N“, which the focus opened', async () => {
    const container = document.createElement('div')
    document.body.append(container)
    await mount({ name: 'Mario Kart', tags: FIVE }, 'card', true, container)

    moreButton()!.focus()
    await flushPromises()
    expect(popover()).not.toBeNull()
    expect(document.activeElement).toBe(moreButton())

    moreButton()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    await flushPromises()

    expect(popover()).toBeNull()
    expect(document.activeElement).toBe(moreButton())
    container.remove()
  })
})

// „in 2 Events“ (#733): a neutral pill under the Price line and above the Tags, for a game that sits in the pool of live Events. A count, no Tag.
describe('the „in N Events“ marker (#733)', () => {
  const marker = () => [...root().querySelectorAll('span')].find(span => /^in \d+ Events?$/.test(span.textContent!.trim()))

  it('draws nothing for 0 and for no count', async () => {
    for (const inEvents of [0, undefined]) {
      await mount({ name: 'Mario Kart', ...FULL, inEvents }, 'card')
      expect(marker()).toBeUndefined()
      expect(root().textContent).not.toContain('Event')
      page?.unmount()
    }
  })

  it('reads „in 1 Event“ for one, „in 2 Events“ for two and „in 12 Events“ for twelve', async () => {
    for (const [inEvents, text] of [[1, 'in 1 Event'], [2, 'in 2 Events'], [12, 'in 12 Events']] as const) {
      await mount({ name: 'Mario Kart', inEvents }, 'card')
      expect(marker()?.textContent?.trim()).toBe(text)
      page?.unmount()
    }
  })

  it('sits under the Price line and above the Tags', async () => {
    await mount({ name: 'Mario Kart', ...FULL, inEvents: 2 }, 'card')

    const lines = [...body().children]
    const at = lines.indexOf(marker()!)
    expect(lines[at - 1]?.textContent).toContain('€')
    expect(lines[at + 1]?.getAttribute('role')).toBe('group')
  })

  it('is no Tag chip: neutral paper-2 fill and line border, ink-2 text', async () => {
    await mount({ name: 'Mario Kart', inEvents: 2 }, 'card')

    expect(marker()!.className).toContain('bg-paper-2')
    expect(marker()!.className).toContain('border-line')
    expect(marker()!.className).toContain('text-ink-2')
  })

  it('is left out of the tile layout', async () => {
    await mount({ name: 'Mario Kart', inEvents: 2 }, 'tile')

    expect(marker()).toBeUndefined()
  })

  it('shows on the row and the responsive layouts too', async () => {
    for (const layout of ['row', 'responsive'] as const) {
      await mount({ name: 'Mario Kart', inEvents: 2 }, layout)
      expect(marker()?.textContent?.trim()).toBe('in 2 Events')
      page?.unmount()
    }
  })

  it('renders with the longest name, and stays inside the card (truncated, never wider)', async () => {
    for (const layout of ['card', 'row'] as const) {
      await mount({ name: LONG_NAME, ...FULL, inEvents: 2 }, layout)
      expect(root().textContent).toContain(LONG_NAME)
      expect(marker()?.textContent?.trim()).toBe('in 2 Events')
      expect(marker()!.className).toContain('max-w-full')
      expect(marker()!.className).toContain('truncate')
      page?.unmount()
    }
  })

  it('adds no list item, link, button or tab stop', async () => {
    await mount({ name: 'Mario Kart', inEvents: 2 }, 'card', false)

    expect(marker()!.querySelector('li, a, button')).toBeNull()
    expect(marker()!.closest('li')).toBeNull()
    expect(root().querySelectorAll('a, button, li')).toHaveLength(0)
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

// The name reserves two lines (#612), so a one-line title makes no shorter tile than a two-line one. jsdom has no layout:
// the tests pin the classes that reserve the lines, the heights are measured in the browser check.
describe('the two reserved title lines (#612)', () => {
  const TITLES = [
    ['a one-word title', 'Pong'],
    ['a title of two lines', 'Mario Kart 8 Deluxe Booster Pass'],
    ['the longest allowed title, without spaces', LONG_NAME],
  ] as const
  const tokens = (el: Element) => el.className.split(' ')

  it.each(TITLES)('keeps two lines for %s in the tile, with the clamp and the wrap', async (_what, name) => {
    await mount({ name }, 'tile', false)

    const classes = tokens(root().querySelector('b')!)
    expect(classes).toEqual(expect.arrayContaining(['min-h-[2lh]', 'line-clamp-2', 'break-words']))
  })

  it.each(TITLES)('keeps two lines for %s in the card layout, with the clamp', async (_what, name) => {
    await mount({ name }, 'card', false)

    expect(tokens(root().querySelector('b')!)).toEqual(expect.arrayContaining(['min-h-[2lh]', 'line-clamp-2']))
  })

  it.each(TITLES)('keeps two lines for %s only from md in the responsive layout, the row below stays one line', async (_what, name) => {
    await mount({ name }, 'responsive', false)

    const classes = tokens(root().querySelector('b')!)
    expect(classes).toEqual(expect.arrayContaining(['md:min-h-[2lh]', 'truncate', 'md:line-clamp-2']))
    expect(classes).not.toContain('min-h-[2lh]')
  })

  it.each(TITLES)('reserves nothing in the row layout for %s', async (_what, name) => {
    await mount({ name }, 'row', false)

    const name_ = root().querySelector('b')!
    expect(name_.className).not.toContain('min-h-[2lh]')
    expect(tokens(name_)).toContain('truncate')
  })

  it('reserves the lines on the button that opens a tile, and shows the whole title', async () => {
    page = await mountSuspended(GameCard, {
      props: { game: { id: 'g-1', name: LONG_NAME, imageUrl: null, youtubeId: null, price: null, playersMin: null, playersMax: null, suitabilities: [] }, layout: 'tile', opens: true },
    })

    const button = root().querySelector('button')!
    expect(tokens(button)).toContain('min-h-[2lh]')
    expect(button.textContent).toBe(LONG_NAME)
  })

  it('reserves the lines on the link of a responsive card from md, and shows the whole title', async () => {
    page = await mountSuspended(GameCard, {
      props: { game: { id: 'g-1', name: LONG_NAME, imageUrl: null, youtubeId: null, price: null, playersMin: null, playersMax: null, suitabilities: [] }, layout: 'responsive', to: '/bibliothek/g-1' },
    })

    const link = root().querySelector('a')!
    expect(tokens(link)).toContain('md:min-h-[2lh]')
    expect(tokens(link)).not.toContain('min-h-[2lh]')
    expect(link.textContent).toBe(LONG_NAME)
  })

  it('gives a tile of the longest title and a tile of a one-word title the same classes, so the same size', async () => {
    await mount({ name: LONG_NAME }, 'tile', false)
    const long = { root: root().className, name: root().querySelector('b')!.className }
    page!.unmount()

    await mount({ name: 'Pong' }, 'tile', false)

    expect(root().className).toBe(long.root)
    expect(root().querySelector('b')!.className).toBe(long.name)
  })
})

// A tile that opens a dialog (#443, #444): a tile with `opens` is a button, one without it stays plain.
describe('the tile that opens (#443)', () => {
  async function mountOpening(props: { opens?: boolean, to?: string }) {
    page = await mountSuspended(GameCard, {
      props: { game: { id: 'g-1', name: 'Mario Kart', imageUrl: null, youtubeId: null, price: null, playersMin: null, playersMax: null, suitabilities: [] }, layout: 'tile', ...props },
    })
    return page
  }

  it('makes the name a button that names the game, says it opens a dialog, and emits open on a click', async () => {
    const card = await mountOpening({ opens: true })

    const button = card.get('button')
    expect(button.text()).toBe('Mario Kart')
    expect(button.attributes('type')).toBe('button')
    expect(button.attributes('aria-haspopup')).toBe('dialog')
    expect(button.classes()).toEqual(expect.arrayContaining(['focus-visible:focus-ring', 'after:absolute', 'after:inset-0']))
    expect(card.find('b').exists()).toBe(false)

    await button.trigger('click')

    expect(card.emitted('open')).toHaveLength(1)
  })

  it('has no button without opens, and no aria-haspopup', async () => {
    const card = await mountOpening({})

    expect(card.find('button').exists()).toBe(false)
    expect(card.find('[aria-haspopup]').exists()).toBe(false)
    expect(card.get('b').text()).toBe('Mario Kart')
  })

  it('lets a link win over opens: with `to` the name is the link and no button', async () => {
    const card = await mountOpening({ opens: true, to: '/bibliothek/g-1' })

    expect(card.find('button').exists()).toBe(false)
    expect(card.get('a').attributes('href')).toBe('/bibliothek/g-1')
  })
})

// A shadowed card lifts on hover only where the card itself can be clicked (#608): a lift always means a click.
describe('the lift on a card that can be clicked (#608)', () => {
  async function mountClickable(layout: Layout, props: { opens?: boolean, to?: string }, withActions = false) {
    page = await mountSuspended(GameCard, {
      props: { game: { id: 'g-1', name: 'Mario Kart', imageUrl: null, youtubeId: null, price: null, playersMin: null, playersMax: null, suitabilities: [], tags: [] }, layout, ...props },
      slots: withActions ? { actions: () => h('button', { type: 'button' }, 'Hinzufügen') } : {},
    })
    return page
  }

  it.each<Layout>(['responsive', 'row', 'card'])('lifts a %s card with a link', async (layout) => {
    await mountClickable(layout, { to: '/bibliothek/g-1' })

    expect(root().classList.contains('lift')).toBe(true)
  })

  it('lifts a tile that opens, and one that opens and has a link', async () => {
    await mountClickable('tile', { opens: true })
    expect(root().classList.contains('lift')).toBe(true)
    page?.unmount()

    await mountClickable('tile', { opens: true, to: '/bibliothek/g-1' })
    expect(root().classList.contains('lift')).toBe(true)
  })

  // The press (#658): `:active` matches the pressed element and every ancestor of it, so a button inside the card would press the card
  // too. jsdom has no `:active`, so the compiled rule is read for its selector and `:active` is swapped for an attribute that the
  // test sets on the pressed element and on each of its ancestors, as the browser does.
  describe('presses only for its own click (#658)', () => {
    const FIVE = [{ key: 'a', label: 'Retro' }, { key: 'b', label: 'Koop' }, { key: 'c', label: 'Party' }, { key: 'd', label: 'Horror' }, { key: 'e', label: 'Indie' }]
    const NAME = 'Mario Kart'

    let pressSelector: string
    beforeAll(async () => {
      const css = await build(`${themeBlock(/@utility tint/)}\n${themeBlock(/@utility lift/)}`, ['lift'])
      const flat = parse(css).find(rule => rule.decls.includes('box-shadow: none') && rule.chain.at(-1)!.startsWith('&:active'))
      pressSelector = flat!.chain.at(-1)!.replace(/^&/, '.lift').replaceAll(':active', '[data-down]')
    })

    /** Whether the card presses while `target` is held down: the target and its ancestors carry `data-down`, as `:active` does. */
    function pressedBy(target: HTMLElement) {
      const down: HTMLElement[] = []
      for (let el: HTMLElement | null = target; el; el = el.parentElement) {
        el.setAttribute('data-down', '')
        down.push(el)
      }
      const presses = root().matches(pressSelector)
      for (const el of down) el.removeAttribute('data-down')
      return presses
    }

    async function mountCard(props: { to?: string, opens?: boolean }, layout: Layout = 'card') {
      page = await mountSuspended(GameCard, {
        props: { game: { id: 'g-1', name: NAME, imageUrl: null, youtubeId: null, price: null, playersMin: null, playersMax: null, suitabilities: [], tags: FIVE }, layout, ...props },
        slots: { actions: () => [h('button', { type: 'button' }, 'Wählen'), h('a', { href: '/x' }, 'Notizen')] },
      })
    }
    const name = () => root().querySelector<HTMLElement>('a[href="/bibliothek/g-1"], [data-lift-owner]')!

    it('presses when the name link is pressed', async () => {
      await mountCard({ to: '/bibliothek/g-1' })

      expect(name().textContent!.trim()).toBe(NAME)
      expect(pressedBy(name())).toBe(true)
    })

    it('presses when the tile’s name button is pressed', async () => {
      await mountCard({ opens: true }, 'tile')

      expect(name().tagName).toBe('BUTTON')
      expect(pressedBy(name())).toBe(true)
    })

    it('presses when the card is pressed anywhere else on it, where no control is', async () => {
      await mountCard({ to: '/bibliothek/g-1' })

      expect(pressedBy(root().querySelector('[data-cover]')!)).toBe(true)
    })

    it('stays still when „+N“ is pressed', async () => {
      await mountCard({ to: '/bibliothek/g-1' })

      expect(pressedBy(root().querySelector<HTMLElement>('[role="group"] > button')!)).toBe(false)
    })

    it('stays still when a button or a link in the actions is pressed', async () => {
      await mountCard({ to: '/bibliothek/g-1' })

      expect(pressedBy(root().querySelector<HTMLElement>('button:not([aria-haspopup])')!)).toBe(false)
      expect(pressedBy(root().querySelector<HTMLElement>('a[href="/x"]')!)).toBe(false)
    })
  })

  it('keeps a static card still: a tile without opens, a card and a row without a link, and an empty link', async () => {
    for (const [layout, props, withActions] of [['tile', {}, false], ['card', {}, false], ['row', {}, true], ['row', { to: '' }, true]] as const) {
      await mountClickable(layout, props, withActions)
      expect(root().classList.contains('lift')).toBe(false)
      page?.unmount()
    }
  })
})
