import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import CeremonyPersonCell from '~/components/CeremonyPersonCell.vue'
import type { CeremonyPerson } from '~/utils/ceremony'

// The person cell of the Award ceremony (#328, review 0.9 S4 and F7): the picture, the name and the „+N“ of one person of a Winner. A cell
// (`cells()` in Siegerehrung Unentschieden.dc.html) has the Team ring, the name and a 2.5 px „+N“ circle at 0.3 of the size; a grid card's
// stack has none of the three and a 2 px circle at 0.4. Tests use people with a picture, as every account has one (CODING_STANDARDS § Tests).

const player: CeremonyPerson = { kind: 'player', id: 'anna', name: 'Anna', image: 'https://example.com/anna.png', team: 2 }
const gone: CeremonyPerson = { kind: 'player', id: 'weg', name: 'Gelöschtes Konto', image: null, deleted: true, team: 2 }
const mark: CeremonyPerson = { kind: 'mark', team: 2, name: 'Die Füchse' }
const more: CeremonyPerson = { kind: 'more', n: 2 }

const mountCell = (person: CeremonyPerson, size: 24 | 28 | 44 | 56 | 64 | 80, options: { stack?: boolean, nameFontSize?: number } = {}) =>
  mountSuspended(CeremonyPersonCell, { props: { person, size, ...options } })

/** The picture's own circle: the element whose style carries a box-shadow (the Team ring), if any. */
const ringed = (page: Awaited<ReturnType<typeof mountCell>>) => page.findAll('[style*="box-shadow"]')

describe('a cell of a Winner', () => {
  it('shows the Player with the Team ring and the name', async () => {
    const page = await mountCell(player, 56)

    expect(page.text()).toContain('Anna')
    const rings = ringed(page)
    expect(rings).toHaveLength(1)
    expect(rings[0]!.attributes('style')).toContain('var(--cp-team-2)')
  })

  it('shows a TeamMark with the name of a Party without Players', async () => {
    const page = await mountCell(mark, 56)

    expect(page.text()).toContain('Die Füchse')
    expect(page.find('path[fill="var(--cp-team-2-ink)"]').exists()).toBe(true)
  })

  it.each([
    [80, '24px', 'border-[2.5px]'],
    [64, '19px', 'border-[2.5px]'],
    [44, '13px', 'border-[2.5px]'],
  ])('draws „+2“ at a picture of %i px: %s, 2.5 px border, and the name „2 weitere“', async (size, fontSize, borderClass) => {
    const page = await mountCell(more, size as 80 | 64 | 44)
    const circle = page.findAll('span').find(span => span.text() === '+2')!

    expect(circle.attributes('style')).toContain(`font-size: ${fontSize}`)
    expect(circle.classes()).toContain(borderClass)
    expect(page.text()).toContain('2 weitere')
  })
})

describe('a stack of a grid card', () => {
  it('shows the Player without a Team ring and without a name', async () => {
    const page = await mountCell(player, 28, { stack: true })

    expect(page.text()).not.toContain('Anna')
    expect(ringed(page)).toHaveLength(0)
  })

  it('shows a TeamMark without a name', async () => {
    const page = await mountCell(mark, 28, { stack: true })

    expect(page.text()).not.toContain('Die Füchse')
    expect(page.find('path[fill="var(--cp-team-2-ink)"]').exists()).toBe(true)
  })

  it('draws „+2“ at 28 px in a 2 px circle at 11 px, without the name „2 weitere“', async () => {
    const page = await mountCell(more, 28, { stack: true })
    const circle = page.findAll('span').find(span => span.text() === '+2')!

    expect(circle.attributes('style')).toContain('font-size: 11px')
    expect(circle.classes()).toContain('border-2')
    expect(page.text()).not.toContain('weitere')
  })

  it('draws „+2“ at 24 px at 10 px', async () => {
    const page = await mountCell(more, 24, { stack: true })
    const circle = page.findAll('span').find(span => span.text() === '+2')!

    expect(circle.attributes('style')).toContain('font-size: 10px')
  })
})

// A Deleted Player (#915, ADR 0020): the neutral picture and the name „Gelöschtes Konto“ in a cell; the stack of a grid card has the picture alone.
describe('a Deleted Player', () => {
  it('shows the icon and no picture in a cell, with the Team ring and the name', async () => {
    const page = await mountCell(gone, 56)

    expect(page.find('img').exists()).toBe(false)
    expect(page.find('.bg-paper-2 svg').exists()).toBe(true)
    expect(page.text()).toBe('Gelöschtes Konto')
    expect(ringed(page)[0]!.attributes('style')).toContain('var(--cp-team-2)')
  })

  it('shows the icon without a name and a ring in the stack of a grid card', async () => {
    const page = await mountCell(gone, 28, { stack: true })

    expect(page.find('img').exists()).toBe(false)
    expect(page.find('.bg-paper-2 svg').exists()).toBe(true)
    expect(page.text()).toBe('')
    expect(ringed(page)).toHaveLength(0)
  })

  it('leaves a Player with a picture as it was', async () => {
    const page = await mountCell(player, 56)

    expect(page.find('img').attributes('src')).toBe('https://example.com/anna.png')
    expect(page.find('.bg-paper-2 svg').exists()).toBe(false)
  })
})
