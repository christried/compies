import { mountSuspended } from '@nuxt/test-utils/runtime'
import { Crown } from '@lucide/vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import HostDock from '~/components/HostDock.vue'
import ToastStack from '~/components/ToastStack.vue'
import { useHostDock } from '~/composables/useHostDock'
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

  // The keyboard holds a timed toast (#867): its timer waits while Tab presses go on or focus is on the stack, and runs on with the time it had left.
  describe('holds a timed toast for the keyboard (#867)', () => {
    const mounted: { unmount: () => void }[] = []
    const tab = () => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))
    const shown = (page: Awaited<ReturnType<typeof mountSuspended>>) => page.findAll('[role="status"]').length
    /** Mounts the stack on the document (focus needs it) under fake timers. */
    async function mountStack() {
      vi.useFakeTimers()
      const page = await mountSuspended(ToastStack, { attachTo: document.body })
      mounted.push(page)
      return page
    }
    /** Advances the fake clock and lets the stack redraw. */
    async function advance(ms: number) {
      await vi.advanceTimersByTimeAsync(ms)
      await nextTick()
    }

    afterEach(() => {
      for (const page of mounted.splice(0)) page.unmount()
    })

    it('goes after its time when no key is pressed, as before', async () => {
      const page = await mountStack()
      useToast().toast({ tone: 'info', text: 'Weg', duration: 4000 })

      await advance(3999)
      expect(shown(page)).toBe(1)
      await advance(1)
      expect(shown(page)).toBe(0)
    })

    it('stays after a Tab press and goes 3 s after the last press plus the time it had left', async () => {
      const page = await mountStack()
      useToast().toast({ tone: 'info', text: 'Weg', duration: 4000 })

      await advance(3000)
      tab()
      await advance(3000)
      expect(shown(page)).toBe(1)
      await advance(999)
      expect(shown(page)).toBe(1)
      await advance(1)
      expect(shown(page)).toBe(0)
    })

    it('stays up while Tab is pressed every 250 ms for 10 s, then goes 3 s plus its remaining time after the last press', async () => {
      const page = await mountStack()
      useToast().toast({ tone: 'info', text: 'Weg', duration: 5000 })

      for (let at = 0; at < 10_000; at += 250) {
        await advance(250)
        tab()
        expect(shown(page)).toBe(1)
      }
      // Held at 250 ms of its 5 s: 4750 ms are left, behind the 3 s of the last press.
      await advance(3000 + 4749)
      expect(shown(page)).toBe(1)
      await advance(1)
      expect(shown(page)).toBe(0)
    })

    it('holds every timed toast, and a toast that comes while it is held waits as well', async () => {
      const page = await mountStack()
      useToast().toast({ tone: 'info', text: 'eins', duration: 4000 })
      await advance(1000)
      tab()
      useToast().toast({ tone: 'info', text: 'zwei', duration: 2000 })
      await advance(2999)
      expect(shown(page)).toBe(2)

      await advance(1)
      await advance(1999)
      expect(shown(page)).toBe(2)
      await advance(1)
      expect(shown(page)).toBe(1)
      await advance(1000)
      expect(shown(page)).toBe(0)
    })

    it('stays for a minute while focus is on one of its buttons, and goes its remaining time after focus leaves the stack', async () => {
      const page = await mountStack()
      useToast().toast({ tone: 'info', text: 'Weg', duration: 4000, action: { label: 'Rückgängig', run: () => {} } })
      await nextTick()

      await advance(1000)
      const button = page.get('button')
      ;(button.element as HTMLButtonElement).focus()
      await advance(60_000)
      expect(shown(page)).toBe(1)

      ;(button.element as HTMLButtonElement).blur()
      await advance(2999)
      expect(shown(page)).toBe(1)
      await advance(1)
      expect(shown(page)).toBe(0)
    })

    it('leaves an error toast as it is: no timer, nothing held', async () => {
      const page = await mountStack()
      useToast().toast({ tone: 'error', text: 'Kaputt' })

      tab()
      await advance(60_000)
      expect(page.find('[role="alert"]').exists()).toBe(true)
      expect(vi.getTimerCount()).toBe(0)
    })

    it('closes a held toast at once with ✕, and runs and closes it with its action', async () => {
      const page = await mountStack()
      const run = vi.fn()
      useToast().toast({ tone: 'info', text: 'eins', duration: 4000 })
      useToast().toast({ tone: 'info', text: 'zwei', duration: 4000, action: { label: 'Rückgängig', run } })
      await advance(500)
      tab()
      await advance(500)

      await page.findAll('[role="status"]')[0]!.get('button').trigger('click')
      expect(shown(page)).toBe(1)
      await page.findAll('button').find(button => button.text() === 'Rückgängig')!.trigger('click')
      expect(run).toHaveBeenCalledTimes(1)
      expect(shown(page)).toBe(0)
    })

    it('still lets a fourth toast evict a held oldest one', async () => {
      const page = await mountStack()
      useToast().toast({ tone: 'info', text: 'eins', duration: 4000 })
      tab()
      for (const text of ['zwei', 'drei', 'vier']) useToast().toast({ tone: 'info', text, duration: 4000 })
      await nextTick()

      expect(page.findAll('[role="status"]').map(toast => toast.text())).toEqual(['zwei', 'drei', 'vier'])
    })

    it('leaves no timer and no keydown listener once the last toast is gone', async () => {
      const added = vi.spyOn(window, 'addEventListener')
      const removed = vi.spyOn(window, 'removeEventListener')
      const keydown = (spy: { mock: { calls: unknown[][] } }) => spy.mock.calls.filter(([type]) => type === 'keydown').length
      const page = await mountStack()
      expect(keydown(added)).toBe(0)

      useToast().toast({ tone: 'info', text: 'eins', duration: 4000 })
      useToast().toast({ tone: 'info', text: 'zwei', duration: 4000 })
      await nextTick()
      expect(keydown(added)).toBe(1)
      expect(keydown(removed)).toBe(0)

      tab()
      await advance(3000 + 4000)
      expect(shown(page)).toBe(0)
      expect(keydown(removed)).toBe(1)
      expect(vi.getTimerCount()).toBe(0)
      added.mockRestore()
      removed.mockRestore()
    })

    it('drops the pending hold when a Tab press is followed by closing the only toast', async () => {
      const page = await mountStack()
      useToast().toast({ tone: 'info', text: 'eins', duration: 4000 })
      tab()
      await nextTick()

      await page.get('button').trigger('click')
      expect(vi.getTimerCount()).toBe(0)
    })
  })

  it('is lifted while a Host dock is mounted, still shows its toasts there, and is back once the dock is gone', async () => {
    const page = await mountSuspended(ToastStack)
    expect(useHostDock().docked.value).toBe(false)

    const dock = await mountSuspended(HostDock, { props: { actions: [{ key: 'setDate', label: 'Termin festlegen', icon: Crown, group: 'Termine', run: () => {} }] } })
    await vi.waitFor(() => expect(useHostDock().docked.value).toBe(true))
    useToast().toast({ tone: 'info', text: 'Über dem Dock' })
    await vi.waitFor(() => expect(page.get('[role="status"]').text()).toContain('Über dem Dock'))

    dock.unmount()
    await vi.waitFor(() => expect(useHostDock().docked.value).toBe(false))
  })
})
