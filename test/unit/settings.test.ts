import { describe, expect, it } from 'vitest'
import {
  GAME_COUNT_DEFAULT,
  defaultSettings,
  defaultVetoAllowance,
  linearPoints,
  parseSettings,
  pointsFor,
  recommendedPoolSize,
  risingPlace,
  settingsFromRow,
  withTeams,
  winnerTakesAllPoints,
} from '../../shared/settings'

// The settings rules (#144): one module for the stepper and the server.

/** A valid payload (2 teams of 3, linear, Admin pick) with changes. */
function payload(overrides: Record<string, unknown> = {}) {
  return {
    format: 'teams',
    teamCount: 2,
    teamSize: 3,
    gameCount: 10,
    pointsTable: { preset: 'linear', values: [1, 0] },
    selectionMode: 'admin_pick',
    ...overrides,
  }
}

function errorOf(input: unknown) {
  const result = parseSettings(input)
  return result.ok ? null : result.error
}

describe('points tables', () => {
  it('linear counts down to 0', () => {
    expect(linearPoints(2)).toEqual([1, 0])
    expect(linearPoints(4)).toEqual([3, 2, 1, 0])
  })

  it('winner takes all gives the first place what linear gives and the rest nothing', () => {
    expect(winnerTakesAllPoints(2)).toEqual([1, 0])
    expect(winnerTakesAllPoints(4)).toEqual([3, 0, 0, 0])
  })

  it('pointsFor follows the preset and the team count', () => {
    expect(pointsFor('linear', 3)).toEqual([2, 1, 0])
    expect(pointsFor('winner_takes_all', 3)).toEqual([2, 0, 0])
  })

  it('a custom table is cut or padded with 0 to the team count', () => {
    expect(pointsFor('custom', 2, [5, 3, 1])).toEqual([5, 3])
    expect(pointsFor('custom', 4, [5, 3])).toEqual([5, 3, 0, 0])
    expect(pointsFor('custom', 3)).toEqual([0, 0, 0])
  })

  it('risingPlace names the 1-based place that earns more than the one above', () => {
    expect(risingPlace([3, 2, 1, 0])).toBeNull()
    expect(risingPlace([2, 2, 2])).toBeNull()
    expect(risingPlace([5, 3, 4, 0])).toBe(3)
    expect(risingPlace([1, 2])).toBe(2)
  })
})

describe('withTeams', () => {
  it('a preset table follows the team count', () => {
    const base = defaultSettings()
    expect(withTeams(base, 4, 2).pointsTable).toEqual({ preset: 'linear', values: [3, 2, 1, 0] })
    expect(withTeams({ ...base, pointsTable: { preset: 'winner_takes_all', values: [1, 0] } }, 4, 2).pointsTable).toEqual({ preset: 'winner_takes_all', values: [3, 0, 0, 0] })
  })

  it('a custom table keeps its values, cut or padded with 0', () => {
    const custom = { ...defaultSettings(), teamCount: 3, pointsTable: { preset: 'custom' as const, values: [5, 3, 1] } }
    expect(withTeams(custom, 2, 3).pointsTable).toEqual({ preset: 'custom', values: [5, 3] })
    expect(withTeams(custom, 5, 3).pointsTable).toEqual({ preset: 'custom', values: [5, 3, 1, 0, 0] })
  })

  it('sets the teams and leaves the rest as it was', () => {
    expect(withTeams(defaultSettings(), 4, 2)).toMatchObject({ teamCount: 4, teamSize: 2, gameCount: 10, selectionMode: 'admin_pick' })
  })
})

