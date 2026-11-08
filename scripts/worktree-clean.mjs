// Removes the agent worktrees under .claude/worktrees/ that are done, with their local branches (retro 0.8). Every
// session improvised this step: `git worktree remove` refuses a worktree the harness has locked, the auto-mode
// classifier blocks `remove -f -f`, and a removal that broke off left folders without a `.git` behind.
//
//   node scripts/worktree-clean.mjs [<agent id> …]    (run it in the background: a worktree with node_modules takes minutes)
//
// Done means: named on the command line (`agent-a1b2…` or `a1b2…`, the agents of this session that have reported), or
// locked by a Claude process that no longer runs (a session that has ended), or not locked at all. A done worktree is
// kept, with the reason, while it has uncommitted changes, a commit no remote branch contains, or a process running
// in it (a dev server, the Worker). A folder git no longer lists as a worktree is deleted. One line per folder.
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
const root = git('rev-parse', '--show-toplevel')
const home = join(root, '.claude', 'worktrees')
/** Forward slashes, lower case: Windows writes one path several ways. */
const same = path => resolve(path).replaceAll('\\', '/').toLowerCase()

const named = new Set(process.argv.slice(2).map(arg => arg.replace(/^agent-/, '')))

/** Whether a process with this id runs (a signal 0 only asks). */
function running(pid) {
  try {
    process.kill(pid, 0)
    return true
  }
  catch (error) {
    return error.code === 'EPERM'
  }
}

/** Every process with its command line, to find the ones that run inside a worktree. */
function processes() {
  const listing = process.platform === 'win32'
    ? execFileSync('powershell', ['-NoProfile', '-Command', 'Get-CimInstance Win32_Process | ForEach-Object { "$($_.ProcessId) $($_.CommandLine)" }'], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
    : execFileSync('ps', ['-eo', 'pid=,args='], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
  return listing.split(/\r?\n/).map(line => /^\s*(\d+) (.*)$/.exec(line)).filter(Boolean).map(([, pid, command]) => ({ pid: Number(pid), command: command.replaceAll('\\', '/').toLowerCase() }))
}

/** The worktrees git lists under .claude/worktrees/, from `git worktree list --porcelain`. */
function worktrees() {
  return git('worktree', 'list', '--porcelain').split(/\n\n+/).map((block) => {
    const field = name => block.split('\n').find(line => line === name || line.startsWith(`${name} `))?.slice(name.length + 1)
    return { path: field('worktree'), head: field('HEAD'), branch: field('branch')?.replace('refs/heads/', ''), lock: field('locked') }
  }).filter(tree => tree.path && same(tree.path).startsWith(`${same(home)}/`))
}

/** Why a done worktree stays, or null when nothing in it would be lost. */
function keepReason(tree, all) {
  const changes = git('-C', tree.path, 'status', '--porcelain').split('\n').filter(Boolean).length
  if (changes > 0) return `${changes} uncommitted change${changes === 1 ? '' : 's'}`
  if (git('branch', '-r', '--contains', tree.head) === '') return `${tree.head.slice(0, 7)} is on no remote branch`
  const inside = all.filter(item => item.command.includes(`${same(tree.path)}/`))
  if (inside.length > 0) return `processes run in it (${inside.map(item => item.pid).join(', ')})`
  return null
}

git('fetch', '--quiet', '--prune', 'origin')
git('worktree', 'prune')
const all = processes()
for (const tree of worktrees()) {
  const name = tree.path.split('/').pop()
  const pid = Number(/\(pid (\d+)\)/.exec(tree.lock ?? '')?.[1])
  const done = named.has(name.replace(/^agent-/, '')) || tree.lock === undefined || (pid > 0 && !running(pid))
  if (!done) {
    console.log(`kept ${name}: its session runs (${tree.lock}); name it once its agent has reported`)
    continue
  }
  const reason = keepReason(tree, all)
  if (reason) {
    console.log(`kept ${name}: ${reason}`)
    continue
  }
  try {
    if (tree.lock !== undefined) git('worktree', 'unlock', tree.path)
    git('worktree', 'remove', tree.path)
  }
  catch (error) {
    // Windows refuses to delete a file a process still holds; what is left is a folder for the next run.
    console.log(`failed ${name}: ${String(error.stderr ?? error.message).trim().split('\n')[0]}`)
    continue
  }
  // The harness's own branch and the agent's, once their tips are safe on origin (checked above for the worktree's HEAD).
  const branches = [`worktree-${name}`, tree.branch].filter(branch => branch && git('branch', '--list', branch) !== '')
  for (const branch of new Set(branches)) {
    if (git('branch', '-r', '--contains', git('rev-parse', branch)) !== '') git('branch', '-D', branch)
  }
  console.log(`removed ${name}${branches.length > 0 ? ` and ${[...new Set(branches)].join(', ')}` : ''}`)
}

// What a broken-off removal leaves: a folder without `.git`, which git no longer knows.
const listed = new Set(worktrees().map(tree => same(tree.path)))
for (const name of existsSync(home) ? readdirSync(home) : []) {
  const path = join(home, name)
  if (listed.has(same(path))) continue
  if (existsSync(join(path, '.git'))) {
    console.log(`kept ${name}: it has a .git, but git lists no such worktree; look at it`)
    continue
  }
  rmSync(path, { recursive: true, force: true, maxRetries: 3 })
  console.log(`deleted ${name}: no longer a worktree`)
}
