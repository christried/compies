import { asRecord, isRecord } from './record'
import { characterCount } from './text'
import { BERLIN_ZONE } from './time'
import { parseYouTubeId } from './youtube'

// The Game library (#141, spec #138): the rules and shapes the server and the screens share. The input rules
// live here too, so the form refuses exactly what the server refuses (#171).

/** Game name: 1 to this many characters after trimming (characterCount, like Event names). */
export const GAME_NAME_MAX = 60
export const CLIP_LENGTH_DEFAULT = 30
export const CLIP_LENGTH_MIN = 5
export const CLIP_LENGTH_MAX = 60
/** Latest clip start: 11:59:59. */
export const CLIP_START_MAX = 43_199
/** The most players a recommended count can name (#142). */
export const PLAYERS_MAX = 99
/** Game notes (#223, GLOSSARY: Game notes): at most this many characters after trimming (characterCount, #76). */
export const GAME_NOTES_MAX = 1000
/** A Tag (#335, GLOSSARY: Tag): at most this many characters after trimming (characterCount, so an emoji counts as one). */
export const TAG_MAX = 20
export const TAGS_PER_GAME_MAX = 8

/** The sources a game's Price is bought from (#337, GLOSSARY: Price), in the order the form lists them. */
export const PRICE_SOURCES = ['steam', 'epic', 'gog', 'publisher', 'steam_key', 'free_to_play', 'subscription'] as const
export type PriceSource = (typeof PRICE_SOURCES)[number]
/** The German names of the sources (UI); Free-to-play and Abo are the whole Price line when they have no amount. */
export const PRICE_SOURCE_LABELS: Record<PriceSource, string> = {
  steam: 'Steam',
  epic: 'Epic Games Store',
  gog: 'GOG',
  publisher: 'Publisher-Website',
  steam_key: 'Steam-Key',
  free_to_play: 'Free-to-play',
  subscription: 'Abo',
}
/** The most a Price can be, in cents: 999,99 € (#337). The least is 1 cent. */
export const PRICE_CENTS_MAX = 99_999

/** Suitability (GLOSSARY; UI „Passt zu“): the kinds of play a game works for, any number of them (#171). */
export const SUITABILITIES = ['teams', 'ffa', 'one_v_one'] as const
export type Suitability = (typeof SUITABILITIES)[number]

/** A clip length in seconds: a whole number from CLIP_LENGTH_MIN to CLIP_LENGTH_MAX (#171). */
export function isClipLength(seconds: unknown): seconds is number {
  return typeof seconds === 'number' && Number.isInteger(seconds) && seconds >= CLIP_LENGTH_MIN && seconds <= CLIP_LENGTH_MAX
}

/** A recommended player count: a whole number from 1 to PLAYERS_MAX (#171: one rule for the form and the server). */
export function isPlayerCount(players: unknown): players is number {
  return typeof players === 'number' && Number.isInteger(players) && players >= 1 && players <= PLAYERS_MAX
}

/** Digits as the User types them, trimmed, then the number when `isValid` takes it. Null for anything else. */
function parseDigits(text: string, isValid: (value: number) => boolean): number | null {
  const trimmed = text.trim()
  if (!/^\d+$/.test(trimmed)) return null
  const value = Number(trimmed)
  return isValid(value) ? value : null
}

/** A recommended player count as the User types it: digits, then a count from 1 to PLAYERS_MAX. Null for anything else. */
export function parsePlayerCount(text: string): number | null {
  return parseDigits(text, isPlayerCount)
}

/** A clip length as the User types it (`30`): digits, then a length from CLIP_LENGTH_MIN to CLIP_LENGTH_MAX. Null for anything else. */
export function parseClipLength(text: string): number | null {
  return parseDigits(text, isClipLength)
}

/** A game image is one WebP of the card's 16:10 cover, 512 px wide, up to about 200 kB (#143). */
export const GAME_IMAGE_MAX_BYTES = 200_000
export const GAME_IMAGE_WIDTH = 512
export const GAME_IMAGE_HEIGHT = 320

/** Library viewers: the Host permission or the Platform admin (spec #138 § API contracts). Shared so the server uses the same rule as the navigation. */
export function canSeeLibrary(viewer: { canHost: boolean, isAdmin: boolean } | null): boolean {
  return Boolean(viewer?.canHost || viewer?.isAdmin)
}

