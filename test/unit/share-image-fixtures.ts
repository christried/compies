import type { BoardTeam, DatedSessionView } from '../../shared/event'
import { standingsOf } from '../../shared/results'
import type { ShareImageSource } from '../../shared/share-image'
import type { ResultView } from '../../shared/stage'

// The Events the Share image tests read (#510): the model's unit tests build their own variations with `source`, the render test draws
// every case of SHARE_CASES in both formats (the pictures are judged by eye against 14-share-image-redesign.md, with SHARE_IMAGE_OUT set).

export const session = (startsAt: string | null, startedAt: string | null = startsAt, number: number | null = 1): DatedSessionView => ({
  id: `s-${startsAt}`, number, startsAt: startsAt ?? '', previousStartsAt: null, notes: [], startedAt, endedAt: startedAt,
})

export const result = (number: number, name: string, firsts: number[], teamCount: number): ResultView => ({
  roundId: `r${number}`,
  number,
  game: { id: `g${number}`, name, imageUrl: null, youtubeId: null, clipStart: 0, clipLength: 10, playersMin: null, playersMax: null, suitabilities: [], price: null },
  places: Array.from({ length: teamCount }, (_, index) => index + 1)
    .map(team => ({ team, place: firsts.includes(team) ? 1 : firsts.length + 1, points: 0, score: null })),
  corrected: false, correctedAt: null, resultAt: '2026-10-25T20:00:00Z',
})

export interface Options {
  /** Points per Party, index 0 = team 1. */
  points?: number[]
  names?: Record<number, string | null>
  event?: string
  sessions?: DatedSessionView[]
  /** The names and first places of the played games, in number order. */
  games?: { name: string, firsts: number[] }[]
}

export function source({ points = [17, 9], names = {}, event = 'Freitags-Zocken', sessions = [session('2026-10-24T18:00:00Z')], games = [{ name: 'Rocket League', firsts: [1] }] }: Options = {}): ShareImageSource {
  const teams: BoardTeam[] = points.map((_, index) => ({ position: index + 1, name: names[index + 1] ?? null }))
  return {
    event: { slug: 'abc', name: event, phase: 'finished', isHost: false },
    sessions,
    standings: standingsOf(points),
    teams,
    results: games.map((game, index) => result(index + 1, game.name, game.firsts, points.length)),
  }
}

const day = (date: string) => session(`${date}T18:00:00Z`)
const games = (list: [string, number[]][]) => list.map(([name, firsts]) => ({ name, firsts }))
const named = (...list: string[]) => Object.fromEntries(list.map((name, index) => [index + 1, name]))

/** Six 12-letter words, a different first letter for each team: the longest Team name the picture has to hold (77 characters). */
export const worstName = (team: number) => Array.from({ length: 6 }, () => `${String.fromCharCode(64 + team)}ranbeitsmal`).join(' ')
export const WORST_EVENT = 'Das ganz große Herbstturnier aller Nachbarn im Hause am See'
export const worstGame = (number: number) => `Ultimatives Überlebensturnier der Weltraumpiraten Teil Nr ${String(number).padStart(2, '0')}`

const kurzNames = ['Wilde Gurken', 'Nacht Eulen', 'Team Orange', 'Käse Turbo']

