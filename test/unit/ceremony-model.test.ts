import { describe, expect, it } from 'vitest'
import de from '~~/i18n/locales/de.json'
import { ceremonyModel } from '../../app/utils/ceremony'
import type { Translate } from '../../app/utils/settings-summary'
import type { BoardTeam, MemberView } from '../../shared/event'
import type { CeremonyView } from '../../shared/stage'
import { TEAM_SIZE_MAX } from '../../shared/settings'
import { TEAM_WORD_MAX } from '../../shared/team-word'

// What the Award ceremony's end frame shows (#309, spec #308): the places from last to second, the Winners and their Players, and the
// sentence the live region reads. A pure model of the Event read, so a test reads what a viewer would see.

/** vue-i18n's `t` for the cases the model needs: named values and „einzahl | mehrzahl“. */
const t: Translate = (key, named = {}, plural) => {
  const message = key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], de)
  if (typeof message !== 'string') throw new Error(`No copy for ${key}`)
  const forms = message.split(' | ')
  const form = forms.length > 1 ? forms[plural === 1 ? 0 : 1]! : message
  return form.replace(/\{(\w+)\}/g, (_, name: string) => String(named[name] ?? (name === 'n' ? plural : '')))
}

const CEREMONY: CeremonyView = { startsAt: '2090-10-30T20:00:01.500Z', endsAt: '2090-10-30T20:00:06.550Z', gag: 'trip' }
const team = (position: number, name: string | null = null): BoardTeam => ({ position, name, frozen: true })
const player = (id: string, teamPosition: number, overrides: Partial<MemberView> = {}): MemberView => ({
  id, name: `Spieler ${id}`, image: `https://example.com/${id}.png`, isHost: false, zone: 'team', team: teamPosition, teamWord: null, ...overrides,
})
const people = (count: number, teamPosition: number, prefix = 'p'): MemberView[] => Array.from({ length: count }, (_, index) => player(`${prefix}${teamPosition}-${index + 1}`, teamPosition))

type Read = Parameters<typeof ceremonyModel>[0]
const read = (standings: { team: number, rank: number, points: number }[], members: MemberView[] = [], teams: BoardTeam[] = [], results = 3): Read => ({ standings, members, teams, ceremony: CEREMONY, event: { name: 'Freitags-Zocken' }, results: Array.from({ length: results }, () => ({}) as Read['results'][number]) })

