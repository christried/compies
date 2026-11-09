import { mountSuspended } from '@nuxt/test-utils/runtime'
import { h } from 'vue'
import { describe, expect, it } from 'vitest'
import CeremonyStandingRow from '~/components/CeremonyStandingRow.vue'
import CeremonyWinnerCard from '~/components/CeremonyWinnerCard.vue'
import { ceremonyLayout, type CeremonyModel, type CeremonyWinner } from '~/utils/ceremony'
import { ceremonySizes } from '~/utils/ceremony-sizes'

// The two parts of the Award ceremony's stage that are drawn more than once (#364): a Standing row (the single stage's list, the Tie's side and
// below lists, its line of chips) and a Winner's card (single, chain, grid). What a viewer or a screen reader finds is tested here: the text,
// the roles, the `data-part`s the Pokal-Lauf looks for. The classes and sizes are the layer test's and the sizes test's business
// (`ceremony-layer.test.ts`, `ceremony-sizes.test.ts`). Test data has the shape `ceremonyModel` gives: a name, points and a Team number.

const row: CeremonyModel['rows'][number] = { team: 3, name: 'Die Füchse', rank: 2, points: 7 }
const longName = 'Die ganz besonders langen Füchse'.padEnd(40, 'x')

describe('a Standing row', () => {
  it.each(['side', 'below', 'chips'] as const)('is an li with data-part="row" in the %s variant, with rank, name and points', async (variant) => {
    const page = await mountSuspended(CeremonyStandingRow, { props: { row, variant } })

    expect(page.element.tagName).toBe('LI')
    expect(page.attributes('data-part')).toBe('row')
    expect(page.text()).toContain('2')
    expect(page.text()).toContain('Die Füchse')
    expect(page.text()).toContain('7 P.')
  })

  it.each(['side', 'below', 'chips'] as const)('draws the Team swatch of the %s variant aria-hidden, in the Team colour and its pattern', async (variant) => {
    const page = await mountSuspended(CeremonyStandingRow, { props: { row, variant } })
    const swatch = page.get('i')

    expect(swatch.attributes('aria-hidden')).toBe('true')
    expect(swatch.attributes('style')).toContain('var(--cp-team-3)')
    expect(swatch.attributes('style')).toContain('var(--cp-team-3-pattern)')
  })

  it.each(['side', 'below', 'chips'] as const)('keeps a 40-character Party name in one truncating span in the %s variant', async (variant) => {
    const page = await mountSuspended(CeremonyStandingRow, { props: { row: { ...row, name: longName }, variant } })

    expect(longName).toHaveLength(40)
    expect(page.findAll('span.truncate').map(span => span.text())).toContain(longName)
  })

  it('has the taller floor on the side and the lower one below the cards, none of them on a chip', async () => {
    const side = await mountSuspended(CeremonyStandingRow, { props: { row, variant: 'side' } })
    const below = await mountSuspended(CeremonyStandingRow, { props: { row, variant: 'below' } })
    const chips = await mountSuspended(CeremonyStandingRow, { props: { row, variant: 'chips' } })

    expect(side.classes()).toContain('min-h-[52px]')
    expect(below.classes()).toContain('min-h-[48px]')
    expect(chips.classes()).toContain('rounded-pill')
  })
})

const winner: CeremonyWinner = {
  team: 2,
  name: 'Die Füchse',
  points: 9,
  people: [{ kind: 'player', id: 'anna', name: 'Anna', image: 'https://example.com/anna.png', team: 2 }],
}

/** The sizes the stage hands the card: the real ones for 1 (single), 2 (chain) or 4 (grid) Winners on a wide screen. */
const stageOf = (winners: number) => ceremonySizes(true, ceremonyLayout(winners, 0, true), winners).stage
const STAGES = [['single', 1], ['chain', 2], ['grid', 4]] as const

