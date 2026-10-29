import { mountSuspended } from '@nuxt/test-utils/runtime'
import { afterEach, describe, expect, it } from 'vitest'
import StagingBadge from '~/components/StagingBadge.vue'

// The flag is set at build time (nuxt.config.ts, #178); the test sets it the way the build would.
describe('StagingBadge (#178)', () => {
  afterEach(() => {
    useRuntimeConfig().public.staging = false
  })

  it('labels the staging build STAGING', async () => {
    useRuntimeConfig().public.staging = true

    const badge = await mountSuspended(StagingBadge)

    expect(badge.text()).toBe('STAGING')
  })

  it('renders nothing in production', async () => {
    useRuntimeConfig().public.staging = false

    const badge = await mountSuspended(StagingBadge)

    expect(badge.text()).toBe('')
    expect(badge.html()).not.toContain('STAGING')
  })
})
