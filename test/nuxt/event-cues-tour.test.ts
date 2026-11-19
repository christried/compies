import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { refreshEvent } from '~/composables/useEventView'
import { NOTICE_SETTLE_MS } from '~/composables/useSoundUnlock'
import EventPage from '~/pages/e/[slug]/index.vue'
import type { CueId } from '~/utils/sound-cues'
import { defaultSettings } from '~~/shared/settings'
import type { WheelView } from '~~/shared/stage'
import { TOUR_VERSION } from '~~/shared/tour'
import { FakeAudioContext } from '../fake-audio'
import { kitty, signInAs } from './auth'
import { context, cueLog, HeldContext, requested, requestedOf, requests, resetRequests, serveCueFiles, setUpCuePage, started, startedOf, tearDownCuePage } from './cue-harness'
import { serve, view, viewWithSessions } from './event-page'
import { FIRST, STARTED } from './event-page-states'

// The Tour's voice on the Event page (#747, spec #718): `cb-hi` at the greeting and `cb-yay` at the end, played through the page's immediate-play
// function each time the step shows, and the two files requested at page load for a Member the Tour may start for. The layer's own calls are in
// tour-layer-cues.test.ts and the group rule in test/unit/tour-cues.test.ts. The audio context is the fake; the calm second is a real one.

const TOUR_FILES = ['cb-hi', 'cb-yay']

serveCueFiles()

/** The log by id and outcome only: a line carries more (`at`, `rate`) that this file does not pin. */
const logOf = (...ids: CueId[]) => cueLog().filter(entry => ids.includes(entry.id)).map(entry => ({ id: entry.id, outcome: entry.outcome }))

const poll = (slug: string, overrides: { isHost?: boolean, phase?: string } = {}) =>
  view(slug, [], { event: { phase: overrides.phase ?? 'poll', isHost: overrides.isHost ?? false }, inviteUrl: overrides.isHost ? null : `https://compies.test/join/${slug}` })
const wheelOf = (): WheelView => ({
  count: 5, slices: ['a', 'b', 'c', 'd', 'e'].map(id => ({ id, name: id })), spin: null, vetoes: { left: [2, 2], own: null, revealed: null, draw: null },
})
/** A Session that runs, with a wheel: the wheel group's read. */
const runningRead = (slug: string) => viewWithSessions(slug, [{ number: null, startsAt: FIRST, startedAt: STARTED }], 0, {
  event: { isHost: false, phase: 'running' }, settings: defaultSettings(), runningSessionId: `session-${slug}-0`, wheel: wheelOf(), clip: null,
})
/** A Session that ended on the page: running Phase, no Session running, no wheel. */
const afterSession = (slug: string) => view(slug, [], { event: { phase: 'running', isHost: false } })

let page: Awaited<ReturnType<typeof mountSuspended>> | undefined
async function mount(slug: string) {
  page = await mountSuspended(EventPage, { route: `/e/${slug}`, attachTo: document.body })
  await flushPromises()
}
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/** The Tour's box: the dialog in the Tour's layer. */
const tour = () => document.querySelector<HTMLElement>('[data-tour-layer] [role="dialog"]')
const tourTitle = () => tour()?.querySelector('h2')?.textContent?.trim()
/** Waits for the Tour to open: the page's calm second is a real one. */
const shown = () => vi.waitFor(() => expect(tour()).not.toBeNull(), { timeout: 4000, interval: 50 })
async function click(label: string) {
  [...tour()!.querySelectorAll('button')].find(element => element.textContent?.trim() === label)!.click()
  await flushPromises()
}
/** Goes on with „Weiter“ to the end step: a Member's run has the head of the page between the greeting and it. */
async function toEnd() {
  while (tourTitle() !== 'Das war’s') await click('Weiter')
}
const notice = () => [...document.querySelectorAll('[role="status"]')].find(element => element.textContent?.includes('Ton aktivieren')) ?? null
/** Time enough for the calm second and a bit more: a Tour that was going to open has opened. */
const pastCalm = async () => {
  await sleep(1400)
  await flushPromises()
}