describe('a Winner card', () => {
  it.each(STAGES)('is the %s stage\'s card: winner-card, with a back, a front and a stamp', async (_kind, winners) => {
    const page = await mountSuspended(CeremonyWinnerCard, { props: { winner, stage: stageOf(winners) } })

    expect(page.attributes('data-testid')).toBe('winner-card')
    expect(page.attributes('data-part')).toBe('card')
    expect(page.find('[data-part="back"]').exists()).toBe(true)
    expect(page.find('[data-part="front"]').exists()).toBe(true)
    expect(page.find('[data-part="stamp"]').exists()).toBe(true)
  })

  it.each(STAGES)('shows the Party, its points and the stamp as text on the %s stage, and hides the front from a screen reader', async (_kind, winners) => {
    const page = await mountSuspended(CeremonyWinnerCard, { props: { winner, stage: stageOf(winners) } })

    expect(page.get('[data-part="back"]').text()).toContain('Die Füchse')
    expect(page.get('[data-part="back"]').text()).toContain('9 P.')
    expect(page.get('[data-part="stamp"]').text()).toBe('SIEGER')
    expect(page.get('[data-part="front"]').attributes('aria-hidden')).toBe('true')
    expect(page.get('[data-part="front"]').text()).toContain('???')
  })

  it('names Platz 1 on the single card, and only there', async () => {
    const single = await mountSuspended(CeremonyWinnerCard, { props: { winner, stage: stageOf(1) } })
    const chain = await mountSuspended(CeremonyWinnerCard, { props: { winner, stage: stageOf(2) } })

    expect(single.get('[data-part="back"]').text()).toContain('Platz 1')
    expect(chain.text()).not.toContain('Platz 1')
  })

  it('is a div on the single and chain stage and an li on the grid', async () => {
    const tags = await Promise.all([1, 2, 4].map(async winners => (await mountSuspended(CeremonyWinnerCard, { props: { winner, stage: stageOf(winners) } })).element.tagName))

    expect(tags).toEqual(['DIV', 'DIV', 'LI'])
  })

  it('puts the grid card\'s stamp inside its back, and the single and chain card\'s after it', async () => {
    const grid = await mountSuspended(CeremonyWinnerCard, { props: { winner, stage: stageOf(4) } })
    const single = await mountSuspended(CeremonyWinnerCard, { props: { winner, stage: stageOf(1) } })
    const chain = await mountSuspended(CeremonyWinnerCard, { props: { winner, stage: stageOf(2) } })

    expect(grid.find('[data-part="back"] [data-part="stamp"]').exists()).toBe(true)
    expect(single.find('[data-part="back"] [data-part="stamp"]').exists()).toBe(false)
    expect(chain.find('[data-part="back"] [data-part="stamp"]').exists()).toBe(false)
    expect([...single.element.children].map(child => child.getAttribute('data-part'))).toEqual(['back', 'front', 'stamp'])
    expect([...chain.element.children].map(child => child.getAttribute('data-part'))).toEqual(['back', 'front', 'stamp'])
  })

  it('renders the default slot inside the grid card\'s back, and drops it on the single and chain card', async () => {
    const slots = { default: () => h('ul', { 'data-part': 'stack' }) }
    const grid = await mountSuspended(CeremonyWinnerCard, { props: { winner, stage: stageOf(4) }, slots })
    const single = await mountSuspended(CeremonyWinnerCard, { props: { winner, stage: stageOf(1) }, slots })
    const chain = await mountSuspended(CeremonyWinnerCard, { props: { winner, stage: stageOf(2) }, slots })

    expect(grid.find('[data-part="back"] [data-part="stack"]').exists()).toBe(true)
    expect(single.find('[data-part="stack"]').exists()).toBe(false)
    expect(chain.find('[data-part="stack"]').exists()).toBe(false)
  })

  it('keeps a 40-character Party name in a truncating span on every stage', async () => {
    for (const [, winners] of STAGES) {
      const page = await mountSuspended(CeremonyWinnerCard, { props: { winner: { ...winner, name: longName }, stage: stageOf(winners) } })

      expect(page.findAll('span.truncate').map(span => span.text())).toContain(longName)
    }
  })
})
