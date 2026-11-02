import { mountSuspended } from '@nuxt/test-utils/runtime'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import EventCountdown from '~/components/EventCountdown.vue'
import type { CountdownView } from '~~/shared/event'

// The Countdown on the stage (#236, spec #218 § Countdown): the time left as mm:ss from the server's clock, every animation frame
// while it runs, „Pausiert“ and „Zeit ist um“, and the Host's controls by state. The server clock is a fake here: the test moves it.

const T0 = Date.parse('2090-10-30T20:00:00.000Z')
const START = new Date(T0).toISOString()
const MINUTE: CountdownView = { durationMs: 60_000, remainingMs: 60_000, startedAt: START }

let serverTime = T0
const serverNow = vi.fn(() => serverTime)

type Command = (action: 'start' | 'pause' | 'reset') => Promise<boolean>
let command: ReturnType<typeof vi.fn<Command>>

let mounted: Awaited<ReturnType<typeof mountSuspended>> | undefined

async function mount(countdown: CountdownView, isHost = true) {
  mounted = await mountSuspended(EventCountdown, { props: { countdown, serverNow, isHost, command } })
  return mounted
}

/** Moves the server's clock by `ms` and lets the next animation frame run. */
async function passTime(ms: number) {
  serverTime += ms
  vi.advanceTimersByTime(20)
  await nextTick()
}

const timeOf = (page: NonNullable<typeof mounted>) => page.get('[data-testid="countdown-time"]')
const buttonLabels = (page: NonNullable<typeof mounted>) => page.findAll('button').map((button: { text: () => string }) => button.text())

beforeEach(() => {
  serverTime = T0
  serverNow.mockClear()
  command = vi.fn<Command>(() => Promise.resolve(true))
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout', 'clearTimeout', 'Date'] })
  vi.setSystemTime(new Date(T0))
})

afterEach(() => {
  mounted?.unmount()
  mounted = undefined
  vi.useRealTimers()
})

describe('the time left while it runs', () => {
  it('shows the time left as mm:ss, from the server clock', async () => {
    const page = await mount(MINUTE)

    expect(timeOf(page).text()).toBe('01:00')
    expect(page.get('section').attributes('aria-labelledby')).toBeTruthy()
    expect(page.get('h2').text()).toBe('Countdown')
  })

  it('counts down on every animation frame as the server clock moves', async () => {
    const page = await mount(MINUTE)

    await passTime(10_000)
    expect(timeOf(page).text()).toBe('00:50')

    await passTime(45_000)
    expect(timeOf(page).text()).toBe('00:05')
  })

  it('rounds up to whole seconds: 59.5 s left shows 01:00 (ceil, never a decrement)', async () => {
    const page = await mount(MINUTE)

    await passTime(500)

    expect(timeOf(page).text()).toBe('01:00')
    await passTime(500)
    expect(timeOf(page).text()).toBe('00:59')
  })

  it('takes the time from the server clock, not from the User\'s own clock', async () => {
    vi.setSystemTime(new Date(T0 - 60 * 60_000))

    const page = await mount(MINUTE)

    expect(timeOf(page).text()).toBe('01:00')
    expect(serverNow).toHaveBeenCalled()
  })

  it('late joiners see the time that is left right away', async () => {
    serverTime = T0 + 30_000

    const page = await mount(MINUTE)

    expect(timeOf(page).text()).toBe('00:30')
  })

  it('uses tabular digits so the time does not jump', async () => {
    const page = await mount(MINUTE)

    expect(timeOf(page).classes()).toContain('tabular-nums')
  })

  it('runs no frames while paused: the server clock is not read again', async () => {
    await mount({ durationMs: 60_000, remainingMs: 25_000, startedAt: null })
    const pausedReads = serverNow.mock.calls.length

    await passTime(5_000)

    expect(serverNow.mock.calls.length).toBe(pausedReads)
  })

  it('stops its frames on unmount', async () => {
    const page = await mount(MINUTE)
    page.unmount()
    mounted = undefined
    const unmountedReads = serverNow.mock.calls.length

    await passTime(5_000)

    expect(serverNow.mock.calls.length).toBe(unmountedReads)
  })
})

describe('paused and at zero', () => {
  it('shows the stored remainder and „Pausiert“ while paused, without moving', async () => {
    const page = await mount({ durationMs: 60_000, remainingMs: 25_000, startedAt: null })

    expect(timeOf(page).text()).toBe('00:25')
    expect(page.text()).toContain('Pausiert')

    await passTime(10_000)
    expect(timeOf(page).text()).toBe('00:25')
  })

  it('shows „Zeit ist um“ at zero, and keeps it there', async () => {
    const page = await mount(MINUTE)

    await passTime(61_000)

    expect(timeOf(page).text()).toBe('00:00')
    expect(page.text()).toContain('Zeit ist um')
    await passTime(30_000)
    expect(page.text()).toContain('Zeit ist um')
  })

  it('shows the full duration while ready, without „Pausiert“ or „Zeit ist um“', async () => {
    const page = await mount({ durationMs: 300_000, remainingMs: 300_000, startedAt: null })

    expect(timeOf(page).text()).toBe('05:00')
    expect(page.text()).not.toContain('Pausiert')
    expect(page.text()).not.toContain('Zeit ist um')
  })
})

describe('the Host\'s controls, by state', () => {
  it('offers Starten while ready, and nothing else', async () => {
    const page = await mount({ durationMs: 60_000, remainingMs: 60_000, startedAt: null })

    expect(buttonLabels(page)).toEqual(['Starten'])
  })

  it('offers Pausieren while it runs', async () => {
    const page = await mount(MINUTE)

    expect(buttonLabels(page)).toEqual(['Pausieren'])
  })

  it('offers Fortsetzen and Zurücksetzen while paused', async () => {
    const page = await mount({ durationMs: 60_000, remainingMs: 25_000, startedAt: null })

    expect(buttonLabels(page)).toEqual(['Fortsetzen', 'Zurücksetzen'])
  })

  it('offers Zurücksetzen only at zero', async () => {
    const page = await mount(MINUTE)
    await passTime(60_000)

    expect(buttonLabels(page)).toEqual(['Zurücksetzen'])
  })

  it('sends the command of the button that was pressed', async () => {
    const page = await mount(MINUTE)

    await page.findAll('button')[0]!.trigger('click')

    expect(command).toHaveBeenCalledWith('pause')
  })

  it('shows no control to a Member', async () => {
    const page = await mount({ durationMs: 60_000, remainingMs: 25_000, startedAt: null }, false)

    expect(page.findAll('button')).toHaveLength(0)
    expect(timeOf(page).text()).toBe('00:25')
  })
})
