import { describe, expect, it } from 'vitest'
import de from '~~/i18n/locales/de.json'
import { teamNameAt } from '../../app/utils/board'
import type { Translate } from '../../app/utils/settings-summary'
import { fillCopy, parseShareFormat, pluralCopy, shareImageModel, SHARE_SIZE, type ShareFormat, type ShareImageModel, type ShareTiePanel, type ShareWinnerPanel } from '../../shared/share-image'
import { TEAM_COLORS } from '../../shared/team-colors'
import { type Options, SHARE_CASES, session, source, WORST_EVENT, worstGame, worstName } from './share-image-fixtures'

// What the Share image says (#313, rebuilt as the „Anzeigetafel“ in #510, note 14-share-image-redesign.md): a pure model of the Event read,
// so a test reads what the picture shows. The renderer only draws it (share-render.test.ts); the pixels are judged by eye.

/** vue-i18n's `t` for the parity test: named values and „einzahl | mehrzahl“. */
const t: Translate = (key, named = {}, plural) => {
  const message = key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], de)
  if (typeof message !== 'string') throw new Error(`No copy for ${key}`)
  const forms = message.split(' | ')
  const form = forms.length > 1 ? forms[plural === 1 ? 0 : 1]! : message
  return form.replace(/\{(\w+)\}/g, (_, name: string) => String(named[name] ?? (name === 'n' ? plural : '')))
}

const copy = { share: de.share, team: de.team }

const model = (input: Options | Parameters<typeof shareImageModel>[0], format: ShareFormat = 'wide'): ShareImageModel => {
  const built = shareImageModel('standings' in input ? input : source(input), format, copy)
  if (!built) throw new Error('expected a picture')
  return built
}
const winnerOf = (built: ShareImageModel): ShareWinnerPanel => {
  if (built.panel.kind !== 'winner') throw new Error('expected a single Winner')
  return built.panel
}
const tieOf = (built: ShareImageModel): ShareTiePanel => {
  if (built.panel.kind !== 'tie') throw new Error('expected a Tie')
  return built.panel
}
const wide = (options?: Options) => model(options ?? {}, 'wide')
const square = (options?: Options) => model(options ?? {}, 'square')
/** The panel's name of a Winner called `name`, in both formats. */
const nameOf = (name: string) => ({ wide: winnerOf(wide({ names: { 1: name } })).name, square: winnerOf(square({ names: { 1: name } })).name })
const eventOf = (event: string) => ({ wide: wide({ event }).header.event, square: square({ event }).header.event })
const letters = (length: number) => 'x'.repeat(length)

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
    expect(pluralCopy('{n} Termine', 9)).toBe('{n} Termine')
  })
})

