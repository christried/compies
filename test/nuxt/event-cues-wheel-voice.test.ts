import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { refreshEvent } from '~/composables/useEventView'
import EventPage from '~/pages/e/[slug]/index.vue'
import { CUE_GROUPS, CUE_IDS, wheelVoicePlan } from '~/utils/sound-cues'
import { REVEAL_AFTER_MS } from '~/utils/wheel'
import type { RoundGame } from '~~/shared/game'
import { defaultSettings } from '~~/shared/settings'
import type { SpinView, VetoView, WheelView } from '~~/shared/stage'
import { cueLog, iso, requested, requestedOf, requests, resetRequests, serveCueFiles, setUpCuePage, started, startedOf, tearDownCuePage } from './cue-harness'
import { serve, viewWithSessions } from './event-page'
import { FIRST, STARTED } from './event-page-states'

// Compibert's voice on the Event page (#671, spec #718 § Secrecy „The Hidden wheel“): `cb-hype`, `cb-gulp` and `cb-yay` are scheduled once with the
// wheel's cues from the spin's two instants, the Host and a Member alike, never from the drawn game; their files come with the wheel's. The
// plan's own instants are in test/unit/wheel-voice-cues.test.ts; the player's rules in test/unit/cue-player.test.ts. The audio context is the fake.

const WHEEL_FILES = CUE_IDS.filter(id => CUE_GROUPS[id].includes('wheel'))
const VOICE = ['cb-hype', 'cb-gulp', 'cb-yay'] as const

const kart: RoundGame = { id: 'g-kart', name: 'Kart', imageUrl: null, youtubeId: null, clipStart: 0, clipLength: 30, playersMin: 2, playersMax: 4, suitabilities: [], price: null }
const halo: RoundGame = { ...kart, id: 'g-halo', name: 'Halo' }

/** A spin of 6 s that starts at `start` (epoch ms). */
const spinAt = (start: number, draw: Partial<SpinView> = {}): SpinView => ({
  roundId: 'r1', drawId: 'd1', spinStartAt: iso(start), stopAt: iso(start + 6000), slices: 5, resultIndex: 3, resultOffset: 0.25, labels: null, game: kart, current: true, ...draw,
})
const spinIn = (lead: number) => spinAt(Date.now() + lead)
const wheelWith = (spin: SpinView | null, vetoes: Partial<VetoView> = {}): WheelView => ({
  count: 5,
  slices: ['a', 'b', 'c', 'd', 'e'].map(id => ({ id, name: id })),
  spin,
  vetoes: { left: [2, 2], own: null, revealed: null, draw: null, ...vetoes },
})
const voiceOf = (spin: SpinView, hiddenWheel = false, reducedMotion = false) =>
  wheelVoicePlan({ spin: { spinStartAt: spin.spinStartAt, stopAt: spin.stopAt }, hiddenWheel, reducedMotion })

/** The Event page's read: a Session that runs, the Host flag and the Hidden wheel setting of the viewer's read. */
function serveWheel(wheel: WheelView | null, { isHost = false, hiddenWheel = false, wheelUncovered = false }: { isHost?: boolean, hiddenWheel?: boolean, wheelUncovered?: boolean } = {}) {
  const read = (slug: string, wheelOfRead: WheelView | null) => viewWithSessions(slug, [{ number: null, startsAt: FIRST, startedAt: STARTED }], 0, {
    event: { isHost, phase: 'running' }, settings: { ...defaultSettings(), vetoAllowance: null, hiddenWheel },
    runningSessionId: `session-${slug}-0`, wheel: wheelOfRead, clip: null, wheelUncovered,
  })
  const served = serve(slug => read(slug, wheel))
  return { slug: served.slug, set: (next: WheelView | null) => served.set(read(served.slug, next)) }
}

serveCueFiles()

const voiceLog = () => cueLog().filter(entry => entry.id.startsWith('cb-')).map(entry => ({ id: entry.id, at: entry.at, outcome: entry.outcome }))

let page: Awaited<ReturnType<typeof mountSuspended>> | undefined

beforeEach(() => {
  setUpCuePage({ staging: true })
})

afterEach(() => {
  page?.unmount()
  page = undefined
  tearDownCuePage()
})

