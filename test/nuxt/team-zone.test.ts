import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import TeamZone from '~/components/TeamZone.vue'

// A team's border on the Game board (#496): the focus colour while a person is dragged over it, the line colour
// everywhere else. The viewer's own team keeps its thicker border without the line colour competing with the focus one.

const props = { team: 1, name: 'Rot', size: 2, taken: 0, lockReason: null, dropTarget: false, mine: false }

describe('TeamZone border', () => {
  it('takes the focus border, and no line border, while a drop target is hovered', async () => {
    const page = await mountSuspended(TeamZone, { props: { ...props, dropTarget: true } })

    expect(page.classes()).toContain('border-focus')
    expect(page.classes()).toContain('border-[3px]')
    expect(page.classes()).not.toContain('border-line')
  })

  it('keeps the line border, and no focus border, at rest', async () => {
    const page = await mountSuspended(TeamZone, { props })

    expect(page.classes()).toContain('border-line')
    expect(page.classes()).toContain('border-(length:--cp-bw)')
    expect(page.classes()).not.toContain('border-focus')
  })

  it('shows the viewer\'s own team with the thicker line border and no focus border', async () => {
    const page = await mountSuspended(TeamZone, { props: { ...props, mine: true } })

    expect(page.classes()).toContain('border-line')
    expect(page.classes()).toContain('border-[3px]')
    expect(page.classes()).not.toContain('border-focus')
  })
})
