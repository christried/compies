import { describe, expect, it } from 'vitest'
import { archiveChip, filterArchive, type ArchiveChip, type ArchiveEntry } from '../../shared/archive'

// The Archive's chips and search (#885): pure, over the list the page already holds.

function entry(overrides: Partial<ArchiveEntry> = {}): ArchiveEntry {
  return {
    slug: 'a',
    name: 'Freitags-Zocken',
    finishedAt: '2026-10-25T21:00:00.000Z',
    format: { teamCount: 4, teamSize: 2 },
    gameCount: 7,
    memberCount: 9,
    isHost: false,
    seated: true,
    resultOpen: false,
    ...overrides,
  }
}

const win = entry({ slug: 'win', name: 'Sieg', resultOpen: true, rank: 1 })
const tie = entry({ slug: 'tie', name: 'Unentschieden', resultOpen: true, rank: 1, winners: [{ position: 1, name: null }, { position: 2, name: null }] })
const second = entry({ slug: 'second', name: 'Zweiter', resultOpen: true, rank: 2 })
const closed = entry({ slug: 'closed', name: 'Zu', resultOpen: false })
const stands = entry({ slug: 'stands', name: 'Tribüne', resultOpen: true, rank: null, seated: false })
const mixed = [win, tie, second, closed, stands]
const slugs = (list: ArchiveEntry[]) => list.map(item => item.slug)
const by = (chip: ArchiveChip, q = '') => ({ chip, q })

describe('filterArchive: the chips', () => {
  it('keeps everything on „Alle“, in the server\'s order', () => {
    expect(slugs(filterArchive(mixed, by('all')))).toEqual(['win', 'tie', 'second', 'closed', 'stands'])
  })

  it('keeps on „Gewonnen“ a win and an „Unentschieden“, and no rank 2, no closed entry, no Member on the Stands', () => {
    expect(slugs(filterArchive(mixed, by('won')))).toEqual(['win', 'tie'])
  })

  it('keeps on „Als Host“ the entries the viewer hosts', () => {
    const hosted = entry({ slug: 'mine', isHost: true })

    expect(slugs(filterArchive([win, hosted, closed], by('host')))).toEqual(['mine'])
  })

  it('reads „Als Host“ without a hosted entry as „Alle“, so a stale chip never empties the list', () => {
    expect(slugs(filterArchive(mixed, by('host')))).toEqual(['win', 'tie', 'second', 'closed', 'stands'])
  })
})

describe('archiveChip', () => {
  it('keeps „Als Host“ while the viewer hosts one, and turns it into „Alle“ otherwise', () => {
    expect(archiveChip('host', [entry({ isHost: true })])).toBe('host')
    expect(archiveChip('host', mixed)).toBe('all')
    expect(archiveChip('host', [])).toBe('all')
  })

  it('leaves „Alle“ and „Gewonnen“ alone', () => {
    expect(archiveChip('all', mixed)).toBe('all')
    expect(archiveChip('won', mixed)).toBe('won')
  })
})

describe('filterArchive: the search', () => {
  const list = [entry({ slug: 'halo', name: 'Halo-Abend' }), entry({ slug: 'kart', name: 'Kart-Turnier' }), entry({ slug: 'aerger', name: 'Ärger-Abend' })]

  it('finds a part of the name, whatever the case', () => {
    expect(slugs(filterArchive(list, by('all', 'halo')))).toEqual(['halo'])
    expect(slugs(filterArchive(list, by('all', 'HALO')))).toEqual(['halo'])
    expect(slugs(filterArchive(list, by('all', 'abend')))).toEqual(['halo', 'aerger'])
  })

  it('ignores spaces around the term', () => {
    expect(slugs(filterArchive(list, by('all', '  halo  ')))).toEqual(['halo'])
  })

  it('reads a term of spaces only, and an empty one, as no search', () => {
    expect(filterArchive(list, by('all', '   '))).toEqual(list)
    expect(filterArchive(list, by('all', ''))).toEqual(list)
  })

  it('finds an umlaut in either case', () => {
    expect(slugs(filterArchive(list, by('all', 'ÄRGER')))).toEqual(['aerger'])
    expect(slugs(filterArchive(list, by('all', 'ärger')))).toEqual(['aerger'])
  })

  it('takes % and _ as plain characters', () => {
    const odd = [entry({ slug: 'pct', name: '100% Spaß' }), entry({ slug: 'under', name: 'Test_Abend' }), entry({ slug: 'plain', name: 'Test Abend' })]

    expect(slugs(filterArchive(odd, by('all', '%')))).toEqual(['pct'])
    expect(slugs(filterArchive(odd, by('all', '_')))).toEqual(['under'])
    expect(slugs(filterArchive(odd, by('all', 'Test_')))).toEqual(['under'])
  })

  it('works together with a chip and keeps the order', () => {
    const wins = [entry({ slug: 'one', name: 'Kart A', resultOpen: true, rank: 1 }), entry({ slug: 'two', name: 'Kart B', resultOpen: true, rank: 2 }), entry({ slug: 'three', name: 'Kart C', resultOpen: true, rank: 1 })]

    expect(slugs(filterArchive(wins, by('won', 'kart')))).toEqual(['one', 'three'])
    expect(filterArchive(wins, by('won', 'zzz'))).toEqual([])
  })
})