/** Library editors of one game: its creator or the Platform admin (#142 uses it; #141 already fills GameView.canEdit). */
export function canEditGame(viewer: { id: string, isAdmin: boolean }, game: { createdBy: string }): boolean {
  return viewer.isAdmin || viewer.id === game.createdBy
}

/** What GameCard shows of a game: the part of a library game that an Event's pools carry too (#146). */
export interface PoolGame {
  id: string
  name: string
  /** URL of the uploaded image (#143); null until then. */
  imageUrl: string | null
  youtubeId: string | null
  clipStart: number
  clipLength: number
  playersMin: number | null
  playersMax: number | null
  /** The Suitabilities, in SUITABILITIES order; empty when none is set (#171). */
  suitabilities: Suitability[]
  /** Game notes (#223); null = none. In a pool only the Host reads them (#224). */
  notes: string | null
}

/**
 * What a Member who may see a pool gets of its games: what draws the picture and the name, nothing else (#224). The
 * Host's pool game is the whole PoolGame. `youtubeId` is the card's thumbnail for a game without an image of its own.
 */
export type PoolGameFace = Pick<PoolGame, 'id' | 'name' | 'imageUrl' | 'youtubeId'>

/**
 * A set game as its Round shows it to every Member (#228): the whole PoolGame but the notes, which only the Host reads
 * (decided 2026-11-01, #217 comment). The player count and the clip are there because the Round card and the clip show them.
 */
export type RoundGame = Omit<PoolGame, 'notes'>

/** Whether a pool game came whole, as the Host gets it (the notes are there, even when null), or as the face only. */
export function isFullPoolGame(game: PoolGame | PoolGameFace): game is PoolGame {
  return 'notes' in game
}

/** A Tag (#335): `key` is what makes two spellings one Tag, `label` the spelling shown. */
export interface GameTag {
  key: string
  label: string
}

/** A game as the library shows it (GET /api/games, GET /api/games/:id, POST answers). Times are UTC ISO strings. */
export interface GameView extends PoolGame {
  /**
   * The game's Tags in the order the editor sent them (#335). Only the library carries them: PoolGame, PoolGameFace and
   * RoundGame do not, so no Event read, feed entry or message can name one.
   */
  tags: GameTag[]
  /**
   * The game's Price (#337), null when it has none. Only the library carries it, like `tags`: PoolGame, PoolGameFace and RoundGame
   * do not, until #338 gives it to Members.
   */
  price: GamePrice | null
  /** `name` is the display name if the User set one, like Event members. */
  createdBy: { id: string, name: string }
  createdAt: string
  /** Whether the viewer may edit it (canEditGame). */
  canEdit: boolean
}

/** Every game the viewer may see, by name (GET /api/games, #173). The browser filters them (`filterGames`) and knows the length. */
export interface GameList {
  games: GameView[]
  /** Every Tag some game carries, once per key with the label of its earliest row, by key (#335): the form's suggestions and the filter. */
  tagsInUse: GameTag[]
}

/** What the game browser filters by (#142, #171, #173). Empty, null and false mean no filter. */
export interface GameFilters {
  /** Name search, as typed. */
  q: string
  /** Player count the recommended range must cover. */
  players: number | null
  /** A Suitability the game must have. */
  suitability: Suitability | null
  /** Only the viewer's own games („Von mir“). */
  mine: boolean
}

export const NO_FILTERS: GameFilters = { q: '', players: null, suitability: null, mine: false }

/**
 * The games the filters keep, combined with AND: a name search (trimmed, without regard to case, `%` and `_` are plain
 * characters), a player count the recommended range covers (a game without any count never matches one), a
 * Suitability and the viewer's own games. One function for the library and both pool pickers (#173).
 */
export function filterGames(games: GameView[], filters: GameFilters, viewerId: string): GameView[] {
  const text = filters.q.trim().toLocaleLowerCase('de')
  const { players, suitability } = filters
  return games.filter((game) => {
    if (text && !game.name.toLocaleLowerCase('de').includes(text)) return false
    if (players !== null) {
      const { playersMin: min, playersMax: max } = game
      if ((min === null && max === null) || (min !== null && min > players) || (max !== null && max < players)) return false
    }
    if (suitability !== null && !game.suitabilities.includes(suitability)) return false
    return !filters.mine || game.createdBy.id === viewerId
  })
}

