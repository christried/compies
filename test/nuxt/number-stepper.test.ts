import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import NumberStepper from '~/components/NumberStepper.vue'

// NumberStepper (02-components § NumberStepper): a spinbutton with a minus and a plus button. At a limit the
// button stays focusable but is aria-disabled, does nothing and says why.

function mountStepper(props: Record<string, unknown> = {}) {
  return mountSuspended(NumberStepper, { props: { modelValue: 3, min: 1, max: 5, label: 'Anzahl Teams', ...props } })
}

const plus = (page: Awaited<ReturnType<typeof mountStepper>>) => page.get('button[aria-label="Anzahl Teams: mehr"]')
const minus = (page: Awaited<ReturnType<typeof mountStepper>>) => page.get('button[aria-label="Anzahl Teams: weniger"]')

describe('NumberStepper', () => {
  it('is a spinbutton that names its value and limits', async () => {
    const page = await mountStepper({ unit: 'Teams' })

    const group = page.get('[role="spinbutton"]')
    expect(group.attributes()).toMatchObject({ 'aria-label': 'Anzahl Teams', 'aria-valuenow': '3', 'aria-valuemin': '1', 'aria-valuemax': '5' })
    expect(page.get('output').text()).toBe('3')
    expect(page.text()).toContain('Teams')
  })

  it('counts up and down with the buttons', async () => {
    const page = await mountStepper()

    await plus(page).trigger('click')
    await minus(page).trigger('click')

    expect(page.emitted('update:modelValue')).toEqual([[4], [2]])
  })

  it('steps by `step`', async () => {
    const page = await mountStepper({ modelValue: 10, min: 0, max: 100, step: 5 })

    await plus(page).trigger('click')

    expect(page.emitted('update:modelValue')).toEqual([[15]])
  })

  it('counts with ArrowUp and ArrowDown', async () => {
    const page = await mountStepper()

    await page.get('[role="spinbutton"]').trigger('keydown', { key: 'ArrowUp' })
    await page.get('[role="spinbutton"]').trigger('keydown', { key: 'ArrowDown' })

    expect(page.emitted('update:modelValue')).toEqual([[4], [2]])
  })

  it('at the maximum the plus button is aria-disabled, does nothing and carries the reason', async () => {
    const page = await mountStepper({ modelValue: 5, maxReason: 'Höchstens 5 Teams.' })

    const button = plus(page)
    expect(button.attributes('aria-disabled')).toBe('true')
    expect(button.attributes('disabled')).toBeUndefined()
    expect(button.attributes('title')).toBe('Höchstens 5 Teams.')
    expect(page.get(`[id="${button.attributes('aria-describedby')}"]`).text()).toBe('Höchstens 5 Teams.')

    await button.trigger('click')
    await page.get('[role="spinbutton"]').trigger('keydown', { key: 'ArrowUp' })
    expect(page.emitted('update:modelValue')).toBeUndefined()
    expect(minus(page).attributes('aria-disabled')).toBeUndefined()
  })

  it('at the minimum the minus button is aria-disabled with its reason', async () => {
    const page = await mountStepper({ modelValue: 1, minReason: 'Mindestens 1 Team.' })

    expect(minus(page).attributes('aria-disabled')).toBe('true')
    expect(minus(page).attributes('title')).toBe('Mindestens 1 Team.')
    await minus(page).trigger('click')
    expect(page.emitted('update:modelValue')).toBeUndefined()
  })

  it('takes a lower maximum from the parent, with the reason for that one', async () => {
    const page = await mountStepper({ modelValue: 3, max: 3, maxReason: 'Höchstens 24 Leute in Teams.' })

    expect(plus(page).attributes('aria-disabled')).toBe('true')
    expect(plus(page).attributes('title')).toBe('Höchstens 24 Leute in Teams.')
    expect(page.get('[role="spinbutton"]').attributes('aria-valuemax')).toBe('3')
  })
})

