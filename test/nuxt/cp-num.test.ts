import { mountSuspended } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CpNum from '~/components/CpNum.vue'

// CpNum counts (#276, 04-motion § Leaderboard: 0.6 s power2.out, at most 15 changes a second). The digits are `aria-hidden` when `say` is given, and
// `say` always holds the final value, so a screen reader is never read a count. rAF, timers and Date are fakes: the test moves the clock.

let page: VueWrapper | undefined

/** The page's motion setting, as the tokens put it in `--cp-motion`. */
function motion(value: 'full' | 'reduced') {
  vi.spyOn(window, 'getComputedStyle').mockReturnValue({ getPropertyValue: (name: string) => (name === '--cp-motion' ? value : '') } as CSSStyleDeclaration)
}

async function mount(props: { value: number | string, from?: number, say?: string }) {
  page = await mountSuspended(CpNum, { props: { say: 'x', ...props } })
  await nextTick()
  return page
}

const digits = () => page!.get('[aria-hidden="true"]').text()

/** Lets `ms` of fake time pass, a frame at a time, and records every distinct number the digits showed. */
async function run(ms: number): Promise<string[]> {
  const seen: string[] = []
  for (let spent = 0; spent < ms; spent += 16) {
    vi.advanceTimersByTime(16)
    await nextTick()
    if (seen.at(-1) !== digits()) seen.push(digits())
  }
  return seen
}

beforeEach(() => {
  motion('full')
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout', 'clearTimeout', 'Date'] })
  vi.setSystemTime(new Date('2026-11-02T20:00:00.000Z'))
})

afterEach(() => {
  page?.unmount()
  page = undefined
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('CpNum', () => {
  it('shows the value at once without `from`', async () => {
    await mount({ value: 8 })

    expect(digits()).toBe('8')
    expect((await run(700)).filter(text => text !== '8')).toEqual([])
  })

  it('counts from `from` to the value and lands on it', async () => {
    await mount({ value: 8, from: 3 })

    expect(digits()).toBe('3')
    const seen = await run(300)
    // power2.out is past half way by 300 ms (3 + 5 * .75 = 6.75); the 15-a-second throttle may hold the number one step back.
    expect(Number(seen.at(-1))).toBeGreaterThanOrEqual(6)
    expect(Number(seen.at(-1))).toBeLessThan(8)
    expect(seen.some(text => text !== '3' && text !== '8')).toBe(true)
    await run(400)
    expect(digits()).toBe('8')
  })

  it('writes at most 15 numbers in a second', async () => {
    await mount({ value: 100, from: 0 })

    const seen = await run(1000)
    expect(seen.length).toBeLessThanOrEqual(15)
    expect(seen.at(-1)).toBe('100')
  })

  it('keeps the final value for screen readers from the first moment', async () => {
    await mount({ value: 8, from: 3, say: '8 Punkte' })

    expect(page!.get('.sr-only').text()).toBe('8 Punkte')
    await run(200)
    expect(page!.get('.sr-only').text()).toBe('8 Punkte')
  })

  it('keeps the number when `from` turns undefined after the count', async () => {
    await mount({ value: 8, from: 3 })
    await run(700)

    await page!.setProps({ from: undefined })
    await nextTick()

    expect(digits()).toBe('8')
    expect((await run(300)).filter(text => text !== '8')).toEqual([])
  })

  it('does not count a string value, a timer', async () => {
    await mount({ value: '0:42', from: 3 })

    expect(digits()).toBe('0:42')
    expect((await run(300)).filter(text => text !== '0:42')).toEqual([])
  })

  it('shows the value at once when `from` is the value', async () => {
    await mount({ value: 5, from: 5 })

    expect(digits()).toBe('5')
  })

  it('counts down after a Correction lowers the number', async () => {
    await mount({ value: 3, from: 8 })

    expect(digits()).toBe('8')
    await run(700)
    expect(digits()).toBe('3')
  })

  it('restarts from the new `from` when `value` and `from` change mid-count', async () => {
    await mount({ value: 8, from: 3 })
    await run(300)

    await page!.setProps({ value: 12, from: 8 })
    await nextTick()
    expect(digits()).toBe('8')
    await run(700)
    expect(digits()).toBe('12')
  })

  it('jumps under reduced motion', async () => {
    motion('reduced')
    await mount({ value: 8, from: 3 })

    expect(digits()).toBe('8')
    expect((await run(700)).filter(text => text !== '8')).toEqual([])
  })

  it('stops the frame loop when it unmounts: no write after', async () => {
    await mount({ value: 8, from: 3 })
    await run(100)
    const frames = vi.getTimerCount()
    expect(frames).toBeGreaterThan(0)

    page!.unmount()
    page = undefined

    expect(vi.getTimerCount()).toBe(0)
  })
})
