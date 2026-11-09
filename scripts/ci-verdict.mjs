/**
 * What a completed CI run means (#388): a failed run GitHub never gave a job is a start failure, not a red run. A
 * cancelled run with zero jobs is red: someone cancelled it, and a re-run would undo that.
 */
export function verdict(run, jobCount) {
  if (run.conclusion === 'success') return 'green'
  return run.conclusion === 'failure' && jobCount === 0 ? 'start-failure' : 'red'
}

/**
 * What ci-wait does with a completed run (#388): 'green' and 'red' as the verdict says; a start failure is re-run once
 * ('rerun'), then reported as 'twice'. A run was re-run already when this call did it (`alreadyRerun`) or an earlier
 * call did, which GitHub shows as an attempt number above 1.
 */
export function rerunDecision(run, jobCount, alreadyRerun) {
  const result = verdict(run, jobCount)
  if (result !== 'start-failure') return result
  return alreadyRerun || (run.attempt ?? 1) > 1 ? 'twice' : 'rerun'
}