/** The Events of the reference (`ShareImage.dc.html`, ?st=…), the Ties of 3, 5 and 8 (#511), and the worst case the renderer must survive. */
export const SHARE_CASES: Record<string, ShareImageSource> = {
  kurz: source({
    points: [17, 15, 9, 5],
    names: named(...kurzNames),
    sessions: [day('2026-10-24')],
    games: games([['Rocket League', [1]], ['Mario Kart 8', [2]], ['Counter-Strike 2', [2]], ['Overcooked 2', [1]], ['Codenames', [3]], ['Gang Beasts', [1]]]),
  }),
  lang: source({
    event: 'Großes Herbst-Turnier der Mittwochsrunde im Vereinsheim Nord',
    points: [4, 24, 12, 19, 31, 9, 16, 27],
    names: named('Rote Rüben Racing', 'Team Orange', 'Gelbe Gefahr', 'Käse-Turbo Deluxe Edition', 'Die unaufhaltsamen Gurken vom Dach', 'Blaue Bohnen', 'Pinke Panther', 'Nachteulen aus dem dritten Stock'),
    sessions: [day('2026-10-23'), day('2026-10-24'), day('2026-10-25')],
    games: games([
      ['Rocket League', [5]], ['Mario Kart 8 Deluxe', [8]], ['Counter-Strike 2', [5]], ['Overcooked! All You Can Eat', [2]], ['Codenames', [5]], ['Gang Beasts', [4]],
      ['Super Smash Bros. Ultimate', [8]], ['Jackbox Party Pack 9', [7]], ['Fall Guys', [5]], ['Stardew Valley', [3]], ['Tetris 99', [2]], ['Brawlhalla', [5]],
    ]),
  }),
  tie2: source({
    event: 'Spieleabend bei Jonas',
    points: [15, 15, 11, 6],
    names: named(...kurzNames),
    sessions: [day('2026-11-07')],
    games: games([['Rocket League', [1]], ['Mario Kart 8', [2]], ['Codenames', [1, 2]], ['Overcooked 2', [3]], ['Gang Beasts', [2]], ['Tetris 99', [1]]]),
  }),
  tie3: source({
    event: 'Zocken im Keller',
    points: [14, 14, 14, 9, 7],
    names: named('Grüne Welle', 'Pinke Panther', 'Team Orange', 'Nacht Eulen', 'Käse Turbo'),
    sessions: [day('2026-10-31'), day('2026-11-01')],
    games: games([['Rocket League', [1]], ['Mario Kart 8', [2, 3]], ['Codenames', [3]], ['Overcooked 2', [1, 2, 3]], ['Gang Beasts', [4]], ['Tetris 99', [2]], ['Fall Guys', [1]]]),
  }),
  tie5: source({
    event: 'Silvester-Spieleturnier',
    points: [12, 12, 12, 12, 12, 8, 5],
    names: named('Wilde Gurken', 'Team Orange', 'Käse Turbo', 'Pinke Panther', 'Nacht Eulen', 'Gelbe Gefahr', 'Grüne Welle'),
    sessions: [day('2026-12-31')],
    games: games([
      ['Werwölfe', [1, 2, 3, 4, 5]], ['Rocket League', [3]], ['Mario Kart 8', [1, 4]], ['Codenames', [2]], ['Overcooked 2', [5]],
      ['Gang Beasts', [4]], ['Tetris 99', [1, 2]], ['Jackbox Party Pack 9', [3]], ['Fall Guys', [5]],
    ]),
  }),
  tie8: source({
    event: 'Das große Finale',
    points: Array(8).fill(10),
    names: named('Rote Rüben', 'Team Orange', 'Gelbe Gefahr', 'Käse Turbo', 'Grüne Welle', 'Blaue Bohnen', 'Pinke Panther', 'Nachteulen aus dem dritten Stock'),
    sessions: [day('2026-12-12')],
    games: games([['Werwölfe', [1, 2, 3, 4, 5, 6, 7, 8]], ['Codenames', [1, 2]], ['Tetris 99', [7]]]),
  }),
  worst: source({
    event: WORST_EVENT,
    points: [30, 24, 19, 15, 12, 9, 6, 3],
    names: Object.fromEntries(Array.from({ length: 8 }, (_, index) => [index + 1, worstName(index + 1)])),
    sessions: [day('2026-10-02'), day('2026-10-09'), day('2026-10-16'), day('2026-10-23')],
    games: Array.from({ length: 12 }, (_, index) => ({ name: worstGame(index + 1), firsts: [1 + (index % 8)] })),
  }),
}
