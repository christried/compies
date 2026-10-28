import {
  CLIP_LENGTH_DEFAULT, CLIP_LENGTH_MAX, CLIP_LENGTH_MIN, CLIP_START_MAX, GAME_NAME_MAX, PLAYERS_MAX,
} from '../../shared/game'
import { FORMATS, type Format } from '../../shared/settings'
import { characterCount } from '../../shared/text'
import { parseYouTubeId } from '../../shared/youtube'

// Game input rules for the library (#141, brief §15). The field parsers are exported so the edit
// route (#142) and the player count and Format fields it adds reuse them.

export type GameInputError = 'invalid_game_name' | 'invalid_youtube' | 'invalid_clip' | 'invalid_players' | 'invalid_formats'

/** What the create form sends, validated: the video id is parsed from the link, the clip has its defaults. */
export interface GameInput {
  name: string
  youtubeId: string | null
  clipStart: number
  clipLength: number
  /** Recommended player count, both optional (#142). */
  playersMin: number | null
  playersMax: number | null
  /** Suitable Formats in FORMATS order, without duplicates (#142). */
  formats: Format[]
}

/** The game name: trimmed, 1 to GAME_NAME_MAX characters (emoji count as one). Null when invalid. */
export function parseGameName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const length = characterCount(raw.trim())
  return length >= 1 && length <= GAME_NAME_MAX ? raw.trim() : null
}

/** The video id of the pasted link. Absent, null or empty means no clip (null id); undefined when the link is no YouTube link. */
export function parseYoutubeField(raw: unknown): string | null | undefined {
  if (raw === undefined || raw === null || raw === '') return null
  if (typeof raw !== 'string') return undefined
  return parseYouTubeId(raw) ?? undefined
}

/** A whole number from `min` to `max`; `fallback` when the field is absent. Undefined when it is anything else. */
export function parseWholeNumber(raw: unknown, min: number, max: number, fallback: number): number | undefined {
  if (raw === undefined) return fallback
  return typeof raw === 'number' && Number.isInteger(raw) && raw >= min && raw <= max ? raw : undefined
}

/** A recommended player count: absent or null is open, else a whole number 1 to 99. Undefined when it is anything else. */
function parsePlayerBound(raw: unknown): number | null | undefined {
  if (raw === undefined || raw === null) return null
  return typeof raw === 'number' && Number.isInteger(raw) && raw >= 1 && raw <= PLAYERS_MAX ? raw : undefined
}

/** The recommended player count, both bounds optional and min ≤ max when both are set. Null bounds when absent. */
export function parsePlayers(body: Record<string, unknown>): { min: number | null, max: number | null } | undefined {
  const min = parsePlayerBound(body.playersMin)
  const max = parsePlayerBound(body.playersMax)
  if (min === undefined || max === undefined) return undefined
  if (min !== null && max !== null && min > max) return undefined
  return { min, max }
}

/** The Formats of a game: absent is none; else distinct values from FORMATS, stored in FORMATS order. Undefined when invalid. */
export function parseFormats(raw: unknown): Format[] | undefined {
  if (raw === undefined) return []
  if (!Array.isArray(raw)) return undefined
  if (!raw.every(format => (FORMATS as readonly unknown[]).includes(format))) return undefined
  if (new Set(raw).size !== raw.length) return undefined
  return FORMATS.filter(format => raw.includes(format))
}

export function parseGameInput(input: unknown): { ok: true, game: GameInput } | { ok: false, error: GameInputError } {
  const body = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>

  const name = parseGameName(body.name)
  if (name === null) return { ok: false, error: 'invalid_game_name' }

  const youtubeId = parseYoutubeField(body.youtubeUrl)
  if (youtubeId === undefined) return { ok: false, error: 'invalid_youtube' }

  const clipStart = parseWholeNumber(body.clipStart, 0, CLIP_START_MAX, 0)
  const clipLength = parseWholeNumber(body.clipLength, CLIP_LENGTH_MIN, CLIP_LENGTH_MAX, CLIP_LENGTH_DEFAULT)
  if (clipStart === undefined || clipLength === undefined) return { ok: false, error: 'invalid_clip' }

  const players = parsePlayers(body)
  if (!players) return { ok: false, error: 'invalid_players' }

  const formats = parseFormats(body.formats)
  if (!formats) return { ok: false, error: 'invalid_formats' }

  return {
    ok: true,
    game: { name, youtubeId, clipStart, clipLength, playersMin: players.min, playersMax: players.max, formats },
  }
}

/** What the library's filters keep (#142). Empty or unknown values mean no filter. */
export interface GameFilters {
  /** Trimmed name search; null when empty. */
  q: string | null
  /** Player count to cover; null when absent or not a whole number from 1 to 99. */
  players: number | null
  format: Format | null
  /** Only the viewer's own games. */
  mine: boolean
}

/** Reads the library's query string: `q`, `players`, `format` and `mine=1`. Anything else is ignored. */
export function parseGameFilters(query: Record<string, unknown>): GameFilters {
  const q = typeof query.q === 'string' ? query.q.trim() : ''
  const players = typeof query.players === 'string' && /^\d{1,2}$/.test(query.players) ? Number(query.players) : NaN
  const format = (FORMATS as readonly unknown[]).includes(query.format) ? query.format as Format : null
  return {
    q: q === '' ? null : q,
    players: players >= 1 && players <= PLAYERS_MAX ? players : null,
    format,
    mine: query.mine === '1',
  }
}

/** Escapes LIKE wildcards, so the search text matches itself (`%` and `_` are plain characters). */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, '\\$&')
}