describe('ceremonyModel', () => {
  it('has nothing without a ceremony, without Standings and without a first place', () => {
    expect(ceremonyModel({ ...read([{ team: 1, rank: 1, points: 3 }]), ceremony: null }, t)).toBeNull()
    expect(ceremonyModel({ ...read([]), standings: null }, t)).toBeNull()
    expect(ceremonyModel(read([]), t)).toBeNull()
    expect(ceremonyModel(read([{ team: 1, rank: 2, points: 3 }]), t)).toBeNull()
  })

  describe('the places', () => {
    it('has one row for 2 Parties, the loser, with its rank and points', () => {
      const model = ceremonyModel(read([{ team: 1, rank: 1, points: 9 }, { team: 2, rank: 2, points: 3 }], [], [team(1, 'Wilde Gurken'), team(2, 'Nacht Eulen')]), t)!

      expect(model.winners).toEqual([{ team: 1, name: 'Wilde Gurken' }])
      expect(model.points).toBe(9)
      expect(model.rows).toEqual([{ team: 2, name: 'Nacht Eulen', rank: 2, points: 3 }])
    })

    it('shares a rank between equal points: 2, 2, then 4', () => {
      const model = ceremonyModel(read([
        { team: 3, rank: 1, points: 9 },
        { team: 1, rank: 2, points: 5 },
        { team: 4, rank: 2, points: 5 },
        { team: 2, rank: 4, points: 1 },
      ]), t)!

      expect(model.rows.map(row => [row.team, row.rank])).toEqual([[1, 2], [4, 2], [2, 4]])
    })

    it('lists 7 rows for 8 Parties, in the order of the read, and names an unnamed Team by its colour', () => {
      const standings = Array.from({ length: 8 }, (_, index) => ({ team: index + 1, rank: index + 1, points: 8 - index }))

      const model = ceremonyModel(read(standings), t)!

      expect(model.rows).toHaveLength(7)
      expect(model.rows.map(row => row.team)).toEqual([2, 3, 4, 5, 6, 7, 8])
      expect(model.winners[0]!.name).toBe('Team Rot')
      expect(model.rows[0]!.name).toBe('Team Orange')
    })

    it('has no row when every Party ties for first', () => {
      const model = ceremonyModel(read([{ team: 1, rank: 1, points: 4 }, { team: 2, rank: 1, points: 4 }]), t)!

      expect(model.rows).toEqual([])
      expect(model.winners.map(winner => winner.team)).toEqual([1, 2])
    })

    it('passes the longest allowed Team name through unchanged', () => {
      // The longest Team name: a full team of Team words, each at its longest.
      const longest = Array.from({ length: TEAM_SIZE_MAX }, () => 'W'.repeat(TEAM_WORD_MAX)).join(' ')

      const model = ceremonyModel(read([{ team: 1, rank: 1, points: 3 }, { team: 2, rank: 2, points: 1 }], [], [team(1, longest), team(2, longest)]), t)!

      expect(model.winners[0]!.name).toBe(longest)
      expect(model.rows[0]!.name).toBe(longest)
      expect(model.live).toBe(`Gewonnen hat ${longest}, 3 Punkte.`)
    })
  })

  describe('the Winners\' people', () => {
    const standings = [{ team: 1, rank: 1, points: 9 }, { team: 2, rank: 2, points: 3 }]
    const peopleOf = (members: MemberView[]) => ceremonyModel(read(standings, members, [team(1, 'Wilde Gurken'), team(2)]), t)!.people

    it('shows the TeamMark of a Winner without Players', () => {
      expect(peopleOf([])).toEqual([{ kind: 'mark', team: 1, name: 'Wilde Gurken' }])
    })

    it('shows one Player with the name and the picture', () => {
      expect(peopleOf([player('a', 1)])).toEqual([{ kind: 'player', id: 'a', name: 'Spieler a', image: 'https://example.com/a.png', team: 1 }])
    })

    it('shows all 6 Players, and never a Player of another Party, the Bench or the Stands', () => {
      const members = [...people(6, 1), ...people(3, 2), player('bench', 1, { zone: 'bench', team: null }), player('stands', 1, { zone: 'stands', team: null })]

      const shown = peopleOf(members)

      expect(shown).toHaveLength(6)
      expect(shown.every(entry => entry.kind === 'player' && entry.team === 1)).toBe(true)
      expect(shown.map(entry => entry.kind === 'player' && entry.id)).not.toContain('bench')
    })

    it('shows 5 Players and „+2“ for 7', () => {
      const shown = peopleOf(people(7, 1))

      expect(shown).toHaveLength(6)
      expect(shown.slice(0, 5).every(entry => entry.kind === 'player')).toBe(true)
      expect(shown[5]).toEqual({ kind: 'more', n: 2 })
    })

    it('counts 12 Players as 5 and „+7“', () => {
      const shown = peopleOf(people(12, 1))

      expect(shown[5]).toEqual({ kind: 'more', n: 7 })
      expect(shown).toHaveLength(6)
    })
  })

  describe('a Tie', () => {
    const tie = [{ team: 1, rank: 1, points: 9 }, { team: 2, rank: 1, points: 9 }, { team: 3, rank: 3, points: 2 }]

    it('lists every Winner, ascending, with their shared points', () => {
      const model = ceremonyModel(read(tie, [], [team(1, 'Wilde Gurken'), team(2, 'Nacht Eulen')]), t)!

      expect(model.winners).toEqual([{ team: 1, name: 'Wilde Gurken' }, { team: 2, name: 'Nacht Eulen' }])
      expect(model.points).toBe(9)
      expect(model.rows.map(row => [row.team, row.rank])).toEqual([[3, 3]])
    })

    it('puts the people of every Winner in one list, a Winner without Players as its TeamMark', () => {
      const model = ceremonyModel(read(tie, [player('a', 1), player('b', 1)], [team(1, 'Wilde Gurken'), team(2, 'Nacht Eulen')]), t)!

      expect(model.people.map(entry => entry.kind === 'player' ? entry.id : entry.kind === 'mark' ? `mark-${entry.team}` : 'more')).toEqual(['a', 'b', 'mark-2'])
    })

    it('counts two 6-Player Winners as 5 and „+7“', () => {
      const model = ceremonyModel(read(tie, [...people(6, 1), ...people(6, 2)]), t)!

      expect(model.people).toHaveLength(6)
      expect(model.people[5]).toEqual({ kind: 'more', n: 7 })
    })
  })

  describe('the line under the banner (#312)', () => {
    const standings = [{ team: 1, rank: 1, points: 9 }, { team: 2, rank: 2, points: 3 }]

    it('names the Event and counts the games with a Result', () => {
      expect(ceremonyModel(read(standings, [], [], 6), t)!.sub).toBe('Freitags-Zocken · 6 Spiele')
    })

    it('says a single game as „1 Spiel“', () => {
      expect(ceremonyModel(read(standings, [], [], 1), t)!.sub).toBe('Freitags-Zocken · 1 Spiel')
    })
  })

  describe('the live text', () => {
    it('names the Winner and the points', () => {
      const model = ceremonyModel(read([{ team: 1, rank: 1, points: 9 }, { team: 2, rank: 2, points: 3 }], [], [team(1, 'Wilde Gurken')]), t)!

      expect(model.live).toBe('Gewonnen hat Wilde Gurken, 9 Punkte.')
    })

    it('says a single point as „1 Punkt“', () => {
      const model = ceremonyModel(read([{ team: 1, rank: 1, points: 1 }, { team: 2, rank: 2, points: 0 }], [], [team(1, 'Wilde Gurken')]), t)!

      expect(model.live).toBe('Gewonnen hat Wilde Gurken, 1 Punkt.')
    })

    it('names every Winner of a Tie', () => {
      const model = ceremonyModel(read([{ team: 1, rank: 1, points: 9 }, { team: 2, rank: 1, points: 9 }], [], [team(1, 'Wilde Gurken'), team(2, 'Nacht Eulen')]), t)!

      expect(model.live).toBe('Unentschieden: Wilde Gurken und Nacht Eulen, je 9 Punkte.')
    })
  })
})
