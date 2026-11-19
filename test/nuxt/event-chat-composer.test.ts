import { mockNuxtImport, mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { readBody } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import EventPage from '~/pages/e/[slug]/index.vue'
import type { RoomSocketOptions } from '~/utils/room-socket'
import type { Message } from '~~/shared/chat'
import { envelope, type RoomMessage } from '~~/shared/realtime'
import { defaultSettings } from '~~/shared/settings'
import { kitty } from './auth'
import { cueLog, filesReady, resetRequests, serveCueFiles, setUpCuePage, tearDownCuePage } from './cue-harness'
import { LARSI, restoreScreen, stubScreen, viewWithSessions } from './event-page'
import { ENDED, FIRST, members, SESSION, STARTED, team } from './event-page-states'

// Writing in the Chat on the Event page (#667, spec #719 § A): the composer is in the side panel's Chat tab for the Host's read and a Member's alike, a Member on the
// Stands writes too, a finished Event shows a note instead, and a new Message makes no sound and no notification. The component's own states are in chat-panel.test.ts;
// this file asks what the page puts around it. The room is the fake socket of event-emotes.test.ts; the cue log is the staging build's.

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

let testNumber = 0
let mounted: Awaited<ReturnType<typeof mountSuspended>> | undefined

interface Setup { host?: boolean, finished?: boolean, stands?: boolean, wide?: boolean, messages?: Message[] }

/** An Event that is set up (Kitty in a team, or on the Stands) or a finished one, with a live room; the Chat's read and write are served and the writes recorded. */
async function mountLive({ host = false, finished = false, stands = false, wide = true, messages = [] }: Setup = {}) {
  testNumber += 1
  const slug = `chat-composer-${testNumber}`
  const served = { event: 0, chatReads: 0, posts: [] as { id: string, text: string }[] }
  stubScreen(wide)
  registerEndpoint(`/api/e/${slug}`, {
    method: 'GET',
    handler: () => {
      served.event += 1
      return viewWithSessions(slug, [finished ? SESSION(1, FIRST, { startedAt: STARTED, endedAt: ENDED }) : SESSION(1, FIRST)], 0, {
        event: { phase: finished ? 'finished' : 'poll', isHost: host },
        settings: defaultSettings(),
        teams: [team(1), team(2)],
        members: members({ kitty: stands ? { zone: 'stands' } : { zone: 'team', team: 1 }, larsi: { zone: 'team', team: 2 } }).map(member => ({ ...member, isHost: member.id === kitty.id ? host : false })),
        standings: [{ team: 1, rank: 1, points: 0 }, { team: 2, rank: 1, points: 0 }],
        end: { played: 0, gameCount: 6, complete: false, tie: null, finish: null, lastGame: null },
      })
    },
  })
  registerEndpoint(`/api/e/${slug}/messages`, {
    method: 'GET',
    handler: () => {
      served.chatReads += 1
      return { messages: [...messages].reverse(), next: null }
    },
  })
  registerEndpoint(`/api/e/${slug}/messages`, {
    method: 'POST',
    handler: async (event) => {
      const body = await readBody<{ id: string, text: string }>(event)
      served.posts.push(body)
      return { id: body.id, writerId: kitty.id, text: body.text, at: new Date().toISOString() } satisfies Message
    },
  })
  registerEndpoint(`/api/e/${slug}/activity`, { method: 'GET', handler: () => ({ entries: [], next: null }) })
  registerEndpoint(`/api/e/${slug}/room`, { method: 'POST', handler: () => ({ url: 'https://rt.test', room: `event-id-${slug}`, token: 'token' }) })
  mounted = await mountSuspended(EventPage, { route: `/e/${slug}`, attachTo: document.body })
  await vi.waitFor(() => expect(sockets.length).toBeGreaterThan(0))
  await settle()
  return { page: mounted, served }
}

const lastSocket = () => sockets[sockets.length - 1]!
const settle = () => new Promise(resolve => setTimeout(resolve))
type Page = NonNullable<typeof mounted>
const panel = (page: Page) => page.find('aside[aria-label="Seitenleiste"]')
const field = (page: Page) => panel(page).find('input[type="text"]')

/** The room opens and answers the clock's first probe, so the page's player exists. */
async function openRoom() {
  lastSocket().options.onOpen()
  await vi.waitFor(() => expect(lastSocket().send.mock.calls.some(([text]) => String(text).includes('clock.ping'))).toBe(true))
  const ping = lastSocket().send.mock.calls.map(([text]) => JSON.parse(String(text)) as { type: string, t0: number }).find(message => message.type === 'clock.ping')!
  lastSocket().options.onMessage(JSON.stringify(envelope({ type: 'clock.pong', t0: ping.t0 } as RoomMessage, Date.now())))
  await settle()
}

async function write(page: Page, text: string) {
  const input = field(page)
  ;(input.element as HTMLInputElement).value = text
  await input.trigger('input')
  await input.trigger('keydown', { key: 'Enter' })
}

beforeEach(() => {
  setUpCuePage({ staging: true })
  sockets.length = 0
  useRuntimeConfig().public.realtimeUrl = 'https://rt.test'
})

afterEach(() => {
  mounted?.unmount()
  mounted = undefined
  useRuntimeConfig().public.realtimeUrl = ''
  restoreScreen()
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
  tearDownCuePage()
})

describe.each([{ host: false }, { host: true }])('the composer on the Event page, Host $host', ({ host }) => {
  it('is in the Chat tab, and a Message typed there with Enter reaches the Chat\'s endpoint as { id, text }, without a read of the Event again', async () => {
    const { page, served } = await mountLive({ host })
    expect(panel(page).find('[role="tab"][aria-selected="true"]').text()).toBe('Chat')
    const reads = served.event

    await write(page, 'Hallo zusammen')
    await vi.waitFor(() => expect(served.posts).toHaveLength(1))

    expect(served.posts[0]).toEqual({ id: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/), text: 'Hallo zusammen' })
    await vi.waitFor(() => expect(panel(page).find('[data-message-id]').text()).toBe('Hallo zusammen'))
    expect(served.event).toBe(reads)
    expect(served.chatReads).toBe(1)
  })
})

