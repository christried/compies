// SessionStart hook (registered in .claude/settings.json for startup, resume and clear): when this checkout is behind
// origin/staging it fast-forwards the checkout when that is safe, and otherwise prints one note when staging changed a
// skill, docs/agents or CLAUDE.md since the merge base, which the harness adds to the session's context (#484, #557). A
// session that reads its rules from a stale checkout follows rules staging has already changed.
//
//   stdout: one fast-forward line, or the note, or nothing (up to date, only other files changed, no origin/staging,
//           origin unreachable)
//   exit 0: always, also for any git failure of its own (a shallow clone without a merge base included): never blocks a session.
//
// Two git writes, nothing else: the fetch (remote-tracking refs only) and `git merge --ff-only` of the checked-out
// staging to origin/staging, only when the checkout stands on staging, has no changed or staged tracked file, has no
// commit origin/staging lacks, and is not a cloud session (fastForward below). It never pulls, switches, resets, writes a
// merge commit or touches an untracked file; a failed or refused move changes nothing and falls through to the note.
// The one case a human may find a changed file: the merge is cut by its timeout and leaves what git had written so far.
// The script never repairs or retries that (no index.lock removal), and the 4 s rule before the merge starts exists so
// that a slow disk or antivirus scan does not begin a write the hook may not finish. Works in process.cwd(), the project
// dir the hook runs in.

import { spawnSync } from 'node:child_process'

const started = Date.now()

const WATCHED = ['.claude/skills', 'docs/agents', 'CLAUDE.md']

// A fetch that asks for a credential must fail, not wait; stdio 'ignore' so a killed git whose helper still holds a pipe
// cannot keep spawnSync waiting on Windows (the same reason as scripts/merge-into.mjs).
const env = { ...process.env, GIT_TERMINAL_PROMPT: '0' }
for (const name of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE']) delete env[name]

/** Output of a git read, or null when git failed, timed out or could not run: every failure means silence. */
function read(...args) {
  const result = spawnSync('git', args, { encoding: 'utf8', env, stdio: ['ignore', 'pipe', 'ignore'], timeout: 4000 })
  return result.error || result.signal || result.status !== 0 ? null : result.stdout.trim()
}

/** The printed line when the checkout was moved to origin/staging, or null (not moved): every failed guard means null. */
function fastForward(behind) {
  // A cloud session's clone stands on its own branch anyway; this is the explicit second guard.
  if (process.env.CLAUDE_CODE_REMOTE === 'true') return null
  // Git allows one worktree per branch, so a linked worktree cannot also stand on staging while the main checkout does.
  if (read('symbolic-ref', '--short', '-q', 'HEAD') !== 'staging') return null
  // Tracked files only: an untracked file never blocks, and git itself refuses a move that would overwrite one.
  if (read('--no-optional-locks', 'status', '--porcelain', '--untracked-files=no') !== '') return null
  if (read('rev-list', '--count', 'origin/staging..HEAD') !== '0') return null
  if (Date.now() - started > 4000) return null

  const old = read('rev-parse', 'HEAD')
  const target = read('rev-parse', 'origin/staging')
  if (!old || !target) return null

  const merged = spawnSync('git', ['merge', '--ff-only', '--quiet', target], { env, stdio: 'ignore', timeout: 8000 })
  if (merged.error || merged.signal || merged.status !== 0) return null
  if (read('rev-parse', 'HEAD') !== target) return null

  // A failed diff counts as changed: an unneeded install hint costs less than a missed one.
  const lockfile = read('diff', '--name-only', old, target, '--', 'pnpm-lock.yaml')
  const install = lockfile === '' ? '' : ' pnpm-lock.yaml changed: run pnpm install.'
  return `This checkout was fast-forwarded to origin/staging: ${old.slice(0, 8)} to ${target.slice(0, 8)} (${behind} ${behind === 1 ? 'commit' : 'commits'}).${install}`
}

function note() {
  const fetched = spawnSync('git', ['fetch', '--quiet', 'origin'], { env, stdio: 'ignore', timeout: 5000 })
  if (fetched.error || fetched.signal || fetched.status !== 0) return ''

  if (read('rev-parse', '--verify', '--quiet', 'origin/staging') === null) return ''

  const behind = Number(read('rev-list', '--count', 'HEAD..origin/staging'))
  if (!Number.isInteger(behind) || behind < 1) return ''

  const moved = fastForward(behind)
  if (moved) return moved

  // Three dots: only what staging changed since the merge base, not this checkout's own commits reversed.
  const changed = read('diff', '--name-only', 'HEAD...origin/staging', '--', ...WATCHED)
  if (!changed) return ''

  return [
    `This checkout is ${behind} ${behind === 1 ? 'commit' : 'commits'} behind origin/staging. Staging changed these rules and skills since this checkout's merge base:`,
    ...changed.split('\n').map(path => `- ${path}`),
    'Read the staging version before you follow the stale one here: git show origin/staging:<path>. This checkout was not changed.',
  ].join('\n')
}

try {
  const text = note()
  if (text) process.stdout.write(`${text}\n`)
}
catch {
  // Never block a session on this script's own failure.
}
process.exit(0)
