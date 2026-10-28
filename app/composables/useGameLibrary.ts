import type { GameList } from '~~/shared/game'

/**
 * The library list (`/api/games`, key `games`), shared by everything that shows it. Nuxt purges a key's data when its
 * last consumer unmounts, so the pool picker alone would load the list again on every pool step (a skeleton flash,
 * #146). A page that holds the key too (the stepper, the settings editor) keeps the data across those steps.
 */
export function useGameLibrary() {
  return useFetch<GameList>('/api/games', { key: 'games' })
}
