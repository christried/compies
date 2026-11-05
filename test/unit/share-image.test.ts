import { describe, expect, it } from 'vitest'
import de from '~~/i18n/locales/de.json'
import { teamNameAt } from '../../app/utils/board'
import type { Translate } from '../../app/utils/settings-summary'
import type { BoardTeam, DatedSessionView, MemberView } from '../../shared/event'
import { GAME_NAME_MAX } from '../../shared/game'
import { standingsOf } from '../../shared/results'
import { fillCopy, parseShareFormat, pluralCopy, shareImageModel, SHARE_SIZE, type ShareFormat, type ShareImageSource } from '../../shared/share-image'
import type { ResultView } from '../../shared/stage'
import { TEAM_COLORS } from '../../shared/team-colors'

// What the Share image says (#313, spec #308 § The Share image model): a pure model of the Event read, so a test reads what the
// picture shows. The renderer only draws it; the pixels are judged by eye.

/** vue-i18n's `t` for the parity test: named values and „einzahl | mehrzahl“. */
const t: Translate = (key, named = {}, plural) => {
  const message = key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], de)
  if (typeof message !== 'string') throw new Error(`No copy for ${key}`)
  const forms = message.split(' | ')
  const form = forms.length > 1 ? forms[plural === 1 ? 0 : 1]! : message
  return form.replace(/\{(\w+)\}/g, (_, name: string) => String(named[name] ?? (name === 'n' ? plural : '')))
}

const copy = { share: de.share, team: de.team }

const session = (startsAt: string | null, startedAt: string | null = startsAt, number: number | null = 1): DatedSessionView => ({
  id: `s-${startsAt}`, number, startsAt: startsAt ?? '', previousStartsAt: null, notes: [], startedAt, endedAt: startedAt,
})
const player = (id: string, teamPosition: number): MemberView => ({
  id, name: `Spieler ${id}`, image: null, isHost: false, zone: 'team', team: teamPosition, teamWord: null,
})
const bench = (id: string): MemberView => ({ id, name: `Spieler ${id}`, image: null, isHost: false, zone: 'bench', team: null, teamWord: null })

const result = (number: number, name: string, firsts: number[], teamCount: number): ResultView => ({
  roundId: `r${number}`,
  number,
  game: { id: `g${number}`, name, imageUrl: null, youtubeId: null, clipStart: 0, clipLength: 10, playersMin: null, playersMax: null, suitabilities: [] },
  places: Array.from({ length: teamCount }, (_, index) => index + 1)
    .map(team => ({ team, place: firsts.includes(team) ? 1 : firsts.length + 1, points: 0, score: null })),
  corrected: false, correctedAt: null, resultAt: '2026-10-25T20:00:00Z',
})

interface Options {
  /** Points per Party, index 0 = team 1. */
  points?: number[]
  names?: Record<number, string | null>
  event?: string
  sessions?: DatedSessionView[]
  members?: MemberView[]
  /** The names and first places of the played games, in number order. */
  games?: { name: string, firsts: number[] }[]
}

function source({ points = [17, 9], names = {}, event = 'Freitags-Zocken', sessions = [session('2026-10-24T18:00:00Z')], members = [], games = [{ name: 'Rocket League', firsts: [1] }] }: Options = {}): ShareImageSource {
  const teams: BoardTeam[] = points.map((_, index) => ({ position: index + 1, name: names[index + 1] ?? null, frozen: true }))
  return {
    event: { slug: 'abc', name: event, phase: 'finished', isHost: false },
    sessions,
    standings: standingsOf(points),
    teams,
    members,
    results: games.map((game, index) => result(index + 1, game.name, game.firsts, points.length)),
  }
}

const wide = (options?: Options) => shareImageModel(source(options), 'wide', copy)!
const square = (options?: Options) => shareImageModel(source(options), 'square', copy)!

describe('parseShareFormat', () => {
  it('accepts wide and square', () => {
    expect(parseShareFormat('wide')).toBe('wide')
    expect(parseShareFormat('square')).toBe('square')
  })

  it.each([undefined, null, '', 'Wide', 'png', ['wide', 'square'], ['wide'], 1, {}])('refuses %j', (raw) => {
    expect(parseShareFormat(raw)).toBeNull()
  })
})

