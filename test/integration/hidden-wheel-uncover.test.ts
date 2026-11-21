import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { draws } from '../../server/db/schema'
import type { Db } from '../../server/utils/db'
import type { EventView } from '../../shared/event'
import de from '../../i18n/locales/de.json'
import { errorOf } from './app'
import { hiddenWheelWorld, type Secret } from './hidden-wheel-world'
import { clockToStop, hostEndsSession, hostEntersResult, hostFinishes, hostSpins, readFeed, type Signed } from './scenario'

// The uncover of a Hidden wheel (#957, spec #961 § Uncover, GLOSSARY: Hidden wheel): once every Round up to the Game count has its Result,
// while the Session runs, the Host uncovers the wheel and every Member learns the games that were on it. Before the uncover a Player's read
// names no game left on the wheel; after it, every one, and a later spin's labels are real (CODING_STANDARDS § Secrecy). The Pool preview stays
// off, the room hears the existing `event.changed`, and the feed gets no entry. The refusals are the route's rule, checked in its order.

describe('Uncovering a Hidden wheel (#957)', () => {
  const world = hiddenWheelWorld()
  const { request, notifier, rawRead, runningEvent, NO_WINDOW, rig } = world
  let db: Db
  let hostSigned: Signed
  let hostCookie: string
  let playerCookie: string

  beforeEach(() => {
    db = world.db
    hostSigned = world.hostSigned
    hostCookie = world.hostCookie
    playerCookie = world.playerCookie
  })

  /** One game to play, two more on the wheel than the drawn one: Alpha, Beta and two extra games in the Game pool; no Veto window, so the spin settles at its stop. */
  const ONE_GAME = { ...NO_WINDOW, gameCount: 1 }

  const uncover = (slug: string, cookie: string) => request(`/api/e/${slug}/uncover`, { method: 'POST', headers: { cookie } })
  const read = async (cookie: string, slug: string) => JSON.parse(await rawRead(cookie, slug)) as EventView

  /** Spins, moves to the stop and enters the Result: a sole winner, or a Tie when `tie`. Answers the drawn game and the games left on the wheel. */
  async function playTheOneGame(slug: string, pool: readonly Secret[], { tie = false } = {}) {
    const { roundId, drawId } = await hostSpins(rig(), { slug, host: hostSigned })
    await clockToStop(rig(), drawId)
    await hostEntersResult(rig(), { slug, host: hostSigned }, roundId, [{ team: 1, place: 1 }, { team: 2, place: tie ? 1 : 2 }])
    const [draw] = await db.select({ gameId: draws.gameId }).from(draws).where(eq(draws.id, drawId))
    return { drawn: pool.find(game => game.id === draw!.gameId)!, left: pool.filter(game => game.id !== draw!.gameId) }
  }

  it('names no game left on the wheel to a Player before the uncover, every one after it, and nothing of the library', async () => {
    const { slug, a, b, c, epsilon, more } = await runningEvent(ONE_GAME, 2)
    const { drawn, left } = await playTheOneGame(slug, [a, b, ...more])

    const before = await rawRead(playerCookie, slug)
    expect(before).toContain(drawn.name)
    for (const game of [...left, c, epsilon]) expect(before, `names ${game.name}`).not.toContain(game.name)
    expect((JSON.parse(before) as EventView)).toMatchObject({ wheelUncovered: false, uncover: null, wheel: { count: 3, slices: null } })
    expect((await read(hostCookie, slug)).uncover).toEqual({ rejection: null })

    const response = await uncover(slug, hostCookie)
    expect(response.status).toBe(200)

    const after = await read(playerCookie, slug)
    expect(after.wheelUncovered).toBe(true)
    expect(after.wheel!.slices!.map(slice => slice.name).sort()).toEqual(left.map(game => game.name).sort())
    // The last spin's labels are the real names of its slices now: the drawn game and every game that was on the wheel with it.
    expect([...after.wheel!.spin!.labels!].sort()).toEqual([drawn, ...left].map(game => game.name).sort())
    for (const label of after.wheel!.spin!.labels!) expect([...de.wheel.placeholders, de.wheel.placeholderQ]).not.toContain(label)
    // The Pool preview stays off, and the library's games stay unknown.
    expect(after.pool).toBeNull()
    expect(after.settings).toMatchObject({ hiddenWheel: true, poolPreview: false })
    const raw = await rawRead(playerCookie, slug)
    for (const game of [c, epsilon]) expect(raw).not.toContain(game.name)
    // The Host's read: uncovered, and the uncover is refused from now on.
    expect(await read(hostCookie, slug)).toMatchObject({ wheelUncovered: true, uncover: { rejection: 'wheel_uncovered' } })
  })

  it('tells the room with event.changed and writes no Activity entry', async () => {
    const { slug, eventId, a, b, more } = await runningEvent(ONE_GAME, 2)
    await playTheOneGame(slug, [a, b, ...more])
    const feedBefore = await readFeed(rig(), hostCookie, slug, 'limit=100')
    notifier.clear()

    expect((await uncover(slug, hostCookie)).status).toBe(200)

    expect(notifier.messages(eventId)).toEqual([expect.objectContaining({ type: 'event.changed' })])
    expect(await readFeed(rig(), hostCookie, slug, 'limit=100')).toEqual(feedBefore)
  })

  it('lets a Round added after a Tie spin the uncovered wheel openly: its labels are real before the stop, its game still only from the stop on', async () => {
    const { slug, a, b, more } = await runningEvent(ONE_GAME, 2)
    const { left } = await playTheOneGame(slug, [a, b, ...more], { tie: true })
    expect((await uncover(slug, hostCookie)).status).toBe(200)
    expect((await request(`/api/e/${slug}/last-game`, { method: 'POST', headers: { cookie: hostCookie } })).status).toBe(200)

    await hostSpins(rig(), { slug, host: hostSigned })

    const spin = (await read(playerCookie, slug)).wheel!.spin!
    expect([...spin.labels!].sort()).toEqual(left.map(game => game.name).sort())
    expect(spin.game).toBeNull()
  })

  describe('refuses', () => {
    it('a Player: only the Host uncovers', async () => {
      const { slug, a, b, more } = await runningEvent(ONE_GAME, 2)
      await playTheOneGame(slug, [a, b, ...more])

      expect(await errorOf(await uncover(slug, playerCookie))).toEqual({ status: 403, code: 'not_host' })
      expect((await read(playerCookie, slug)).wheelUncovered).toBe(false)
    })

    it('while a Round up to the Game count has no Result', async () => {
      const { slug } = await runningEvent(ONE_GAME, 2)

      expect((await read(hostCookie, slug)).uncover).toEqual({ rejection: 'results_missing' })
      expect(await errorOf(await uncover(slug, hostCookie))).toEqual({ status: 409, code: 'results_missing' })
    })

    it('a wheel that is not hidden', async () => {
      const { slug, a, b, more } = await runningEvent({ ...ONE_GAME, hiddenWheel: false }, 2)
      await playTheOneGame(slug, [a, b, ...more])

      expect((await read(hostCookie, slug)).uncover).toEqual({ rejection: 'wheel_not_hidden' })
      expect(await errorOf(await uncover(slug, hostCookie))).toEqual({ status: 409, code: 'wheel_not_hidden' })
    })

    it('a second uncover', async () => {
      const { slug, a, b, more } = await runningEvent(ONE_GAME, 2)
      await playTheOneGame(slug, [a, b, ...more])
      expect((await uncover(slug, hostCookie)).status).toBe(200)

      expect(await errorOf(await uncover(slug, hostCookie))).toEqual({ status: 409, code: 'wheel_uncovered' })
    })

    it('without a Running Session: the wheel is not on screen', async () => {
      const { slug, a, b, more } = await runningEvent(ONE_GAME, 2)
      await playTheOneGame(slug, [a, b, ...more])
      await hostEndsSession(rig(), { slug, host: hostSigned })

      expect((await read(hostCookie, slug)).uncover).toEqual({ rejection: 'no_running_session' })
      expect(await errorOf(await uncover(slug, hostCookie))).toEqual({ status: 409, code: 'no_running_session' })
      expect((await read(playerCookie, slug)).wheelUncovered).toBe(false)
    })

    it('in a finished Event', async () => {
      const { slug, a, b, more } = await runningEvent(ONE_GAME, 2)
      await playTheOneGame(slug, [a, b, ...more])
      await hostFinishes(rig(), { slug, host: hostSigned }, { outcome: 'winner', winners: [1] })

      expect(await errorOf(await uncover(slug, hostCookie))).toEqual({ status: 409, code: 'wrong_phase' })
    })
  })
})
