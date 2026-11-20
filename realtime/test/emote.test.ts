import { env, evictDurableObject } from 'cloudflare:test'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EMOTE_IDS } from '../../shared/emote'
import type { Envelope } from '../../shared/realtime'
import { open, settle } from './room-helpers'

// The Emote the room passes on (#767, spec #719 § C): who sent it comes from the token, one per Member every two
// seconds, at most three a second carry a sound. The room reads `Date.now()`, so a faked `Date` moves the clock exactly;
// sockets are opened before the clock is faked (the token's `exp` is read from it).

const emotesOf = (received: Envelope[]) => received.filter(message => message.type.startsWith('emote.'))
const send = (socket: WebSocket, emote: unknown, extra: object = {}) => socket.send(JSON.stringify({ type: 'emote.send', emote, ...extra }))

/**
 * Waits until `assertion` holds, polling in real time. `vi.waitFor` is no use here: while `Date` is faked it advances
 * the fake clock by its interval at every poll, which would move the instant the room sees.
 */
async function until(assertion: () => void, tries = 50) {
  for (let attempt = 1; attempt < tries; attempt++) {
    try {
      return assertion()
    }
    catch {
      await new Promise(resolve => setTimeout(resolve, 20))
    }
  }
  assertion()
}

let clock = 0
/** Freezes `Date` at `start` and moves it `ms` forward; the room sees it in the next frame it handles. */
function freeze(start?: number) {
  if (start !== undefined) {
    vi.useFakeTimers({ toFake: ['Date'] })
    clock = start
  }
  vi.setSystemTime(clock)
}
const at = (offset: number, base: number) => freeze(base + offset)

afterEach(() => void vi.useRealTimers())

describe('passing an Emote on', () => {
  it('sends it to every socket of the Event, the sender\'s included, and to none of another Event', async () => {
    const anna = await open('emote-1', { sub: 'anna' })
    const ben = await open('emote-1', { sub: 'ben' })
    const other = await open('emote-1-other', { sub: 'carla' })
    await settle()
    const before = Date.now()

    send(anna.socket, 'clap')
    await until(() => expect(emotesOf(ben.received)).toHaveLength(1))
    await settle()

    const after = Date.now()
    for (const { received } of [anna, ben]) {
      expect(emotesOf(received)).toEqual([{ v: 1, type: 'emote.sent', userId: 'anna', emote: 'clap', sound: true, serverTime: expect.any(Number) }])
      const [sent] = emotesOf(received)
      expect(sent!.serverTime).toBeGreaterThanOrEqual(before)
      expect(sent!.serverTime).toBeLessThanOrEqual(after)
    }
    expect(emotesOf(other.received)).toEqual([])
  })

  it('passes each of the four ids', async () => {
    const listener = await open('emote-2', { sub: 'listener' })
    const members = await Promise.all(EMOTE_IDS.map((_, index) => open('emote-2', { sub: `member-${index}` })))
    await settle()

    EMOTE_IDS.forEach((id, index) => send(members[index]!.socket, id))
    await until(() => expect(emotesOf(listener.received)).toHaveLength(EMOTE_IDS.length))

    expect(emotesOf(listener.received).map(message => 'emote' in message && message.emote).sort()).toEqual([...EMOTE_IDS].sort())
  })
})

describe('one Emote per Member every two seconds', () => {
  it('counts per Member, not per socket, and a dropped Emote does not move the window', async () => {
    const first = await open('emote-3', { sub: 'anna' })
    const second = await open('emote-3', { sub: 'anna' })
    const ben = await open('emote-3', { sub: 'ben' })
    await settle()
    const start = Date.now()
    const count = () => emotesOf(ben.received).length

    freeze(start)
    send(first.socket, 'clap')
    await until(() => expect(count()).toBe(1))

    at(1999, start)
    send(second.socket, 'tears')
    await settle()
    expect(count()).toBe(1)

    at(2000, start)
    send(second.socket, 'tears')
    await until(() => expect(count()).toBe(2))
    expect(emotesOf(ben.received)[1]).toMatchObject({ userId: 'anna', emote: 'tears' })

    // The one at +2000 is now the last one: +3999 is inside its two seconds, +4000 is not.
    at(3999, start)
    send(first.socket, 'roar')
    await settle()
    expect(count()).toBe(2)
    at(4000, start)
    send(first.socket, 'roar')
    await until(() => expect(count()).toBe(3))
  })

  it('does not hold one Member back for another', async () => {
    const anna = await open('emote-3b', { sub: 'anna' })
    const ben = await open('emote-3b', { sub: 'ben' })
    await settle()

    send(anna.socket, 'clap')
    send(ben.socket, 'clap')
    await until(() => expect(emotesOf(anna.received)).toHaveLength(2))
  })
})

