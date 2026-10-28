import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import ToggleSwitch from '~/components/ToggleSwitch.vue'

// ToggleSwitch (02-components § ToggleSwitch): an on/off setting with a visible label and help (#145, „Rad verdecken“).

const props = { modelValue: false, label: 'Rad verdecken', help: 'Erfundene Namen, bis das Rad stoppt.' }

describe('ToggleSwitch', () => {
  it('is a switch named by its label, with its help described', async () => {
    const page = await mountSuspended(ToggleSwitch, { props })

    const sw = page.get('[role="switch"]')
    expect(page.get(`[id="${sw.attributes('aria-labelledby')}"]`).text()).toBe('Rad verdecken')
    expect(page.get(`[id="${sw.attributes('aria-describedby')}"]`).text()).toBe('Erfundene Namen, bis das Rad stoppt.')
  })

  it('needs no help: it renders none and describes nothing', async () => {
    const page = await mountSuspended(ToggleSwitch, { props: { modelValue: false, label: 'Rad verdecken' } })

    const sw = page.get('[role="switch"]')
    expect(sw.attributes('aria-describedby')).toBeUndefined()
    expect(page.text()).toBe('Rad verdecken')
  })

  it('reports off and on through aria-checked', async () => {
    const page = await mountSuspended(ToggleSwitch, { props })
    expect(page.get('[role="switch"]').attributes('aria-checked')).toBe('false')

    await page.setProps({ modelValue: true })

    expect(page.get('[role="switch"]').attributes('aria-checked')).toBe('true')
  })

  it('asks for the opposite value on each click, and the label is clickable too', async () => {
    const page = await mountSuspended(ToggleSwitch, { props })

    await page.get('[role="switch"]').trigger('click')
    await page.setProps({ modelValue: true })
    await page.get('[role="switch"]').trigger('click')

    expect(page.emitted('update:modelValue')).toEqual([[true], [false]])
  })
})
