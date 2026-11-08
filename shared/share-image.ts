// The Share image of a finished Event (#313, spec #308 § The Share image model): everything the picture says, as a pure function of the
// Event read, so the rules are unit-tested and the renderer (server/utils/share-render.ts) only draws. The server builds the source from
// its section builders, the sheet passes its EventView for the alt text. The Worker does not import this file.

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
export type ShareImageSource = Pick<EventView, 'event' | 'sessions' | 'standings' | 'teams' | 'members' | 'results'>

/**
 * The strings of `de.json` the model fills: § share (the picture's own copy is `share.image`) and § team. Typed structurally, so the
 * unit test and the server pass the same file without `shared/` importing it.
 */
export interface ShareImageCopy {
  share: {
    image: {
      winsOne: string
      winsMany: string
      points: string
      pts: string
      people: string
      person: string
      games: string
      moreGames: string
      moreParty: string
      moreParties: string
      brand: string
      alt: string
      altPlace: string
      gameTied: string
      tie: { label: string, labelBoth: string, labelAll: string, alt: string, altAll: string, whoBoth: string, whoAll: string }
    }
  }
  team: { defaultName: string, colors: Record<string, string> }
}

/** One Winner of a Tie as the picture draws it (#315). */
export interface ShareTieEntry {
  team: number
  /** The Team name as drawn (no pictographs, the colour name when nothing is left). */
  name: string
  /** One line, or two broken at the space nearest the middle when the name would run past its column (names mode only). */
  lines: [string] | [string, string]
  /** Hex of the Party: the strip and the text shadow. */
  fill: string
}

/** What the picture shows of a Tie (#315, 12-siegerehrung-unentschieden § ShareImage): the Winners as names (2 or 3) or as chips (4 and more). */
export interface ShareTie {
  mode: 'names' | 'chips'
  /** „Unentschieden · 2 Sieger“, „… · beide gleichauf“ (both of 2 Parties), „… · alle 8 gleichauf“. */
  label: string
  /** The Parties on rank 1, ascending. */
  entries: ShareTieEntry[]
  /** Lilita size in px: the same for every name in names mode, the chip's size in chips mode. */
  size: number
  lead: string
  /** „14“, drawn in Bungee. */
  points: string
  tail: string
  /** The square format's sunburst in px: 340, 300, 280 for 2, 3, 4 and more Winners (the wide one stays 330). */
  burst: number
}

/** A single Winner: the picture of every Event that is not a Tie. */
export interface SingleWinner {
  /** The Party on rank 1. */
  teams: number[]
  /** The Team name. */
  name: string
  /** The name as drawn: one line, or two broken at the space nearest the middle. */
  lines: [string] | [string, string]
  /** Font size in px: 96/84/64 wide, 128/112/88 square. */
  size: number
  /** Hex of the Winner: the text shadow. */
  color: string
  lead: string
  /** „17“, drawn in Bungee. */
  points: string
  tail: string
}

/** A game's chip. `teams` = every Party on Place 1 of that Round; `color` = the lowest team's fill (the dot). */
export interface ShareChip {
  name: string
  teams: number[]
  color: string
  /** Only for a game with a Shared first place: one hex per Party in team order, at most 4 (the renderer draws them as the capsule's stripes). */
  stripes?: string[]
}

interface Base {
  format: ShareFormat
  width: number
  height: number
  /** The pill: the Event's name (the renderer ellipsises this part first, it can be 60 characters) and the rest, which is never cut. */
  pill: { event: string, rest: string }
  /** The Dates of the started Sessions (also inside `pill.rest`); null when none has one. */
  date: string | null
  /** „9 Leute“, „1 Person“; null at 0 Players. */
  people: string | null
  /** The rows under the Winner(s): the next Standings with rank >= 2, each with its own rank (2, 2, 4), as many as the layout has room for. */
  rows: { rank: number, team: number, name: string, points: number, fill: string, ink: string }[]
  moreRows: string | null
  gamesLabel: string
  chips: ShareChip[]
  moreChips: string | null
  /** The brand word the picture signs with, „Compies“ (drawn in capitals). */
  brand: string
  alt: string
}

/** Exactly one of `winner` (one Party on rank 1) and `tie` (several, #315) is set. */
export type ShareImageModel = Base & ({ tie: null, winner: SingleWinner } | { tie: ShareTie, winner: null })

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

/** The name as one line, or two when it is longer than 14 characters and has a space: broken at the space nearest the middle (a tie goes to the earlier). */
function breakName(name: string): [string] | [string, string] {
  return characterCount(name) <= ONE_LINE_MAX ? [name] : breakAtMiddle(name)
}

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

