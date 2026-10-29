import { NO_FILTERS, SUITABILITIES, parsePlayerCount, type GameFilters } from '~~/shared/game'

/**
 * The game browser's filters kept in the address (`q`, `players`, `suitability`, `mine=1`), for the library page: reload
 * and back keep them (#142, #173). The state is local, so the list follows every keystroke and every chip at once; the
 * address follows it: a chip writes it at once (push), the search after a short pause (replace, no history entry per
 * letter). Back and forward change the address, and the state follows it.
 */
export function useRouteFilters() {
  const route = useRoute()
  const router = useRouter()

  function param(name: string): string {
    const value = route.query[name]
    return typeof value === 'string' ? value : ''
  }
  function fromAddress(): GameFilters {
    const suitability = param('suitability')
    return {
      ...NO_FILTERS,
      q: param('q'),
      players: parsePlayerCount(param('players')),
      suitability: SUITABILITIES.find(known => known === suitability) ?? null,
      mine: param('mine') === '1',
    }
  }

  const state = ref(fromAddress())
  const addressKey = computed(() => JSON.stringify(fromAddress()))
  watch(addressKey, () => {
    const address = fromAddress()
    // Only what the address says differently: the search text keeps its spaces while the address holds it trimmed.
    state.value = { ...address, q: address.q === state.value.q.trim() ? state.value.q : address.q }
  })

  let timer: ReturnType<typeof setTimeout> | undefined
  onBeforeUnmount(() => clearTimeout(timer))

  function write(changes: Record<string, string | undefined>, mode: 'push' | 'replace') {
    const next = { query: { ...route.query, ...changes } }
    if (mode === 'replace') router.replace(next)
    else router.push(next)
  }

  return computed<GameFilters>({
    get: () => state.value,
    set: (next) => {
      const was = state.value
      state.value = next
      clearTimeout(timer)

      const changes: Record<string, string | undefined> = {}
      if (next.players !== was.players) changes.players = next.players === null ? undefined : String(next.players)
      if (next.suitability !== was.suitability) changes.suitability = next.suitability ?? undefined
      if (next.mine !== was.mine) changes.mine = next.mine ? '1' : undefined
      const q = next.q.trim() || undefined

      if (Object.keys(changes).length > 0) {
        // The search goes along (it may still be waiting for its pause, and „Alle“ clears it too): one history entry.
        write({ ...changes, q }, 'push')
      }
      else if (next.q !== was.q) {
        timer = setTimeout(() => write({ q }, 'replace'), 250)
      }
    },
  })
}
