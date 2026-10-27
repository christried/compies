import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { describe, expect, it, vi } from 'vitest'
import IndexPage from '~/pages/index.vue'
import { kitty, signInAs } from './auth'

// A page without a title of its own shows the app name alone, not „Compies | Compies“ (#75).
registerEndpoint('/api/e', {
  method: 'GET',
  handler: () => ({ events: [] }),
})

describe('page title', () => {
  it('shows the app name alone on Home, which sets no title of its own', async () => {
    signInAs(kitty)

    await mountSuspended(IndexPage)

    await vi.waitFor(() => expect(document.title).toBe('Compies'))
  })
})