describe('NumberStepper with a lockedReason', () => {
  it('locks both buttons with the reason and changes nothing', async () => {
    const page = await mountStepper({ lockedReason: 'Gesperrt, weil es läuft.' })

    await plus(page).trigger('click')
    await minus(page).trigger('click')

    expect(plus(page).attributes('aria-disabled')).toBe('true')
    expect(minus(page).attributes('aria-disabled')).toBe('true')
    expect(plus(page).attributes('title')).toBe('Gesperrt, weil es läuft.')
    expect(minus(page).attributes('title')).toBe('Gesperrt, weil es läuft.')
    expect(page.emitted('update:modelValue')).toBeUndefined()
  })
})

// The value is the focusable spinbutton (#174, review S8): a keyboard user lands on it and moves it with the arrow
// keys, Home and End. The minus and plus buttons stay outside it, so the spinbutton reads only its value.
describe('NumberStepper as a spinbutton (#174)', () => {
  const spin = (page: Awaited<ReturnType<typeof mountStepper>>) => page.get('[role="spinbutton"]')

  it('is the focusable value, and the buttons are not inside it', async () => {
    const page = await mountStepper({ modelValue: 3 })

    expect(spin(page).attributes('tabindex')).toBe('0')
    expect(spin(page).text()).toBe('3')
    expect(spin(page).find('button').exists()).toBe(false)
    expect(page.get('[role="group"]').attributes('aria-label')).toBe('Anzahl Teams')
  })

  it('moves the value with ArrowUp and ArrowRight, and ArrowDown and ArrowLeft', async () => {
    const page = await mountStepper()

    await spin(page).trigger('keydown', { key: 'ArrowRight' })
    await spin(page).trigger('keydown', { key: 'ArrowUp' })
    await spin(page).trigger('keydown', { key: 'ArrowDown' })
    await spin(page).trigger('keydown', { key: 'ArrowLeft' })

    expect(page.emitted('update:modelValue')).toEqual([[4], [4], [2], [2]])
  })

  it('jumps to the minimum with Home and to the maximum with End', async () => {
    const page = await mountStepper({ modelValue: 3, min: 1, max: 5 })

    await spin(page).trigger('keydown', { key: 'End' })
    await spin(page).trigger('keydown', { key: 'Home' })

    expect(page.emitted('update:modelValue')).toEqual([[5], [1]])
  })

  it('announces the value as aria-valuenow and, with a unit, as aria-valuetext', async () => {
    const page = await mountStepper({ modelValue: 3, unit: 'Teams' })
    expect(spin(page).attributes('aria-valuetext')).toBe('3 Teams')

    await page.setProps({ modelValue: 4 })

    expect(spin(page).attributes('aria-valuenow')).toBe('4')
    expect(spin(page).attributes('aria-valuetext')).toBe('4 Teams')
  })

  it('keeps the focus on the value after a change', async () => {
    const page = await mountSuspended(NumberStepper, { props: { modelValue: 3, min: 1, max: 5, label: 'Anzahl Teams' }, attachTo: document.body })
    const value = spin(page).element as HTMLElement
    value.focus()

    await spin(page).trigger('keydown', { key: 'ArrowUp' })
    await page.setProps({ modelValue: 4 })

    expect(spin(page).element).toBe(value)
    expect(document.activeElement).toBe(value)
    page.unmount()
  })

  it('does not change when it is locked, and it is out of the tab order', async () => {
    const page = await mountStepper({ lockedReason: 'Gesperrt, weil es läuft.' })

    await spin(page).trigger('keydown', { key: 'ArrowUp' })
    await spin(page).trigger('keydown', { key: 'Home' })

    expect(page.emitted('update:modelValue')).toBeUndefined()
    expect(spin(page).attributes('aria-disabled')).toBe('true')
    expect(spin(page).attributes('tabindex')).toBe('-1')
  })

  it('keeps the buttons working beside the keys', async () => {
    const page = await mountStepper()

    await plus(page).trigger('click')

    expect(page.emitted('update:modelValue')).toEqual([[4]])
  })
})
