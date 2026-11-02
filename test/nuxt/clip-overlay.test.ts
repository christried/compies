import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ClipOverlay from '~/components/ClipOverlay.vue'
import type { ClipView } from '~~/shared/event'
import type { RoundGame } from '~~/shared/game'
import { restoreScreen, stubScreen } from './event-page'

// The synced clip (#230, 04-motion § Clip overlay and § Synchronised moments): the YouTube player started at the second every device
// is at, the sound rules of a desktop and a phone, what stays on this device (mute, close), the Host's skip, and the game's card when
// the game has no video. The IFrame API is a stub that records what the overlay asks of it; the server's clock is a variable.

const START = Date.UTC(2090, 10, 7, 20, 0, 0)
const iso = (ms: number) => new Date(ms).toISOString()

const halo: RoundGame = { id: 'g-halo', name: 'Halo', imageUrl: null, youtubeId: 'aaaaaaaaaaa', clipStart: 90, clipLength: 30, playersMin: 2, playersMax: 4, suitabilities: [] }
const kart: RoundGame = { ...halo, id: 'g-kart', name: 'Kart', youtubeId: null }
const clipOf = (game: RoundGame = halo): ClipView => ({ drawId: 'd1', startAt: iso(START), endsAt: iso(START + game.clipLength * 1000), game })

interface PlayerStub {
  options: { videoId: string, playerVars: Record<string, number>, events: { onReady?: () => void, onStateChange?: (event: { data: number }) => void, onAutoplayBlocked?: () => void, onError?: () => void } }
  loadVideoById: ReturnType<typeof vi.fn>
  seekTo: ReturnType<typeof vi.fn>
  mute: ReturnType<typeof vi.fn>
  unMute: ReturnType<typeof vi.fn>
  playVideo: ReturnType<typeof vi.fn>
  destroy: ReturnType<typeof vi.fn>
  getCurrentTime: ReturnType<typeof vi.fn>
}
let players: PlayerStub[]
let serverMs: number
let page: Awaited<ReturnType<typeof mountSuspended>> | undefined
let skip: ReturnType<typeof vi.fn<() => Promise<boolean>>>
let fetched: unknown[]

function stubYouTube() {
  class Player {
    options: PlayerStub['options']
    loadVideoById = vi.fn()
    seekTo = vi.fn()
    mute = vi.fn()
    unMute = vi.fn()
    playVideo = vi.fn()
    destroy = vi.fn()
    getCurrentTime = vi.fn(() => 0)
    constructor(_element: HTMLElement, options: PlayerStub['options']) {
      this.options = options
      players.push(this as unknown as PlayerStub)
    }
  }
  window.YT = { Player, PlayerState: { PLAYING: 1 } } as unknown as typeof window.YT
}

async function mount(clip: ClipView, { isHost = false, desktop = true }: { isHost?: boolean, desktop?: boolean } = {}) {
  stubScreen(desktop)
  page = await mountSuspended(ClipOverlay, { props: { clip, isHost, serverNow: () => serverMs, skip } })
  await flushPromises()
  return page
}

/** The player is ready: the overlay now loads the video. */
async function ready(player = players[0]!) {
  player.options.events.onReady?.()
  await flushPromises()
}

/** Moves the server's clock and lets the overlay's tick see it. */
async function passTime(ms: number) {
  serverMs += ms
  vi.advanceTimersByTime(ms)
  await flushPromises()
}

/** The overlay's buttons: the name a User hears (the icon buttons' aria-label, else the text). */
const buttons = () => [...(page?.element.querySelectorAll('button') ?? [])].map(element => ({ element, name: element.getAttribute('aria-label') ?? element.textContent?.replace(/\s+/g, ' ').trim() ?? '' }))
const labels = () => buttons().map(button => button.name)
/** Clicks the button with this name. The timers are fake here, so not event-page.ts's clickIconButton. */
async function press(label: string) {
  const button = buttons().find(candidate => candidate.name === label)
  expect(button, label).toBeDefined()
  button!.element.click()
  await flushPromises()
}
const text = () => page!.text().replace(/\s+/g, ' ')

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
  players = []
  serverMs = START
  skip = vi.fn(() => Promise.resolve(true))
  fetched = []
  stubYouTube()
  // Nothing may be sent by a device-only action: any request is recorded.
  vi.stubGlobal('$fetch', (...args: unknown[]) => {
    fetched.push(args)
    return Promise.resolve({})
  })
  try {
    localStorage.removeItem('compies-sound')
  }
  catch {
    // Storage blocked: the default (sound on) stands.
  }
})

