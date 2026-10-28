import { parseDate } from '@internationalized/date'
import type { DateValue } from '@internationalized/date'
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
      props: { modelValue: '', label: 'Name der Event', help: 'Sehen alle in der Einladung.', error: 'Gib der Event einen Namen.' },
    })

    const input = page.get('input')
    expect(page.get('label').attributes('for')).toBe(input.attributes('id'))
    expect(input.attributes('aria-invalid')).toBe('true')
    const described = input.attributes('aria-describedby')!.split(' ').map(id => page.get(`[id="${id}"]`).text())
    expect(described).toEqual(['Gib der Event einen Namen.', 'Sehen alle in der Einladung.'])
  })

  it('emits what is typed', async () => {
    const page = await mountSuspended(TextField, { props: { modelValue: '', label: 'Name der Event' } })

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

  it('counts a family emoji as one character, as the User sees it', async () => {
    const page = await mountSuspended(TextField, { props: { modelValue: '👨‍👩‍👧', label: 'Name', maxlength: 32 } })

    expect(page.text()).toContain('1/32')
  })

  it('cuts the input to the maximum with cutAtMax, keeping the input and the model in step', async () => {
    const page = await mountSuspended(TextField, { props: { modelValue: '', label: 'Name', maxlength: 3, cutAtMax: true } })

    await page.get('input').setValue('👍🏽👍🏽👍🏽👍🏽')

    expect((page.get('input').element as HTMLInputElement).value).toBe('👍🏽👍🏽👍🏽')
    expect(page.emitted('update:modelValue')?.at(-1)).toEqual(['👍🏽👍🏽👍🏽'])
  })

  it('keeps all of the input without cutAtMax', async () => {
    const page = await mountSuspended(TextField, { props: { modelValue: '', label: 'Name', maxlength: 3 } })

    await page.get('input').setValue('👍🏽👍🏽👍🏽👍🏽')

    expect((page.get('input').element as HTMLInputElement).value).toBe('👍🏽👍🏽👍🏽👍🏽')
  })

  it('marks the field invalid with the help text as the reason, announced, under the given id', async () => {
    const page = await mountSuspended(TextField, {
      props: { modelValue: '', label: 'Name', help: 'Ohne Namen geht’s nicht.', invalid: true, id: 'x' },
    })

    expect(page.get('input').attributes('id')).toBe('x')
    expect(page.get('input').attributes('aria-invalid')).toBe('true')
    const help = page.get('#x-help')
    expect(help.text()).toBe('Ohne Namen geht’s nicht.')
    expect(help.attributes('aria-live')).toBe('polite')
    expect(page.get('label').attributes('for')).toBe('x')
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

  // A keystroke at the selection: replaces what is selected with the char and puts the caret after it.
  async function typeAt(input: HTMLInputElement, char: string) {
    const start = input.selectionStart ?? input.value.length
    const end = input.selectionEnd ?? start
    input.value = input.value.slice(0, start) + char + input.value.slice(end)
    input.setSelectionRange(start + char.length, start + char.length)
    input.dispatchEvent(new Event('input'))
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

  it('completes one or two digits that form an hour to :00 once the field is left', async () => {
    const page = await mountSuspended(DateTimeField, { props: { modelValue: '2090-10-30', label: 'Termin 1' } })

    await typeKeys(page.element, 'Uhrzeit', '9')
    await leave(page.element, 'Uhrzeit')
    expect(part(page.element, 'Uhrzeit').value).toBe('09:00')
    expect(page.emitted('update:modelValue')?.at(-1)).toEqual(['2090-10-30T09:00'])

    await type(page.element, 'Uhrzeit', '15')
    part(page.element, 'Uhrzeit').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    await flushPromises()
    expect(part(page.element, 'Uhrzeit').value).toBe('15:00')
    expect(page.emitted('update:modelValue')?.at(-1)).toEqual(['2090-10-30T15:00'])
  })

  it('completes three digits whose first two form an hour to HH:M0, so 153 is 15:30', async () => {
    const page = await mountSuspended(DateTimeField, { props: { modelValue: '2090-10-30', label: 'Termin 1' } })

    await typeKeys(page.element, 'Uhrzeit', '153')
    expect(part(page.element, 'Uhrzeit').value).toBe('15:3')
    await leave(page.element, 'Uhrzeit')

    expect(part(page.element, 'Uhrzeit').value).toBe('15:30')
    expect(page.emitted('update:modelValue')?.at(-1)).toEqual(['2090-10-30T15:30'])
  })

  it('leaves an impossible hour such as 25 as typed and invalid once the field is left', async () => {
    const page = await mountSuspended(DateTimeField, { props: { modelValue: '2090-10-30', label: 'Termin 1' } })

    await typeKeys(page.element, 'Uhrzeit', '25')
    await leave(page.element, 'Uhrzeit')

    expect(part(page.element, 'Uhrzeit').value).toBe('25')
    expect(part(page.element, 'Uhrzeit').getAttribute('aria-invalid')).toBe('true')
    expect(page.emitted('update:modelValue')?.at(-1)).toEqual([''])
  })

  it('does not mark 25 invalid while the time is still being typed, so 253 can be typed on to 02:53', async () => {
    const page = await mountSuspended(DateTimeField, { props: { modelValue: '2090-10-30', label: 'Termin 1' } })

    await typeKeys(page.element, 'Uhrzeit', '25')
    expect(part(page.element, 'Uhrzeit').getAttribute('aria-invalid')).toBeNull()

    await typeKeys(page.element, 'Uhrzeit', '3')
    await leave(page.element, 'Uhrzeit')

    expect(part(page.element, 'Uhrzeit').value).toBe('02:53')
    expect(part(page.element, 'Uhrzeit').getAttribute('aria-invalid')).toBeNull()
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

  it('keeps the caret after the typed digit when the hour is replaced, so 19:00 with 21 typed is 21:00', async () => {
    const page = await mountSuspended(DateTimeField, { props: { modelValue: '2026-11-02T19:00', label: 'Termin 1' } })
    const input = part(page.element, 'Uhrzeit')

    input.setSelectionRange(0, 2)
    await typeAt(input, '2')
    expect(input.value).toBe('20:0')
    expect(input.selectionStart).toBe(1)

    await typeAt(input, '1')
    expect(input.value).toBe('21:00')
    expect(input.selectionStart).toBe(2)
    expect(page.emitted('update:modelValue')?.at(-1)).toEqual(['2026-11-02T21:00'])
  })

  it('keeps the caret in the date when the month is replaced, so 30.10.2026 with 11 typed is 30.11.2026', async () => {
    const page = await mountSuspended(DateTimeField, { props: { modelValue: '2026-10-30T19:00', label: 'Termin 1' } })
    const input = part(page.element, 'Datum')
    expect(input.value).toBe('30.10.2026')

    input.setSelectionRange(3, 5)
    await typeAt(input, '1')
    expect(input.value).toBe('30.12.026')
    expect(input.selectionStart).toBe(4)

    await typeAt(input, '1')
    expect(input.value).toBe('30.11.2026')
    expect(input.selectionStart).toBe(5)
    expect(page.emitted('update:modelValue')?.at(-1)).toEqual(['2026-11-30T19:00'])
  })

  it('types at the end of an empty time as before, 1-5-3 is 15:3 with the caret at the end', async () => {
    const page = await mountSuspended(DateTimeField, { props: { modelValue: '', label: 'Termin 1' } })
    const input = part(page.element, 'Uhrzeit')

    await typeAt(input, '1')
    await typeAt(input, '5')
    await typeAt(input, '3')

    expect(input.value).toBe('15:3')
    expect(input.selectionStart).toBe(4)
  })

  it('opens a calendar on a click in the date field, and days before today (Berlin) are disabled', async () => {
    const page = await mountSuspended(DateTimeField, { props: { modelValue: '', label: 'Termin 1' }, attachTo: document.body })

    part(page.element, 'Datum').click()
    await flushPromises()

    const today = parseDate(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date()))
    // By date, not by number: the grid also shows the neighbouring months' days (28.–30.9. in October).
    const day = (value: DateValue) => document.querySelector(`[data-value="${value}"]`)?.closest('[role="gridcell"]')
    expect(day(today)!.getAttribute('aria-disabled')).not.toBe('true')
    // On the 1st, yesterday is in the grid only when the month does not start on a Monday.
    const yesterday = day(today.subtract({ days: 1 }))
    if (yesterday) expect(yesterday.getAttribute('aria-disabled')).toBe('true')
    page.unmount()
  })

  it('keeps the focus in the date field on a click, so typing lands in it', async () => {
    const page = await mountSuspended(DateTimeField, { props: { modelValue: '', label: 'Termin 1' }, attachTo: document.body })
    const input = part(page.element, 'Datum')

    input.focus()
    input.click()
    await flushPromises()
    expect(document.querySelector('[role="gridcell"]')).not.toBeNull()
    expect(document.activeElement).toBe(input)

    input.value += '3'
    input.dispatchEvent(new Event('input'))
    await flushPromises()
    expect(part(page.element, 'Datum').value).toBe('3')
    page.unmount()
  })

  it('keeps the focus in the time field on a click and does not move it into the list', async () => {
    const page = await mountSuspended(DateTimeField, { props: { modelValue: '2090-10-30', label: 'Termin 1' }, attachTo: document.body })
    const input = part(page.element, 'Uhrzeit')

    input.focus()
    input.click()
    await flushPromises()

    expect(document.querySelector('[role="option"]')).not.toBeNull()
    expect(document.activeElement).toBe(input)
    page.unmount()
  })

  it('moves into the open calendar on ArrowDown, closes on Escape with the focus back in the field, and reopens on the next click', async () => {
    const page = await mountSuspended(DateTimeField, { props: { modelValue: '2090-10-30', label: 'Termin 1' }, attachTo: document.body })
    const input = part(page.element, 'Datum')

    input.focus()
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    await flushPromises()
    expect(document.activeElement?.closest('[role="gridcell"]')).not.toBeNull()

    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await flushPromises()
    expect(document.querySelector('[role="gridcell"]')).toBeNull()
    expect(document.activeElement).toBe(input)

    input.click()
    await flushPromises()
    expect(document.querySelector('[role="gridcell"]')).not.toBeNull()
    page.unmount()
  })

  it('moves into the open time list on ArrowDown and closes it on Escape with the focus in the field', async () => {
    const page = await mountSuspended(DateTimeField, { props: { modelValue: '2090-10-30', label: 'Termin 1' }, attachTo: document.body })
    const input = part(page.element, 'Uhrzeit')

    input.focus()
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    await flushPromises()
    expect(document.querySelector('[role="listbox"]')?.contains(document.activeElement)).toBe(true)

    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await flushPromises()
    expect(document.querySelector('[role="option"]')).toBeNull()
    expect(document.activeElement).toBe(input)
    page.unmount()
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
