import { mockNuxtImport, mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import EventPage from '~/pages/e/[slug]/index.vue'
import type { RoomSocketOptions } from '~/utils/room-socket'
import type { Message } from '~~/shared/chat'
import { envelope, type RoomMessage } from '~~/shared/realtime'
import { defaultSettings } from '~~/shared/settings'
import { kitty, signInAs } from './auth'
import { LARSI, restoreScreen, stubScreen, viewWithSessions } from './event-page'
import { ENDED, FIRST, members, SESSION, STARTED, team } from './event-page-states'

// The Chat on a phone (#765, spec #719 § B and § Phone view): the bottom bar is Event, Tabelle, Chat, Aktivität; the Chat item opens a view of the Chat alone under its
// title, and counts what arrives while another view is shown, by the rule and the accessible name of „Aktivität“. The side panel is not changed. The room is a fake socket
// the test sends messages on (event-activity-views.test.ts); the Chat's own states are in chat-panel.test.ts.

const { sockets, createRoomSocket } = vi.hoisted(() => {
  const sockets: { options: RoomSocketOptions }[] = []
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

let testNumber = 0
let mounted: { unmount: () => void } | undefined

interface Setup { host?: boolean, finished?: boolean, wide?: boolean }

/** An Event with a live room, the Chat's read counted and the feed's served; a finished one when asked. */
async function mountLive({ host = false, finished = false, wide = false }: Setup = {}) {
  testNumber += 1
  const slug = `chat-phone-${testNumber}`
  const served = { chatReads: 0 }
  const setWide = stubScreen(wide)
  registerEndpoint(`/api/e/${slug}`, {
    method: 'GET',
    handler: () => viewWithSessions(slug, [finished ? SESSION(1, FIRST, { startedAt: STARTED, endedAt: ENDED }) : SESSION(1, FIRST)], 0, {
      event: { phase: finished ? 'finished' : 'poll', isHost: host },
      settings: defaultSettings(),
      teams: [team(1), team(2)],
      members: members({ kitty: { zone: 'team', team: 1 }, larsi: { zone: 'team', team: 2 } }),
      standings: [{ team: 1, rank: 1, points: 0 }, { team: 2, rank: 1, points: 0 }],
      end: { played: 0, gameCount: 6, complete: false, tie: null, decided: false, finish: null, lastGame: null },
    }),
  })
  registerEndpoint(`/api/e/${slug}/messages`, {
    method: 'GET',
    handler: () => {
      served.chatReads += 1
      return { messages: [], next: null }
    },
  })
  registerEndpoint(`/api/e/${slug}/activity`, { method: 'GET', handler: () => ({ entries: [], next: null }) })
  registerEndpoint(`/api/e/${slug}/room`, { method: 'POST', handler: () => ({ url: 'https://rt.test', room: `event-id-${slug}`, token: 'token' }) })
  const page = await mountSuspended(EventPage, { route: `/e/${slug}`, attachTo: document.body })
  mounted = page
  await vi.waitFor(() => expect(sockets.length).toBeGreaterThan(0))
  await settle()
  return { page, served, setWide }
}

const lastSocket = () => sockets[sockets.length - 1]!
const settle = () => new Promise(resolve => setTimeout(resolve))
type Page = Awaited<ReturnType<typeof mountLive>>['page']
const bar = (page: Page) => page.findAll('nav[aria-label="Event"] button')
const EVENT = 0
const CHAT = 2
const ACTIVITY = 3

let messageNumber = 0
/** A Message of `writerId` arrives in the room. */
async function arrives(writerId: string) {
  messageNumber += 1
  const message: Message = { id: `00000000-0000-4000-8000-${String(messageNumber).padStart(12, '0')}`, writerId, text: 'Moin', at: new Date().toISOString() }
  lastSocket().options.onMessage(JSON.stringify(envelope({ type: 'chat.added', message } as RoomMessage, Date.now())))
  await settle()
}

async function feedEntry() {
  const entry = { id: 'a', type: 'member_joined', at: new Date().toISOString(), actor: { id: 'u1', name: 'Larsi' }, params: {}, people: {}, games: {} }
  lastSocket().options.onMessage(JSON.stringify(envelope({ type: 'activity.added', entry } as RoomMessage, Date.now())))
  await settle()
}

beforeEach(() => {
  signInAs(kitty)
  sockets.length = 0
  messageNumber = 0
  useRuntimeConfig().public.realtimeUrl = 'https://rt.test'
})

afterEach(() => {
  mounted?.unmount()
  mounted = undefined
  useRuntimeConfig().public.realtimeUrl = ''
  restoreScreen()
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

describe.each([{ host: false }, { host: true }])('the Chat on a phone, Host $host', ({ host }) => {
  it('is the third item of a bar of Event, Tabelle, Chat and Aktivität, with nothing of the Chat mounted or read', async () => {
    const { page, served } = await mountLive({ host })

    expect(bar(page).map(item => item.text())).toEqual(['Event', 'Tabelle', 'Chat', 'Aktivität'])
    expect(bar(page).map(item => item.attributes('aria-current'))).toEqual(['page', undefined, undefined, undefined])
    expect(page.find('[role="log"]').exists()).toBe(false)
    expect(served.chatReads).toBe(0)
  })

  it('opens the Chat alone under its h1, with the composer, and unmounts it again on the Event view', async () => {
    const { page, served } = await mountLive({ host })

    await bar(page)[CHAT]!.trigger('click')

    expect(bar(page).map(item => item.attributes('aria-current'))).toEqual([undefined, undefined, 'page', undefined])
    expect(page.findAll('h1').map(heading => heading.text())).toEqual(['Chat'])
    await vi.waitFor(() => expect(page.find('main [role="log"][aria-label="Chatverlauf"]').exists()).toBe(true))
    expect(page.find('main input[type="text"]').exists()).toBe(true)
    expect(page.get('main label').text()).toBe('Nachricht an alle')
    expect(served.chatReads).toBe(1)
    expect(page.find('[data-user-id]').exists()).toBe(false)

    await bar(page)[EVENT]!.trigger('click')

    expect(page.find('[role="log"]').exists()).toBe(false)
  })

  it('counts the Messages of other writers that arrive while the Event or Tabelle view is shown, as a number and in the name', async () => {
    const { page } = await mountLive({ host })
    expect(bar(page)[CHAT]!.attributes('aria-label')).toBeUndefined()

    await arrives(LARSI)
    expect(bar(page)[CHAT]!.attributes('aria-label')).toBe('Chat, 1 neu')

    await bar(page)[1]!.trigger('click')
    await arrives(LARSI)
    expect(bar(page)[CHAT]!.attributes('aria-label')).toBe('Chat, 2 neu')
    expect(bar(page)[CHAT]!.text()).toContain('2')

    for (let i = 0; i < 118; i += 1) await arrives(LARSI)
    expect(bar(page)[CHAT]!.attributes('aria-label')).toBe('Chat, 120 neu')
  })

  it('clears the count on opening the Chat, counts nothing while it is open or after leaving it, and counts again from the next arrival', async () => {
    const { page } = await mountLive({ host })
    await arrives(LARSI)

    await bar(page)[CHAT]!.trigger('click')
    expect(bar(page)[CHAT]!.attributes('aria-label')).toBeUndefined()
    await vi.waitFor(() => expect(page.find('main [role="log"]').exists()).toBe(true))

    await arrives(LARSI)
    await bar(page)[EVENT]!.trigger('click')
    expect(bar(page)[CHAT]!.attributes('aria-label')).toBeUndefined()

    await arrives(LARSI)
    expect(bar(page)[CHAT]!.attributes('aria-label')).toBe('Chat, 1 neu')
  })

  it('does not count the viewer\'s own Message, and counts another writer\'s after it', async () => {
    const { page } = await mountLive({ host })

    await arrives(kitty.id)
    expect(bar(page)[CHAT]!.attributes('aria-label')).toBeUndefined()

    await arrives(LARSI)
    expect(bar(page)[CHAT]!.attributes('aria-label')).toBe('Chat, 1 neu')
  })

  it('counts the Chat and the feed apart, and keeps the Tour\'s marker on the fourth item only', async () => {
    const { page } = await mountLive({ host })

    await arrives(LARSI)
    expect(bar(page)[ACTIVITY]!.attributes('aria-label')).toBeUndefined()

    await feedEntry()
    await feedEntry()
    expect(bar(page)[ACTIVITY]!.attributes('aria-label')).toBe('Aktivität, 2 neu')
    expect(bar(page)[CHAT]!.attributes('aria-label')).toBe('Chat, 1 neu')
    expect(bar(page).map(item => item.attributes('data-tour'))).toEqual([undefined, undefined, undefined, 'tab-activity'])
  })
})

describe('the Chat view of a finished Event', () => {
  it('has no input and shows the note', async () => {
    const { page } = await mountLive({ finished: true })

    await bar(page)[CHAT]!.trigger('click')

    await vi.waitFor(() => expect(page.find('main [role="log"]').exists()).toBe(true))
    expect(page.find('main input').exists()).toBe(false)
    expect(page.get('main').text()).toContain('Das Event ist beendet. Das liest doch eh keiner mehr, also ist Schreiben aus.')
  })
})

describe('the side panel from 980 px', () => {
  it('has its tabs Chat, Aktivität, Tabelle and no count on the Chat it shows', async () => {
    const { page } = await mountLive({ wide: true })

    await arrives(LARSI)

    const tabs = page.get('aside[aria-label="Seitenleiste"]').findAll('[role="tab"]')
    expect(tabs.map(tab => tab.text())).toEqual(['Chat', 'Aktivität', 'Tabelle'])
    expect(tabs.map(tab => tab.attributes('aria-label'))).toEqual([undefined, undefined, undefined])
  })

  it('forgets the Chat\'s count when the screen turns wide', async () => {
    const { page, setWide } = await mountLive()
    await arrives(LARSI)
    expect(bar(page)[CHAT]!.attributes('aria-label')).toBe('Chat, 1 neu')

    setWide(true)
    await settle()
    setWide(false)
    await settle()

    expect(bar(page)[CHAT]!.attributes('aria-label')).toBeUndefined()
  })
})

describe('the Host\'s crown on a phone', () => {
  const crown = (page: Page) => page.find('button[aria-label="Host-Steuerung"]')

  it('is on the Event view, and not on the Chat view, where it would cover the send button', async () => {
    const { page } = await mountLive({ host: true })
    expect(crown(page).exists()).toBe(true)

    await bar(page)[CHAT]!.trigger('click')
    expect(crown(page).exists()).toBe(false)

    await bar(page)[EVENT]!.trigger('click')
    expect(crown(page).exists()).toBe(true)
  })

  it('is not on a Member\'s page', async () => {
    const { page } = await mountLive()

    expect(crown(page).exists()).toBe(false)
  })
})

// A phone's keyboard does not resize the layout viewport everywhere, so while a field of the view has focus its card follows the visual viewport (as RichNotesEditor does).
describe('the Chat view above the keyboard', () => {
  /** The visual viewport as a phone reports it, with `height` changeable. */
  function stubViewport(height: number) {
    const viewport = { height, offsetTop: 0, addEventListener: vi.fn(), removeEventListener: vi.fn() }
    vi.stubGlobal('visualViewport', viewport)
    vi.stubGlobal('innerHeight', 800)
    return viewport
  }
  const card = (page: Page) => page.get('main section[aria-labelledby="chat-title"] > div').element as HTMLElement
  async function openChat() {
    const { page } = await mountLive()
    await bar(page)[CHAT]!.trigger('click')
    await vi.waitFor(() => expect(page.find('main input[type="text"]').exists()).toBe(true))
    return { page, input: page.get('main input[type="text"]').element as HTMLInputElement }
  }
  const focusIn = (input: HTMLElement) => input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
  const focusOut = (input: HTMLElement) => input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))

  it('takes the room below its top in the visual viewport while the field has focus, and gives it back on blur', async () => {
    stubViewport(500)
    const { page, input } = await openChat()

    focusIn(input)
    expect(card(page).style.height).toBe('492px')
    expect(card(page).style.minHeight).toBe('492px')

    focusOut(input)
    expect(card(page).style.height).toBe('')
    expect(card(page).style.minHeight).toBe('')
  })

  it('sets nothing when no keyboard is up', async () => {
    stubViewport(790)
    const { page, input } = await openChat()

    focusIn(input)

    expect(card(page).style.height).toBe('')
    expect(card(page).style.minHeight).toBe('')
  })

  it('throws nothing when the browser has no visual viewport', async () => {
    vi.stubGlobal('visualViewport', undefined)
    const { page, input } = await openChat()

    expect(() => focusIn(input)).not.toThrow()
    expect(card(page).style.height).toBe('')
  })
})
