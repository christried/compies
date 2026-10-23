import { mountSuspended } from '@nuxt/test-utils/runtime'
import { Crown } from '@lucide/vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import HostDock from '~/components/HostDock.vue'
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

  it('gives every toast an ✕ that closes it, not only errors', async () => {
    const page = await mountSuspended(ToastStack)

    useToast().toast({ tone: 'success', text: 'Link kopiert' })
    useToast().toast({ tone: 'info', text: 'Kommt bald' })
    await vi.waitFor(() => expect(page.findAll('[role="status"]')).toHaveLength(2))

    for (const toast of page.findAll('[role="status"]')) {
      expect(toast.get('button').attributes('aria-label')).toBe('Schließen')
    }
    await page.get('[role="status"] button').trigger('click')
    await vi.waitFor(() => expect(page.findAll('[role="status"]')).toHaveLength(1))
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

  it('sits above the Host dock while one is mounted, and back at its place once it is gone', async () => {
    const page = await mountSuspended(ToastStack)
    expect(page.classes()).toContain('bottom-20')
    expect(page.classes()).not.toContain('bottom-36')

    const dock = await mountSuspended(HostDock, { props: { actions: [{ key: 'set', label: 'Termin festlegen', icon: Crown }] } })
    await vi.waitFor(() => expect(page.classes()).toContain('bottom-36'))
    expect(page.classes()).toContain('md:bottom-24')

    dock.unmount()
    await vi.waitFor(() => expect(page.classes()).toContain('bottom-20'))
  })
})