// A Message deleted (#763): `chat.deleted` through the room turns a shown Message into its line, for a Member's read and the Host's alike, and a finished page keeps the writer's control.
describe.each([{ host: false }, { host: true }])('deleting in the Chat on the Event page, Host $host', ({ host }) => {
  const OTHERS = '44444444-4444-4444-8444-444444444444'
  const OWN = '55555555-5555-4555-8555-555555555555'
  const at = (seconds: number) => new Date(Date.parse('2026-11-19T20:00:00.000Z') + seconds * 1000).toISOString()
  const others: Message = { id: OTHERS, writerId: LARSI, text: 'Moin', at: at(0) }
  const own: Message = { id: OWN, writerId: kitty.id, text: 'Servus', at: at(10) }
  const deleted = (id: string, deletedBy: 'host' | 'writer') => lastSocket().options.onMessage(JSON.stringify(envelope({ type: 'chat.deleted', id, deletedBy } as RoomMessage, Date.now())))

  it('turns a shown Message of another writer into its line in place, and leaves the own one', async () => {
    const { page } = await mountLive({ host, messages: [others, own] })
    await vi.waitFor(() => expect(panel(page).findAll('[data-message-id]').map((item: { text: () => string }) => item.text())).toEqual(['Moin', 'Servus']))

    deleted(OTHERS, 'host')
    await settle()

    expect(panel(page).findAll('[data-message-id]').map((item: { text: () => string }) => item.text())).toEqual(['Vom Host gelöscht', 'Servus'])
  })

  it('keeps the writer\'s own control on a finished page, where the field is gone', async () => {
    const { page } = await mountLive({ host, finished: true, messages: [others, own] })
    await vi.waitFor(() => expect(panel(page).findAll('[data-message-id]')).toHaveLength(2))

    expect(panel(page).findAll('button[aria-label^="Nachricht von"]')).toHaveLength(host ? 2 : 1)
    expect(panel(page).find('input').exists()).toBe(false)
  })

  it('gives the control of another writer\'s Message to the Host only (#764)', async () => {
    const { page } = await mountLive({ host, messages: [others, own] })
    await vi.waitFor(() => expect(panel(page).findAll('[data-message-id]')).toHaveLength(2))

    expect(panel(page).findAll('button[aria-label^="Nachricht von"]').map((control: { attributes: (name: string) => string | undefined }) => control.attributes('aria-label'))).toEqual(host ? ['Nachricht von Larsi löschen', 'Nachricht von Kitty löschen'] : ['Nachricht von Kitty löschen'])
  })
})

describe('the composer for a Member on the Stands', () => {
  it('is there, and the Member writes', async () => {
    const { page, served } = await mountLive({ stands: true })

    await write(page, 'von der Tribüne')
    await vi.waitFor(() => expect(served.posts.map(post => post.text)).toEqual(['von der Tribüne']))
  })
})

describe('the composer on a finished page and on the phone', () => {
  it('shows the note and no input or send button once the Event is finished, and the Chat stays', async () => {
    const { page } = await mountLive({ finished: true })

    expect(panel(page).find('input').exists()).toBe(false)
    expect(panel(page).find('button[aria-label="Senden"]').exists()).toBe(false)
    expect(panel(page).text()).toContain('Das Event ist beendet. Du kannst nur noch lesen.')
    expect(panel(page).find('[role="log"][aria-label="Chatverlauf"]').exists()).toBe(true)
  })

  it('mounts no Chat, and so no composer, on a phone', async () => {
    const { page } = await mountLive({ wide: false })

    expect(page.find('input[placeholder="Nachricht an alle"]').exists()).toBe(false)
    expect(page.find('[role="log"][aria-label="Chatverlauf"]').exists()).toBe(false)
  })
})

describe('a new Message makes no sound and no notification', () => {
  it('leaves the cue log as it was for a Message of another Member and for the writer\'s own, and constructs no Notification', async () => {
    const notification = vi.fn()
    vi.stubGlobal('Notification', notification)
    resetRequests()
    const { page, served } = await mountLive()
    await openRoom()
    await filesReady('emote')
    const before = cueLog().length

    const message: Message = { id: '33333333-3333-4333-8333-333333333333', writerId: LARSI, text: 'Moin', at: new Date().toISOString() }
    lastSocket().options.onMessage(JSON.stringify(envelope({ type: 'chat.added', message } as RoomMessage, Date.now())))
    await settle()
    expect(panel(page).find(`[data-message-id="${message.id}"]`).text()).toBe('Moin')

    await write(page, 'Servus')
    await vi.waitFor(() => expect(served.posts).toHaveLength(1))
    lastSocket().options.onMessage(JSON.stringify(envelope({ type: 'chat.added', message: { ...message, id: served.posts[0]!.id, writerId: kitty.id, text: 'Servus' } } as RoomMessage, Date.now())))
    await settle()

    expect(panel(page).findAll('[data-message-id]')).toHaveLength(2)
    expect(cueLog()).toHaveLength(before)
    expect(notification).not.toHaveBeenCalled()
  })
})
