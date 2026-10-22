import { mountSuspended } from '@nuxt/test-utils/runtime'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ToastStack from '~/components/ToastStack.vue'
import { useToast } from '~/composables/useToast'

describe('ToastStack', () => {
  beforeEach(() => {
    useState('toasts').value = []
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('announces a success toast politely and dismisses it after a few seconds', async () => {
    vi.useFakeTimers()
    const page = await mountSuspended(ToastStack)

    useToast().toast({ tone: 'success', text: 'Link kopiert' })
    await vi.waitFor(() => expect(page.get('[role="status"]').text()).toContain('Link kopiert'))
    vi.advanceTimersByTime(10_000)

    await vi.waitFor(() => expect(page.find('[role="status"]').exists()).toBe(false))
  })

  it('keeps an error until it is dismissed, and announces it as an alert', async () => {
    vi.useFakeTimers()
    const page = await mountSuspended(ToastStack)

    useToast().toast({ tone: 'error', text: 'Deine Stimme ist nicht angekommen. Tipp nochmal.' })
    vi.advanceTimersByTime(60_000)

    await vi.waitFor(() => expect(page.get('[role="alert"]').text()).toContain('nicht angekommen'))
    await page.get('[role="alert"] button').trigger('click')
    await vi.waitFor(() => expect(page.find('[role="alert"]').exists()).toBe(false))
  })

  it('stacks at most three toasts and drops the oldest', async () => {
    const page = await mountSuspended(ToastStack)

    for (const text of ['eins', 'zwei', 'drei', 'vier']) useToast().toast({ tone: 'info', text })

    await vi.waitFor(() => {
      const texts = page.findAll('[role="status"]').map(toast => toast.text())
      expect(texts).toHaveLength(3)
      expect(texts[0]).toContain('zwei')
    })
  })
})
