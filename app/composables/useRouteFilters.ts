import { NO_FILTERS, SUITABILITIES, normaliseTag, parsePlayerCount, type GameFilters } from '~~/shared/game'

/**
 * The game browser's filters kept in the address (`q`, `players`, `suitability`, `tag` (the Tag's key, #336), `archived=1`; an old `mine=1` is ignored, #724),
 * for the library page: reload and back keep them (#142, #173). The rule (local state, a chip pushes, the search replaces after a pause) is
 * `useAddressState`'s, which the Archive's filters share (#885); this is what is about games.
 */
export function useRouteFilters() {
  return useAddressState<GameFilters>(
    (param) => {
      const suitability = param('suitability')
      return {
        ...NO_FILTERS,
        q: param('q'),
        players: parsePlayerCount(param('players')),
        suitability: SUITABILITIES.find(known => known === suitability) ?? null,
        // Normalised like a typed Tag, so `?tag=Co-op` finds the key `co-op`; nothing left is no filter (#336).
        tag: normaliseTag(param('tag'))?.key ?? null,
        archived: param('archived') === '1',
      }
    },
    (next, was) => {
      const changes: Record<string, string | undefined> = {}
      if (next.players !== was.players) changes.players = next.players === null ? undefined : String(next.players)
      if (next.suitability !== was.suitability) changes.suitability = next.suitability ?? undefined
      if (next.tag !== was.tag) changes.tag = next.tag ?? undefined
      if (next.archived !== was.archived) changes.archived = next.archived ? '1' : undefined
      return changes
    },
  )
}
