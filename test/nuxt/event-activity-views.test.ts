import { mockNuxtImport, mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import EventPage from '~/pages/e/[slug]/index.vue'
import type { RoomSocketOptions } from '~/utils/room-socket'
import { envelope, type RoomMessage } from '~~/shared/realtime'
import { kitty, signInAs } from './auth'
import { restoreScreen, stubScreen, view } from './event-page'

// Where the Activity feed lives (#166, 11-event-seite § SidePanel and § TabBar): in the side panel from 980 px, as the one
// tab „Aktivität“ of the tabs pattern, and on a phone as its own view behind the tab bar, which counts what arrived
// meanwhile. The feed is mounted once either way. The room is a fake socket the test sends messages on.
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

/** An Event link for one test with a live room and a feed endpoint that counts its reads. */
function serveEvent() {
  testNumber += 1
  const slug = `activity-views-${testNumber}`
  const served = { feedReads: 0, chatReads: 0 }
  // The Chat's read (#761): the side panel opens on the Chat, and an unregistered read would just fail quietly.
  registerEndpoint(`/api/e/${slug}/messages`, {
    method: 'GET',
    handler: () => {
      served.chatReads += 1
      return { messages: [], next: null }
    },
  })
  registerEndpoint(`/api/e/${slug}`, { method: 'GET', handler: () => ({ ...view(slug, []), event: { slug, name: 'Freitags-Zocken', phase: 'poll', isHost: false } }) })
  registerEndpoint(`/api/e/${slug}/activity`, {
    method: 'GET',
    handler: () => {
      served.feedReads += 1
      return { entries: [], next: null }
    },
  })
  registerEndpoint(`/api/e/${slug}/room`, { method: 'POST', handler: () => ({ url: 'https://rt.test', room: `event-id-${slug}`, token: 'token' }) })
  return { slug, served }
}

const lastSocket = () => sockets[sockets.length - 1]!
const settle = () => new Promise(resolve => setTimeout(resolve))

async function mountEvent() {
  const event = serveEvent()
  const page = await mountSuspended(EventPage, { route: `/e/${event.slug}` })
  await vi.waitFor(() => expect(sockets.length).toBeGreaterThan(0))
  await settle()
  return { ...event, page }
}

function joined(id: string) {
  const entry = { id, type: 'member_joined', at: new Date().toISOString(), actor: { id: 'u1', name: 'Larsi' }, params: {}, people: {}, games: {} }
  lastSocket().options.onMessage(JSON.stringify(envelope({ type: 'activity.added', entry } as RoomMessage, Date.now())))
  return settle()
}

type Page = Awaited<ReturnType<typeof mountEvent>>['page']
const tabs = (page: Page) => page.findAll('nav[aria-label="Event"] button')

describe('the Activity feed on the Event page', () => {
  beforeEach(() => {
    signInAs(kitty)
    sockets.length = 0
    useRuntimeConfig().public.realtimeUrl = 'https://rt.test'
  })

  afterEach(() => {
    useRuntimeConfig().public.realtimeUrl = ''
    restoreScreen()
    document.body.innerHTML = ''
  })

  describe('from 980 px', () => {
    beforeEach(() => stubScreen(true))

    it('is the tab „Aktivität“, between „Chat“ and „Tabelle“, of a side panel built as tabs: tablist, tab, tabpanel with the log', async () => {
      const { page, served } = await mountEvent()

      const panel = page.get('aside[aria-label="Seitenleiste"]')
      const tab = panel.findAll('[role="tablist"] [role="tab"]')[1]!
      expect(panel.findAll('[role="tab"]')).toHaveLength(3)
      expect(tab.text()).toBe('Aktivität')
      // The panel opens on the Chat (#761); the feed's tab is one click away.
      expect(tab.attributes('aria-selected')).toBe('false')
      await tab.trigger('click')
      expect(tab.attributes('aria-selected')).toBe('true')
      const tabpanel = panel.get(`[id="${tab.attributes('aria-controls')}"]`)
      expect(tabpanel.attributes('role')).toBe('tabpanel')
      expect(tabpanel.attributes('aria-labelledby')).toBe(tab.attributes('id'))
      expect(tabpanel.get('[role="log"]').attributes('aria-live')).toBe('polite')
      // The feed is mounted once: one log of its own beside the Chat's, one read.
      expect(page.findAll('[role="log"][aria-label="Aktivität"]')).toHaveLength(1)
      expect(served.feedReads).toBe(1)
    })

    it('opens the panel on „Chat“, in the order Chat, Aktivität, Tabelle, and reads the Chat once', async () => {
      const { page, served } = await mountEvent()

      const tabs = page.get('aside[aria-label="Seitenleiste"]').findAll('[role="tab"]')
      expect(tabs.map(tab => tab.text())).toEqual(['Chat', 'Aktivität', 'Tabelle'])
      expect(tabs.map(tab => tab.attributes('aria-selected'))).toEqual(['true', 'false', 'false'])
      expect(page.find('[role="log"][aria-label="Chatverlauf"]').exists()).toBe(true)
      expect(served.chatReads).toBe(1)
    })

    it('keeps the Event stage whole, with the Head\'s h1 and no Aktivität h1', async () => {
      const { page } = await mountEvent()

      expect(page.findAll('h1').map(heading => heading.text())).toEqual(['Gleich geht’s los'])
    })

    it('keeps the count the panel took when the window narrows (#778)', async () => {
      const resize = stubScreen(true)
      const { page } = await mountEvent()

      await joined('a')
      resize(false)
      await settle()

      expect(tabs(page)[3]!.attributes('aria-label')).toBe('Aktivität, 1 neu')
      await joined('b')
      expect(tabs(page)[3]!.attributes('aria-label')).toBe('Aktivität, 2 neu')
    })

    it('says what the feed promises while nothing happened', async () => {
      const { page } = await mountEvent()

      await vi.waitFor(() => expect(page.findAll('[role="tabpanel"]')[1]!.text()).toContain('Noch nichts passiert. Bald aber bestimmt. Vielleicht.'))
    })
  })

  describe('on a phone', () => {
    beforeEach(() => stubScreen(false))

    it('has four tabs, Event, Tabelle, Chat and Aktivität, and starts on the Event with no feed mounted', async () => {
      const { page, served } = await mountEvent()

      expect(tabs(page).map(tab => tab.text())).toEqual(['Event', 'Tabelle', 'Chat', 'Aktivität'])
      expect(tabs(page).map(tab => tab.attributes('aria-current'))).toEqual(['page', undefined, undefined, undefined])
      expect(page.find('[role="log"]').exists()).toBe(false)
      expect(page.find('[role="tab"]').exists()).toBe(true)
      expect(served.feedReads).toBe(0)
      // The Chat's view is mounted only while shown (#765): nothing of it mounts or is read before.
      expect(served.chatReads).toBe(0)
    })

    it('switches to the feed with its own h1, and back to the stage', async () => {
      const { page, served } = await mountEvent()

      await tabs(page)[3]!.trigger('click')

      expect(tabs(page).map(tab => tab.attributes('aria-current'))).toEqual([undefined, undefined, undefined, 'page'])
      expect(page.findAll('h1').map(heading => heading.text())).toEqual(['Aktivität'])
      await vi.waitFor(() => expect(page.find('main [role="log"]').exists()).toBe(true))
      expect(page.findAll('[role="log"]')).toHaveLength(1)
      expect(served.feedReads).toBe(1)

      await tabs(page)[0]!.trigger('click')

      expect(page.findAll('h1').map(heading => heading.text())).toEqual(['Gleich geht’s los'])
      expect(page.find('[role="log"]').exists()).toBe(false)
    })

    it('keeps the count of the feed when the layout turns wide and narrow again, since the panel opens on the Chat (#778)', async () => {
      const resize = stubScreen(false)
      const { page } = await mountEvent()
      await joined('a')
      expect(tabs(page)[3]!.attributes('aria-label')).toBe('Aktivität, 1 neu')

      resize(true)
      await settle()
      resize(false)
      await settle()

      expect(tabs(page)[3]!.attributes('aria-label')).toBe('Aktivität, 1 neu')
    })

    it('counts the entries that arrive while the Event tab is shown, says so in the name, and resets when the feed opens', async () => {
      const { page } = await mountEvent()

      await joined('a')
      await joined('b')

      const activity = tabs(page)[3]!
      expect(activity.attributes('aria-label')).toBe('Aktivität, 2 neu')
      expect(activity.text()).toContain('2')

      await activity.trigger('click')

      expect(tabs(page)[3]!.attributes('aria-label')).toBeUndefined()
      expect(tabs(page)[3]!.text()).toBe('Aktivität')

      // Entries that arrive while the feed is open are read at once and are not counted.
      await vi.waitFor(() => expect(page.find('main [role="log"]').exists()).toBe(true))
      await joined('c')
      await tabs(page)[0]!.trigger('click')
      expect(tabs(page)[3]!.attributes('aria-label')).toBeUndefined()

      await joined('d')
      expect(tabs(page)[3]!.attributes('aria-label')).toBe('Aktivität, 1 neu')
    })
  })
})