/** What is wrong with a game name: empty after trimming, or longer than GAME_NAME_MAX characters (an emoji counts as one). Null when fine. */
export function gameNameProblem(raw: string): 'empty' | 'too_long' | null {
  const length = characterCount(raw.trim())
  if (length === 0) return 'empty'
  return length > GAME_NAME_MAX ? 'too_long' : null
}

/** The game name: trimmed, 1 to GAME_NAME_MAX characters. Null when invalid. */
export function parseGameName(raw: unknown): string | null {
  if (typeof raw !== 'string' || gameNameProblem(raw) !== null) return null
  return raw.trim()
}

/** What is wrong with the game notes: longer than GAME_NOTES_MAX characters once trimmed. Null when fine. */
export function gameNotesProblem(raw: string): 'too_long' | null {
  return characterCount(raw.trim()) > GAME_NOTES_MAX ? 'too_long' : null
}

/** The game notes (#223): absent, null or empty is none; trimmed, blank is none; inner line breaks stay. Undefined for anything else or too long. */
export function parseGameNotes(raw: unknown): string | null | undefined {
  if (raw === undefined || raw === null || raw === '') return null
  if (typeof raw !== 'string') return undefined
  const trimmed = raw.trim()
  if (trimmed === '') return null
  return gameNotesProblem(trimmed) === null ? trimmed : undefined
}

/** A Tag as typed: NFC, trimmed, inner whitespace collapsed to one space (the label), lower-cased for the key. Null when nothing is left. No length check (see tagProblem). */
export function normaliseTag(raw: string): GameTag | null {
  const label = raw.normalize('NFC').trim().replace(/\s+/g, ' ')
  return label === '' ? null : { key: label.toLocaleLowerCase('de'), label }
}

/** What is wrong with a Tag: nothing left after normalising, or longer than TAG_MAX characters. Null when fine (#335). */
export function tagProblem(raw: string): 'empty' | 'too_long' | null {
  const tag = normaliseTag(raw)
  if (!tag) return 'empty'
  return characterCount(tag.label) > TAG_MAX ? 'too_long' : null
}

/** The Tags of a game (#335): a list of up to TAGS_PER_GAME_MAX strings that are no problem and no key twice, in the order sent. Undefined for anything else. */
export function parseTags(raw: unknown): GameTag[] | undefined {
  if (!Array.isArray(raw) || raw.length > TAGS_PER_GAME_MAX) return undefined
  const tags: GameTag[] = []
  for (const item of raw) {
    if (typeof item !== 'string' || tagProblem(item) !== null) return undefined
    tags.push(normaliseTag(item)!)
  }
  return new Set(tags.map(tag => tag.key)).size === tags.length ? tags : undefined
}

/** A Price as the form and the server read it (#337): `cents` is null exactly for Free-to-play and Abo. */
export interface GamePriceInput {
  cents: number | null
  source: PriceSource
}

/** A Price as the library shows it (#337): its amount, source and the UTC instant (ISO string) the day was last checked. */
export interface GamePrice extends GamePriceInput {
  checkedAt: string
}

/** A source that takes an amount: every one but Free-to-play and Abo (#337). */
export function priceTakesAmount(source: PriceSource): boolean {
  return source !== 'free_to_play' && source !== 'subscription'
}

/**
 * A Price as the User types it (`19,99`, `19.99`, `20`): euros with at most two decimals, from 0,01 to 999,99, as cents. Null for anything else.
 * @public Used by the price form and the cards (Part B of #337); Part B removes this tag.
 */
export function parsePriceAmount(text: string): number | null {
  const match = /^(\d{1,6})(?:[.,](\d{1,2}))?$/.exec(text.trim())
  if (!match) return null
  const cents = Number(match[1]) * 100 + Number((match[2] ?? '0').padEnd(2, '0'))
  return cents >= 1 && cents <= PRICE_CENTS_MAX ? cents : null
}

/** Cents as the form writes them: two decimals after a comma, no currency sign (1999 → „19,99“). Compared as integers, never formatted from a float. */
export function formatPriceAmount(cents: number): string {
  return `${Math.floor(cents / 100)},${String(cents % 100).padStart(2, '0')}`
}

function isPriceSource(value: unknown): value is PriceSource {
  return (PRICE_SOURCES as readonly unknown[]).includes(value)
}

function isPriceCents(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= PRICE_CENTS_MAX
}

