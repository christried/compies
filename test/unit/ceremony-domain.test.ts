import { describe, expect, it } from 'vitest'
import { ceremonyShownOf, ceremonyViewOf, type CeremonyRow } from '../../server/domain/ceremony'
import { ceremonyEndsAt } from '../../shared/ceremony'

// The pure reads of an Event's Award ceremony (#445, #315), at their home in server/domain/ since #984: what the Event read and the Archive derive from the row.

const startsAt = new Date('2026-11-22T12:00:00.000Z')
const row: CeremonyRow = {
  format: 'teams',
  teamCount: 4,
  teamSize: 2,
  gameCount: 10,
  pointsTable: { preset: 'linear', values: [3, 2, 1, 0] },
  selectionMode: 'admin_pick',
  hiddenWheel: false,
  vetoAllowance: null,
  poolPreview: null,
  ceremonyStartsAt: startsAt,
  ceremonyGag: 'trip',
}

describe('ceremonyViewOf', () => {
  it('sends the start, the gag and the end of the run for the Winner count as ISO instants', () => {
    const view = ceremonyViewOf(row, 2)

    expect(view?.startsAt).toBe('2026-11-22T12:00:00.000Z')
    expect(view?.gag).toBe('trip')
    expect(view?.endsAt).toBe(new Date(ceremonyEndsAt(startsAt, { partyCount: 4, winners: 2, gag: 'trip' })).toISOString())
  })

  it('is null before the first start and for an Event without settings', () => {
    expect(ceremonyViewOf({ ...row, ceremonyStartsAt: null, ceremonyGag: null }, 1)).toBeNull()
    expect(ceremonyViewOf({ ...row, teamCount: null, pointsTable: null, gameCount: null }, 1)).toBeNull()
  })
})

describe('ceremonyShownOf', () => {
  it('counts the stored flag, and a stored start of the previous deployment', () => {
    expect(ceremonyShownOf({ ceremonyShown: true, ceremonyStartsAt: null })).toBe(true)
    expect(ceremonyShownOf({ ceremonyShown: false, ceremonyStartsAt: startsAt })).toBe(true)
    expect(ceremonyShownOf({ ceremonyShown: false, ceremonyStartsAt: null })).toBe(false)
  })
})
