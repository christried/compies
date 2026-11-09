/** What a completed CI run means (#388): a failed run GitHub never gave a job is a start failure, not a red run. */
export function verdict(run, jobCount) {
  if (run.conclusion === 'success') return 'green'
  return jobCount === 0 ? 'start-failure' : 'red'
}