const ownAnimate = Element.prototype.animate

beforeEach(() => {
  setUpCuePage({ user: { ...kitty, tourSeen: 0 }, staging: true })
  useState('open-layers').value = 0
  // As event-page-tour.test.ts: without `Element.animate` a step changes at once.
  Reflect.deleteProperty(Element.prototype, 'animate')
  Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, get: () => 1024 })
})

afterEach(() => {
  Element.prototype.animate = ownAnimate
  page?.unmount()
  page = undefined
  Reflect.deleteProperty(document.documentElement, 'clientWidth')
  tearDownCuePage()
})

describe('secrecy: the Tour\'s files are a rule of the Member\'s own state', () => {
  it('requests the same two files, and logs the same cues, for two different reads of one Member', async () => {
    const votes = [{ slotId: 'fri', userId: kitty.id, value: 'yes' as const }]
    const first = serve(slug => view(slug, votes, { event: { phase: 'poll', isHost: false }, settings: defaultSettings() }))
    await mount(first.slug)
    await shown()
    await vi.waitFor(() => expect(logOf('cb-hi')).toHaveLength(1))
    const filesOfFirst = requested()
    const logOfFirst = cueLog().map(entry => entry.id)
    page!.unmount()
    resetRequests()
    FakeAudioContext.instances = []

    const second = serve(slug => view(slug, [], { event: { phase: 'poll', isHost: false, startsAt: '2026-10-23T18:00:00.000Z' }, settings: defaultSettings() }))
    await mount(second.slug)
    await shown()
    await vi.waitFor(() => expect(logOf('cb-hi')).toHaveLength(1))

    expect(filesOfFirst).toEqual(TOUR_FILES)
    expect(requested()).toEqual(TOUR_FILES)
    expect(cueLog().map(entry => entry.id)).toEqual(logOfFirst)
    expect(new Set(logOfFirst)).toEqual(new Set(['cb-hi']))
  })
})

describe('the Tour\'s voice for a Member it may start for', () => {
  it('requests both files at page load, chirps at the greeting and cheers at the end, once per showing', async () => {
    await mount(serve(slug => poll(slug)).slug)
    await vi.waitFor(() => expect(requestedOf('tour')).toEqual(TOUR_FILES))
    expect(tour()).toBeNull()

    await shown()
    expect(tourTitle()).toBe('Willkommen!')
    await vi.waitFor(() => expect(startedOf('cb-hi')).toHaveLength(1))
    expect(logOf('cb-hi', 'cb-yay')).toEqual([{ id: 'cb-hi', outcome: 'scheduled' }])

    await toEnd()
    await vi.waitFor(() => expect(startedOf('cb-yay')).toHaveLength(1))
    expect(logOf('cb-hi', 'cb-yay')).toEqual([{ id: 'cb-hi', outcome: 'scheduled' }, { id: 'cb-yay', outcome: 'scheduled' }])

    while (tourTitle() !== 'Willkommen!') await click('Zurück')
    await toEnd()

    await vi.waitFor(() => expect(startedOf('cb-yay')).toHaveLength(2))
    expect(startedOf('cb-hi')).toHaveLength(2)
    expect(logOf('cb-hi', 'cb-yay').map(entry => entry.id)).toEqual(['cb-hi', 'cb-yay', 'cb-hi', 'cb-yay'])
    expect(requestedOf('tour')).toEqual(TOUR_FILES)
    expect(requests['cb-hi']).toBe(1)
    expect(requests['cb-yay']).toBe(1)
  })

  it('plays both cues under reduced motion', async () => {
    document.documentElement.style.setProperty('--cp-motion', 'reduced')
    await mount(serve(slug => poll(slug)).slug)
    await shown()
    await toEnd()

    await vi.waitFor(() => expect(logOf('cb-hi', 'cb-yay')).toEqual([{ id: 'cb-hi', outcome: 'scheduled' }, { id: 'cb-yay', outcome: 'scheduled' }]))
  })

  it('is silent with a suspended context, shows no „Ton aktivieren“ because of the Tour, and sounds at the end once „Weiter“ unlocked the page', async () => {
    vi.stubGlobal('AudioContext', HeldContext)
    await mount(serve(slug => poll(slug)).slug)
    await shown()

    await vi.waitFor(() => expect(logOf('cb-hi')).toEqual([{ id: 'cb-hi', outcome: 'skipped' }]))
    expect(started()).toEqual([])
    await sleep(NOTICE_SETTLE_MS + 100)
    await flushPromises()
    expect(notice()).toBeNull()

    await toEnd()

    await vi.waitFor(() => expect(logOf('cb-yay')).toEqual([{ id: 'cb-yay', outcome: 'scheduled' }]))
    expect(context()!.state).toBe('running')
  })

  it('walks the Tour with Ton off and requests, schedules and logs nothing', async () => {
    localStorage.setItem('compies-sound', 'off')
    await mount(serve(slug => poll(slug)).slug)
    await shown()
    await toEnd()

    expect(tourTitle()).toBe('Das war’s')
    expect(started()).toEqual([])
    expect(cueLog()).toEqual([])
    expect(requested()).toEqual([])
  })
})

