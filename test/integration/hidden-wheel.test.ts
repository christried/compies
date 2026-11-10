import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { eventPoolGames, events, users } from '../../server/db/schema'
import type { Db } from '../../server/utils/db'
import type { CreatedEvent, EventView } from '../../shared/event'
import { hiddenWheelWorld, HIDDEN_WHEEL, stranger, webp, type Secret } from './hidden-wheel-world'
import { signIn } from './sign-in'

// THE secrecy test of release 1.3 (#148): under a Hidden wheel nobody but the Host learns which games are in the
// pools, not through the Event read, not through the image route, not through the library. The room and the Activity feed are
// in hidden-wheel-room.test.ts, a game the Host sets, a spin and a Veto in hidden-wheel-draw.test.ts (split in #418, with the
// world they share in hidden-wheel-world.ts).

describe('Hidden wheel secrecy (#148)', () => {
  const world = hiddenWheelWorld()
  const { request, newGame, setUp, rawRead, traces, playerTraces, priceTrace } = world
  let db: Db
  let hostCookie: string
  let playerCookie: string

  beforeEach(() => {
    db = world.db
    hostCookie = world.hostCookie
    playerCookie = world.playerCookie
  })

  function setWheelHidden(hidden: boolean) {
    // The Pool preview follows the wheel here, as a Host who made the wheel visible and turned the preview on (#225).
    return db.update(events).set({ hiddenWheel: hidden, poolPreview: !hidden })
  }

  it('gives a Player under a Hidden wheel nothing about the pools: not a count, name, id, image key, video id or notes anywhere in the raw response', async () => {
    const { slug, secrets } = await setUp()

    const raw = await rawRead(playerCookie, slug)

    expect((JSON.parse(raw) as EventView).pool).toBeNull()
    expect((JSON.parse(raw) as EventView).hostGames).toBeNull()
    for (const trace of secrets.flatMap(playerTraces)) expect(raw).not.toContain(trace)
    expect(raw).not.toMatch(/api\/images/)
  })

  it('gives a Player the same response however many games the pools hold (#222)', async () => {
    const { slug } = await setUp()
    const before = await rawRead(playerCookie, slug)

    const delta = await newGame('Delta Dart', 'ddddddddddd')
    const [eventRow] = await db.select({ id: events.id }).from(events).where(eq(events.slug, slug))
    await db.insert(eventPoolGames).values({ eventId: eventRow!.id, gameId: delta.id })
    const after = await rawRead(playerCookie, slug)

    // The control: the Host sees the new game, so the insert really changed the pools.
    expect(await rawRead(hostCookie, slug)).toContain('Delta Dart')
    expect(after).toBe(before)
  })

  it('gives the Host the games under a Hidden wheel', async () => {
    const { slug, secrets } = await setUp()

    const raw = await rawRead(hostCookie, slug)

    for (const trace of secrets.slice(0, 2).flatMap(traces)) expect(raw).toContain(trace)
    expect((JSON.parse(raw) as EventView).pool).toMatchObject([{ name: 'Alpha Arena', notes: 'Hausregel fuer Alpha Arena' }, { name: 'Beta Bowling', notes: 'Hausregel fuer Beta Bowling' }])
  })

  it('gives the Host the Tags and Notes of the pool\'s games in hostGames, and none of a game the library holds alone (#443)', async () => {
    const { slug, secrets } = await setUp()
    const [alpha, beta, gamma] = secrets as [Secret, Secret, Secret]

    const read = JSON.parse(await rawRead(hostCookie, slug)) as EventView

    expect(read.hostGames).toEqual({
      [alpha.id]: { tags: [{ key: alpha.tag, label: alpha.tag }], notes: alpha.notes },
      [beta.id]: { tags: [{ key: beta.tag, label: beta.tag }], notes: beta.notes },
    })
    expect(Object.keys(read.hostGames!)).not.toContain(gamma.id)
  })

  it('gives hostGames an empty Tag list for a game without Tags and a null Notes for one without Notes (#443)', async () => {
    const { slug, secrets } = await setUp()
    const [alpha] = secrets as [Secret]
    const edited = await request(`/api/games/${alpha.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'cookie': hostCookie },
      body: JSON.stringify({ name: alpha.name, youtubeUrl: `https://youtu.be/${alpha.videoId}`, notes: '', tags: [], price: { cents: alpha.cents, source: 'steam' } }),
    })
    expect(edited.status).toBe(200)

    const read = JSON.parse(await rawRead(hostCookie, slug)) as EventView

    expect(read.hostGames![alpha.id]).toEqual({ tags: [], notes: null })
  })

  it('gives the Player the games once the wheel is not hidden, and nothing about the pools when it is hidden again', async () => {
    const { slug, secrets } = await setUp()

    await setWheelHidden(false)
    const open = await rawRead(playerCookie, slug)
    expect((JSON.parse(open) as EventView).pool).toMatchObject([{ name: 'Alpha Arena' }, { name: 'Beta Bowling' }])
    expect((JSON.parse(open) as EventView).hostGames).toBeNull()
    // A Player gets picture and name only (#224): everything but the notes.
    for (const trace of secrets.slice(0, 2).flatMap(traces).filter(trace => !secrets.some(secret => secret.notes === trace))) expect(open).toContain(trace)
    for (const secret of secrets) expect(open).not.toContain(secret.notes)
    for (const secret of secrets) expect(open).not.toContain(secret.tag)

    await setWheelHidden(true)
    const closed = await rawRead(playerCookie, slug)
    for (const trace of secrets.flatMap(playerTraces)) expect(closed).not.toContain(trace)
    expect((JSON.parse(closed) as EventView).pool).toBeNull()
    expect((JSON.parse(closed) as EventView).hostGames).toBeNull()
  })

  it('gives the Player the games of an Event with a visible Lucky wheel from the start', async () => {
    const { slug } = await setUp({ ...HIDDEN_WHEEL, hiddenWheel: false })

    const player = JSON.parse(await rawRead(playerCookie, slug)) as EventView
    expect(player.pool).not.toBeNull()
    expect(player.hostGames).toBeNull()
  })

  it.each([
    ['a Hidden wheel', HIDDEN_WHEEL, false],
    ['a visible Lucky wheel', { ...HIDDEN_WHEEL, hiddenWheel: false }, true],
  ])('carries the Tags only in the Host\'s hostGames and none in a Player\'s Event read under %s, and the Price only where the pool shows it (#335, #338, #443)', async (_rule, settings, playerSeesPool) => {
    const { slug, secrets } = await setUp(settings)
    const [alpha, beta, gamma] = secrets as [Secret, Secret, Secret]

    // The Host sees the pool (Alpha, Beta) in full, with their Tags in hostGames; Gamma (in the library only) is in no read.
    const hostRaw = await rawRead(hostCookie, slug)
    expect(hostRaw).toContain('"hostGames"')
    for (const secret of [alpha, beta]) {
      expect(hostRaw).toContain(secret.tag)
      expect(hostRaw).toContain(secret.notes)
    }
    expect(hostRaw).not.toContain(gamma.tag)
    expect(hostRaw).not.toContain(gamma.notes)
    expect(hostRaw).toContain('"price"')
    expect(hostRaw).toContain('"checkedAt"')
    expect(hostRaw).toContain(priceTrace(alpha))
    expect(hostRaw).toContain(priceTrace(beta))
    expect(hostRaw).not.toContain(priceTrace(gamma))

    const playerRaw = await rawRead(playerCookie, slug)
    expect((JSON.parse(playerRaw) as EventView).hostGames).toBeNull()
    expect(playerRaw).not.toContain('"tags"')
    for (const secret of secrets) expect(playerRaw).not.toContain(secret.tag)
    if (playerSeesPool) {
      expect(playerRaw).toContain('"price"')
      expect(playerRaw).toContain('"checkedAt"')
      expect(playerRaw).toContain(priceTrace(alpha))
      expect(playerRaw).toContain(priceTrace(beta))
    }
    else {
      expect(playerRaw).not.toContain('"price"')
      expect(playerRaw).not.toContain('"checkedAt"')
      for (const secret of secrets) expect(playerRaw).not.toContain(priceTrace(secret))
    }
    expect(playerRaw).not.toContain(priceTrace(gamma))
    // The control: the library does carry them.
    const library = await request('/api/games', { headers: { cookie: hostCookie } })
    expect(await library.text()).toContain(secrets[0]!.tag)
  })

  describe('the image route', () => {
    async function fetchImage(secret: Secret, cookie?: string) {
      return await request(secret.imageUrl, { headers: cookie ? { cookie } : {} })
    }

    it('refuses the Player the image of an undrawn game under a Hidden wheel, in either pool', async () => {
      const { secrets } = await setUp()

      for (const secret of secrets) {
        const response = await fetchImage(secret, playerCookie)
        expect(response.status).toBe(404)
        expect(response.statusText).toBe('Not Found')
      }
    })

    it('serves the Player the image once the wheel is not hidden, and refuses it again when hidden again', async () => {
      const { secrets, a } = await setUp()

      await setWheelHidden(false)
      // Gamma (C) is in the library only (#279), so the Player gets no image of it.
      for (const secret of secrets.slice(0, 2)) {
        const response = await fetchImage(secret, playerCookie)
        expect(response.status).toBe(200)
        expect(new Uint8Array(await response.arrayBuffer())).toEqual(webp(secret.name))
      }

      await setWheelHidden(true)
      expect((await fetchImage(a, playerCookie)).status).toBe(404)
    })

    it('serves the Host the images under a Hidden wheel, also after the Host lost the library permission', async () => {
      const { a } = await setUp()
      expect((await fetchImage(a, hostCookie)).status).toBe(200)

      await db.update(users).set({ canHost: false }).where(eq(users.name, 'Hostess'))

      expect((await fetchImage(a, hostCookie)).status).toBe(200)
    })

    it('refuses a signed-in User who is no Member of the Event, whatever the wheel says', async () => {
      const { a } = await setUp()
      const strangerCookie = (await signIn(db, stranger)).cookie

      expect((await fetchImage(a, strangerCookie)).status).toBe(404)
      await setWheelHidden(false)
      expect((await fetchImage(a, strangerCookie)).status).toBe(404)
      expect((await fetchImage(a)).status).toBe(404)
    })

    it('refuses a Member of a deleted Event', async () => {
      const { a } = await setUp()
      await setWheelHidden(false)
      expect((await fetchImage(a, playerCookie)).status).toBe(200)

      await db.update(events).set({ deletedAt: new Date() })

      expect((await fetchImage(a, playerCookie)).status).toBe(404)
    })

    it('serves a game that sits in a second Event with a visible wheel', async () => {
      const { a } = await setUp()
      const second = await request('/api/e', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'cookie': hostCookie },
        body: JSON.stringify({
          name: 'Samstags-Zocken', dateMode: 'poll', sessions: 1, slots: ['2090-11-30T20:30'], settings: { ...HIDDEN_WHEEL, hiddenWheel: false },
          pool: [a.id],
        }),
      })
      const { inviteUrl } = await second.json() as CreatedEvent
      expect((await fetchImage(a, playerCookie)).status).toBe(404)

      const invite = new URL(inviteUrl).pathname.slice('/e/'.length)
      await request(`/api/invite/${invite}`, { method: 'POST', headers: { cookie: playerCookie } })

      expect((await fetchImage(a, playerCookie)).status).toBe(200)
    })
  })

  it('still answers 404 to the Player on the library routes', async () => {
    const { secrets, a } = await setUp()
    await setWheelHidden(false)

    expect((await request('/api/games', { headers: { cookie: playerCookie } })).status).toBe(404)
    for (const secret of secrets) {
      expect((await request(`/api/games/${secret.id}`, { headers: { cookie: playerCookie } })).status).toBe(404)
    }
    expect((await request(`/api/games/${a.id}`, { headers: { cookie: hostCookie } })).status).toBe(200)
  })
})
