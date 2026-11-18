import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import EventPage from '~/pages/e/[slug]/index.vue'
import { refreshEvent } from '~/composables/useEventView'
import { NOTICE_SETTLE_MS } from '~/composables/useSoundUnlock'
import { CUE_IDS, type CueId } from '~/utils/sound-cues'
import { ceremonyTimeline, type CeremonyGag } from '~~/shared/ceremony'
import type { RoundGame } from '~~/shared/game'
import { defaultSettings } from '~~/shared/settings'
import type { CeremonyView, ResultView } from '~~/shared/stage'
import { FakeAudioContext } from '../fake-audio'
import { kitty, signInAs } from './auth'
import { serve, viewWithSessions } from './event-page'
import { ENDED, FIRST, members, SESSION, STARTED, team } from './event-page-states'

// „Ton aktivieren“ at the Award ceremony (#755, spec #718 § Engine changes): on a finished Event the notice shows while the ceremony is pending and
// while it runs (to its stored end), with Ton on and a held context, for a Member and for the Host alike. The notice's own rules (its text, its
// gesture, its return) are in test/nuxt/event-sound-unlock.test.ts, the ceremony's plan in test/nuxt/event-cues-ceremony.test.ts.

const PARTIES = 4
const SENTENCE = 'Dein Browser spielt Ton erst nach einem Tipp oder Tastendruck ab.'
const halo: RoundGame = { id: 'g-halo', name: 'Halo', imageUrl: null, youtubeId: null, clipStart: 0, clipLength: 30, playersMin: 2, playersMax: 4, suitabilities: [], price: null }
const resultOf = (number: number): ResultView => ({
  roundId: `r${number}`,
  number,
  game: { ...halo, id: `g-${number}`, name: `Spiel ${number}` },
  places: [1, 2, 3, 4].map(position => ({ team: position, place: position, points: 4 - position, score: null })),
  corrected: false,
  correctedAt: null,
  resultAt: STARTED,
})
const ENDED_ONE = SESSION(1, FIRST, { startedAt: STARTED, endedAt: ENDED })

/** A browser that lets no sound through before a gesture: the context is made suspended. */
class HeldContext extends FakeAudioContext {
  override state = 'suspended'
}

for (const id of CUE_IDS) registerEndpoint(`/sounds/cues/${id}.wav`, () => new TextEncoder().encode(id))

const context = () => FakeAudioContext.instances.at(-1)
type Line = { id: CueId, at: number, rate: number, outcome: string }
const log = () => (globalThis as { __compiesCueLog?: () => readonly Line[] }).__compiesCueLog?.() ?? []
const gesture = {
  pointer: () => document.body.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })),
  click: () => document.body.dispatchEvent(new MouseEvent('click', { bubbles: true })),
}
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
/** Time enough for the settle delay to have passed: a notice that is not there now is not coming. */
const settle = async () => {
  await wait(NOTICE_SETTLE_MS + 100)
  await flushPromises()
}

const iso = (ms: number) => new Date(ms).toISOString()
/** A run that starts `lead` ms from now (a negative lead: it started that long ago) for four Parties and one Winner. */
function ceremonyIn(lead: number, gag: CeremonyGag, winners = 1): CeremonyView {
  const startsAt = Math.round(Date.now() + lead)
  return { startsAt: iso(startsAt), endsAt: iso(startsAt + ceremonyTimeline({ partyCount: PARTIES, winners, gag }).endMs), gag }
}

/** A finished Event of four Parties with the viewer (Kitty) in the first, its ceremony as given; `set` is a read that changes. */
function serveFinished(host: boolean, first: CeremonyView | null) {
  const read = (slug: string, ceremony: CeremonyView | null) => viewWithSessions(slug, [ENDED_ONE], 0, {
    event: { phase: 'finished', isHost: host },
    settings: defaultSettings(),
    members: members({ kitty: { zone: 'team', team: 1 } }),
    teams: [1, 2, 3, 4].map(position => team(position, `Party ${position}`)),
    results: [resultOf(1), resultOf(2), resultOf(3)],
    standings: [
      { team: 1, rank: 1, points: 9 }, { team: 2, rank: 2, points: 6 }, { team: 3, rank: 3, points: 3 }, { team: 4, rank: 4, points: 0 },
    ],
    end: { played: 3, gameCount: 3, complete: true, tie: null, finish: null, lastGame: null },
    ceremonyShown: ceremony !== null,
    ceremony,
    wheel: null,
  })
  const served = serve(slug => read(slug, first))
  registerEndpoint(`/api/e/${served.slug}/activity`, { method: 'GET', handler: () => ({ entries: [], next: null }) })
  registerEndpoint(`/api/e/${served.slug}/ceremony`, { method: 'POST', handler: () => 1 })
  return {
    slug: served.slug,
    /** The page's next read, refetched at once as the room's `event.changed` does. */
    async set(next: CeremonyView | null) {
      served.set(read(served.slug, next))
      await refreshEvent(served.slug)
      await flushPromises()
    },
  }
}

let page: Awaited<ReturnType<typeof mountSuspended>> | undefined