/**
 * A Price of a request body (#337): null for no Price, the Price when it is whole, undefined when it is not. An amount needs a
 * source, and a source with an amount must take one. The caller reads an absent `price` as the game's own, as it does for `tags`.
 */
export function parsePrice(raw: unknown): GamePriceInput | null | undefined {
  if (raw === null) return null
  if (!isRecord(raw)) return undefined
  const { source, cents } = raw
  const hasCents = cents !== undefined && cents !== null
  if (source === undefined || source === null) return hasCents ? undefined : null
  if (!isPriceSource(source)) return undefined
  if (!priceTakesAmount(source)) return hasCents ? undefined : { cents: null, source }
  return isPriceCents(cents) ? { cents, source } : undefined
}

const PRICE_DAY_FORMAT = new Intl.DateTimeFormat('de-DE', { timeZone: BERLIN_ZONE, day: 'numeric', month: 'long', year: 'numeric' })
const PRICE_SHORT_DAY_FORMAT = new Intl.DateTimeFormat('de-DE', { timeZone: BERLIN_ZONE, day: 'numeric', month: 'short' })
const PRICE_YEAR_FORMAT = new Intl.DateTimeFormat('de-DE', { timeZone: BERLIN_ZONE, year: 'numeric' })

/**
 * The day a Price was checked, in full, in Berlin (the form's „Stand: 3. November 2026“).
 * @public Used by the price form and the cards (Part B of #337); Part B removes this tag.
 */
export function priceCheckedDay(checkedAt: string): string {
  return PRICE_DAY_FORMAT.format(new Date(checkedAt))
}

/**
 * The Price line of a game (#337, UI): „19,99 € bei Steam · Stand 3. Nov.“, „Free-to-play · Stand 3. Nov.“, „Abo · Stand 3. Nov.“.
 * The year follows the day only when the day is not in the current Berlin year. `now` is a parameter, so tests never read the clock.
 * @public Used by the price form and the cards (Part B of #337); Part B removes this tag.
 */
export function priceLine(price: GamePrice, now: Date): string {
  const { cents, source, checkedAt } = price
  // Free-to-play and Abo carry no amount: their label is the whole line.
  const offer = cents === null ? PRICE_SOURCE_LABELS[source] : `${formatPriceAmount(cents)} € bei ${PRICE_SOURCE_LABELS[source]}`
  const checked = new Date(checkedAt)
  const checkedYear = PRICE_YEAR_FORMAT.format(checked)
  const year = checkedYear === PRICE_YEAR_FORMAT.format(now) ? '' : ` ${checkedYear}`
  return `${offer} · Stand ${PRICE_SHORT_DAY_FORMAT.format(checked)}${year}`
}

/** The video id of the pasted link. Absent, null or empty means no clip (null id); undefined when the link is no YouTube link. */
export function parseYoutubeField(raw: unknown): string | null | undefined {
  if (raw === undefined || raw === null || raw === '') return null
  if (typeof raw !== 'string') return undefined
  return parseYouTubeId(raw) ?? undefined
}

/** A whole number from `min` to `max`; `fallback` when the field is absent. Undefined when it is anything else. */
function parseWholeNumber(raw: unknown, min: number, max: number, fallback: number): number | undefined {
  if (raw === undefined) return fallback
  return typeof raw === 'number' && Number.isInteger(raw) && raw >= min && raw <= max ? raw : undefined
}

/** A recommended player count: absent or null is open, else a whole number 1 to 99. Undefined when it is anything else. */
function parsePlayerBound(raw: unknown): number | null | undefined {
  if (raw === undefined || raw === null) return null
  return isPlayerCount(raw) ? raw : undefined
}

/** The recommended player count, both bounds optional and min ≤ max when both are set. Null bounds when absent. */
function parsePlayers(body: Record<string, unknown>): { min: number | null, max: number | null } | undefined {
  const min = parsePlayerBound(body.playersMin)
  const max = parsePlayerBound(body.playersMax)
  if (min === undefined || max === undefined) return undefined
  if (min !== null && max !== null && min > max) return undefined
  return { min, max }
}

/** The Suitabilities of a game: absent is none; else distinct values from SUITABILITIES, stored in SUITABILITIES order. Undefined when invalid. */
export function parseSuitabilities(raw: unknown): Suitability[] | undefined {
  if (raw === undefined) return []
  if (!Array.isArray(raw)) return undefined
  if (!raw.every(suitability => (SUITABILITIES as readonly unknown[]).includes(suitability))) return undefined
  if (new Set(raw).size !== raw.length) return undefined
  return SUITABILITIES.filter(suitability => raw.includes(suitability))
}

