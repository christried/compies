import { mountSuspended } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ArchiveCard from '~/components/ArchiveCard.vue'
import type { ArchiveEntry } from '~~/shared/archive'
import { TEAM_SYMBOLS } from '~~/shared/team-marks'

// The Winner strip, the rank pill and the closed card of an Archive card (#883, spec #683): what a Member sees of the result, and what
// a card holds back until the Award ceremony has run. The card is mounted with an entry; the page and its states are archive-page.test.ts's.

function entry(overrides: Partial<ArchiveEntry> = {}): ArchiveEntry {
  return {
    slug: 'freitags-zocken-k7q2',
    name: 'Freitags-Zocken',
    finishedAt: '2026-10-25T21:00:00.000Z',
    format: { teamCount: 4, teamSize: 2 },
    gameCount: 7,
    memberCount: 9,
    isHost: false,
    seated: true,
    resultOpen: true,
    winners: [{ position: 3, name: 'Wilde Gurken' }],
    rank: 2,
    ...overrides,
  }
}

const mountEntry = (value: ArchiveEntry) => mountSuspended(ArchiveCard, { props: { entry: value } })
const mountCard = (overrides: Partial<ArchiveEntry> = {}) => mountEntry(entry(overrides))

const strips = (card: VueWrapper) => card.findAll('[data-part="winner"]')
const pills = (card: VueWrapper) => card.findAll('span.h-6').map(pill => pill.text())

/** The closed card: an entry without `winners` and `rank`, the keys left out as the server leaves them. */
function closedEntry(overrides: Partial<ArchiveEntry> = {}): ArchiveEntry {
  return {
    slug: 'freitags-zocken-k7q2',
    name: 'Freitags-Zocken',
    finishedAt: '2026-10-25T21:00:00.000Z',
    format: { teamCount: 4, teamSize: 2 },
    gameCount: 7,
    memberCount: 9,
    isHost: false,
    seated: true,
    resultOpen: false,
    ...overrides,
  }
}
const mountClosed = (overrides: Partial<ArchiveEntry> = {}) => mountEntry(closedEntry(overrides))

describe('the Winner strip', () => {
  it('shows one strip in the Winner\'s Team colour and pattern, with its mark, its Team name and a trophy', async () => {
    const card = await mountCard()
    const list = strips(card)

    expect(list).toHaveLength(1)
    const strip = list[0]!
    expect(strip.attributes('data-team')).toBe('3')
    expect(strip.attributes('style')).toContain('background-color: var(--cp-team-3)')
    expect(strip.attributes('style')).toContain('background-image: var(--cp-team-3-pattern)')
    // The mark is that position's: its colour and its symbol.
    const mark = strip.get('[aria-hidden="true"][style*="--cp-team-3"]')
    expect(mark.get('path').attributes('d')).toBe(TEAM_SYMBOLS[2])
    expect(strip.text()).toContain('Wilde Gurken')
    expect(strip.find('[data-part="trophy"]').exists()).toBe(true)
  })

  it('is the first thing on the card, above the name', async () => {
    const card = await mountCard()

    const link = card.get('a')
    expect(link.element.firstElementChild).toBe(strips(card)[0]!.element.parentElement)
    expect(card.get('b').text()).toBe('Freitags-Zocken')
  })

  it('puts the Team name on a solid chip of the Team colour, never on the pattern, with the ink of that colour', async () => {
    const card = await mountCard()

    const chip = strips(card)[0]!.get('[title="Wilde Gurken"]')
    expect(chip.attributes('style')).toContain('background-color: var(--cp-team-3)')
    expect(chip.attributes('style')).toContain('color: var(--cp-team-3-ink)')
    expect(chip.attributes('style')).not.toContain('pattern')
  })

  it('shows the Team colour\'s name when the team has no Team name', async () => {
    const card = await mountCard({ winners: [{ position: 4, name: null }] })

    expect(strips(card)[0]!.text()).toContain('Team Himmel')
  })

  it('shows one strip per Winner in the order of the list (Unentschieden), each in its own colour', async () => {
    const card = await mountCard({ winners: [{ position: 1, name: 'Eins' }, { position: 2, name: null }, { position: 5, name: 'Fünf' }] })
    const list = strips(card)

    expect(list.map(strip => strip.attributes('data-team'))).toEqual(['1', '2', '5'])
    expect(list.map(strip => strip.attributes('style')!.match(/background-color: var\(--cp-team-(\d)\)/)?.[1])).toEqual(['1', '2', '5'])
    expect(list.map(strip => strip.text())).toEqual([expect.stringContaining('Eins'), expect.stringContaining('Team Orange'), expect.stringContaining('Fünf')])
  })

  it('shows eight strips for an eight-team Tie, one per colour, in one column inside the one link', async () => {
    const winners = Array.from({ length: 8 }, (_, index) => ({ position: index + 1, name: null }))
    const card = await mountCard({ winners, format: { teamCount: 8, teamSize: 1 } })

    expect(strips(card)).toHaveLength(8)
    expect(strips(card).map(strip => strip.attributes('data-team'))).toEqual(['1', '2', '3', '4', '5', '6', '7', '8'])
    expect(card.findAll('a')).toHaveLength(1)
    expect(strips(card)[0]!.element.parentElement!.className).toContain('flex-col')
  })

  it('shows no strip and no pending sentence for an open result with nothing to show (0 Winners)', async () => {
    const card = await mountCard({ winners: [], rank: null })

    expect(strips(card)).toHaveLength(0)
    expect(card.find('[data-part="pending"]').exists()).toBe(false)
    expect(card.text()).not.toContain('Die Siegerehrung steht noch aus.')
    expect(pills(card)).toEqual([])
  })

  it('ends the longest Team name in an ellipsis on one line and keeps the whole name in its title and the trophy in the strip', async () => {
    // TEAM_SIZE_MAX words of TEAM_WORD_MAX characters, joined by spaces: 6 × 12 + 5 = 77 characters.
    const longest = Array.from({ length: 6 }, () => 'Zwölfzeichen').join(' ')
    const card = await mountCard({ winners: [{ position: 7, name: longest }] })

    expect(longest).toHaveLength(77)
    const chip = strips(card)[0]!.get(`[title="${longest}"]`)
    expect(chip.classes()).toContain('truncate')
    expect(chip.classes()).toContain('min-w-0')
    expect(chip.text()).toBe(longest)
    // The trophy is a sibling after the chip, pushed to the end, and does not shrink.
    expect(strips(card)[0]!.get('[data-part="trophy"]').classes()).toEqual(expect.arrayContaining(['ml-auto', 'flex-none']))
  })
})