const ONE_LINE_MAX = 14
const STEP_2_MAX = 34
const SIZES: Record<ShareFormat, [number, number, number]> = { wide: [96, 84, 64], square: [128, 112, 88] }

function nameSize(name: string, format: ShareFormat): number {
  const length = characterCount(name)
  const [first, second, third] = SIZES[format]
  return length <= ONE_LINE_MAX ? first : length <= STEP_2_MAX ? second : third
}

// --- dates ---

/** The Dates of the started Sessions as one text: a day, or first to last (the year on both ends only across a New Year). */
function dateText(sessions: ShareImageSource['sessions']): string | null {
  const instants = sessions
    .filter(session => session.startedAt !== null && session.startsAt !== null)
    .map(session => new Date(session.startsAt!))
    .sort((a, b) => a.getTime() - b.getTime())
  const first = instants[0]
  const last = instants.at(-1)
  if (!first || !last) return null
  const firstDay = berlinDay(first, true)
  const lastDay = berlinDay(last, true)
  if (firstDay === lastDay) return firstDay
  const sameYear = firstDay.slice(-4) === lastDay.slice(-4)
  return `${berlinDay(first, !sameYear)} – ${lastDay}`
}

// --- the games ---

const WIDE_CHIPS_MAX = 6
const SQUARE_CHIPS_MAX = 9
// The wide row is one line that must not run off the canvas (decision 7, 12-siegerehrung-unentschieden § ShareImage): a chip is about
// name length x 8 + 36 wide plus a gap of 10, „+N weitere“ about 100, and the row has 1088 px minus the „N Spiele“ label.
const WIDE_ROW_PX = 1088
const CHIP_CHAR_PX = 8
const CHIP_FRAME_PX = 36 + 10
const MORE_CHIPS_PX = 100
const LABEL_CHAR_PX = 10
const LABEL_FRAME_PX = 14

/** The width a chip adds to the wide row beside its name: the capsule of a game with a Shared first place is 8 px a stripe. */
const CAPSULE_STRIPE_PX = 8
/** A capsule draws at most 4 stripes; a game with more Parties on Place 1 says „· n gleichauf“ in its name. */
const CAPSULE_STRIPES_MAX = 4
/** The dot every plain chip draws, a Tie's and a single Winner's alike (`chipMark` in share-render.ts); the estimate must count it on each (#315, review 0.9). */
const DOT_PX = 11

/** How many of the wide row's chips fit: add chips while they and, if games remain, „+N weitere“ fit; the first always stays. `extra` is the capsule's or dot's width. */
function wideChipCount(chips: readonly { name: string, extra: number }[], label: string): number {
  const room = WIDE_ROW_PX - (label.length * LABEL_CHAR_PX + LABEL_FRAME_PX)
  let used = 0
  let count = 0
  for (const [index, chip] of chips.slice(0, WIDE_CHIPS_MAX).entries()) {
    used += characterCount(chip.name) * CHIP_CHAR_PX + chip.extra + CHIP_FRAME_PX
    const reserve = chips.length - (index + 1) > 0 ? MORE_CHIPS_PX : 0
    if (count > 0 && used + reserve > room) break
    count += 1
  }
  return count
}

// The square wraps its chips, and three lines is what its layout has room for under a two-line name (a Winner's name over three lines or a
// long list of long names would push the sunburst over the chips). Estimated as the wide row is: a chip is about name length x 11 + 58
// wide at 22 px, the gap is 12, a line has 952 px, and „+N weitere“ (about 130 px) must fit the last line.
const SQUARE_LINE_PX = 952
const SQUARE_LINES_MAX = 3
const SQUARE_CHIP_CHAR_PX = 11
const SQUARE_CHIP_FRAME_PX = 58
const SQUARE_GAP_PX = 12
const SQUARE_MORE_PX = 130

/** The square's dot is 15 px inside the chip's frame; a capsule of n stripes is n x 11. */
const SQUARE_DOT_PX = 15
const SQUARE_STRIPE_PX = 11

/** How many of the square's chips fit its three lines; the first always stays. `stripes` > 1 is a capsule, wider than the dot. */
function squareChipCount(chips: readonly { name: string, stripes: number }[]): number {
  let line = 1
  let x = 0
  let count = 0
  for (const [index, chip] of chips.slice(0, SQUARE_CHIPS_MAX).entries()) {
    const capsule = chip.stripes > 1 ? chip.stripes * SQUARE_STRIPE_PX - SQUARE_DOT_PX : 0
    const width = characterCount(chip.name) * SQUARE_CHIP_CHAR_PX + SQUARE_CHIP_FRAME_PX + capsule
    const wraps = x > 0 && x + SQUARE_GAP_PX + width > SQUARE_LINE_PX
    const nextLine = wraps ? line + 1 : line
    const nextX = x === 0 || wraps ? width : x + SQUARE_GAP_PX + width
    const more = chips.length - (index + 1) > 0
    const tooMuch = nextLine > SQUARE_LINES_MAX || (more && nextLine === SQUARE_LINES_MAX && nextX + SQUARE_GAP_PX + SQUARE_MORE_PX > SQUARE_LINE_PX)
    if (count > 0 && tooMuch) break
    line = nextLine
    x = nextX
    count += 1
  }
  return count
}

