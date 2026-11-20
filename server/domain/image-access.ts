import { canSeeLibrary } from '../../shared/game'
import { canSeeGame, type GameFacts } from './pool-preview'

/**
 * The owner of an image: a signed-in viewer with the Host permission who made a game row with its key (#723, ADR 0018).
 * Copies share a key, so `ownerIds` is the `created_by` of every row that names it. The Platform admin owns nothing through their role.
 */
export function ownsImage(viewer: { id: string, canHost: boolean } | null, ownerIds: readonly string[]): boolean {
  return viewer !== null && canSeeLibrary(viewer) && ownerIds.includes(viewer.id)
}

/**
 * Who may see a game's image (#143, #148, #723). The owner (ownsImage) always. Anyone else (signed in) only as a Member of a
 * live Event whose pool holds a game with the key or whose Round has set one, and only where canSeeGame lets them see it (#183, #228).
 * Another Host and the Platform admin get nothing extra; signed out never.
 * `gameEvents` are the live Events that fit, as the facts canSeeGame asks for; it is empty for a viewer who is signed out
 * and for an owner, who needs no Event.
 */
export function canSeeImage({ viewer, ownerIds, gameEvents }: {
  viewer: { id: string, canHost: boolean } | null
  ownerIds: readonly string[]
  gameEvents: GameFacts[]
}): boolean {
  if (ownsImage(viewer, ownerIds)) return true
  if (viewer === null) return false
  return gameEvents.some(canSeeGame)
}
