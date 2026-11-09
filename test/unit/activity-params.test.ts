import { describe, expect, expectTypeOf, it } from 'vitest'
import { ACTIVITY_NAMES, ACTIVITY_TYPES, INSTANT_ACTIVITY_TYPES, activityGames, activityPeople, isoInstant, type ActivityParams, type ActivityType, type CheckedParams, type IsoInstant, type ParamsSafe } from '../../shared/activity'
import type { Place } from '../../shared/board'
import { recordActivity } from '../../server/utils/activity'
import type { Db } from '../../server/utils/db'

// Whom an Activity entry names, which games it names, and what its params may hold (#226, #228, review 1.4 A6). Most of this is
// checked by the compiler (`pnpm typecheck` reads this file): a line with `@ts-expect-error` fails the check when the error goes away.

// A table of params types as `ActivityParams` is declared; a type that breaks the rule is a compile error here.
export type NamesAGame = CheckedParams<
  // @ts-expect-error a game's name has no key to sit under: a wide string only fits a key that ends in `Id`
  { game_drawn: { gameName: string } }
>

// What each Activity type names before 0.8 (#273 makes one table of ACTIVITY_PEOPLE and ACTIVITY_GAMES): the people by their
// User id, the games by their game id. The sample params are the ones an entry of the type holds.
const NAMED: Record<ActivityType, { params: unknown, people: string[], games: string[] }> = {
  member_joined: { params: {}, people: [], games: [] },
  member_moved: { params: { userId: 'u1', from: { zone: 'bench' }, to: { zone: 'team', team: 2 } }, people: ['u1'], games: [] },
  date_set: { params: { sessionId: 's', number: 1, startsAt: '2090-11-01T19:30:00.000Z' }, people: [], games: [] },
  date_rescheduled: { params: { sessionId: 's', number: 1, from: '2090-11-01T19:30:00.000Z', to: '2090-11-02T19:30:00.000Z' }, people: [], games: [] },
  date_reopened: { params: { sessionId: 's', number: 1, previousStartsAt: '2090-11-01T19:30:00.000Z' }, people: [], games: [] },
  session_added: { params: { sessionId: 's', startsAt: null }, people: [], games: [] },
  session_removed: { params: { sessionId: 's', number: 1, startsAt: null }, people: [], games: [] },
  session_started: { params: { sessionId: 's', number: 1 }, people: [], games: [] },
  session_ended: { params: { sessionId: 's', number: 1 }, people: [], games: [] },
  team_name_reset: { params: { team: 1 }, people: [], games: [] },
  game_count_changed: { params: { from: 3, to: 4 }, people: [], games: [] },
  team_size_changed: { params: { from: 2, to: 3 }, people: [], games: [] },
  game_drawn: { params: { roundId: 'r', drawId: 'd', gameId: 'g1' }, people: [], games: ['g1'] },
  vetoes_revealed: { params: { roundId: 'r', drawId: 'd', gameId: 'g1', vetoes: [{ team: 1 }, { team: 2 }] }, people: [], games: ['g1'] },
  game_set: { params: { roundId: 'r', gameId: 'g1' }, people: [], games: ['g1'] },
  game_put_back: { params: { roundId: 'r', gameId: 'g1' }, people: [], games: ['g1'] },
  bonus_veto_granted: { params: { team: 2 }, people: [], games: [] },
  coin_tossed: { params: { side: 'heads' }, people: [], games: [] },
  // 0.8 (#273): a Result names its game and no User; its winners are team positions.
  result_entered: { params: { roundId: 'r', number: 3, gameId: 'g1', first: [1, 2] }, people: [], games: ['g1'] },
  result_corrected: { params: { roundId: 'r', number: 3, gameId: 'g1' }, people: [], games: ['g1'] },
  event_finished: { params: { winners: [2] }, people: [], games: [] },
}

describe('ACTIVITY_NAMES', () => {
  it('has an entry only for the types that name someone or a game', () => {
    const named = ACTIVITY_TYPES.filter(type => NAMED[type].people.length > 0 || NAMED[type].games.length > 0)

    expect(Object.keys(ACTIVITY_NAMES).sort()).toEqual([...named].sort())
  })

  it('gives every Activity type the people and the games it named before (0.8 adds result_entered, result_corrected and event_finished)', () => {
    for (const type of ACTIVITY_TYPES) {
      const expected = NAMED[type]
      expect(activityPeople(type, expected.params as ActivityParams[typeof type]), `${type} people`).toEqual(expected.people)
      expect(activityGames(type, expected.params as ActivityParams[typeof type]), `${type} games`).toEqual(expected.games)
    }
  })
})

