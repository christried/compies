import { mockNuxtImport, mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import EventPage from '~/pages/e/[slug]/index.vue'
import type { RoomSocketOptions } from '~/utils/room-socket'
import { EMOTE_COOLDOWN_MS, EMOTE_IDS, type EmoteId } from '~~/shared/emote'
import { envelope, type RoomMessage } from '~~/shared/realtime'
import { defaultSettings } from '~~/shared/settings'
import { kitty, signInAs } from './auth'
import { LARSI, restoreScreen, SANNE, stubScreen, viewWithSessions } from './event-page'
import { ENDED, FIRST, members, SESSION, STARTED, team } from './event-page-states'

// Emotes on the Game board (#668, spec #719 § C): the four buttons, the two-second wait, and the rise above the sender's avatar of an `emote.sent`.
// The room is a fake socket the test opens and sends messages on, as event-presence.test.ts has it; jsdom has no layout, so the avatar's rectangle is stubbed.

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

const NAMES: Record<EmoteId, string> = { clap: 'Klatschen', tears: 'Freudentränen', angry: 'Wütend', roar: 'Brüller' }
const PICTURES: Record<EmoteId, string> = { clap: '/emotes/emote-klatschen.svg', tears: '/emotes/emote-freudentraenen.svg', angry: '/emotes/emote-wuetend.svg', roar: '/emotes/emote-bruellen.svg' }

let testNumber = 0
const served = { event: 0, activity: 0, room: 0 }

interface Setup { host?: boolean, finished?: boolean }

/** An Event with a board (Larsi in team 1, Kitty and Sanne on the Tribüne), or a finished one, with a live room and every endpoint counted. */
async function mountLive({ host = false, finished = false }: Setup = {}) {
  testNumber += 1
  const slug = `emotes-${testNumber}`
  const sessions = finished ? [SESSION(1, FIRST, { startedAt: STARTED, endedAt: ENDED })] : [SESSION(1, FIRST)]
  registerEndpoint(`/api/e/${slug}`, {
    method: 'GET',
    handler: () => {
      served.event += 1
      return viewWithSessions(slug, sessions, 0, {
        event: { phase: finished ? 'finished' : 'poll', isHost: host },
        settings: defaultSettings(),
        teams: [team(1), team(2)],
        members: members({ larsi: { zone: 'team', team: 1 } }),
      })
    },
  })
  registerEndpoint(`/api/e/${slug}/activity`, {
    method: 'GET',
    handler: () => {
      served.activity += 1
      return { entries: [], next: null }
    },
  })
  registerEndpoint(`/api/e/${slug}/room`, {
    method: 'POST',
    handler: () => {
      served.room += 1
      return { url: 'https://rt.test', room: `event-id-${slug}`, token: 'token' }
    },
  })
  const page = await mountSuspended(EventPage, { route: `/e/${slug}`, attachTo: document.body })
  await vi.waitFor(() => expect(sockets.length).toBeGreaterThan(0))
  await settle()
  // What the page animated while it mounted (the avatars pop) is not what these tests ask about.
  vi.mocked(Element.prototype.animate).mockClear()
  return page
}

type Page = Awaited<ReturnType<typeof mountLive>>
const lastSocket = () => sockets[sockets.length - 1]!
const open = () => lastSocket().options.onOpen()
const say = (message: RoomMessage) => lastSocket().options.onMessage(JSON.stringify(envelope(message, Date.now())))
const emoteSent = (userId: string, emote: EmoteId = 'clap') => say({ type: 'emote.sent', userId, emote, sound: true })
const settle = () => new Promise(resolve => setTimeout(resolve))
const sent = () => lastSocket().send.mock.calls.map(([text]) => String(text)).filter(text => text.includes('emote.send'))

const bar = (page: Page) => page.find('[role="toolbar"][aria-label="Emotes"]')
const buttons = (page: Page) => bar(page).findAll('button')
const rises = () => [...document.querySelectorAll<HTMLElement>('[data-emote]')]
// The phone's button (#768) sits outside the row; the sheet it opens is teleported to the body, so it is found in the document.
const phoneButton = (page: Page) => page.find('button[aria-label="Emotes"][aria-haspopup="dialog"]')
const sheet = () => document.querySelector<HTMLElement>('[role="dialog"]')
const sheetButtons = () => [...document.querySelectorAll<HTMLElement>('[role="dialog"] [role="group"] button')]

/** The avatar button of a Member, which jsdom gives no rectangle: the test places each at its own spot. */
const AT = { [kitty.id]: { left: 40, top: 300 }, [LARSI]: { left: 200, top: 120 }, [SANNE]: { left: 340, top: 300 } } as Record<string, { left: number, top: number }>
function stubRects() {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const at = AT[this.getAttribute('data-user-id') ?? '']
    const { left, top } = at ?? { left: 0, top: 0 }
    return { left, top, width: 44, height: 44, right: left + 44, bottom: top + 44, x: left, y: top, toJSON() {} } as DOMRect
  })
}