// --- the model ---

const ROWS_MAX = 3

// The Tie (#315, 12-siegerehrung-unentschieden § ShareImage). The artboard's `share()` is the source of every number below; the wrap
// estimate and the chip widths are its own estimates, checked by looking at the pictures, not by measuring a font.
const TIE_NAMES_MAX = 3
/** Lilita size of a name by k, for the longest name <= 14, <= 22, longer characters. */
const TIE_NAME_SIZES: Record<ShareFormat, Record<2 | 3, [number, number, number]>> = {
  wide: { 2: [80, 68, 52], 3: [64, 54, 44] },
  square: { 2: [108, 92, 72], 3: [88, 74, 60] },
}
/** Lilita size of a name chip (4 Winners and more), for the longest name <= 14 and longer. */
const TIE_CHIP_SIZES: Record<ShareFormat, [number, number]> = { wide: [34, 30], square: [44, 38] }
/** How many rows names mode has room for under the Winners, by k, before a wrapping name takes some. */
const TIE_ROWS: Record<ShareFormat, Record<2 | 3, number>> = { wide: { 2: 2, 3: 2 }, square: { 2: 3, 3: 2 } }
/** The rows a wrapping name takes (the artboard: two Winners lose one, three lose two). */
const TIE_ROWS_LOST_BY_WRAP: Record<2 | 3, number> = { 2: 1, 3: 2 }
/** A name wraps when its characters x size x .47 pass the width of the names column. */
const TIE_WRAP_EM = 0.47
const TIE_WRAP_PX: Record<ShareFormat, number> = { wide: 680, square: 930 }
const TIE_CHIP_LONG_NAME = 14
/** Names mode steps its font size down twice: past ONE_LINE_MAX characters, and past this many (the artboard's three sizes). */
const TIE_NAME_STEP_2_MAX = 22
const TIE_BURST = { 2: 340, 3: 300, more: 280 }

interface TieShape { tie: ShareTie, rowsMax: number }

/** The Tie's picture without its copy: what the Winners are drawn as, how big, and how many rows are left for the other Parties. */
function tieShape(leaders: number[], nameOf: (team: number) => string, format: ShareFormat, parts: Pick<ShareTie, 'label' | 'lead' | 'points' | 'tail'>): TieShape {
  const k = leaders.length
  const drawn = leaders.map(team => ({ team, name: nameOf(team) }))
  const longest = Math.max(...drawn.map(entry => characterCount(entry.name)))
  const burst = k === 2 ? TIE_BURST[2] : k === 3 ? TIE_BURST[3] : TIE_BURST.more
  const entryOf = (entry: { team: number, name: string }, lines: ShareTieEntry['lines']): ShareTieEntry => ({ ...entry, lines, fill: teamColor(entry.team).fill })

  if (k > TIE_NAMES_MAX) {
    const size = TIE_CHIP_SIZES[format][longest <= TIE_CHIP_LONG_NAME ? 0 : 1]
    return { tie: { mode: 'chips', ...parts, entries: drawn.map(entry => entryOf(entry, [entry.name])), size, burst }, rowsMax: 0 }
  }

  const sizes = TIE_NAME_SIZES[format][k as 2 | 3]
  const size = longest <= ONE_LINE_MAX ? sizes[0] : longest <= TIE_NAME_STEP_2_MAX ? sizes[1] : sizes[2]
  const limit = TIE_WRAP_PX[format]
  const wraps = (length: number) => length * size * TIE_WRAP_EM > limit
  const entries = drawn.map(entry => entryOf(entry, wraps(characterCount(entry.name)) ? breakAtMiddle(entry.name) : [entry.name]))
  const rowsMax = Math.max(0, TIE_ROWS[format][k as 2 | 3] - (wraps(longest) ? TIE_ROWS_LOST_BY_WRAP[k as 2 | 3] : 0))
  return { tie: { mode: 'names', ...parts, entries, size, burst }, rowsMax }
}

