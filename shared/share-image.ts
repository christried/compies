// The Share image of a finished Event (#313, spec #308 § The Share image model): everything the picture says, as a pure function of the
// Event read, so the rules are unit-tested and the renderer (server/utils/share-render.ts) only draws. The server builds the source from
// its section builders, the sheet passes its EventView for the alt text. The Worker does not import this file.

import type { EventView } from './event'
import { leadersOf } from './finish'
import { joinNames } from './list'
import { berlinDay } from './time'
import { teamColor } from './team-colors'
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
      winsOne: string, winsMany: string, points: string, pts: string, people: string, person: string, games: string, moreGames: string
      moreParty: string, moreParties: string, alt: string, altMany: string, altPlace: string
    }
  }
  team: { defaultName: string, colors: Record<string, string> }
}

export interface ShareImageModel {
  format: ShareFormat
  width: number
  height: number
  /** The pill: the Event's name (the renderer ellipsises this part first, it can be 60 characters) and the rest, which is never cut. */
  pill: { event: string, rest: string }
  /** The Dates of the started Sessions (also inside `pill.rest`); null when none has one. */
  date: string | null
  /** „9 Leute“, „1 Person“; null at 0 Players. */
  people: string | null
  winner: {
    /** The Parties on rank 1, ascending. Several = a Tie (#315 draws the real one). */
    teams: number[]
    /** The Team names joined with joinNames. */
    name: string
    /** The name as drawn: one line, or two broken at the space nearest the middle. */
    lines: [string] | [string, string]
    /** Font size in px: 96/84/64 wide, 128/112/88 square. */
    size: number
    /** Hex of the first Winner: the text shadow. */
    color: string
    lead: string
    /** „17“, drawn in Bungee. */
    points: string
    tail: string
  }
  /** Places 2 to 4: the next three Standings with rank >= 2, each with its own rank (2, 2, 4). */
  rows: { rank: number, team: number, name: string, points: number, fill: string, ink: string }[]
  moreRows: string | null
  gamesLabel: string
  /** `teams` = every Party on Place 1 of that Round; `color` = the lowest team's fill (the dot). */
  chips: { name: string, teams: number[], color: string }[]
  moreChips: string | null
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
const PICTOGRAPHS = /[\p{Extended_Pictographic}\u{FE0E}\u{FE0F}\u{200D}\u{20E3}\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}]/gu

/** `text` as the picture can draw it: no pictographs, spaces collapsed and trimmed. '' when nothing is left. */
function drawable(text: string): string {
  return text.replace(PICTOGRAPHS, '').replace(/\s+/g, ' ').trim()
}

const graphemes = new Intl.Segmenter('de', { granularity: 'grapheme' })

/** The name as one line, or two when it is longer than 14 characters and has a space: broken at the space nearest the middle (a tie goes to the earlier). */
function breakName(name: string): [string] | [string, string] {
  const parts = [...graphemes.segment(name)].map(part => part.segment)
  if (parts.length <= ONE_LINE_MAX) return [name]
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

/** How many of the wide row's chips fit: add chips while they and, if games remain, „+N weitere“ fit; the first always stays. */
function wideChipCount(names: readonly string[], label: string): number {
  const room = WIDE_ROW_PX - (label.length * LABEL_CHAR_PX + LABEL_FRAME_PX)
  let used = 0
  let count = 0
  for (const [index, name] of names.slice(0, WIDE_CHIPS_MAX).entries()) {
    used += characterCount(name) * CHIP_CHAR_PX + CHIP_FRAME_PX
    const reserve = names.length - (index + 1) > 0 ? MORE_CHIPS_PX : 0
    if (count > 0 && used + reserve > room) break
    count += 1
  }
  return count
}

// --- the model ---

const ROWS_MAX = 3

/**
 * Everything the picture says, or null without Standings or without a Party on rank 1. A Tie gets a deliberately plain interim until #315:
 * the Winners' names joined, the plural lead, the first Winner's colour, rows from the next shared rank.
 */
export function shareImageModel(source: ShareImageSource, format: ShareFormat, copy: ShareImageCopy): ShareImageModel | null {
  const standings = source.standings
  if (!standings || standings.length === 0) return null
  const leaders = leadersOf(standings)
  const first = leaders[0]
  if (first === undefined) return null
  const text = copy.share.image

  // The one place the server needs the colour-name fallback: shared/board.ts (a Worker imports it) is off-limits, so this reads the same
  // two keys as `teamName` in app/utils/board.ts; the parity test in share-image.test.ts guards it.
  const nameOf = (position: number, plain: boolean): string => {
    const own = source.teams.find(team => team.position === position)?.name ?? null
    const kept = own === null ? '' : plain ? own.trim() : drawable(own)
    return kept === '' ? fillCopy(copy.team.defaultName, { color: copy.team.colors[position] ?? '' }) : kept
  }

  const winnerName = joinNames(leaders.map(team => nameOf(team, false)))
  const winnerPoints = standings.find(row => row.team === first)!.points
  const several = leaders.length > 1
  const pointsText = `${winnerPoints} ${pluralCopy(text.points, winnerPoints)}`

  const below = standings.filter(row => row.rank >= 2)
  const rows = below.slice(0, ROWS_MAX).map((row) => {
    const { fill, ink } = teamColor(row.team)
    return { rank: row.rank, team: row.team, name: nameOf(row.team, false), points: row.points, fill, ink }
  })
  const hidden = below.length - rows.length

  const results = [...source.results].sort((a, b) => a.number - b.number)
  const gamesLabel = fillCopy(pluralCopy(text.games, results.length), { n: results.length })
  const all = results.map((result) => {
    const teams = result.places.filter(place => place.place === 1).map(place => place.team).sort((a, b) => a - b)
    return { name: drawable(result.game.name), teams, color: teams[0] === undefined ? '#fffdf8' : teamColor(teams[0]).fill }
  })
  const shown = format === 'wide' ? wideChipCount(all.map(chip => chip.name), gamesLabel) : Math.min(all.length, SQUARE_CHIPS_MAX)

  const eventName = drawable(source.event.name)
  const date = dateText(source.sessions)
  const players = source.members.filter(member => member.zone === 'team').length
  const people = players === 0 ? null : players === 1 ? text.person : fillCopy(text.people, { n: players })

  const alt = [
    fillCopy(several ? text.altMany : text.alt, {
      winner: joinNames(leaders.map(team => nameOf(team, true))),
      event: source.event.name.trim(),
      points: pointsText,
    }),
    ...rows.map(row => fillCopy(text.altPlace, { rank: row.rank, name: nameOf(row.team, true), points: fillCopy(pluralCopy(text.pts, row.points), { n: row.points }) })),
  ].join(' ')

  return {
    format,
    ...SHARE_SIZE[format],
    pill: { event: eventName, rest: [date, people].filter(part => part !== null).join(' · ') },
    date,
    people,
    winner: {
      teams: leaders,
      name: winnerName,
      lines: breakName(winnerName),
      size: nameSize(winnerName, format),
      color: teamColor(first).fill,
      lead: several ? text.winsMany : text.winsOne,
      points: String(winnerPoints),
      tail: pluralCopy(text.points, winnerPoints),
    },
    rows,
    moreRows: hidden === 0 ? null : hidden === 1 ? text.moreParty : fillCopy(text.moreParties, { n: hidden }),
    gamesLabel,
    chips: all.slice(0, shown),
    moreChips: shown < all.length ? fillCopy(text.moreGames, { n: all.length - shown }) : null,
    alt,
  }
}
