import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { getQuery } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ChatPanel from '~/components/ChatPanel.vue'
import TeamMark from '~/components/TeamMark.vue'
import UserAvatar from '~/components/UserAvatar.vue'
import type { DeletedMessage, LiveMessage, Message, MessagePage } from '~~/shared/chat'
import type { BoardTeam, MemberView } from '~~/shared/event'
import { MESSAGE_MAX } from '~~/shared/message-text'
import { envelope, type RoomMessage } from '~~/shared/realtime'
import { memberView } from './event-page'

// The Chat panel (#761, spec #719 § A): the Activity feed's test (`activity-feed.test.ts`) for Messages. The room is a fake that the test sends messages on
// (the component asks for `on` and `state` only); the Chat's read is a served endpoint that pages newest first.
const BASE = Date.parse('2026-11-19T20:00:00.000Z')
let testNumber = 0

const live = (id: string, writerId: string, seconds: number, text = `text ${id}`): LiveMessage => ({ id, writerId, text, at: new Date(BASE + seconds * 1000).toISOString() })
const gone = (id: string, writerId: string, seconds: number, deletedBy: DeletedMessage['deletedBy'] = 'host'): DeletedMessage => ({ id, writerId, text: null, at: new Date(BASE + seconds * 1000).toISOString(), deletedBy })

const SANNE = 'u-sanne'
const LARSI = 'u-larsi'
const KITTY = 'u-kitty'
const members = [
  memberView({ id: SANNE, name: 'Sanne', zone: 'team', team: 1 }),
  memberView({ id: LARSI, name: 'Larsi', zone: 'stands' }),
  memberView({ id: KITTY, name: 'Kitty', isHost: true, zone: 'team', team: 2 }),
]
const teams: BoardTeam[] = [{ position: 1, name: 'Die Füchse' }, { position: 2, name: null }]

/** A Chat endpoint for one test: pages by `before`, newest first, `pageSize` Messages; counts its reads and can fail or hold its answer. */
function serveChat(all: Message[], { pageSize = 50, failing = false }: { pageSize?: number, failing?: boolean } = {}) {
  testNumber += 1
  const slug = `chat-${testNumber}`
  const served = { reads: 0, failing, all, hold: null as Promise<void> | null }
  registerEndpoint(`/api/e/${slug}/messages`, {
    method: 'GET',
    handler: async (event) => {
      served.reads += 1
      if (served.hold) await served.hold
      if (served.failing) throw createError({ statusCode: 500 })
      const newestFirst = [...served.all].reverse()
      const { before } = getQuery(event)
      const start = typeof before === 'string' ? newestFirst.findIndex(item => item.id === before) + 1 : 0
      const messages = newestFirst.slice(start, start + pageSize)
      const next = start + pageSize < newestFirst.length ? messages[messages.length - 1]!.id : null
      return { messages, next } satisfies MessagePage
    },
  })
  return { slug, served }
}

/** The room as the Chat uses it: `on` registers a handler, `send` plays a message to it; `state` is the connection. */
function fakeRoom() {
  const handlers = new Map<string, ((message: unknown) => void)[]>()
  const state = ref<'connecting' | 'open' | 'closed'>('open')
  return {
    room: {
      enabled: true,
      state,
      retry: () => undefined,
      on: (type: string, handler: (message: never) => void) => {
        handlers.set(type, [...(handlers.get(type) ?? []), handler as (message: unknown) => void])
        return () => undefined
      },
    },
    send(message: RoomMessage) {
      for (const handler of handlers.get(message.type) ?? []) handler(envelope(message, Date.now()))
    },
    state,
  }
}

const settle = () => new Promise(resolve => setTimeout(resolve))

interface MountOptions { pageSize?: number, failing?: boolean, hold?: boolean, viewerId?: string, active?: boolean, members?: MemberView[] }

async function mountChat(all: Message[], options: MountOptions = {}) {
  const chat = serveChat(all, options)
  let release = () => {}
  if (options.hold) {
    chat.served.hold = new Promise<void>((resolve) => {
      release = resolve
    })
  }
  const live = fakeRoom()
  const wrapper = await mountSuspended(ChatPanel, {
    props: { slug: chat.slug, room: live.room, members: options.members ?? members, teams, viewerId: options.viewerId ?? KITTY, active: options.active },
    attachTo: document.body,
  })
  await vi.waitFor(() => expect(chat.served.reads).toBeGreaterThan(0))
  await settle()
  return { ...chat, ...live, wrapper, release }
}

type Mounted = Awaited<ReturnType<typeof mountChat>>
const texts = (wrapper: Mounted['wrapper']) => wrapper.findAll('[data-message-id]').map(item => item.text())
const buttonNamed = (wrapper: Mounted['wrapper'], name: string) => wrapper.findAll('button').find(button => button.text() === name)

