import { asRecord } from './record'
import { characterCount } from './text'
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

/** Whether a pool game came whole, as the Host gets it (the notes are there, even when null), or as the face only. */
export function isFullPoolGame(game: PoolGame | PoolGameFace): game is PoolGame {
  return 'notes' in game
}

/** A game as the library shows it (GET /api/games, GET /api/games/:id, POST answers). Times are UTC ISO strings. */
export interface GameView extends PoolGame {
  /** `name` is the display name if the User set one, like Event members. */
  createdBy: { id: string, name: string }
  createdAt: string
  /** Whether the viewer may edit it (canEditGame). */
  canEdit: boolean
}

/** Every game the viewer may see, by name (GET /api/games, #173). The browser filters them (`filterGames`) and knows the length. */
export interface GameList {
  games: GameView[]
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
}

export type GameInputError = 'invalid_game_name' | 'invalid_youtube' | 'invalid_clip' | 'invalid_players' | 'invalid_suitabilities' | 'invalid_game_notes'

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

  return {
    ok: true,
    game: { name, youtubeId, clipStart, clipLength, playersMin: players.min, playersMax: players.max, suitabilities, notes },
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
