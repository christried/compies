import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { createError } from 'h3'
import { describe, expect, it, vi } from 'vitest'
import IndexPage from '~/pages/index.vue'
import { signOutOn401 } from '~/utils/lost-login'
import { kitty, signInAs } from './auth'

// The login ran out or the User signed out in another tab: any API answer 401 goes to sign-in.
// The client plugin (app/plugins/lost-login.client.ts) only wraps globalThis.fetch with this helper;
// plugins do not run in the test environment, so the test wraps it the same way.
let answer401 = false
const requests = vi.fn()

registerEndpoint('/api/e', {
  method: 'GET',
  handler: () => {
    requests()
    if (answer401) throw createError({ statusCode: 401, statusMessage: 'Sign-in required' })
    return { events: [] }
  },
})

describe('lost login', () => {
  it('a 401 from the API clears the User and goes to sign-in, back to the current page', async () => {
    signInAs(kitty)
    answer401 = true
    await mountSuspended(IndexPage, { route: '/archiv' })
    const guarded = signOutOn401(globalThis.fetch)

    await guarded('/api/e')

    await vi.waitFor(() => expect(useRoute().path).toBe('/anmelden'))
    expect(useRoute().query.redirect).toBe('/archiv')
    expect(useAuthUser().value).toBeNull()
    expect(requests).toHaveBeenCalled()
  })

  it('leaves answers other than 401 alone', async () => {
    signInAs(kitty)
    answer401 = false
    await mountSuspended(IndexPage, { route: '/archiv' })
    const guarded = signOutOn401(globalThis.fetch)

    const response = await guarded('/api/e')

    expect(response.status).toBe(200)
    expect(useRoute().path).toBe('/archiv')
    expect(useAuthUser().value).toEqual(kitty)
  })
})