afterEach(() => {
  page?.unmount()
  page = undefined
  restoreScreen()
  delete window.YT
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('the video', () => {
  it('starts at the clip\'s start second at the start, and stops at the clip\'s last second', async () => {
    await mount(clipOf())
    await ready()

    expect(players).toHaveLength(1)
    expect(players[0]!.options.videoId).toBe('aaaaaaaaaaa')
    expect(players[0]!.loadVideoById).toHaveBeenCalledWith({ videoId: 'aaaaaaaaaaa', startSeconds: 90, endSeconds: 120 })
  })

  it('lands a late joiner on the second everybody else is at', async () => {
    serverMs = START + 12_500
    await mount(clipOf())
    await ready()

    expect(players[0]!.loadVideoById).toHaveBeenCalledWith({ videoId: 'aaaaaaaaaaa', startSeconds: 102.5, endSeconds: 120 })
  })

  it('plays from the start second when this device\'s estimate of the server is a hair early', async () => {
    serverMs = START - 40
    await mount(clipOf())
    await ready()

    expect(players[0]!.loadVideoById).toHaveBeenCalledWith({ videoId: 'aaaaaaaaaaa', startSeconds: 90, endSeconds: 120 })
  })

  it('seeks once when the player is more than a second off after 3 s of playback', async () => {
    await mount(clipOf())
    await ready()
    const player = players[0]!
    player.options.events.onStateChange?.({ data: 1 })
    player.getCurrentTime.mockReturnValue(90)

    await passTime(3000)
    expect(player.seekTo).toHaveBeenCalledWith(93, true)

    // Only once: more states and more time seek no more.
    player.options.events.onStateChange?.({ data: 1 })
    await passTime(5000)
    expect(player.seekTo).toHaveBeenCalledTimes(1)
  })

  it('leaves a player that is within a second alone', async () => {
    await mount(clipOf())
    await ready()
    const player = players[0]!
    player.options.events.onStateChange?.({ data: 1 })
    player.getCurrentTime.mockReturnValue(92.4)

    await passTime(3000)

    expect(player.seekTo).not.toHaveBeenCalled()
  })

  it('closes by itself at the end instant, without a refetch, and lets the player go', async () => {
    await mount(clipOf())
    await ready()
    expect(page!.find('section').exists()).toBe(true)

    await passTime(29_900)
    expect(page!.find('section').exists()).toBe(true)
    await passTime(100)

    expect(page!.find('section').exists()).toBe(false)
    expect(players[0]!.destroy).toHaveBeenCalled()
  })

  it('does not open a clip that has run out already', async () => {
    serverMs = START + 31_000
    await mount(clipOf())

    expect(page!.find('section').exists()).toBe(false)
    expect(players).toHaveLength(0)
  })
})

describe('the sound', () => {
  it('starts with sound on a desktop', async () => {
    await mount(clipOf())
    await ready()

    expect(players[0]!.unMute).toHaveBeenCalled()
    expect(players[0]!.mute).not.toHaveBeenCalled()
    expect(labels()).not.toContain('Ton aktivieren')
  })

  it('starts muted on a phone and asks for the tap with „Ton aktivieren“, which turns the sound on', async () => {
    await mount(clipOf(), { desktop: false })
    await ready()
    expect(players[0]!.mute).toHaveBeenCalled()
    expect(text()).toContain('Ton aktivieren')

    await press('Ton aktivieren')

    expect(players[0]!.unMute).toHaveBeenCalled()
    expect(text()).not.toContain('Ton aktivieren')
  })

  it('starts muted on a desktop when the User\'s own sound setting is off, and does not nag', async () => {
    localStorage.setItem('compies-sound', 'off')
    await mount(clipOf())
    await ready()

    expect(players[0]!.mute).toHaveBeenCalled()
    expect(text()).not.toContain('Ton aktivieren')
  })

  it('plays muted and shows „Ton aktivieren“ when the browser blocks the start with sound', async () => {
    await mount(clipOf())
    await ready()
    serverMs += 400

    players[0]!.options.events.onAutoplayBlocked?.()
    await flushPromises()

    expect(players[0]!.mute).toHaveBeenCalled()
    expect(players[0]!.loadVideoById).toHaveBeenLastCalledWith({ videoId: 'aaaaaaaaaaa', startSeconds: 90.4, endSeconds: 120 })
    expect(text()).toContain('Ton aktivieren')
    expect(text()).toContain('Dein Browser hat den Ton blockiert')
  })

  it('does the same when the player is not PLAYING after about a second', async () => {
    await mount(clipOf())
    await ready()

    await passTime(1000)

    expect(players[0]!.mute).toHaveBeenCalled()
    expect(text()).toContain('Ton aktivieren')
  })

  it('does not fall back when the player started in time', async () => {
    await mount(clipOf())
    await ready()
    players[0]!.options.events.onStateChange?.({ data: 1 })

    await passTime(1500)

    expect(players[0]!.mute).not.toHaveBeenCalled()
    expect(text()).not.toContain('Ton aktivieren')
  })
})

describe('what stays on this device', () => {
  it('mutes and unmutes the player without sending anything', async () => {
    await mount(clipOf())
    await ready()

    await press('Ton aus')
    expect(players[0]!.mute).toHaveBeenCalled()
    expect(labels()).toContain('Ton an')

    await press('Ton an')
    expect(players[0]!.unMute).toHaveBeenCalledTimes(2)
    expect(fetched).toEqual([])
    expect(skip).not.toHaveBeenCalled()
  })

  it('closes the clip for this device only: nothing is sent, and the player is let go', async () => {
    await mount(clipOf(), { isHost: true })
    await ready()

    await press('Für mich schließen')

    expect(page!.find('section').exists()).toBe(false)
    expect(players[0]!.destroy).toHaveBeenCalled()
    expect(fetched).toEqual([])
    expect(skip).not.toHaveBeenCalled()
  })
})

describe('the Host\'s skip', () => {
  it('is offered to the Host, who sends it for everyone', async () => {
    await mount(clipOf(), { isHost: true })

    expect(labels()).toContain('Clip überspringen')
    await press('Clip überspringen')

    expect(skip).toHaveBeenCalledTimes(1)
  })

  it('is not offered to anyone else', async () => {
    await mount(clipOf(), { isHost: false })

    expect(text()).not.toContain('Clip überspringen')
  })
})

describe('a game without a video', () => {
  it('shows the game\'s card for the clip\'s length instead of the player', async () => {
    await mount(clipOf(kart))

    expect(players).toHaveLength(0)
    expect(text()).toContain('Kart')
    expect(page!.find('[role="group"]').exists()).toBe(false)

    await passTime(30_000)
    expect(page!.find('section').exists()).toBe(false)
  })

  it('shows the card when the player cannot play the video', async () => {
    await mount(clipOf())
    players[0]!.options.events.onError?.()
    await flushPromises()

    expect(text()).toContain('Halo')
    expect(page!.find('[role="group"]').exists()).toBe(false)
  })
})

describe('how it opens and closes (04-motion § Clip overlay)', () => {
  it('opens with scale and opacity over 0.36 s ease-out and closes with 0.22 s ease-in', async () => {
    await mount(clipOf())

    const transition = page!.findComponent({ name: 'Transition' })
    // The classes are the theme's: animate-clip-in is cp-clip-in (scale .96 to 1, opacity) over --cp-dur-slow (360 ms) with --cp-ease-out;
    // dur-base is 220 ms and ease-in is --cp-ease-in.
    expect(transition.props('enterActiveClass')).toBe('animate-clip-in')
    expect(transition.props('leaveActiveClass')).toBe('transition-opacity dur-base ease-in')
    expect(transition.props('leaveToClass')).toBe('opacity-0')
  })
})
