import { parseGameSort, type GameSort } from '~~/shared/game'

/**
 * The library's sort kept in the address (#901): `sort=last_played` for „Lange nicht gespielt“, no key for „Name“ (the list as it comes).
 * A change pushes a history entry, as a filter chip does; back and forward change the sort, and the list follows the select at once.
 * `useAddressState` keeps the filters, a set of parameters with the search; the sort is one parameter, so it has its own small composable.
 */
export function useRouteSort() {
  const route = useRoute()
  const router = useRouter()
  const fromAddress = () => parseGameSort(route.query.sort)

  const state = ref<GameSort>(fromAddress())
  watch(fromAddress, (sort) => {
    state.value = sort
  })

  return computed<GameSort>({
    get: () => state.value,
    set: (next) => {
      state.value = next
      router.push({ query: { ...route.query, sort: next === 'name' ? undefined : next } })
    },
  })
}
