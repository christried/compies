import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import HoldToConfirmButton from '~/components/HoldToConfirmButton.vue'

describe('HoldToConfirmButton', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('confirms after a one second hold, and not before', async () => {
    const page = await mountSuspended(HoldToConfirmButton, { props: { label: 'Erneuern' } })

    await page.get('button').trigger('pointerdown')
    vi.advanceTimersByTime(900)
    expect(page.emitted('confirm')).toBeUndefined()

    vi.advanceTimersByTime(100)
    expect(page.emitted('confirm')).toHaveLength(1)
  })

  it('cancels when released early, so nothing happens', async () => {
    const page = await mountSuspended(HoldToConfirmButton, { props: { label: 'Erneuern' } })

    await page.get('button').trigger('pointerdown')
    vi.advanceTimersByTime(500)
    await page.get('button').trigger('pointerup')
    vi.advanceTimersByTime(2000)

    expect(page.emitted('confirm')).toBeUndefined()
  })

  it('works from the keyboard: Space held for a second confirms, a released Space does not', async () => {
    const page = await mountSuspended(HoldToConfirmButton, { props: { label: 'Erneuern' } })

    await page.get('button').trigger('keydown', { key: ' ' })
    vi.advanceTimersByTime(400)
    await page.get('button').trigger('keyup', { key: ' ' })
    vi.advanceTimersByTime(1000)
    expect(page.emitted('confirm')).toBeUndefined()

    await page.get('button').trigger('keydown', { key: ' ' })
    await page.get('button').trigger('keydown', { key: ' ', repeat: true })
    vi.advanceTimersByTime(1000)
    expect(page.emitted('confirm')).toHaveLength(1)
  })

  it('runs its action after the hold and shows done once the action succeeds', async () => {
    let succeed: (saved: boolean) => void = () => {}
    const action = vi.fn(() => new Promise<boolean>(resolve => (succeed = resolve)))
    const page = await mountSuspended(HoldToConfirmButton, { props: { label: 'Erneuern', doneLabel: 'Erneuert', action } })

    await page.get('button').trigger('pointerdown')
    await vi.advanceTimersByTimeAsync(1000)
    expect(action).toHaveBeenCalledTimes(1)
    expect(page.emitted('confirm')).toHaveLength(1)
    expect(page.text()).not.toContain('Erneuert')

    // While the action runs, another hold starts nothing.
    await page.get('button').trigger('pointerup')
    await page.get('button').trigger('pointerdown')
    await vi.advanceTimersByTimeAsync(1000)
    expect(action).toHaveBeenCalledTimes(1)

    succeed(true)
    await flushPromises()
    expect(page.get('button').text()).toBe('Erneuert')
    expect(page.get('[role="status"]').text()).toBe('Erneuert')
  })

  it('goes back to idle when its action fails, so the next hold runs it again', async () => {
    const action = vi.fn(() => Promise.resolve(false))
    const page = await mountSuspended(HoldToConfirmButton, { props: { label: 'Erneuern', doneLabel: 'Erneuert', action } })

    await page.get('button').trigger('pointerdown')
    await vi.advanceTimersByTimeAsync(1000)
    await flushPromises()

    expect(page.get('button').text()).toBe('Erneuern')
    expect(page.get('[role="status"]').text()).toBe('')

    await page.get('button').trigger('pointerup')
    await page.get('button').trigger('pointerdown')
    await vi.advanceTimersByTimeAsync(1000)
    expect(action).toHaveBeenCalledTimes(2)
  })

  it('does not respond while disabled, and says why', async () => {
    const page = await mountSuspended(HoldToConfirmButton, {
      props: { label: 'Erneuern', disabled: true, disabledReason: 'Nur der Host' },
    })

    await page.get('button').trigger('pointerdown')
    vi.advanceTimersByTime(1000)

    expect(page.emitted('confirm')).toBeUndefined()
    expect(page.get('button').attributes('aria-disabled')).toBe('true')
    expect(page.text()).toContain('Nur der Host')
  })
})
