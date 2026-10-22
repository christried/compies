import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import IndexPage from '~/pages/index.vue'

describe('home page', () => {
  it('renders the German copy from de.json', async () => {
    const page = await mountSuspended(IndexPage)

    expect(page.text()).toContain('COMPIES')
    expect(page.text()).toContain('Wann zocken wir?')
  })
})