describe('at most three Emotes a second carry a sound', () => {
  async function five(event: string) {
    const members = await Promise.all(['anna', 'ben', 'carla', 'dora', 'emil'].map(sub => open(event, { sub })))
    await settle()
    return members
  }

  it('gives the first three of an instant a sound and the fourth none, and the room still passes the fourth on', async () => {
    const [anna, ben, carla, dora, emil] = await five('emote-4')
    const start = Date.now()
    freeze(start)

    for (const member of [anna, ben, carla, dora]) send(member!.socket, 'clap')
    await until(() => expect(emotesOf(emil!.received)).toHaveLength(4))

    expect(emotesOf(emil!.received).map(message => 'sound' in message && message.sound)).toEqual([true, true, true, false])
  })

  it('gives a fifth Emote exactly one second later a sound', async () => {
    const [anna, ben, carla, dora, emil] = await five('emote-4a')
    const start = Date.now()
    freeze(start)
    for (const member of [anna, ben, carla, dora]) send(member!.socket, 'clap')
    await until(() => expect(emotesOf(emil!.received)).toHaveLength(4))

    at(1000, start)
    send(emil!.socket, 'clap')
    await until(() => expect(emotesOf(anna!.received)).toHaveLength(5))

    expect(emotesOf(anna!.received).map(message => 'sound' in message && message.sound)).toEqual([true, true, true, false, true])
  })

  it('gives a fifth Emote 999 ms later none', async () => {
    const [anna, ben, carla, dora, emil] = await five('emote-4b')
    const start = Date.now()
    freeze(start)
    for (const member of [anna, ben, carla, dora]) send(member!.socket, 'clap')
    await until(() => expect(emotesOf(emil!.received)).toHaveLength(4))

    at(999, start)
    send(emil!.socket, 'clap')
    await until(() => expect(emotesOf(anna!.received)).toHaveLength(5))

    expect(emotesOf(anna!.received).map(message => 'sound' in message && message.sound)).toEqual([true, true, true, false, false])
  })
})

describe('what the room drops without a word', () => {
  it('ignores an unknown id, no id, a number, text that is no JSON, JSON that is no object and a binary frame, and keeps the socket open', async () => {
    const anna = await open('emote-5', { sub: 'anna' })
    const ben = await open('emote-5', { sub: 'ben' })
    await settle()

    send(anna.socket, 'zap')
    send(anna.socket, undefined)
    send(anna.socket, 7)
    send(anna.socket, 'Clap')
    anna.socket.send('not json')
    anna.socket.send('[]')
    anna.socket.send('null')
    anna.socket.send(new Uint8Array([1, 2]))
    await settle()

    expect(emotesOf(anna.received)).toEqual([])
    expect(emotesOf(ben.received)).toEqual([])
    expect(anna.socket.readyState).toBe(WebSocket.READY_STATE_OPEN)

    // A refused frame did not use up the Member's turn.
    send(anna.socket, 'clap')
    await until(() => expect(emotesOf(ben.received)).toHaveLength(1))
  })
})

describe('who sent it', () => {
  it('is the user of the token, whatever the message says', async () => {
    const anna = await open('emote-6', { sub: 'anna' })
    const ben = await open('emote-6', { sub: 'ben' })
    await settle()

    send(anna.socket, 'roar', { userId: 'ben', sub: 'ben' })
    await until(() => expect(emotesOf(ben.received)).toHaveLength(1))

    expect(emotesOf(ben.received)[0]).toMatchObject({ userId: 'anna', emote: 'roar' })
  })
})

describe('Events do not share counters', () => {
  it('lets the same Member send in two Events at once, and keeps one Event\'s sounds out of the other', async () => {
    const annaA = await open('emote-7a', { sub: 'anna' })
    const annaB = await open('emote-7b', { sub: 'anna' })
    const fillers = await Promise.all(['ben', 'carla', 'dora'].map(sub => open('emote-7a', { sub })))
    await settle()

    for (const filler of fillers) send(filler.socket, 'clap')
    send(annaA.socket, 'clap')
    send(annaB.socket, 'clap')
    await until(() => expect(emotesOf(annaA.received)).toHaveLength(4))
    await until(() => expect(emotesOf(annaB.received)).toHaveLength(1))

    expect(emotesOf(annaA.received).map(message => 'sound' in message && message.sound)).toEqual([true, true, true, false])
    expect(emotesOf(annaB.received)[0]).toMatchObject({ userId: 'anna', sound: true })
  })
})

describe('hibernation', () => {
  it('forgets the counters, and the sockets live on', async () => {
    const anna = await open('emote-h', { sub: 'anna' })
    const ben = await open('emote-h', { sub: 'ben' })
    await settle()
    const start = Date.now()

    freeze(start)
    send(anna.socket, 'clap')
    await until(() => expect(emotesOf(ben.received)).toHaveLength(1))

    await evictDurableObject(env.EventRoom.getByName('emote-h'))
    at(100, start)
    send(anna.socket, 'clap')
    await until(() => expect(emotesOf(ben.received)).toHaveLength(2))
  })
})
