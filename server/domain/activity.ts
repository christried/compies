import { parsePageQuery } from './paging'

// The feed's query (#159, spec #153 § API contracts) is the paged read's query: `before` is the id of an entry, `limit` the page size (domain/paging.ts).

/** The feed's query string, read: the cursor and the page size, or the error the request earns. */
export function parseActivityQuery(query: { before?: unknown, limit?: unknown }) {
  return parsePageQuery(query)
}
