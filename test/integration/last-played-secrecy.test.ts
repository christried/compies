import { describe, expect, it } from 'vitest'
import { hostCreatesEvent, hostEntersResult, hostSets, playersJoin, readEventText, readFeedText, signInAs, startRunningSession } from './scenario'
import { hiddenWheelWorld, HIDDEN_WHEEL, OTHER_PARTY, OUTSIDER, PLAYER, second, stranger, sweepGets } from './hidden-wheel-world'
import type { GameList } from '../../shared/game'

// The „zuletzt am“ date stays the Host's (#900, spec #894 stories 63 and 64): it travels with the library's read, which Members never get, and no
// read of an Event carries it, under a Hidden wheel too. The Event read legitimately carries a Result's instant for the Rounds of THAT Event, so the
// search is made in a second Event of the Host that holds the same game, and Event 1's reads are not asserted on.

const T0 = '2090-10-30T10:00:00.000Z'
// An instant no other value of a read equals; the Result of Event 1 is entered at it (the request's clock, ADR 0013).
const RESULT_AT = '2090-10-30T10:41:23.456Z'
const TRACE = '10:41:23.456'

describe('the last played date is hidden from everyone but the Host (#900)', () => {
  const world = hiddenWheelWorld()

  /** Event 1: the Host plays the game and enters a Result at RESULT_AT. Event 2: the same game in its pool, under a Hidden wheel, with the Player and the other Party in it. */
  async function twoEvents() {
    const rig = world.rig()
    const game = await world.newGame('Alpha Arena', 'aaaaaaaaaaa')
    const secondSigned = await signInAs(rig, second)
    const strangerSigned = await signInAs(rig, stranger)

    world.clock.set(T0)
    const first = await hostCreatesEvent(rig, world.hostSigned, { name: 'Erstes Mal', sessions: 1, slots: ['2090-10-30T20:30'], pool: [game.id] })
    await playersJoin(rig, first, [world.playerSigned, secondSigned])
    await startRunningSession(rig, { slug: first.slug, host: world.hostSigned }, [world.playerSigned, secondSigned])
    const roundId = await hostSets(rig, { slug: first.slug, host: world.hostSigned }, game.id)
    world.clock.set(RESULT_AT)
    await hostEntersResult(rig, { slug: first.slug, host: world.hostSigned }, roundId, [{ team: 1, place: 1 }, { team: 2, place: 2 }])

    world.clock.set(T0)
    const next = await hostCreatesEvent(rig, world.hostSigned, { name: 'Zweites Mal', sessions: 1, slots: ['2090-10-31T20:30'], settings: HIDDEN_WHEEL, pool: [game.id] })
    await playersJoin(rig, next, [world.playerSigned, secondSigned])
    world.notifier.clear()
    return { game, next, secondSigned, strangerSigned }
  }

  it('control: the Host\'s own library read carries the date, so the search below looks for something the app writes', async () => {
    const { game } = await twoEvents()

    const response = await world.request('/api/games', { headers: { cookie: world.hostCookie } })
    expect(response.status).toBe(200)
    const text = await response.text()
    expect(text).toContain(TRACE)
    expect((JSON.parse(text) as GameList).lastPlayed).toEqual({ [game.id]: RESULT_AT })
  })

  it('keeps the date and the key out of another Event\'s read, feed and room, for a Player and for the Host, under a Hidden wheel', async () => {
    const { next } = await twoEvents()
    const rig = world.rig()

    for (const [who, cookie] of [['the Player', world.playerCookie], ['the Host', world.hostCookie]] as const) {
      const places = {
        [`the Event read as ${who}`]: await readEventText(rig, cookie, next.slug),
        [`the feed as ${who}`]: await readFeedText(rig, cookie, next.slug, 'limit=100'),
      }
      for (const [place, text] of Object.entries(places)) {
        expect(text, place).not.toContain(TRACE)
        expect(text, place).not.toContain('lastPlayed')
      }
    }
    const room = JSON.stringify(world.notifier.messages(next.eventId))
    expect(room).not.toContain(TRACE)
    expect(room).not.toContain('lastPlayed')
  })

  it('has the date and the key in no GET route a Player, the other Party or a non-Member can read', async () => {
    const { next, secondSigned, strangerSigned } = await twoEvents()

    const sweep = await sweepGets(world.request, {
      viewers: [
        { who: PLAYER, cookie: world.playerCookie },
        { who: OTHER_PARTY, cookie: secondSigned.cookie },
        { who: OUTSIDER, cookie: strangerSigned.cookie },
      ],
      event: { slug: next.slug, inviteToken: next.inviteToken },
      games: [],
    })

    expect(sweep.length).toBeGreaterThan(10)
    for (const entry of sweep) {
      if (entry.body === null) continue
      expect(entry.body, `${entry.label} as ${entry.who}`).not.toContain(TRACE)
      expect(entry.body, `${entry.label} as ${entry.who}`).not.toContain('lastPlayed')
    }
  })
})
