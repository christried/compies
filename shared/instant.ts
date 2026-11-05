// One home of an instant as the rules receive it (#261, Standards N8, Quality Q13). Imports nothing, so the rule modules that
// take an instant (session-state, coin, countdown, clip, rounds) can all import it without a cycle.

/** A point in time as the layers hold it: ms since the epoch, a `Date` (database rows) or an ISO string (the Event read). */
export type Instant = number | Date | string

/** An instant as epoch ms. */
export const msOf = (at: Instant): number => (typeof at === 'number' ? at : new Date(at).getTime())