describe('the voice on the Event page, for a Member', () => {
  it('is scheduled once, in step with the wheel\'s cues, from the spin\'s instants', async () => {
    const spin = spinIn(4000)
    const served = serveWheel(wheelWith(spin))
    page = await mountSuspended(EventPage, { route: `/e/${served.slug}` })
    await vi.waitFor(() => expect(startedOf('cb-yay')).toHaveLength(1))
    await flushPromises()

    for (const id of VOICE) expect(startedOf(id), id).toHaveLength(1)
    const windup = startedOf('wheel-windup')[0]!
    const stop = startedOf('wheel-stop')[0]!
    // The fake audio clock follows real time, so the tolerance is the point, never equality.
    expect(Math.abs(startedOf('cb-hype')[0]!.startedAt! - windup.startedAt!)).toBeLessThan(0.05)
    expect(Math.abs(startedOf('cb-yay')[0]!.startedAt! - stop.startedAt!)).toBeLessThan(0.05)
    expect(voiceLog()).toEqual(voiceOf(spin).map(cue => ({ ...cue, outcome: 'scheduled' })))

    const total = started().length
    served.set(wheelWith({ ...spin }))
    await refreshEvent(served.slug)
    await flushPromises()
    await refreshEvent(served.slug)
    await flushPromises()

    expect(started()).toHaveLength(total)
    for (const id of VOICE) expect(startedOf(id), id).toHaveLength(1)
    expect(started().every(source => source.stopCalls === 0)).toBe(true)
  })
})

describe('the voice on the Event page, for the Host', () => {
  it('is the same voice and the same files as a Member\'s', async () => {
    const spin = spinAt(Date.now() + 4000)
    const member = serveWheel(wheelWith(spin))
    page = await mountSuspended(EventPage, { route: `/e/${member.slug}` })
    await vi.waitFor(() => expect(startedOf('cb-yay')).toHaveLength(1))
    const memberVoice = voiceLog()
    const memberFiles = requestedOf('wheel')
    page.unmount()
    resetRequests()

    const host = serveWheel(wheelWith(spin), { isHost: true })
    page = await mountSuspended(EventPage, { route: `/e/${host.slug}` })
    await vi.waitFor(() => expect(startedOf('cb-yay')).toHaveLength(1))

    expect(voiceLog()).toEqual(memberVoice)
    expect(requestedOf('wheel')).toEqual(memberFiles)
  })

  it.each([['a Member', false], ['the Host', true]])('cheers half a second after the stop under a Hidden wheel, for %s, and only the Member has the morph', async (_who, isHost) => {
    const spin = spinAt(Date.now() + 4000)
    const served = serveWheel(wheelWith(spin), { isHost, hiddenWheel: true })
    page = await mountSuspended(EventPage, { route: `/e/${served.slug}` })
    await vi.waitFor(() => expect(startedOf('cb-yay')).toHaveLength(1))
    await flushPromises()

    const yay = voiceLog().find(entry => entry.id === 'cb-yay')!
    expect(yay.at).toBe(Date.parse(spin.stopAt) + REVEAL_AFTER_MS)
    expect(voiceLog()).toEqual(voiceOf(spin, true).map(cue => ({ ...cue, outcome: 'scheduled' })))
    expect(startedOf('wheel-morph')).toHaveLength(isHost ? 0 : 1)
  })

  // A Round added after a Tie spins the uncovered wheel openly (#957): its cues are a visible wheel's, the setting stays on.
  it('cheers at the stop with no morph on an uncovered Hidden wheel, for a Member (#957)', async () => {
    const spin = spinAt(Date.now() + 4000)
    const served = serveWheel(wheelWith(spin), { hiddenWheel: true, wheelUncovered: true })
    page = await mountSuspended(EventPage, { route: `/e/${served.slug}` })
    await vi.waitFor(() => expect(startedOf('cb-yay')).toHaveLength(1))
    await flushPromises()

    expect(voiceLog()).toEqual(voiceOf(spin, false).map(cue => ({ ...cue, outcome: 'scheduled' })))
    expect(startedOf('wheel-morph')).toHaveLength(0)
  })
})

