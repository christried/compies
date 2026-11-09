import type { GameList } from '~~/shared/game'

/** The last library list the browser showed, kept while no browser is mounted (see `useGameLibrary`). */
const STALE_KEY = 'game-library'
/** The fetch key of the library list; `refreshGameLibrary` refreshes it by this key. */
const GAMES_KEY = 'games'

/**
 * The library list (`/api/games`: every game the viewer may see, #173), for the game browser and the game form's Tag
 * suggestions (#335). Stale while revalidating: Nuxt purges a fetch's data when its last consumer unmounts, and the two
 * pool steps mount and unmount one browser each, so the list would flash a skeleton on every step. The list is therefore
 * also kept in state: the browser shows it at once and the fetch on mount replaces it. `games` is null only before the
 * first answer.
 */
export function useGameLibrary() {
  const stale = useState<GameList | null>(STALE_KEY, () => null)
  const { data, status, error, refresh } = useFetch<GameList>('/api/games', { key: GAMES_KEY })
  watch(data, (list) => {
    if (list) stale.value = list
  }, { immediate: true })

  const current = computed(() => data.value ?? stale.value)
  return {
    games: computed(() => current.value?.games ?? null),
    // No Tags in use before the first answer; every answer carries them (GameList).
    tagsInUse: computed(() => current.value?.tagsInUse ?? []),
    status,
    error,
    refresh,
  }
}

/** After a game was made or edited: the list in a mounted browser reloads in place, and one that mounts later starts from a fresh load. */
export async function refreshGameLibrary() {
  useState<GameList | null>(STALE_KEY, () => null).value = null
  await refreshNuxtData(GAMES_KEY)
}
