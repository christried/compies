import { describe, expect, it } from 'vitest'
import { archiveEntry, archiveResult, arrangeArchive, resultOpen, type ArchiveResultRow } from '../../server/domain/archive'
import { ceremonyEndsAt } from '../../shared/ceremony'

// The Archive rules (#882, #883): one entry from a row and the counts, the result a card may show and when, and the order of the list. Pure, the clock is passed in.

const at = (iso: string) => new Date(iso)

describe('archiveEntry', () => {
  const row = {
    slug: 'freitags-zocken',
    name: 'Freitags-Zocken',
    finishedAt: at('2026-10-25T21:00:00Z'),
    hostId: 'host-id',
    teamCount: 4 as number | null,
    teamSize: 2 as number | null,
    team: 3 as number | null,
  }
  const counts = { gameCount: 7, memberCount: 9 }

  it('builds the entry with the times as UTC ISO strings and the counts as given', () => {
    const entry = archiveEntry({ row, ...counts, viewerId: 'viewer-id', result: null })

    expect(entry).toEqual({
      slug: 'freitags-zocken',
      name: 'Freitags-Zocken',
      finishedAt: '2026-10-25T21:00:00.000Z',
      format: { teamCount: 4, teamSize: 2 },
      gameCount: 7,
      memberCount: 9,
      isHost: false,
      seated: true,
      resultOpen: false,
    })
    // A closed entry has neither key at all (not set to undefined): nothing derived from the result is there.
    expect('winners' in entry).toBe(false)
    expect('rank' in entry).toBe(false)
  })

  it('carries the Winners and the rank of an open result, and resultOpen true', () => {
    const entry = archiveEntry({ row, ...counts, viewerId: 'v', result: { winners: [{ position: 2, name: 'Hasen' }, { position: 4, name: null }], rank: 1 } })

    expect(entry).toMatchObject({ resultOpen: true, winners: [{ position: 2, name: 'Hasen' }, { position: 4, name: null }], rank: 1 })
  })

  it('carries an empty list and no rank for an open result with nothing to show', () => {
    const entry = archiveEntry({ row, ...counts, viewerId: 'v', result: { winners: [], rank: null } })

    expect(entry).toMatchObject({ resultOpen: true, winners: [], rank: null })
  })

  it('is the Host when the viewer hosts the Event', () => {
    expect(archiveEntry({ row, ...counts, viewerId: 'host-id', result: null }).isHost).toBe(true)
    expect(archiveEntry({ row, ...counts, viewerId: 'other', result: null }).isHost).toBe(false)
  })

  it('is seated with a team position and on the Stands without one', () => {
    expect(archiveEntry({ row: { ...row, team: 1 }, ...counts, viewerId: 'v', result: null }).seated).toBe(true)
    expect(archiveEntry({ row: { ...row, team: null }, ...counts, viewerId: 'v', result: null }).seated).toBe(false)
  })

  it('has no format when either settings column is null', () => {
    expect(archiveEntry({ row: { ...row, teamCount: null }, ...counts, viewerId: 'v', result: null }).format).toBeNull()
    expect(archiveEntry({ row: { ...row, teamSize: null }, ...counts, viewerId: 'v', result: null }).format).toBeNull()
    expect(archiveEntry({ row: { ...row, teamCount: null, teamSize: null }, ...counts, viewerId: 'v', result: null }).format).toBeNull()
  })

  it('has finishedAt null for a hand-edited row', () => {
    expect(archiveEntry({ row: { ...row, finishedAt: null }, ...counts, viewerId: 'v', result: null }).finishedAt).toBeNull()
  })
})

