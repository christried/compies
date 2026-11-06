import { describe, expect, it } from 'vitest'
import de from '~~/i18n/locales/de.json'
import { ceremonyLayout, ceremonyModel } from '../../app/utils/ceremony'
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

      expect(model.winners).toMatchObject([{ team: 1, name: 'Wilde Gurken', points: 9 }])
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
    const peopleOf = (members: MemberView[]) => ceremonyModel(read(standings, members, [team(1, 'Wilde Gurken'), team(2)]), t)!.winners[0]!.people

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

  describe('a Tie (#315)', () => {
    const tie = [{ team: 1, rank: 1, points: 9 }, { team: 2, rank: 1, points: 9 }, { team: 3, rank: 3, points: 2 }]
    const teams = [team(1, 'Wilde Gurken'), team(2, 'Nacht Eulen')]

    it('lists every Winner, ascending, with their shared points', () => {
      const model = ceremonyModel(read(tie, [], teams), t)!

      expect(model.winners).toMatchObject([{ team: 1, name: 'Wilde Gurken', points: 9 }, { team: 2, name: 'Nacht Eulen', points: 9 }])
      expect(model.points).toBe(9)
      expect(model.rows.map(row => [row.team, row.rank])).toEqual([[3, 3]])
    })

    it('hangs the people on their own Winner, a Winner without Players as its TeamMark', () => {
      const model = ceremonyModel(read(tie, [player('a', 1), player('b', 1)], teams), t)!

      expect(model.winners[0]!.people.map(entry => entry.kind === 'player' && entry.id)).toEqual(['a', 'b'])
      expect(model.winners[1]!.people).toEqual([{ kind: 'mark', team: 2, name: 'Nacht Eulen' }])
    })

    it('caps every Winner at 6 cells of its own: 5 and „+2“ for 7 Players, all 6 for 6, nobody of another Party', () => {
      const model = ceremonyModel(read(tie, [...people(7, 1), ...people(6, 2), ...people(4, 3)]), t)!

      expect(model.winners[0]!.people).toHaveLength(6)
      expect(model.winners[0]!.people[5]).toEqual({ kind: 'more', n: 2 })
      expect(model.winners[1]!.people).toHaveLength(6)
      expect(model.winners[1]!.people.every(entry => entry.kind === 'player' && entry.team === 2)).toBe(true)
    })

    it('shares ranks below the Winners: 3, 3, then 5', () => {
      const model = ceremonyModel(read([
        { team: 1, rank: 1, points: 9 },
        { team: 2, rank: 1, points: 9 },
        { team: 3, rank: 3, points: 4 },
        { team: 4, rank: 3, points: 4 },
        { team: 5, rank: 5, points: 1 },
      ]), t)!

      expect(model.rows.map(row => [row.team, row.rank])).toEqual([[3, 3], [4, 3], [5, 5]])
    })

    it('keeps Winners that are not adjacent teams in ascending order', () => {
      const model = ceremonyModel(read([{ team: 8, rank: 1, points: 5 }, { team: 2, rank: 4, points: 1 }, { team: 1, rank: 1, points: 5 }, { team: 3, rank: 1, points: 5 }]), t)!

      expect(model.winners.map(winner => winner.team)).toEqual([1, 3, 8])
    })

    describe('the line under the banner', () => {
      it('counts the Winners and names the shared points when somebody finished below', () => {
        expect(ceremonyModel(read(tie, [], teams, 6), t)!.sub).toBe('Freitags-Zocken · 6 Spiele · 2 Sieger, je 9 Punkte')
      })

      it('says „Beide gleichauf“ when both of 2 Parties won', () => {
        expect(ceremonyModel(read([{ team: 1, rank: 1, points: 9 }, { team: 2, rank: 1, points: 9 }], [], teams, 6), t)!.sub).toBe('Freitags-Zocken · 6 Spiele · Beide gleichauf, je 9 Punkte')
      })

      it('says „Alle 5 gleichauf“ when all of 5 Parties won', () => {
        const standings = Array.from({ length: 5 }, (_, index) => ({ team: index + 1, rank: 1, points: 4 }))

        expect(ceremonyModel(read(standings, [], [], 6), t)!.sub).toBe('Freitags-Zocken · 6 Spiele · Alle 5 gleichauf, je 4 Punkte')
      })

      it('says 1 Spiel and 1 Punkt in the singular', () => {
        expect(ceremonyModel(read([{ team: 1, rank: 1, points: 1 }, { team: 2, rank: 1, points: 1 }, { team: 3, rank: 3, points: 0 }], [], teams, 1), t)!.sub).toBe('Freitags-Zocken · 1 Spiel · 2 Sieger, je 1 Punkt')
      })
    })

    describe('the live text', () => {
      it('names the Winners when somebody finished below', () => {
        expect(ceremonyModel(read(tie, [], teams), t)!.live).toBe('Unentschieden! Gewonnen haben Wilde Gurken und Nacht Eulen mit je 9 Punkten.')
      })

      it('says „Beide Parteien“ for 2 of 2', () => {
        expect(ceremonyModel(read([{ team: 1, rank: 1, points: 9 }, { team: 2, rank: 1, points: 9 }], [], teams), t)!.live).toBe('Unentschieden! Beide Parteien gewinnen mit je 9 Punkten: Wilde Gurken und Nacht Eulen.')
      })

      it('says „Alle 5 Parteien“ for 5 of 5 and joins the names with commas and a last „und“', () => {
        const standings = Array.from({ length: 5 }, (_, index) => ({ team: index + 1, rank: 1, points: 4 }))

        expect(ceremonyModel(read(standings, [], [team(1, 'A'), team(2, 'B'), team(3, 'C'), team(4, 'D'), team(5, 'E')]), t)!.live).toBe('Unentschieden! Alle 5 Parteien gewinnen mit je 4 Punkten: A, B, C, D und E.')
      })

      it('says 1 Punkt in the singular', () => {
        expect(ceremonyModel(read([{ team: 1, rank: 1, points: 1 }, { team: 2, rank: 1, points: 1 }, { team: 3, rank: 3, points: 0 }], [], teams), t)!.live).toBe('Unentschieden! Gewonnen haben Wilde Gurken und Nacht Eulen mit je 1 Punkt.')
      })
    })
  })

  // 1 to 8 Winners on a wide screen and on a phone (12-siegerehrung-unentschieden.md § States); `below` is how many Parties finished under them.
  describe('the layout', () => {
    it.each([
      // winners, below, roomy, stage, rows, cols
      [1, 1, true, 'single', 'side', 1],
      [1, 1, false, 'single', 'side', 1],
      [2, 2, true, 'chain', 'side', 2],
      [2, 2, false, 'chain', 'below', 2],
      [2, 0, true, 'chain', 'none', 2],
      [2, 0, false, 'chain', 'none', 2],
      [3, 2, true, 'chain', 'chips', 3],
      [3, 2, false, 'grid', 'chips', 2],
      [3, 0, true, 'chain', 'none', 3],
      [4, 1, true, 'grid', 'chips', 4],
      [4, 1, false, 'grid', 'chips', 2],
      [5, 3, true, 'grid', 'chips', 4],
      [6, 0, false, 'grid', 'none', 2],
      [7, 1, true, 'grid', 'chips', 4],
      [8, 0, true, 'grid', 'none', 4],
      [8, 0, false, 'grid', 'none', 2],
    ] as const)('puts %i Winners with %i below, wide: %s, as %s, rows %s, %i columns', (winners, below, roomy, stage, rows, cols) => {
      expect(ceremonyLayout(winners, below, roomy)).toEqual({ stage, rows, cols })
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

  })
})
