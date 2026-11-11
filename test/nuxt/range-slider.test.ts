import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import RangeSlider from '~/components/RangeSlider.vue'

// The reusable range slider (#516): a native input[type=range] with a label and a value text. It is tested alone, the
// form that uses it is tested with it (game-image-crop).
async function mountSlider(props: Record<string, unknown> = {}): Promise<VueWrapper> {
  return mountSuspended(RangeSlider, {
    props: {
      modelValue: 1,
      min: 1,
      max: 3,
      step: 0.1,
      label: 'Zoom',
      valueText: 'Passt',
      ...props,
    },
  })
}

const input = (page: VueWrapper) => page.get('input[type="range"]')

describe('RangeSlider (#516)', () => {
  it('renders one native range input with its bounds, step and value, named by its label', async () => {
    const page = await mountSlider()

    const range = input(page).element as HTMLInputElement
    expect(range.getAttribute('min')).toBe('1')
    expect(range.getAttribute('max')).toBe('3')
    expect(range.getAttribute('step')).toBe('0.1')
    expect(range.value).toBe('1')

    const label = page.findAll('label').find(el => el.text() === 'Zoom')
    expect(label).toBeDefined()
    expect(range.id).toBe(label!.attributes('for'))
    expect(page.text()).toContain('Passt')
  })

  it('gives the input the value text as its aria-valuetext', async () => {
    const page = await mountSlider({ modelValue: 2, valueText: '2,0×' })

    expect(input(page).attributes('aria-valuetext')).toBe('2,0×')
  })

  it('shows a new value text when the prop changes', async () => {
    const page = await mountSlider()

    await page.setProps({ modelValue: 1.5, valueText: '1,5×' })

    expect(input(page).attributes('aria-valuetext')).toBe('1,5×')
    expect(page.text()).toContain('1,5×')
    expect(page.text()).not.toContain('Passt')
  })

  it('emits the number on input, and forwards the native change with the same number', async () => {
    const page = await mountSlider()

    const range = input(page).element as HTMLInputElement
    range.value = '2'
    await input(page).trigger('input')
    expect(page.emitted('update:modelValue')).toEqual([[2]])

    await input(page).trigger('change')
    await flushPromises()
    expect(page.emitted('change')).toEqual([[2]])
  })

  it('takes the keyboard natively: no tabindex on the input', async () => {
    const page = await mountSlider()

    expect(input(page).attributes('tabindex')).toBeUndefined()
  })

  it('is disabled as a native input when asked', async () => {
    const page = await mountSlider({ disabled: true })

    expect(input(page).attributes('disabled')).toBeDefined()
  })
})
