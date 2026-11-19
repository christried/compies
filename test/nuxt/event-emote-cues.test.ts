import { mockNuxtImport, mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import EventPage from '~/pages/e/[slug]/index.vue'
import type { RoomSocketOptions } from '~/utils/room-socket'
import { cueFilesOf } from '~/utils/sound-cues'
import type { EmoteId } from '~~/shared/emote'
import { envelope, type RoomMessage } from '~~/shared/realtime'
import { defaultSettings } from '~~/shared/settings'
import { kitty } from './auth'
import { cueLog, filesReady, quiet, requestedOf, requests, resetRequests, serveCueFiles, setUpCuePage, startedOf, tearDownCuePage } from './cue-harness'
import { LARSI, restoreScreen, stubScreen, viewWithSessions } from './event-page'
import { ENDED, FIRST, members, SESSION, STARTED, team } from './event-page-states'

// The Emotes' sounds on the Event page (#770, spec #719 § C): an `emote.sent` that reaches the page plays its cue through the page's player, for the Host's
// read and a Member's alike, at the full volume for the viewer's own Emote and at 60 % for another's, and it plays whether or not the draw happens. The room
// is the fake socket of test/nuxt/event-emotes.test.ts; the player is the fake audio context of test/fake-audio.ts and the log is the staging build's.
// The rule itself (`emoteCue`) is tested in test/unit/sound-cues.test.ts, the player's volume in test/unit/cue-player.test.ts.

const { sockets, createRoomSocket } = vi.hoisted(() => {
  const sockets: { options: RoomSocketOptions, close: ReturnType<typeof vi.fn>, reconnect: ReturnType<typeof vi.fn>, send: ReturnType<typeof vi.fn> }[] = []
  return {
    sockets,
    createRoomSocket: vi.fn((options: RoomSocketOptions) => {
      const socket = { options, close: vi.fn(), reconnect: vi.fn(), send: vi.fn() }
      sockets.push(socket)
      return socket
    }),
  }
})
mockNuxtImport('createRoomSocket', () => createRoomSocket)

serveCueFiles()

const EMOTE_FILES = cueFilesOf(['emote'])
const OTHERS = { clap: 0.27, tears: 0.27, angry: 0.27, roar: 0.33 } satisfies Record<EmoteId, number>
const OWN = { clap: 0.45, tears: 0.45, angry: 0.45, roar: 0.55 } satisfies Record<EmoteId, number>
const FILE_OF = { clap: 'emo-clap', tears: 'emo-haha', angry: 'emo-grr', roar: 'emo-roar' } as const

let testNumber = 0
let mounted: Awaited<ReturnType<typeof mountSuspended>> | undefined

interface Setup { host?: boolean, finished?: boolean }

/** An Event that is set up (Standings and a board, Larsi in a team), or a finished one, with a live room whose clock has answered. */
async function mountLive({ host = false, finished = false }: Setup = {}) {
  testNumber += 1
  const slug = `emote-cues-${testNumber}`
  registerEndpoint(`/api/e/${slug}`, {
    method: 'GET',
    handler: () => viewWithSessions(slug, [finished ? SESSION(1, FIRST, { startedAt: STARTED, endedAt: ENDED }) : SESSION(1, FIRST)], 0, {
      event: { phase: finished ? 'finished' : 'poll', isHost: host },
      settings: defaultSettings(),
      teams: [team(1), team(2)],
      members: members({ larsi: { zone: 'team', team: 1 } }),
      standings: [{ team: 1, rank: 1, points: 0 }, { team: 2, rank: 1, points: 0 }],
      end: { played: 0, gameCount: 6, complete: false, tie: null, finish: null, lastGame: null },
    }),
  })
  registerEndpoint(`/api/e/${slug}/activity`, { method: 'GET', handler: () => ({ entries: [], next: null }) })
  registerEndpoint(`/api/e/${slug}/room`, { method: 'POST', handler: () => ({ url: 'https://rt.test', room: `event-id-${slug}`, token: 'token' }) })
  mounted = await mountSuspended(EventPage, { route: `/e/${slug}`, attachTo: document.body })
  await vi.waitFor(() => expect(sockets.length).toBeGreaterThan(0))
  await settle()
  vi.mocked(Element.prototype.animate).mockClear()
  return mounted
}

const lastSocket = () => sockets[sockets.length - 1]!
const settle = () => new Promise(resolve => setTimeout(resolve))
/** An `emote.sent` as the room sends it; `serverTime` is the envelope's, the instant the room stamped it. */
const say = (userId: string, emote: EmoteId, { sound = true, serverTime = Date.now() }: { sound?: boolean, serverTime?: number } = {}) =>
  lastSocket().options.onMessage(JSON.stringify(envelope({ type: 'emote.sent', userId, emote, sound } as RoomMessage, serverTime)))

/** The room opens and answers the clock's first probe with its own time, so the page's clock is ready and the player exists. */
async function openRoom() {
  lastSocket().options.onOpen()
  await vi.waitFor(() => expect(lastSocket().send.mock.calls.some(([text]) => String(text).includes('clock.ping'))).toBe(true))
  const ping = lastSocket().send.mock.calls.map(([text]) => JSON.parse(String(text)) as { type: string, t0: number }).find(message => message.type === 'clock.ping')!
  lastSocket().options.onMessage(JSON.stringify(envelope({ type: 'clock.pong', t0: ping.t0 } as RoomMessage, Date.now())))
  await settle()
}

/** An Event page whose room is open and whose Emote files are decoded. */
async function ready(setup: Setup = {}) {
  const page = await mountLive(setup)
  await openRoom()
  await filesReady('emote')
  return page
}

const emoteLog = () => cueLog().filter(entry => entry.id.startsWith('emo-'))
const rises = () => [...document.querySelectorAll<HTMLElement>('[data-emote]')]

const AT: Record<string, { left: number, top: number }> = { [kitty.id]: { left: 40, top: 300 }, [LARSI]: { left: 200, top: 120 } }
function stubRects() {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const { left, top } = AT[this.getAttribute('data-user-id') ?? ''] ?? { left: 0, top: 0 }
    return { left, top, width: 44, height: 44, right: left + 44, bottom: top + 44, x: left, y: top, toJSON() {} } as DOMRect
  })
}

