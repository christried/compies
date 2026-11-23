import { ARCHIVE_CHIPS, type ArchiveFilters } from '~~/shared/archive'

/**
 * The Archive's chip and search kept in the address (#885): `filter` = `won` or `host` (absent is „Alle“; any other value reads as „Alle“ and the address is
 * not rewritten), `q` = the search. The rule is `useAddressState`'s, the one the game browser uses too.
 */
export function useArchiveFilters() {
  return useAddressState<ArchiveFilters>(
    (param) => {
      const filter = param('filter')
      return { chip: ARCHIVE_CHIPS.find(known => known === filter) ?? 'all', q: param('q') }
    },
    (next, was) => (next.chip === was.chip ? {} : { filter: next.chip === 'all' ? undefined : next.chip }),
  )
}
