import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import CeremonyStandingRow from '~/components/CeremonyStandingRow.vue'
import type { CeremonyModel } from '~/utils/ceremony'

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
