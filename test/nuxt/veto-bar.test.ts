import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import VetoBar from '~/components/VetoBar.vue'
import { clockTick, revealTile, sealStamp, vetoStamp } from '~/utils/motion'
import type { BoardTeam } from '~~/shared/event'
import type { OwnVetoView, SpinView, VetoDrawView, VetoView, WheelView } from '~~/shared/stage'
import { windowMsFor } from '../draw-offsets'

// The Veto bar (review 0.7, F4; reference App Spielrunde „Clip + Veto-Fenster“, „Eigenes Veto versiegelt“): the Veto window's hold
// button in a fixed layer, for a Player of a Party while the window is open. And the window's motion (04-motion § Veto window), whose
// easings and durations the standard asks every animation to pin (CODING_STANDARDS § Motion).

const STOP = Date.parse('2090-10-30T20:00:10.000Z')
// A game with the default 30 s clip: its window lasts a minute (#505).
const END = STOP + windowMsFor(30)
const iso = (ms: number) => new Date(ms).toISOString()
const halo = { id: 'g1', name: 'Halo', imageUrl: null, youtubeId: null, clipStart: 0, clipLength: 30, playersMin: 2, playersMax: 4, suitabilities: [], price: null }
const teams: BoardTeam[] = [{ position: 1, name: null }, { position: 2, name: null }]
const spin: SpinView = { roundId: 'r1', drawId: 'd1', spinStartAt: iso(STOP - 6000), stopAt: iso(STOP), slices: 4, resultIndex: 0, resultOffset: 0.5, labels: null, game: halo, current: true }
const windowOf = (fields: Partial<VetoDrawView> = {}): VetoDrawView => ({ drawId: 'd1', kind: 'spin', stopAt: iso(STOP), vetoEndsAt: iso(END), game: halo, ...fields })
const own = (fields: Partial<OwnVetoView> = {}): OwnVetoView => ({ team: 1, cast: false, rejection: null, ...fields })
const wheelOf = (vetoes: Partial<VetoView> = {}): WheelView => ({ count: 3, slices: null, spin, vetoes: { left: [2, 2], own: own(), revealed: null, draw: windowOf(), ...vetoes } })

let serverMs = STOP
let page: Awaited<ReturnType<typeof mountSuspended>> | undefined

async function mount(wheel: WheelView, props: { cast?: (drawId: string) => Promise<boolean>, solo?: boolean, teams?: BoardTeam[] } = {}) {
  page = await mountSuspended(VetoBar, { props: { wheel, teams, serverNow: () => serverMs, cast: () => Promise.resolve(true), ...props } })
  await vi.advanceTimersByTimeAsync(300)
  await flushPromises()
  return page
}
const text = () => page!.text().replace(/\s+/g, ' ')
const bar = () => page!.find('[data-testid="veto-bar"]')

beforeEach(() => {
  vi.useFakeTimers()
  serverMs = STOP
})

