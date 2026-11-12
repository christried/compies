// Waits for the CI runs of one commit and says whether `check` passed (retro 0.7). CI runs on every pushed branch, so
// an implementer's head gets the full suite and the build without loading this machine (docs/agents/implementer-frame.md).
//
//   node scripts/ci-wait.mjs [sha] [--until-done]    (default: HEAD, which must be pushed)
//   node scripts/ci-wait.mjs --pr <n>    (waits until the PR is merged; for run_in_background)
//
// Exit 0: every CI run of the commit passed. Exit 1: one failed or was cancelled (the failing step's output follows,
// cut to its failures), or no run appeared within two minutes. Exit 2: CI is still running after 2.5 minutes, so run it
// again. A run that a newer push cancelled is no failure (#569): when its branch has a head other than the run's commit,
// the script prints „superseded by <sha>“, waits on that head (the time limit of the call keeps running; the two minutes
// for a run to appear count from the hop) and ends with that head's result. A run cancelled while its commit is still
// the branch's head, or on a branch that no longer exists, was cancelled by hand and stays red.
// One call stays under the 3 minutes after which Claude Code moves a command to the background: that ends the
// agent's turn and wakes the orchestrator with an interim notice (three times in session 7 of 0.8, retro 0.8).
// `--until-done` is for a call that already runs in the background (the orchestrator's): it waits up to 20 minutes, so a
// 6-minute run ends in one notification instead of a failed one every 2.5 minutes (retro 0.10).
// A run that completed as a failure with zero jobs is a GitHub start failure (annotation „workflow file issue“, twice on
// 2026-11-09 with ci.yml unchanged), not a red run: the script re-runs it once with `gh run rerun` and keeps waiting; a
// second one exits 1 with the run's URL. A later call recognises the single re-run by the run's attempt number (retro 0.10, #388).
// It prints one line while waiting, not a progress log.
import { execFileSync } from 'node:child_process'
import { rerunDecision } from './ci-verdict.mjs'
import { prDecision } from './pr-verdict.mjs'

const args = process.argv.slice(2)
const untilDone = args.includes('--until-done')
// `--pr <n>` or `--pr=<n>` starts the PR mode (#565); a commit SHA is never taken for a PR number.
const prAt = args.findIndex(arg => arg === '--pr' || arg.startsWith('--pr='))
const prValue = prAt === -1 ? null : (args[prAt].startsWith('--pr=') ? args[prAt].slice('--pr='.length) : args[prAt + 1] ?? '')
const prNumber = prValue === null ? null : (/^\d+$/.test(prValue) ? Number(prValue) : prUsage())
// `gh run list --commit` matches the full SHA only.
const sha = prNumber === null ? execFileSync('git', ['rev-parse', args.find(arg => !arg.startsWith('--')) ?? 'HEAD'], { encoding: 'utf8' }).trim() : ''
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
    return Number(gh('api', `repos/${REPO}/actions/runs/${run.databaseId}/jobs`, '--jq', '.total_count'))
  }
  catch (error) {
    return fail(`jobs count failed for ${run.url}`, error)
  }
}
const runsOf = commit => JSON.parse(gh('run', 'list', '--workflow', 'ci.yml', '--commit', commit, '--json', 'databaseId,status,conclusion,event,url,attempt,headBranch,headSha'))

/** The failing step's log from its first failure marker on, without the job/step/timestamp prefix and colour codes. */
function failures(id) {
  const lines = gh('run', 'view', String(id), '--log-failed')
    .split('\n')
    // The log writes colour codes either as escapes or as a literal caret „^[“.
    .map(line => line.replace(/^[^\t]*\t[^\t]*\t\S+ ?/, '').replace(new RegExp(`(?:${String.fromCharCode(27)}|\\^\\[)\\[[0-9;]*m`, 'g'), ''))
  const start = lines.findIndex(line => /Failed Tests|Unhandled Error|error TS\d+|ERR_PNPM|✖ \d+ problems?|Unused (files|exports|dependencies)/.test(line))
  return (start === -1 ? lines.slice(-60) : lines.slice(start, start + 80)).join('\n')
}

// The PR mode (#565): `--pr <n>` polls PR <n> until it is merged, for a background run after `gh pr merge --auto`. Since
// #556 a PR's required check is the push run of ci.yml on its head, so every poll reads the PR and, while it is open,
// the runs of its current head. It calls only `gh api` with the slug as a constant: in a cloud session `gh pr` is refused
// (GraphQL) and the git remote is a proxy that `{owner}/{repo}` does not resolve. The decision is `prDecision`; the
// loop only turns the head's runs into one word (`check`). It ends the process itself, so the commit mode below never
// runs in this mode. It always waits the long limit and ignores `--until-done`: a 2.5-minute call would end every wait.
// Exit 0 merged; 1 closed unmerged, check red, start failure twice, blocked, no run or a failed gh call; 2 still open.
const REPO = 'christried/compies'
const PR_LIMIT_MS = 20 * 60_000

function prUsage() {
  console.log('--pr needs a PR number, for example: node scripts/ci-wait.mjs --pr 570')
  return process.exit(1)
}

