import { mountSuspended } from '@nuxt/test-utils/runtime'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import EventCountdown from '~/components/EventCountdown.vue'
import type { CountdownView } from '~~/shared/stage'
import { stubInView } from './in-view'
import { motion } from './motion'

// The Countdown card's look and motion (#340, 13-countdown, 04-motion § Countdown): the four states, the keyed state of the last ten
// seconds, the tick and the zero burst (each only for a viewer who was there), reduced motion, and what the screen reader hears.
// The server clock is a fake the test moves; `Element.animate` is a stub that records what each element was asked to do.

const T0 = Date.parse('2090-10-30T20:00:00.000Z')
const DURATION = 300_000
const POP = 'cubic-bezier(.34,1.56,.64,1)'
const OUT = 'cubic-bezier(.16,1,.3,1)'
const IN = 'cubic-bezier(.7,0,.84,0)'
const SNAP = 'cubic-bezier(.2,0,0,1)'

let serverTime = T0
const serverNow = vi.fn(() => serverTime)
type Command = (action: 'start' | 'pause' | 'reset') => Promise<boolean>
let command: ReturnType<typeof vi.fn<Command>>
let mounted: Awaited<ReturnType<typeof mountSuspended>> | undefined

interface Call { el: Element, keyframes: Keyframe[], options: KeyframeAnimationOptions, anim: { currentTime: number } }
let calls: Call[]
const realAnimate = Element.prototype.animate

/** A running Countdown of `durationMs` with `leftMs` left; the server clock is set to match. */
function runningWith(leftMs: number, durationMs = DURATION): CountdownView {
  serverTime = T0 + durationMs - leftMs
  return { durationMs, remainingMs: durationMs, startedAt: new Date(T0).toISOString() }
}
const READY: CountdownView = { durationMs: DURATION, remainingMs: DURATION, startedAt: null }
const pausedAt = (remainingMs: number): CountdownView => ({ durationMs: DURATION, remainingMs, startedAt: null })
const DONE: CountdownView = { durationMs: DURATION, remainingMs: 0, startedAt: null }

async function mount(countdown: CountdownView, options: { isHost?: boolean, hostName?: string, attachTo?: HTMLElement, announceSet?: boolean } = {}) {
  mounted = await mountSuspended(EventCountdown, {
    props: { countdown, serverNow, isHost: options.isHost ?? true, command, hostName: options.hostName, announceSet: options.announceSet },
    attachTo: options.attachTo,
  })
  return mounted
}
type Page = NonNullable<typeof mounted>

/** Moves the server's clock by `ms` and lets the next animation frame run. */
async function passTime(ms: number) {
  serverTime += ms
  vi.advanceTimersByTime(20)
  await nextTick()
}

const tile = (p: Page) => p.get('[data-testid="countdown-tile"]')
const digits = (p: Page) => p.get('[data-testid="countdown-digits"]')
const timeOf = (p: Page) => p.get('[data-testid="countdown-time"]').text()
const pill = (p: Page) => p.get('[data-testid="countdown-pill"]').text()
const status = (p: Page) => p.get('[role="status"]').text()
const timer = (p: Page) => p.get('[role="timer"]').text()
const labels = (p: Page) => p.findAll('button').map((b: { text: () => string }) => b.text())
const litPips = (p: Page) => p.findAll('[data-pip][data-lit="true"]').length
const scaleOf = (p: Page) => Number(/scale\(([\d.]+)\)/.exec((digits(p).element as HTMLElement).style.transform)?.[1])
const burstCalls = () => calls.filter(c => c.options.fill === 'backwards')
const tickCalls = (p: Page) => calls.filter(c => c.el === p.get('[data-cd="pulse"]').element)

/** The table of 13-countdown § What changes per second in the last ten, as literals. */
const SCALE = [1, 1.035, 1.07, 1.105, 1.14, 1.175, 1.21, 1.245, 1.28, 1.315]
const scaleAt = (s: number) => SCALE[10 - s]!

