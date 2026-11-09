import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import FilterSelect from '~/components/FilterSelect.vue'

// FilterSelect (#362): the select with the drawn chevron, as a filter chip (`chip`) or as the 52 px field of the form
// (`field`). The chip is ink when something is chosen; the empty option is the value „“.

const options = [
  { value: '1', label: '1 Spieler' },
  { value: '3', label: '3 Spieler' },
  { value: '4', label: '4 Spieler' },
]
const props = { modelValue: '', options, emptyLabel: 'Spielerzahl' }

describe('FilterSelect', () => {
  it('offers the empty option first, then the options in order, with their values and labels', async () => {
    const page = await mountSuspended(FilterSelect, { props })

    const items = page.findAll('option')
    expect(items.map(item => item.element.value)).toEqual(['', '1', '3', '4'])
    expect(items.map(item => item.text())).toEqual(['Spielerzahl', '1 Spieler', '3 Spieler', '4 Spieler'])
  })

  it('shows the empty option for an empty model and the matching option for a value', async () => {
    const empty = await mountSuspended(FilterSelect, { props })
    expect((empty.get('select').element as HTMLSelectElement).value).toBe('')

    const chosen = await mountSuspended(FilterSelect, { props: { ...props, modelValue: '3' } })
    expect((chosen.get('select').element as HTMLSelectElement).value).toBe('3')
  })

  it('shows a modelValue that changes from outside, the pairing PriceField relies on in place of v-model (#362)', async () => {
    const page = await mountSuspended(FilterSelect, { props })

    await page.setProps({ modelValue: '4' })

    expect((page.get('select').element as HTMLSelectElement).value).toBe('4')
    expect(page.get('select').classes()).toContain('bg-ink')
  })

  it('emits the chosen value, and the empty value when the empty option is chosen', async () => {
    const page = await mountSuspended(FilterSelect, { props })

    await page.get('select').setValue('3')
    await page.get('select').setValue('')

    expect(page.emitted('update:modelValue')).toEqual([['3'], ['']])
  })

  describe('chip (the default)', () => {
    it('with nothing chosen is paper on the surface with ink text and the line border, and leaves room for the chevron', async () => {
      const page = await mountSuspended(FilterSelect, { props })

      const select = page.get('select')
      for (const token of ['bg-surface', 'text-ink', 'border-line', 'rounded-pill', 'appearance-none', 'pr-9']) {
        expect(select.classes()).toContain(token)
      }
      expect(select.classes()).not.toContain('bg-ink')
      expect(select.classes()).not.toContain('text-paper')
    })

    it('with nothing chosen draws its chevron in ink, not clickable', async () => {
      const page = await mountSuspended(FilterSelect, { props })

      const chevron = page.get('[aria-hidden="true"]')
      expect(chevron.classes()).toContain('text-ink')
      expect(chevron.classes()).toContain('pointer-events-none')
    })

    it('with something chosen is ink on paper text, and its chevron turns paper', async () => {
      const page = await mountSuspended(FilterSelect, { props: { ...props, modelValue: '3' } })

      const select = page.get('select')
      expect(select.classes()).toContain('bg-ink')
      expect(select.classes()).toContain('text-paper')
      expect(select.classes()).not.toContain('bg-surface')
      expect(page.get('[aria-hidden="true"]').classes()).toContain('text-paper')
    })

    it('caps its width only when asked: the wrapper and the select take max-w-full, the select truncates', async () => {
      const capped = await mountSuspended(FilterSelect, { props: { ...props, capped: true } })
      expect(capped.element.classList).toContain('max-w-full')
      expect(capped.get('select').classes()).toContain('max-w-full')
      expect(capped.get('select').classes()).toContain('truncate')

      const plain = await mountSuspended(FilterSelect, { props })
      expect(plain.element.classList).not.toContain('max-w-full')
      expect(plain.get('select').classes()).not.toContain('max-w-full')
      expect(plain.get('select').classes()).not.toContain('truncate')
    })
  })

  it('passes id, aria-label and aria-describedby to the select, never to the wrapper', async () => {
    const page = await mountSuspended(FilterSelect, {
      props,
      attrs: { 'id': 'players', 'aria-label': 'Spielerzahl', 'aria-describedby': 'players-help' },
    })

    const select = page.get('select')
    expect(select.attributes('id')).toBe('players')
    expect(select.attributes('aria-label')).toBe('Spielerzahl')
    expect(select.attributes('aria-describedby')).toBe('players-help')
    expect(page.element.hasAttribute('id')).toBe(false)
    expect(page.element.hasAttribute('aria-label')).toBe(false)
    expect(page.element.hasAttribute('aria-describedby')).toBe(false)
  })

  it('passes an aria-invalid a caller sets through to the select, as any attribute (#362)', async () => {
    const page = await mountSuspended(FilterSelect, { props, attrs: { 'aria-invalid': 'true' } })

    expect(page.get('select').attributes('aria-invalid')).toBe('true')
  })

  describe('field (the form look of TextField)', () => {
    const field = { ...props, variant: 'field' as const }

    it('is the 52 px field: full width, room for the chevron on the right, the field box, no chip shape', async () => {
      const page = await mountSuspended(FilterSelect, { props: field })

      const select = page.get('select')
      for (const token of ['h-control-lg', 'w-full', 'pr-10', 'rounded-md', 'border-line']) {
        expect(select.classes()).toContain(token)
      }
      expect(select.classes()).not.toContain('rounded-pill')
    })

    it('keeps its chevron in ink even with a value chosen', async () => {
      const page = await mountSuspended(FilterSelect, { props: { ...field, modelValue: '3' } })

      expect(page.get('[aria-hidden="true"]').classes()).toContain('text-ink')
      expect(page.get('[aria-hidden="true"]').classes()).not.toContain('text-paper')
    })

    it('is not marked invalid by default: no aria-invalid, the line border', async () => {
      const page = await mountSuspended(FilterSelect, { props: field })

      expect(page.get('select').attributes('aria-invalid')).toBeUndefined()
      expect(page.get('select').classes()).not.toContain('border-error-fg')
    })

    it('when invalid: aria-invalid true and the 3 px error border', async () => {
      const page = await mountSuspended(FilterSelect, { props: { ...field, invalid: true } })

      const select = page.get('select')
      expect(select.attributes('aria-invalid')).toBe('true')
      expect(select.classes()).toContain('border-3')
      expect(select.classes()).toContain('border-error-fg')
    })
  })

  describe('edges (CODING_STANDARDS § Tests)', () => {
    it('with no options holds only the empty option, as the Tag chip does when no Tag is in use', async () => {
      const page = await mountSuspended(FilterSelect, { props: { ...props, options: [] } })

      expect(page.findAll('option').map(item => item.text())).toEqual(['Spielerzahl'])
    })

    it('with one option offers the empty option and that one', async () => {
      const page = await mountSuspended(FilterSelect, { props: { ...props, options: [{ value: 'co-op', label: 'Co-op' }] } })

      expect(page.findAll('option').map(item => item.text())).toEqual(['Spielerzahl', 'Co-op'])
    })

    it('keeps a 20-character label whole in its option', async () => {
      const label = '12345678901234567890'
      expect(label).toHaveLength(20)
      const page = await mountSuspended(FilterSelect, { props: { ...props, options: [{ value: 'x', label }] } })

      expect(page.findAll('option')[1]!.text()).toBe(label)
    })
  })
})
