// Merges a reviewed ticket branch into the integration branch without a working tree (retro 0.11, #478). On 2026-11-10 a
// merge in the shared main checkout landed on `feat/427-tag-colours`, because another session had switched it. This builds
// the merge commit from the trees (`git merge-tree`, `git commit-tree`) and pushes it by SHA, so it never reads or changes
// the caller's branch, HEAD, index or files.
//
//   node scripts/merge-into.mjs <target> <head> [--base <commit>] -m <paragraph> [-m <paragraph> ...]
//
// <target> is the integration branch as a bare name on origin. <head> is a remote branch name (looked up as
// `origin/<head>`) or a commit SHA. `--base` is the tip of <target> you reviewed against. Each `-m` is one paragraph of
// the message, in the order given, like `git commit -m`; the attribution lines are one paragraph.
//
// Exit 0: merged and pushed; the last word of the printed line is the merge commit. Exit 1: conflict, the conflicting
// paths are printed and nothing is written. Exit 2: refused, nothing is written: bad arguments, unknown target or head,
// the target is not at `--base`, the head is already in the target, a git failure, or the push was rejected (a plain
// push: git refuses when the target moved since, and the script does not retry). The commit carries the git identity of
// the session that runs it; the script sets none.
import { spawnSync } from 'node:child_process'

const USAGE = 'Usage: node scripts/merge-into.mjs <target> <head> [--base <commit>] -m <paragraph> [-m <paragraph> ...]'

const git = (...args) => spawnSync('git', args, { encoding: 'utf8', env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } })
const firstLine = result => String(result.stderr || result.error?.message || '').trim().split('\n')[0]
const refuse = (message) => {
  console.log(message)
  process.exit(2)
}

function parse(argv) {
  const positional = []
  const paragraphs = []
  let base
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '-m' || arg === '--base') {
      if (i + 1 >= argv.length) return undefined
      const value = argv[++i]
      if (arg === '-m') paragraphs.push(value)
      else base = value
    }
    else if (arg.startsWith('-')) {
      return undefined
    }
    else {
      positional.push(arg)
    }
  }
  if (positional.length !== 2 || paragraphs.length === 0 || paragraphs.some(p => p.trim() === '')) return undefined
  return { target: positional[0], head: positional[1], base, paragraphs }
}

/** The commit a revision names, or undefined. */
function resolve(revision) {
  const result = git('rev-parse', '--verify', '--quiet', `${revision}^{commit}`)
  return result.status === 0 ? result.stdout.trim() : undefined
}

function main() {
  const args = parse(process.argv.slice(2))
  if (!args) refuse(USAGE)
  const { target, head, base, paragraphs } = args

  const fetched = git('fetch', '--quiet', 'origin')
  if (fetched.status !== 0) refuse(`fetch failed: ${firstLine(fetched)}`)

  const tip = resolve(`refs/remotes/origin/${target}`)
  if (!tip) refuse(`origin has no branch ${target}`)

  // The remote branch wins over a local one of the same name, which may be stale.
  const headSha = resolve(`refs/remotes/origin/${head}`) ?? resolve(head)
  if (!headSha) refuse(`cannot resolve ${head} to a commit`)

  if (base !== undefined) {
    const expected = resolve(base)
    if (!expected) refuse(`cannot resolve ${base} to a commit`)
    if (expected !== tip) refuse(`origin/${target} is at ${tip} (expected ${expected}): the target moved since you reviewed it; nothing written.`)
  }

  const contained = git('merge-base', '--is-ancestor', headSha, tip)
  if (contained.status === 0) refuse(`${head} is already in ${target}: nothing to merge.`)
  if (contained.status !== 1) refuse(`merge-base failed: ${firstLine(contained)}`)

  // Writes objects only: no working tree, no index.
  const merge = git('merge-tree', '--write-tree', '--name-only', tip, headSha)
  if (merge.status === 1) {
    const lines = merge.stdout.split('\n')
    const end = lines.indexOf('', 1)
    const paths = lines.slice(1, end === -1 ? undefined : end)
    console.log(`conflict merging ${head} into ${target} in:`)
    for (const path of paths) console.log(`  ${path}`)
    console.log('nothing written.')
    process.exit(1)
  }
  if (merge.status !== 0) refuse(`merge-tree failed: ${firstLine(merge)}`)
  const tree = merge.stdout.split('\n')[0].trim()

  const commit = git('commit-tree', tree, '-p', tip, '-p', headSha, ...paragraphs.flatMap(paragraph => ['-m', paragraph]))
  if (commit.status !== 0) refuse(`commit-tree failed: ${firstLine(commit)}`)
  const merged = commit.stdout.trim()

  const pushed = git('push', 'origin', `${merged}:refs/heads/${target}`)
  if (pushed.status !== 0) refuse(`push rejected, nothing was merged:\n${String(pushed.stderr).trim()}`)

  console.log(`merged ${headSha.slice(0, 10)} into ${target} as ${merged}`)
}

try {
  main()
}
catch (error) {
  refuse(`merge-into failed: ${error.message}`)
}
