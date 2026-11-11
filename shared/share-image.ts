// The Share image of a finished Event (#313, rebuilt as the „Anzeigetafel“ in #510, note docs/design_handoff_compies/14-share-image-redesign.md):
// everything the picture says, as a pure function of the Event read, so the rules are unit-tested and the renderer
// (server/utils/share-render.ts) only draws. The server builds the source from its section builders, the sheet passes its EventView for the
// alt text. The Worker does not import this file.

import type { EventView } from './event'
import { leadersOf } from './finish'
import { joinNames } from './list'
import { berlinDay } from './time'
import { SURFACE, teamColor } from './team-colors'
import { teamDisplayName } from './team-name'
import { characterCount } from './text'

export const SHARE_FORMATS = ['wide', 'square'] as const
export type ShareFormat = (typeof SHARE_FORMATS)[number]

/** The picture's size in pixels: the OG-friendly 1200 x 630 and the 1080 square. */
export const SHARE_SIZE: Record<ShareFormat, { width: number, height: number }> = {
  wide: { width: 1200, height: 630 },
  square: { width: 1080, height: 1080 },
}

/** `unknown` until checked (the query): 'wide' or 'square', else null. An array (?format=a&format=b), '' and everything else give null. */
export function parseShareFormat(raw: unknown): ShareFormat | null {
  return SHARE_FORMATS.find(format => format === raw) ?? null
}

/** Exactly the fields of the Event read the model needs, so the server builds them from its section builders and the page passes its EventView. */
export type ShareImageSource = Pick<EventView, 'event' | 'sessions' | 'standings' | 'teams' | 'results'>

/**
 * The strings of `de.json` the model fills: § share (the picture's own copy is `share.image`) and § team. Typed structurally, so the
 * unit test and the server pass the same file without `shared/` importing it.
 */
export interface ShareImageCopy {
  share: {
    image: {
      winner: string
      standings: string
      parties: string
      points: string
      pointsLabel: string
      games: string
      moreGames: string
      moreParties: string
      datesMany: string
      brand: string
      alt: string
      altPlace: string
      gameTied: string
      tie: { label: string, labelBoth: string, labelAll: string, alt: string, altAll: string, whoBoth: string, whoAll: string }
    }
  }
  team: { defaultName: string, colors: Record<string, string> }
}

// --- the model ---

/** One line, or two broken at the space nearest the middle; the renderer draws each line as its own Line. */
export interface ShareName {
  lines: [string] | [string, string]
  /** Lilita px. */
  size: number
}

export interface ShareHeader {
  /** „Compies“ (copy), set in capitals by the renderer. */
  brand: string
  /** Pictographs stripped; wide: always one line; '' draws nothing. */
  event: ShareName
  /** § dates; null: no dates line. */
  dates: string | null
}

/** „17“ and „Punkte“ („Punkt“ at 1). */
export interface SharePoints { value: string, label: string }

export interface ShareWinnerPanel {
  kind: 'winner'
  /** „Sieger“. */
  label: string
  team: number
  /** Hex of the panel's background; the TeamMark on it is `#fffdf8` with a `#151515` symbol. */
  fill: string
  /** Hex of the text on the panel. */
  ink: string
  name: ShareName
  points: SharePoints
}

export interface ShareBand { team: number, name: string, fill: string, ink: string }

export interface ShareTiePanel {
  kind: 'tie'
  /** The tie bar's label. */
  label: string
  points: SharePoints
  /** Every Winner, ascending team. */
  bands: ShareBand[]
  /** Lilita px of every band: one constant per format for now (#511 makes it a tier by the number of Winners and the longest name). */
  size: number
}

/** A Party's row, or the „+n weitere Parteien“ line between the first rows and the last place. */
export type ShareStandingsRow
  = | { kind: 'party', rank: number, team: number, name: string, points: number, fill: string, ink: string }
    | { kind: 'more', text: string }

export interface ShareStandings {
  /** „Endstand“. */
  title: string
  /** „8 Parteien“: all Parties, the Winners included. */
  count: string
  /** The Parties with rank >= 2 under the slot rule. */
  rows: ShareStandingsRow[]
}

/** A game row: `stripe` is one hex per Party on place 1, ascending team, at most 4; `[SURFACE]` when nobody. */
export type ShareGameRow
  = | { kind: 'game', name: string, stripe: string[] }
    | { kind: 'more', text: string }

export interface ShareGames {
  /** The played games: „12 Spiele“, „1 Spiel“, „0 Spiele“. */
  label: string
  rows: ShareGameRow[]
}

export interface ShareImageModel {
  format: ShareFormat
  width: number
  height: number
  header: ShareHeader
  panel: ShareWinnerPanel | ShareTiePanel
  /** Null when every Party is on rank 1: the block is hidden. */
  standings: ShareStandings | null
  games: ShareGames
  alt: string
}

// --- copy ---

/** Fills `{name}` placeholders; a value that is missing leaves nothing behind. */
export function fillCopy(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? ''))
}

