// Waits for the CI runs of one commit and says whether `check` passed (retro 0.7). CI runs on every pushed branch, so
// an implementer's head gets the full suite and the build without loading this machine (docs/agents/implementer-frame.md).
//
//   node scripts/ci-wait.mjs [sha] [--until-done]    (default: HEAD, which must be pushed)
//
// Exit 0: every CI run of the commit passed. Exit 1: one failed or was cancelled (the failing step's output follows,
// cut to its failures), or no run appeared within two minutes. Exit 2: CI is still running after 2.5 minutes, so run it
// again. One call stays under the 3 minutes after which Claude Code moves a command to the background: that ends the
// agent's turn and wakes the orchestrator with an interim notice (three times in session 7 of 0.8, retro 0.8).
// `--until-done` is for a call that already runs in the background (the orchestrator's): it waits up to 20 minutes, so a
// 6-minute run ends in one notification instead of a failed one every 2.5 minutes (retro 0.10).
// A run that completed as a failure with zero jobs is a GitHub start failure (annotation „workflow file issue“, twice on
// 2026-11-09 with ci.yml unchanged), not a red run: the script re-runs it once with `gh run rerun` and keeps waiting; a
// second one exits 1 with the run's URL. A later call recognises the single re-run by the run's attempt number (retro 0.10, #388).
// It prints one line while waiting, not a progress log.
import { execFileSync } from 'node:child_process'
import { rerunDecision } from './ci-verdict.mjs'

const args = process.argv.slice(2)
const untilDone = args.includes('--until-done')
// `gh run list --commit` matches the full SHA only.
const sha = execFileSync('git', ['rev-parse', args.find(arg => !arg.startsWith('--')) ?? 'HEAD'], { encoding: 'utf8' }).trim()
const POLL_MS = 15_000
const APPEAR_MS = 120_000
const RERUN_SETTLE_MS = 30_000
const CALL_MS = untilDone ? 20 * 60_000 : 150_000

const gh = (...args) => execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
// A failed gh call ends the script in one line naming the run (#388), not with a stack trace that hides the URL.
const fail = (what, error) => {
  console.log(`${what}: ${String(error.stderr || error.message).trim().split('\n')[0]}`)
  process.exit(1)
}
const jobCountOf = (run) => {
  try {
    return Number(gh('api', `repos/{owner}/{repo}/actions/runs/${run.databaseId}/jobs`, '--jq', '.total_count'))
  }
  catch (error) {
    return fail(`jobs count failed for ${run.url}`, error)
  }
}
const runsOf = () => JSON.parse(gh('run', 'list', '--workflow', 'ci.yml', '--commit', sha, '--json', 'databaseId,status,conclusion,event,url,attempt'))

/** The failing step's log from its first failure marker on, without the job/step/timestamp prefix and colour codes. */
function failures(id) {
  const lines = gh('run', 'view', String(id), '--log-failed')
    .split('\n')
    // The log writes colour codes either as escapes or as a literal caret „^[“.
    .map(line => line.replace(/^[^\t]*\t[^\t]*\t\S+ ?/, '').replace(new RegExp(`(?:${String.fromCharCode(27)}|\\^\\[)\\[[0-9;]*m`, 'g'), ''))
  const start = lines.findIndex(line => /Failed Tests|Unhandled Error|error TS\d+|ERR_PNPM|✖ \d+ problems?|Unused (files|exports|dependencies)/.test(line))
  return (start === -1 ? lines.slice(-60) : lines.slice(start, start + 80)).join('\n')
}

const started = Date.now()
let runs = []
// Run id → the time of its re-run after a start failure. A re-run keeps the run id; for a moment the list may still
// show the old completed state, which does not count as done.
const rerunAt = new Map()
// The jobs are counted for a failed run only.
const decisionOf = run => rerunDecision(run, run.conclusion === 'success' ? 1 : jobCountOf(run), rerunAt.has(run.databaseId))
const done = run => run.status === 'completed' && !(Date.now() - (rerunAt.get(run.databaseId) ?? -Infinity) < RERUN_SETTLE_MS)
console.log(`waiting for CI on ${sha.slice(0, 7)} …`)
while (Date.now() - started < CALL_MS) {
  runs = runsOf()
  if (runs.length === 0 && Date.now() - started > APPEAR_MS) {
    console.log('No CI run appeared for this commit. Is it pushed?')
    process.exit(1)
  }
  if (runs.length > 0 && runs.every(done)) {
    const fresh = runs.filter(run => decisionOf(run) === 'rerun')
    if (fresh.length === 0) break
    for (const run of fresh) {
      console.log(`start failure (zero jobs): ${run.event} ${run.url} – re-running once`)
      try {
        gh('run', 'rerun', String(run.databaseId))
      }
      catch (error) {
        fail(`re-run failed for ${run.url}`, error)
      }
      rerunAt.set(run.databaseId, Date.now())
    }
  }
  await sleep(POLL_MS)
}

if (runs.length === 0) {
  console.log('No CI run appeared for this commit. Is it pushed?')
  process.exit(1)
}
if (!runs.every(done)) {
  console.log(`CI is still running on ${sha.slice(0, 7)}: run this again.`)
  process.exit(2)
}
const red = runs.filter(run => run.conclusion !== 'success')
if (red.length === 0) {
  console.log(`green: ${runs.map(run => run.event).join(', ')}`)
  process.exit(0)
}
for (const run of red) {
  // Re-run once already (by this call or an earlier one): there is no job log to show.
  if (decisionOf(run) === 'twice') {
    console.log(`start failure (zero jobs) twice: ${run.event} ${run.url}`)
    continue
  }
  console.log(`${run.conclusion}: ${run.event} ${run.url}`)
  if (run.conclusion === 'failure') console.log(failures(run.databaseId))
}
process.exit(1)
