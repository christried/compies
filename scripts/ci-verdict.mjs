/**
 * What a completed CI run means (#388): a failed run GitHub never gave a job is a start failure, not a red run. A
 * cancelled run with zero jobs is red: someone cancelled it, and a re-run would undo that, unless its branch has a newer
 * head: then a newer push cancelled it (`concurrency` in ci.yml, `cancel-in-progress`) and it is superseded (#569).
 * `newerHead` is the sha the run's branch has now (null when the branch is gone or unknown); only a cancelled run is
 * ever superseded, and a head equal to the run's own commit is no newer head.
 * @param {string | null} [newerHead]
 */
export function verdict(run, jobCount, newerHead = null) {
  if (run.conclusion === 'success') return 'green'
  if (run.conclusion === 'cancelled' && newerHead && newerHead !== run.headSha) return 'superseded'
  return run.conclusion === 'failure' && jobCount === 0 ? 'start-failure' : 'red'
}

/**
 * What ci-wait does with a completed run (#388): 'green', 'superseded' and 'red' as the verdict says; a start failure is
 * re-run once ('rerun'), then reported as 'twice'. A run was re-run already when this call did it (`alreadyRerun`) or an
 * earlier call did, which GitHub shows as an attempt number above 1.
 * @param {string | null} [newerHead]
 */
export function rerunDecision(run, jobCount, alreadyRerun, newerHead = null) {
  const result = verdict(run, jobCount, newerHead)
  if (result !== 'start-failure') return result
  return alreadyRerun || (run.attempt ?? 1) > 1 ? 'twice' : 'rerun'
}