/** The form of an „einzahl | mehrzahl“ text for `n`: the first for 1, the second otherwise. A text without a pipe is returned as it is. */
export function pluralCopy(template: string, n: number): string {
  const forms = template.split('|').map(form => form.trim())
  return forms.length > 1 ? (n === 1 ? forms[0]! : forms[1]!) : template
}

// --- names ---

// The three fonts have no emoji and Satori would draw empty boxes (decision 8): pictographs, variation selectors, ZWJ, regional
// indicators (flags), skin tones and the keycap mark go before a name is measured or drawn.
// Variation selectors, skin tones and the keycap mark are "combined characters" to the rule, which is the point: they all go.
// eslint-disable-next-line no-misleading-character-class
const PICTOGRAPHS = /[\p{Extended_Pictographic}\u{FE0E}\u{FE0F}\u{200D}\u{20E3}\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}]/gu

/** `text` as the picture can draw it: no pictographs, spaces collapsed and trimmed. '' when nothing is left. */
function drawable(text: string): string {
  return text.replace(PICTOGRAPHS, '').replace(/\s+/g, ' ').trim()
}

const graphemes = new Intl.Segmenter('de', { granularity: 'grapheme' })

/** The name broken at the space nearest the middle (the earlier of two equally near), or on one line when it has no space. */
function breakAtMiddle(name: string): [string] | [string, string] {
  const parts = [...graphemes.segment(name)].map(part => part.segment)
  const middle = parts.length / 2
  let best = -1
  parts.forEach((part, index) => {
    if (part === ' ' && (best < 0 || Math.abs(index - middle) < Math.abs(best - middle))) best = index
  })
  if (best < 0) return [name]
  return [parts.slice(0, best).join(''), parts.slice(best + 1).join('')]
}

/** The Winner's name by its characters: <= 10 one line at the first size, never broken; <= 20 and longer broken at the middle at the second and third (the note's k = 1 tiers). */
const WINNER_NAME: Record<ShareFormat, [number, number, number]> = { wide: [96, 80, 56], square: [112, 92, 64] }
const WINNER_ONE_LINE_MAX = 10
const WINNER_STEP_2_MAX = 20

function winnerName(name: string, format: ShareFormat): ShareName {
  const length = characterCount(name)
  const [first, second, third] = WINNER_NAME[format]
  if (length <= WINNER_ONE_LINE_MAX) return { lines: [name], size: first }
  return { lines: breakAtMiddle(name), size: length <= WINNER_STEP_2_MAX ? second : third }
}

/** The Event's name: wide is always one line (30 px up to 40 characters, then 24); square 46 px up to 30, 34 px up to 44, and 34 px on two lines beyond. */
const EVENT_WIDE_MAX = 40
const EVENT_SQUARE_LARGE_MAX = 30
const EVENT_SQUARE_ONE_LINE_MAX = 44

function eventName(name: string, format: ShareFormat): ShareName {
  const length = characterCount(name)
  if (format === 'wide') return { lines: [name], size: length <= EVENT_WIDE_MAX ? 30 : 24 }
  if (length <= EVENT_SQUARE_LARGE_MAX) return { lines: [name], size: 46 }
  return { lines: length <= EVENT_SQUARE_ONE_LINE_MAX ? [name] : breakAtMiddle(name), size: 34 }
}

// --- dates ---

/** Up to this many days are listed; more are „first – last · n Termine“. */
const DATES_LISTED_MAX = 3

/**
 * The days of the started Sessions (distinct Berlin days, ascending): 1 to 3 joined with „ · “, the year on the last only, or on every day
 * across a New Year; 4 or more „first – last · n Termine“ with the year on the first only across a New Year.
 */
function dateText(sessions: ShareImageSource['sessions'], copy: ShareImageCopy['share']['image']): string | null {
  const instants = sessions
    .filter(session => session.startedAt !== null && session.startsAt !== null)
    .map(session => new Date(session.startsAt!))
    .sort((a, b) => a.getTime() - b.getTime())
  const days: Date[] = []
  for (const instant of instants) {
    if (days.length === 0 || berlinDay(days.at(-1)!, true) !== berlinDay(instant, true)) days.push(instant)
  }
  const first = days[0]
  const last = days.at(-1)
  if (!first || !last) return null
  const acrossYears = berlinDay(first, true).slice(-4) !== berlinDay(last, true).slice(-4)
  if (days.length > DATES_LISTED_MAX) return fillCopy(copy.datesMany, { first: berlinDay(first, acrossYears), last: berlinDay(last, true), n: days.length })
  return days.map((day, index) => berlinDay(day, acrossYears || index === days.length - 1)).join(' · ')
}

// --- the slots ---

/** Standings slots: 4 wide, 6 square. More Parties than that show the first S - 2, „+n weitere Parteien“ and the last place. */
const STANDINGS_SLOTS: Record<ShareFormat, number> = { wide: 4, square: 6 }
/** Game slots: 6 wide (3 rows of 2), 8 square. More games show slots - 1 and „+n weitere“. */
const GAME_SLOTS: Record<ShareFormat, number> = { wide: 6, square: 8 }
/** A game's stripe has at most 4 colours. */
const STRIPE_MAX = 4
/** Lilita px of every band of a Tie panel (#511 replaces this constant with the tiers of the note's table). */
const TIE_BAND_SIZE: Record<ShareFormat, number> = { wide: 28, square: 32 }

