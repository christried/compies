import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import { kitty, signInAs } from './auth'

// The splash's decision (#674, spec #927): taken once per page load, from the route, the signed-in User and the cookie `compies-boot`'s presence. The
// first byte carries it on the server; the Nuxt test environment has no SSR, so this pins the wiring (the state that the layer is rendered from,
// read after the auth middleware has run); the rule itself is in test/unit/boot.test.ts.

/** A component that reads the decision in its setup, as `app.vue` does, and shows it. */
const Probe = defineComponent({
  setup() {
    const due = useBootSplash()
    return () => h('p', { 'data-due': String(due.value) })
  },
})

async function dueAt(route: string) {
  const page = await mountSuspended(Probe, { route })
  return page.get('p').attributes('data-due')
}

describe('the splash is due', () => {
  beforeEach(() => {
    clearNuxtState('boot-splash-due')
  })

  afterEach(async () => {
    await cookieStore.delete('compies-boot')
  })

  it('on Home for a signed-in User without the cookie', async () => {
    signInAs(kitty)

    expect(await dueAt('/')).toBe('true')
  })

  it('not once the device has the cookie', async () => {
    signInAs(kitty)
    await cookieStore.set('compies-boot', 'seen')

    expect(await dueAt('/')).toBe('false')
  })

  it('not on another page', async () => {
    signInAs(kitty)

    expect(await dueAt('/e/x-abc')).toBe('false')
  })

  it('not for a visitor who is signed out', async () => {
    signInAs(null)

    expect(await dueAt('/')).toBe('false')
  })

  it('reads the User the auth middleware has loaded, not one that is still to come', async () => {
    // The middleware loads the User before the page's setup: the first request of a page load has none yet.
    useAuthUser().value = null
    useState('auth-user-loaded').value = false
    registerEndpoint('/api/me', () => ({ user: kitty }))

    expect(await dueAt('/')).toBe('true')
  })

  it('is not decided again by a later navigation: the first answer stays', async () => {
    signInAs(kitty)
    expect(await dueAt('/')).toBe('true')

    await cookieStore.set('compies-boot', 'seen')

    expect(await dueAt('/')).toBe('true')
  })
})