describe.each([{ host: false }, { host: true }])('Emotes on the Game board, Host $host', ({ host }) => {
  const realAnimate = Element.prototype.animate

  beforeEach(() => {
    signInAs(kitty)
    stubScreen(true)
    sockets.length = 0
    served.event = served.activity = served.room = 0
    useRuntimeConfig().public.realtimeUrl = 'https://rt.test'
    stubRects()
    // An animation that does not end by itself: the rise stays in the document for the test to look at.
    Element.prototype.animate = vi.fn(() => ({ finished: new Promise<void>(() => {}), cancel() {} })) as unknown as typeof Element.prototype.animate
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    Element.prototype.animate = realAnimate
    useRuntimeConfig().public.realtimeUrl = ''
    restoreScreen()
    document.body.innerHTML = ''
  })

  it('has one toolbar of four buttons, one per Emote, and none of them in the Host\'s dock', async () => {
    const page = await mountLive({ host })

    expect(page.findAll('[role="toolbar"][aria-label="Emotes"]')).toHaveLength(1)
    expect(buttons(page).map(button => button.attributes('aria-label'))).toEqual(EMOTE_IDS.map(id => `Emote senden: ${NAMES[id]}`))
    const dockSelector = '[role="toolbar"][aria-label="Host-Steuerung"]'
    const dock = document.querySelector(dockSelector)
    if (host) expect([...dock!.querySelectorAll('button')].filter(button => /emote/i.test(button.getAttribute('aria-label') ?? button.textContent ?? ''))).toHaveLength(0)
    else expect(dock).toBeNull()
  })

  it('shows each button as its picture, which a screen reader skips', async () => {
    const page = await mountLive({ host })

    expect(buttons(page).map(button => button.get('img').attributes('src'))).toEqual(EMOTE_IDS.map(id => PICTURES[id]))
    for (const button of buttons(page)) expect(button.get('img').attributes('alt')).toBe('')
  })

  it('sends one emote.send for a tap', async () => {
    const page = await mountLive({ host })
    open()

    await buttons(page)[0]!.trigger('click')

    expect(sent()).toEqual([JSON.stringify({ type: 'emote.send', emote: 'clap' })])
  })

  it('sends nothing while the socket is not open, with no error, and the wait shows all the same', async () => {
    const page = await mountLive({ host })
    const error = vi.spyOn(console, 'error')

    await buttons(page)[0]!.trigger('click')

    expect(sent()).toEqual([])
    expect(error).not.toHaveBeenCalled()
    expect(buttons(page)[0]!.attributes('aria-disabled')).toBe('true')
  })

  it('sends the tapped Emote: each of the four buttons names its own', async () => {
    const page = await mountLive({ host })
    open()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })

    for (const [index, id] of EMOTE_IDS.entries()) {
      await buttons(page)[index]!.trigger('click')
      vi.advanceTimersByTime(EMOTE_COOLDOWN_MS)
      await settle2()
      expect(sent().at(-1), id).toBe(JSON.stringify({ type: 'emote.send', emote: id }))
    }
    expect(sent()).toHaveLength(EMOTE_IDS.length)
  })

  it('waits two seconds after a tap: the buttons are aria-disabled and described by „Kurz warten“, the tapped one carries the ring and the others are dimmed', async () => {
    const page = await mountLive({ host })
    open()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })

    await buttons(page)[1]!.trigger('click')

    for (const [index, button] of buttons(page).entries()) {
      expect(button.attributes('aria-disabled')).toBe('true')
      const reason = document.getElementById(button.attributes('aria-describedby') ?? '')
      expect(reason?.textContent?.trim()).toBe('Kurz warten')
      expect(button.find('circle').exists()).toBe(index === 1)
      expect(button.classes().includes('opacity-60')).toBe(index !== 1)
    }

    // A tap on any button inside the wait sends nothing.
    await buttons(page)[1]!.trigger('click')
    await buttons(page)[3]!.trigger('click')
    expect(sent()).toHaveLength(1)

    vi.advanceTimersByTime(EMOTE_COOLDOWN_MS - 1)
    await settle2()
    expect(buttons(page)[0]!.attributes('aria-disabled')).toBe('true')

    vi.advanceTimersByTime(1)
    await settle2()
    for (const button of buttons(page)) {
      expect(button.attributes('aria-disabled')).toBeUndefined()
      expect(button.attributes('aria-describedby')).toBeUndefined()
      expect(button.find('circle').exists()).toBe(false)
      expect(button.classes()).not.toContain('opacity-60')
    }
    expect(page.text()).not.toContain('Kurz warten')
    await buttons(page)[3]!.trigger('click')
    expect(sent()).toHaveLength(2)
  })

  it('draws the rise above the avatar of a Member in a team and of one on the Tribüne, for a sender whoever it is', async () => {
    const page = await mountLive({ host })
    open()

    emoteSent(LARSI, 'tears')
    emoteSent(kitty.id, 'roar')
    emoteSent(SANNE, 'angry')
    await settle()

    expect(rises()).toHaveLength(3)
    for (const [id, emote] of [[LARSI, 'tears'], [kitty.id, 'roar'], [SANNE, 'angry']] as const) {
      const rise = document.querySelector<HTMLElement>(`[data-emote-for="${id}"]`)!
      expect(rise.getAttribute('data-emote')).toBe(emote)
      expect(rise.querySelector('img')!.getAttribute('src')).toBe(PICTURES[emote])
      // The centre and the top edge of the avatar's button: the picture rests on it and the rise starts there.
      expect(rise.style.left).toBe(`${AT[id]!.left + 22}px`)
      expect(rise.style.top).toBe(`${AT[id]!.top}px`)
    }
    expect(page.find(`[data-user-id="${LARSI}"]`).attributes('aria-label')).toContain('Larsi')
  })

  it('hides the rise from a screen reader: aria-hidden, a picture with no alt, and no live region gains text', async () => {
    const page = await mountLive({ host })
    open()
    const live = () => page.findAll('[aria-live], [role="status"]').map(region => region.text())
    const before = live()

    emoteSent(LARSI)
    await settle()

    const rise = document.querySelector<HTMLElement>('[data-emote]')!
    expect(rise.getAttribute('aria-hidden')).toBe('true')
    expect(rise.querySelector('img')!.getAttribute('alt')).toBe('')
    expect(live()).toEqual(before)
  })

  it('leaves no element behind once the animation is over', async () => {
    await mountLive({ host })
    open()
    Element.prototype.animate = vi.fn(() => ({ finished: Promise.resolve(), cancel() {} })) as unknown as typeof Element.prototype.animate

    emoteSent(LARSI)
    await settle()

    expect(Element.prototype.animate).toHaveBeenCalledTimes(1)
    await vi.waitFor(() => expect(rises()).toHaveLength(0))
  })

  it('removes the rise 50 ms after its length even where the animation never reports its end', async () => {
    await mountLive({ host })
    open()
    Element.prototype.animate = vi.fn(() => undefined) as unknown as typeof Element.prototype.animate
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })

    emoteSent(LARSI)
    await settle2()
    expect(rises()).toHaveLength(1)

    vi.advanceTimersByTime(1400 + 50)
    await settle2()
    expect(rises()).toHaveLength(0)
  })

  it('draws every Emote of several at once, each above its own avatar, and each goes at its own end', async () => {
    await mountLive({ host })
    open()
    let finish: (() => void)[] = []
    Element.prototype.animate = vi.fn(() => {
      let end: () => void = () => {}
      const finished = new Promise<void>(resolve => (end = resolve))
      finish.push(end)
      return { finished, cancel() {} }
    }) as unknown as typeof Element.prototype.animate

    emoteSent(LARSI, 'clap')
    emoteSent(LARSI, 'tears')
    emoteSent(kitty.id, 'roar')
    await settle()

    expect(rises()).toHaveLength(3)
    expect(document.querySelectorAll(`[data-emote-for="${LARSI}"]`)).toHaveLength(2)

    finish[0]!()
    await settle()
    expect(rises()).toHaveLength(2)

    finish.forEach(end => end())
    finish = []
    await settle()
    expect(rises()).toHaveLength(0)
  })

  it('draws nothing, animates nothing and logs no error for a sender whose avatar is not in the document', async () => {
    await mountLive({ host })
    open()
    const error = vi.spyOn(console, 'error')

    emoteSent('00000000-0000-4000-8000-0000000000ff')
    await settle()

    expect(rises()).toHaveLength(0)
    expect(Element.prototype.animate).not.toHaveBeenCalled()
    expect(error).not.toHaveBeenCalled()
  })

  it('writes no Activity entry and shows nowhere in the feed, and makes no request', async () => {
    const page = await mountLive({ host })
    open()
    await vi.waitFor(() => expect(page.find('[role="log"]').exists()).toBe(true))
    const feed = () => page.get('[role="log"]').text()
    const before = { text: feed(), ...served }

    await buttons(page)[0]!.trigger('click')
    emoteSent(LARSI)
    emoteSent(kitty.id)
    await settle()

    expect(feed()).toBe(before.text)
    expect(served).toEqual({ event: before.event, activity: before.activity, room: before.room })
  })

  it('does not move Compibert: every figure of him keeps its markup', async () => {
    const page = await mountLive({ host })
    open()
    // The page has no animated rig outside the Tour, the wheel and the ceremony: the header's Compibert is the figure on it, and his markup is his state.
    const states = () => page.findAll('.compibert, .compibert-rig').map(figure => figure.html())
    const before = states()
    expect(before.length).toBeGreaterThan(0)

    emoteSent(kitty.id)
    emoteSent(LARSI)
    await settle()

    expect(states()).toEqual(before)
  })

  it('has no Emote buttons on a finished Event, and draws no rise there', async () => {
    const page = await mountLive({ host, finished: true })
    open()

    emoteSent(LARSI)
    await settle()

    expect(bar(page).exists()).toBe(false)
    expect(rises()).toHaveLength(0)
  })

  describe('on a phone', () => {
    beforeEach(() => stubScreen(false))

    it('keeps the row hidden below md, and an arriving Emote still rises on the Event view', async () => {
      const page = await mountLive({ host })
      open()

      expect(bar(page).classes()).toContain('max-md:hidden')
      emoteSent(LARSI)
      await settle()

      expect(rises()).toHaveLength(1)
    })

    it('has one button named „Emotes“ below md, and the row still hides there', async () => {
      const page = await mountLive({ host })
      const button = phoneButton(page)

      expect(button.exists()).toBe(true)
      expect(button.classes()).toContain('md:hidden')
      expect(button.attributes('aria-haspopup')).toBe('dialog')
      expect(button.attributes('aria-expanded')).toBe('false')
      expect(button.attributes('role')).toBeUndefined()
      expect(bar(page).classes()).toContain('max-md:hidden')
      expect(page.findAll('[role="toolbar"][aria-label="Emotes"]')).toHaveLength(1)
    })

    it('opens the four in a sheet titled „Emotes“, in order, and reports it expanded', async () => {
      const page = await mountLive({ host })

      await phoneButton(page).trigger('click')
      await vi.waitFor(() => expect(sheet()).not.toBeNull())

      expect(sheet()!.querySelector('h2')!.textContent!.trim()).toBe('Emotes')
      expect(sheetButtons().map(button => button.getAttribute('aria-label'))).toEqual(EMOTE_IDS.map(id => `Emote senden: ${NAMES[id]}`))
      expect(phoneButton(page).attributes('aria-expanded')).toBe('true')
    })

    it('sends one emote.send for a pick, closes the sheet, and the phone button shows the wait', async () => {
      const page = await mountLive({ host })
      open()
      await phoneButton(page).trigger('click')
      await vi.waitFor(() => expect(sheet()).not.toBeNull())

      sheetButtons()[1]!.click()
      await settle()

      expect(sent()).toEqual([JSON.stringify({ type: 'emote.send', emote: 'tears' })])
      await vi.waitFor(() => expect(sheet()).toBeNull())
      const button = phoneButton(page)
      expect(button.attributes('aria-disabled')).toBe('true')
      expect(document.getElementById(button.attributes('aria-describedby') ?? '')?.textContent?.trim()).toBe('Kurz warten')
      expect(button.element.querySelectorAll('circle[stroke-dasharray]')).toHaveLength(1)
    })

    it('animates the ring of the phone button as well as the row\'s', async () => {
      const page = await mountLive({ host })
      open()
      await phoneButton(page).trigger('click')
      await vi.waitFor(() => expect(sheet()).not.toBeNull())

      sheetButtons()[0]!.click()
      await settle()

      const ringed = vi.mocked(Element.prototype.animate).mock.contexts.filter(context => context instanceof Element && context.tagName.toLowerCase() === 'circle')
      expect(ringed).toHaveLength(2)
      expect(ringed).toContain(phoneButton(page).element.querySelector('circle[stroke-dasharray]'))
    })

    it('during the wait a tap on the phone button opens nothing and sends nothing; after the cooldown it opens again', async () => {
      const page = await mountLive({ host })
      open()
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })

      await phoneButton(page).trigger('click')
      sheetButtons()[1]!.click()
      await settle2()
      const exit = 300 // the sheet's exit: its fallback timer runs 270 ms (#348), and the wait started with the pick
      vi.advanceTimersByTime(exit)
      await settle2()
      expect(sheet()).toBeNull()
      expect(sent()).toHaveLength(1)

      await phoneButton(page).trigger('click')
      await settle2()
      expect(sheet()).toBeNull()
      expect(sent()).toHaveLength(1)

      vi.advanceTimersByTime(EMOTE_COOLDOWN_MS - exit - 1)
      await settle2()
      expect(phoneButton(page).attributes('aria-disabled')).toBe('true')
      vi.advanceTimersByTime(1)
      await settle2()
      expect(phoneButton(page).attributes('aria-disabled')).toBeUndefined()

      await phoneButton(page).trigger('click')
      await settle2()
      expect(sheet()).not.toBeNull()
    })

    it('closes the sheet on Escape, and focus goes back to the phone button', async () => {
      const page = await mountLive({ host })
      const button = phoneButton(page).element as HTMLElement
      button.focus()
      await phoneButton(page).trigger('click')
      await vi.waitFor(() => expect(sheet()).not.toBeNull())

      sheet()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))

      await vi.waitFor(() => expect(sheet()).toBeNull())
      expect(document.activeElement).toBe(button)
    })

    it('with the socket not open, a pick sends nothing, logs no error, closes the sheet and shows the wait', async () => {
      const page = await mountLive({ host })
      const error = vi.spyOn(console, 'error')
      await phoneButton(page).trigger('click')
      await vi.waitFor(() => expect(sheet()).not.toBeNull())

      sheetButtons()[2]!.click()
      await vi.waitFor(() => expect(sheet()).toBeNull())

      expect(sent()).toEqual([])
      expect(error).not.toHaveBeenCalled()
      expect(phoneButton(page).attributes('aria-disabled')).toBe('true')
    })

    it('has no phone button and no sheet on a finished Event', async () => {
      const page = await mountLive({ host, finished: true })

      expect(phoneButton(page).exists()).toBe(false)
      expect(sheet()).toBeNull()
    })

    it('closes the sheet when the window grows to md with it open', async () => {
      const grow = stubScreen(false)
      const page = await mountLive({ host })
      await phoneButton(page).trigger('click')
      await vi.waitFor(() => expect(sheet()).not.toBeNull())

      grow(true)

      await vi.waitFor(() => expect(sheet()).toBeNull())
    })

    it('draws nothing on another view, where the board is not mounted', async () => {
      const page = await mountLive({ host })
      open()
      const tabs = page.findAll('nav[aria-label="Event"] button')
      await tabs.find(tab => tab.text() === 'Tabelle')!.trigger('click')
      await settle()
      expect(page.find('[data-user-id]').exists()).toBe(false)
      const error = vi.spyOn(console, 'error')

      emoteSent(LARSI)
      await settle()

      expect(rises()).toHaveLength(0)
      expect(Element.prototype.animate).not.toHaveBeenCalled()
      expect(error).not.toHaveBeenCalled()
    })
  })
})

/** Lets Vue and the promises of a test with fake timers run: `settle` waits on a timer, which they stop. */
const settle2 = async () => {
  for (let round = 0; round < 3; round += 1) await Promise.resolve()
  await nextTick()
}