beforeEach(() => {
  serverTime = T0
  serverNow.mockClear()
  command = vi.fn<Command>(() => Promise.resolve(true))
  calls = []
  Element.prototype.animate = function (this: Element, keyframes: Keyframe[], options: KeyframeAnimationOptions) {
    const anim = { currentTime: 0 }
    calls.push({ el: this, keyframes, options, anim })
    return anim
  } as unknown as typeof Element.prototype.animate
  motion('full')
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout', 'clearTimeout', 'Date'] })
  vi.setSystemTime(new Date(T0))
})

afterEach(() => {
  mounted?.unmount()
  mounted = undefined
  Element.prototype.animate = realAnimate
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('the four states', () => {
  it('ready: pill „Bereit“, a solid border, the full time, one button', async () => {
    const page = await mount(READY)

    expect(pill(page)).toBe('Bereit')
    expect(tile(page).classes()).toContain('bg-paper-2')
    expect(tile(page).classes()).toContain('border-solid')
    expect(timeOf(page)).toBe('5:00')
    expect(labels(page)).toEqual(['Starten'])
  })

  it('running: pill „Läuft“ and the primary tile', async () => {
    const page = await mount(runningWith(224_600))

    expect(pill(page)).toBe('Läuft')
    expect(tile(page).classes()).toContain('bg-primary')
    expect(tile(page).classes()).toContain('border-solid')
    expect(timeOf(page)).toBe('3:45')
    expect(labels(page)).toEqual(['Pausieren'])
  })

  it('paused: pill „Pausiert“, a dashed border, the badge, two buttons', async () => {
    const page = await mount(pausedAt(130_000))

    expect(pill(page)).toBe('Pausiert')
    expect(tile(page).classes()).toContain('border-dashed')
    expect(tile(page).classes()).toContain('bg-paper-2')
    expect(page.find('[data-cd="badge"]').exists()).toBe(true)
    expect(timeOf(page)).toBe('2:10')
    expect(labels(page)).toEqual(['Fortsetzen', 'Zurücksetzen'])
  })

  it('done: pill „Zeit ist um“, the error tile, the stamp, a reset button', async () => {
    const page = await mount(DONE)

    expect(pill(page)).toBe('Zeit ist um')
    expect(tile(page).classes()).toContain('bg-error')
    expect(page.get('[data-cd="stamp"]').text()).toBe('Zeit ist um')
    expect(timeOf(page)).toBe('0:00')
    expect(labels(page)).toEqual(['Zurücksetzen'])
  })

  it('shows no stamp and no badge in the other states', async () => {
    const page = await mount(runningWith(224_600))

    expect(page.find('[data-cd="stamp"]').exists()).toBe(false)
    expect(page.find('[data-cd="badge"]').exists()).toBe(false)
  })

  it('a Member has no buttons in any state, and the lines name the Host', async () => {
    const lines: [CountdownView, string][] = [
      [READY, 'Gestellt auf 5:00. Sanne startet ihn.'],
      [runningWith(224_600), 'Gestellt auf 5:00'],
      [pausedAt(130_000), 'Sanne hat angehalten, bei 2:10 geht’s weiter.'],
      [DONE, 'Bleibt stehen, bis Sanne zurücksetzt.'],
    ]
    for (const [countdown, line] of lines) {
      const page = await mount(countdown, { isHost: false, hostName: 'Sanne' })

      expect(page.findAll('button')).toHaveLength(0)
      expect(page.get('[data-testid="countdown-meta"]').text()).toBe(line)
      page.unmount()
    }
    mounted = undefined
  })

  it('the Host\'s lines speak to the Host', async () => {
    const lines: [CountdownView, string][] = [
      [READY, 'Gestellt auf 5:00. Starte, wenn alle bereit sind.'],
      [pausedAt(130_000), 'Angehalten. „Fortsetzen“ macht bei 2:10 weiter.'],
      [DONE, 'Bleibt stehen, bis du zurücksetzt.'],
    ]
    for (const [countdown, line] of lines) {
      const page = await mount(countdown)

      expect(page.get('[data-testid="countdown-meta"]').text()).toBe(line)
      page.unmount()
    }
    mounted = undefined
  })

  it('falls back to „Der Host“ when the Host\'s name is not given', async () => {
    const page = await mount(READY, { isHost: false })

    expect(page.get('[data-testid="countdown-meta"]').text()).toBe('Gestellt auf 5:00. Der Host startet ihn.')
  })
})

describe('the state of the last ten seconds, keyed to the second (late joiners)', () => {
  for (let s = 10; s >= 1; s--) {
    it(`a viewer who mounts with ${s} s left gets the ${s} row at once`, async () => {
      const page = await mount(runningWith(s * 1000 - 500))

      expect(timeOf(page)).toBe(String(s))
      expect(scaleOf(page)).toBeCloseTo(scaleAt(s), 3)
      expect(litPips(page)).toBe(s)
      expect(page.findAll('[data-pip]')).toHaveLength(10)
      expect(tile(page).classes()).toContain(s >= 6 ? 'bg-warning' : 'bg-error')
      expect(page.find('[data-cd="fill"]').exists()).toBe(false)
    })
  }

  it('at 0:07 it is the 7 row, with no stamp and no burst', async () => {
    const page = await mount(runningWith(6400))

    expect(timeOf(page)).toBe('7')
    expect(scaleOf(page)).toBeCloseTo(1.105, 3)
    expect(litPips(page)).toBe(7)
    expect(tile(page).classes()).toContain('bg-warning')
    expect(page.find('[data-cd="stamp"]').exists()).toBe(false)
    expect(burstCalls()).toHaveLength(0)
  })

  it('follows the table second by second, and the bar turns into pips at 11 to 10', async () => {
    const page = await mount(runningWith(10_500))
    expect(timeOf(page)).toBe('0:11')
    expect(page.find('[data-cd="fill"]').exists()).toBe(true)
    expect(page.findAll('[data-pip]')).toHaveLength(0)
    expect(tile(page).classes()).toContain('bg-primary')

    for (let s = 10; s >= 1; s--) {
      await passTime(1000)

      expect(timeOf(page)).toBe(String(s))
      expect(scaleOf(page)).toBeCloseTo(scaleAt(s), 3)
      expect(litPips(page)).toBe(s)
      expect(tile(page).classes()).toContain(s >= 6 ? 'bg-warning' : 'bg-error')
      expect(page.find('[data-cd="fill"]').exists()).toBe(false)
    }
  })

  it('paused inside the last ten holds the second: pips and scale stay, the digits carry the colour, the tile is paper', async () => {
    const seven = await mount(pausedAt(6400))
    expect(timeOf(seven)).toBe('7')
    expect(litPips(seven)).toBe(7)
    expect(scaleOf(seven)).toBeCloseTo(1.105, 3)
    expect(tile(seven).classes()).toContain('bg-paper-2')
    expect(tile(seven).classes()).toContain('text-warning-fg')
    seven.unmount()

    const three = await mount(pausedAt(2400))
    expect(timeOf(three)).toBe('3')
    expect(litPips(three)).toBe(3)
    expect(tile(three).classes()).toContain('text-error-fg')
  })

  it('shows the bar as the share left while running above ten seconds', async () => {
    const page = await mount(runningWith(150_000))

    expect(page.get('[data-cd="fill"]').attributes('style')).toContain('width: 50%')
  })

  it('shows no pip lit at zero', async () => {
    const page = await mount(DONE)

    expect(page.findAll('[data-pip]')).toHaveLength(10)
    expect(litPips(page)).toBe(0)
  })
})

describe('the tick on each second of the last ten (04-motion § Countdown)', () => {
  it('pulses the digits once per boundary, sought to the time already spent in the second', async () => {
    const page = await mount(runningWith(10_500))

    await passTime(580)

    const ticks = tickCalls(page)
    expect(ticks).toHaveLength(1)
    expect(ticks[0]!.keyframes).toEqual([
      { transform: 'scale(1)', easing: POP },
      { transform: 'scale(1.14)', offset: 0.5, easing: POP },
      { transform: 'scale(1)' },
    ])
    expect(ticks[0]!.options).toMatchObject({ duration: 220 })
    expect(ticks[0]!.anim.currentTime).toBe(80)
  })

  it('ticks every boundary down to the last second', async () => {
    const page = await mount(runningWith(10_100))

    await passTime(200)
    await passTime(1000)
    await passTime(1000)

    expect(timeOf(page)).toBe('8')
    expect(tickCalls(page).map(c => c.anim.currentTime)).toEqual([100, 100, 100])
  })

  it('skips a boundary seen 300 ms late: the steady frame is already right', async () => {
    const page = await mount(runningWith(10_500))

    await passTime(800)

    expect(timeOf(page)).toBe('10')
    expect(tickCalls(page)).toHaveLength(0)
  })

  it('does not tick above ten seconds', async () => {
    const page = await mount(runningWith(20_500))

    await passTime(1000)
    await passTime(1000)

    expect(timeOf(page)).toBe('0:19')
    expect(calls).toHaveLength(0)
  })

  it('does not tick while paused', async () => {
    const page = await mount(runningWith(7500))
    await page.setProps({ countdown: pausedAt(7500) })
    calls = []

    await passTime(1000)
    await passTime(1000)

    expect(calls).toHaveLength(0)
  })
})

describe('the zero burst (04-motion § Countdown)', () => {
  const stamp = (p: Page) => p.get('[data-cd="stamp"]')

  it('plays the seven tracks, each sought to the time since the end, for a viewer who saw the last second', async () => {
    const page = await mount(runningWith(1800))
    await passTime(1000)
    await passTime(900)

    expect(stamp(page).exists()).toBe(true)
    const burst = burstCalls()
    expect(burst.map(c => c.el)).toEqual([
      page.get('[data-cd="ghost"]').element,
      tile(page).element,
      page.get('[data-cd="ringA"]').element,
      page.get('[data-cd="ringB"]').element,
      digits(page).element,
      stamp(page).element,
      page.element,
    ])
    expect(burst.map(c => c.options.delay)).toEqual([0, 0, 0, 160, 80, 200, 200])
    expect(burst.map(c => c.options.duration)).toEqual([140, 360, 600, 600, 220, 360, 220])
    expect(burst.map(c => c.options.easing)).toEqual([IN, OUT, OUT, OUT, OUT, POP, SNAP])
    expect(burst.map(c => c.anim.currentTime)).toEqual(Array(7).fill(100))
  })

  it('animates the values of the table', async () => {
    const page = await mount(runningWith(1800))
    await passTime(1000)
    await passTime(900)

    const [ghost, thump, ringA, ringB, zero, stampCall, cardCall] = burstCalls()
    expect(ghost!.keyframes).toEqual([{ transform: 'scale(1.315)', opacity: 1 }, { transform: 'scale(1.644)', opacity: 0 }])
    expect(thump!.keyframes).toEqual([{ transform: 'scale(1)', offset: 0 }, { transform: 'scale(1.06)', offset: 0.4 }, { transform: 'scale(1)', offset: 1 }])
    expect(ringA!.keyframes).toEqual([{ transform: 'scale(1, 1)', opacity: 1 }, { transform: 'scale(1.12, 1.4)', opacity: 0 }])
    expect(ringB!.keyframes).toEqual(ringA!.keyframes)
    expect(zero!.keyframes).toEqual([{ transform: 'scale(1.4)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }])
    expect(stampCall!.keyframes).toEqual([
      { transform: 'translate(-50%, -50%) rotate(-14deg) scale(2.4)', opacity: 0 },
      { transform: 'translate(-50%, -50%) rotate(-6deg) scale(1)', opacity: 1 },
    ])
    expect(cardCall!.keyframes).toEqual([{ boxShadow: 'var(--cp-shadow-card)' }, { boxShadow: '6px 6px 0 var(--cp-error)' }])
    expect(page.exists()).toBe(true)
  })

  it('ends on the steady done view: the stamp at -6 degrees, the error shadow, 0:00', async () => {
    const page = await mount(runningWith(1800))
    await passTime(1000)
    await passTime(900)

    const steady = await mount(DONE)
    for (const view of [page, steady]) {
      expect((stamp(view).element as HTMLElement).style.transform).toBe('translate(-50%, -50%) rotate(-6deg)')
      expect(view.element.className).toContain('shadow-[6px_6px_0_var(--cp-error)]')
      expect(timeOf(view)).toBe('0:00')
    }
    expect(burstCalls().at(5)!.keyframes.at(-1)!.transform).toBe('translate(-50%, -50%) rotate(-6deg) scale(1)')
    page.unmount()
  })

  it('plays nothing for a viewer who opened the page after zero: the steady view is on screen', async () => {
    serverTime = T0 + DURATION + 200
    const page = await mount({ durationMs: DURATION, remainingMs: DURATION, startedAt: new Date(T0).toISOString() })

    expect(stamp(page).exists()).toBe(true)
    expect(timeOf(page)).toBe('0:00')
    expect(tile(page).classes()).toContain('bg-error')
    expect(burstCalls()).toHaveLength(0)
  })

  it('plays nothing for one who opened it five seconds after zero', async () => {
    serverTime = T0 + DURATION + 5000
    const page = await mount({ durationMs: DURATION, remainingMs: DURATION, startedAt: new Date(T0).toISOString() })

    expect(stamp(page).exists()).toBe(true)
    expect(burstCalls()).toHaveLength(0)
  })

  it('plays nothing for a card scrolled out of view through the last second', async () => {
    const view = stubInView()
    const page = await mount(runningWith(3500))

    view.see(false)
    await passTime(3300)
    await passTime(600)
    view.see(true)
    await nextTick()

    expect(timeOf(page)).toBe('0:00')
    expect(stamp(page).exists()).toBe(true)
    expect(burstCalls()).toHaveLength(0)
  })

  it('seeks in when the frame lands 500 ms after zero, and plays nothing at 800 ms', async () => {
    const early = await mount(runningWith(1800))
    await passTime(1000)
    await passTime(1300)
    expect(burstCalls()).toHaveLength(7)
    expect(burstCalls().every(c => Math.abs(c.anim.currentTime - 500) < 1)).toBe(true)
    early.unmount()

    calls = []
    const late = await mount(runningWith(1800))
    await passTime(1000)
    await passTime(1600)
    expect(stamp(late).exists()).toBe(true)
    expect(burstCalls()).toHaveLength(0)
  })

  it('forgets the last second when the Host resets, so a Countdown found past its end afterwards plays nothing', async () => {
    const page = await mount(runningWith(1800))
    await passTime(1000)
    await passTime(900)
    expect(burstCalls()).toHaveLength(7)

    await page.setProps({ countdown: READY })
    calls = []
    serverTime = T0
    await page.setProps({ countdown: { durationMs: DURATION, remainingMs: DURATION, startedAt: new Date(serverTime - DURATION - 100).toISOString() } })

    expect(burstCalls()).toHaveLength(0)
  })
})

describe('reduced motion (04-motion § Countdown)', () => {
  beforeEach(() => motion('reduced'))

  for (const s of [10, 7, 5, 1]) {
    it(`still keys the ${s} row: colour, scale and pips, set at once`, async () => {
      const page = await mount(runningWith(s * 1000 - 500))

      expect(timeOf(page)).toBe(String(s))
      expect(scaleOf(page)).toBeCloseTo(scaleAt(s), 3)
      expect(litPips(page)).toBe(s)
      expect(tile(page).classes()).toContain(s >= 6 ? 'bg-warning' : 'bg-error')
    })
  }

  it('animates nothing on a boundary or at zero, and shows the stamp at once', async () => {
    const page = await mount(runningWith(2500))
    await passTime(600)
    await passTime(1000)
    await passTime(1000)

    expect(timeOf(page)).toBe('0:00')
    expect(page.get('[data-cd="stamp"]').exists()).toBe(true)
    expect(tile(page).classes()).toContain('bg-error')
    expect(calls).toHaveLength(0)
  })

  it('writes the same live-region text', async () => {
    await mount(runningWith(11_500))

    await passTime(1500)

    expect(status(mounted!)).toBe('Noch 10 Sekunden.')
  })
})

describe('for the screen reader', () => {
  it('writes nothing on page load for a running card, and the timer says how much is left', async () => {
    const page = await mount(runningWith(224_600))

    expect(status(page)).toBe('')
    expect(timer(page)).toBe('Noch 3 Minuten 45 Sekunden')
    expect(page.get('[data-testid="countdown-digits"]').attributes('aria-hidden')).toBe('true')
  })

  it('the timer reads by state', async () => {
    const paused = await mount(pausedAt(130_000))
    expect(timer(paused)).toBe('Pausiert, noch 2 Minuten 10 Sekunden')
    paused.unmount()
    const ready = await mount(READY)
    expect(timer(ready)).toBe('Countdown gestellt auf 5 Minuten')
    ready.unmount()
    const done = await mount(DONE)
    expect(timer(done)).toBe('Zeit ist um')
  })

  it('writes nothing on page load for a paused or done card', async () => {
    const paused = await mount(pausedAt(130_000))
    expect(status(paused)).toBe('')
    paused.unmount()
    const done = await mount(DONE)
    expect(status(done)).toBe('')
  })

  it('announces a card that appears ready after the page has loaded (the stage says so)', async () => {
    const page = await mount(READY, { announceSet: true })

    expect(status(page)).toBe('Countdown gestellt: 5 Minuten.')
  })

  it('writes nothing for a ready card that was there when the page opened, by load or by navigation (#332)', async () => {
    const page = await mount(READY)

    expect(status(page)).toBe('')
    expect(timer(page)).toBe('Countdown gestellt auf 5 Minuten')
  })

  it('does not write per second', async () => {
    const page = await mount(runningWith(224_600))

    for (let i = 0; i < 10; i++) await passTime(1000)

    expect(status(page)).toBe('')
    expect(timer(page)).toBe('Noch 3 Minuten 35 Sekunden')
  })

  it('writes „Noch 10 Sekunden.“ once on entering the last ten, then nothing until zero, which it announces', async () => {
    const page = await mount(runningWith(11_500))
    await passTime(500)
    expect(status(page)).toBe('')

    await passTime(1000)
    expect(status(page)).toBe('Noch 10 Sekunden.')
    for (let s = 9; s >= 1; s--) {
      await passTime(1000)
      expect(status(page)).toBe('Noch 10 Sekunden.')
    }

    await passTime(1000)
    expect(status(page)).toBe('Zeit ist um.')
    expect(timer(page)).toBe('Zeit ist um')
  })

  it('writes one message per change of the Host: pause, resume, reset', async () => {
    const page = await mount(runningWith(130_000))

    await page.setProps({ countdown: pausedAt(130_000) })
    expect(status(page)).toBe('Countdown pausiert. Noch 2 Minuten 10 Sekunden.')

    await page.setProps({ countdown: { durationMs: DURATION, remainingMs: 130_000, startedAt: new Date(serverTime).toISOString() } })
    expect(status(page)).toBe('Countdown läuft. Noch 2 Minuten 10 Sekunden.')

    await page.setProps({ countdown: READY })
    expect(status(page)).toBe('Countdown zurückgesetzt: 5 Minuten.')
  })

  it('writes the start of a ready card, and its own message only when the start also enters the last ten', async () => {
    const page = await mount({ durationMs: 8000, remainingMs: 8000, startedAt: null }, { announceSet: true })
    expect(status(page)).toBe('Countdown gestellt: 8 Sekunden.')

    await page.setProps({ countdown: { durationMs: 8000, remainingMs: 8000, startedAt: new Date(serverTime).toISOString() } })

    expect(status(page)).toBe('Countdown läuft. Noch 8 Sekunden.')
  })

  it('writes the reset of a card that ran out', async () => {
    const page = await mount(DONE)

    await page.setProps({ countdown: READY })

    expect(status(page)).toBe('Countdown zurückgesetzt: 5 Minuten.')
  })
})

describe('focus after a Host action', () => {
  let host: HTMLElement
  beforeEach(() => {
    host = document.createElement('div')
    document.body.append(host)
  })
  afterEach(() => host.remove())

  const RUNNING = () => runningWith(224_600)
  const flush = async () => {
    await vi.advanceTimersByTimeAsync(0)
    await nextTick()
  }

  it('moves to Pausieren after Starten, once the card is running', async () => {
    const page = await mount(READY, { attachTo: host })
    const start = page.findAll('button')[0]!
    ;(start.element as HTMLElement).focus()

    await start.trigger('click')
    await flush()
    await page.setProps({ countdown: RUNNING() })
    await flush()

    expect(command).toHaveBeenCalledWith('start')
    expect(document.activeElement).toBe(page.findAll('button')[0]!.element)
    expect(labels(page)).toEqual(['Pausieren'])
  })

  it('moves to Starten after Zurücksetzen', async () => {
    const page = await mount(pausedAt(130_000), { attachTo: host })
    const reset = page.findAll('button')[1]!
    ;(reset.element as HTMLElement).focus()

    await reset.trigger('click')
    await flush()
    await page.setProps({ countdown: READY })
    await flush()

    expect(labels(page)).toEqual(['Starten'])
    expect(document.activeElement).toBe(page.findAll('button')[0]!.element)
  })

  it('does not move when the press did not have focus', async () => {
    const page = await mount(READY, { attachTo: host })
    const outside = document.createElement('button')
    host.append(outside)
    outside.focus()

    await page.findAll('button')[0]!.trigger('click')
    await flush()
    await page.setProps({ countdown: RUNNING() })
    await flush()

    expect(document.activeElement).toBe(outside)
  })

  it('does not move when the server did not take the command', async () => {
    command.mockResolvedValue(false)
    const page = await mount(READY, { attachTo: host })
    const start = page.findAll('button')[0]!
    ;(start.element as HTMLElement).focus()

    await start.trigger('click')
    await flush()
    await page.setProps({ countdown: RUNNING() })
    await flush()

    expect(document.activeElement).not.toBe(page.findAll('button')[0]!.element)
  })
})

describe('the card keeps its height', () => {
  it('has the same tile height classes in every state', async () => {
    const states = [READY, runningWith(224_600), runningWith(6400), pausedAt(130_000), DONE]
    const heights = new Set<string>()
    for (const countdown of states) {
      const page = await mount(countdown)
      heights.add(tile(page).classes().filter((c: string) => /^(md:)?h-\[/.test(c)).sort().join(' '))
      page.unmount()
    }
    mounted = undefined

    expect([...heights]).toEqual(['h-[100px] md:h-[132px]'])
  })

  it('gives a Member no button row, and a Host one', async () => {
    const member = await mount(READY, { isHost: false })
    expect(member.find('[data-testid="countdown-actions"]').exists()).toBe(false)
    member.unmount()

    const host = await mount(READY)
    expect(host.find('[data-testid="countdown-actions"]').exists()).toBe(true)
  })
})
