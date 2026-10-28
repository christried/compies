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
