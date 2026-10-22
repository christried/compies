import { mountSuspended } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it } from 'vitest'
import IndexPage from '~/pages/index.vue'
import { kitty, signInAs } from './auth'

describe('home page', () => {
  beforeEach(() => signInAs(kitty))

  it('renders the German copy from de.json', async () => {
    const page = await mountSuspended(IndexPage)

    expect(page.text()).toContain('COMPIES')
    expect(page.text()).toContain('Wann zocken wir?')
  })
})