describe('the rank pill', () => {
  it('names the Player\'s place, first in the pill row, with the primary fill and its own text colour', async () => {
    const card = await mountCard({ rank: 2 })

    expect(pills(card)).toEqual(['Platz 2'])
    const pill = card.findAll('span.h-6')[0]!
    expect(pill.classes()).toEqual(expect.arrayContaining(['bg-primary', 'text-on-primary']))
  })

  it('prints a shared rank as it is', async () => {
    expect(pills(await mountCard({ rank: 3 }))).toEqual(['Platz 3'])
    expect(pills(await mountCard({ rank: 1 }))).toEqual(['Platz 1'])
  })

  it('is followed by the Host mark, the Host being a Player', async () => {
    const card = await mountCard({ rank: 4, isHost: true })

    expect(pills(card)).toEqual(['Platz 4', 'Host'])
  })

  it('is not there for a Member on the Stands, who gets the Tribüne pill alone', async () => {
    const card = await mountCard({ seated: false, rank: null })

    expect(pills(card)).toEqual(['Tribüne'])
  })

  it('shows Tribüne and then Host for the Host on the Stands', async () => {
    const card = await mountCard({ seated: false, rank: null, isHost: true })

    expect(pills(card)).toEqual(['Tribüne', 'Host'])
  })
})

describe('the closed card', () => {
  it('says the Siegerehrung is still to come in the strip\'s place, with no strip, no trophy and no rank', async () => {
    const card = await mountClosed()

    expect(strips(card)).toHaveLength(0)
    expect(card.get('[data-part="pending"]').text()).toBe('Die Siegerehrung steht noch aus.')
    expect(card.find('[data-part="trophy"]').exists()).toBe(false)
    expect(pills(card)).toEqual([])
    expect(card.text()).not.toContain('Platz')
  })

  it('shows the sentence in the card\'s first place, above the name', async () => {
    const card = await mountClosed()

    expect(card.get('a').element.firstElementChild).toBe(card.get('[data-part="pending"]').element)
  })

  it('keeps Tribüne for a Member on the Stands and the Host mark for the Host', async () => {
    expect(pills(await mountClosed({ seated: false }))).toEqual(['Tribüne'])
    expect(pills(await mountClosed({ isHost: true }))).toEqual(['Host'])
    expect(pills(await mountClosed({ seated: false, isHost: true }))).toEqual(['Tribüne', 'Host'])
  })
})

describe('the link', () => {
  it('stays one link named by the Event\'s name alone, whatever the strip and the pills say', async () => {
    const card = await mountCard({ isHost: true })
    const link = card.get('a')
    const label = link.attributes('aria-labelledby')!

    expect(card.findAll('a')).toHaveLength(1)
    expect(link.attributes('href')).toBe('/e/freitags-zocken-k7q2')
    expect(card.get(`[id="${label}"]`).text()).toBe('Freitags-Zocken')
  })
})
