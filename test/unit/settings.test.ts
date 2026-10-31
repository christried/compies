import { describe, expect, it } from 'vitest'
import type { Phase } from '../../shared/event'
import {
  GAME_COUNT_DEFAULT,
  LOCKED_WHEN_RUNNING,
  TEAM_COUNT_MAX,
  TEAM_COUNT_MIN,
  changedKeys,
  checkSettingsChange,
  settingsEditable,
  settingsLocked,
  defaultSettings,
  defaultVetoAllowance,
  isFlat,
  mergeSettings,
  linearPoints,
  parseSettings,
  poolHint,
  pointsFor,
  recommendedPoolSize,
  risingPlace,
  settingsFromRow,
  storedHiddenWheel,
  TEAM_SIZE_MIN,
  teamSizeFloor,
  withTeams,
  winnerTakesAllPoints,
} from '../../shared/settings'

// The settings rules (#144): one module for the stepper and the server.

/** A valid payload (2 teams of 3, linear, Host pick) with changes. */
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

  it('isFlat is true only for two or more places that all earn what the first place earns (#175)', () => {
    expect(isFlat([3, 3, 3])).toBe(true)
    expect(isFlat([0, 0])).toBe(true)
    expect(isFlat([5, 5, 5, 4])).toBe(false)
    expect(isFlat([1, 0])).toBe(false)
    expect(isFlat([5])).toBe(false)
  })

  it('the presets never give every place the same, for 2 to 8 teams (#175)', () => {
    for (let teams = TEAM_COUNT_MIN; teams <= TEAM_COUNT_MAX; teams++) {
      for (const preset of ['linear', 'winner_takes_all'] as const) {
        const values = pointsFor(preset, teams)
        expect(isFlat(values)).toBe(false)
        expect(values[0]!).toBeGreaterThan(values[teams - 1]!)
      }
    }
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

  it('a new Event is a 3v3 with 10 Games, linear points and Host pick', () => {
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

  it('the recommended pool is the Game count, plus the vetoes of all Parties on the Glücksrad', () => {
    expect(recommendedPoolSize({ gameCount: 10, teamCount: 4, selectionMode: 'admin_pick', vetoAllowance: null })).toBe(10)
    expect(recommendedPoolSize({ gameCount: 10, teamCount: 4, selectionMode: 'lucky_wheel', vetoAllowance: 3 })).toBe(22)
    expect(recommendedPoolSize({ gameCount: 6, teamCount: 2, selectionMode: 'lucky_wheel', vetoAllowance: 0 })).toBe(6)
  })
})

describe('poolHint', () => {
  const lucky = { gameCount: 10, teamCount: 2, selectionMode: 'lucky_wheel', vetoAllowance: 3 } as const
  const admin = { gameCount: 10, teamCount: 2, selectionMode: 'admin_pick', vetoAllowance: null } as const

  it('names the worst case on the Glücksrad: Games plus the vetoes of all Parties', () => {
    expect(poolHint(lucky, 12)).toEqual({ games: 10, vetoes: 6, needed: 16, have: 12 })
  })

  it('is null at and above the recommended size', () => {
    expect(poolHint(lucky, 16)).toBeNull()
    expect(poolHint(lucky, 30)).toBeNull()
  })

  it('needs only the Game count with Host pick', () => {
    expect(poolHint(admin, 9)).toEqual({ games: 10, vetoes: 0, needed: 10, have: 9 })
    expect(poolHint(admin, 10)).toBeNull()
  })

  it('counts an empty pool', () => {
    expect(poolHint(admin, 0)).toEqual({ games: 10, vetoes: 0, needed: 10, have: 0 })
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

  it('a null Hidden wheel on an Event with settings counts as hidden (fail-closed, N11)', () => {
    const row = { ...empty, format: 'teams' as const, teamCount: 2, teamSize: 3, gameCount: 10, pointsTable: { preset: 'linear' as const, values: [1, 0] }, selectionMode: 'lucky_wheel' as const }
    expect(settingsFromRow(row)?.hiddenWheel).toBe(true)
    expect(storedHiddenWheel(null)).toBe(true)
    expect(storedHiddenWheel(false)).toBe(false)
    expect(storedHiddenWheel(true)).toBe(true)
  })

  it('keeps the wheel options of a Glücksrad Event', () => {
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

    it('accepts a custom table, equal places included, while the first place earns more than the last (#175)', () => {
      expect(errorOf(payload({ teamCount: 3, pointsTable: { preset: 'custom', values: [5, 3, 1] } }))).toBeNull()
      expect(errorOf(payload({ teamCount: 4, pointsTable: { preset: 'custom', values: [5, 5, 5, 4] } }))).toBeNull()
    })

    it('refuses a custom table in which every place earns the same, with points_flat (#175)', () => {
      expect(errorOf(payload({ teamCount: 3, pointsTable: { preset: 'custom', values: [3, 3, 3] } }))).toBe('points_flat')
      expect(errorOf(payload({ pointsTable: { preset: 'custom', values: [0, 0] } }))).toBe('points_flat')
    })

    it('names a rising place before a flat table, as the rule that comes first (#175)', () => {
      expect(errorOf(payload({ teamCount: 3, pointsTable: { preset: 'custom', values: [1, 1, 2] } }))).toBe('points_rising')
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

    it('Glücksrad defaults the veto allowance to max(3, Team size) and the wheel to visible', () => {
      const result = parseSettings(payload({ selectionMode: 'lucky_wheel', teamSize: 5 }))
      expect(result).toMatchObject({ ok: true, settings: { selectionMode: 'lucky_wheel', hiddenWheel: false, vetoAllowance: 5 } })
      expect(parseSettings(payload({ selectionMode: 'lucky_wheel', teamSize: 2 }))).toMatchObject({ ok: true, settings: { vetoAllowance: 3 } })
    })

    it('Glücksrad takes a hidden wheel and a veto allowance from 0 to 9', () => {
      expect(parseSettings(payload({ selectionMode: 'lucky_wheel', hiddenWheel: true, vetoAllowance: 0 })))
        .toMatchObject({ ok: true, settings: { hiddenWheel: true, vetoAllowance: 0 } })
      expect(errorOf(payload({ selectionMode: 'lucky_wheel', vetoAllowance: 9 }))).toBeNull()
      expect(errorOf(payload({ selectionMode: 'lucky_wheel', vetoAllowance: 10 }))).toBe('veto_allowance_range')
      expect(errorOf(payload({ selectionMode: 'lucky_wheel', vetoAllowance: -1 }))).toBe('veto_allowance_range')
      expect(errorOf(payload({ selectionMode: 'lucky_wheel', vetoAllowance: 2.5 }))).toBe('invalid_settings')
      expect(errorOf(payload({ selectionMode: 'lucky_wheel', hiddenWheel: 'yes' }))).toBe('invalid_settings')
    })

    it('Host pick has no wheel options', () => {
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

describe('Phases of the settings (#147)', () => {
  it('locks the settings once the first Session has started', () => {
    expect((['draft', 'poll', 'date_set', 'running', 'finished', 'archived'] as Phase[]).map(settingsLocked))
      .toEqual([false, false, false, true, true, true])
  })

  it('lets the Host change settings in every Phase before the Event is finished', () => {
    expect((['draft', 'poll', 'date_set', 'running', 'finished', 'archived'] as Phase[]).map(settingsEditable))
      .toEqual([true, true, true, true, false, false])
  })
})

describe('mergeSettings', () => {
  const wheelSettings = { ...defaultSettings(), selectionMode: 'lucky_wheel' as const, hiddenWheel: true, vetoAllowance: 4 }

  it('puts the change over the current settings', () => {
    expect(mergeSettings(defaultSettings(), { gameCount: 5, teamSize: 2 })).toMatchObject({ teamCount: 2, teamSize: 2, gameCount: 5 })
  })

  it('drops the wheel values that are left over when the change switches to Host pick', () => {
    const merged = mergeSettings(wheelSettings, { selectionMode: 'admin_pick' })

    expect(merged).toEqual({ ...defaultSettings(), hiddenWheel: undefined, vetoAllowance: undefined, selectionMode: 'admin_pick' })
    expect('hiddenWheel' in merged).toBe(false)
    expect('vetoAllowance' in merged).toBe(false)
  })

  it('keeps wheel values the change itself sends, so parseSettings can refuse them with Host pick', () => {
    const merged = mergeSettings(wheelSettings, { selectionMode: 'admin_pick', hiddenWheel: true })

    expect(merged.hiddenWheel).toBe(true)
    expect('vetoAllowance' in merged).toBe(false)
  })

  it('keeps the wheel values while the Lucky Wheel stays', () => {
    expect(mergeSettings(wheelSettings, { gameCount: 5 })).toMatchObject({ hiddenWheel: true, vetoAllowance: 4 })
  })
})

describe('teamSizeFloor (#197)', () => {
  it('is the fullest of the teams that remain', () => {
    expect(teamSizeFloor([1, 3, 2], 3)).toBe(3)
  })

  it('leaves out the teams a lower team count removes', () => {
    expect(teamSizeFloor([1, 3, 2], 2)).toBe(3)
    expect(teamSizeFloor([1, 3, 2], 1)).toBe(TEAM_SIZE_MIN)
  })

  it('never goes below TEAM_SIZE_MIN', () => {
    expect(teamSizeFloor([], 2)).toBe(TEAM_SIZE_MIN)
  })

  it('counts every team when the count is larger than the list', () => {
    expect(teamSizeFloor([1, 3, 2], 8)).toBe(3)
  })
})

describe('checkSettingsChange', () => {
  const floors = { teamSize: 1, vetoAllowance: 0 }
  const wheel = parseSettings(payload({ selectionMode: 'lucky_wheel', hiddenWheel: false, vetoAllowance: 3 }))
  const current = wheel.ok ? wheel.settings : defaultSettings()
  const admin = defaultSettings()

  function check(change: unknown, context: { phase?: Phase, floors?: { teamSize: number, vetoAllowance: number } } = {}, from = current) {
    return checkSettingsChange(from, change, { phase: context.phase ?? 'poll', floors: () => context.floors ?? floors })
  }

  const lockedChanges: Record<string, unknown> = {
    format: { format: 'ffa' },
    teamCount: { teamCount: 3, pointsTable: { preset: 'linear', values: [2, 1, 0] } },
    pointsTable: { pointsTable: { preset: 'winner_takes_all', values: [1, 0] } },
    selectionMode: { selectionMode: 'admin_pick' },
  }

  it('names the locked settings', () => {
    expect([...LOCKED_WHEN_RUNNING]).toEqual(['format', 'teamCount', 'pointsTable', 'selectionMode'])
  })

  it.each(Object.keys(lockedChanges))('accepts a new %s before the first Session and refuses it while running', (key) => {
    const change = lockedChanges[key]
    // ffa is a known Format 1.3 can't run: before the lock it fails on that rule, while running the lock comes first.
    const before = check(change, { phase: 'date_set' })
    if (key === 'format') expect(before).toEqual({ ok: false, error: 'format_unavailable' })
    else expect(before.ok).toBe(true)
    expect(check(change, { phase: 'running' })).toEqual({ ok: false, error: 'setting_locked' })
  })

  it('accepts locked settings that keep their value while running, even a points table of the same values', () => {
    const result = check({ ...current, pointsTable: { preset: 'linear', values: [1, 0] }, gameCount: 12 }, { phase: 'running' })
    expect(result).toEqual({ ok: true, settings: { ...current, gameCount: 12 } })
  })

  it('compares a points table by its preset and places, not by key order', () => {
    expect(check({ pointsTable: { values: [1, 0], preset: 'linear' } }, { phase: 'running' }).ok).toBe(true)
  })

  it('lets Game count, Team size, Veto allowance and Hidden wheel change while running', () => {
    const result = check({ gameCount: 5, teamSize: 4, vetoAllowance: 5, hiddenWheel: true }, { phase: 'running' })
    expect(result).toEqual({ ok: true, settings: { ...current, gameCount: 5, teamSize: 4, vetoAllowance: 5, hiddenWheel: true } })
  })

  it.each(['finished', 'archived'] as Phase[])('refuses everything in the %s Phase', (phase) => {
    expect(check({ gameCount: 5 }, { phase })).toEqual({ ok: false, error: 'wrong_phase' })
  })

  it('merges a partial change over the current settings', () => {
    expect(check({ gameCount: 7 })).toEqual({ ok: true, settings: { ...current, gameCount: 7 } })
  })

  it('validates the merged settings with the usual rules', () => {
    expect(check({ gameCount: 99 })).toEqual({ ok: false, error: 'game_count_range' })
    expect(check({ teamSize: 7 })).toEqual({ ok: false, error: 'team_size_range' })
  })

  it('drops the wheel options when the merged mode is Host pick', () => {
    const result = check({ gameCount: 8 }, {}, admin)
    expect(result).toEqual({ ok: true, settings: { ...admin, gameCount: 8 } })
  })

  it('drops the wheel options left over from the Glücksrad when switching to Host pick', () => {
    expect(check({ selectionMode: 'admin_pick' })).toEqual({
      ok: true,
      settings: { ...current, selectionMode: 'admin_pick', hiddenWheel: false, vetoAllowance: null },
    })
  })

  it('refuses wheel options that the change itself sends to a Host pick Event, as the create does', () => {
    expect(check({ hiddenWheel: true }, {}, admin)).toEqual({ ok: false, error: 'wheel_options_without_wheel' })
    expect(check({ vetoAllowance: 3 }, {}, admin)).toEqual({ ok: false, error: 'wheel_options_without_wheel' })
    expect(check({ selectionMode: 'admin_pick', hiddenWheel: true, vetoAllowance: 3 })).toEqual({ ok: false, error: 'wheel_options_without_wheel' })
    // Neutral values are no wheel options.
    expect(check({ hiddenWheel: false, vetoAllowance: null }, {}, admin).ok).toBe(true)
  })

  it('switches to the Glücksrad with its options before the first Session', () => {
    const result = check({ selectionMode: 'lucky_wheel', hiddenWheel: true, vetoAllowance: 2 }, {}, admin)
    expect(result).toEqual({ ok: true, settings: { ...admin, selectionMode: 'lucky_wheel', hiddenWheel: true, vetoAllowance: 2 } })
  })

  describe('floors', () => {
    it('refuses a Team size below the fullest team and accepts the same size', () => {
      expect(check({ teamSize: 3 }, { floors: { teamSize: 4, vetoAllowance: 0 } })).toEqual({ ok: false, error: 'team_size_below_fullest' })
      expect(check({ teamSize: 4 }, { floors: { teamSize: 4, vetoAllowance: 0 } }).ok).toBe(true)
    })

    it('refuses a Veto allowance below the most Vetoes a Party has spent and accepts the same number', () => {
      expect(check({ vetoAllowance: 1 }, { floors: { teamSize: 1, vetoAllowance: 2 } })).toEqual({ ok: false, error: 'veto_allowance_below_spent' })
      expect(check({ vetoAllowance: 2 }, { floors: { teamSize: 1, vetoAllowance: 2 } }).ok).toBe(true)
    })

    it('has no Veto floor without the Glücksrad', () => {
      expect(check({ gameCount: 8 }, { floors: { teamSize: 1, vetoAllowance: 2 } }, admin).ok).toBe(true)
    })

    it('measures the Team size against the team count the change parses to (#197)', () => {
      const fourTeams = withTeams(defaultSettings(), 4, 3)
      const floorsByCount = (count: number) => ({ teamSize: count >= 3 ? 3 : 1, vetoAllowance: 0 })
      const lowered = { teamCount: 2, teamSize: 1, pointsTable: { preset: 'linear', values: [1, 0] } }
      expect(checkSettingsChange(fourTeams, lowered, { phase: 'poll', floors: floorsByCount }).ok).toBe(true)
      expect(checkSettingsChange(fourTeams, { teamSize: 1 }, { phase: 'poll', floors: floorsByCount }))
        .toEqual({ ok: false, error: 'team_size_below_fullest' })
    })
  })

  describe('an Event that is not set up', () => {
    it('refuses a partial change', () => {
      expect(check({ gameCount: 5 }, {}, null as never)).toEqual({ ok: false, error: 'invalid_settings' })
    })

    it('accepts a full payload', () => {
      const result = checkSettingsChange(null, payload(), { phase: 'poll', floors: () => floors })
      expect(result).toEqual({ ok: true, settings: defaultSettings() })
    })

    it('checks the floors of a full payload too', () => {
      expect(checkSettingsChange(null, payload({ teamSize: 2 }), { phase: 'poll', floors: () => ({ teamSize: 3, vetoAllowance: 0 }) }))
        .toEqual({ ok: false, error: 'team_size_below_fullest' })
    })

    it('can be set up while running, as nothing is locked yet', () => {
      expect(checkSettingsChange(null, payload(), { phase: 'running', floors: () => floors }).ok).toBe(true)
    })
  })
})

describe('changedKeys (#183)', () => {
  const before = defaultSettings()

  it('names nothing when nothing changed', () => {
    expect(changedKeys(before, { ...before })).toEqual([])
  })

  it('names the settings whose value differs', () => {
    expect(changedKeys(before, { ...before, gameCount: before.gameCount + 1, teamSize: before.teamSize + 1 }).sort()).toEqual(['gameCount', 'teamSize'])
  })

  it('counts a points table as the same with the same preset and places', () => {
    const same = { ...before, pointsTable: { values: [...before.pointsTable.values], preset: before.pointsTable.preset } }
    expect(changedKeys(before, same)).toEqual([])
    expect(changedKeys(before, { ...before, pointsTable: { preset: 'custom', values: before.pointsTable.values } })).toEqual(['pointsTable'])
  })

  it('names every setting for an Event that was not set up', () => {
    expect(changedKeys(null, before).sort()).toEqual(Object.keys(before).sort())
  })
})
