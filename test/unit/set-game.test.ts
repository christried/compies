import { describe, expect, it } from 'vitest'
import { parseSetGame } from '../../server/domain/rounds'

// What the Host sends to set the next game (#228, #232): the game, and whether the Parties may veto it.

const GAME = '3f2b6c0e-5a4d-4c1e-9b7a-1d2e3f4a5b6c'

describe('parseSetGame', () => {
  it('takes a game id, with no Veto allowed when the switch is absent', () => {
    expect(parseSetGame({ gameId: GAME })).toEqual({ ok: true, gameId: GAME, vetoAllowed: false })
  })

  it('takes the switch as sent', () => {
    expect(parseSetGame({ gameId: GAME, vetoAllowed: true })).toEqual({ ok: true, gameId: GAME, vetoAllowed: true })
    expect(parseSetGame({ gameId: GAME, vetoAllowed: false })).toEqual({ ok: true, gameId: GAME, vetoAllowed: false })
  })

  it('lowercases the id', () => {
    expect(parseSetGame({ gameId: GAME.toUpperCase() })).toMatchObject({ ok: true, gameId: GAME })
  })

  it('refuses a switch that is no boolean with invalid_value', () => {
    for (const vetoAllowed of ['true', 1, 0, null, {}]) {
      expect(parseSetGame({ gameId: GAME, vetoAllowed })).toEqual({ ok: false, error: 'invalid_value' })
    }
  })

  it('refuses a body without a game id with invalid_value', () => {
    expect(parseSetGame({ vetoAllowed: true })).toEqual({ ok: false, error: 'invalid_value' })
    expect(parseSetGame('x')).toEqual({ ok: false, error: 'invalid_value' })
  })
})