const realAnimate = Element.prototype.animate
let animated: { keyframes: Keyframe[], options: KeyframeAnimationOptions }[]

describe('ChatPanel', () => {
  beforeEach(() => {
    animated = []
    Element.prototype.animate = function (keyframes: Keyframe[], options: KeyframeAnimationOptions) {
      animated.push({ keyframes, options })
      return { finished: Promise.resolve(), cancel() {} }
    } as unknown as typeof Element.prototype.animate
  })

  afterEach(() => {
    Element.prototype.animate = realAnimate
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  it('shows the Messages oldest to newest, as a polite log named „Chatverlauf“', async () => {
    const { wrapper } = await mountChat([live('a', SANNE, 0, 'Hallo'), live('b', LARSI, 30, 'Moin'), live('c', SANNE, 60, 'Servus')])

    const log = wrapper.find('[role="log"]')
    expect(log.attributes('aria-live')).toBe('polite')
    expect(log.attributes('aria-label')).toBe('Chatverlauf')
    expect(texts(wrapper)).toEqual(['Hallo', 'Moin', 'Servus'])
  })

  it('shows a Message the room sends twice, and one the page already carries, once', async () => {
    const { wrapper, send, state, served } = await mountChat([live('a', SANNE, 0), live('b', SANNE, 10)])

    send({ type: 'chat.added', message: live('c', LARSI, 20) })
    send({ type: 'chat.added', message: live('c', LARSI, 20) })
    send({ type: 'chat.added', message: live('b', SANNE, 10) })
    await settle()
    expect(texts(wrapper)).toEqual(['text a', 'text b', 'text c'])

    // A reconnect reads the first page again, which overlaps what is shown.
    state.value = 'closed'
    await settle()
    state.value = 'open'
    await vi.waitFor(() => expect(served.reads).toBe(2))
    await settle()
    expect(texts(wrapper)).toEqual(['text a', 'text b'].concat('text c'))
  })

  it('loads older Messages on „Ältere laden“ in front of the newer ones, until the Chat has no more', async () => {
    const all = ['a', 'b', 'c', 'd', 'e'].map((id, index) => live(id, SANNE, index * 10))
    const { wrapper } = await mountChat(all, { pageSize: 2 })

    expect(texts(wrapper)).toEqual(['text d', 'text e'])
    await buttonNamed(wrapper, 'Ältere laden')!.trigger('click')
    await vi.waitFor(() => expect(texts(wrapper)).toHaveLength(4))
    expect(texts(wrapper)).toEqual(['text b', 'text c', 'text d', 'text e'])
    await buttonNamed(wrapper, 'Ältere laden')!.trigger('click')
    await vi.waitFor(() => expect(texts(wrapper)).toHaveLength(5))
    expect(texts(wrapper)[0]).toBe('text a')
    expect(buttonNamed(wrapper, 'Ältere laden')).toBeUndefined()
  })

  it('shows no „Ältere laden“ when the first page is all there is', async () => {
    const { wrapper } = await mountChat([live('a', SANNE, 0)])

    expect(buttonNamed(wrapper, 'Ältere laden')).toBeUndefined()
  })

  it('reads the first page again when the connection opens, and shows a Message that was live and is deleted now as its line', async () => {
    const { wrapper, state, served } = await mountChat([live('a', SANNE, 0, 'geheim'), live('b', LARSI, 10)])
    expect(texts(wrapper)).toEqual(['geheim', 'text b'])

    served.all = [gone('a', SANNE, 0, 'host'), live('b', LARSI, 10)]
    state.value = 'closed'
    await settle()
    state.value = 'open'
    await vi.waitFor(() => expect(served.reads).toBe(2))
    await settle()

    expect(texts(wrapper)).toEqual(['Vom Host gelöscht', 'text b'])
    expect(wrapper.text()).not.toContain('geheim')
  })

  it('shows a failed first read with „Nochmal versuchen“, which reads again', async () => {
    const { wrapper, served } = await mountChat([live('a', SANNE, 0)], { failing: true })

    expect(wrapper.text()).toContain('Der Chat konnte nicht geladen werden.')
    expect(wrapper.find('[role="log"]').exists()).toBe(false)
    served.failing = false
    await buttonNamed(wrapper, 'Nochmal versuchen')!.trigger('click')
    await vi.waitFor(() => expect(texts(wrapper)).toEqual(['text a']))
    expect(wrapper.text()).not.toContain('konnte nicht geladen')
  })

  it('keeps what it shows when a read after the connection opened fails', async () => {
    const { wrapper, state, served } = await mountChat([live('a', SANNE, 0)])

    served.failing = true
    state.value = 'closed'
    await settle()
    state.value = 'open'
    // A failed GET is tried once more by `$fetch`, so the count is not exact.
    await vi.waitFor(() => expect(served.reads).toBeGreaterThan(1))
    await settle()

    expect(texts(wrapper)).toEqual(['text a'])
    expect(wrapper.text()).not.toContain('konnte nicht geladen')
  })

  it('is busy and says nothing while the first read is on its way', async () => {
    const { wrapper, release } = await mountChat([live('a', SANNE, 0)], { hold: true })

    const log = wrapper.find('[role="log"]')
    expect(log.attributes('aria-busy')).toBe('true')
    expect(wrapper.text()).not.toContain('Noch still hier.')
    expect(wrapper.text()).not.toContain('konnte nicht geladen')

    release()
    await vi.waitFor(() => expect(texts(wrapper)).toEqual(['text a']))
    expect(wrapper.find('[role="log"]').attributes('aria-busy')).toBe('false')
  })

  it('shows the empty box for no Message, and a list for one and for two', async () => {
    const empty = await mountChat([])
    expect(empty.wrapper.text()).toContain('Noch still hier.')
    expect(empty.wrapper.text()).toContain('Sag Hallo. Alle im Event lesen mit.')
    expect(empty.wrapper.find('[data-message-id]').exists()).toBe(false)

    const one = await mountChat([live('a', SANNE, 0)])
    expect(texts(one.wrapper)).toEqual(['text a'])
    expect(one.wrapper.text()).not.toContain('Noch still hier.')

    const two = await mountChat([live('a', SANNE, 0), live('b', LARSI, 5)])
    expect(texts(two.wrapper)).toEqual(['text a', 'text b'])
    expect(two.wrapper.text()).not.toContain('Noch still hier.')
  })

  it('shows the longest text allowed whole, in one bubble', async () => {
    const longest = 'x'.repeat(MESSAGE_MAX)
    const { wrapper } = await mountChat([live('a', SANNE, 0, longest)])

    expect(wrapper.findAll('[data-message-id]')).toHaveLength(1)
    expect(texts(wrapper)).toEqual([longest])
  })

  it('links an address in a Message in a new tab, and shows markup as text', async () => {
    const typed = 'see https://x.de/a, <b>fett</b> and javascript:alert(1)'
    const { wrapper } = await mountChat([live('a', SANNE, 0, typed)])

    const bubble = wrapper.find('[data-message-id="a"]')
    const links = bubble.findAll('a')
    expect(links).toHaveLength(1)
    expect(links[0]!.attributes('href')).toBe('https://x.de/a')
    expect(links[0]!.attributes('target')).toBe('_blank')
    expect(links[0]!.attributes('rel')).toBe('noopener noreferrer')
    expect(bubble.find('b').exists()).toBe(false)
    expect(bubble.text()).toBe(typed)
  })

  it('shows an address that is not http or https as text', async () => {
    const typed = 'ftp://x.de und <img src=x onerror=alert(1)>'
    const { wrapper } = await mountChat([live('a', SANNE, 0, typed)])

    const bubble = wrapper.find('[data-message-id="a"]')
    expect(bubble.find('a').exists()).toBe(false)
    expect(bubble.find('img').exists()).toBe(false)
    expect(bubble.text()).toBe(typed)
  })

  it('names a team Member with their name, their team and its mark, and the time', async () => {
    const { wrapper } = await mountChat([live('a', SANNE, 0)])

    const line = wrapper.find('b').element.parentElement!
    expect(line.textContent).toContain('Sanne')
    expect(line.textContent).toContain('Die Füchse')
    expect(line.querySelector('time')?.textContent).toMatch(/\d\d:\d\d/)
    // The avatar's own mark is small; the name line's is 16 px.
    expect(wrapper.findAllComponents(TeamMark).some(mark => mark.props('size') === 16)).toBe(true)
    const avatar = wrapper.findComponent(UserAvatar)
    expect(avatar.props('size')).toBe(28)
    expect(avatar.props('team')).toBe(1)
    expect(avatar.find('img').attributes('src')).toBe('https://example.com/Sanne.png')
  })

  it('names a Member on the Stands „Tribüne“, with no mark', async () => {
    const { wrapper } = await mountChat([live('a', LARSI, 0)])

    expect(wrapper.find('b').element.parentElement!.textContent).toContain('Tribüne')
    expect(wrapper.findAllComponents(TeamMark)).toHaveLength(0)
  })

  it('marks the Host with a pill', async () => {
    const { wrapper } = await mountChat([live('a', KITTY, 0)], { viewerId: LARSI })

    expect(wrapper.find('b').element.parentElement!.textContent).toContain('Host')
    expect(wrapper.find('b').text()).toBe('Kitty')
  })

  it('shows the own Messages on the right as „Du“, with no avatar', async () => {
    const { wrapper } = await mountChat([live('a', KITTY, 0), live('b', LARSI, 10)])

    const own = wrapper.find('[data-message-id="a"]').element.parentElement!.parentElement!
    expect(own.classList.contains('flex-row-reverse')).toBe(true)
    expect(own.querySelector('b')?.textContent).toBe('Du')
    expect(own.querySelector('img, [aria-hidden="true"].inline-block')).toBeNull()
    const other = wrapper.find('[data-message-id="b"]').element.parentElement!.parentElement!
    expect(other.classList.contains('flex-row-reverse')).toBe(false)
    expect(wrapper.findAllComponents(UserAvatar)).toHaveLength(1)
  })

  it('shows a Message of a writer the Event does not list, with the time alone in its name line', async () => {
    const { wrapper } = await mountChat([live('a', 'u-ghost', 0, 'Boo')])

    expect(texts(wrapper)).toEqual(['Boo'])
    const line = wrapper.find('time').element.parentElement!
    expect(line.textContent).toBe(wrapper.find('time').text())
    expect(wrapper.find('b').exists()).toBe(false)
    expect(wrapper.findComponent(UserAvatar).props('team')).toBeFalsy()
  })

  it('follows a rename and a move of a Member in old Messages without reading the Chat again', async () => {
    const { wrapper, served } = await mountChat([live('a', SANNE, 0)])
    expect(wrapper.find('b').text()).toBe('Sanne')

    await wrapper.setProps({ members: [memberView({ id: SANNE, name: 'Sanni', zone: 'stands' }), ...members.slice(1)] })

    const line = wrapper.find('b').element.parentElement!
    expect(wrapper.find('b').text()).toBe('Sanni')
    expect(line.textContent).toContain('Tribüne')
    expect(line.textContent).not.toContain('Die Füchse')
    expect(served.reads).toBe(1)
  })

  it('shows a deleted Message as its line in its place, by who deleted it', async () => {
    const { wrapper } = await mountChat([live('a', SANNE, 0), gone('b', SANNE, 30, 'host'), gone('c', SANNE, 60, 'writer')])

    expect(texts(wrapper)).toEqual(['text a', 'Vom Host gelöscht', 'Gelöscht'])
    // One group: the deleted ones keep their writer and their time.
    expect(wrapper.findAll('time')).toHaveLength(1)
  })

  it('puts the Messages of one writer within two minutes under one name line, and further apart under two', async () => {
    const close = await mountChat([live('a', SANNE, 0), live('b', SANNE, 120)])
    expect(close.wrapper.findAll('b')).toHaveLength(1)

    const apart = await mountChat([live('a', SANNE, 0), live('b', SANNE, 121)])
    expect(apart.wrapper.findAll('b')).toHaveLength(2)
  })

  it('scrolls to its end when its tab opens', async () => {
    const { wrapper } = await mountChat([live('a', SANNE, 0)], { active: false })
    const log = wrapper.find('[role="log"]').element as HTMLElement
    Object.defineProperty(log, 'scrollHeight', { configurable: true, value: 640 })
    const scrollTo = vi.fn()
    log.scrollTo = scrollTo as unknown as typeof log.scrollTo

    await wrapper.setProps({ active: true })
    await settle()

    expect(scrollTo).toHaveBeenCalledWith({ top: 640 })
  })

  it('lets a Message that arrives rise once, 220 ms with an 8 px move, and none of the pages', async () => {
    const all = ['a', 'b', 'c'].map((id, index) => live(id, SANNE, index * 10))
    const { wrapper, send, state, served } = await mountChat(all, { pageSize: 2 })
    expect(animated).toHaveLength(0)

    await buttonNamed(wrapper, 'Ältere laden')!.trigger('click')
    await vi.waitFor(() => expect(texts(wrapper)).toHaveLength(3))
    state.value = 'closed'
    await settle()
    state.value = 'open'
    await vi.waitFor(() => expect(served.reads).toBe(3))
    await settle()
    expect(animated).toHaveLength(0)

    send({ type: 'chat.added', message: live('d', LARSI, 40) })
    await settle()

    expect(animated).toHaveLength(1)
    expect(animated[0]!.options.duration).toBe(220)
    expect(JSON.stringify(animated[0]!.keyframes)).toContain('translateY(8px)')

    send({ type: 'chat.added', message: live('d', LARSI, 40) })
    await settle()
    expect(animated).toHaveLength(1)
  })
})
