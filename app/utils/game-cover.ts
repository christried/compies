import type { PoolGameFace } from '~~/shared/game'
import { youTubeThumbnail } from '~~/shared/youtube'

/**
 * The picture of a game (#141, #443): the uploaded image, else the Clip's YouTube thumbnail, else null (the placeholder). One rule
 * for the card, the tile, the game dialog and the library entry.
 */
export function gameCover(game: Pick<PoolGameFace, 'imageUrl' | 'youtubeId'>): string | null {
  return game.imageUrl ?? (game.youtubeId ? youTubeThumbnail(game.youtubeId) : null)
}