describe('nothing of the Tour\'s voice for the others', () => {
  it('requests and plays nothing for a Member who has seen the Tour', async () => {
    signInAs({ ...kitty, tourSeen: TOUR_VERSION })
    await mount(serve(slug => poll(slug)).slug)
    await pastCalm()

    expect(tour()).toBeNull()
    expect(requested()).toEqual([])
    expect(started()).toEqual([])
    expect(cueLog()).toEqual([])
  })

  it('requests no Tour file for a Host, who gets no Tour', async () => {
    await mount(serve(slug => poll(slug, { isHost: true })).slug)
    await pastCalm()

    expect(tour()).toBeNull()
    expect(requestedOf('tour')).toEqual([])
    expect(logOf('cb-hi')).toEqual([])
  })

  it('requests no Tour file for a finished Event', async () => {
    await mount(serve(slug => poll(slug, { phase: 'finished' })).slug)
    await pastCalm()

    expect(tour()).toBeNull()
    expect(requestedOf('tour')).toEqual([])
  })

  it('requests no chirp while a Session runs, and the cheer once with the wheel', async () => {
    await mount(serve(runningRead).slug)
    await vi.waitFor(() => expect(requestedOf('wheel')).toContain('cb-yay'))
    await pastCalm()

    expect(requested()).not.toContain('cb-hi')
    expect(requests['cb-yay']).toBe(1)
  })
})

describe('the cheer is requested once, whichever group asks first', () => {
  it('the Tour first, then a Session with a wheel', async () => {
    const served = serve(slug => poll(slug))
    await mount(served.slug)
    await vi.waitFor(() => expect(requestedOf('tour')).toEqual(TOUR_FILES))

    served.set(runningRead(served.slug))
    await refreshEvent(served.slug)
    await vi.waitFor(() => expect(requestedOf('wheel')).toContain('wheel-stop'))
    await flushPromises()

    expect(requests['cb-yay']).toBe(1)
    expect(requests['cb-hi']).toBe(1)
  })

  it('the wheel first, then the Session ends and the Tour is reachable', async () => {
    const served = serve(runningRead)
    await mount(served.slug)
    await vi.waitFor(() => expect(requestedOf('wheel')).toContain('cb-yay'))
    expect(requested()).not.toContain('cb-hi')

    served.set(afterSession(served.slug))
    await refreshEvent(served.slug)
    await vi.waitFor(() => expect(requested()).toContain('cb-hi'))
    await flushPromises()

    expect(requests['cb-yay']).toBe(1)
    expect(requests['cb-hi']).toBe(1)
  })
})