describe('defaults and helpers', () => {
  it('the veto allowance defaults to at least 3, or the Team size', () => {
    expect(defaultVetoAllowance(1)).toBe(3)
    expect(defaultVetoAllowance(3)).toBe(3)
    expect(defaultVetoAllowance(5)).toBe(5)
  })

  it('a new Event is a 3v3 with 10 Games, linear points and Admin pick', () => {
    expect(defaultSettings()).toEqual({
      format: 'teams',
      teamCount: 2,
      teamSize: 3,
      gameCount: GAME_COUNT_DEFAULT,
      pointsTable: { preset: 'linear', values: [1, 0] },
      selectionMode: 'admin_pick',
      hiddenWheel: false,
      vetoAllowance: null,
    })
    expect(GAME_COUNT_DEFAULT).toBe(10)
  })

  it('the default settings are valid', () => {
    expect(parseSettings(defaultSettings())).toEqual({ ok: true, settings: defaultSettings() })
  })

  it('the recommended pool is the Game count, plus the vetoes of all Parties on the Lucky Wheel', () => {
    expect(recommendedPoolSize({ gameCount: 10, teamCount: 4, selectionMode: 'admin_pick', vetoAllowance: null })).toBe(10)
    expect(recommendedPoolSize({ gameCount: 10, teamCount: 4, selectionMode: 'lucky_wheel', vetoAllowance: 3 })).toBe(22)
    expect(recommendedPoolSize({ gameCount: 6, teamCount: 2, selectionMode: 'lucky_wheel', vetoAllowance: 0 })).toBe(6)
  })
})

describe('settingsFromRow', () => {
  const empty = { format: null, teamCount: null, teamSize: null, gameCount: null, pointsTable: null, selectionMode: null, hiddenWheel: null, vetoAllowance: null }

  it('an Event from before 1.3 (all null) is not set up', () => {
    expect(settingsFromRow(empty)).toBeNull()
  })

  it('any missing required column means not set up', () => {
    const full = { ...empty, format: 'teams' as const, teamCount: 2, teamSize: 3, gameCount: 10, pointsTable: { preset: 'linear' as const, values: [1, 0] }, selectionMode: 'admin_pick' as const, hiddenWheel: false }
    expect(settingsFromRow(full)).toEqual({ ...full, vetoAllowance: null })
    expect(settingsFromRow({ ...full, gameCount: null })).toBeNull()
    expect(settingsFromRow({ ...full, pointsTable: null })).toBeNull()
  })

  it('keeps the wheel options of a Lucky Wheel Event', () => {
    const row = { format: 'teams' as const, teamCount: 4, teamSize: 2, gameCount: 6, pointsTable: { preset: 'linear' as const, values: [3, 2, 1, 0] }, selectionMode: 'lucky_wheel' as const, hiddenWheel: true, vetoAllowance: 4 }
    expect(settingsFromRow(row)).toEqual(row)
  })
})

