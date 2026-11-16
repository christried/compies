import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import AppButton from '~/components/AppButton.vue'

// AppButton's `aura` option (#471): the one button in a page's head that starts something new carries the
// glow (`.aura`, the comet ring of compies-theme.css); every other button has none. The option is a declared
// prop, so it never reaches the DOM as an attribute.

describe('AppButton aura option (#471)', () => {
  it('has no aura by default', async () => {
    const page = await mountSuspended(AppButton, { slots: { default: 'Los' } })

    expect(page.get('button').classes()).not.toContain('aura')
  })

  it('gives the button the aura with the option, and keeps its other classes', async () => {
    const page = await mountSuspended(AppButton, { props: { aura: true }, slots: { default: 'Los' } })

    expect(page.get('button').classes()).toContain('aura')
    expect(page.get('button').classes()).toContain('font-extrabold')
  })

  it('gives the link the aura with the option and `to`', async () => {
    const page = await mountSuspended(AppButton, { props: { aura: true, to: '/neu' }, slots: { default: 'Neu' } })

    const link = page.get('a')
    expect(link.attributes('href')).toBe('/neu')
    expect(link.classes()).toContain('aura')
  })

  it('does not render the option as an HTML attribute', async () => {
    const page = await mountSuspended(AppButton, { props: { aura: true }, slots: { default: 'Los' } })

    expect(page.get('button').attributes('aura')).toBeUndefined()
  })
})
