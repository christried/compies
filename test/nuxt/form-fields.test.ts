import { Check, X } from '@lucide/vue'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import DateTimeField from '~/components/DateTimeField.vue'
import SegmentedControl from '~/components/SegmentedControl.vue'
import TextField from '~/components/TextField.vue'

describe('TextField', () => {
  it('labels the input and links the error and the help text to it', async () => {
    const page = await mountSuspended(TextField, {
      props: { modelValue: '', label: 'Name der Session', help: 'Sehen alle in der Einladung.', error: 'Gib der Session einen Namen.' },
    })

    const input = page.get('input')
    expect(page.get('label').attributes('for')).toBe(input.attributes('id'))
    expect(input.attributes('aria-invalid')).toBe('true')
    const described = input.attributes('aria-describedby')!.split(' ').map(id => page.get(`[id="${id}"]`).text())
    expect(described).toEqual(['Gib der Session einen Namen.', 'Sehen alle in der Einladung.'])
  })

  it('emits what is typed', async () => {
    const page = await mountSuspended(TextField, { props: { modelValue: '', label: 'Name der Session' } })

    await page.get('input').setValue('Freitags')

    expect(page.emitted('update:modelValue')?.at(-1)).toEqual(['Freitags'])
  })

  it('counts characters and announces the count only from 80 % of the maximum', async () => {
    const page = await mountSuspended(TextField, { props: { modelValue: 'x'.repeat(40), label: 'Name', maxlength: 60 } })
    expect(page.text()).toContain('40/60')
    expect(page.find('[aria-live]').exists()).toBe(false)

    await page.setProps({ modelValue: 'x'.repeat(50) })

    expect(page.get('[aria-live]').text()).toBe('50/60')
  })
})

describe('DateTimeField', () => {
  it('reports one Berlin wall-clock value once both the date and the time are set', async () => {
    const page = await mountSuspended(DateTimeField, { props: { modelValue: '', label: 'Termin 1' } })

    await page.get('input[type="date"]').setValue('2090-10-30')
    expect(page.emitted('update:modelValue')?.at(-1)).toEqual([''])
    await page.get('input[type="time"]').setValue('20:30')

    expect(page.emitted('update:modelValue')?.at(-1)).toEqual(['2090-10-30T20:30'])
  })

  it('shows an existing value in its two inputs', async () => {
    const page = await mountSuspended(DateTimeField, { props: { modelValue: '2090-10-30T20:30', label: 'Termin 1' } })

    expect((page.get('input[type="date"]').element as HTMLInputElement).value).toBe('2090-10-30')
    expect((page.get('input[type="time"]').element as HTMLInputElement).value).toBe('20:30')
  })

  it('groups its inputs under the label and shows the error on the group', async () => {
    const page = await mountSuspended(DateTimeField, {
      props: { modelValue: '2001-01-01T20:00', label: 'Termin 1', error: 'Der Termin liegt in der Vergangenheit.' },
    })

    const group = page.get('[role="group"]')
    expect(group.attributes('aria-label')).toBe('Termin 1')
    expect(page.get('input[type="date"]').attributes('aria-invalid')).toBe('true')
    expect(page.text()).toContain('Der Termin liegt in der Vergangenheit.')
  })

  it('sets the earliest date from min', async () => {
    const page = await mountSuspended(DateTimeField, { props: { modelValue: '', label: 'Termin 1', min: '2026-10-22T12:00' } })

    expect(page.get('input[type="date"]').attributes('min')).toBe('2026-10-22')
  })
})

describe('SegmentedControl', () => {
  const options = [{ value: 'poll', label: 'Terminumfrage' }, { value: 'direct', label: 'Direkt festlegen' }]

  it('marks the selected option in a radio group', async () => {
    const page = await mountSuspended(SegmentedControl, { props: { modelValue: 'poll', options, label: 'Termin' } })

    expect(page.get('[role="radiogroup"]').attributes('aria-label')).toBe('Termin')
    expect(page.findAll('[role="radio"]').map(radio => radio.attributes('aria-checked'))).toEqual(['true', 'false'])
  })

  it('selects an option on click', async () => {
    const page = await mountSuspended(SegmentedControl, { props: { modelValue: 'poll', options, label: 'Termin' } })

    await page.findAll('[role="radio"]')[1]!.trigger('click')

    expect(page.emitted('update:modelValue')?.at(-1)).toEqual(['direct'])
  })

  it('moves the selection with the arrow keys and wraps around', async () => {
    const page = await mountSuspended(SegmentedControl, { props: { modelValue: 'poll', options, label: 'Termin' } })
    const radios = page.findAll('[role="radio"]')

    await radios[0]!.trigger('keydown', { key: 'ArrowRight' })
    expect(page.emitted('update:modelValue')?.at(-1)).toEqual(['direct'])

    await radios[0]!.trigger('keydown', { key: 'ArrowLeft' })
    expect(page.emitted('update:modelValue')?.at(-1)).toEqual(['direct'])
  })

  it('fills the selected option with its own colour and draws its icon', async () => {
    const coloured = [
      { value: 'yes', label: 'Ja', icon: Check, fill: 'bg-success text-on-success' },
      { value: 'no', label: 'Nein', icon: X, fill: 'bg-ink text-paper' },
    ]
    const page = await mountSuspended(SegmentedControl, { props: { modelValue: 'yes', options: coloured, label: 'Vote' } })
    const [yes, no] = page.findAll('[role="radio"]')

    expect(yes!.classes()).toContain('bg-success')
    expect(no!.classes()).not.toContain('bg-success')
    expect(yes!.find('svg').exists()).toBe(true)
    expect(no!.find('svg').exists()).toBe(true)
  })

  it('leaves the selected option as the only tab stop', async () => {
    const page = await mountSuspended(SegmentedControl, { props: { modelValue: 'direct', options, label: 'Termin' } })

    expect(page.findAll('[role="radio"]').map(radio => radio.attributes('tabindex'))).toEqual(['-1', '0'])
  })

  it('keeps the first option reachable while nothing is selected', async () => {
    const page = await mountSuspended(SegmentedControl, { props: { modelValue: '', options, label: 'Termin' } })

    expect(page.findAll('[role="radio"]').map(radio => radio.attributes('tabindex'))).toEqual(['0', '-1'])
  })

  it('does not select anything while disabled', async () => {
    const page = await mountSuspended(SegmentedControl, { props: { modelValue: 'poll', options, label: 'Termin', disabled: true } })

    await page.findAll('[role="radio"]')[1]!.trigger('click')

    expect(page.get('[role="radiogroup"]').attributes('aria-disabled')).toBe('true')
    expect(page.emitted('update:modelValue')).toBeUndefined()
  })
})
