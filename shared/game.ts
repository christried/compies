import type { Format } from './settings'

// The Game library (#141, spec #138): the rules and shapes the server and the screens share.

/** Game name: 1 to this many characters after trimming (characterCount, like Event names). */
export const GAME_NAME_MAX = 60
export const CLIP_LENGTH_DEFAULT = 30
export const CLIP_LENGTH_MIN = 5
export const CLIP_LENGTH_MAX = 60
/** Latest clip start: 11:59:59. */
export const CLIP_START_MAX = 43_199

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

export interface GameList { games: GameView[] }

/** `m:ss` (or `h:mm:ss` from one hour), for clip times: 72 → "1:12". */
export function clipTime(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(whole / 3600)
  const minutes = Math.floor((whole % 3600) / 60)
  const rest = String(whole % 60).padStart(2, '0')
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`
}