const realAnimate = Element.prototype.animate

beforeEach(() => {
  setUpCuePage({ staging: true })
  stubScreen(true)
  sockets.length = 0
  useRuntimeConfig().public.realtimeUrl = 'https://rt.test'
  stubRects()
  // An animation that does not end by itself: the rise stays in the document for the test to look at.
  Element.prototype.animate = vi.fn(() => ({ finished: new Promise<void>(() => {}), cancel() {} })) as unknown as typeof Element.prototype.animate
})

afterEach(() => {
  mounted?.unmount()
  mounted = undefined
  Element.prototype.animate = realAnimate
  useRuntimeConfig().public.realtimeUrl = ''
  restoreScreen()
  document.body.innerHTML = ''
  tearDownCuePage()
})

describe.each([{ host: false }, { host: true }])('the Emotes\' sounds, Host $host', ({ host }) => {
  it('plays the cue of another Member\'s Emote at 60 % of its volume, and logs it scheduled at that volume', async () => {
    await ready({ host })

    for (const emote of ['clap', 'tears', 'angry', 'roar'] as const) say(LARSI, emote)
    await settle()

    for (const emote of ['clap', 'tears', 'angry', 'roar'] as const) {
      const sources = startedOf(FILE_OF[emote])
      expect(sources, emote).toHaveLength(1)
      expect(sources[0]!.gain, emote).toBeCloseTo(OTHERS[emote], 6)
    }
    expect(emoteLog().map(entry => [entry.id, entry.outcome])).toEqual([['emo-clap', 'scheduled'], ['emo-haha', 'scheduled'], ['emo-grr', 'scheduled'], ['emo-roar', 'scheduled']])
    expect(emoteLog().at(-1)!.volume).toBeCloseTo(0.33, 6)
  })

  it('plays the viewer\'s own Emote, which the room passes back, at the cue\'s full volume', async () => {
    await ready({ host })

    say(kitty.id, 'tears')
    say(kitty.id, 'roar')
    await settle()

    expect(startedOf('emo-haha')[0]!.gain).toBeCloseTo(OWN.tears, 6)
    expect(startedOf('emo-roar')[0]!.gain).toBeCloseTo(OWN.roar, 6)
    expect(emoteLog().map(entry => [entry.id, entry.volume])).toEqual([['emo-haha', 0.45], ['emo-roar', 0.55]])
  })

  it('plays several at once, each its own source, with no cap of its own', async () => {
    await ready({ host })

    for (let n = 0; n < 5; n++) say(LARSI, 'clap')
    await settle()

    expect(startedOf('emo-clap')).toHaveLength(5)
    expect(emoteLog()).toHaveLength(5)
  })

  it('is silent for an Emote the room marked without a sound, the own one too, and the rise is still drawn', async () => {
    await ready({ host })

    say(LARSI, 'tears', { sound: false })
    say(kitty.id, 'roar', { sound: false })
    await settle()
    await quiet()

    expect(startedOf('emo-haha')).toEqual([])
    expect(startedOf('emo-roar')).toEqual([])
    expect(emoteLog()).toEqual([])
    expect(rises().map(rise => rise.getAttribute('data-emote')).sort()).toEqual(['roar', 'tears'])
  })

  it('plays and logs nothing while Ton is off', async () => {
    localStorage.setItem('compies-sound', 'off')
    await mountLive({ host })
    await openRoom()

    say(LARSI, 'clap')
    say(kitty.id, 'clap')
    await settle()
    await quiet()

    expect(startedOf('emo-clap')).toEqual([])
    expect(emoteLog()).toEqual([])
    expect(rises()).toHaveLength(2)
  })

  it('skips an Emote stamped 2500 ms ago and plays one stamped 1500 ms ago', async () => {
    await ready({ host })

    say(LARSI, 'clap', { serverTime: Date.now() - 2500 })
    await settle()
    await quiet()
    expect(startedOf('emo-clap')).toEqual([])
    expect(emoteLog()).toEqual([])

    say(LARSI, 'clap', { serverTime: Date.now() - 1500 })
    await settle()
    expect(startedOf('emo-clap')).toHaveLength(1)
    expect(emoteLog()).toHaveLength(1)
  })

  it('plays an Emote whose sender has no avatar in the document, which draws nothing: the cue does not wait for the draw (#769)', async () => {
    await ready({ host })

    say('00000000-0000-4000-8000-0000000000ff', 'angry')
    await settle()

    expect(rises()).toEqual([])
    expect(startedOf('emo-grr')).toHaveLength(1)
    expect(startedOf('emo-grr')[0]!.gain).toBeCloseTo(OTHERS.angry, 6)
    expect(emoteLog()).toHaveLength(1)
  })

  it('requests the four files once each for an Event that is set up and not finished', async () => {
    await ready({ host })

    expect(requestedOf('emote')).toEqual([...EMOTE_FILES].sort())
    for (const id of EMOTE_FILES) expect(requests[id], id).toBe(1)
  })

  it('requests none of them for a finished Event, and logs an Emote that still arrives there skipped', async () => {
    resetRequests()
    const page = await mountLive({ host, finished: true })
    await openRoom()
    await vi.waitFor(() => expect(requests['cer-fanfare']).toBeGreaterThan(0))
    expect(requestedOf('emote')).toEqual([])

    say(LARSI, 'clap')
    await settle()
    await quiet()

    expect(startedOf('emo-clap')).toEqual([])
    expect(emoteLog().map(entry => entry.outcome)).toEqual(['skipped'])
    expect(page.exists()).toBe(true)
  })
})
