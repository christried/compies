import type { GameView } from '~~/shared/game'
import type { Translate } from '~/utils/settings-summary'

// The words for a game's recommended player count and Suitabilities (#142, #171, D8). Pure, with vue-i18n's `t` passed
// in, like settings-summary.ts. GameCard shows the compact count, the game page the spelled-out one.

export interface GameDescription {
  /** „2 bis 10“, „ab 2“, „bis 10“, or „2 Spieler“ for one count; null without a count. */
  players: string | null
  /** „2–10“, or the one number; null without a count. */
  playersCompact: string | null
  /** The Suitabilities („Passt zu“) in SUITABILITIES order, comma-joined: „Teams, 1 gegen 1“; null when none is set. */
  suitabilities: string | null
}

export function describeGame(game: Pick<GameView, 'playersMin' | 'playersMax' | 'suitabilities'>, t: Translate): GameDescription {
  const { playersMin: min, playersMax: max, suitabilities } = game
  let players: string | null = null
  let playersCompact: string | null = null
  if (min !== null || max !== null) {
    if (min === max) players = t('library.players', { n: min })
    else if (max === null) players = t('library.playersFrom', { min })
    else if (min === null) players = t('library.playersUpTo', { max })
    else players = t('library.playersBetween', { min, max })
    playersCompact = min === max || min === null || max === null ? String(min ?? max) : `${min}–${max}`
  }
  return {
    players,
    playersCompact,
    suitabilities: suitabilities.length > 0 ? suitabilities.map(suitability => t(`library.suitability.${suitability}`)).join(', ') : null,
  }
}
