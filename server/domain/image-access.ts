import { canSeeLibrary } from '../../shared/game'
import { canSeePoolGames, type PoolFacts } from './pool-preview'

/**
 * Who may see a game's image (#143, #148). Library viewers always. Anyone else (signed in) only as a Member of a
 * live Event whose pool holds the game, and only where canSeePoolGames lets them see the pool's games (#183).
 * Signed out never.
 * `poolEvents` are the live Events that fit, as the facts canSeePoolGames asks for; it is empty for a viewer who is signed out.
 */
export function canSeeImage({ viewer, poolEvents }: {
  viewer: { canHost: boolean, isAdmin: boolean } | null
  poolEvents: PoolFacts[]
}): boolean {
  if (canSeeLibrary(viewer)) return true
  if (viewer === null) return false
  return poolEvents.some(canSeePoolGames)
}
