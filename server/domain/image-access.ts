import { canSeeLibrary } from '../../shared/game'
import { canSeeGame, type GameFacts } from './pool-preview'

/**
 * Who may see a game's image (#143, #148). Library viewers always. Anyone else (signed in) only as a Member of a
 * live Event whose pool holds the game or whose Round has set it, and only where canSeeGame lets them see it (#183, #228).
 * Signed out never.
 * `gameEvents` are the live Events that fit, as the facts canSeeGame asks for; it is empty for a viewer who is signed out.
 */
export function canSeeImage({ viewer, gameEvents }: {
  viewer: { canHost: boolean, isAdmin: boolean } | null
  gameEvents: GameFacts[]
}): boolean {
  if (canSeeLibrary(viewer)) return true
  if (viewer === null) return false
  return gameEvents.some(canSeeGame)
}