describe('parseSettings', () => {
  it('accepts a valid payload', () => {
    expect(parseSettings(payload())).toEqual({
      ok: true,
      settings: {
        format: 'teams', teamCount: 2, teamSize: 3, gameCount: 10, pointsTable: { preset: 'linear', values: [1, 0] },
        selectionMode: 'admin_pick', hiddenWheel: false, vetoAllowance: null,
      },
    })
  })

  it.each([undefined, null, 'teams', 5, []])('refuses %j as settings', (input) => {
    expect(errorOf(input)).toBe('invalid_settings')
  })

  describe('Format', () => {
    it('refuses a missing or unknown Format', () => {
      expect(errorOf(payload({ format: undefined }))).toBe('invalid_settings')
      expect(errorOf(payload({ format: 'bogus' }))).toBe('invalid_settings')
    })

    it('refuses free-for-all as not available yet', () => {
      expect(errorOf(payload({ format: 'ffa' }))).toBe('format_unavailable')
    })
  })

  describe('teams', () => {
    it('takes 2 to 8 teams', () => {
      expect(errorOf(payload({ teamCount: 1, pointsTable: { preset: 'custom', values: [0] } }))).toBe('team_count_range')
      expect(errorOf(payload({ teamCount: 9, teamSize: 1, pointsTable: { preset: 'linear', values: linearPoints(9) } }))).toBe('team_count_range')
      expect(errorOf(payload({ teamCount: 8, teamSize: 3, pointsTable: { preset: 'linear', values: linearPoints(8) } }))).toBeNull()
      expect(errorOf(payload({ teamCount: 2 }))).toBeNull()
    })

    it('takes a Team size from 1 to 6', () => {
      expect(errorOf(payload({ teamSize: 0 }))).toBe('team_size_range')
      expect(errorOf(payload({ teamSize: 7 }))).toBe('team_size_range')
      expect(errorOf(payload({ teamSize: 1 }))).toBeNull()
      expect(errorOf(payload({ teamSize: 6 }))).toBeNull()
    })

    it('takes at most 24 Players in teams', () => {
      const four = { teamCount: 4, teamSize: 6, pointsTable: { preset: 'linear', values: linearPoints(4) } }
      const five = { teamCount: 5, teamSize: 5, pointsTable: { preset: 'linear', values: linearPoints(5) } }
      expect(errorOf(payload(four))).toBeNull()
      expect(errorOf(payload(five))).toBe('too_many_players')
    })

    it.each([2.5, '2', null, Number.NaN])('refuses %j as a team count', (teamCount) => {
      expect(errorOf(payload({ teamCount }))).toBe('invalid_settings')
    })

    it.each([2.5, '3', null])('refuses %j as a Team size', (teamSize) => {
      expect(errorOf(payload({ teamSize }))).toBe('invalid_settings')
    })
  })

  describe('Game count', () => {
    it('takes 1 to 30', () => {
      expect(errorOf(payload({ gameCount: 0 }))).toBe('game_count_range')
      expect(errorOf(payload({ gameCount: 31 }))).toBe('game_count_range')
      expect(errorOf(payload({ gameCount: 1 }))).toBeNull()
      expect(errorOf(payload({ gameCount: 30 }))).toBeNull()
    })

    it('refuses a fraction or text', () => {
      expect(errorOf(payload({ gameCount: 2.5 }))).toBe('invalid_settings')
      expect(errorOf(payload({ gameCount: '10' }))).toBe('invalid_settings')
    })
  })

  describe('points table', () => {
    it('accepts the presets for 2 and 4 teams', () => {
      expect(errorOf(payload({ pointsTable: { preset: 'linear', values: [1, 0] } }))).toBeNull()
      expect(errorOf(payload({ teamCount: 4, teamSize: 2, pointsTable: { preset: 'linear', values: [3, 2, 1, 0] } }))).toBeNull()
      expect(errorOf(payload({ teamCount: 4, teamSize: 2, pointsTable: { preset: 'winner_takes_all', values: [3, 0, 0, 0] } }))).toBeNull()
    })

    it('refuses preset values that are not the preset', () => {
      expect(errorOf(payload({ teamCount: 4, teamSize: 2, pointsTable: { preset: 'linear', values: [5, 3, 1, 0] } }))).toBe('invalid_points')
      expect(errorOf(payload({ teamCount: 4, teamSize: 2, pointsTable: { preset: 'winner_takes_all', values: [3, 2, 1, 0] } }))).toBe('invalid_points')
    })

    it('accepts a custom table, equal places included', () => {
      expect(errorOf(payload({ teamCount: 3, pointsTable: { preset: 'custom', values: [5, 3, 1] } }))).toBeNull()
      expect(errorOf(payload({ teamCount: 3, pointsTable: { preset: 'custom', values: [2, 2, 2] } }))).toBeNull()
    })

    it('refuses a custom table in which a place earns more than the place above', () => {
      expect(errorOf(payload({ teamCount: 3, pointsTable: { preset: 'custom', values: [5, 1, 3] } }))).toBe('points_rising')
    })

    it('refuses a table of the wrong length, negative, fractional or too high values', () => {
      expect(errorOf(payload({ pointsTable: { preset: 'custom', values: [1] } }))).toBe('invalid_points')
      expect(errorOf(payload({ pointsTable: { preset: 'custom', values: [1, 0, 0] } }))).toBe('invalid_points')
      expect(errorOf(payload({ pointsTable: { preset: 'custom', values: [1, -1] } }))).toBe('invalid_points')
      expect(errorOf(payload({ pointsTable: { preset: 'custom', values: [2.5, 0] } }))).toBe('invalid_points')
      expect(errorOf(payload({ pointsTable: { preset: 'custom', values: [100, 0] } }))).toBe('invalid_points')
      expect(errorOf(payload({ pointsTable: { preset: 'custom', values: [99, 0] } }))).toBeNull()
    })

    it('refuses a missing table or an unknown preset', () => {
      expect(errorOf(payload({ pointsTable: undefined }))).toBe('invalid_settings')
      expect(errorOf(payload({ pointsTable: { preset: 'bogus', values: [1, 0] } }))).toBe('invalid_settings')
      expect(errorOf(payload({ pointsTable: { preset: 'custom' } }))).toBe('invalid_settings')
    })
  })

  describe('Selection mode', () => {
    it('refuses a missing or unknown mode', () => {
      expect(errorOf(payload({ selectionMode: undefined }))).toBe('invalid_settings')
      expect(errorOf(payload({ selectionMode: 'bogus' }))).toBe('invalid_settings')
    })

    it.each(['pick_ban', 'losers_pick', 'losers_advantage'])('refuses %s as not available yet', (selectionMode) => {
      expect(errorOf(payload({ selectionMode }))).toBe('mode_unavailable')
    })

    it('Lucky Wheel defaults the veto allowance to max(3, Team size) and the wheel to visible', () => {
      const result = parseSettings(payload({ selectionMode: 'lucky_wheel', teamSize: 5 }))
      expect(result).toMatchObject({ ok: true, settings: { selectionMode: 'lucky_wheel', hiddenWheel: false, vetoAllowance: 5 } })
      expect(parseSettings(payload({ selectionMode: 'lucky_wheel', teamSize: 2 }))).toMatchObject({ ok: true, settings: { vetoAllowance: 3 } })
    })

    it('Lucky Wheel takes a hidden wheel and a veto allowance from 0 to 9', () => {
      expect(parseSettings(payload({ selectionMode: 'lucky_wheel', hiddenWheel: true, vetoAllowance: 0 })))
        .toMatchObject({ ok: true, settings: { hiddenWheel: true, vetoAllowance: 0 } })
      expect(errorOf(payload({ selectionMode: 'lucky_wheel', vetoAllowance: 9 }))).toBeNull()
      expect(errorOf(payload({ selectionMode: 'lucky_wheel', vetoAllowance: 10 }))).toBe('veto_allowance_range')
      expect(errorOf(payload({ selectionMode: 'lucky_wheel', vetoAllowance: -1 }))).toBe('veto_allowance_range')
      expect(errorOf(payload({ selectionMode: 'lucky_wheel', vetoAllowance: 2.5 }))).toBe('invalid_settings')
      expect(errorOf(payload({ selectionMode: 'lucky_wheel', hiddenWheel: 'yes' }))).toBe('invalid_settings')
    })

    it('Admin pick has no wheel options', () => {
      expect(errorOf(payload({ hiddenWheel: true }))).toBe('wheel_options_without_wheel')
      expect(errorOf(payload({ vetoAllowance: 3 }))).toBe('wheel_options_without_wheel')
      expect(errorOf(payload({ hiddenWheel: false, vetoAllowance: null }))).toBeNull()
    })
  })

  it('names the first broken rule, in the order Format, teams, Game count, points, mode', () => {
    expect(errorOf(payload({ format: 'ffa', teamCount: 99 }))).toBe('format_unavailable')
    expect(errorOf(payload({ teamCount: 99, gameCount: 0 }))).toBe('team_count_range')
    expect(errorOf(payload({ gameCount: 0, pointsTable: undefined }))).toBe('game_count_range')
    expect(errorOf(payload({ pointsTable: undefined, selectionMode: 'pick_ban' }))).toBe('invalid_settings')
    expect(errorOf(payload({ pointsTable: { preset: 'custom', values: [0, 1] }, selectionMode: 'pick_ban' }))).toBe('points_rising')
  })
})
