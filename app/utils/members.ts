/**
 * Whether a read of the Event no longer lists a Member that the read before listed: a membership ended (a deleted account in 0.21, a removal by the Host from 0.22, #697).
 * The Chat and the Activity feed read again then, since what they hold names that person by what they were (#990). A Member who joined, or a reorder, is no end.
 */
export function membershipEnded(before: readonly string[], after: readonly string[]): boolean {
  const still = new Set(after)
  return before.some(id => !still.has(id))
}