describe('resultOpen', () => {
  const endsAt = at('2026-11-22T12:00:05.000Z')
  const ms = endsAt.getTime()

  it('is closed one millisecond before the end of the run and open exactly at it and after', () => {
    expect(resultOpen({ shown: true, endsAt, now: new Date(ms - 1) })).toBe(false)
    expect(resultOpen({ shown: true, endsAt, now: new Date(ms) })).toBe(true)
    expect(resultOpen({ shown: true, endsAt, now: new Date(ms + 1) })).toBe(true)
  })

  it('is closed during the lead, before the run has begun', () => {
    expect(resultOpen({ shown: true, endsAt, now: new Date(ms - 5000) })).toBe(false)
  })

  it('is closed whatever the instant while the ceremony has never been started', () => {
    expect(resultOpen({ shown: false, endsAt, now: new Date(ms + 1) })).toBe(false)
    expect(resultOpen({ shown: false, endsAt: null, now: new Date(ms + 1) })).toBe(false)
  })

  it('is open when the ceremony is shown and no run is known (only the stored flag, or no settings)', () => {
    expect(resultOpen({ shown: true, endsAt: null, now: new Date(0) })).toBe(true)
  })

  it('takes the end as an ISO string like the Event read gives it', () => {
    expect(resultOpen({ shown: true, endsAt: endsAt.toISOString(), now: new Date(ms - 1) })).toBe(false)
    expect(resultOpen({ shown: true, endsAt: endsAt.toISOString(), now: new Date(ms) })).toBe(true)
  })
})

describe('archiveResult', () => {
  const startsAt = at('2026-11-22T12:00:00.000Z')
  // 4 Parties, linear points 3 2 1 0; a viewer on team 3.
  const row: ArchiveResultRow = {
    team: 3,
    format: 'teams',
    teamCount: 4,
    teamSize: 2,
    gameCount: 10,
    pointsTable: { preset: 'linear', values: [3, 2, 1, 0] },
    selectionMode: 'admin_pick',
    hiddenWheel: false,
    vetoAllowance: null,
    poolPreview: null,
    ceremonyShown: true,
    ceremonyStartsAt: startsAt,
    ceremonyGag: 'trip',
  }
  // Teams 1 and 2 share Place 1, 3 and 4 share Place 3: 3 3 1 1, ranks 1 1 3 3.
  const groups = [[{ team: 1, place: 1 }, { team: 2, place: 1 }, { team: 3, place: 3 }, { team: 4, place: 3 }]]
  const members = [
    { team: 1, teamWord: 'Eins', teamJoinedAt: at('2026-10-20T18:00:00Z') },
    { team: 2, teamWord: null, teamJoinedAt: at('2026-10-20T18:00:00Z') },
    { team: 3, teamWord: 'Drei', teamJoinedAt: at('2026-10-20T18:00:00Z') },
  ]
  const input = { row, groups, members, stored: [] }
  // The end of the run for 2 Winners among 4 Parties, from the ceremony's own function.
  const endsAt = ceremonyEndsAt(startsAt, { partyCount: 4, winners: 2, gag: 'trip' })

  it('is closed one millisecond before the end of the run, derived from the Winner count, and open at it', () => {
    expect(archiveResult({ ...input, now: new Date(endsAt - 1) })).toBeNull()
    expect(archiveResult({ ...input, now: new Date(endsAt) })).not.toBeNull()
  })

  it('is closed before the ceremony was ever started, whatever the instant', () => {
    expect(archiveResult({ ...input, row: { ...row, ceremonyShown: false, ceremonyStartsAt: null, ceremonyGag: null }, now: new Date(endsAt + 1e9) })).toBeNull()
  })

  it('names the Parties on rank 1 in the order of the teams with their Team names, and the viewer\'s shared rank', () => {
    expect(archiveResult({ ...input, now: new Date(endsAt) })).toEqual({
      winners: [{ position: 1, name: 'Eins' }, { position: 2, name: null }],
      rank: 3,
    })
  })

  it('gives no rank to a viewer on the Stands', () => {
    expect(archiveResult({ ...input, row: { ...row, team: null }, now: new Date(endsAt) })?.rank).toBeNull()
  })

  it('takes a stored name only for a team that has a row', () => {
    const result = archiveResult({ ...input, stored: [{ position: 1, frozenName: 'Alt' }, { position: 2, frozenName: null }], now: new Date(endsAt) })

    expect(result?.winners).toEqual([{ position: 1, name: 'Alt' }, { position: 2, name: null }])
  })

  it('is open with nothing to show when no Round has a Result: every Party would lead at 0 points', () => {
    // The run's end still follows the Winner count of the Standings (all 4 Parties), as the Event read's ceremony does.
    const allLead = ceremonyEndsAt(startsAt, { partyCount: 4, winners: 4, gag: 'trip' })

    expect(archiveResult({ ...input, groups: [], now: new Date(allLead - 1) })).toBeNull()
    expect(archiveResult({ ...input, groups: [], now: new Date(allLead) })).toEqual({ winners: [], rank: null })
  })

  it('is open with nothing to show when the Event has no settings', () => {
    const none = { ...row, teamCount: null, pointsTable: null, gameCount: null }

    expect(archiveResult({ ...input, row: none, now: new Date(startsAt.getTime() + 1) })).toEqual({ winners: [], rank: null })
  })

  it('is open as soon as only the stored flag exists, with the Winners', () => {
    const flagOnly = { ...row, ceremonyStartsAt: null, ceremonyGag: null }

    expect(archiveResult({ ...input, row: flagOnly, now: new Date(0) })).toMatchObject({ winners: [{ position: 1, name: 'Eins' }, { position: 2, name: null }] })
  })
})

