import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { getQuery, readBody } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DOMWrapper } from '@vue/test-utils'
import ChatPanel from '~/components/ChatPanel.vue'
import ToastStack from '~/components/ToastStack.vue'
import TeamMark from '~/components/TeamMark.vue'
import UserAvatar from '~/components/UserAvatar.vue'
import type { DeletedMessage, LiveMessage, Message, MessagePage } from '~~/shared/chat'
import type { BoardTeam, MemberView } from '~~/shared/event'
import { MESSAGE_MAX } from '~~/shared/message-text'
import { characterCount } from '~~/shared/text'
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

/** How the write answers: 200 with the Message, 200 with it deleted meanwhile, or a refusal. */
type WriteAnswer = 'ok' | 'deleted' | 'server-error' | 'rate-limited'

/**
 * A Chat endpoint for one test: pages by `before`, newest first, `pageSize` Messages; counts its reads and can fail or hold its answer.
 * The write (#667) sits on the same path: one `registerEndpoint` call per method, each `{ method, handler }`, serves both (the registry keeps a list per URL).
 */
function serveChat(all: Message[], { pageSize = 50, failing = false, viewerId = KITTY }: { pageSize?: number, failing?: boolean, viewerId?: string } = {}) {
  testNumber += 1
  const slug = `chat-${testNumber}`
  const served = {
    reads: 0,
    failing,
    all,
    hold: null as Promise<void> | null,
    posts: [] as { id: string, text: string }[],
    answer: 'ok' as WriteAnswer,
    postHold: null as Promise<void> | null,
    releasePost: () => {},
    /** The ids the delete (#763) was called for, in order, and how it answers. */
    deletes: [] as string[],
    deleteAnswer: 'ok' as 'ok' | 'refused' | 'server-error',
    /** The write's answer waits until `releasePost()`. */
    holdPost() {
      served.postHold = new Promise<void>((resolve) => {
        served.releasePost = resolve
      })
    },
  }
  registerEndpoint(`/api/e/${slug}/messages`, {
    method: 'POST',
    handler: async (event) => {
      const body = await readBody<{ id: string, text: string }>(event)
      served.posts.push(body)
      const hold = served.postHold
      if (hold) await hold
      if (served.answer === 'server-error') throw createError({ statusCode: 500 })
      if (served.answer === 'rate-limited') throw createError({ statusCode: 429, statusMessage: 'rate_limited' })
      const at = new Date().toISOString()
      if (served.answer === 'deleted') return { id: body.id, writerId: viewerId, text: null, at, deletedBy: 'writer' } satisfies Message
      return { id: body.id, writerId: viewerId, text: body.text, at } satisfies Message
    },
  })
  for (const message of all) {
    registerEndpoint(`/api/e/${slug}/messages/${message.id}`, {
      method: 'DELETE',
      handler: () => {
        served.deletes.push(message.id)
        if (served.deleteAnswer === 'server-error') throw createError({ statusCode: 500 })
        if (served.deleteAnswer === 'refused') throw createError({ statusCode: 403, statusMessage: 'not_your_message' })
        return { id: message.id, writerId: message.writerId, text: null, at: message.at, deletedBy: 'writer' } satisfies Message
      },
    })
  }
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

interface MountOptions { pageSize?: number, failing?: boolean, hold?: boolean, viewerId?: string, active?: boolean, members?: MemberView[], finished?: boolean }

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
    props: { slug: chat.slug, room: live.room, members: options.members ?? members, teams, viewerId: options.viewerId ?? KITTY, active: options.active, finished: options.finished },
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

    const own = wrapper.find('[data-message-id="a"]').element.closest('[role="log"] > div')!
    expect(own.classList.contains('flex-row-reverse')).toBe(true)
    expect(own.querySelector('b')?.textContent).toBe('Du')
    expect(own.querySelector('img, [aria-hidden="true"].inline-block')).toBeNull()
    const other = wrapper.find('[data-message-id="b"]').element.closest('[role="log"] > div')!
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

  const ID = '11111111-1111-4111-8111-111111111111'
  const ID2 = '22222222-2222-4222-8222-222222222222'
  const input = (wrapper: Mounted['wrapper']) => wrapper.find('input[type="text"]')
  /** Types into the field the way the browser does: the value, then an `input` event. */
  async function type(wrapper: Mounted['wrapper'], value: string) {
    const field = input(wrapper)
    ;(field.element as HTMLInputElement).value = value
    await field.trigger('input')
  }
  async function write(wrapper: Mounted['wrapper'], value: string) {
    await type(wrapper, value)
    await input(wrapper).trigger('keydown', { key: 'Enter' })
  }
  /** The next ids `crypto.randomUUID()` gives. */
  function pinIds(...ids: string[]) {
    const spy = vi.spyOn(globalThis.crypto, 'randomUUID')
    for (const id of ids) spy.mockReturnValueOnce(id as `${string}-${string}-${string}-${string}-${string}`)
  }

  describe('writing (#667)', () => {
    const sendButton = (wrapper: Mounted['wrapper']) => wrapper.find('button[aria-label="Senden"]')
    const bubble = (wrapper: Mounted['wrapper'], id: string) => wrapper.find(`[data-message-id="${id}"]`)

    it('shows a sent Message at once as „wird gesendet …“ with the field empty and focused, and settles it from the answer', async () => {
      pinIds(ID)
      const { wrapper, served } = await mountChat([live('a', SANNE, 0, 'Moin')])
      ;(input(wrapper).element as HTMLInputElement).focus()
      served.holdPost()

      await write(wrapper, 'Hallo')
      await vi.waitFor(() => expect(served.posts).toHaveLength(1))

      expect(served.posts).toEqual([{ id: ID, text: 'Hallo' }])
      expect(bubble(wrapper, ID).text()).toBe('Hallo')
      expect(bubble(wrapper, ID).attributes('data-outgoing-state')).toBe('sending')
      expect(wrapper.text()).toContain('wird gesendet …')
      expect((input(wrapper).element as HTMLInputElement).value).toBe('')
      expect(document.activeElement).toBe(input(wrapper).element)

      served.releasePost()
      await vi.waitFor(() => expect(wrapper.text()).not.toContain('wird gesendet …'))
      expect(wrapper.findAll(`[data-message-id="${ID}"]`)).toHaveLength(1)
      expect(bubble(wrapper, ID).attributes('data-outgoing-state')).toBeUndefined()
    })

    it('shows a Message once when the answer and the room\'s chat.added meet by id, in either order, and reads nothing again', async () => {
      pinIds(ID, ID2)
      const { wrapper, served, send } = await mountChat([])

      // The answer first.
      await write(wrapper, 'eins')
      await vi.waitFor(() => expect(wrapper.text()).not.toContain('wird gesendet …'))
      send({ type: 'chat.added', message: live(ID, KITTY, 5, 'eins') })
      await settle()
      expect(wrapper.findAll(`[data-message-id="${ID}"]`)).toHaveLength(1)

      // The room first, while the answer is held.
      served.holdPost()
      await write(wrapper, 'zwei')
      await settle()
      send({ type: 'chat.added', message: live(ID2, KITTY, 6, 'zwei') })
      await settle()
      expect(wrapper.findAll(`[data-message-id="${ID2}"]`)).toHaveLength(1)
      expect(wrapper.text()).not.toContain('wird gesendet …')
      served.releasePost()
      await settle()

      expect(wrapper.findAll('[data-message-id]')).toHaveLength(2)
      expect(wrapper.text()).not.toContain('Nicht gesendet')
      expect(served.reads).toBe(1)
    })

    it('keeps the text of a failed send in its bubble under „Nicht gesendet. Erneut senden“, and the retry sends the same id and text, once', async () => {
      pinIds(ID, ID2)
      const { wrapper, served } = await mountChat([])
      served.answer = 'server-error'

      await write(wrapper, 'Hallo')
      await vi.waitFor(() => expect(buttonNamed(wrapper, 'Nicht gesendet. Erneut senden')).toBeDefined())
      expect(bubble(wrapper, ID).text()).toBe('Hallo')
      expect(bubble(wrapper, ID).attributes('data-outgoing-state')).toBe('failed')
      expect(bubble(wrapper, ID).classes()).not.toContain('opacity-60')
      expect((input(wrapper).element as HTMLInputElement).value).toBe('')
      expect(wrapper.text()).not.toContain('Langsam, langsam')

      served.answer = 'ok'
      await buttonNamed(wrapper, 'Nicht gesendet. Erneut senden')!.trigger('click')
      await vi.waitFor(() => expect(bubble(wrapper, ID).attributes('data-outgoing-state')).toBeUndefined())

      expect(served.posts).toEqual([{ id: ID, text: 'Hallo' }, { id: ID, text: 'Hallo' }])
      expect(wrapper.findAll('[data-message-id]')).toHaveLength(1)
      expect(wrapper.text()).not.toContain('Nicht gesendet')
    })

    it('shows the deleted line, never the text, when the retry\'s answer is a Message deleted meanwhile', async () => {
      pinIds(ID)
      const { wrapper, served } = await mountChat([])
      served.answer = 'server-error'
      await write(wrapper, 'geheim')
      await vi.waitFor(() => expect(buttonNamed(wrapper, 'Nicht gesendet. Erneut senden')).toBeDefined())

      served.answer = 'deleted'
      await buttonNamed(wrapper, 'Nicht gesendet. Erneut senden')!.trigger('click')

      await vi.waitFor(() => expect(bubble(wrapper, ID).text()).toBe('Gelöscht'))
      expect(wrapper.text()).not.toContain('geheim')
    })

    it('says „Langsam, langsam …“ above the retry button on a rate limit and keeps the text, and a 500 shows no such line', async () => {
      pinIds(ID, ID2)
      const { wrapper, served } = await mountChat([])
      served.answer = 'rate-limited'

      await write(wrapper, 'zu schnell')
      await vi.waitFor(() => expect(wrapper.text()).toContain('Langsam, langsam. Versuch es in ein paar Sekunden.'))
      expect(bubble(wrapper, ID).text()).toBe('zu schnell')
      expect(buttonNamed(wrapper, 'Nicht gesendet. Erneut senden')).toBeDefined()
      expect(wrapper.find('[role="status"]').text()).toBe('Langsam, langsam. Versuch es in ein paar Sekunden.')

      served.answer = 'server-error'
      await write(wrapper, 'kaputt')
      await vi.waitFor(() => expect(bubble(wrapper, ID2).attributes('data-outgoing-state')).toBe('failed'))
      // Only the first line carries the limiter's words.
      expect(wrapper.findAll('[role="status"]')).toHaveLength(1)

      served.answer = 'ok'
      await buttonNamed(wrapper, 'Nicht gesendet. Erneut senden')!.trigger('click')
      await vi.waitFor(() => expect(wrapper.text()).not.toContain('Langsam, langsam'))
    })

    it('shows no failure for an id the Chat already holds', async () => {
      pinIds(ID)
      const { wrapper, served, send } = await mountChat([])
      served.answer = 'server-error'
      served.holdPost()

      await write(wrapper, 'Hallo')
      await vi.waitFor(() => expect(served.posts).toHaveLength(1))
      send({ type: 'chat.added', message: live(ID, KITTY, 5, 'Hallo') })
      await settle()
      served.releasePost()
      await settle()

      expect(wrapper.findAll(`[data-message-id="${ID}"]`)).toHaveLength(1)
      expect(wrapper.text()).not.toContain('Nicht gesendet')
      expect(bubble(wrapper, ID).attributes('data-outgoing-state')).toBeUndefined()
    })

    it('sends on Enter but not while an IME composes, treats Shift+Enter as Enter, and sends nothing for an empty or blank draft', async () => {
      pinIds(ID, ID2)
      const { wrapper, served } = await mountChat([])

      await type(wrapper, 'komponiert')
      await input(wrapper).trigger('keydown', { key: 'Enter', isComposing: true })
      await settle()
      expect(served.posts).toHaveLength(0)

      await input(wrapper).trigger('keydown', { key: 'Enter', shiftKey: true })
      await vi.waitFor(() => expect(served.posts).toHaveLength(1))
      expect(served.posts[0]).toEqual({ id: ID, text: 'komponiert' })

      await type(wrapper, '   ')
      expect(sendButton(wrapper).attributes('aria-disabled')).toBe('true')
      await sendButton(wrapper).trigger('click')
      await input(wrapper).trigger('keydown', { key: 'Enter' })
      await settle()
      expect(served.posts).toHaveLength(1)

      await type(wrapper, 'per Knopf')
      expect(sendButton(wrapper).attributes('aria-disabled')).toBe('false')
      await sendButton(wrapper).trigger('click')
      await vi.waitFor(() => expect(served.posts).toHaveLength(2))
      expect(served.posts[1]).toEqual({ id: ID2, text: 'per Knopf' })
    })

    it('shows the counter from 400 characters, warns from 492, and cuts the field at 500 characters', async () => {
      const { wrapper } = await mountChat([])
      const counter = () => wrapper.find('.font-mono')
      const live = () => wrapper.find('.sr-only[aria-live="polite"]')

      await type(wrapper, 'a'.repeat(399))
      expect(counter().exists()).toBe(false)
      expect(live().text()).toBe('')

      await type(wrapper, 'a'.repeat(400))
      expect(counter().text()).toBe('400/500')
      expect(counter().classes()).toContain('text-ink-2')
      expect(live().text()).toBe('Noch 100 Zeichen')

      await type(wrapper, 'a'.repeat(492))
      expect(counter().classes()).toContain('text-warning-fg')

      await type(wrapper, 'a'.repeat(501))
      expect((input(wrapper).element as HTMLInputElement).value).toHaveLength(500)
      expect(counter().text()).toBe('500/500')
      expect(counter().classes()).toContain('text-warning-fg')
    })

    it('counts characters as a User sees them: 500 emoji go out, a 501st is cut', async () => {
      pinIds(ID)
      const { wrapper, served } = await mountChat([])
      const thumbs = '👍🏽'

      await type(wrapper, thumbs.repeat(501))
      expect(characterCount((input(wrapper).element as HTMLInputElement).value)).toBe(500)
      expect(wrapper.find('.font-mono').text()).toBe('500/500')
      await input(wrapper).trigger('keydown', { key: 'Enter' })

      await vi.waitFor(() => expect(served.posts).toHaveLength(1))
      expect(served.posts[0]!.text).toBe(thumbs.repeat(500))
    })

    it('sends a pasted line break as a space and the text trimmed', async () => {
      pinIds(ID, ID2)
      const { wrapper, served } = await mountChat([])

      // A text input strips a pasted line break on its own; the field here keeps it, as the page must not rely on the browser for that.
      const field = input(wrapper).element as HTMLInputElement
      let raw = 'a\nb'
      const set = (value: string) => {
        raw = value
      }
      Object.defineProperty(field, 'value', { configurable: true, get: () => raw, set })
      await input(wrapper).trigger('input')
      expect(raw).toBe('a b')
      await input(wrapper).trigger('keydown', { key: 'Enter' })
      await vi.waitFor(() => expect(served.posts).toHaveLength(1))
      delete (field as { value?: string }).value
      await write(wrapper, '   Moin  ')
      await vi.waitFor(() => expect(served.posts).toHaveLength(2))

      expect(served.posts.map(post => post.text)).toEqual(['a b', 'Moin'])
    })

    it('lets a Member on the Stands and the Host write', async () => {
      pinIds(ID, ID2)
      const stands = await mountChat([], { viewerId: LARSI })
      await write(stands.wrapper, 'von der Tribüne')
      await vi.waitFor(() => expect(stands.served.posts).toHaveLength(1))
      expect(stands.wrapper.find('b').text()).toBe('Du')
      expect(stands.wrapper.find('[data-message-id]').text()).toBe('von der Tribüne')

      const host = await mountChat([], { viewerId: KITTY })
      await write(host.wrapper, 'vom Host')
      await vi.waitFor(() => expect(host.served.posts).toHaveLength(1))
      expect(host.served.posts[0]!.text).toBe('vom Host')
    })

    it('has no composer on a finished page, only the note, and the log stays readable; and none while the read has failed', async () => {
      const done = await mountChat([live('a', SANNE, 0, 'Servus')], { finished: true })

      expect(done.wrapper.find('input').exists()).toBe(false)
      expect(sendButton(done.wrapper).exists()).toBe(false)
      expect(done.wrapper.text()).toContain('Das Event ist beendet. Du kannst nur noch lesen.')
      expect(texts(done.wrapper)).toEqual(['Servus'])

      const failed = await mountChat([], { failing: true })
      expect(failed.wrapper.find('input').exists()).toBe(false)
      expect(sendButton(failed.wrapper).exists()).toBe(false)
    })

    it('lets no own Message rise, neither pending nor settled by the answer or by the room', async () => {
      pinIds(ID, ID2)
      const { wrapper, served, send } = await mountChat([])

      await write(wrapper, 'eins')
      await vi.waitFor(() => expect(wrapper.text()).not.toContain('wird gesendet …'))
      served.holdPost()
      await write(wrapper, 'zwei')
      await vi.waitFor(() => expect(served.posts).toHaveLength(2))
      send({ type: 'chat.added', message: live(ID2, KITTY, 5, 'zwei') })
      await settle()
      served.releasePost()
      await settle()

      expect(wrapper.findAll('[data-message-id]')).toHaveLength(2)
      expect(animated).toHaveLength(0)
    })

    it('puts two own sends within two minutes under one „Du“, and keeps a pending line below a Message another Member wrote meanwhile', async () => {
      pinIds(ID, ID2)
      const { wrapper, served, send } = await mountChat([])

      await write(wrapper, 'eins')
      await vi.waitFor(() => expect(wrapper.text()).not.toContain('wird gesendet …'))
      served.holdPost()
      await write(wrapper, 'zwei')
      await vi.waitFor(() => expect(served.posts).toHaveLength(2))
      expect(wrapper.findAll('b').map(name => name.text())).toEqual(['Du'])

      // A clock that runs ahead: the other Member's Message is stamped later than the pending line, yet it shows above it.
      send({ type: 'chat.added', message: { ...live('x', LARSI, 0, 'dazwischen'), at: new Date(Date.now() + 60_000).toISOString() } })
      await settle()
      expect(texts(wrapper)).toEqual(['eins', 'dazwischen', 'zwei'])
      expect(bubble(wrapper, ID2).attributes('data-outgoing-state')).toBe('sending')
    })

    it('shows a held outgoing line once when a re-read of the Chat already holds its Message', async () => {
      pinIds(ID)
      const { wrapper, served, state } = await mountChat([])
      served.holdPost()
      await write(wrapper, 'Hallo')
      await vi.waitFor(() => expect(served.posts).toHaveLength(1))

      served.all = [live(ID, KITTY, 0, 'Hallo')]
      state.value = 'closed'
      await settle()
      state.value = 'open'
      await vi.waitFor(() => expect(served.reads).toBe(2))
      await settle()

      expect(wrapper.findAll(`[data-message-id="${ID}"]`)).toHaveLength(1)
      expect(wrapper.text()).not.toContain('wird gesendet …')
    })
  })

  // Deleting an own Message (#763, spec #719 § A): the Message hides at once, a toast offers „Rückgängig“ for 5 s, and the call goes out when the toast ends. The toast stack
  // is mounted beside the panel, so „Rückgängig“ and ✕ are the real buttons.
  describe('deleting (#763)', () => {
    const mounted: { unmount: () => void }[] = []

    async function mountDeleting(all: Message[], options: MountOptions = {}) {
      const chat = await mountChat(all, { viewerId: SANNE, ...options })
      const stack = await mountSuspended(ToastStack, { attachTo: document.body })
      mounted.push(chat.wrapper, stack)
      return { ...chat, stack }
    }
    type Deleting = Awaited<ReturnType<typeof mountDeleting>>

    const bubble = (wrapper: Mounted['wrapper'], id: string) => wrapper.find(`[data-message-id="${id}"]`)
    /** The control of one Message: the button in the row of its bubble. */
    const controlOf = (wrapper: Mounted['wrapper'], id: string) => {
      const found = bubble(wrapper, id).element.parentElement?.querySelector('button')
      return found ? new DOMWrapper(found) : undefined
    }
    const controls = (wrapper: Mounted['wrapper']) => wrapper.findAll('button[aria-label^="Nachricht von"]')
    const undoButton = (stack: Deleting['stack']) => stack.findAll('button').find(button => button.text() === 'Rückgängig')
    const closeButton = (stack: Deleting['stack']) => stack.find('button[aria-label="Schließen"]')

    beforeEach(() => {
      useState('toasts').value = []
    })

    afterEach(() => {
      for (const wrapper of mounted.splice(0)) wrapper.unmount()
      vi.useRealTimers()
    })

    it('puts a delete control, named for the writer, on the viewer\'s own live Messages and on no other', async () => {
      const { wrapper } = await mountDeleting([live('a', SANNE, 0, 'meins'), live('b', LARSI, 10, 'deins'), gone('c', SANNE, 20, 'writer')])

      expect(controls(wrapper).map(control => control.attributes('aria-label'))).toEqual(['Nachricht von Sanne löschen'])
      expect(controlOf(wrapper, 'a')!.attributes('title')).toBe('Löschen')
      expect(controlOf(wrapper, 'a')!.attributes('type')).toBe('button')
      expect(controlOf(wrapper, 'a')!.attributes('tabindex')).toBeUndefined()
      expect(controlOf(wrapper, 'b')).toBeUndefined()
      expect(controlOf(wrapper, 'c')).toBeUndefined()
    })

    it('names the control „Du“ for a writer the Event no longer lists', async () => {
      const { wrapper } = await mountDeleting([live('a', SANNE, 0)], { members: [] })

      expect(controls(wrapper).map(control => control.attributes('aria-label'))).toEqual(['Nachricht von Du löschen'])
    })

    it('has no control on a line that is sending or failed, and has it once the answer settled the line', async () => {
      pinIds(ID)
      const { wrapper, served } = await mountDeleting([])
      served.holdPost()
      await write(wrapper, 'Hallo')
      await vi.waitFor(() => expect(served.posts).toHaveLength(1))
      expect(controls(wrapper)).toHaveLength(0)

      served.releasePost()
      await vi.waitFor(() => expect(controls(wrapper)).toHaveLength(1))

      pinIds(ID2)
      served.answer = 'server-error'
      await write(wrapper, 'Nochmal')
      await vi.waitFor(() => expect(bubble(wrapper, ID2).attributes('data-outgoing-state')).toBe('failed'))
      expect(controls(wrapper)).toHaveLength(1)
    })

    it('hides the Message at once on a click, sends nothing, shows a polite toast with „Rückgängig“ and puts focus on the log', async () => {
      const { wrapper, stack, served } = await mountDeleting([live('a', SANNE, 0, 'weg damit'), live('b', LARSI, 10, 'bleibt')])

      await controlOf(wrapper, 'a')!.trigger('click')
      await settle()

      expect(texts(wrapper)).toEqual(['bleibt'])
      expect(served.deletes).toEqual([])
      const toast = stack.get('[role="status"]')
      expect(toast.text()).toContain('Nachricht gelöscht')
      expect(undoButton(stack)).toBeDefined()
      expect(document.activeElement).toBe(wrapper.get('[role="log"]').element)
      expect(wrapper.get('[role="log"]').attributes('tabindex')).toBe('-1')
    })

    it('brings the Message back in its place and group on „Rückgängig“, with its control, and sends nothing, then or later', async () => {
      const { wrapper, stack, served } = await mountDeleting([live('a', SANNE, 0, 'eins'), live('b', SANNE, 10, 'zwei'), live('c', SANNE, 20, 'drei')])

      await controlOf(wrapper, 'b')!.trigger('click')
      await settle()
      expect(texts(wrapper)).toEqual(['eins', 'drei'])
      await undoButton(stack)!.trigger('click')
      await settle()

      expect(texts(wrapper)).toEqual(['eins', 'zwei', 'drei'])
      expect(wrapper.findAll('b')).toHaveLength(1)
      expect(controlOf(wrapper, 'b')).toBeDefined()
      expect(stack.find('[role="status"]').exists()).toBe(false)
      await settle()
      expect(served.deletes).toEqual([])
    })
  })
})
