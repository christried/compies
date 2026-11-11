// SessionStart hook (registered in .claude/settings.json for startup, resume and clear): when this checkout is behind
// origin/staging and staging changed a skill, docs/agents or CLAUDE.md since the merge base, prints one note that the
// harness adds to the session's context (#484). A session that reads its rules from a stale checkout follows rules
// staging has already changed.
//
//   stdout: the note, or nothing (up to date, only other files changed, no origin/staging, origin unreachable)
//   exit 0: always, also for any git failure of its own (a shallow clone without a merge base included): never blocks a session.
//
// Read-only for the checkout: the one git write is the fetch, which only updates remote-tracking refs. It never pulls,
// switches, merges, resets or writes a file. Works in process.cwd(), the project dir the hook runs in.

import { spawnSync } from 'node:child_process'

const WATCHED = ['.claude/skills', 'docs/agents', 'CLAUDE.md']

// A fetch that asks for a credential must fail, not wait; stdio 'ignore' so a killed git whose helper still holds a pipe
// cannot keep spawnSync waiting on Windows (the same reason as scripts/merge-into.mjs).
const env = { ...process.env, GIT_TERMINAL_PROMPT: '0' }
for (const name of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE']) delete env[name]

/** Output of a git read, or null when git failed (or could not run): every failure means silence. */
function read(...args) {
  const result = spawnSync('git', args, { encoding: 'utf8', env, stdio: ['ignore', 'pipe', 'ignore'] })
  return result.error || result.status !== 0 ? null : result.stdout.trim()
}

function note() {
  const fetched = spawnSync('git', ['fetch', '--quiet', 'origin'], { env, stdio: 'ignore', timeout: 5000 })
  if (fetched.error || fetched.signal || fetched.status !== 0) return ''

  if (read('rev-parse', '--verify', '--quiet', 'origin/staging') === null) return ''

  const behind = Number(read('rev-list', '--count', 'HEAD..origin/staging'))
  if (!Number.isInteger(behind) || behind < 1) return ''

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
