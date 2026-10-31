import { canSeeLibrary } from '../../shared/game'
import { canSeePoolGames } from './pool-visibility'

/** An Event the viewer is a Member of whose Game pool or Tiebreaker pool holds the game (#148). */
export interface PoolEvent { isHost: boolean, hiddenWheel: boolean | null }

/**
 * Who may see a game's image (#143, #148). Library viewers always. Anyone else (signed in) only as a Member of a
 * live Event whose pool holds the game, and only where canSeePoolGames lets them see the pool's games (#183).
 * Signed out never.
 * `poolEvents` are the live Events that fit; it is empty for a viewer who is signed out.
 */
export function canSeeImage({ viewer, poolEvents }: {
  viewer: { canHost: boolean, isAdmin: boolean } | null
  poolEvents: PoolEvent[]
}): boolean {
  if (canSeeLibrary(viewer)) return true
  if (viewer === null) return false
  return poolEvents.some(canSeePoolGames)
}
