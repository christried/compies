import { apiFailure } from '~/utils/api-error'
import { canSeeLibrary, type GameView } from '~~/shared/game'

/** The fetch key of one game; a page that changed it refreshes it by this key. */
export const libraryGameKey = (id: string) => `game-${id}`

/**
 * One library game for the detail and edit pages (N2): who may see the library (`viewer`), the game, and `missing`
 * for an unknown id. Those who may not see the library never fetch, so the page shows the Construction page for
 * them and for a missing game alike.
 */
export function useLibraryGame(id: Ref<string>) {
  const user = useAuthUser()
  const viewer = computed(() => canSeeLibrary(user.value))
  const { data: game, status, error, refresh } = useFetch<GameView>(() => `/api/games/${id.value}`, {
    key: libraryGameKey(id.value),
    immediate: viewer.value,
  })
  const missing = computed(() => apiFailure(error.value).status === 404)
  return { viewer, game, status, error, refresh, missing }
}