/** What the create and edit forms send, validated: the video id is parsed from the link, the clip has its defaults. */
export interface GameInput {
  name: string
  youtubeId: string | null
  clipStart: number
  clipLength: number
  /** Recommended player count, both optional (#142). */
  playersMin: number | null
  playersMax: number | null
  /** Suitabilities in SUITABILITIES order, without duplicates (#171). */
  suitabilities: Suitability[]
  /** Game notes, trimmed; null when none (#223). */
  notes: string | null
  /** The Tags sent (#335). Undefined when the body had none: a new game gets none, an edit keeps its own (a 0.9 tab never wipes them). */
  tags: GameTag[] | undefined
  /** The Price sent (#337): null clears it, undefined (no `price` in the body) keeps the game's own, as `tags` does. */
  price: GamePriceInput | null | undefined
  /** „Preis stimmt noch“ (#337): true restamps the stored Price's day without changing it; false when absent. */
  priceChecked: boolean
}

export type GameInputError = 'invalid_game_name' | 'invalid_youtube' | 'invalid_clip' | 'invalid_players' | 'invalid_suitabilities' | 'invalid_game_notes' | 'invalid_tags' | 'invalid_price'

export function parseGameInput(input: unknown): { ok: true, game: GameInput } | { ok: false, error: GameInputError } {
  const body = asRecord(input)

  const name = parseGameName(body.name)
  if (name === null) return { ok: false, error: 'invalid_game_name' }

  const youtubeId = parseYoutubeField(body.youtubeUrl)
  if (youtubeId === undefined) return { ok: false, error: 'invalid_youtube' }

  const clipStart = parseWholeNumber(body.clipStart, 0, CLIP_START_MAX, 0)
  const clipLength = parseWholeNumber(body.clipLength, CLIP_LENGTH_MIN, CLIP_LENGTH_MAX, CLIP_LENGTH_DEFAULT)
  if (clipStart === undefined || clipLength === undefined) return { ok: false, error: 'invalid_clip' }

  const players = parsePlayers(body)
  if (!players) return { ok: false, error: 'invalid_players' }

  const suitabilities = parseSuitabilities(body.suitabilities)
  if (!suitabilities) return { ok: false, error: 'invalid_suitabilities' }

  const notes = parseGameNotes(body.notes)
  if (notes === undefined) return { ok: false, error: 'invalid_game_notes' }

  const tags = body.tags === undefined ? undefined : parseTags(body.tags)
  if (body.tags !== undefined && tags === undefined) return { ok: false, error: 'invalid_tags' }

  const price = body.price === undefined ? undefined : parsePrice(body.price)
  if (body.price !== undefined && price === undefined) return { ok: false, error: 'invalid_price' }
  if (body.priceChecked !== undefined && typeof body.priceChecked !== 'boolean') return { ok: false, error: 'invalid_price' }

  return {
    ok: true,
    game: {
      name,
      youtubeId,
      clipStart,
      clipLength,
      playersMin: players.min,
      playersMax: players.max,
      suitabilities,
      notes,
      tags,
      price,
      priceChecked: body.priceChecked === true,
    },
  }
}

/** A clip start as the User types it: seconds (`72`), `m:ss` (`1:12`) or `h:mm:ss`, up to CLIP_START_MAX. Null for anything else. */
export function parseClipTime(text: string): number | null {
  const parts = text.trim().split(':')
  if (parts.length > 3 || !parts.every(part => /^\d{1,5}$/.test(part))) return null
  const numbers = parts.map(Number)
  // Seconds and, with hours, minutes stay below 60; the first part is free (`75:00` is 4500 s).
  if (numbers.slice(1).some(number => number > 59)) return null
  const seconds = numbers.reduce((total, number, index) => (index === 0 ? number : total * 60 + number), 0)
  return seconds <= CLIP_START_MAX ? seconds : null
}

/** `m:ss` (or `h:mm:ss` from one hour), for clip times: 72 → "1:12". */
export function clipTime(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(whole / 3600)
  const minutes = Math.floor((whole % 3600) / 60)
  const rest = String(whole % 60).padStart(2, '0')
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`
}
