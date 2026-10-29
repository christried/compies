import { mountSuspended } from '@nuxt/test-utils/runtime'
import { afterEach, describe, expect, it } from 'vitest'
import ErrorPage from '~/error.vue'

// The error page replaces app.vue when a render fails, so the staging label has to live here too (#178).
describe('error page staging badge (#178)', () => {
  afterEach(() => {
    useRuntimeConfig().public.staging = false
  })

  it('labels the staging build STAGING', async () => {
    useRuntimeConfig().public.staging = true

    const page = await mountSuspended(ErrorPage, { props: { error: createError({ statusCode: 500, message: 'Boom' }) } })

    expect(page.text()).toContain('STAGING')
  })

  it('shows no staging label in production', async () => {
    useRuntimeConfig().public.staging = false

    const page = await mountSuspended(ErrorPage, { props: { error: createError({ statusCode: 500, message: 'Boom' }) } })

    expect(page.text()).not.toContain('STAGING')
  })
})
