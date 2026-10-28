import { parsePlayerCount, SUITABILITIES, type Suitability } from '../../shared/game'

// The library's filters (#142, #171): what the query string of GET /api/games keeps. The input rules of a
// game (name, clip, player count, Suitabilities) are shared with the form and live in shared/game.ts.

/** What the library's filters keep (#142). Empty or unknown values mean no filter. */
export interface GameFilters {
  /** Trimmed name search; null when empty. */
  q: string | null
  /** Player count to cover; null when absent or not a whole number from 1 to 99. */
  players: number | null
  /** A Suitability the game must have; null for no filter (#171). */
  suitability: Suitability | null
  /** Only the viewer's own games. */
  mine: boolean
}

/** Reads the library's query string: `q`, `players`, `suitability` and `mine=1`. Anything else is ignored. */
export function parseGameFilters(query: Record<string, unknown>): GameFilters {
  const q = typeof query.q === 'string' ? query.q.trim() : ''
  const players = typeof query.players === 'string' ? parsePlayerCount(query.players) : null
  const suitability = (SUITABILITIES as readonly unknown[]).includes(query.suitability) ? query.suitability as Suitability : null
  return {
    q: q === '' ? null : q,
    players,
    suitability,
    mine: query.mine === '1',
  }
}

/** Escapes LIKE wildcards, so the search text matches itself (`%` and `_` are plain characters). */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, '\\$&')
}
