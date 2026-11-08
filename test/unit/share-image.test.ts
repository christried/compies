import { describe, expect, it } from 'vitest'
import de from '~~/i18n/locales/de.json'
import { teamNameAt } from '../../app/utils/board'
import type { Translate } from '../../app/utils/settings-summary'
import type { BoardTeam, DatedSessionView, MemberView } from '../../shared/event'
import { GAME_NAME_MAX } from '../../shared/game'
import { standingsOf } from '../../shared/results'
import { fillCopy, parseShareFormat, pluralCopy, shareImageModel, SHARE_SIZE, type ShareFormat, type ShareImageModel, type ShareImageSource } from '../../shared/share-image'
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

/** The model of a single Winner (tie is null): what the older cases read. */
function single(model: ShareImageModel | null): ShareImageModel & { tie: null, winner: NonNullable<ShareImageModel['winner']> } {
  if (!model || model.tie !== null) throw new Error('expected a single Winner')
  return model as never
}
/** The model of a Tie (#315): several Parties on rank 1. */
function tied(model: ShareImageModel | null): ShareImageModel & { winner: null, tie: NonNullable<ShareImageModel['tie']> } {
  if (!model || model.tie === null) throw new Error('expected a Tie')
  return model as never
}

const wide = (options?: Options) => single(shareImageModel(source(options), 'wide', copy))
const square = (options?: Options) => single(shareImageModel(source(options), 'square', copy))
const tieWide = (options?: Options) => tied(shareImageModel(source(options), 'wide', copy))
const tieSquare = (options?: Options) => tied(shareImageModel(source(options), 'square', copy))

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

  it('signs with the brand copy, „Compies“, not Compibert', () => {
    expect(wide().brand).toBe('Compies')
  })

  it('says nothing about any Player but their number', () => {
    const members = [player('anna', 1), player('bert', 2)].map(member => ({ ...member, name: member.id === 'anna' ? 'Anna Beispiel' : 'Bert Muster', image: 'https://example.com/a.png', teamWord: 'Geheim' }))
    const text = JSON.stringify(wide({ members }))
    for (const forbidden of ['Anna', 'Bert', 'anna', 'bert', 'example.com', 'Geheim']) expect(text).not.toContain(forbidden)
    expect(wide({ members }).people).toBe('2 Leute')
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
    const named = (length: number, format: ShareFormat) => single(shareImageModel(source({ names: { 1: 'x'.repeat(length) } }), format, copy)).winner.size

    it.each([[1, 96], [14, 96], [15, 84], [34, 84], [35, 64]])('is %i characters wide: %i px', (length, size) => {
      expect(named(length, 'wide')).toBe(size)
    })

    it.each([[14, 128], [15, 112], [34, 112], [35, 88]])('is %i characters square: %i px', (length, size) => {
      expect(named(length, 'square')).toBe(size)
    })

    it('counts what the User sees, not UTF-16 units', () => {
      // 14 letters with a combining accent on each is still 14 characters.
      expect(single(shareImageModel(source({ names: { 1: 'é'.repeat(14) } }), 'wide', copy)).winner.size).toBe(96)
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
      const chips = wide({ points: [7, 5, 3], games: [{ name: 'A', firsts: [3] }, { name: 'B', firsts: [2] }] }).chips
      expect(chips).toEqual([
        { name: 'A', teams: [3], color: TEAM_COLORS[2]!.fill },
        { name: 'B', teams: [2], color: TEAM_COLORS[1]!.fill },
      ])
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

    it('counts the dot on every wide chip, a single Winner’s too, so the chips the row holds fit it (#315)', () => {
      // The renderer draws a dot in every plain chip: border 5, padding 20, dot 11, inner gap 7, and the gap of 10 after it. Six
      // 14-character names are 6 x 169 px with the dot, one more than the 994 px left beside „6 Spiele“ (948 px without it).
      const model = wide({ points: [9, 8, 7, 6, 5, 4], games: played(6, () => 'x'.repeat(14)) })
      const dotted = (name: string) => name.length * 8 + 5 + 20 + 11 + 7 + 10
      const room = 1088 - ('6 Spiele'.length * 10 + 14)
      const shown = model.chips.reduce((sum, chip) => sum + dotted(chip.name), 0)
      expect(model.chips).toHaveLength(5)
      expect(model.moreChips).toBe('+1 weitere')
      expect(shown + 100).toBeLessThanOrEqual(room)
    })

    it('shows a last game that fits instead of „+1 weitere“', () => {
      // Five chips of 17 characters (193 px each with the dot) fit the row only when the last one needs no „+N weitere“ beside it.
      const model = wide({ games: played(5, () => 'x'.repeat(17)) })
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

    it('shows nine chips square when they fit three lines', () => {
      expect(square({ games: played(9, () => 'x'.repeat(20)) }).chips).toHaveLength(9)
    })

    it('shortens the square list to what three lines hold, with „+N weitere“ on the last of them', () => {
      // 60 characters = about 718 px: one per line of 952 px.
      const model = square({ games: played(9, () => 'x'.repeat(GAME_NAME_MAX)) })
      expect(model.chips).toHaveLength(3)
      expect(model.moreChips).toBe('+6 weitere')
    })

    it('gives a chip wider than a line a line of its own, and leaves the last line to „+N weitere“', () => {
      expect(square({ games: played(4, () => 'x'.repeat(200)) }).chips).toHaveLength(2)
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

    it('never names Compibert', () => {
      expect(wide().alt).not.toMatch(/compibert/i)
    })
  })

  describe('the Team names', () => {
    // The model names Parties with shared/team-name.ts and the copy it carries, the app's `teamName` with vue-i18n's: this holds the two equal (#329).
    it.each([1, 2, 3, 4, 5, 6, 7, 8])('names team %i as teamNameAt does', (position) => {
      const points = Array.from({ length: 8 }, (_, index) => (index + 1 === position ? 20 : 1))
      const withName = source({ points, names: { [position]: null } })
      const model = single(shareImageModel(withName, 'wide', copy))
      expect(model.winner.name).toBe(teamNameAt(withName.teams, position, t))
      const named = source({ points, names: { [position]: 'Käse Turbo' } })
      expect(single(shareImageModel(named, 'wide', copy)).winner.name).toBe(teamNameAt(named.teams, position, t))
    })

    it('names a Party the read has no team for with the colour name too', () => {
      const bare = { ...source({ points: [17, 9] }), teams: [] }
      const model = single(shareImageModel(bare, 'wide', copy))
      expect(model.winner.name).toBe(teamNameAt([], 1, t))
      expect(model.rows[0]!.name).toBe(teamNameAt([], 2, t))
    })
  })
})

// The Share image of a Tie (#315, ADR 0014): every Party on rank 1 wins, names or chips by their number.
describe('the Tie', () => {
  const names = { 1: 'Wilde Gurken', 2: 'Nacht Eulen', 3: 'Käse Turbo' }

  /** Two Parties on rank 1 whose first name has `length` characters (a space after the first ten, so it can wrap), the second a short one. */
  const long = (length: number, extra: Partial<Options> = {}) => ({ points: [12, 12, 7, 5, 3], names: { 1: `${'A'.repeat(10)} ${'B'.repeat(length - 11)}`, 2: 'Eulen' }, ...extra })

  describe('names mode: 2 and 3 Winners', () => {
    it('has no single Winner and says „Unentschieden · 2 Sieger“, with one entry per Winner in their own colour', () => {
      const model = tieWide({ points: [12, 12, 5], names })
      expect(model.winner).toBeNull()
      expect(model.tie.mode).toBe('names')
      expect(model.tie.label).toBe('Unentschieden · 2 Sieger')
      expect(model.tie.entries).toEqual([
        { team: 1, name: 'Wilde Gurken', lines: ['Wilde Gurken'], fill: TEAM_COLORS[0]!.fill },
        { team: 2, name: 'Nacht Eulen', lines: ['Nacht Eulen'], fill: TEAM_COLORS[1]!.fill },
      ])
    })

    it('says „3 Sieger“ for three Winners, in ascending team order', () => {
      const model = tieWide({ points: [9, 12, 12, 12], names })
      expect(model.tie.label).toBe('Unentschieden · 3 Sieger')
      expect(model.tie.entries.map(entry => entry.team)).toEqual([2, 3, 4])
    })

    it('says „beide gleichauf“ when both of 2 Parties won, and „alle 3 gleichauf“ for 3 of 3', () => {
      expect(tieWide({ points: [4, 4] }).tie.label).toBe('Unentschieden · beide gleichauf')
      expect(tieWide({ points: [4, 4, 4] }).tie.label).toBe('Unentschieden · alle 3 gleichauf')
    })

    it('draws the shared points in the plural lead: „gewinnen mit je 12 Punkten“, „1 Punkt“, „0 Punkten“', () => {
      expect(tieWide({ points: [12, 12, 5] }).tie).toMatchObject({ lead: 'gewinnen mit je', points: '12', tail: 'Punkten' })
      expect(tieWide({ points: [1, 1, 0] }).tie).toMatchObject({ points: '1', tail: 'Punkt' })
      expect(tieWide({ points: [0, 0] }).tie).toMatchObject({ points: '0', tail: 'Punkten' })
    })

    // The step is by the longest name: <= 14, <= 22, longer.
    it.each([[14, 80, 64], [15, 68, 54], [22, 68, 54], [23, 52, 44]])('sizes every name by the longest of %i characters: k = 2 wide %i, k = 3 wide %i', (length, two, three) => {
      const name = (n: number) => 'x'.repeat(n)
      expect(tieWide({ points: [5, 5, 1], names: { 1: name(length), 2: 'y' } }).tie.size).toBe(two)
      expect(tieWide({ points: [5, 5, 5, 1], names: { 1: name(length), 2: 'y' } }).tie.size).toBe(three)
    })

    it.each([[14, 108, 88], [15, 92, 74], [22, 92, 74], [23, 72, 60]])('sizes square names by the longest of %i characters: k = 2 %i, k = 3 %i', (length, two, three) => {
      expect(tieSquare({ points: [5, 5, 1], names: { 1: 'x'.repeat(length) } }).tie.size).toBe(two)
      expect(tieSquare({ points: [5, 5, 5, 1], names: { 1: 'x'.repeat(length) } }).tie.size).toBe(three)
    })

    it('counts characters the User sees and strips pictographs from the names it draws', () => {
      const model = tieWide({ points: [5, 5], names: { 1: 'Gurken 🥒🥒', 2: 'é'.repeat(14) } })
      expect(model.tie.entries.map(entry => entry.name)).toEqual(['Gurken', 'é'.repeat(14)])
      expect(model.tie.size).toBe(80)
    })

    it('names a Winner without a Team name by its colour, as the single Winner is', () => {
      const bare = source({ points: [5, 5, 5, 1], names: { 1: 'Eins' } })
      const model = tied(shareImageModel(bare, 'wide', copy))
      expect(model.tie.entries.map(entry => entry.name)).toEqual(['Eins', teamNameAt(bare.teams, 2, t), teamNameAt(bare.teams, 3, t)])
    })

    describe('the wrap', () => {
      it('keeps every name on one line while the longest fits its column (wide k = 2: 21 characters at 68 px)', () => {
        expect(tieWide(long(21)).tie.entries.map(entry => entry.lines)).toEqual([[`${'A'.repeat(10)} ${'B'.repeat(10)}`], ['Eulen']])
      })

      it('breaks a name that runs past the column at the space nearest the middle (wide k = 2: 22 characters at 68 px)', () => {
        const { entries } = tieWide(long(22)).tie
        expect(entries[0]!.lines).toEqual(['A'.repeat(10), 'B'.repeat(11)])
        expect(entries[1]!.lines).toEqual(['Eulen'])
      })

      it('leaves a long name without a space on one line', () => {
        expect(tieWide({ points: [5, 5, 1], names: { 1: 'D'.repeat(40) } }).tie.entries[0]!.lines).toEqual(['D'.repeat(40)])
      })

      it('wraps earlier in the square for k = 2 (22 characters at 92 px pass 930) and later for k = 3 (32 at 60 px do not)', () => {
        expect(tieSquare(long(22)).tie.entries[0]!.lines).toHaveLength(2)
        expect(tieSquare(long(21)).tie.entries[0]!.lines).toHaveLength(1)
        const three = (length: number) => tieSquare({ points: [5, 5, 5, 1], names: { 1: `${'A'.repeat(10)} ${'B'.repeat(length - 11)}` } }).tie.entries[0]!.lines
        expect(three(32)).toHaveLength(1)
        expect(three(33)).toHaveLength(2)
      })
    })

    describe('the rows', () => {
      const ranks = (model: { rows: { rank: number }[] }) => model.rows.map(row => row.rank)

      it('starts at the next shared rank: 12, 12, 7, 7, 5 gives 3, 3 wide and 3, 3, 5 square', () => {
        const points = [12, 12, 7, 7, 5]
        expect(ranks(tieWide({ points }))).toEqual([3, 3])
        expect(ranks(tieSquare({ points }))).toEqual([3, 3, 5])
      })

      it('says what is not drawn: „+1 weitere Partei“ wide, nothing square', () => {
        const points = [12, 12, 7, 7, 5]
        expect(tieWide({ points }).moreRows).toBe('+1 weitere Partei')
        expect(tieSquare({ points }).moreRows).toBeNull()
      })

      it('gives three Winners room for two rows, wide and square, and says „+N weitere Parteien“ for the rest', () => {
        const points = [9, 9, 9, 4, 3, 2, 1]
        expect(ranks(tieWide({ points }))).toEqual([4, 5])
        expect(ranks(tieSquare({ points }))).toEqual([4, 5])
        expect(tieWide({ points }).moreRows).toBe('+2 weitere Parteien')
      })

      it('carries name, points and colours of a row, as the single picture does', () => {
        expect(tieWide({ points: [12, 12, 7], names: { 3: 'Käse Turbo' } }).rows).toEqual([{ rank: 3, team: 3, name: 'Käse Turbo', points: 7, fill: TEAM_COLORS[2]!.fill, ink: TEAM_COLORS[2]!.ink }])
      })

      it('takes one row for a wrapping name with 2 Winners (wide 2 -> 1, square 3 -> 2) and the room of both with 3', () => {
        expect(tieWide(long(22)).rows).toHaveLength(1)
        expect(tieWide(long(22)).moreRows).toBe('+2 weitere Parteien')
        expect(tieSquare(long(22)).rows).toHaveLength(2)
        const three = { points: [9, 9, 9, 4, 3], names: { 1: `${'A'.repeat(10)} ${'B'.repeat(30)}` } }
        expect(tieWide(three).rows).toHaveLength(0)
        expect(tieWide(three).moreRows).toBe('+2 weitere Parteien')
        expect(tieSquare(three).rows).toHaveLength(0)
      })

      it('has none and no more line when every Party won', () => {
        expect(tieWide({ points: [4, 4, 4] }).rows).toEqual([])
        expect(tieWide({ points: [4, 4, 4] }).moreRows).toBeNull()
        expect(tieSquare({ points: [4, 4] }).moreRows).toBeNull()
      })
    })

    it('sizes the square sunburst by k: 340 for 2, 300 for 3', () => {
      expect(tieSquare({ points: [5, 5, 1] }).tie.burst).toBe(340)
      expect(tieSquare({ points: [5, 5, 5, 1] }).tie.burst).toBe(300)
    })
  })

  describe('chips mode: 4 Winners and more', () => {
    const eight = (extra: Partial<Options> = {}) => ({ points: [3, 3, 3, 3, 3, 3, 3, 3], ...extra })

    it('draws names as chips, with no rows and the Parties below as „+N weitere Parteien“', () => {
      const model = tieWide({ points: [8, 8, 8, 8, 2, 1] })
      expect(model.tie.mode).toBe('chips')
      expect(model.tie.label).toBe('Unentschieden · 4 Sieger')
      expect(model.tie.entries.map(entry => entry.team)).toEqual([1, 2, 3, 4])
      expect(model.rows).toEqual([])
      expect(model.moreRows).toBe('+2 weitere Parteien')
      expect(tieWide({ points: [8, 8, 8, 8, 2] }).moreRows).toBe('+1 weitere Partei')
    })

    it('keeps every name on one line (the chip clips it) and draws no wrap', () => {
      const model = tieSquare({ points: [8, 8, 8, 8], names: { 1: `${'A'.repeat(20)} ${'B'.repeat(20)}` } })
      expect(model.tie.entries[0]!.lines).toHaveLength(1)
    })

    it('sizes the chip text by the longest name: 34 / 30 wide, 44 / 38 square', () => {
      expect(tieWide({ points: [8, 8, 8, 8], names: { 1: 'x'.repeat(14) } }).tie.size).toBe(34)
      expect(tieWide({ points: [8, 8, 8, 8], names: { 1: 'x'.repeat(15) } }).tie.size).toBe(30)
      expect(tieSquare({ points: [8, 8, 8, 8], names: { 1: 'x'.repeat(14) } }).tie.size).toBe(44)
      expect(tieSquare({ points: [8, 8, 8, 8], names: { 1: 'x'.repeat(15) } }).tie.size).toBe(38)
    })

    it('says „alle 8 gleichauf“ for 8 of 8, with nothing below', () => {
      const model = tieWide(eight())
      expect(model.tie.label).toBe('Unentschieden · alle 8 gleichauf')
      expect(model.tie.entries).toHaveLength(8)
      expect(model.rows).toEqual([])
      expect(model.moreRows).toBeNull()
    })

    it('sizes the square sunburst 280 from 4 Winners on', () => {
      expect(tieSquare({ points: [8, 8, 8, 8, 1] }).tie.burst).toBe(280)
      expect(tieSquare(eight()).tie.burst).toBe(280)
    })
  })

  describe('the alt text', () => {
    it('names the Winners, the Event, the points and the next shared places', () => {
      const model = tieWide({ points: [12, 12, 7, 5], names: { ...names, 4: 'Blau' } })
      expect(model.alt).toBe('Unentschieden bei Freitags-Zocken: Wilde Gurken und Nacht Eulen gewinnen mit je 12 Punkten. Platz 3: Käse Turbo, 7 Punkte. Platz 4: Blau, 5 Punkte.')
    })

    it('says „1 Punkt“ in the singular, with plain names (not stripped of pictographs)', () => {
      const model = tieWide({ points: [1, 1, 0], names: { 1: 'Gurken 🥒', 2: 'Eulen', 3: 'Käse' } })
      expect(model.alt).toBe('Unentschieden bei Freitags-Zocken: Gurken 🥒 und Eulen gewinnen mit je 1 Punkt. Platz 3: Käse, 0 Punkte.')
    })

    it('names three places whatever is drawn: with 3 Winners and with chips', () => {
      expect(tieWide({ points: [9, 9, 9, 4, 3, 2, 1] }).alt.match(/Platz \d/g)).toEqual(['Platz 4', 'Platz 5', 'Platz 6'])
      expect(tieWide({ points: [8, 8, 8, 8, 3, 2, 1, 0] }).alt.match(/Platz \d/g)).toEqual(['Platz 5', 'Platz 6', 'Platz 7'])
    })

    it('says „Beide Parteien“ for 2 of 2, with no place', () => {
      const model = tieWide({ points: [5, 5], names })
      expect(model.alt).toBe('Unentschieden bei Freitags-Zocken: Beide Parteien gewinnen mit je 5 Punkten: Wilde Gurken und Nacht Eulen.')
    })

    it('says „Alle 8 Parteien“ for 8 of 8, with no place', () => {
      const { alt } = tieWide({ points: [3, 3, 3, 3, 3, 3, 3, 3] })
      expect(alt).toMatch(/^Unentschieden bei Freitags-Zocken: Alle 8 Parteien gewinnen mit je 3 Punkten: Team Rot, Team Orange, .* und Team .*\.$/)
      expect(alt).not.toContain('Platz')
    })
  })

  it('is the same Tie in both formats, and a Tie of 0 Players has no „N Leute“', () => {
    const points = [5, 5, 2]
    expect(tieSquare({ points }).tie.entries).toEqual(tieWide({ points }).tie.entries)
    expect(tieWide({ points }).people).toBeNull()
    expect(tieWide({ points }).pill.rest).toBe('Sa 24.10.2026')
  })

  it('keeps the longest Event name (60 characters) whole for the renderer to clip', () => {
    expect(tieWide({ points: [5, 5], event: 'E'.repeat(60) }).pill.event).toHaveLength(60)
  })

  describe('a game with a Shared first place', () => {
    const chipOf = (firsts: number[], extra: Partial<Options> = {}) => tieWide({ points: [5, 5, 5, 5, 5, 5], ...extra, games: [{ name: 'A', firsts }] }).chips[0]!

    it('keeps the lowest team’s colour and adds one hex per Party in team order', () => {
      expect(chipOf([3, 2])).toEqual({ name: 'A', teams: [2, 3], color: TEAM_COLORS[1]!.fill, stripes: [TEAM_COLORS[1]!.fill, TEAM_COLORS[2]!.fill] })
    })

    it('has no stripes when one Party won the game', () => {
      expect(chipOf([4])).toEqual({ name: 'A', teams: [4], color: TEAM_COLORS[3]!.fill })
    })

    it('draws up to 4 stripes, and from 5 Parties names the game „A · 5 gleichauf“ with the first 4', () => {
      expect(chipOf([1, 2, 3, 4]).stripes).toHaveLength(4)
      expect(chipOf([1, 2, 3, 4]).name).toBe('A')
      const five = chipOf([1, 2, 3, 4, 5])
      expect(five.name).toBe('A · 5 gleichauf')
      expect(five.teams).toEqual([1, 2, 3, 4, 5])
      expect(five.stripes).toEqual([1, 2, 3, 4].map(team => TEAM_COLORS[team - 1]!.fill))
    })

    it('is the same on a single Winner’s picture', () => {
      const model = wide({ points: [9, 5, 5], games: [{ name: 'A', firsts: [3, 2] }] })
      expect(model.chips[0]!.stripes).toEqual([TEAM_COLORS[1]!.fill, TEAM_COLORS[2]!.fill])
    })
  })

  describe('the chips that fit (wide)', () => {
    const games = (count: number, firsts: (index: number) => number[], length = 16) => Array.from({ length: count }, (_, index) => ({ name: 'x'.repeat(length), firsts: firsts(index) }))
    const tie = (list: { name: string, firsts: number[] }[]) => tieWide({ points: [5, 5, 5, 5, 5, 5], games: list })

    it('counts a tied capsule at 8 px a stripe: six games of four stripes fit four, not six', () => {
      const model = tie(games(6, () => [1, 2, 3, 4]))
      expect(model.chips).toHaveLength(4)
      expect(model.moreChips).toBe('+2 weitere')
    })

    it('shows a last game that fits, never „+1 weitere“ in its place', () => {
      const model = tie(games(5, index => (index === 0 ? [1, 2] : [1])))
      expect(model.chips).toHaveLength(5)
      expect(model.moreChips).toBeNull()
    })

    it('shows six short games with their dots', () => {
      const model = tie(games(6, () => [1], 8))
      expect(model.chips).toHaveLength(6)
      expect(model.moreChips).toBeNull()
    })
  })

  describe('the chips that fit (square)', () => {
    const six = (firsts: number[]) => ({ points: [5, 5, 5, 5, 5, 5], games: Array.from({ length: 6 }, (_, index) => ({ name: 'x'.repeat(37), firsts: index === 0 ? firsts : [1] })) })

    it('fits six long games on three lines when every chip has a dot', () => {
      expect(tieSquare(six([1])).chips).toHaveLength(6)
    })

    it('counts a capsule wider than the dot: a four-stripe chip no longer lets the first line hold two', () => {
      const model = tieSquare(six([1, 2, 3, 4]))
      expect(model.chips).toHaveLength(4)
      expect(model.moreChips).toBe('+2 weitere')
    })
  })
})
