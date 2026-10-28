import { canSeeLibrary } from '../../shared/game'

/** An Event the viewer is a Member of whose Game pool or Tiebreaker pool holds the game (#148). */
export interface PoolEvent { isHost: boolean, hiddenWheel: boolean }

/**
 * Who may see a game's image (#143, #148). Library viewers always. Anyone else (signed in) only as a Member of a
 * live Event whose pool holds the game, and only while that Event's wheel is not hidden; the Host of the Event sees
 * it under a Hidden wheel too. Signed out never.
 * `poolEvents` are the live Events that fit; it is empty for a viewer who is signed out.
 */
export function canSeeImage({ viewer, poolEvents }: {
  viewer: { canHost: boolean, isAdmin: boolean } | null
  poolEvents: PoolEvent[]
}): boolean {
  if (canSeeLibrary(viewer)) return true
  if (viewer === null) return false
  // Drawn games under a Hidden wheel become visible in 1.5: that is the branch to add here.
  return poolEvents.some(({ isHost, hiddenWheel }) => isHost || !hiddenWheel)
}
