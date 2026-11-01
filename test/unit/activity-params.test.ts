import { describe, expect, expectTypeOf, it } from 'vitest'
import { ACTIVITY_GAMES, ACTIVITY_PEOPLE, ACTIVITY_TYPES, activityGames, activityPeople, isoInstant, type ActivityParams, type ActivityPeople, type ActivityType, type CheckedParams, type IsoInstant, type ParamsSafe } from '../../shared/activity'
import type { Place } from '../../shared/board'

// Whom an Activity entry names, and what its params may hold (#226, review 1.4 A6). Most of this is checked by the
// compiler (`pnpm typecheck` reads this file): a line with `@ts-expect-error` fails the check when the error goes away.

/** Takes the table the way the server's ACTIVITY_PEOPLE is declared: every type has its entry. */
function declaredPeople(people: ActivityPeople): ActivityPeople {
  return people
}

// A table of params types as `ActivityParams` is declared; a type that breaks the rule is a compile error here.
export type NamesAGame = CheckedParams<
  // @ts-expect-error a game's name has no key to sit under: a wide string only fits a key that ends in `Id`
  { game_drawn: { gameName: string } }
>

describe('ACTIVITY_PEOPLE', () => {
  it('has an entry for every Activity type', () => {
    expect(Object.keys(ACTIVITY_PEOPLE).sort()).toEqual([...ACTIVITY_TYPES].sort())
  })

  it('fails to compile for a type without its people declaration', () => {
    const { member_moved: _left, ...incomplete } = ACTIVITY_PEOPLE

    // @ts-expect-error `member_moved` is missing
    declaredPeople(incomplete)
    expect(declaredPeople(ACTIVITY_PEOPLE)).toBe(ACTIVITY_PEOPLE)
  })

  it('names the moved Member of a move, and nobody in the entries without a User in their params', () => {
    const bench: Place = { zone: 'bench' }

    expect(activityPeople('member_moved', { userId: 'u1', from: bench, to: { zone: 'team', team: 2 } })).toEqual(['u1'])
    expect(activityPeople('session_started', { sessionId: 's1', number: 1 })).toEqual([])
    expect(activityPeople('coin_tossed', { side: 'heads' })).toEqual([])
  })

  it('names every Member whose Veto a reveal shows', () => {
    const vetoes = [{ team: 1, userId: 'u1' }, { team: 2, userId: 'u2' }]

    expect(activityPeople('vetoes_revealed', { roundId: 'r', drawId: 'd', gameId: 'g', vetoes })).toEqual(['u1', 'u2'])
  })
})

describe('ACTIVITY_GAMES (#228)', () => {
  it('has an entry for every Activity type, as ACTIVITY_PEOPLE has', () => {
    expect(Object.keys(ACTIVITY_GAMES).sort()).toEqual([...ACTIVITY_TYPES].sort())
  })

  it('names the game of a draw, a Veto reveal, a set and a put back, and no game in the other entries', () => {
    expect(activityGames('game_set', { roundId: 'r', gameId: 'g1' })).toEqual(['g1'])
    expect(activityGames('game_put_back', { roundId: 'r', gameId: 'g1' })).toEqual(['g1'])
    expect(activityGames('game_drawn', { roundId: 'r', drawId: 'd', gameId: 'g1' })).toEqual(['g1'])
    expect(activityGames('vetoes_revealed', { roundId: 'r', drawId: 'd', gameId: 'g1', vetoes: [] })).toEqual(['g1'])
    expect(activityGames('session_started', { sessionId: 's', number: 1 })).toEqual([])
    expect(activityGames('coin_tossed', { side: 'tails' })).toEqual([])
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