describe('shareImageModel', () => {
  it('has nothing without Standings or without a first place', () => {
    expect(shareImageModel({ ...source(), standings: null }, 'wide', copy)).toBeNull()
    expect(shareImageModel({ ...source(), standings: [] }, 'wide', copy)).toBeNull()
    expect(shareImageModel({ ...source(), standings: [{ team: 1, rank: 2, points: 3 }] }, 'wide', copy)).toBeNull()
  })

  it.each<[ShareFormat, number, number]>([['wide', 1200, 630], ['square', 1080, 1080]])('carries the size of %s', (format, width, height) => {
    const built = model({}, format)
    expect({ format: built.format, width: built.width, height: built.height }).toEqual({ format, width, height })
  })

  it('signs with the brand copy, „Compies“, not Compibert', () => {
    expect(wide().header.brand).toBe('Compies')
  })

  it('has no Player count: nothing in the picture counts the Players', () => {
    const text = JSON.stringify(wide())
    expect(text).not.toMatch(/Leute|Person/)
    expect(wide()).not.toHaveProperty('people')
  })

  describe('the Winner panel', () => {
    it('is the Party on rank 1 with its Team colour, name and points', () => {
      expect(winnerOf(model(SHARE_CASES.kurz!))).toEqual({
        kind: 'winner', label: 'Sieger', team: 1, fill: '#e4572e', ink: '#151515',
        name: { lines: ['Wilde', 'Gurken'], size: 80 }, points: { value: '17', label: 'Punkte' },
      })
    })

    it('says „Punkt“ for one point and „Punkte“ for none', () => {
      expect(winnerOf(wide({ points: [1, 0] })).points).toEqual({ value: '1', label: 'Punkt' })
      expect(winnerOf(wide({ points: [0] })).points).toEqual({ value: '0', label: 'Punkte' })
    })

    it('takes the colour and the ink of the Winner: team 6 is dark and gets light ink', () => {
      const panel = winnerOf(wide({ points: [1, 1, 1, 1, 1, 9] }))
      expect(panel).toMatchObject({ team: 6, fill: '#0072b2', ink: '#fffdf8' })
      expect(panel.fill).toBe(TEAM_COLORS[5]!.fill)
    })

    it('names a Winner without a Team name by its colour', () => {
      expect(winnerOf(wide({ points: [17, 9] })).name.lines).toEqual(['Team Rot'])
      expect(winnerOf(wide({ points: [9, 17] })).name.lines).toEqual(['Team', 'Orange'])
    })

    it('strips pictographs and falls back to the colour name when nothing is left', () => {
      expect(winnerOf(wide({ names: { 1: 'Gurken 🥒🥒' } })).name.lines).toEqual(['Gurken'])
      expect(winnerOf(wide({ names: { 1: '🥒' } })).name.lines).toEqual(['Team Rot'])
    })

    it('strips ZWJ sequences, flags and skin tones as well', () => {
      expect(winnerOf(wide({ names: { 1: 'Fam 👨‍👩‍👧 🇩🇪 👍🏽 ❤️ Los' } })).name.lines).toEqual(['Fam Los'])
    })

    it('keeps ß, ł and ğ', () => {
      expect(winnerOf(wide({ names: { 1: 'Straße Łódź Doğan' } })).name.lines.join(' ')).toBe('Straße Łódź Doğan')
    })
  })

  describe('the Winner name', () => {
    it.each([
      ['Team Rot', ['Team Rot'], 96, 112],
      ['Rote Rüben', ['Rote Rüben'], 96, 112],
      [letters(11), [letters(11)], 80, 92],
      ['Wilde Gurken', ['Wilde', 'Gurken'], 80, 92],
      ['Nachteulen im Keller', ['Nachteulen', 'im Keller'], 80, 92],
      [letters(21), [letters(21)], 56, 64],
      ['Die unaufhaltsamen Gurken vom Dach', ['Die unaufhaltsamen', 'Gurken vom Dach'], 56, 64],
      ['Die Nachteulen vom Dach', ['Die Nachteulen', 'vom Dach'], 56, 64],
      [letters(25), [letters(25)], 56, 64],
    ])('draws %j as %j at %i px wide and %i px square', (name, lines, wideSize, squareSize) => {
      const drawn = nameOf(name)
      expect(drawn.wide).toEqual({ lines, size: wideSize })
      expect(drawn.square).toEqual({ lines, size: squareSize })
    })

    it('never breaks a name of 10 characters or fewer, space or not', () => {
      expect(nameOf('Ab Cd Ef Gh').wide.lines).toHaveLength(2)
      expect(nameOf('Ab Cd Ef G').wide.lines).toEqual(['Ab Cd Ef G'])
    })

    it('breaks at the earlier of two equally near spaces', () => {
      // 16 characters, spaces at 7 and 9, the middle is 8: both are one away.
      expect(nameOf('Aaaaaaa B Cccccc').wide.lines).toEqual(['Aaaaaaa', 'B Cccccc'])
    })

    it('counts what the User sees, not UTF-16 units', () => {
      // 10 letters with a combining accent on each: still 10 characters, one line at 96.
      expect(nameOf('e\u0301'.repeat(10)).wide).toEqual({ lines: ['e\u0301'.repeat(10)], size: 96 })
      expect(nameOf('👍🏽x'.repeat(11)).wide.lines).toEqual([letters(11)])
    })

    it('handles the worst case of 77 characters: two lines that join back to it, at 56 / 64', () => {
      const name = worstName(1)
      expect(name).toHaveLength(77)
      const drawn = nameOf(name)
      expect(drawn.wide.lines).toHaveLength(2)
      expect(drawn.wide.lines.join(' ')).toBe(name)
      expect([drawn.wide.size, drawn.square.size]).toEqual([56, 64])
    })
  })

  describe('the Event in the header', () => {
    it.each([[15, 30], [40, 30], [41, 24], [60, 24]])('is %i characters wide: %i px, one line', (length, size) => {
      expect(eventOf(letters(length)).wide).toEqual({ lines: [letters(length)], size })
    })

    it('keeps a long wide Event on one line even with spaces', () => {
      expect(eventOf(WORST_EVENT).wide).toEqual({ lines: [WORST_EVENT], size: 24 })
    })

    it.each([[15, 46, 1], [30, 46, 1], [31, 34, 1], [44, 34, 1], [45, 34, 1]])('is %i characters square: %i px on %i line', (length, size, lines) => {
      expect(eventOf(letters(length)).square).toEqual({ lines: Array(lines).fill(letters(length)), size })
    })

    it('breaks a square Event of 45 characters or more at the space nearest the middle, at 34 px', () => {
      const event = `${letters(22)} ${letters(22)}`
      expect(eventOf(event).square).toEqual({ lines: [letters(22), letters(22)], size: 34 })
    })

    it('draws the long Event of the reference: 24 px wide, two lines at 34 px square', () => {
      const lang = SHARE_CASES.lang!
      expect(model(lang, 'wide').header.event).toEqual({ lines: ['Großes Herbst-Turnier der Mittwochsrunde im Vereinsheim Nord'], size: 24 })
      expect(model(lang, 'square').header.event).toEqual({ lines: ['Großes Herbst-Turnier der', 'Mittwochsrunde im Vereinsheim Nord'], size: 34 })
    })

    it('keeps one line for 45 characters without a space', () => {
      expect(eventOf(letters(45)).square.lines).toEqual([letters(45)])
    })

    it('strips pictographs and draws nothing when nothing is left', () => {
      expect(eventOf('Zocken 🎮 Abend').wide.lines).toEqual(['Zocken Abend'])
      expect(eventOf('🎮🔥').wide.lines).toEqual([''])
    })
  })

  describe('the dates', () => {
    const dates = (...startsAt: string[]) => wide({ sessions: startsAt.map((at, index) => session(at, at, index + 1)) }).header.dates

    it('reads one Session as its day', () => {
      expect(wide().header.dates).toBe('Sa 24.10.2026')
    })

    it('reads two Sessions on one day as that day', () => {
      expect(dates('2026-10-24T10:00:00Z', '2026-10-24T18:00:00Z')).toBe('Sa 24.10.2026')
    })

    it('joins up to three days with „ · “, the year on the last only', () => {
      expect(dates('2026-10-24T18:00:00Z', '2026-10-31T18:00:00Z')).toBe('Sa 24.10. · Sa 31.10.2026')
      expect(dates('2026-10-23T18:00:00Z', '2026-10-24T18:00:00Z', '2026-10-25T18:00:00Z')).toBe('Fr 23.10. · Sa 24.10. · So 25.10.2026')
    })

    it('puts the year on every day across a New Year', () => {
      expect(dates('2026-12-30T18:00:00Z', '2027-01-02T18:00:00Z')).toBe('Mi 30.12.2026 · Sa 02.01.2027')
    })

    it('says „first – last · n Termine“ from four days on, whatever the order of the read', () => {
      expect(dates('2026-11-01T18:00:00Z', '2026-10-24T18:00:00Z', '2026-10-31T18:00:00Z', '2026-10-28T18:00:00Z')).toBe('Sa 24.10. – So 01.11.2026 · 4 Termine')
    })

    it('puts the year on both ends of four days across a New Year', () => {
      expect(dates('2026-12-28T18:00:00Z', '2026-12-30T18:00:00Z', '2027-01-02T18:00:00Z', '2027-01-04T18:00:00Z')).toBe('Mo 28.12.2026 – Mo 04.01.2027 · 4 Termine')
    })

    it('counts distinct days, not Sessions: five Sessions on three days read as three days', () => {
      expect(dates('2026-10-23T10:00:00Z', '2026-10-23T18:00:00Z', '2026-10-24T10:00:00Z', '2026-10-24T18:00:00Z', '2026-10-25T18:00:00Z')).toBe('Fr 23.10. · Sa 24.10. · So 25.10.2026')
    })

    it('counts the day in Berlin: 23:30 UTC on the 24th in summer is the 25th', () => {
      expect(dates('2026-07-24T23:30:00Z')).toBe('Sa 25.07.2026')
    })

    it('leaves out a Session that never started', () => {
      const sessions = [session('2026-10-24T18:00:00Z'), session('2026-11-08T18:00:00Z', null, null)]
      expect(wide({ sessions }).header.dates).toBe('Sa 24.10.2026')
    })

    it('has no dates when no started Session has one', () => {
      expect(wide({ sessions: [] }).header.dates).toBeNull()
    })
  })

  describe('the Standings', () => {
    const standingsOf = (points: number[], format: ShareFormat = 'wide') => model({ points }, format).standings
    const rows = (points: number[], format: ShareFormat = 'wide') => standingsOf(points, format)!.rows.map(row => row.kind === 'more' ? row.text : row.rank)

    it('lists ranks 2 to 4 of four Parties, with name, points and colours, both formats', () => {
      for (const format of ['wide', 'square'] as const) {
        const { standings } = model(SHARE_CASES.kurz!, format)
        expect(standings).toMatchObject({ title: 'Endstand', count: '4 Parteien' })
        expect(standings!.rows).toEqual([
          { kind: 'party', rank: 2, team: 2, name: 'Nacht Eulen', points: 15, fill: '#f0a202', ink: '#151515' },
          { kind: 'party', rank: 3, team: 3, name: 'Team Orange', points: 9, fill: '#f3e04a', ink: '#151515' },
          { kind: 'party', rank: 4, team: 4, name: 'Käse Turbo', points: 5, fill: '#56b4e9', ink: '#151515' },
        ])
      }
    })

    it('keeps shared ranks: 17, 9, 9, 5 gives 2, 2, 4', () => {
      expect(rows([17, 9, 9, 5])).toEqual([2, 2, 4])
    })

    it('says „+4 weitere Parteien“ for 8 Parties wide: ranks 2 and 3, the more row, then the last place', () => {
      const { standings } = model(SHARE_CASES.lang!, 'wide')
      expect(standings!.count).toBe('8 Parteien')
      expect(standings!.rows).toMatchObject([
        { kind: 'party', rank: 2, team: 8, points: 27 },
        { kind: 'party', rank: 3, team: 2, points: 24 },
        { kind: 'more', text: '+4 weitere Parteien' },
        { kind: 'party', rank: 8, team: 1, name: 'Rote Rüben Racing', points: 4 },
      ])
    })

    it('says „+2 weitere Parteien“ for 8 Parties square: ranks 2 to 5, the more row, the last place', () => {
      const { standings } = model(SHARE_CASES.lang!, 'square')
      expect(standings!.rows).toMatchObject([
        { kind: 'party', rank: 2 }, { kind: 'party', rank: 3 }, { kind: 'party', rank: 4 }, { kind: 'party', rank: 5 },
        { kind: 'more', text: '+2 weitere Parteien' },
        { kind: 'party', rank: 8, team: 1 },
      ])
    })

    it('fills the slots exactly: wide shows 5 Parties whole and cuts from 6, square shows 7 Parties whole and cuts from 8', () => {
      expect(rows([20, 10, 9, 8, 7])).toEqual([2, 3, 4, 5])
      expect(rows([20, 10, 9, 8, 7, 6])).toEqual([2, 3, '+2 weitere Parteien', 6])
      expect(rows([20, 10, 9, 8, 7, 6, 5], 'square')).toEqual([2, 3, 4, 5, 6, 7])
      expect(rows([20, 10, 9, 8, 7, 6, 5, 4], 'square')).toEqual([2, 3, 4, 5, '+2 weitere Parteien', 8])
    })

    it('is hidden for one Party and when every Party is on rank 1', () => {
      expect(standingsOf([17])).toBeNull()
      expect(standingsOf([12, 12])).toBeNull()
    })

    it('strips pictographs from the name of a row', () => {
      expect(model({ points: [17, 9], names: { 2: 'Eulen 🦉' } }).standings!.rows[0]).toMatchObject({ name: 'Eulen' })
    })
  })

  describe('the games', () => {
    const games = (count: number) => Array.from({ length: count }, (_, index) => ({ name: `Spiel ${index + 1}`, firsts: [1] }))
    const rowsOf = (count: number, format: ShareFormat = 'wide') => model({ games: games(count) }, format).games.rows.map(row => row.kind === 'more' ? row.text : row.name)

    it('lists the played games with a stripe in the colour of the Party on place 1', () => {
      const built = model(SHARE_CASES.kurz!)
      expect(built.games.label).toBe('6 Spiele')
      expect(built.games.rows).toHaveLength(6)
      expect(built.games.rows[0]).toEqual({ kind: 'game', name: 'Rocket League', stripe: ['#e4572e'] })
      expect(built.games.rows[1]).toEqual({ kind: 'game', name: 'Mario Kart 8', stripe: ['#f0a202'] })
    })

    it('says „+7 weitere“ after 5 games for 12 games wide and „+5 weitere“ after 7 square', () => {
      const wideGames = model(SHARE_CASES.lang!, 'wide').games
      expect(wideGames.label).toBe('12 Spiele')
      expect(wideGames.rows).toHaveLength(6)
      expect(wideGames.rows.at(-1)).toEqual({ kind: 'more', text: '+7 weitere' })
      const squareGames = model(SHARE_CASES.lang!, 'square').games
      expect(squareGames.label).toBe('12 Spiele')
      expect(squareGames.rows).toHaveLength(8)
      expect(squareGames.rows.at(-1)).toEqual({ kind: 'more', text: '+5 weitere' })
    })

    it('fills the slots exactly: 6 wide and 8 square show everything, one more cuts to „+2 weitere“, never „+1“', () => {
      expect(rowsOf(6)).toHaveLength(6)
      expect(rowsOf(6).at(-1)).toBe('Spiel 6')
      expect(rowsOf(7)).toEqual(['Spiel 1', 'Spiel 2', 'Spiel 3', 'Spiel 4', 'Spiel 5', '+2 weitere'])
      expect(rowsOf(8, 'square')).toHaveLength(8)
      expect(rowsOf(8, 'square').at(-1)).toBe('Spiel 8')
      expect(rowsOf(9, 'square').slice(-2)).toEqual(['Spiel 7', '+2 weitere'])
    })

    it('says „1 Spiel“ for one and „0 Spiele“ with no rows for none', () => {
      expect(model({ games: games(1) }).games).toMatchObject({ label: '1 Spiel', rows: [{ kind: 'game', name: 'Spiel 1' }] })
      expect(model({ games: [] }).games).toEqual({ label: '0 Spiele', legend: null, rows: [] })
    })

    it('takes the games in the order of their Rounds, whatever the order of the read', () => {
      const base = source({ games: games(3) })
      const shuffled = { ...base, results: [base.results[2]!, base.results[0]!, base.results[1]!] }
      expect(model(shuffled).games.rows.map(row => row.kind === 'game' ? row.name : '')).toEqual(['Spiel 1', 'Spiel 2', 'Spiel 3'])
    })

    it('splits the stripe of a game with a Shared first place, one colour per Party in team order', () => {
      const tied = model(SHARE_CASES.tie2!).games.rows[2]
      expect(tied).toEqual({ kind: 'game', name: 'Codenames', stripe: ['#e4572e', '#f0a202'] })
    })

    it('draws the first four colours of five tied Parties', () => {
      const five = model({ points: [1, 1, 1, 1, 1, 0], games: [{ name: 'Werwölfe', firsts: [5, 3, 1, 2, 4] }] })
      expect(five.games.rows[0]).toMatchObject({ name: 'Werwölfe · 5 gleichauf', stripe: ['#e4572e', '#f0a202', '#f3e04a', '#56b4e9'] })
    })

    it('draws a surface-coloured stripe for a game nobody won', () => {
      const base = source({ games: [{ name: 'Leer', firsts: [1] }] })
      const nobody = { ...base, results: base.results.map(result => ({ ...result, places: result.places.map(place => ({ ...place, place: 2 })) })) }
      expect(model(nobody).games.rows[0]).toEqual({ kind: 'game', name: 'Leer', stripe: ['#fffdf8'] })
    })

    it('strips pictographs from a game name', () => {
      expect(model({ games: [{ name: 'Mario 🍄 Kart', firsts: [1] }] }).games.rows[0]).toMatchObject({ name: 'Mario Kart' })
    })

    it('keeps the longest name (60 characters) whole for the renderer to clip', () => {
      expect(worstGame(1)).toHaveLength(60)
      expect(model(SHARE_CASES.worst!).games.rows[0]).toMatchObject({ name: worstGame(1) })
    })
  })

  describe('the alt text', () => {
    it('names the Winner, the Event, the points and place 2', () => {
      expect(wide().alt).toBe('Team Rot gewinnt Freitags-Zocken mit 17 Punkten. Platz 2: Team Orange.')
      expect(model(SHARE_CASES.kurz!).alt).toBe('Wilde Gurken gewinnt Freitags-Zocken mit 17 Punkten. Platz 2: Nacht Eulen.')
      expect(model(SHARE_CASES.kurz!, 'square').alt).toBe(model(SHARE_CASES.kurz!).alt)
    })

    it('says „1 Punkt“ in the singular', () => {
      expect(wide({ points: [1, 0], names: { 1: 'Gurken', 2: 'Eulen' } }).alt).toBe('Gurken gewinnt Freitags-Zocken mit 1 Punkt. Platz 2: Eulen.')
    })

    it('has no Platz 2 for one Party', () => {
      expect(wide({ points: [17], names: { 1: 'Gurken' } }).alt).toBe('Gurken gewinnt Freitags-Zocken mit 17 Punkten.')
    })

    it('names every Party that shares place 2', () => {
      expect(wide({ points: [17, 9, 9], names: { 1: 'Gurken' } }).alt).toBe('Gurken gewinnt Freitags-Zocken mit 17 Punkten. Platz 2: Team Orange und Team Gelb.')
    })

    it('names no place 3 or 4 and no points of place 2', () => {
      expect(model(SHARE_CASES.kurz!).alt).not.toMatch(/Platz [134]|Käse|Team Orange|15/)
    })

    it('keeps the names as they are, not stripped of pictographs', () => {
      expect(wide({ event: 'Zocken 🎮', names: { 1: 'Gurken 🥒' } }).alt).toContain('Gurken 🥒 gewinnt Zocken 🎮 mit')
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
      expect(winnerOf(model(withName)).name.lines.join(' ')).toBe(teamNameAt(withName.teams, position, t))
      const named = source({ points, names: { [position]: 'Käse Turbo' } })
      expect(winnerOf(model(named)).name.lines.join(' ')).toBe(teamNameAt(named.teams, position, t))
    })

    it('names a Party the read has no team for with the colour name too', () => {
      const bare = { ...source({ points: [17, 9] }), teams: [] }
      const built = model(bare)
      expect(winnerOf(built).name.lines.join(' ')).toBe(teamNameAt([], 1, t))
      expect(built.standings!.rows[0]).toMatchObject({ name: teamNameAt([], 2, t) })
    })
  })

  // The Tie (#510 the bar and the bands, #511 the font tiers, „+n weitere“, „je“ and the legend).
  describe('a Tie', () => {
    const partyBands = (panel: ShareTiePanel) => panel.bands.flatMap(band => band.kind === 'party' ? [band] : [])
    /** `k` Winners on 5 points; the longest name (`length` letters) is on the last one, so a folded Party can carry it. */
    const tieWith = (k: number, length: number, format: ShareFormat) => tieOf(model({ points: Array(k).fill(5), names: { [k]: letters(length) } }, format))

    describe('the band font', () => {
      const tiers: [number, [number, number, number, number], [number, number, number, number]][] = [
        [2, [72, 52, 52, 38], [88, 68, 68, 52]],
        [3, [56, 44, 44, 34], [68, 56, 56, 44]],
        ...[4, 5, 6, 7, 8].map(k => [k, [36, 32, 32, 28], [40, 36, 36, 32]] as [number, [number, number, number, number], [number, number, number, number]]),
      ]
      it.each(tiers)('of %i Winners follows the longest name (14 / 15 / 22 / 23 characters)', (k, wideSizes, squareSizes) => {
        const lengths = [14, 15, 22, 23]
        expect(lengths.map(length => tieWith(k, length, 'wide').size)).toEqual(wideSizes)
        expect(lengths.map(length => tieWith(k, length, 'square').size)).toEqual(squareSizes)
      })

      it('counts the drawn name: a pictograph does not make 14 characters a longer name', () => {
        expect(tieOf(model({ points: [5, 5], names: { 2: `${letters(14)} 🎮` } })).size).toBe(72)
      })

      it('is 28 wide and 32 square for the 32-character name of the Tie of 8', () => {
        expect(tieOf(model(SHARE_CASES.tie8!, 'wide')).size).toBe(28)
        expect(tieOf(model(SHARE_CASES.tie8!, 'square')).size).toBe(32)
      })
    })

    describe('the bands', () => {
      it.each([2, 3, 4, 6])('has one party band for each of %i Winners and no „+n weitere“', (k) => {
        const panel = tieOf(model({ points: Array(k).fill(5) }))
        expect(panel.bands).toHaveLength(k)
        expect(partyBands(panel).map(band => band.team)).toEqual(Array.from({ length: k }, (_, index) => index + 1))
      })

      it('is a party band with the Team name and colours, ascending, and strips pictographs', () => {
        for (const format of ['wide', 'square'] as const) {
          const panel = tieOf(model(SHARE_CASES.tie2!, format))
          expect(panel.bands.map(band => band.kind === 'party' ? band.name : band.text)).toEqual(['Wilde Gurken', 'Nacht Eulen'])
          expect(panel.bands[0]).toEqual({ kind: 'party', team: 1, name: 'Wilde Gurken', fill: '#e4572e', ink: '#151515' })
        }
        expect(partyBands(tieOf(model({ points: [5, 5], names: { 1: 'Gurken 🥒' } })))[0]!.name).toBe('Gurken')
      })

      it('shows five bands and „+2 weitere“ for 7 Winners, „+3 weitere“ for 8', () => {
        const seven = tieOf(model({ points: Array(7).fill(5) }))
        expect(partyBands(seven).map(band => band.team)).toEqual([1, 2, 3, 4, 5])
        expect(seven.bands).toHaveLength(6)
        expect(seven.bands[5]).toEqual({ kind: 'more', text: '+2 weitere', fill: '#fffdf8', ink: '#151515' })
        expect(seven.label).toBe('Alle 7 gleichauf')
        const eight = tieOf(model({ points: Array(8).fill(5) }))
        expect(partyBands(eight)).toHaveLength(5)
        expect(eight.bands[5]).toMatchObject({ kind: 'more', text: '+3 weitere' })
        expect(eight.label).toBe('Alle 8 gleichauf')
      })

      it('says „7 Sieger“ and folds two Winners when 7 of 8 Parties won', () => {
        const built = model({ points: [5, 5, 5, 5, 5, 5, 5, 1] })
        const panel = tieOf(built)
        expect(panel.label).toBe('Unentschieden · 7 Sieger')
        expect(partyBands(panel)).toHaveLength(5)
        expect(panel.bands[5]).toMatchObject({ kind: 'more', text: '+2 weitere' })
        expect(built.standings).toMatchObject({ count: '8 Parteien', rows: [{ kind: 'party', rank: 8, team: 8 }] })
      })
    })

    describe('the bar', () => {
      it('says „je“, the points and the Winners', () => {
        expect(tieOf(model(SHARE_CASES.tie2!))).toMatchObject({ kind: 'tie', label: 'Unentschieden · 2 Sieger', each: 'je', points: { value: '15', label: 'Punkte' } })
        expect(tieOf(model(SHARE_CASES.tie5!))).toMatchObject({ label: 'Unentschieden · 5 Sieger', each: 'je', points: { value: '12', label: 'Punkte' } })
      })

      it('says „beide gleichauf“ when both of 2 Parties won, „Alle k gleichauf“ from 3', () => {
        expect(tieOf(model({ points: [5, 5] })).label).toBe('Unentschieden · beide gleichauf')
        expect(tieOf(model({ points: Array(5).fill(5) })).label).toBe('Alle 5 gleichauf')
      })

      it('says „Punkt“ at one shared point and names a Winner without a Team name by its colour', () => {
        const panel = tieOf(model({ points: [1, 1, 0] }))
        expect(panel.points).toEqual({ value: '1', label: 'Punkt' })
        expect(partyBands(panel).map(band => band.name)).toEqual(['Team Rot', 'Team Orange'])
      })
    })

    describe('the Standings', () => {
      it('lists the Parties after the Winners with their shared rank', () => {
        expect(model(SHARE_CASES.tie2!).standings).toMatchObject({ count: '4 Parteien', rows: [{ rank: 3, team: 3 }, { rank: 4, team: 4 }] })
        expect(model(SHARE_CASES.tie3!).standings).toMatchObject({
          count: '5 Parteien',
          rows: [{ kind: 'party', rank: 4, team: 4, name: 'Nacht Eulen', points: 9 }, { kind: 'party', rank: 5, team: 5, name: 'Käse Turbo', points: 7 }],
        })
        expect(model(SHARE_CASES.tie5!).standings).toMatchObject({
          count: '7 Parteien',
          rows: [{ rank: 6, team: 6, points: 8 }, { rank: 7, team: 7, points: 5 }],
        })
      })

      it('is hidden when every Party is on rank 1', () => {
        expect(model(SHARE_CASES.tie8!).standings).toBeNull()
        expect(model({ points: [5, 5] }).standings).toBeNull()
      })

      it('counts the slots over the Parties after the Winners', () => {
        const points = [9, 9, 9, 5, 4, 3, 2, 1]
        const ranks = (format: ShareFormat) => model({ points }, format).standings!.rows.map(row => row.kind === 'more' ? row.text : row.rank)
        expect(ranks('wide')).toEqual([4, 5, '+2 weitere Parteien', 8])
        expect(ranks('square')).toEqual([4, 5, 6, 7, 8])
      })
    })

    describe('the games', () => {
      const gameRowsOf = (input: Parameters<typeof model>[0], format: ShareFormat = 'wide') => model(input, format).games.rows

      it('has no legend when no game tied', () => {
        expect(model(SHARE_CASES.kurz!).games.legend).toBeNull()
      })

      it('has the legend with the first two winning Parties of the first tied game', () => {
        expect(model(SHARE_CASES.tie2!).games.legend).toEqual({ stripe: ['#e4572e', '#f0a202'], text: 'gleichauf' })
        expect(model(SHARE_CASES.tie3!).games.legend).toEqual({ stripe: ['#f0a202', '#f3e04a'], text: 'gleichauf' })
        expect(model(SHARE_CASES.tie5!).games.legend).toEqual({ stripe: ['#e4572e', '#f0a202'], text: 'gleichauf' })
        expect(model(SHARE_CASES.tie8!).games.legend).toEqual({ stripe: ['#e4572e', '#f0a202'], text: 'gleichauf' })
      })

      it('has the legend for a single Winner whose game tied', () => {
        const built = model({ points: [17, 9], games: [{ name: 'Codenames', firsts: [1, 2] }] })
        expect(built.panel.kind).toBe('winner')
        expect(built.games.legend).toEqual({ stripe: ['#e4572e', '#f0a202'], text: 'gleichauf' })
      })

      it('has the legend when the tied game sits behind „+n weitere“', () => {
        const games = Array.from({ length: 12 }, (_, index) => ({ name: `Spiel ${index + 1}`, firsts: index === 10 ? [2, 3] : [1] }))
        const built = model({ points: [5, 5, 5], games })
        expect(built.games.rows).toHaveLength(6)
        expect(built.games.rows.at(-1)).toEqual({ kind: 'more', text: '+7 weitere' })
        expect(built.games.legend).toEqual({ stripe: ['#f0a202', '#f3e04a'], text: 'gleichauf' })
      })

      it('has no legend for a game nobody won', () => {
        const base = source({ games: [{ name: 'Leer', firsts: [1] }] })
        const nobody = { ...base, results: base.results.map(result => ({ ...result, places: result.places.map(place => ({ ...place, place: 2 })) })) }
        expect(model(nobody).games.legend).toBeNull()
      })

      it('splits the stripe of a game of 2, 3 and 4 Parties and adds no suffix', () => {
        expect(model(SHARE_CASES.tie2!).games.rows[2]).toEqual({ kind: 'game', name: 'Codenames', stripe: ['#e4572e', '#f0a202'] })
        expect(model(SHARE_CASES.tie3!).games.rows[3]).toEqual({ kind: 'game', name: 'Overcooked 2', stripe: ['#e4572e', '#f0a202', '#f3e04a'] })
        expect(gameRowsOf({ points: [1, 1, 1, 1, 0], games: [{ name: 'Werwölfe', firsts: [1, 2, 3, 4] }] })[0])
          .toEqual({ kind: 'game', name: 'Werwölfe', stripe: ['#e4572e', '#f0a202', '#f3e04a', '#56b4e9'] })
      })

      it('adds „· n gleichauf“ from 5 Parties on place 1, with n all of them, and keeps four colours', () => {
        expect(model(SHARE_CASES.tie5!).games.rows[0]).toEqual({ kind: 'game', name: 'Werwölfe · 5 gleichauf', stripe: ['#e4572e', '#f0a202', '#f3e04a', '#56b4e9'] })
        expect(model(SHARE_CASES.tie8!).games.rows[0]).toEqual({ kind: 'game', name: 'Werwölfe · 8 gleichauf', stripe: ['#e4572e', '#f0a202', '#f3e04a', '#56b4e9'] })
      })

      it('cuts the games to the slots: tie3 5 + „+2 weitere“ wide, 7 square; tie5 5 + „+4 weitere“ wide, 7 + „+2 weitere“ square', () => {
        const texts = (name: string, format: ShareFormat) => model(SHARE_CASES[name]!, format).games.rows.map(row => row.kind === 'more' ? row.text : row.name)
        expect(texts('tie3', 'wide')).toHaveLength(6)
        expect(texts('tie3', 'wide').at(-1)).toBe('+2 weitere')
        expect(texts('tie3', 'square')).toHaveLength(7)
        expect(texts('tie3', 'square')).not.toContain('+2 weitere')
        expect(texts('tie5', 'wide').at(-1)).toBe('+4 weitere')
        expect(texts('tie5', 'wide')).toHaveLength(6)
        expect(texts('tie5', 'square').at(-1)).toBe('+2 weitere')
        expect(texts('tie5', 'square')).toHaveLength(8)
      })
    })

    it('says the Tie in the alt text, with no places', () => {
      for (const format of ['wide', 'square'] as const) {
        expect(model(SHARE_CASES.tie2!, format).alt).toBe('Unentschieden bei Spieleabend bei Jonas: Wilde Gurken und Nacht Eulen gewinnen mit je 15 Punkten.')
        expect(model(SHARE_CASES.tie3!, format).alt).toBe('Unentschieden bei Zocken im Keller: Grüne Welle, Pinke Panther und Team Orange gewinnen mit je 14 Punkten.')
        expect(model(SHARE_CASES.tie5!, format).alt).toBe('Unentschieden bei Silvester-Spieleturnier: Wilde Gurken, Team Orange, Käse Turbo, Pinke Panther und Nacht Eulen gewinnen mit je 12 Punkten.')
      }
      expect(model({ points: [1, 1, 0] }).alt).toBe('Unentschieden bei Freitags-Zocken: Team Rot und Team Orange gewinnen mit je 1 Punkt.')
    })

    it('names all 8 Winners in the alt text, the folded ones included', () => {
      for (const format of ['wide', 'square'] as const) {
        expect(model(SHARE_CASES.tie8!, format).alt).toBe('Unentschieden bei Das große Finale: Alle 8 Parteien gewinnen mit je 10 Punkten: Rote Rüben, Team Orange, Gelbe Gefahr, Käse Turbo, Grüne Welle, Blaue Bohnen, Pinke Panther und Nachteulen aus dem dritten Stock.')
      }
    })

    it('says „Beide Parteien“ when both won, and „Alle 3 Parteien“ for 3 of 3', () => {
      expect(model({ points: [5, 5], names: { 1: 'Wilde Gurken', 2: 'Nacht Eulen' } }).alt).toBe('Unentschieden bei Freitags-Zocken: Beide Parteien gewinnen mit je 5 Punkten: Wilde Gurken und Nacht Eulen.')
      expect(model({ points: [5, 5, 5] }).alt).toBe('Unentschieden bei Freitags-Zocken: Alle 3 Parteien gewinnen mit je 5 Punkten: Team Rot, Team Orange und Team Gelb.')
    })
  })

  describe('the worst case', () => {
    it('is built for both formats: 8 Parties of 77 characters, 12 games of 60', () => {
      for (const format of ['wide', 'square'] as const) {
        const built = model(SHARE_CASES.worst!, format)
        expect(winnerOf(built).name.size).toBe(format === 'wide' ? 56 : 64)
        expect(built.header.dates).toBe('Fr 02.10. – Fr 23.10.2026 · 4 Termine')
        expect(built.header.event.lines).toEqual(format === 'wide' ? [WORST_EVENT] : ['Das ganz große Herbstturnier', 'aller Nachbarn im Hause am See'])
      }
    })
  })
})
