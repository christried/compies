import { mockNuxtImport, mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import EventPage from '~/pages/e/[slug]/index.vue'
import type { RoomSocketOptions } from '~/utils/room-socket'
import type { Message } from '~~/shared/chat'
import { envelope, type RoomMessage } from '~~/shared/realtime'
import { defaultSettings } from '~~/shared/settings'
import { kitty, signInAs } from './auth'
import { LARSI, restoreScreen, stubScreen, viewWithSessions } from './event-page'
import { FIRST, members, SESSION, team } from './event-page-states'

// The side panel's unread counts on a computer (#778, spec #719 § B): the tabs „Chat“ and „Aktivität“ count what arrives while another tab is shown, by the rule and the
// accessible name of the phone's bar (#765), and „Tabelle“ counts nothing. The room is a fake socket the test sends messages on (event-chat-phone.test.ts).

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

/** An Event with a live room on a computer's width, the Chat's read and the feed's served empty. */
async function mountLive() {
  testNumber += 1
  const slug = `panel-counts-${testNumber}`
  const setWide = stubScreen(true)
  registerEndpoint(`/api/e/${slug}`, {
    method: 'GET',
    handler: () => viewWithSessions(slug, [SESSION(1, FIRST)], 0, {
      event: { phase: 'poll', isHost: false },
      settings: defaultSettings(),
      teams: [team(1), team(2)],
      members: members({ kitty: { zone: 'team', team: 1 }, larsi: { zone: 'team', team: 2 } }),
      standings: [{ team: 1, rank: 1, points: 0 }, { team: 2, rank: 1, points: 0 }],
      end: { played: 0, gameCount: 6, complete: false, tie: null, decided: false, finish: null, lastGame: null },
    }),
  })
  registerEndpoint(`/api/e/${slug}/messages`, { method: 'GET', handler: () => ({ messages: [], next: null }) })
  registerEndpoint(`/api/e/${slug}/activity`, { method: 'GET', handler: () => ({ entries: [], next: null }) })
  registerEndpoint(`/api/e/${slug}/room`, { method: 'POST', handler: () => ({ url: 'https://rt.test', room: `event-id-${slug}`, token: 'token' }) })
  const page = await mountSuspended(EventPage, { route: `/e/${slug}`, attachTo: document.body })
  mounted = page
  await vi.waitFor(() => expect(sockets.length).toBeGreaterThan(0))
  await settle()
  return { page, setWide }
}

const lastSocket = () => sockets[sockets.length - 1]!
const settle = () => new Promise(resolve => setTimeout(resolve))
type Page = Awaited<ReturnType<typeof mountLive>>['page']
const panelTabs = (page: Page) => page.get('aside[aria-label="Seitenleiste"]').findAll('[role="tab"]')
const bar = (page: Page) => page.findAll('nav[aria-label="Event"] button')
const CHAT = 0
const ACTIVITY = 1
const STANDINGS = 2
const chip = (page: Page, index: number) => panelTabs(page)[index]!.find('[data-tab-count]')
const names = (page: Page) => panelTabs(page).map(tab => tab.attributes('aria-label'))

let messageNumber = 0
/** A Message of `writerId` arrives in the room. */
async function arrives(writerId: string, { settled = true } = {}) {
  messageNumber += 1
  const message: Message = { id: `00000000-0000-4000-8000-${String(messageNumber).padStart(12, '0')}`, writerId, text: 'Moin', at: new Date().toISOString() }
  lastSocket().options.onMessage(JSON.stringify(envelope({ type: 'chat.added', message } as RoomMessage, Date.now())))
  if (settled) await settle()
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

describe('the side panel\'s counts on a computer (#778)', () => {
  it('counts the feed while the panel shows the Chat, as a chip and an accessible name', async () => {
    const { page } = await mountLive()

    await feedEntry()

    expect(names(page)).toEqual([undefined, 'Aktivität, 1 neu', undefined])
    expect(chip(page, ACTIVITY).text()).toBe('1')
    expect(chip(page, CHAT).exists()).toBe(false)
  })

  it('counts the Chat while another tab is shown, and the shown tab has no count', async () => {
    const { page } = await mountLive()

    await panelTabs(page)[ACTIVITY]!.trigger('click')
    await arrives(LARSI)

    expect(names(page)).toEqual(['Chat, 1 neu', undefined, undefined])
    expect(chip(page, CHAT).text()).toBe('1')
  })

  it('clears the Chat\'s count when its tab opens, counts nothing while it is open, and counts again once it is left', async () => {
    const { page } = await mountLive()
    await panelTabs(page)[ACTIVITY]!.trigger('click')
    await arrives(LARSI)

    await panelTabs(page)[CHAT]!.trigger('click')
    expect(panelTabs(page)[CHAT]!.attributes('aria-label')).toBeUndefined()
    expect(chip(page, CHAT).exists()).toBe(false)

    await arrives(LARSI)
    expect(panelTabs(page)[CHAT]!.attributes('aria-label')).toBeUndefined()

    await panelTabs(page)[ACTIVITY]!.trigger('click')
    await arrives(LARSI)
    expect(panelTabs(page)[CHAT]!.attributes('aria-label')).toBe('Chat, 1 neu')
  })

  it('does not count the viewer\'s own Message, and counts one of another writer', async () => {
    const { page } = await mountLive()
    await panelTabs(page)[ACTIVITY]!.trigger('click')

    await arrives(kitty.id)
    expect(panelTabs(page)[CHAT]!.attributes('aria-label')).toBeUndefined()

    await arrives(LARSI)
    expect(panelTabs(page)[CHAT]!.attributes('aria-label')).toBe('Chat, 1 neu')
  })

  it('counts 2 and 120, and widens the chip with the number', async () => {
    const { page } = await mountLive()
    await panelTabs(page)[ACTIVITY]!.trigger('click')

    await arrives(LARSI)
    await arrives(LARSI)
    expect(panelTabs(page)[CHAT]!.attributes('aria-label')).toBe('Chat, 2 neu')

    for (let i = 0; i < 118; i += 1) await arrives(LARSI, { settled: false })
    await settle()
    expect(panelTabs(page)[CHAT]!.attributes('aria-label')).toBe('Chat, 120 neu')
    expect(chip(page, CHAT).text()).toBe('120')
  })

  it('gives Tabelle no count', async () => {
    const { page } = await mountLive()

    await feedEntry()
    await panelTabs(page)[ACTIVITY]!.trigger('click')
    await arrives(LARSI)

    expect(panelTabs(page)[STANDINGS]!.attributes('aria-label')).toBeUndefined()
    expect(chip(page, STANDINGS).exists()).toBe(false)
  })

  it('keeps each tab\'s count across a narrow window and back', async () => {
    const { page, setWide } = await mountLive()
    await feedEntry()

    setWide(false)
    await settle()
    expect(bar(page)[3]!.attributes('aria-label')).toBe('Aktivität, 1 neu')

    await arrives(LARSI)
    expect(bar(page)[2]!.attributes('aria-label')).toBe('Chat, 1 neu')

    setWide(true)
    await settle()
    expect(panelTabs(page)[CHAT]!.attributes('aria-label')).toBeUndefined()
    expect(panelTabs(page)[ACTIVITY]!.attributes('aria-label')).toBe('Aktivität, 1 neu')
  })
})
