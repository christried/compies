import { canSeeLibrary } from '../../shared/game'

/**
 * Who may see a game's image (#143). For now the library viewers; #148 adds Members of an Event whose pool
 * holds the game while the wheel is not hidden, as one more argument and branch.
 */
export function canSeeImage({ viewer }: {
  viewer: { canHost: boolean, isAdmin: boolean } | null
  game: { id: string, createdBy: string }
}): boolean {
  return canSeeLibrary(viewer)
}