async function waitForPr(number) {
  const prOf = () => {
    try {
      return JSON.parse(gh('api', `repos/${REPO}/pulls/${number}`, '--jq', '{state, merged, mergeCommit: .merge_commit_sha, draft, autoMerge: (.auto_merge != null), mergeableState: .mergeable_state, headSha: .head.sha, baseRef: .base.ref, url: .html_url}'))
    }
    catch (error) {
      return fail(`PR lookup failed for #${number}`, error)
    }
  }
  const runsOfHead = (pr) => {
    try {
      return JSON.parse(gh('api', `repos/${REPO}/actions/workflows/ci.yml/runs?head_sha=${pr.headSha}&per_page=20`, '--jq', '[.workflow_runs[] | {databaseId: .id, status, conclusion, event, url: .html_url, attempt: .run_attempt}]'))
    }
    catch (error) {
      return fail(`runs lookup failed for ${pr.url}`, error)
    }
  }
  // Run id → the time of its re-run after a start failure, as in the commit mode (its variables are defined below).
  const rerunAt = new Map()
  // The worst verdict wins; a word `rerunDecision` may return in future counts as red.
  const rank = { green: 0, rerun: 1, twice: 2, red: 3 }
  const checkOf = (runs) => {
    if (runs.length === 0) return { check: 'none', verdicts: [] }
    if (runs.some(run => run.status !== 'completed' || Date.now() - (rerunAt.get(run.databaseId) ?? -Infinity) < RERUN_SETTLE_MS)) return { check: 'running', verdicts: [] }
    const verdicts = runs.map((run) => {
      const word = rerunDecision(run, run.conclusion === 'success' ? 1 : jobCountOf(run), rerunAt.has(run.databaseId))
      return { run, word: word in rank ? word : 'red' }
    })
    return { check: verdicts.reduce((worst, { word }) => rank[word] > rank[worst] ? word : worst, 'green'), verdicts }
  }

  const started = Date.now()
  let pr = prOf()
  let head = pr.headSha
  let headSince = Date.now()
  let blockedWhy = null
  let blockedPolls = 0
  let lastWhy = null
  console.log(`waiting for PR #${number} (head ${head.slice(0, 7)}) …`)
  while (Date.now() - started < PR_LIMIT_MS) {
    if (pr.headSha !== head) {
      console.log(`head of PR #${number} moved: ${head.slice(0, 7)} -> ${pr.headSha.slice(0, 7)}`)
      head = pr.headSha
      headSince = Date.now()
      blockedWhy = null
      blockedPolls = 0
    }
    // A merged or closed PR needs no run lookup.
    const { check, verdicts } = pr.state === 'open' ? checkOf(runsOfHead(pr)) : { check: 'none', verdicts: [] }
    const decision = prDecision(pr, check)
    if (decision.kind === 'merged') {
      console.log(decision.commit === null ? `merged: PR #${number} into ${pr.baseRef} (merge commit not reported)` : `merged: PR #${number} into ${pr.baseRef} as ${decision.commit}`)
      process.exit(0)
    }
    if (decision.kind === 'closed') {
      console.log(`closed without a merge: PR #${number} ${pr.url}`)
      process.exit(1)
    }
    if (decision.kind === 'red' || decision.kind === 'twice') {
      // A run cancelled because a newer push replaced it is no failure: when the head moved meanwhile, poll again.
      const again = prOf()
      if (again.headSha !== pr.headSha || again.state !== pr.state) {
        pr = again
        continue
      }
      for (const { run, word } of verdicts) {
        if (word === 'green') continue
        if (word === 'twice') {
          console.log(`start failure (zero jobs) twice: ${run.event} ${run.url}`)
          continue
        }
        console.log(`${run.conclusion}: ${run.event} ${run.url}`)
        if (run.conclusion === 'failure') console.log(failures(run.databaseId))
      }
      process.exit(1)
    }
    if (decision.kind === 'rerun') {
      for (const { run, word } of verdicts) {
        if (word !== 'rerun') continue
        console.log(`start failure (zero jobs): ${run.event} ${run.url} – re-running once`)
        try {
          gh('api', '-X', 'POST', `repos/${REPO}/actions/runs/${run.databaseId}/rerun`)
        }
        catch (error) {
          fail(`re-run failed for ${run.url}`, error)
        }
        rerunAt.set(run.databaseId, Date.now())
      }
    }
    // GitHub's mergeable_state lags a push by a few seconds, so a block counts after two polls in a row.
    if (decision.kind === 'blocked') {
      blockedPolls = decision.why === blockedWhy ? blockedPolls + 1 : 1
      blockedWhy = decision.why
      if (blockedPolls >= 2) {
        console.log({
          draft: `blocked: PR #${number} is a draft: mark it ready for review`,
          behind: `blocked: PR #${number} is behind ${pr.baseRef}: gh api -X PUT repos/${REPO}/pulls/${number}/update-branch`,
          conflict: `blocked: PR #${number} conflicts with ${pr.baseRef}: merge origin/${pr.baseRef} into its branch and push`,
        }[decision.why])
        process.exit(1)
      }
    }
    else {
      blockedWhy = null
      blockedPolls = 0
    }
    if (decision.kind === 'waiting') {
      if (decision.why !== lastWhy) {
        if (decision.why === 'auto-merge') console.log(`check is green and auto-merge is not set: waiting for someone to merge PR #${number}`)
        if (decision.why === 'merge') console.log('check is green and auto-merge is set: GitHub merges within a minute')
      }
      if (check === 'none' && Date.now() - headSince > APPEAR_MS) {
        console.log(`No CI run appeared for the head ${head.slice(0, 7)} of PR #${number}.`)
        process.exit(1)
      }
    }
    lastWhy = decision.kind === 'waiting' ? decision.why : null
    await sleep(POLL_MS)
    pr = prOf()
  }
  console.log(`PR #${number} is still open after 20 minutes: run this again.`)
  process.exit(2)
}
if (prNumber !== null) await waitForPr(prNumber)