async function mount(slug: string) {
  page = await mountSuspended(EventPage, { route: `/e/${slug}`, attachTo: document.body })
  await flushPromises()
  return page
}
const notice = () => [...document.querySelectorAll('[role="status"]')].find(element => element.textContent?.includes('Ton aktivieren')) ?? null
const shown = () => vi.waitFor(() => expect(notice()).not.toBeNull())

beforeEach(() => {
  signInAs(kitty)
  document.body.innerHTML = ''
  FakeAudioContext.instances = []
  FakeAudioContext.follows = true
  vi.stubGlobal('AudioContext', HeldContext)
  // The cue log is the page's own data, exposed in a staging build.
  useRuntimeConfig().public.staging = true
})

afterEach(() => {
  page?.unmount()
  page = undefined
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  FakeAudioContext.follows = false
  localStorage.removeItem('compies-sound')
  useRuntimeConfig().public.staging = false
  Reflect.deleteProperty(globalThis, '__compiesCueLog')
})

describe('„Ton aktivieren“ at the Award ceremony', () => {
  it('shows on a finished Event whose ceremony is pending: its sentence, one button, a status, and not in the first render', async () => {
    await mount(serveFinished(false, null).slug)
    expect(notice()).toBeNull()

    await shown()

    expect(notice()!.textContent).toContain(SENTENCE)
    expect([...notice()!.querySelectorAll('button')].map(button => button.textContent!.trim())).toEqual(['Ton aktivieren'])
    expect(notice()!.getAttribute('role')).toBe('status')
  })

  it('stays while the ceremony runs, and does not blink between pending and running: the same element', async () => {
    const served = serveFinished(false, null)
    await mount(served.slug)
    await shown()
    const before = notice()

    await served.set(ceremonyIn(-1000, 'trip'))
    await settle()

    expect(notice()).not.toBeNull()
    expect(notice()).toBe(before)
  })

  it('does not show after the ceremony\'s end, and goes when the end passes (the page\'s instant refresh)', async () => {
    await mount(serveFinished(false, ceremonyIn(-ceremonyTimeline({ partyCount: PARTIES, winners: 1, gag: 'trip' }).endMs - 500, 'trip')).slug)
    await settle()
    expect(notice()).toBeNull()
    page!.unmount()
    page = undefined
    document.body.innerHTML = ''

    const endMs = ceremonyTimeline({ partyCount: PARTIES, winners: 1, gag: 'trip' }).endMs
    await mount(serveFinished(false, ceremonyIn(1500 - endMs, 'trip')).slug)
    await shown()

    await vi.waitFor(() => expect(notice()).toBeNull(), { timeout: 4000 })
  })

  it('never with Ton off: no context, no notice', async () => {
    localStorage.setItem('compies-sound', 'off')
    await mount(serveFinished(false, null).slug)
    await settle()

    expect(notice()).toBeNull()
    expect(FakeAudioContext.instances).toHaveLength(0)
  })

  it('goes with a gesture that unlocks the page, and does not come back when the ceremony starts', async () => {
    const served = serveFinished(false, null)
    await mount(served.slug)
    await shown()

    gesture.pointer()
    await flushPromises()
    expect(context()!.resumeCalls).toBe(1)
    expect(context()!.state).toBe('running')
    expect(notice()).toBeNull()

    await served.set(ceremonyIn(1500, 'trip'))
    await settle()

    expect(notice()).toBeNull()
    expect(context()!.resumeCalls).toBe(1)
  })

  it('does not take the focus, and a removal by a gesture moves it nowhere', async () => {
    await mount(serveFinished(false, null).slug)
    await shown()
    expect(document.activeElement).toBe(document.body)

    gesture.pointer()
    await flushPromises()

    expect(document.activeElement).toBe(document.body)
  })

  it('shows on the Host\'s page as on a Member\'s, and the Host\'s first gesture clears it', async () => {
    await mount(serveFinished(true, null).slug)
    await shown()

    gesture.click()
    await flushPromises()

    expect(notice()).toBeNull()
    expect(context()!.resumeCalls).toBe(1)
  })

  it('gives a tap during the run the cues still to come, and skips what has passed', async () => {
    // 2.5 s into the run with the bonk: the drop, the rows and the run are past, the bonk (3.87 s) is still ahead.
    await mount(serveFinished(false, ceremonyIn(-2500, 'bonk')).slug)
    await shown()
    expect(log().filter(line => line.id.startsWith('cer-') && line.outcome === 'scheduled')).toEqual([])

    gesture.pointer()
    await vi.waitFor(() => expect(log().find(line => line.id === 'cer-bonk')).toBeDefined(), { timeout: 5000 })
    await flushPromises()

    const ceremony = log().filter(line => line.id.startsWith('cer-'))
    expect(ceremony.find(line => line.id === 'cer-bonk')!.outcome).toBe('scheduled')
    for (const line of ceremony.filter(line => line.id === 'cer-drop' || line.id === 'cer-row' || line.id === 'cer-run')) expect(line.outcome, line.id).toBe('skipped')
    expect(ceremony.some(line => line.id === 'cer-row')).toBe(true)
  })
})