/**
 * Everything the picture says, or null without Standings or without a Party on rank 1. One Party on rank 1 is `winner`; several are a
 * `tie` (#315, ADR 0014: every Party on rank 1 wins, no tiebreaker).
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

  const winnerPoints = standings.find(row => row.rank === 1)!.points
  const several = leaders.length > 1
  const pointsText = `${winnerPoints} ${pluralCopy(text.points, winnerPoints)}`
  const ptsOf = (points: number) => fillCopy(pluralCopy(text.pts, points), { n: points })

  const below = standings.filter(row => row.rank >= 2)
  const shape = several
    ? tieShape(leaders, team => nameOf(team, false), format, {
        label: below.length > 0
          ? fillCopy(text.tie.label, { k: leaders.length })
          : leaders.length === 2 ? text.tie.labelBoth : fillCopy(text.tie.labelAll, { k: leaders.length }),
        lead: text.winsMany,
        points: String(winnerPoints),
        tail: pluralCopy(text.points, winnerPoints),
      })
    : null
  const rows = below.slice(0, shape ? shape.rowsMax : ROWS_MAX).map((row) => {
    const { fill, ink } = teamColor(row.team)
    return { rank: row.rank, team: row.team, name: nameOf(row.team, false), points: row.points, fill, ink }
  })
  const hidden = below.length - rows.length

  const results = [...source.results].sort((a, b) => a.number - b.number)
  const gamesLabel = fillCopy(pluralCopy(text.games, results.length), { n: results.length })
  const all: ShareChip[] = results.map((result) => {
    const teams = result.places.filter(place => place.place === 1).map(place => place.team).sort((a, b) => a - b)
    const name = drawable(result.game.name)
    const chip = { name: teams.length > CAPSULE_STRIPES_MAX ? `${name} ${fillCopy(text.gameTied, { n: teams.length })}` : name, teams, color: teams[0] === undefined ? SURFACE : teamColor(teams[0]).fill }
    // A game with a Shared first place gets a capsule: one stripe per Party, at most 4.
    return teams.length > 1 ? { ...chip, stripes: teams.slice(0, CAPSULE_STRIPES_MAX).map(team => teamColor(team).fill) } : chip
  })
  const shown = format === 'wide'
    ? wideChipCount(all.map(chip => ({ name: chip.name, extra: chip.stripes ? chip.stripes.length * CAPSULE_STRIPE_PX : DOT_PX })), gamesLabel)
    : squareChipCount(all.map(chip => ({ name: chip.name, stripes: chip.stripes?.length ?? 1 })))

  const eventName = drawable(source.event.name)
  const date = dateText(source.sessions)
  const players = source.members.filter(member => member.zone === 'team').length
  const people = players === 0 ? null : players === 1 ? text.person : fillCopy(text.people, { n: players })

  const placeText = (row: { rank: number, team: number, points: number }) => fillCopy(text.altPlace, { rank: row.rank, name: nameOf(row.team, true), points: ptsOf(row.points) })
  const plainNames = joinNames(leaders.map(team => nameOf(team, true)))
  const event = source.event.name.trim()
  const alt = (shape
    // The artboard names the next three places whatever is drawn (chips mode draws none), and none when every Party won.
    ? [
        below.length === 0
          ? fillCopy(text.tie.altAll, {
              event, points: pointsText, names: plainNames,
              who: leaders.length === 2 ? text.tie.whoBoth : fillCopy(text.tie.whoAll, { k: leaders.length }),
            })
          : fillCopy(text.tie.alt, { event, points: pointsText, names: plainNames }),
        ...below.slice(0, ROWS_MAX).map(placeText),
      ]
    : [fillCopy(text.alt, { winner: plainNames, event, points: pointsText }), ...rows.map(placeText)]).join(' ')

  const base = {
    format,
    ...SHARE_SIZE[format],
    pill: { event: eventName, rest: [date, people].filter(part => part !== null).join(' · ') },
    date,
    people,
    rows,
    moreRows: hidden === 0 ? null : hidden === 1 ? text.moreParty : fillCopy(text.moreParties, { n: hidden }),
    gamesLabel,
    chips: all.slice(0, shown),
    moreChips: shown < all.length ? fillCopy(text.moreGames, { n: all.length - shown }) : null,
    brand: text.brand,
    alt,
  }
  if (shape) return { ...base, tie: shape.tie, winner: null }
  const winnerName = nameOf(first, false)
  return {
    ...base,
    tie: null,
    winner: {
      teams: leaders,
      name: winnerName,
      lines: breakName(winnerName),
      size: nameSize(winnerName, format),
      color: teamColor(first).fill,
      lead: text.winsOne,
      points: String(winnerPoints),
      tail: pluralCopy(text.points, winnerPoints),
    },
  }
}