describe('SHARE_SIZE', () => {
  it('is 1200 x 630 and 1080 x 1080', () => {
    expect(SHARE_SIZE).toEqual({ wide: { width: 1200, height: 630 }, square: { width: 1080, height: 1080 } })
  })
})

describe('fillCopy and pluralCopy', () => {
  it('fills named values', () => {
    expect(fillCopy('{a} und {b}', { a: 'Rot', b: 3 })).toBe('Rot und 3')
  })

  it('leaves no placeholder for a value that is missing', () => {
    expect(fillCopy('{a}!', {})).toBe('!')
  })

  it('picks the singular for 1 and the plural for everything else', () => {
    expect(pluralCopy('{n} Spiel | {n} Spiele', 1)).toBe('{n} Spiel')
    expect(pluralCopy('{n} Spiel | {n} Spiele', 0)).toBe('{n} Spiele')
    expect(pluralCopy('{n} Spiel | {n} Spiele', 6)).toBe('{n} Spiele')
  })

  it('reads a text without a pipe as it is', () => {
    expect(pluralCopy('{n} Leute', 9)).toBe('{n} Leute')
  })
})

describe('shareImageModel', () => {
  it('has nothing without Standings or without a first place', () => {
    expect(shareImageModel({ ...source(), standings: null }, 'wide', copy)).toBeNull()
    expect(shareImageModel({ ...source(), standings: [] }, 'wide', copy)).toBeNull()
    expect(shareImageModel({ ...source(), standings: [{ team: 1, rank: 2, points: 3 }] }, 'wide', copy)).toBeNull()
  })

  it.each<[ShareFormat, number, number]>([['wide', 1200, 630], ['square', 1080, 1080]])('carries the size of %s', (format, width, height) => {
    const model = shareImageModel(source(), format, copy)!
    expect({ format: model.format, width: model.width, height: model.height }).toEqual({ format, width, height })
  })

  describe('the date', () => {
    it('reads one Session as its day', () => {
      expect(wide().date).toBe('Sa 24.10.2026')
    })

    it('reads two Sessions on one day as that day', () => {
      const sessions = [session('2026-10-24T10:00:00Z'), session('2026-10-24T18:00:00Z', '2026-10-24T18:00:00Z', 2)]
      expect(wide({ sessions }).date).toBe('Sa 24.10.2026')
    })

    it('reads first to last within a year, the year once', () => {
      const sessions = [session('2026-10-24T18:00:00Z'), session('2026-10-31T18:00:00Z', '2026-10-31T18:00:00Z', 2)]
      expect(wide({ sessions }).date).toBe('Sa 24.10. – Sa 31.10.2026')
    })

    it('reads a range across months', () => {
      const sessions = [session('2026-10-28T18:00:00Z'), session('2026-11-02T18:00:00Z', '2026-11-02T18:00:00Z', 2)]
      expect(wide({ sessions }).date).toBe('Mi 28.10. – Mo 02.11.2026')
    })

    it('puts the year on both days across a New Year', () => {
      const sessions = [session('2026-12-30T18:00:00Z'), session('2027-01-02T18:00:00Z', '2027-01-02T18:00:00Z', 2)]
      expect(wide({ sessions }).date).toBe('Mi 30.12.2026 – Sa 02.01.2027')
    })

    it('reads first to last for more than two Sessions, whatever the order', () => {
      const sessions = [
        session('2026-11-01T18:00:00Z', '2026-11-01T18:00:00Z', 3),
        session('2026-10-24T18:00:00Z'),
        session('2026-10-28T18:00:00Z', '2026-10-28T18:00:00Z', 2),
      ]
      expect(wide({ sessions }).date).toBe('Sa 24.10. – So 01.11.2026')
    })

    it('counts the day in Berlin: 23:30 UTC on the 24th in summer is the 25th', () => {
      expect(wide({ sessions: [session('2026-07-24T23:30:00Z')] }).date).toBe('Sa 25.07.2026')
    })

    it('leaves out a Session that never started', () => {
      const sessions = [session('2026-10-24T18:00:00Z'), session('2026-11-08T18:00:00Z', null, null)]
      expect(wide({ sessions }).date).toBe('Sa 24.10.2026')
    })

    it('has no date when no started Session has one', () => {
      const model = wide({ sessions: [] })
      expect(model.date).toBeNull()
      expect(model.pill.rest).not.toContain('2026')
    })
  })

  describe('the pill', () => {
    it('is the Event, then the day and the people', () => {
      const model = wide({ members: Array.from({ length: 9 }, (_, i) => player(`p${i}`, 1)) })
      expect(model.pill).toEqual({ event: 'Freitags-Zocken', rest: 'Sa 24.10.2026 · 9 Leute' })
    })

    it('drops the people when nobody played', () => {
      expect(wide().pill.rest).toBe('Sa 24.10.2026')
    })

    it('is empty after the Event name when nothing else is known', () => {
      expect(wide({ sessions: [] }).pill.rest).toBe('')
    })

    it('strips pictographs from the Event name and falls back to no name when nothing is left', () => {
      expect(wide({ event: 'Zocken 🎮 Abend' }).pill.event).toBe('Zocken Abend')
      expect(wide({ event: '🎮🔥' }).pill.event).toBe('')
    })
  })

  describe('the people', () => {
    it.each([[0, null], [1, '1 Person'], [2, '2 Leute'], [24, '24 Leute']])('counts %i Players as %j', (count, text) => {
      const model = wide({ members: Array.from({ length: count }, (_, i) => player(`p${i}`, 1 + (i % 2))) })
      expect(model.people).toBe(text)
    })

    it('counts only the Players, not the Bench or the Stands', () => {
      const model = wide({ members: [player('a', 1), player('b', 2), bench('c'), { ...bench('d'), zone: 'stands' }] })
      expect(model.people).toBe('2 Leute')
    })
  })

  describe('the Winner', () => {
    it('is the Party on rank 1 with its Team name, colour and points', () => {
      const { winner } = wide({ points: [9, 17], names: { 2: 'Nacht Eulen' } })
      expect(winner).toMatchObject({ teams: [2], name: 'Nacht Eulen', color: TEAM_COLORS[1]!.fill, lead: 'gewinnt mit', points: '17', tail: 'Punkten' })
    })

    it('uses the colour name for a team without a name', () => {
      expect(wide({ points: [17, 9] }).winner.name).toBe('Team Rot')
      expect(wide({ points: [9, 17] }).winner.name).toBe('Team Orange')
    })

    it('says „Punkt“ for one point', () => {
      expect(wide({ points: [1, 0] }).winner.tail).toBe('Punkt')
    })

    it('is a plain interim for several Winners: names joined, plural lead, the first colour (#315 builds the real Tie)', () => {
      const { winner } = wide({ points: [12, 12, 5], names: { 1: 'Wilde Gurken', 2: 'Nacht Eulen' } })
      expect(winner).toMatchObject({ teams: [1, 2], name: 'Wilde Gurken und Nacht Eulen', lead: 'gewinnen mit je', points: '12', color: TEAM_COLORS[0]!.fill })
    })

    it('strips pictographs and falls back to the colour name when nothing is left', () => {
      expect(wide({ names: { 1: 'Gurken 🥒🥒' } }).winner.name).toBe('Gurken')
      expect(wide({ names: { 1: '🥒' } }).winner.name).toBe('Team Rot')
    })

    it('strips ZWJ sequences, flags and skin tones as well', () => {
      expect(wide({ names: { 1: 'Fam 👨‍👩‍👧 🇩🇪 👍🏽 ❤️ Los' } }).winner.name).toBe('Fam Los')
    })

    it('keeps ß, ł and ğ', () => {
      expect(wide({ names: { 1: 'Straße Łódź Doğan' } }).winner.name).toBe('Straße Łódź Doğan')
    })
  })

  describe('the size step of the name', () => {
    const named = (length: number, format: ShareFormat) => shareImageModel(source({ names: { 1: 'x'.repeat(length) } }), format, copy)!.winner.size

    it.each([[1, 96], [14, 96], [15, 84], [34, 84], [35, 64]])('is %i characters wide: %i px', (length, size) => {
      expect(named(length, 'wide')).toBe(size)
    })

    it.each([[14, 128], [15, 112], [34, 112], [35, 88]])('is %i characters square: %i px', (length, size) => {
      expect(named(length, 'square')).toBe(size)
    })

    it('counts what the User sees, not UTF-16 units', () => {
      // 14 letters with a combining accent on each is still 14 characters.
      expect(shareImageModel(source({ names: { 1: 'é'.repeat(14) } }), 'wide', copy)!.winner.size).toBe(96)
    })
  })

  describe('the break of the name', () => {
    const lines = (name: string) => wide({ names: { 1: name } }).winner.lines

    it('keeps a name of 14 characters or fewer on one line, spaces or not', () => {
      expect(lines('Wilde Gurken')).toEqual(['Wilde Gurken'])
      expect(lines('Aaaa Bbbb Cccc')).toEqual(['Aaaa Bbbb Cccc'])
    })

    it('breaks a longer name at the space nearest the middle', () => {
      // 'Aaa Bbbbbbbb Cccc Dd' (20): spaces at 3, 12, 17; the middle is 10; 12 is nearest.
      expect(lines('Aaa Bbbbbbbb Cccc Dd')).toEqual(['Aaa Bbbbbbbb', 'Cccc Dd'])
    })

    it('breaks at the earlier of two equally near spaces', () => {
      // 16 characters, spaces at 7 and 9, the middle is 8: both are one away.
      expect(lines('Aaaaaaa B Cccccc')).toEqual(['Aaaaaaa', 'B Cccccc'])
    })

    it('does not break a single long word', () => {
      expect(lines('Donaudampfschifffahrt')).toEqual(['Donaudampfschifffahrt'])
    })

    it('measures in characters the User sees', () => {
      const name = `${'🥒'.repeat(1)}ab cdefghijklmnop`
      // the emoji is stripped first, so this is 'ab cdefghijklmnop' (17): break at the only space.
      expect(lines(name)).toEqual(['ab', 'cdefghijklmnop'])
    })

    it('breaks the joined name of a Tie', () => {
      const model = wide({ points: [12, 12], names: { 1: 'Wilde Gurken', 2: 'Nacht Eulen' } })
      expect(model.winner.lines).toEqual(['Wilde Gurken', 'und Nacht Eulen'])
    })

    it('handles the worst case of 77 characters', () => {
      const words = ['Aaaaaaaaaaaa', 'Bbbbbbbbbbbb', 'Cccccccccccc', 'Dddddddddddd', 'Eeeeeeeeeeee', 'Ffffffffffff']
      const model = wide({ names: { 1: words.join(' ') } })
      expect(model.winner.size).toBe(64)
      expect(model.winner.lines).toHaveLength(2)
      expect(model.winner.lines.join(' ')).toBe(words.join(' '))
    })
  })

  describe('the rows', () => {
    const rowsOf = (points: number[], format: ShareFormat = 'wide') => shareImageModel(source({ points }), format, copy)!

    it('has none for a single Party and none when all tie', () => {
      expect(rowsOf([5]).rows).toEqual([])
      expect(rowsOf([5, 5, 5]).rows).toEqual([])
      expect(rowsOf([5, 5, 5]).moreRows).toBeNull()
    })

    it('lists places 2 to 4 with name, points, colours and no more line for 2 Parties', () => {
      const model = rowsOf([17, 9])
      expect(model.rows).toEqual([{ rank: 2, team: 2, name: 'Team Orange', points: 9, fill: TEAM_COLORS[1]!.fill, ink: TEAM_COLORS[1]!.ink }])
      expect(model.moreRows).toBeNull()
    })

    it('keeps shared ranks: 17, 9, 9, 5 gives 2, 2, 4', () => {
      expect(rowsOf([17, 9, 9, 5]).rows.map(row => [row.rank, row.team])).toEqual([[2, 2], [2, 3], [4, 4]])
    })

    it('starts at rank 3 when two share the first place', () => {
      const model = rowsOf([12, 12, 7, 5])
      expect(model.rows.map(row => row.rank)).toEqual([3, 4])
      expect(model.winner.teams).toEqual([1, 2])
    })

    it('shows three rows and nothing more for 4 Parties', () => {
      const model = rowsOf([17, 15, 9, 5])
      expect(model.rows.map(row => row.rank)).toEqual([2, 3, 4])
      expect(model.moreRows).toBeNull()
    })

    it('says „+4 weitere Parteien“ for 8 Parties and „+1 weitere Partei“ for 5', () => {
      const eight = rowsOf([17, 15, 9, 5, 4, 3, 2, 1])
      expect(eight.rows).toHaveLength(3)
      expect(eight.moreRows).toBe('+4 weitere Parteien')
      expect(rowsOf([17, 15, 9, 5, 4]).moreRows).toBe('+1 weitere Partei')
    })

    it('is the same in the square format', () => {
      expect(rowsOf([17, 15, 9, 5, 4, 3], 'square').moreRows).toBe('+2 weitere Parteien')
    })

    it('strips pictographs from the name of a row', () => {
      const model = shareImageModel(source({ points: [17, 9], names: { 2: '🥒 Gurken' } }), 'wide', copy)!
      expect(model.rows[0]!.name).toBe('Gurken')
    })
  })

  describe('the games', () => {
    const played = (count: number, name = (n: number) => `Spiel ${n}`) => Array.from({ length: count }, (_, i) => ({ name: name(i + 1), firsts: [1 + (i % 2)] }))

    it.each([[1, '1 Spiel'], [6, '6 Spiele'], [30, '30 Spiele']])('counts %i games: %j', (count, label) => {
      expect(wide({ games: played(count) }).gamesLabel).toBe(label)
    })

    it('shows six chips wide and nine square', () => {
      expect(wide({ games: played(6) }).chips).toHaveLength(6)
      expect(wide({ games: played(6) }).moreChips).toBeNull()
      expect(wide({ games: played(9) }).chips).toHaveLength(6)
      expect(square({ games: played(9) }).chips).toHaveLength(9)
      expect(square({ games: played(9) }).moreChips).toBeNull()
    })

    it('says „+1 weitere“ at 7 games wide and „+3 weitere“ at 9; square at 10 and 30', () => {
      expect(wide({ games: played(7) }).moreChips).toBe('+1 weitere')
      expect(wide({ games: played(9) }).moreChips).toBe('+3 weitere')
      expect(square({ games: played(10) }).moreChips).toBe('+1 weitere')
      expect(square({ games: played(30) }).moreChips).toBe('+21 weitere')
    })

    it('takes the games in the order of their Rounds, whatever the order of the read', () => {
      const reversed = { ...source({ games: played(3) }) }
      reversed.results = [...reversed.results].reverse()
      expect(shareImageModel(reversed, 'wide', copy)!.chips.map(chip => chip.name)).toEqual(['Spiel 1', 'Spiel 2', 'Spiel 3'])
    })

    it('gives each chip the colour of the Party that won the game', () => {
      const chips = wide({ points: [5, 5, 5], games: [{ name: 'A', firsts: [3] }, { name: 'B', firsts: [2] }] }).chips
      expect(chips).toEqual([
        { name: 'A', teams: [3], color: TEAM_COLORS[2]!.fill },
        { name: 'B', teams: [2], color: TEAM_COLORS[1]!.fill },
      ])
    })

    it('carries every Party on first place of a shared game and shows the lowest one’s dot (#315 draws the real one)', () => {
      const [chip] = wide({ points: [5, 5, 5], games: [{ name: 'A', firsts: [3, 2] }] }).chips
      expect(chip).toEqual({ name: 'A', teams: [2, 3], color: TEAM_COLORS[1]!.fill })
    })

    it('strips pictographs from a game name', () => {
      expect(wide({ games: [{ name: 'Mario 🍄 Kart', firsts: [1] }] }).chips[0]!.name).toBe('Mario Kart')
    })

    it('shows fewer chips wide when six long names would run off the canvas (decision 7)', () => {
      const name = (n: number) => `${n}`.repeat(GAME_NAME_MAX).slice(0, GAME_NAME_MAX)
      const model = wide({ games: played(6, name) })
      expect(model.chips.length).toBeLessThan(6)
      expect(model.chips.length).toBeGreaterThanOrEqual(1)
      expect(model.moreChips).toBe(`+${6 - model.chips.length} weitere`)
    })

    it('shows a last game that fits instead of „+1 weitere“', () => {
      // Five chips of 18 characters (190 px each) fit the row only when the last one needs no „+N weitere“ beside it.
      const model = wide({ games: played(5, () => 'x'.repeat(18)) })
      expect(model.chips).toHaveLength(5)
      expect(model.moreChips).toBeNull()
    })

    it('keeps „+N weitere“ when the same chips are followed by a sixth game', () => {
      const model = wide({ games: played(6, () => 'x'.repeat(18)) })
      expect(model.chips).toHaveLength(4)
      expect(model.moreChips).toBe('+2 weitere')
    })

    it('shows six short names', () => {
      const model = wide({ games: played(6, () => 'x'.repeat(8)) })
      expect(model.chips).toHaveLength(6)
      expect(model.moreChips).toBeNull()
    })

    it('does not shorten the square list for long names', () => {
      expect(square({ games: played(9, () => 'x'.repeat(GAME_NAME_MAX)) }).chips).toHaveLength(9)
    })
  })

  describe('the alt text', () => {
    it('names the Winner, the Event, the points and the next places', () => {
      const model = wide({ points: [17, 15, 9, 5], names: { 1: 'Wilde Gurken', 2: 'Nacht Eulen', 3: 'Team Orange', 4: 'Käse Turbo' } })
      expect(model.alt).toBe('Wilde Gurken gewinnt Freitags-Zocken mit 17 Punkten. Platz 2: Nacht Eulen, 15 Punkte. Platz 3: Team Orange, 9 Punkte. Platz 4: Käse Turbo, 5 Punkte.')
    })

    it('says „1 Punkt“ in the singular', () => {
      const model = wide({ points: [1, 0], names: { 1: 'Gurken', 2: 'Eulen' } })
      expect(model.alt).toBe('Gurken gewinnt Freitags-Zocken mit 1 Punkt. Platz 2: Eulen, 0 Punkte.')
    })

    it('names at most the three shown rows', () => {
      expect(wide({ points: [17, 15, 9, 5, 4, 3, 2, 1] }).alt.match(/Platz \d/g)).toHaveLength(3)
    })

    it('uses the Tie wording for several Winners', () => {
      const model = wide({ points: [12, 12, 7], names: { 1: 'Wilde Gurken', 2: 'Nacht Eulen', 3: 'Käse Turbo' } })
      expect(model.alt).toBe('Wilde Gurken und Nacht Eulen gewinnen Freitags-Zocken mit je 12 Punkten. Platz 3: Käse Turbo, 7 Punkte.')
    })

    it('never names Compibert', () => {
      expect(wide().alt).not.toMatch(/compibert/i)
    })
  })

  describe('the Team names', () => {
    // The model names Parties from `de.team` because shared/board.ts is off-limits (a Worker imports it): this guards the second copy.
    it.each([1, 2, 3, 4, 5, 6, 7, 8])('names team %i as teamNameAt does', (position) => {
      const points = Array.from({ length: 8 }, (_, index) => (index + 1 === position ? 20 : 1))
      const withName = source({ points, names: { [position]: null } })
      const model = shareImageModel(withName, 'wide', copy)!
      expect(model.winner.name).toBe(teamNameAt(withName.teams, position, t))
      const named = source({ points, names: { [position]: 'Käse Turbo' } })
      expect(shareImageModel(named, 'wide', copy)!.winner.name).toBe(teamNameAt(named.teams, position, t))
    })

    it('names a Party the read has no team for with the colour name too', () => {
      const bare = { ...source({ points: [17, 9] }), teams: [] }
      const model = shareImageModel(bare, 'wide', copy)!
      expect(model.winner.name).toBe(teamNameAt([], 1, t))
      expect(model.rows[0]!.name).toBe(teamNameAt([], 2, t))
    })
  })
})