describe('the people and games of an entry', () => {
  it('names the moved Member of a move, and nobody in the entries without a User in their params', () => {
    const bench: Place = { zone: 'bench' }

    expect(activityPeople('member_moved', { userId: 'u1', from: bench, to: { zone: 'team', team: 2 } })).toEqual(['u1'])
    expect(activityPeople('session_started', { sessionId: 's1', number: 1 })).toEqual([])
    expect(activityPeople('coin_tossed', { side: 'heads' })).toEqual([])
  })

  it('names no Member in a Veto reveal: a Veto belongs to its Party (#355)', () => {
    expect(activityPeople('vetoes_revealed', { roundId: 'r', drawId: 'd', gameId: 'g', vetoes: [{ team: 1 }, { team: 2 }] })).toEqual([])
  })

  it('names the game of a draw, a Veto reveal, a set and a put back, and no game in the other entries (#228)', () => {
    expect(activityGames('game_set', { roundId: 'r', gameId: 'g1' })).toEqual(['g1'])
    expect(activityGames('game_put_back', { roundId: 'r', gameId: 'g1' })).toEqual(['g1'])
    expect(activityGames('game_drawn', { roundId: 'r', drawId: 'd', gameId: 'g1' })).toEqual(['g1'])
    expect(activityGames('vetoes_revealed', { roundId: 'r', drawId: 'd', gameId: 'g1', vetoes: [] })).toEqual(['g1'])
    expect(activityGames('session_started', { sessionId: 's', number: 1 })).toEqual([])
    expect(activityGames('coin_tossed', { side: 'tails' })).toEqual([])
  })

  it('names the game of a Result and of its correction, and no one; the event_finished entry names neither (#273)', () => {
    expect(activityGames('result_entered', { roundId: 'r', number: 1, gameId: 'g1', first: [1] })).toEqual(['g1'])
    expect(activityGames('result_corrected', { roundId: 'r', number: 1, gameId: 'g1' })).toEqual(['g1'])
    expect(activityPeople('result_entered', { roundId: 'r', number: 1, gameId: 'g1', first: [1] })).toEqual([])
    expect(activityPeople('result_corrected', { roundId: 'r', number: 1, gameId: 'g1' })).toEqual([])
    expect(activityGames('event_finished', { winners: [1] })).toEqual([])
    expect(activityPeople('event_finished', { winners: [1] })).toEqual([])
  })
})

describe('the params rule', () => {
  it('lets a wide string sit under a key that ends in Id only', () => {
    expectTypeOf<ParamsSafe<{ gameId: string }>>().toEqualTypeOf<true>()
    expectTypeOf<ParamsSafe<{ userId: string, sessionId: string, roundId: string }>>().toEqualTypeOf<true>()
    expectTypeOf<ParamsSafe<{ gameName: string }>>().toEqualTypeOf<false>()
    expectTypeOf<ParamsSafe<{ name: string | null }>>().toEqualTypeOf<false>()
    expectTypeOf<ParamsSafe<{ games: string[] }>>().toEqualTypeOf<false>()
  })

  it('lets numbers, booleans, null, string literals, places and instants through, also inside arrays and objects', () => {
    expectTypeOf<ParamsSafe<{ number: number | null, on: boolean }>>().toEqualTypeOf<true>()
    expectTypeOf<ParamsSafe<{ side: 'heads' | 'tails' }>>().toEqualTypeOf<true>()
    expectTypeOf<ParamsSafe<{ to: Place }>>().toEqualTypeOf<true>()
    expectTypeOf<ParamsSafe<{ startsAt: IsoInstant | null }>>().toEqualTypeOf<true>()
    expectTypeOf<ParamsSafe<{ vetoes: { team: number, userId: string }[] }>>().toEqualTypeOf<true>()
  })

  it('refuses an instant that is a wide string, a Date and a function', () => {
    expectTypeOf<ParamsSafe<{ startsAt: string }>>().toEqualTypeOf<false>()
    expectTypeOf<ParamsSafe<{ at: Date }>>().toEqualTypeOf<false>()
    expectTypeOf<ParamsSafe<{ read: () => string }>>().toEqualTypeOf<false>()
  })

  it('holds for every Activity type', () => {
    expectTypeOf<ParamsSafe<ActivityParams[ActivityType]>>().toEqualTypeOf<true>()
  })

  it('writes an instant as the ISO string of a Date', () => {
    expect(isoInstant(new Date('2090-11-01T19:30:00Z'))).toBe('2090-11-01T19:30:00.000Z')
  })
})

// recordActivity ties `at` to INSTANT_ACTIVITY_TYPES (review 0.7, F16). Nothing runs: `pnpm typecheck` reads these calls, and
// a `@ts-expect-error` fails it when the error goes away.
describe('recordActivity and INSTANT_ACTIVITY_TYPES', () => {
  const noop = (): void => {}
  const at = new Date('2090-11-01T19:30:00Z')

  it('takes `at` for an instant type and the request clock for any other, and refuses each the other way round', () => {
    const calls = (tx: Db): void => {
      void recordActivity(tx, noop, 'e', { type: 'coin_tossed', actorId: null, params: { side: 'heads' }, at })
      void recordActivity(tx, noop, 'e', { type: 'team_name_reset', actorId: null, params: { team: 1 }, now: at })
      // @ts-expect-error an instant type needs the `at` it may be read from
      void recordActivity(tx, noop, 'e', { type: 'coin_tossed', actorId: null, params: { side: 'heads' }, now: at })
      // @ts-expect-error a type outside INSTANT_ACTIVITY_TYPES is published at once and takes no `at`
      void recordActivity(tx, noop, 'e', { type: 'team_name_reset', actorId: null, params: { team: 1 }, at })
      // @ts-expect-error a type outside INSTANT_ACTIVITY_TYPES needs the request's clock
      void recordActivity(tx, noop, 'e', { type: 'team_name_reset', actorId: null, params: { team: 1 } })
    }
    expect(calls).toBeTypeOf('function')
  })

  it('lists exactly the types whose entries wait for their instant', () => {
    expect([...INSTANT_ACTIVITY_TYPES].sort()).toEqual(['coin_tossed', 'game_drawn', 'vetoes_revealed'])
  })
})
