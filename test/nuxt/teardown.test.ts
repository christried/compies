import { mountSuspended } from '@nuxt/test-utils/runtime'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import EventPage from '~/pages/e/[slug]/index.vue'
import { POLL_INTERVAL_MS } from '~/composables/usePollRefresh'
import { kitty, signInAs } from './auth'
import { sanneAndLarsi, serve, view } from './event-page'

// An Event page's 15 s poll (usePollRefresh) read `document.visibilityState` after the test environment was gone and failed
// CI with „document is not defined“ (#240). mountSuspended leaves what it mounts mounted until the file ends, so
// test/nuxt/setup.ts unmounts it after each test. The first test mounts the page; the second runs after that teardown.
// The timers are recorded by hand: the Nuxt project resets mocks between tests.
describe('the Nuxt test teardown', () => {
  const real = { setInterval: globalThis.setInterval, clearInterval: globalThis.clearInterval }
  const polls = new Set<unknown>()
  let pollTimer: unknown

  beforeAll(() => {
    globalThis.setInterval = ((handler: TimerHandler, delay?: number, ...args: unknown[]) => {
      const timer = real.setInterval(handler, delay, ...args)
      if (delay === POLL_INTERVAL_MS) polls.add(timer)
      return timer
    }) as typeof setInterval
    globalThis.clearInterval = ((timer?: Parameters<typeof clearInterval>[0]) => {
      polls.delete(timer)
      real.clearInterval(timer)
    }) as typeof clearInterval
  })
  afterAll(() => Object.assign(globalThis, real))
  beforeEach(() => signInAs(kitty))

  it('starts the Event page poll and leaves the page mounted', async () => {
    const { slug } = serve(s => view(s, sanneAndLarsi))

    await mountSuspended(EventPage, { route: `/e/${slug}` })

    expect(polls.size).toBe(1)
    pollTimer = [...polls][0]
  })

  it('has stopped that poll by the next test, so it cannot fire once the environment is torn down', () => {
    expect(pollTimer).toBeDefined()
    expect(polls.has(pollTimer)).toBe(false)
  })
})
