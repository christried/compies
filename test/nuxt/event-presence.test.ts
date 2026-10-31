import { mockNuxtImport, mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import EventPage from '~/pages/e/[slug]/index.vue'
import type { RoomSocketOptions } from '~/utils/room-socket'
import { envelope, type RoomMessage } from '~~/shared/realtime'
import { kitty, signInAs } from './auth'
import { LARSI, SANNE, view } from './event-page'

// Who is online (#162, spec #153 § Online): the dots on the Game board follow the room's `presence.*` messages, and
// there are none while the room is not open. The page names the state to a screen reader („Larsi, Bench, online“);
// the socket is a fake that the test opens, closes and sends messages on.
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

let testNumber = 0

async function mountLive() {
  testNumber += 1
  const slug = `presence-${testNumber}`
  registerEndpoint(`/api/e/${slug}`, { method: 'GET', handler: () => view(slug, []) })
  registerEndpoint(`/api/e/${slug}/activity`, { method: 'GET', handler: () => ({ entries: [], next: null }) })
  registerEndpoint(`/api/e/${slug}/room`, {
    method: 'POST',
    handler: () => ({ url: 'https://rt.test', room: `event-id-${slug}`, token: 'token' }),
  })
  const page = await mountSuspended(EventPage, { route: `/e/${slug}` })
  await vi.waitFor(() => expect(sockets.length).toBeGreaterThan(0))
  return page
}

const lastSocket = () => sockets[sockets.length - 1]!
const say = (message: RoomMessage) => lastSocket().options.onMessage(JSON.stringify(envelope(message, Date.now())))
const settle = () => new Promise(resolve => setTimeout(resolve))

/** What the board's buttons say about each person, by name: „Larsi, Bench, online“. */
const people = (page: Awaited<ReturnType<typeof mountLive>>) =>
  Object.fromEntries(page.findAll('[data-user-id]').map(button => [button.attributes('data-user-id'), button.attributes('aria-label')]))

describe('the online dots on the Game board', () => {
  beforeEach(() => {
    signInAs(kitty)
    sockets.length = 0
    useRuntimeConfig().public.realtimeUrl = 'https://rt.test'
  })

  afterEach(() => {
    useRuntimeConfig().public.realtimeUrl = ''
    document.body.innerHTML = ''
  })

  it('shows nobody as online or offline while the room is not open', async () => {
    const page = await mountLive()

    expect(people(page)).toEqual({ [kitty.id]: 'Kitty, Bench', [LARSI]: 'Larsi, Bench', [SANNE]: 'Sanne, Bench' })
    expect(page.findAll('[data-presence]')).toHaveLength(0)
  })

  it('follows presence.sync: who is in it is online, everybody else offline', async () => {
    const page = await mountLive()
    lastSocket().options.onOpen()

    say({ type: 'presence.sync', userIds: [kitty.id, LARSI] })
    await settle()

    expect(people(page)).toEqual({ [kitty.id]: 'Kitty, Bench, online', [LARSI]: 'Larsi, Bench, online', [SANNE]: 'Sanne, Bench, offline' })
    expect(page.findAll('[data-presence="online"]')).toHaveLength(2)
    expect(page.findAll('[data-presence="offline"]')).toHaveLength(1)
  })

  it('turns a dot on with presence.join and off with presence.leave', async () => {
    const page = await mountLive()
    lastSocket().options.onOpen()
    say({ type: 'presence.sync', userIds: [kitty.id] })

    say({ type: 'presence.join', userId: SANNE })
    await settle()
    expect(people(page)[SANNE]).toBe('Sanne, Bench, online')

    say({ type: 'presence.leave', userId: SANNE })
    say({ type: 'presence.leave', userId: SANNE })
    await settle()
    expect(people(page)[SANNE]).toBe('Sanne, Bench, offline')
    expect(people(page)[kitty.id]).toBe('Kitty, Bench, online')
  })

  it('takes the dots away when the connection drops, and brings them back with the next presence.sync', async () => {
    const page = await mountLive()
    lastSocket().options.onOpen()
    say({ type: 'presence.sync', userIds: [kitty.id, LARSI] })

    lastSocket().options.onClose()
    await settle()
    expect(page.findAll('[data-presence]')).toHaveLength(0)
    expect(people(page)[LARSI]).toBe('Larsi, Bench')

    lastSocket().options.onOpen()
    say({ type: 'presence.sync', userIds: [kitty.id] })
    await settle()
    expect(people(page)[LARSI]).toBe('Larsi, Bench, offline')
  })

  it('ignores presence it hears before the connection is open', async () => {
    const page = await mountLive()

    say({ type: 'presence.sync', userIds: [kitty.id] })
    await settle()

    expect(page.findAll('[data-presence]')).toHaveLength(0)
  })

  it('asks the room for its clock on the same socket once it is open, and says nothing before', async () => {
    await mountLive()
    expect(lastSocket().send).not.toHaveBeenCalled()

    lastSocket().options.onOpen()
    await settle()

    expect(lastSocket().send).toHaveBeenCalledWith(expect.stringMatching(/^\{"type":"clock\.ping","t0":[\d.]+\}$/))
    expect(sockets).toHaveLength(1)
  })

  it('shows no dots where the app knows no Worker', async () => {
    useRuntimeConfig().public.realtimeUrl = ''
    testNumber += 1
    const slug = `presence-${testNumber}`
    registerEndpoint(`/api/e/${slug}`, { method: 'GET', handler: () => view(slug, []) })
    registerEndpoint(`/api/e/${slug}/activity`, { method: 'GET', handler: () => ({ entries: [], next: null }) })

    const page = await mountSuspended(EventPage, { route: `/e/${slug}` })

    expect(page.findAll('[data-presence]')).toHaveLength(0)
    expect(people(page)[LARSI]).toBe('Larsi, Bench')
  })
})
