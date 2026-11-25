import { describe, expect, it } from 'vitest'
import { eventPreset } from '../../shared/game'

// What the „Spiele“ step presets the game browser to (#690).
describe('eventPreset', () => {
  it('is one against one for two teams of one', () => {
    expect(eventPreset(2, 1)).toEqual({ suitability: 'one_v_one', players: 2 })
  })

  it('is Teams with the team count times the Team size otherwise', () => {
    expect(eventPreset(2, 2)).toEqual({ suitability: 'teams', players: 4 })
    expect(eventPreset(2, 3)).toEqual({ suitability: 'teams', players: 6 })
    expect(eventPreset(8, 3)).toEqual({ suitability: 'teams', players: 24 })
  })

  it('is Teams for three teams of one: one against one is only two teams of one', () => {
    expect(eventPreset(3, 1)).toEqual({ suitability: 'teams', players: 3 })
  })

  it('does not cap the players at what the stepper offers (a pure case: 8 teams of 6)', () => {
    expect(eventPreset(8, 6)).toEqual({ suitability: 'teams', players: 48 })
  })
})