const started = Date.now()
let runs = []
// The commit whose runs are waited on. When a newer push cancelled every run of it, it moves to the branch's newer head
// (#569, „superseded“); `hops` counts the moves, `branch` is the branch followed and `headSince` is when the wait on the
// current head began, so the two-minute „no run appeared“ limit counts from there. `started` and the call's time limit
// do not restart: one call stays under the limit it always had.
let head = sha
let hops = 0
let branch = ''
let headSince = started
// Run id → the time of its re-run after a start failure. A re-run keeps the run id; for a moment the list may still
// show the old completed state, which does not count as done.
const rerunAt = new Map()
// Run id → the head its branch has now, or null when the branch is gone: one lookup per cancelled run (#569).
const newerHeads = new Map()
const newerHeadOf = (run) => {
  if (!run.headBranch) return null
  if (!newerHeads.has(run.databaseId)) {
    let found = null
    try {
      found = gh('api', `repos/${REPO}/git/ref/heads/${run.headBranch.split('/').map(encodeURIComponent).join('/')}`, '--jq', '.object.sha').trim()
    }
    catch (error) {
      // A branch that does not exist answers 404: no newer head, the run stays red.
      if (!/HTTP 404/.test(String(error.stderr))) fail(`branch lookup failed for ${run.url}`, error)
    }
    newerHeads.set(run.databaseId, found)
  }
  return newerHeads.get(run.databaseId)
}
// The jobs are counted for a failed run only; a cancelled run's verdict does not read them.
const decisionOf = run => rerunDecision(run, run.conclusion === 'success' || run.conclusion === 'cancelled' ? 1 : jobCountOf(run), rerunAt.has(run.databaseId), run.conclusion === 'cancelled' ? newerHeadOf(run) : null)
const done = run => run.status === 'completed' && !(Date.now() - (rerunAt.get(run.databaseId) ?? -Infinity) < RERUN_SETTLE_MS)
console.log(`waiting for CI on ${sha.slice(0, 7)} …`)
while (Date.now() - started < CALL_MS) {
  runs = runsOf(head)
  if (runs.length === 0 && Date.now() - headSince > APPEAR_MS) {
    console.log(hops === 0 ? 'No CI run appeared for this commit. Is it pushed?' : `No CI run appeared for ${head.slice(0, 7)}, the newer head of ${branch}.`)
    process.exit(1)
  }
  if (runs.length > 0 && runs.every(done)) {
    const fresh = runs.filter(run => decisionOf(run) === 'rerun')
    if (fresh.length === 0) {
      const superseded = runs.filter(run => decisionOf(run) === 'superseded')
      // Only when every run of the commit was superseded does the wait move; otherwise the others decide below.
      if (superseded.length < runs.length) break
      const latest = superseded.reduce((a, b) => b.databaseId > a.databaseId ? b : a)
      const newer = newerHeads.get(latest.databaseId)
      console.log(`superseded by ${newer}: the run of ${head.slice(0, 7)} was cancelled by a newer push to ${latest.headBranch}`)
      head = newer
      branch = latest.headBranch
      hops += 1
      headSince = Date.now()
      runs = []
      console.log(`waiting for CI on ${head.slice(0, 7)} …`)
      continue
    }
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
  if (hops > 0) {
    console.log(`No CI run yet for ${head.slice(0, 7)}, the newer head of ${branch}: run this again.`)
    process.exit(2)
  }
  console.log('No CI run appeared for this commit. Is it pushed?')
  process.exit(1)
}
if (!runs.every(done)) {
  console.log(hops === 0 ? `CI is still running on ${sha.slice(0, 7)}: run this again.` : `CI is still running on ${head.slice(0, 7)}, the newer head that superseded ${sha.slice(0, 7)}: run this again.`)
  process.exit(2)
}
// A superseded run among others (a commit on several branches) is dropped, not reported as red.
const counted = runs.filter(run => decisionOf(run) !== 'superseded')
const red = counted.filter(run => run.conclusion !== 'success')
if (red.length === 0) {
  console.log(`green: ${counted.map(run => run.event).join(', ')}${hops === 0 ? '' : ` (on ${head.slice(0, 7)}, which superseded ${sha.slice(0, 7)})`}`)
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
