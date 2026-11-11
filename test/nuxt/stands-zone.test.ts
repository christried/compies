import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import StandsZone from '~/components/StandsZone.vue'

// The Tribüne's border while a person is dragged over it (#496): the focus colour wins on drag-over and the line colour
// is back at rest. The line class is no longer static, so it cannot override the focus class in the stylesheet.

describe('StandsZone border', () => {
  it('takes the focus border, and no line border, while a drop target is hovered', async () => {
    const page = await mountSuspended(StandsZone, { props: { count: 0, dropTarget: true } })

    expect(page.classes()).toContain('border-focus')
    expect(page.classes()).toContain('border-[3px]')
    expect(page.classes()).not.toContain('border-line')
  })

  it('keeps the line border, and no focus border, at rest', async () => {
    const page = await mountSuspended(StandsZone, { props: { count: 0, dropTarget: false } })

    expect(page.classes()).toContain('border-line')
    expect(page.classes()).toContain('border-(length:--cp-bw)')
    expect(page.classes()).not.toContain('border-focus')
  })
})
