import { describe, expect, it } from 'vitest'
import { archiveEntry, arrangeArchive } from '../../server/domain/archive'

// The Archive rules (#882): one entry from a row and the counts, and the order of the list. Pure, no clock.

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
    expect(archiveEntry({ row, ...counts, viewerId: 'viewer-id' })).toEqual({
      slug: 'freitags-zocken',
      name: 'Freitags-Zocken',
      finishedAt: '2026-10-25T21:00:00.000Z',
      format: { teamCount: 4, teamSize: 2 },
      gameCount: 7,
      memberCount: 9,
      isHost: false,
      seated: true,
    })
  })

  it('is the Host when the viewer hosts the Event', () => {
    expect(archiveEntry({ row, ...counts, viewerId: 'host-id' }).isHost).toBe(true)
    expect(archiveEntry({ row, ...counts, viewerId: 'other' }).isHost).toBe(false)
  })

  it('is seated with a team position and on the Stands without one', () => {
    expect(archiveEntry({ row: { ...row, team: 1 }, ...counts, viewerId: 'v' }).seated).toBe(true)
    expect(archiveEntry({ row: { ...row, team: null }, ...counts, viewerId: 'v' }).seated).toBe(false)
  })

  it('has no format when either settings column is null', () => {
    expect(archiveEntry({ row: { ...row, teamCount: null }, ...counts, viewerId: 'v' }).format).toBeNull()
    expect(archiveEntry({ row: { ...row, teamSize: null }, ...counts, viewerId: 'v' }).format).toBeNull()
    expect(archiveEntry({ row: { ...row, teamCount: null, teamSize: null }, ...counts, viewerId: 'v' }).format).toBeNull()
  })

  it('has finishedAt null for a hand-edited row', () => {
    expect(archiveEntry({ row: { ...row, finishedAt: null }, ...counts, viewerId: 'v' }).finishedAt).toBeNull()
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
