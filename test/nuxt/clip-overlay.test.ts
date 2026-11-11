import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ClipOverlay from '~/components/ClipOverlay.vue'
import type { ClipView } from '~~/shared/stage'
import type { RoundGame } from '~~/shared/game'
import { restoreScreen, stubScreen } from './event-page'

// The synced clip (#230, 04-motion § Clip overlay and § Synchronised moments): the YouTube player started at the second every device
// is at, the sound rules of a desktop and a phone, what stays on this device (mute, close), the Host's skip, and the game's card when
// the game has no video. The IFrame API is a stub that records what the overlay asks of it; the server's clock is a variable.

const START = Date.UTC(2090, 10, 7, 20, 0, 0)
const iso = (ms: number) => new Date(ms).toISOString()

const halo: RoundGame = { id: 'g-halo', name: 'Halo', imageUrl: null, youtubeId: 'aaaaaaaaaaa', clipStart: 90, clipLength: 30, playersMin: 2, playersMax: 4, suitabilities: [], price: null }
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
  getPlayerState: ReturnType<typeof vi.fn>
  /** The iframe the API put in place of the host element, as in production. */
  iframe: HTMLIFrameElement
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
    getPlayerState = vi.fn(() => 2)
    iframe: HTMLIFrameElement
    constructor(element: HTMLElement, options: PlayerStub['options']) {
      this.options = options
      // The API replaces the element it is given by an iframe.
      this.iframe = document.createElement('iframe')
      element.replaceWith(this.iframe)
      players.push(this as unknown as PlayerStub)
    }
  }
  window.YT = { Player, PlayerState: { PLAYING: 1, PAUSED: 2 } } as unknown as typeof window.YT
}

