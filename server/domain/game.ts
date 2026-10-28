import {
  CLIP_LENGTH_DEFAULT, CLIP_LENGTH_MAX, CLIP_LENGTH_MIN, CLIP_START_MAX, GAME_NAME_MAX,
} from '../../shared/game'
import { characterCount } from '../../shared/text'
import { parseYouTubeId } from '../../shared/youtube'

// Game input rules for the library (#141, brief §15). The field parsers are exported so the edit
// route (#142) and the player count and Format fields it adds reuse them.

export type GameInputError = 'invalid_game_name' | 'invalid_youtube' | 'invalid_clip'

/** What the create form sends, validated: the video id is parsed from the link, the clip has its defaults. */
export interface GameInput {
  name: string
  youtubeId: string | null
  clipStart: number
  clipLength: number
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

export function parseGameInput(input: unknown): { ok: true, game: GameInput } | { ok: false, error: GameInputError } {
  const body = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>

  const name = parseGameName(body.name)
  if (name === null) return { ok: false, error: 'invalid_game_name' }

  const youtubeId = parseYoutubeField(body.youtubeUrl)
  if (youtubeId === undefined) return { ok: false, error: 'invalid_youtube' }

  const clipStart = parseWholeNumber(body.clipStart, 0, CLIP_START_MAX, 0)
  const clipLength = parseWholeNumber(body.clipLength, CLIP_LENGTH_MIN, CLIP_LENGTH_MAX, CLIP_LENGTH_DEFAULT)
  if (clipStart === undefined || clipLength === undefined) return { ok: false, error: 'invalid_clip' }

  return { ok: true, game: { name, youtubeId, clipStart, clipLength } }
}
