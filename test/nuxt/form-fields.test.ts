import { Check, X } from '@lucide/vue'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
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
  // The date and the time are own fields (ADR 0010); their sr-only labels name them.
  function part(root: Element, name: 'Datum' | 'Uhrzeit') {
    const label = [...root.querySelectorAll('label')].find(l => l.textContent?.trim() === name)!
    return root.querySelector<HTMLInputElement>(`[id="${label.htmlFor}"]`)!
  }

  async function type(root: Element, name: 'Datum' | 'Uhrzeit', value: string) {
    const input = part(root, name)
    input.value = value
    input.dispatchEvent(new Event('input'))
    await flushPromises()
  }

  // One input event per key, as a person types: each event sees what the field shows so far.
  async function typeKeys(root: Element, name: 'Datum' | 'Uhrzeit', keys: string) {
    const input = part(root, name)
    for (const key of keys) {
      input.value += key
      input.dispatchEvent(new Event('input'))
      await flushPromises()
    }
  }

  async function leave(root: Element, name: 'Datum' | 'Uhrzeit') {
    part(root, name).dispatchEvent(new Event('blur'))
    await flushPromises()
  }

  it('reports one Berlin wall-clock value once both the date and the time are set', async () => {
    const page = await mountSuspended(DateTimeField, { props: { modelValue: '', label: 'Termin 1' } })

    await type(page.element, 'Datum', '30.10.2090')
    expect(page.emitted('update:modelValue')?.at(-1)).toEqual([''])
    await type(page.element, 'Uhrzeit', '2030')

    expect(page.emitted('update:modelValue')?.at(-1)).toEqual(['2090-10-30T20:30'])
  })

  it('shows an existing value as German date and 24 h time', async () => {
    const page = await mountSuspended(DateTimeField, { props: { modelValue: '2090-10-30T20:30', label: 'Termin 1' } })

    expect(part(page.element, 'Datum').value).toBe('30.10.2090')
    expect(part(page.element, 'Uhrzeit').value).toBe('20:30')
  })

  it('groups its inputs under the label and shows the error on the group', async () => {
    const page = await mountSuspended(DateTimeField, {
      props: { modelValue: '2001-01-01T20:00', label: 'Termin 1', error: 'Der Termin liegt in der Vergangenheit.' },
    })

    const group = page.get('[role="group"]')
    expect(group.attributes('aria-label')).toBe('Termin 1')
    expect(part(page.element, 'Datum').getAttribute('aria-invalid')).toBe('true')
    expect(page.text()).toContain('Der Termin liegt in der Vergangenheit.')
  })

  it('types the time as four digits and fills in the colon', async () => {
    const page = await mountSuspended(DateTimeField, { props: { modelValue: '2090-10-30', label: 'Termin 1' } })

    await type(page.element, 'Uhrzeit', '1930')

    expect(part(page.element, 'Uhrzeit').value).toBe('19:30')
    expect(page.emitted('update:modelValue')?.at(-1)).toEqual(['2090-10-30T19:30'])
  })

  it('fills the time digits left to right while typing, so 1-3-0-0 is 13:00 and not 01:30', async () => {
    const page = await mountSuspended(DateTimeField, { props: { modelValue: '2090-10-30', label: 'Termin 1' } })

    await typeKeys(page.element, 'Uhrzeit', '130')
    expect(part(page.element, 'Uhrzeit').value).toBe('13:0')
    expect(page.emitted('update:modelValue')?.at(-1)).toEqual([''])

    await typeKeys(page.element, 'Uhrzeit', '0')
    expect(part(page.element, 'Uhrzeit').value).toBe('13:00')
    expect(page.emitted('update:modelValue')?.at(-1)).toEqual(['2090-10-30T13:00'])
  })

  it('reads 2-0-3-0 as 20:30 typed key by key', async () => {
    const page = await mountSuspended(DateTimeField, { props: { modelValue: '2090-10-30', label: 'Termin 1' } })

    await typeKeys(page.element, 'Uhrzeit', '2030')

    expect(part(page.element, 'Uhrzeit').value).toBe('20:30')
    expect(page.emitted('update:modelValue')?.at(-1)).toEqual(['2090-10-30T20:30'])
  })

  it('reads 1-9-3-0 as 19:30 typed key by key', async () => {
    const page = await mountSuspended(DateTimeField, { props: { modelValue: '2090-10-30', label: 'Termin 1' } })

    await typeKeys(page.element, 'Uhrzeit', '1930')

    expect(part(page.element, 'Uhrzeit').value).toBe('19:30')
    expect(page.emitted('update:modelValue')?.at(-1)).toEqual(['2090-10-30T19:30'])
  })

  it('reads three typed digits as H MM once the field is left, so 930 is 09:30', async () => {
    const page = await mountSuspended(DateTimeField, { props: { modelValue: '2090-10-30', label: 'Termin 1' } })

    await typeKeys(page.element, 'Uhrzeit', '930')
    expect(part(page.element, 'Uhrzeit').value).toBe('93:0')
    expect(page.emitted('update:modelValue')?.at(-1)).toEqual([''])

    await leave(page.element, 'Uhrzeit')

    expect(part(page.element, 'Uhrzeit').value).toBe('09:30')
    expect(page.emitted('update:modelValue')?.at(-1)).toEqual(['2090-10-30T09:30'])
  })

  it('rejects an impossible time such as 24:60', async () => {
    const page = await mountSuspended(DateTimeField, { props: { modelValue: '2090-10-30', label: 'Termin 1' } })

    await type(page.element, 'Uhrzeit', '2460')

    expect(page.emitted('update:modelValue')?.at(-1)).toEqual([''])
    expect(part(page.element, 'Uhrzeit').getAttribute('aria-invalid')).toBe('true')
  })

  it('rejects 2-4-6-0 typed key by key, four digits validated as they stand', async () => {
    const page = await mountSuspended(DateTimeField, { props: { modelValue: '2090-10-30', label: 'Termin 1' } })

    await typeKeys(page.element, 'Uhrzeit', '2460')

    expect(page.emitted('update:modelValue')?.at(-1)).toEqual([''])
    expect(part(page.element, 'Uhrzeit').getAttribute('aria-invalid')).toBe('true')
  })

  it('keeps only digits in the time', async () => {
    const page = await mountSuspended(DateTimeField, { props: { modelValue: '', label: 'Termin 1' } })

    await type(page.element, 'Uhrzeit', 'ab12:3456')

    expect(part(page.element, 'Uhrzeit').value).toBe('12:34')
  })

  it('opens a calendar on a click in the date field, with days before min disabled', async () => {
    const page = await mountSuspended(DateTimeField, { props: { modelValue: '', label: 'Termin 1', min: '2026-10-22T12:00' } })

    part(page.element, 'Datum').click()
    await flushPromises()

    const cells = [...document.querySelectorAll('[role="gridcell"]')]
    const day = (n: string) => cells.find(cell => cell.textContent?.trim() === n)!
    expect(day('21').getAttribute('aria-disabled')).toBe('true')
    expect(day('22').getAttribute('aria-disabled')).not.toBe('true')
  })

  it('opens the time list in 15-minute steps', async () => {
    const page = await mountSuspended(DateTimeField, { props: { modelValue: '2090-10-30', label: 'Termin 1' } })

    part(page.element, 'Uhrzeit').click()
    await flushPromises()

    const options = [...document.querySelectorAll('[role="option"]')].map(option => option.textContent?.trim())
    expect(options.slice(0, 4)).toEqual(['00:00', '00:15', '00:30', '00:45'])
    expect(options.at(-1)).toBe('23:45')
    expect(options).toHaveLength(96)
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

  it('tints an unselected option on hover only while it is not aria-disabled', async () => {
    const page = await mountSuspended(SegmentedControl, { props: { modelValue: 'poll', options, label: 'Termin', disabled: true } })

    const unselected = page.findAll('[role="radio"]')[1]!
    expect(unselected.attributes('aria-disabled')).toBe('true')
    expect(unselected.classes()).toContain('not-aria-disabled:hover:bg-paper-2')
    expect(unselected.classes()).not.toContain('hover:bg-paper-2')
  })

  it('does not select anything while disabled', async () => {
    const page = await mountSuspended(SegmentedControl, { props: { modelValue: 'poll', options, label: 'Termin', disabled: true } })

    await page.findAll('[role="radio"]')[1]!.trigger('click')

    expect(page.get('[role="radiogroup"]').attributes('aria-disabled')).toBe('true')
    expect(page.emitted('update:modelValue')).toBeUndefined()
  })
})