/** `stubChildren`: the child components keep the tag and classes the overlay writes on them and drop their own output (#546). */
async function mount(clip: ClipView, { isHost = false, desktop = true, stubChildren = false }: { isHost?: boolean, desktop?: boolean, stubChildren?: boolean } = {}) {
  stubScreen(desktop)
  const global = stubChildren ? { stubs: { AppButton: true, IconButton: true, GameCard: true } } : {}
  page = await mountSuspended(ClipOverlay, { props: { clip, isHost, serverNow: () => serverMs, skip }, global })
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

const stageOf = () => page!.element.querySelector('[role="group"]') as HTMLElement

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

  it('shows a Member no status over or under the video (#356)', async () => {
    await mount(clipOf(), { isHost: false })

    expect(text()).not.toContain('läuft für alle')
    expect(page!.element.querySelector('.animate-live')).toBeNull()
    expect(page!.element.querySelector('[role="progressbar"]')).not.toBeNull()
  })

  it('puts the Host\'s status in the footer next to „Clip überspringen“, as a dot and text, no pill (#356)', async () => {
    await mount(clipOf(), { isHost: true })

    const status = [...page!.element.querySelectorAll('span')].find(span => span.textContent?.trim() === 'läuft für alle')!
    const skipButton = buttons().find(button => button.name === 'Clip überspringen')!.element
    expect(status).toBeDefined()
    expect(status.parentElement!.contains(skipButton)).toBe(true)
    expect(status.nextElementSibling).toBe(skipButton)
    const dot = status.firstElementChild!
    expect(dot.classList).toContain('size-2')
    expect(dot.classList).toContain('rounded-full')
    expect(dot.classList).toContain('animate-live')
    expect(dot.getAttribute('aria-hidden')).toBe('true')
    expect(status.classList).not.toContain('border')
    expect(status.classList).not.toContain('rounded-pill')
    expect(page!.element.querySelector('.aspect-video')!.contains(status)).toBe(false)
  })

  it('shows the Host\'s status in the footer for a game without a video too, not over the card (#356)', async () => {
    await mount(clipOf(kart), { isHost: true })

    expect(text()).toContain('läuft für alle')
    expect(page!.element.querySelector('.aspect-video')!.textContent).not.toContain('läuft für alle')
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

  it('offers no „Ton aktivieren“ on a phone: there is no sound to unlock (F22)', async () => {
    await mount(clipOf(kart), { desktop: false })

    expect(text()).not.toContain('Ton aktivieren')
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

describe('the motion of the running clip', () => {
  it('eases the bar over one tick, and pulses the LIVE dot through a calm twin of its own', async () => {
    await mount(clipOf(), { isHost: true })
    await ready()

    const bar: HTMLElement = page!.element.querySelector('[role="progressbar"] > span')!
    expect(bar.style.transitionDuration).toBe('250ms')
    expect(bar.classList).not.toContain('duration-250')
    expect(page!.element.querySelector('.size-2.rounded-full')!.classList).toContain('animate-live')
  })
})

describe('no input (#509)', () => {

  it('shuts the player\'s container to pointer input and focus, whatever iframe the API puts in it', async () => {
    await mount(clipOf())
    await ready()
    const stage = stageOf()
    const { iframe } = players[0]!

    expect(stage.hasAttribute('inert')).toBe(true)
    expect(stage.classList).toContain('pointer-events-none')
    expect(stage.contains(iframe)).toBe(true)
    expect(iframe.closest('[inert]')).toBe(stage)
    expect(iframe.closest('.pointer-events-none')).toBe(stage)
  })

  it.each([
    ['a Member', false, ['Ton aus', 'Für mich schließen']],
    ['the Host', true, ['Ton aus', 'Clip überspringen', 'Für mich schließen']],
  ])('leaves nothing to focus but the bar\'s buttons for %s, and those are outside the inert part', async (_who, isHost, expected) => {
    await mount(clipOf(), { isHost })
    await ready()

    const focusable = [...page!.element.querySelectorAll('a[href], button, input, select, textarea, iframe, [tabindex]')].filter(element => !element.closest('[inert]'))
    expect(focusable.every(element => element.tagName === 'BUTTON')).toBe(true)
    expect(labels()).toEqual(expected)
    expect(focusable).toHaveLength(expected.length)
    expect(buttons().every(button => !button.element.closest('[inert], .pointer-events-none'))).toBe(true)
  })

  it('keeps „Ton aktivieren“ outside the inert part on a phone', async () => {
    await mount(clipOf(), { desktop: false })
    await ready()

    const enable = buttons().find(button => button.name === 'Ton aktivieren')
    expect(enable).toBeDefined()
    expect(enable!.element.closest('[inert], .pointer-events-none')).toBeNull()
  })

  it('asks the player for no keyboard, fullscreen or related videos, and no longer for modestbranding', async () => {
    await mount(clipOf())

    expect(players[0]!.options.playerVars).toEqual({ controls: 0, disablekb: 1, fs: 0, rel: 0, playsinline: 1 })
  })

  it('puts nothing over, under or around the player: YouTube\'s rule against covering an embedded player', async () => {
    await mount(clipOf(), { isHost: true })
    await ready()
    const section = page!.element.querySelector('section')!
    const wrapper = section.querySelector('.aspect-video') as HTMLElement
    const stage = stageOf()

    expect(wrapper.children).toHaveLength(1)
    expect(wrapper.children[0]).toBe(stage)
    expect(stage.children).toHaveLength(1)
    expect(stage.children[0]).toBe(players[0]!.iframe)
    expect(stage.querySelectorAll('*')).toHaveLength(1)
    const bar = section.querySelector('[role="progressbar"]')!
    expect(wrapper.compareDocumentPosition(bar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    for (const button of buttons()) expect(wrapper.compareDocumentPosition(button.element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})

/** Class tokens and style properties that could put an element over the player. Variants (md:, hover:, [&_x]:) are looked through. */
function coversPlayer(classes: string, style = ''): string[] {
  const tokens = classes.split(/\s+/).filter(Boolean).filter((token) => {
    const bare = token.slice(token.lastIndexOf(':') + 1).replace(/^!/, '')
    return /^(absolute|fixed|sticky)$/.test(bare) || /^-?(inset|top|right|bottom|left|translate|scale|rotate)(-|$)/.test(bare) || /^(z|layer)-/.test(bare) || /^-m/.test(bare)
  })
  const properties = /(^|;)\s*(position|top|right|bottom|left|inset[\w-]*|z-index|transform|translate|scale|rotate|margin[\w-]*)\s*:/.test(style) ? [`style="${style}"`] : []
  return [...tokens, ...properties]
}

describe('the overlay\'s own elements cover nothing (#546)', () => {
  it.each([
    'absolute', 'md:absolute', 'top-0', '-top-1', 'left-[3px]', 'right-2', 'bottom-0', 'inset-0', 'z-10', 'layer-clip', '-mt-2', 'hover:-translate-y-1', 'scale-110',
  ])('flags the class %s', (classes) => {
    expect(coversPlayer(classes)).not.toEqual([])
  })

  it.each(['position: absolute', 'top: 0', 'z-index: 5', 'transform: scale(2)'])('flags the style %s', (style) => {
    expect(coversPlayer('', style)).not.toEqual([])
  })

  it.each([
    ['relative size-full grid place-items-center', ''],
    ['mx-auto flex w-[min(720px,calc(100%-1.75rem))]', ''],
    ['bg-hot transition-[width] ease-linear', 'width: 50%; transition-duration: 250ms'],
  ])('lets %s with style "%s" through', (classes, style) => {
    expect(coversPlayer(classes, style)).toEqual([])
  })

  it('finds no element of the overlay with a position, an inset, a layer or a transform of its own, and no button inside it', async () => {
    await mount(clipOf(), { isHost: true, stubChildren: true })
    await ready()
    const section = page!.element.querySelector('section')!
    // The iframe is YouTube's, not the overlay's.
    const inStage = new Set(stageOf().querySelectorAll('*'))
    const own = [section, ...section.querySelectorAll('*')].filter(element => !inStage.has(element))
    // The section is placed by design (under the header, in front of the page); anything else on it still fails.
    const PLACED = (token: string) => ['fixed', 'inset-x-0', 'layer-clip'].includes(token) || token.startsWith('top-[calc(')
    const classesOf = (element: Element) => (element.getAttribute('class') ?? '').split(/\s+/).filter(token => element !== section || !PLACED(token)).join(' ')

    expect(own.flatMap(element => coversPlayer(classesOf(element), element.getAttribute('style') ?? ''))).toEqual([])
    expect(own.some(element => element.tagName === 'BUTTON')).toBe(false)
  })
})

describe('a paused player is resumed (#509)', () => {
  /** A player that has played, as after the start, and that is where the server says it should be. */
  async function playing() {
    await mount(clipOf())
    await ready()
    players[0]!.getCurrentTime.mockImplementation(() => 90 + (serverMs - START) / 1000)
    players[0]!.options.events.onStateChange?.({ data: 1 })
    return players[0]!
  }
  const pause = (player: PlayerStub) => player.options.events.onStateChange?.({ data: 2 })

  it('plays again at the synced second, and sends nothing', async () => {
    const player = await playing()
    serverMs = START + 10_000

    pause(player)

    expect(player.playVideo).toHaveBeenCalledTimes(1)
    expect(player.seekTo).toHaveBeenCalledTimes(1)
    expect(player.seekTo).toHaveBeenCalledWith(100, true)
    expect(player.playVideo.mock.invocationCallOrder[0]).toBeLessThan(player.seekTo.mock.invocationCallOrder[0]!)
    expect(fetched).toEqual([])
    expect(skip).not.toHaveBeenCalled()
  })

  it('leaves the start to the autoplay fallback: a pause before the first PLAYING is not resumed', async () => {
    await mount(clipOf())
    await ready()

    pause(players[0]!)

    expect(players[0]!.playVideo).not.toHaveBeenCalled()
    expect(players[0]!.seekTo).not.toHaveBeenCalled()
  })

  it.each([[3, 'buffering'], [0, 'ended'], [5, 'cued']])('does nothing for state %i (%s)', async (data) => {
    const player = await playing()
    serverMs = START + 10_000

    player.options.events.onStateChange?.({ data })

    expect(player.playVideo).not.toHaveBeenCalled()
    expect(player.seekTo).not.toHaveBeenCalled()
  })

  it('resumes at most once a second: a player that pauses again at once is asked again after the gap, only if it is still paused', async () => {
    const player = await playing()
    pause(player)
    expect(player.playVideo).toHaveBeenCalledTimes(1)

    await passTime(200)
    pause(player)
    expect(player.playVideo).toHaveBeenCalledTimes(1)

    await passTime(800)
    expect(player.playVideo).toHaveBeenCalledTimes(2)
    expect(player.seekTo).toHaveBeenLastCalledWith(91, true)

    // Paused again, but by the time the gap is over it plays: no second ask.
    pause(player)
    player.getPlayerState.mockReturnValue(1)
    await passTime(1000)
    expect(player.playVideo).toHaveBeenCalledTimes(2)

    // After the gap a fresh pause resumes at once.
    player.getPlayerState.mockReturnValue(2)
    pause(player)
    expect(player.playVideo).toHaveBeenCalledTimes(3)
  })

  it('does not resume in the clip\'s last second', async () => {
    const player = await playing()
    serverMs = START + 29_500

    pause(player)

    expect(player.playVideo).not.toHaveBeenCalled()
  })

  it('does not resume once this device closed the clip', async () => {
    const player = await playing()

    await press('Für mich schließen')
    pause(player)

    expect(player.playVideo).not.toHaveBeenCalled()
  })

  it('does not resume after the clip ended by itself', async () => {
    const player = await playing()

    await passTime(30_000)
    pause(player)

    expect(player.playVideo).not.toHaveBeenCalled()
    expect(player.seekTo).not.toHaveBeenCalled()
  })

  it('does not check the drift again after a resume: the check stays one-shot', async () => {
    const player = await playing()
    serverMs = START + 1000
    pause(player)
    expect(player.seekTo).toHaveBeenCalledTimes(1)

    // A PLAYING after the resume arms nothing; the first PLAYING's check finds the player in place.
    player.options.events.onStateChange?.({ data: 1 })
    await passTime(10_000)

    expect(player.seekTo).toHaveBeenCalledTimes(1)
  })
})
