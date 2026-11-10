import { describe, expect, it } from 'vitest'
import { hostGameIds } from '../../server/utils/library'
import type { EventView } from '../../shared/event'

// The games the Host's read names as tiles (#443): the Game pool, the open Rounds' games and the latest spin's game, each id once.

const face = (id: string) => ({ id, name: id, imageUrl: null, youtubeId: null, price: null })
const roundGame = (id: string) => ({ ...face(id), clipStart: 0, clipLength: 30, playersMin: null, playersMax: null, suitabilities: [] })
const round = (id: string, gameId: string) => ({ id, startedAt: '2026-11-10T10:00:00.000Z', setAt: '2026-11-10T10:00:00.000Z', game: roundGame(gameId) })
const wheel = (gameId: string | null): NonNullable<EventView['wheel']> => ({ count: 2, slices: null, vetoes: { left: [], own: null, revealed: null, draw: null }, spin: { game: gameId === null ? null : roundGame(gameId) } }) as unknown as NonNullable<EventView['wheel']>

describe('hostGameIds (#443)', () => {
  it('is empty with no pool, no Rounds and no wheel', () => {
    expect(hostGameIds({ pool: null, rounds: [], wheel: null })).toEqual([])
  })

  it('names the pool\'s games', () => {
    expect(hostGameIds({ pool: [face('a'), face('b')], rounds: [], wheel: null })).toEqual(['a', 'b'])
  })

  it('names the games of the open Rounds, also with no pool', () => {
    expect(hostGameIds({ pool: null, rounds: [round('r1', 'x'), round('r2', 'y')], wheel: null })).toEqual(['x', 'y'])
  })

  it('names a game once when the pool and a Round both have it', () => {
    expect(hostGameIds({ pool: [face('a'), face('b')], rounds: [round('r1', 'b'), round('r2', 'c')], wheel: null })).toEqual(['a', 'b', 'c'])
  })

  it('names the latest spin\'s game, once, and nothing for a spin whose game is not known', () => {
    expect(hostGameIds({ pool: [face('a')], rounds: [], wheel: wheel('a') })).toEqual(['a'])
    expect(hostGameIds({ pool: [face('a')], rounds: [], wheel: wheel('z') })).toEqual(['a', 'z'])
    expect(hostGameIds({ pool: [], rounds: [], wheel: wheel(null) })).toEqual([])
    expect(hostGameIds({ pool: [], rounds: [], wheel: { ...wheel('a'), spin: null } })).toEqual([])
  })
})
