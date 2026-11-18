import { mockNuxtImport, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { refreshEvent } from '~/composables/useEventView'
import { CUE_GROUPS, CUE_IDS, cueFilesOf, type CueGroup, type CueId } from '~/utils/sound-cues'
import { ceremonyTimeline, type CeremonyGag } from '~~/shared/ceremony'
import type { RoundGame } from '~~/shared/game'
import { defaultSettings } from '~~/shared/settings'
import type { CeremonyView, ResultView, SpinView, WheelView } from '~~/shared/stage'
import { FakeAudioContext } from '../fake-audio'
import { kitty, signInAs } from './auth'
import { serve, viewWithSessions } from './event-page'
import { ENDED, FIRST, members, mount, SESSION, STARTED, team, unmountPage } from './event-page-states'
import { motion } from './motion'

// The Award ceremony of one Winner is heard (#743, spec #718): the Event read that carries `startsAt` and `gag` gives the page's cue player the
// ceremony's plan, on every device at the same instant; a skip, a close, a failed chunk and a new start cut what it holds; a replay sounds from
// the click on this device only. The files are requested for ANY finished Event, so no request tells a Member who won or that it is a Tie.
// The plan's own rules are in test/unit/ceremony-cues.test.ts, the player's in test/unit/cue-player-sources.test.ts. The audio context is the
// fake of test/fake-audio.ts, the clock the device's (a test has no live room).

// A test can make the GSAP chunk fail to load (#312's layer then shows its static end frame).
const chunk = vi.hoisted(() => ({ fail: false }))
mockNuxtImport('loadGsap', async () => {
  const { loadGsap: real } = await vi.importActual<typeof import('~/utils/gsap')>('~/utils/gsap')
  return async () => {
    if (chunk.fail) throw new Error('chunk failed')
    return real()
  }
})

const PARTIES = 4
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

/** The eight cues of #743 and #744, the files of its group; a later ticket adds more, so no assertion lists the group's files. */
const OWN_FILES = ['cer-drop', 'cer-row', 'cer-run', 'cer-trip', 'cer-bonk', 'cer-stamp', 'cer-fanfare', 'cer-crowd']

/** The requests each cue file got. The handlers answer with the cue id as bytes, which the fake decodes back to `{ id }`. */
const requests: Record<string, number> = {}
for (const id of CUE_IDS) {
  registerEndpoint(`/sounds/cues/${id}.wav`, () => {
    requests[id] = (requests[id] ?? 0) + 1
    return new TextEncoder().encode(id)
  })
}
const requested = () => Object.keys(requests).filter(id => requests[id]).sort()
/** The requested files of these groups: an assertion names the groups it is about, so another moment's files never break it (#718). */
const requestedOf = (...groups: CueGroup[]) => requested().filter(id => CUE_GROUPS[id as CueId].some(group => groups.includes(group)))

const context = () => FakeAudioContext.instances.at(-1)
const started = () => context()?.started() ?? []
type Line = { id: CueId, at: number, rate: number, outcome: string }
const log = () => (globalThis as { __compiesCueLog?: () => readonly Line[] }).__compiesCueLog?.() ?? []

const iso = (ms: number) => new Date(ms).toISOString()
/** A run that starts `lead` ms from now (a negative lead: it started that long ago) for `parties` Parties and `winners` Winners. */
function ceremonyIn(lead: number, gag: CeremonyGag, winners = 1): CeremonyView {
  const startsAt = Math.round(Date.now() + lead)
  return { startsAt: iso(startsAt), endsAt: iso(startsAt + ceremonyTimeline({ partyCount: PARTIES, winners, gag }).endMs), gag }
}

/** What the plan of one Winner is on this page (4 Parties, one Winner, no grid), by the shared timeline: the beats are never copied here. */
function planAt(startsAt: number, gag: CeremonyGag) {
  const m = ceremonyTimeline({ partyCount: PARTIES, winners: 1, gag, grid: false })
  return [
    { id: 'cer-drop', at: startsAt, rate: 1 },
    ...m.rowAtMs.map((ms, index) => ({ id: 'cer-row', at: startsAt + ms, rate: 2 ** (index / 12) })),
    { id: 'cer-run', at: startsAt + m.runAtMs, rate: 1 },
    gag === 'trip' ? { id: 'cer-trip', at: startsAt + m.runEndAtMs, rate: 1 } : { id: 'cer-bonk', at: startsAt + m.bonkAtMs, rate: 1 },
    { id: 'cer-stamp', at: startsAt + m.stampAtMs, rate: 1 },
    { id: 'cer-fanfare', at: startsAt + m.stampAtMs, rate: 1 },
    { id: 'cer-crowd', at: startsAt + m.stampAtMs, rate: 1 },
  ]
}
/** Drop, three rows, run, the gag, then the stamp, the fanfare and the crowd. */
const CEREMONY_CUES = 9
/** A run whose stamp is `ahead` ms away: the page has the time to load and schedule the fanfare, and the test waits (`fanfareSounds`) until it sounds. */
const stampIn = (ahead: number, gag: CeremonyGag) => ceremonyIn(ahead - ceremonyTimeline({ partyCount: PARTIES, winners: 1, gag, grid: false }).stampAtMs, gag)
/** Waits until the fanfare of a run `stampIn` made has been sounding for 50 ms (the audio clock of the fake follows the device's). */
const fanfareSounds = (ceremony: CeremonyView, gag: CeremonyGag) =>
  vi.waitFor(() => expect(Date.now()).toBeGreaterThanOrEqual(Date.parse(ceremony.startsAt) + ceremonyTimeline({ partyCount: PARTIES, winners: 1, gag, grid: false }).stampAtMs + 50), { timeout: 5000, interval: 20 })
const shapeOf = (lines: readonly Line[]) => lines.map(({ id, at, rate }) => ({ id, at, rate }))

interface Read { host: boolean, tie?: boolean, ceremony: CeremonyView | null, wheel?: WheelView | null }

/** A finished Event of four Parties with the viewer (Kitty) in the first; with a Tie the first two share rank 1. */
function serveFinished(first: Read) {
  const read = (slug: string, { host, tie = false, ceremony, wheel = null }: Read) => viewWithSessions(slug, [ENDED_ONE], 0, {
    event: { phase: 'finished', isHost: host },
    settings: defaultSettings(),
    members: members({ kitty: { zone: 'team', team: 1 } }),
    teams: [1, 2, 3, 4].map(position => team(position, `Party ${position}`)),
    results: [resultOf(1), resultOf(2), resultOf(3)],
    standings: [
      { team: 1, rank: 1, points: 9 }, { team: 2, rank: tie ? 1 : 2, points: tie ? 9 : 6 }, { team: 3, rank: 3, points: 3 }, { team: 4, rank: 4, points: 0 },
    ],
    end: { played: 3, gameCount: 3, complete: true, tie: null, finish: null, lastGame: null },
    // The read of a started ceremony says so (#445): the finished stage then shows its row of buttons, „Siegerehrung ansehen“ among them.
    ceremonyShown: ceremony !== null,
    ceremony,
    wheel,
  })
  const served = serve(slug => read(slug, first))
  registerEndpoint(`/api/e/${served.slug}/activity`, { method: 'GET', handler: () => ({ entries: [], next: null }) })
  let current = first
  let posts = 0
  registerEndpoint(`/api/e/${served.slug}/ceremony`, { method: 'POST', handler: () => ++posts })
  return {
    slug: served.slug,
    /** Nothing but the ceremony's start is posted by the Host's button; a replay sends nothing. */
    posts: () => posts,
    /** The page's next read, refetched at once as the room's `event.changed` does. */
    async set(next: Partial<Read>) {
      current = { ...current, ...next }
      served.set(read(served.slug, current))
      await refreshEvent(served.slug)
      await flushPromises()
    },
  }
}

const dialogButton = (label: string) => [...document.querySelectorAll('[role="dialog"] button')].find(button => (button.getAttribute('aria-label') ?? button.textContent?.trim()) === label) as HTMLButtonElement | undefined

/** Waits for the page's files to be fetched, decoded and the plan scheduled. */
async function settled(sources: number) {
  await vi.waitFor(() => expect(started()).toHaveLength(sources), { timeout: 5000 })
  await flushPromises()
}

beforeEach(() => {
  signInAs(kitty)
  document.body.innerHTML = ''
  FakeAudioContext.instances = []
  FakeAudioContext.follows = true
  chunk.fail = false
  for (const id of CUE_IDS) requests[id] = 0
  vi.stubGlobal('AudioContext', FakeAudioContext)
  // The cue log is the page's own data, exposed in a staging build.
  useRuntimeConfig().public.staging = true
  useState('sound-enabled').value = true
  motion('full')
})

afterEach(() => {
  unmountPage()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  FakeAudioContext.follows = false
  localStorage.removeItem('compies-sound')
  useRuntimeConfig().public.staging = false
  Reflect.deleteProperty(globalThis, '__compiesCueLog')
})

describe('the files of the ceremony (secrecy, #718 § Secrecy)', () => {
  it('are the same for the Host and a Member, pending or started, one Winner or a Tie, either gag: the Event is finished and nothing else', async () => {
    const variants: [string, Partial<Read>][] = [
      ['pending, one Winner', { tie: false, ceremony: null }],
      ['pending, a Tie', { tie: true, ceremony: null }],
      ['started, one Winner, trip', { tie: false, ceremony: ceremonyIn(60_000, 'trip') }],
      ['started, a Tie, bonk', { tie: true, ceremony: ceremonyIn(60_000, 'bonk', 2) }],
    ]
    const seen: Record<string, string[]> = {}
    for (const host of [false, true]) {
      for (const [name, variant] of variants) {
        for (const id of CUE_IDS) requests[id] = 0
        await mount(serveFinished({ host, ceremony: null, ...variant }).slug)
        await vi.waitFor(() => expect(requestedOf('ceremony')).not.toEqual([]), { timeout: 5000 })
        await flushPromises()
        await new Promise(resolve => setTimeout(resolve, 30))
        seen[`${host ? 'Host' : 'Member'}, ${name}`] = requestedOf('ceremony')
        for (const id of requestedOf('ceremony')) expect(requests[id], id).toBe(1)
        unmountPage()
      }
    }

    const files = [...cueFilesOf(['ceremony'])].sort()
    expect(files).toEqual(expect.arrayContaining(OWN_FILES))
    for (const [who, got] of Object.entries(seen)) expect(got, who).toEqual(files)
  }, 60_000)

  it('are requested before the Host has started it, and no other group is', async () => {
    await mount(serveFinished({ host: false, ceremony: null }).slug)
    await vi.waitFor(() => expect(requestedOf('ceremony')).toEqual(expect.arrayContaining(OWN_FILES)), { timeout: 5000 })

    expect(requested()).toEqual(requestedOf('ceremony'))
  })
})

describe.each([['the Host', true], ['a Member', false]])('the ceremony of one Winner for %s', (_who, host) => {
  describe.each<CeremonyGag>(['trip', 'bonk'])('with the gag %s', (gag) => {
    it('schedules once the drop, a row per Party below with a rising pitch, the run and the gag, at the shared timeline\'s instants', async () => {
      const ceremony = ceremonyIn(4000, gag)
      await mount(serveFinished({ host, ceremony }).slug)
      await settled(CEREMONY_CUES)

      expect(shapeOf(log())).toEqual(planAt(Date.parse(ceremony.startsAt), gag))
      expect(log().every(line => line.outcome === 'scheduled')).toBe(true)
      expect(started().map(source => source.id)).toEqual(log().map(line => line.id))
      expect(started().map(source => source.rate)).toEqual(log().map(line => line.rate))
      expect(started()[1]!.rate).toBe(1)
      expect(started()[2]!.rate).toBeCloseTo(1.0595, 4)
      expect(log().map(line => line.id)).toContain(gag === 'trip' ? 'cer-trip' : 'cer-bonk')
      expect(log().map(line => line.id)).not.toContain(gag === 'trip' ? 'cer-bonk' : 'cer-trip')
    })
  })

  it('schedules nothing twice when the same start is read again', async () => {
    const ceremony = ceremonyIn(4000, 'trip')
    const served = serveFinished({ host, ceremony })
    await mount(served.slug)
    await settled(CEREMONY_CUES)

    await served.set({ ceremony: { ...ceremony } })
    await served.set({ ceremony: { ...ceremony } })

    expect(started()).toHaveLength(CEREMONY_CUES)
    expect(log()).toHaveLength(CEREMONY_CUES)
    expect(started().every(source => source.stopCalls === 0)).toBe(true)
  })

  it('replaces the plan when the Host starts it again: the old cues are cancelled, the new run is scheduled', async () => {
    const first = ceremonyIn(4000, 'trip')
    const served = serveFinished({ host, ceremony: first })
    await mount(served.slug)
    await settled(CEREMONY_CUES)

    const second = ceremonyIn(8000, 'bonk')
    await served.set({ ceremony: second })
    await settled(2 * CEREMONY_CUES)

    expect(log().slice(0, CEREMONY_CUES).every(line => line.outcome === 'cancelled')).toBe(true)
    expect(started().slice(0, CEREMONY_CUES).every(source => source.stopCalls === 1)).toBe(true)
    expect(shapeOf(log().slice(CEREMONY_CUES))).toEqual(planAt(Date.parse(second.startsAt), 'bonk'))
    expect(log().slice(CEREMONY_CUES).every(line => line.outcome === 'scheduled')).toBe(true)
  })

  it('gives a late joiner only what is still to come: nothing earlier than 150 ms ago is scheduled', async () => {
    // 2.5 s into the run with the bonk: the rows and the run are past, the bonk (3.87 s) and the peak (stamp, fanfare, crowd) are still ahead.
    const ceremony = ceremonyIn(-2500, 'bonk')
    const before = Date.now()
    await mount(serveFinished({ host, ceremony }).slug)
    await vi.waitFor(() => expect(started().map(source => source.id)).toContain('cer-bonk'), { timeout: 5000 })
    await flushPromises()

    const playing = log().filter(line => line.outcome === 'scheduled' || line.outcome === 'late')
    expect(playing.map(line => line.id)).toEqual(['cer-bonk', 'cer-stamp', 'cer-fanfare', 'cer-crowd'])
    for (const line of playing) expect(line.at).toBeGreaterThanOrEqual(before - 150)
  })

  it('plays nothing on a page that opens after the end', async () => {
    const ceremony = ceremonyIn(-ceremonyTimeline({ partyCount: PARTIES, winners: 1, gag: 'trip' }).endMs - 500, 'trip')
    await mount(serveFinished({ host, ceremony }).slug)
    await vi.waitFor(() => expect(requestedOf('ceremony')).toEqual(expect.arrayContaining(OWN_FILES)), { timeout: 5000 })
    await flushPromises()
    await new Promise(resolve => setTimeout(resolve, 50))

    expect(started()).toEqual([])
    expect(log().filter(line => line.outcome === 'scheduled' || line.outcome === 'late')).toEqual([])
  })

  // A wheel plan of the read is the page's other source: a cut of the ceremony never touches it.
  const wheel = (): WheelView => {
    const start = Date.now() + 30_000
    const spin: SpinView = { roundId: 'r1', drawId: 'd1', spinStartAt: iso(start), stopAt: iso(start + 6000), slices: 5, resultIndex: 3, resultOffset: 0.25, labels: null, game: halo, current: true }
    return { count: 5, slices: ['a', 'b', 'c', 'd', 'e'].map(id => ({ id, name: id })), spin, vetoes: { left: [2, 2], own: null, revealed: null, draw: null } }
  }

  describe.each<[string, string]>([['skips it („Überspringen“)', 'Überspringen'], ['closes it', 'Schließen']])('a viewer who %s mid-run', (_name, label) => {
    it('cancels the pending cues, stops the one that sounds and schedules nothing more, and leaves the read\'s own plan alone', async () => {
      const ceremony = ceremonyIn(2000, 'trip')
      const read = wheel()
      await mount(serveFinished({ host, ceremony, wheel: read }).slug)
      const wheelCues = (await vi.waitFor(() => {
        const ids = started().map(source => source.id)
        expect(ids.filter(id => id!.startsWith('cer-'))).toHaveLength(CEREMONY_CUES)
        return ids.filter(id => !id!.startsWith('cer-'))
      }, { timeout: 5000 })).length
      expect(wheelCues).toBeGreaterThan(0)

      // The layer opens at the start instant: the drop sounds now, the rows are 600 ms and more away.
      await vi.waitFor(() => expect(dialogButton(label)).toBeDefined(), { timeout: 5000 })
      dialogButton(label)!.click()
      await flushPromises()
      await new Promise(resolve => setTimeout(resolve, 20))

      const ceremonySources = started().filter(source => source.id!.startsWith('cer-'))
      const drop = ceremonySources.find(source => source.id === 'cer-drop')!
      expect(drop.stopCalls).toBeGreaterThanOrEqual(1)
      expect(ceremonySources.filter(source => source.id !== 'cer-drop').every(source => source.stopCalls >= 1)).toBe(true)
      expect(log().filter(line => line.id.startsWith('cer-') && line.id !== 'cer-drop').every(line => line.outcome === 'cancelled')).toBe(true)
      expect(log().find(line => line.id === 'cer-drop')!.outcome).toBe('scheduled')
      expect(started().filter(source => !source.id!.startsWith('cer-'))).toHaveLength(wheelCues)
      expect(started().filter(source => !source.id!.startsWith('cer-')).every(source => source.stopCalls === 0)).toBe(true)

      await new Promise(resolve => setTimeout(resolve, 100))
      expect(started()).toHaveLength(CEREMONY_CUES + wheelCues)
    })
  })

  describe.each<[string, string]>([['skips it („Überspringen“)', 'Überspringen'], ['closes it', 'Schließen']])('a viewer who %s mid-fanfare', (_name, label) => {
    it('stops the fanfare and the crowd that sound, schedules nothing more and leaves the read\'s own plan alone', async () => {
      const read = wheel()
      const ceremony = stampIn(1000, 'trip')
      await mount(serveFinished({ host, ceremony, wheel: read }).slug)
      await vi.waitFor(() => expect(started().map(source => source.id)).toContain('cer-crowd'), { timeout: 5000 })
      await fanfareSounds(ceremony, 'trip')
      expect(log().filter(line => line.id === 'cer-fanfare' || line.id === 'cer-crowd').map(line => line.outcome)).toEqual(['scheduled', 'scheduled'])
      const wheelCues = started().filter(source => !source.id!.startsWith('cer-')).length
      expect(wheelCues).toBeGreaterThan(0)

      await vi.waitFor(() => expect(dialogButton(label)).toBeDefined(), { timeout: 5000 })
      const before = started().length
      dialogButton(label)!.click()
      await flushPromises()
      await new Promise(resolve => setTimeout(resolve, 20))

      for (const id of ['cer-fanfare', 'cer-crowd']) {
        expect(started().find(source => source.id === id)!.stopCalls, id).toBeGreaterThanOrEqual(1)
      }
      expect(started().filter(source => !source.id!.startsWith('cer-')).every(source => source.stopCalls === 0)).toBe(true)

      await new Promise(resolve => setTimeout(resolve, 100))
      expect(started()).toHaveLength(before)
      expect(started().filter(source => !source.id!.startsWith('cer-'))).toHaveLength(wheelCues)
    })
  })

  it('sounds a replay („Nochmal ansehen“) from the click, on this device only', async () => {
    const ceremony = ceremonyIn(2000, 'trip')
    const served = serveFinished({ host, ceremony })
    await mount(served.slug)
    await settled(CEREMONY_CUES)
    await vi.waitFor(() => expect(dialogButton('Überspringen')).toBeDefined(), { timeout: 5000 })
    dialogButton('Überspringen')!.click()
    await vi.waitFor(() => expect(dialogButton('Nochmal ansehen')).toBeDefined(), { timeout: 5000 })

    const clicked = Date.now()
    dialogButton('Nochmal ansehen')!.click()
    await settled(2 * CEREMONY_CUES)

    const replay = log().slice(CEREMONY_CUES)
    expect(replay.map(line => line.id)).toEqual(planAt(0, 'trip').map(cue => cue.id))
    expect(replay[0]!.id).toBe('cer-drop')
    for (const line of replay) expect(line.at).toBeGreaterThanOrEqual(clicked)
    expect(shapeOf(replay)).toEqual(planAt(replay[0]!.at, 'trip'))
    expect(served.posts()).toBe(0)
  })

  it('sounds nothing, logs nothing and requests no file with Ton off', async () => {
    localStorage.setItem('compies-sound', 'off')
    await mount(serveFinished({ host, ceremony: ceremonyIn(4000, 'trip') }).slug)
    await flushPromises()
    await new Promise(resolve => setTimeout(resolve, 80))

    expect(started()).toEqual([])
    expect(log()).toEqual([])
    expect(requested()).toEqual([])
  })

  it('cancels the rest, and stops a source that already sounds, when Ton is switched off mid-run', async () => {
    await mount(serveFinished({ host, ceremony: ceremonyIn(3000, 'trip') }).slug)
    await settled(CEREMONY_CUES)

    useState('sound-enabled').value = false
    await flushPromises()

    expect(log().every(line => line.outcome === 'cancelled')).toBe(true)
    expect(started().every(source => source.stopCalls >= 1)).toBe(true)
  })

  it('stops the fanfare that sounds, and cancels what is pending, when Ton is switched off mid-fanfare', async () => {
    const ceremony = stampIn(1000, 'trip')
    await mount(serveFinished({ host, ceremony }).slug)
    await vi.waitFor(() => expect(started().map(source => source.id)).toContain('cer-crowd'), { timeout: 5000 })
    await fanfareSounds(ceremony, 'trip')

    useState('sound-enabled').value = false
    await flushPromises()

    expect(started().find(source => source.id === 'cer-fanfare')!.stopCalls).toBeGreaterThanOrEqual(1)
    expect(started().find(source => source.id === 'cer-crowd')!.stopCalls).toBeGreaterThanOrEqual(1)
    // What already sounds keeps its line (the stamp, the fanfare, the crowd); nothing else is left to sound.
    expect(log().filter(line => line.outcome === 'scheduled').map(line => line.id)).toEqual(['cer-stamp', 'cer-fanfare', 'cer-crowd'])
  })

  it('plays the fanfare alone under reduced motion, at the start, and requests its files', async () => {
    motion('reduced')
    const ceremony = ceremonyIn(4000, 'trip')
    await mount(serveFinished({ host, ceremony }).slug)
    await vi.waitFor(() => expect(requestedOf('ceremony')).toEqual(expect.arrayContaining(OWN_FILES)), { timeout: 5000 })
    await settled(1)

    expect(log().map(line => line.id)).toEqual(['cer-fanfare'])
    expect(log()[0]!.at).toBe(Date.parse(ceremony.startsAt))
    expect(started().map(source => source.id)).toEqual(['cer-fanfare'])
  })

  it('gives a late joiner under reduced motion no fanfare that has passed', async () => {
    motion('reduced')
    await mount(serveFinished({ host, ceremony: ceremonyIn(-2500, 'trip') }).slug)
    await vi.waitFor(() => expect(requestedOf('ceremony')).toEqual(expect.arrayContaining(OWN_FILES)), { timeout: 5000 })
    await flushPromises()
    await new Promise(resolve => setTimeout(resolve, 50))

    expect(started().map(source => source.id)).not.toContain('cer-fanfare')
    expect(log().filter(line => line.outcome === 'scheduled' || line.outcome === 'late')).toEqual([])
  })

  it('plays the fanfare alone on this device when a replay is asked for under reduced motion, and sends no request', async () => {
    motion('reduced')
    const served = serveFinished({ host, ceremony: ceremonyIn(-ceremonyTimeline({ partyCount: PARTIES, winners: 1, gag: 'trip' }).endMs - 500, 'trip') })
    const page = await mount(served.slug)

    await vi.waitFor(() => expect(requestedOf('ceremony')).toEqual(expect.arrayContaining(OWN_FILES)), { timeout: 5000 })
    const button = await vi.waitFor(() => {
      const found = page.findAll('main button').find(candidate => candidate.text() === 'Siegerehrung ansehen')
      expect(found).toBeDefined()
      return found!
    }, { timeout: 5000 })
    const sounded = log().length

    const clicked = Date.now()
    await button.trigger('click')
    await vi.waitFor(() => expect(log().length).toBeGreaterThan(sounded), { timeout: 5000 })
    await flushPromises()

    const replay = log().slice(sounded)
    expect(replay.map(line => line.id)).toEqual(['cer-fanfare'])
    expect(replay[0]!.at).toBeGreaterThanOrEqual(clicked)
    expect(served.posts()).toBe(0)
  })

  it('is silent for a Tie (#745), and its files are still requested', async () => {
    await mount(serveFinished({ host, tie: true, ceremony: ceremonyIn(4000, 'trip', 2) }).slug)
    await vi.waitFor(() => expect(requestedOf('ceremony')).toEqual(expect.arrayContaining(OWN_FILES)), { timeout: 5000 })
    await flushPromises()
    await new Promise(resolve => setTimeout(resolve, 50))

    expect(started()).toEqual([])
  })

  it('cuts what is left when the GSAP chunk fails to load at the start (the static end frame has no show)', async () => {
    chunk.fail = true
    await mount(serveFinished({ host, ceremony: ceremonyIn(2000, 'trip') }).slug)
    await settled(CEREMONY_CUES)

    // The layer opens at the start instant, asks for the chunk and gives up.
    await vi.waitFor(() => expect(log().filter(line => line.id !== 'cer-drop').every(line => line.outcome === 'cancelled')).toBe(true), { timeout: 5000 })
    expect(started().filter(source => source.id !== 'cer-drop').every(source => source.stopCalls >= 1)).toBe(true)
  })
})