// --- the model ---

/**
 * Everything the picture says, or null without Standings or without a Party on rank 1. One Party on rank 1 is a Winner panel; several are
 * a tie panel (#315, ADR 0014: every Party on rank 1 wins, no tiebreaker).
 */
export function shareImageModel(source: ShareImageSource, format: ShareFormat, copy: ShareImageCopy): ShareImageModel | null {
  const standings = source.standings
  if (!standings || standings.length === 0) return null
  const leaders = leadersOf(standings)
  const first = leaders[0]
  if (first === undefined) return null
  const text = copy.share.image

  // The name a team is shown with, the rule of shared/team-name.ts (as `teamName` in app/utils/board.ts) with the copy this model carries;
  // the parity test in share-image.test.ts holds the two equal. Drawn names lose what the renderer cannot draw first (`drawable`).
  const teamCopy = { defaultName: (color: string) => fillCopy(copy.team.defaultName, { color }), colorName: (at: number) => copy.team.colors[at] ?? '' }
  const nameOf = (position: number, plain: boolean): string => {
    const own = source.teams.find(team => team.position === position)?.name ?? null
    return teamDisplayName(own === null ? null : plain ? own.trim() : drawable(own), position, teamCopy)
  }

  const points = standings.find(row => row.rank === 1)!.points
  const pointsOf = { value: String(points), label: pluralCopy(text.pointsLabel, points) }
  const below = standings.filter(row => row.rank >= 2)

  const panel: ShareImageModel['panel'] = leaders.length === 1
    ? { kind: 'winner', label: text.winner, team: first, ...teamColor(first), name: winnerName(nameOf(first, false), format), points: pointsOf }
    : {
        kind: 'tie',
        label: below.length > 0
          ? fillCopy(text.tie.label, { k: leaders.length })
          : leaders.length === 2 ? text.tie.labelBoth : fillCopy(text.tie.labelAll, { k: leaders.length }),
        points: pointsOf,
        bands: leaders.map(team => ({ team, name: nameOf(team, false), ...teamColor(team) })),
        size: TIE_BAND_SIZE[format],
      }

  const partyRows: ShareStandingsRow[] = below.map(row => ({ kind: 'party', rank: row.rank, team: row.team, name: nameOf(row.team, false), points: row.points, ...teamColor(row.team) }))
  const slots = STANDINGS_SLOTS[format]
  const shownRows: ShareStandingsRow[] = partyRows.length <= slots
    ? partyRows
    : [...partyRows.slice(0, slots - 2), { kind: 'more', text: fillCopy(text.moreParties, { n: partyRows.length - slots + 1 }) }, partyRows.at(-1)!]

  const results = [...source.results].sort((a, b) => a.number - b.number)
  const gameRows: ShareGameRow[] = results.map((result) => {
    const teams = result.places.filter(place => place.place === 1).map(place => place.team).sort((a, b) => a - b)
    return { kind: 'game', name: drawable(result.game.name), stripe: teams.length === 0 ? [SURFACE] : teams.slice(0, STRIPE_MAX).map(team => teamColor(team).fill) }
  })
  const gameSlots = GAME_SLOTS[format]
  const shownGames: ShareGameRow[] = gameRows.length <= gameSlots
    ? gameRows
    : [...gameRows.slice(0, gameSlots - 1), { kind: 'more', text: fillCopy(text.moreGames, { n: gameRows.length - gameSlots + 1 }) }]

  // The alt text names the Winner and place 2 (the note); a Tie names its Winners and no place. Names are the Team's own, not stripped.
  const event = source.event.name.trim()
  const pointsText = `${points} ${pluralCopy(text.points, points)}`
  const plainNames = joinNames(leaders.map(team => nameOf(team, true)))
  const second = below.filter(row => row.rank === 2).map(row => nameOf(row.team, true))
  const alt = leaders.length === 1
    ? [fillCopy(text.alt, { winner: plainNames, event, points: pointsText }), ...(second.length > 0 ? [fillCopy(text.altPlace, { rank: 2, name: joinNames(second) })] : [])].join(' ')
    : below.length === 0
      ? fillCopy(text.tie.altAll, {
          event, points: pointsText, names: plainNames,
          who: leaders.length === 2 ? text.tie.whoBoth : fillCopy(text.tie.whoAll, { k: leaders.length }),
        })
      : fillCopy(text.tie.alt, { event, points: pointsText, names: plainNames })

  return {
    format,
    ...SHARE_SIZE[format],
    header: { brand: text.brand, event: eventName(drawable(source.event.name), format), dates: dateText(source.sessions, text) },
    panel,
    standings: below.length === 0 ? null : { title: text.standings, count: fillCopy(text.parties, { n: standings.length }), rows: shownRows },
    games: { label: fillCopy(pluralCopy(text.games, results.length), { n: results.length }), rows: shownGames },
    alt,
  }
}