describe('the voice on the Event page keeps the drawn game secret', () => {
  it('requests the same files and schedules the same voice for two spins that differ only in the draw', async () => {
    const start = Date.now() + 4000
    const first = spinAt(start, { slices: 5, resultIndex: 3, resultOffset: 0.25, labels: ['Kart', 'a', 'b', 'c', 'd'], game: kart })
    const second = spinAt(start, { slices: 30, resultIndex: 17, resultOffset: 0.8, labels: ['???', '???'], game: halo })

    const one = serveWheel(wheelWith(first), { hiddenWheel: true })
    page = await mountSuspended(EventPage, { route: `/e/${one.slug}` })
    await vi.waitFor(() => expect(startedOf('cb-yay')).toHaveLength(1))
    const voiceOne = voiceLog()
    const filesOne = requestedOf('wheel')
    page.unmount()
    resetRequests()

    const two = serveWheel(wheelWith(second), { hiddenWheel: true })
    page = await mountSuspended(EventPage, { route: `/e/${two.slug}` })
    await vi.waitFor(() => expect(startedOf('cb-yay')).toHaveLength(1))

    expect(voiceLog()).toEqual(voiceOne)
    expect(requestedOf('wheel')).toEqual(filesOne)
    expect(voiceOne).toHaveLength(3)
  })
})

describe('the voice\'s files', () => {
  it('are requested once each, with the wheel\'s, by a read that has a wheel and no spin yet', async () => {
    const served = serveWheel(wheelWith(null))
    page = await mountSuspended(EventPage, { route: `/e/${served.slug}` })
    await vi.waitFor(() => expect(WHEEL_FILES.every(id => requests[id] === 1)).toBe(true))
    await flushPromises()

    expect(WHEEL_FILES).toHaveLength(8)
    expect(requestedOf('wheel')).toEqual([...WHEEL_FILES].sort())
    for (const id of VOICE) expect(requests[id], id).toBe(1)
    expect(started()).toEqual([])
  })

  it('are not requested by a read without a wheel', async () => {
    const served = serveWheel(null)
    page = await mountSuspended(EventPage, { route: `/e/${served.slug}` })
    await flushPromises()
    await new Promise(resolve => setTimeout(resolve, 50))

    expect(requestedOf('wheel')).toEqual([])
    expect(started()).toEqual([])
  })

  it('bring no voice cue to the Veto reveal', async () => {
    const now = Date.now()
    const draw = { drawId: 'd1', kind: 'spin' as const, stopAt: iso(now - 2000), vetoEndsAt: iso(now + 38_000), game: kart }
    const served = serveWheel(wheelWith(null, { draw, own: { team: 1, cast: false, rejection: null }, revealed: null }))
    page = await mountSuspended(EventPage, { route: `/e/${served.slug}` })
    await vi.waitFor(() => expect(startedOf('veto-reveal')).toHaveLength(1))
    await flushPromises()

    expect(started().some(source => source.id?.startsWith('cb-'))).toBe(false)
    expect(voiceLog()).toEqual([])
  })
})

describe('the voice with Ton off', () => {
  it('schedules nothing, logs nothing and requests no file', async () => {
    localStorage.setItem('compies-sound', 'off')
    const served = serveWheel(wheelWith(spinIn(4000)))
    page = await mountSuspended(EventPage, { route: `/e/${served.slug}` })
    await flushPromises()
    await new Promise(resolve => setTimeout(resolve, 50))

    expect(started()).toEqual([])
    expect(voiceLog()).toEqual([])
    expect(requested()).toEqual([])
  })
})

describe('the voice under reduced motion', () => {
  it('is the cheer alone', async () => {
    document.documentElement.style.setProperty('--cp-motion', 'reduced')
    const spin = spinIn(4000)
    const served = serveWheel(wheelWith(spin))
    page = await mountSuspended(EventPage, { route: `/e/${served.slug}` })
    await vi.waitFor(() => expect(startedOf('cb-yay')).toHaveLength(1))
    await flushPromises()

    expect(startedOf('cb-hype')).toHaveLength(0)
    expect(startedOf('cb-gulp')).toHaveLength(0)
    expect(voiceLog()).toEqual(voiceOf(spin, false, true).map(cue => ({ ...cue, outcome: 'scheduled' })))
    expect(voiceLog()).toHaveLength(1)
  })
})

describe('the voice for a late joiner', () => {
  it('skips what has passed and still cheers at the stop', async () => {
    const spin = spinIn(-4000)
    const served = serveWheel(wheelWith(spin))
    page = await mountSuspended(EventPage, { route: `/e/${served.slug}` })
    await vi.waitFor(() => expect(startedOf('cb-yay')).toHaveLength(1))
    await flushPromises()

    const outcomes = Object.fromEntries(voiceLog().map(entry => [entry.id, entry.outcome]))
    expect(outcomes['cb-hype']).toBe('skipped')
    expect(outcomes['cb-yay']).toBe('scheduled')
    expect(startedOf('cb-hype')).toHaveLength(0)
    expect(startedOf('cb-gulp')).toHaveLength(0)
  })
})