afterEach(() => {
  page?.unmount()
  page = undefined
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('who gets the bar and when', () => {
  it('shows a Player of a Party the bar while the window is open: the time as m:ss, the Party\'s Vetoes and the hold button', async () => {
    serverMs = STOP + 15_000
    await mount(wheelOf({ left: [2, 1] }))

    expect(bar().exists()).toBe(true)
    expect(page!.get('[role="timer"]').text()).toBe('0:45')
    expect(text()).toContain('Veto-Zeit')
    expect(text()).toContain('Euer Team: 2 Vetos übrig')
    expect(text()).toContain('Gedrückt halten, um zu bestätigen. Kann nicht zurückgenommen werden.')
    expect(page!.find('[data-testid="veto-hold"]').exists()).toBe(true)
  })

  it('rises in from the bottom over 0.36 s ease-out and leaves with the fade of the clip, in the layer above the clip', async () => {
    await mount(wheelOf())

    const transition = page!.findComponent({ name: 'Transition' })
    // animate-veto-in is cp-veto-in (translateY 100% to 0) over --cp-dur-slow with --cp-ease-out, and a fade twin under reduced motion.
    expect(transition.props('enterActiveClass')).toBe('animate-veto-in')
    expect(transition.props('leaveActiveClass')).toBe('transition-opacity dur-base ease-in')
    expect(transition.props('leaveToClass')).toBe('opacity-0')
    expect(bar().classes()).toEqual(expect.arrayContaining(['fixed', 'layer-veto']))
  })

  it('sits above the Host dock when one is on the page, and near the bottom otherwise', async () => {
    await mount(wheelOf())
    expect(bar().classes()).toEqual(expect.arrayContaining(['bottom-[90px]', 'md:bottom-5']))
    page!.unmount()

    const leave = await useNuxtApp().runWithContext(() => useHostDock().attach())
    await mount(wheelOf())
    expect(bar().classes()).toEqual(expect.arrayContaining(['bottom-[162px]', 'md:bottom-[100px]']))
    leave()
  })

  it.each([
    ['ready', {}, 0],
    ['cast', { own: own({ cast: true, rejection: 'veto_already_cast' }) }, 1000],
    ['no Veto left', { left: [0, 2] as [number, number], own: own({ rejection: 'no_vetoes_left' }) }, 1000],
  ])('is the right column beside the Clip on a phone held sideways, %s (#550)', async (_state, vetoes, after) => {
    serverMs = STOP + after
    await mount(wheelOf(vetoes))

    expect(bar().classes()).toEqual(expect.arrayContaining(['sideways:right-2.5', 'sideways:left-auto', 'sideways:w-(--cp-veto-side-w)']))
    expect(bar().classes()).toEqual(expect.arrayContaining(['bottom-[90px]', 'md:bottom-5', 'left-2.5', 'right-2.5']))
  })

  it('keeps the hint in the page for assistive technology, only out of sight when held sideways (#550)', async () => {
    await mount(wheelOf())

    const hint = bar().findAll('span').find(span => span.text().startsWith('Gedrückt halten'))
    expect(hint).toBeDefined()
    expect(hint!.classes()).toContain('sideways:sr-only')
  })

  it('tells the page whether it covers the bottom', async () => {
    await mount(wheelOf())
    expect(page!.emitted('shown')?.at(-1)).toEqual([true])
    page!.unmount()

    await mount(wheelOf({ own: null }))
    expect(page!.emitted('shown')?.at(-1)).toEqual([false])
  })

  it('gives the Stands and a Host outside the teams no bar: they have no own Party', async () => {
    await mount(wheelOf({ own: null }))

    expect(bar().exists()).toBe(false)
    expect(page!.find('button').exists()).toBe(false)
  })

  // #506: a skip of the Clip moves the end earlier. The clock decides, not the stale `own.rejection` of a read taken just before.
  it('leaves at the moved end, and does not invite a cast the server would refuse', async () => {
    serverMs = STOP + 50_000
    await mount(wheelOf({ draw: windowOf({ vetoEndsAt: iso(STOP + 150_000) }) }))
    expect(bar().exists()).toBe(true)
    expect(page!.get('[role="timer"]').text()).toBe('1:40')

    await page!.setProps({ wheel: wheelOf({ draw: windowOf({ vetoEndsAt: iso(STOP + 40_000) }), own: own({ rejection: null }) }) })
    await vi.advanceTimersByTimeAsync(16)

    expect(bar().exists()).toBe(false)
  })

  it('shows no bar before the stop, nor from the end of the window on', async () => {
    serverMs = STOP - 1000
    await mount(wheelOf({ own: own({ rejection: 'veto_window_closed' }) }))
    expect(bar().exists()).toBe(false)
    page!.unmount()

    serverMs = END + 100
    await mount(wheelOf({ own: own({ rejection: 'veto_window_closed' }), revealed: [] }))
    expect(bar().exists()).toBe(false)
  })

  it('shows no bar when no Session runs any more (the read says so in the Party\'s rejection)', async () => {
    serverMs = STOP + 1000
    await mount(wheelOf({ own: own({ rejection: 'no_running_session' }) }))

    expect(bar().exists()).toBe(false)
  })

  it('tells the sealed Veto by Party, the same to the caster and to a teammate: the pill is locked, with the seal stamp (#355)', async () => {
    serverMs = STOP + 1000
    await mount(wheelOf({ own: own({ cast: true, rejection: 'veto_already_cast' }) }))

    expect(text()).toContain('Team Rot hat schon ein Veto eingelegt')
    expect(text()).toContain('Ein Veto pro Team und Spiel. Die anderen sehen es erst beim Aufdecken.')
    expect(page!.get('[data-testid="veto-seal"]').text()).toBe('Versiegelt')
    expect(page!.find('[data-testid="veto-hold"]').exists()).toBe(false)
  })

  it('lets the button column take the locked pill\'s width at the desktop width, label and stamp side by side (#218)', async () => {
    serverMs = STOP + 1000
    await mount(wheelOf({ own: own({ cast: true, rejection: 'veto_already_cast' }) }))

    // The column is the bar's last child. A fixed desktop width cut the pill's label to „Vet…“ under the stamp.
    const column = bar().element.lastElementChild as HTMLElement
    expect(column.className).not.toMatch(/(^|\s)md:w-\[260px\]/)
    expect(column.querySelector('[data-testid="veto-locked"]')?.textContent).toContain('Veto ist drin')
    expect(column.querySelector('[data-testid="veto-seal"]')?.textContent).toBe('Versiegelt')
  })

  it('keeps the hold button at its 260 px minimum at the desktop width in the ready state (#218)', async () => {
    await mount(wheelOf())

    const column = bar().element.lastElementChild as HTMLElement
    expect(column.querySelector('[data-testid="veto-hold"]')).not.toBeNull()
    expect(column.className).toContain('md:min-w-[260px]')
    expect(column.className).not.toMatch(/(^|\s)md:w-\[260px\]/)
  })

  it('names the Party by its Team name in the lock, also for a Party of one (#355)', async () => {
    serverMs = STOP + 1000
    const named: BoardTeam[] = [{ position: 1, name: 'Wilde Gurken' }, teams[1]!]
    await mount(wheelOf({ own: own({ cast: true, rejection: 'veto_already_cast' }) }), { teams: named, solo: true })

    expect(text()).toContain('Wilde Gurken hat schon ein Veto eingelegt')
  })

  it('shows the hold button and the Party\'s Vetoes left, not the lock, while the Party has not cast (#355)', async () => {
    serverMs = STOP + 1000
    await mount(wheelOf({ own: own({ cast: false }) }))

    expect(text()).not.toContain('hat schon ein Veto eingelegt')
    expect(page!.find('[data-testid="veto-locked"]').exists()).toBe(false)
  })

  it('says that no Veto is left, with the button disabled', async () => {
    serverMs = STOP + 1000
    await mount(wheelOf({ left: [0, 2], own: own({ rejection: 'no_vetoes_left' }) }))

    expect(text()).toContain('Euer Team: kein Veto mehr')
    expect(page!.get('[data-testid="veto-hold"] button, button').attributes('aria-disabled')).toBe('true')
  })

  it('speaks to a single Player as „du“ when a Party is one Player', async () => {
    serverMs = STOP + 1000
    await mount(wheelOf({ left: [1, 2] }), { solo: true })
    expect(text()).toContain('Du hast noch 1 Veto')
    expect(text()).not.toContain('Euer Team')
    page!.unmount()

    await mount(wheelOf({ left: [0, 2], own: own({ rejection: 'no_vetoes_left' }) }), { solo: true })
    expect(text()).toContain('Du hast kein Veto mehr')
  })

  it('shows the clock of a window of 150 s as 2:30 at the stop (#505)', async () => {
    serverMs = STOP
    await mount(wheelOf({ draw: windowOf({ vetoEndsAt: iso(STOP + 150_000) }) }))

    expect(page!.get('[role="timer"]').text()).toBe('2:30')
  })

  it('turns the last ten seconds red', async () => {
    serverMs = END - 9000
    await mount(wheelOf())

    expect(page!.get('[role="timer"]').classes()).toContain('text-error-fg')
    expect(page!.get('[role="timer"]').text()).toBe('0:09')
  })

  it('casts on the draw of the window, not on the latest spin (#232)', async () => {
    serverMs = STOP + 1000
    const cast = vi.fn((_drawId: string) => Promise.resolve(true))
    await mount(wheelOf({ draw: windowOf({ drawId: 'set-draw', kind: 'set' }) }), { cast })

    await page!.get('button').trigger('pointerdown')
    await vi.advanceTimersByTimeAsync(1000)

    expect(cast).toHaveBeenCalledWith('set-draw')
  })
})

describe('the window\'s motion (04-motion § Veto window)', () => {
  let animate: ReturnType<typeof vi.fn>
  const original = Element.prototype.animate
  const POP = 'cubic-bezier(.34,1.56,.64,1)'
  const OUT = 'cubic-bezier(.16,1,.3,1)'
  const SNAP = 'cubic-bezier(.2,0,0,1)'

  /** The page's motion setting, as the tokens put it in `--cp-motion`; the easings fall back to the helpers' own curves. */
  function motion(value: 'full' | 'reduced') {
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({ getPropertyValue: (name: string) => (name === '--cp-motion' ? value : '') } as CSSStyleDeclaration)
  }
  const options = () => animate.mock.calls[0]![1] as KeyframeAnimationOptions

  beforeEach(() => {
    animate = vi.fn()
    Element.prototype.animate = animate as unknown as typeof Element.prototype.animate
    motion('full')
  })

  afterEach(() => {
    Element.prototype.animate = original
  })

  it('stamps the seal with 0.3 s of the pop curve', () => {
    sealStamp(document.createElement('div'))

    expect(options()).toMatchObject({ duration: 300, easing: POP })
  })

  it('turns each tile in 0.42 s of the out curve, 0.08 s after the one before', () => {
    revealTile(document.createElement('div'), 0)
    revealTile(document.createElement('div'), 3)

    expect(animate.mock.calls[0]![1]).toMatchObject({ duration: 420, delay: 0, easing: OUT })
    expect(animate.mock.calls[1]![1]).toMatchObject({ duration: 420, delay: 240, easing: OUT })
  })

  it('stamps „VETO“ in 0.52 s, 0.3 s after the tiles start', () => {
    vetoStamp(document.createElement('div'))

    expect(options()).toMatchObject({ duration: 520, delay: 300, easing: OUT })
  })

  it('ticks the clock for 0.26 s of the snap curve', () => {
    clockTick(document.createElement('div'))

    expect(options()).toMatchObject({ duration: 260, easing: SNAP })
  })

  it('shows every one of them at the same moment as a 0.2 s fade under reduced motion, and does not tick', () => {
    motion('reduced')

    sealStamp(document.createElement('div'))
    revealTile(document.createElement('div'), 3)
    vetoStamp(document.createElement('div'))
    clockTick(document.createElement('div'))

    expect(animate).toHaveBeenCalledTimes(3)
    for (const [keyframes, fade] of animate.mock.calls as [Keyframe[], KeyframeAnimationOptions][]) {
      expect(keyframes).toEqual([{ opacity: 0 }, { opacity: 1 }])
      expect(fade.duration).toBe(200)
      expect(fade.delay ?? 0).toBe(0)
    }
  })
})