describe('arrangeArchive', () => {
  const item = (name: string, finishedAt: string | null, createdAt = '2026-01-01T00:00:00Z') => ({
    name,
    finishedAt: finishedAt === null ? null : at(finishedAt),
    createdAt: at(createdAt),
  })
  const names = (items: readonly { name: string }[]) => items.map(entry => entry.name)

  it('puts the newest finishedAt first', () => {
    const arranged = arrangeArchive([item('old', '2026-09-01T00:00:00Z'), item('new', '2026-11-01T00:00:00Z'), item('mid', '2026-10-01T00:00:00Z')])

    expect(names(arranged)).toEqual(['new', 'mid', 'old'])
  })

  it('puts items without a finishedAt last, whatever their createdAt', () => {
    const arranged = arrangeArchive([item('none', null, '2027-01-01T00:00:00Z'), item('dated', '2020-01-01T00:00:00Z')])

    expect(names(arranged)).toEqual(['dated', 'none'])
  })

  it('orders several items without a finishedAt by createdAt, newest first', () => {
    const arranged = arrangeArchive([item('a', null, '2026-01-01T00:00:00Z'), item('b', null, '2026-03-01T00:00:00Z')])

    expect(names(arranged)).toEqual(['b', 'a'])
  })

  it('breaks a tie of finishedAt by createdAt, newest first', () => {
    const same = '2026-10-25T21:00:00Z'
    const arranged = arrangeArchive([item('older', same, '2026-10-01T00:00:00Z'), item('newer', same, '2026-10-10T00:00:00Z')])

    expect(names(arranged)).toEqual(['newer', 'older'])
  })

  it('returns a new array and leaves the input as it was', () => {
    const input = [item('old', '2026-09-01T00:00:00Z'), item('new', '2026-11-01T00:00:00Z')]

    const arranged = arrangeArchive(input)

    expect(arranged).not.toBe(input)
    expect(names(input)).toEqual(['old', 'new'])
  })

  it('handles 0, 1 and 2 items', () => {
    expect(arrangeArchive([])).toEqual([])
    expect(names(arrangeArchive([item('only', '2026-09-01T00:00:00Z')]))).toEqual(['only'])
    expect(names(arrangeArchive([item('a', '2026-09-01T00:00:00Z'), item('b', '2026-09-02T00:00:00Z')]))).toEqual(['b', 'a'])
  })
})
