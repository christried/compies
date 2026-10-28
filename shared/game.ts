import type { Format } from './settings'

// The Game library (#141, spec #138): the rules and shapes the server and the screens share.

/** Game name: 1 to this many characters after trimming (characterCount, like Event names). */
export const GAME_NAME_MAX = 60
export const CLIP_LENGTH_DEFAULT = 30
export const CLIP_LENGTH_MIN = 5
export const CLIP_LENGTH_MAX = 60
/** Latest clip start: 11:59:59. */
export const CLIP_START_MAX = 43_199
/** The most players a recommended count can name (#142). */
export const PLAYERS_MAX = 99

/** A recommended player count as the User types it: a whole number from 1 to PLAYERS_MAX. Null for anything else. */
export function parsePlayerCount(text: string): number | null {
  const trimmed = text.trim()
  if (!/^\d{1,2}$/.test(trimmed)) return null
  const players = Number(trimmed)
  return players >= 1 && players <= PLAYERS_MAX ? players : null
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

/** A game as the library shows it (GET /api/games, GET /api/games/:id, POST answers). Times are UTC ISO strings. */
export interface GameView {
  id: string
  name: string
  /** URL of the uploaded image (#143); null until then. */
  imageUrl: string | null
  youtubeId: string | null
  clipStart: number
  clipLength: number
  playersMin: number | null
  playersMax: number | null
  formats: Format[]
  /** `name` is the display name if the User set one, like Event members. */
  createdBy: { id: string, name: string }
  createdAt: string
  /** Whether the viewer may edit it (canEditGame). */
  canEdit: boolean
}

/** The games the filters keep, and `total`: every game in the library, whatever the filters (#142, for the search placeholder). */
export interface GameList {
  games: GameView[]
  total: number
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
