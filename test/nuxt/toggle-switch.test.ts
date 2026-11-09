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

  describe('disabled (#225)', () => {
    it('is announced as disabled, keeps its state and its help, and is not announced as disabled otherwise', async () => {
      const page = await mountSuspended(ToggleSwitch, { props: { ...props, disabled: true } })

      const sw = page.get('[role="switch"]')
      expect(sw.attributes('aria-disabled')).toBe('true')
      expect(sw.attributes('aria-checked')).toBe('false')
      expect(page.get(`[id="${sw.attributes('aria-describedby')}"]`).text()).toBe('Erfundene Namen, bis das Rad stoppt.')

      await page.setProps({ disabled: false })
      expect(page.get('[role="switch"]').attributes('aria-disabled')).toBeUndefined()
    })

    it('asks for nothing when it is clicked', async () => {
      const page = await mountSuspended(ToggleSwitch, { props: { ...props, disabled: true } })

      await page.get('[role="switch"]').trigger('click')

      expect(page.emitted('update:modelValue')).toBeUndefined()
    })

    it('looks muted like the other disabled controls: a dashed track', async () => {
      const page = await mountSuspended(ToggleSwitch, { props: { ...props, disabled: true } })

      const track = page.get('[role="switch"] > span')
      expect(track.classes()).toContain('border-dashed')
      expect(page.get('[role="switch"]').classes()).toContain('aria-disabled:text-ink-3')
    })
  })

  describe('named from outside, the track alone (#400)', () => {
    it('takes its name and description from the ids it is given, and shows no text', async () => {
      const page = await mountSuspended(ToggleSwitch, { props: { modelValue: false, labelledby: 'row-title', describedby: 'row-description' } })

      const sw = page.get('[role="switch"]')
      expect(sw.attributes('aria-labelledby')).toBe('row-title')
      expect(sw.attributes('aria-describedby')).toBe('row-description')
      expect(page.text()).toBe('')
      expect(sw.classes()).toContain('flex-none')
      expect(sw.classes()).not.toContain('w-full')
    })

    it('describes nothing without describedby', async () => {
      const page = await mountSuspended(ToggleSwitch, { props: { modelValue: true, labelledby: 'row-title' } })

      const sw = page.get('[role="switch"]')
      expect(sw.attributes('aria-describedby')).toBeUndefined()
      expect(sw.attributes('aria-checked')).toBe('true')
    })

    it('still asks for the opposite value on a click', async () => {
      const page = await mountSuspended(ToggleSwitch, { props: { modelValue: false, labelledby: 'row-title' } })

      await page.get('[role="switch"]').trigger('click')

      expect(page.emitted('update:modelValue')).toEqual([[true]])
    })
  })
})
