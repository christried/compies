/**
 * What `ci-wait.mjs --pr <n>` does with a PR at one poll (#565).
 *
 * pr: { state, merged, mergeCommit, draft, autoMerge, mergeableState } as the PR call gives them.
 * check: 'none' | 'running' | 'green' | 'red' | 'twice' | 'rerun' (of the PR's current head; 'none' once the PR is closed).
 *
 * Returns { kind: 'merged', commit } | { kind: 'closed' } | { kind: 'red' } | { kind: 'twice' } | { kind: 'rerun' }
 * | { kind: 'blocked', why: 'draft' | 'behind' | 'conflict' } | { kind: 'waiting', why: 'check' | 'auto-merge' | 'merge' }.
 *
 * The order matters: a merged PR is merged whatever its last run said; red tells the failure before a state advice;
 * blocked comes before waiting because auto-merge never fires on a draft, a PR behind its base (both protected branches
 * require an up-to-date head) or a conflicting one. Any other `mergeableState`, `unknown` included, never blocks: GitHub
 * computes it lazily, and `blocked` only means the checks are pending.
 */
export function prDecision(pr, check) {
  if (pr.state === 'closed') return pr.merged ? { kind: 'merged', commit: pr.mergeCommit ?? null } : { kind: 'closed' }
  if (check === 'red') return { kind: 'red' }
  if (check === 'twice') return { kind: 'twice' }
  if (check === 'rerun') return { kind: 'rerun' }
  if (pr.draft) return { kind: 'blocked', why: 'draft' }
  if (pr.mergeableState === 'behind') return { kind: 'blocked', why: 'behind' }
  if (pr.mergeableState === 'dirty') return { kind: 'blocked', why: 'conflict' }
  if (check === 'none' || check === 'running') return { kind: 'waiting', why: 'check' }
  return { kind: 'waiting', why: pr.autoMerge ? 'merge' : 'auto-merge' }
}
