// Merges a reviewed ticket branch into the integration branch without a working tree (retro 0.11, #478). On 2026-11-10 a
// merge in the shared main checkout landed on `feat/427-tag-colours`, because another session had switched it. This builds
// the merge commit from the trees (`git merge-tree`, `git commit-tree`) and pushes it by SHA, so it never reads or changes
// the caller's branch, HEAD, index or files.
//
//   node scripts/merge-into.mjs <target> <head> [--base <commit>] [--changelog <group> <line file>] -m <paragraph> [-m <paragraph> ...]
//
// <target> is the integration branch as a bare name on origin. <head> is a remote branch name (looked up as
// `origin/<head>`) or a commit SHA. `--base` is the tip of <target> you reviewed against. Each `-m` is one paragraph of
// the message, in the order given, like `git commit -m`; the attribution lines are one paragraph.
//
// `--changelog <group> <line file>` writes the ticket's changelog line into the merge commit itself (retro 0.14, #780):
// the bullet in <line file> goes to the end of `### <group>` under `## [Unreleased]` of the merged CHANGELOG.md, and a
// missing group is opened in the order of GROUPS. Until 0.14 the line was a second commit, so every ticket moved the
// integration tip twice and the implementers still waiting for CI merged it up to six times. The file is created with
// the Write tool; the script reads it and never changes it.
//
// Exit 0: merged and pushed; the last word of the printed line is the merge commit. Exit 1: conflict, the conflicting
// paths are printed and nothing is written. Exit 2: refused, nothing is written: bad arguments, unknown target or head,
// the target is not at `--base`, the head is already in the target, a changelog line that cannot be placed, a git
// failure, or the push was rejected (a plain push: git refuses when the target moved since, and the script does not
// retry). The commit carries the git identity of the session that runs it; the script sets none.
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const USAGE = 'Usage: node scripts/merge-into.mjs <target> <head> [--base <commit>] [--changelog <group> <line file>] -m <paragraph> [-m <paragraph> ...]'
/** The changelog's groups, in the order `docs/agents/release.md` § Changelog lines gives them. */
const GROUPS = ['Neu', 'Geändert', 'Behoben', 'Entfernt', 'Sicherheit']
const CHANGELOG = 'CHANGELOG.md'

const git = (args, options = {}) => spawnSync('git', args, { encoding: 'utf8', ...options, env: { ...process.env, GIT_TERMINAL_PROMPT: '0', ...options.env } })
const firstLine = result => String(result.stderr || result.error?.message || '').trim().split('\n')[0]
const refuse = (message) => {
  console.log(message)
  process.exit(2)
}

function parse(argv) {
  const positional = []
  const paragraphs = []
  let base
  let changelog
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '-m' || arg === '--base') {
      if (i + 1 >= argv.length) return undefined
      const value = argv[++i]
      if (arg === '-m') paragraphs.push(value)
      else base = value
    }
    else if (arg === '--changelog') {
      if (i + 2 >= argv.length) return undefined
      changelog = { group: argv[++i], file: argv[++i] }
    }
    else if (arg.startsWith('-')) {
      return undefined
    }
    else {
      positional.push(arg)
    }
  }
  if (positional.length !== 2 || paragraphs.length === 0 || paragraphs.some(p => p.trim() === '')) return undefined
  return { target: positional[0], head: positional[1], base, changelog, paragraphs }
}

/** The commit a revision names, or undefined. */
function resolve(revision) {
  const result = git(['rev-parse', '--verify', '--quiet', `${revision}^{commit}`])
  return result.status === 0 ? result.stdout.trim() : undefined
}

/** The bullet of a line file, with LF line ends; refuses a group or a text the changelog cannot take. */
function bulletOf({ group, file }) {
  if (!GROUPS.includes(group)) refuse(`unknown changelog group "${group}": one of ${GROUPS.join(', ')}; nothing written.`)
  let text
  try {
    text = readFileSync(file, 'utf8')
  }
  catch (error) {
    refuse(`cannot read the changelog line file ${file}: ${error.message}; nothing written.`)
  }
  const bullet = text.replace(/\r\n/g, '\n').trim()
  if (!bullet.startsWith('- ')) refuse(`the changelog line in ${file} must start with "- "; nothing written.`)
  return bullet.split('\n')
}

/** The changelog with the bullet at the end of its group under `## [Unreleased]`, or undefined without that section. */
function withChangelogLine(text, group, bullet) {
  const lines = text.split('\n')
  const start = lines.findIndex(line => /^## \[Unreleased\]/.test(line))
  if (start === -1) return undefined
  const next = lines.findIndex((line, index) => index > start && /^## /.test(line))
  const end = next === -1 ? lines.length : next
  const section = lines.slice(start + 1, end)
  const headings = section.flatMap((line, at) => /^### /.test(line) ? [{ name: line.slice(4).trim(), at }] : [])
  /** The line after the last one with text in `section[from, to)`. */
  const afterContent = (from, to) => {
    let at = to
    while (at > from && section[at - 1].trim() === '') at--
    return at
  }
  const own = headings.findIndex(heading => heading.name === group)
  if (own !== -1) {
    const at = afterContent(headings[own].at + 1, headings[own + 1]?.at ?? section.length)
    // A group that has its heading only gets the blank line a bullet list starts after.
    section.splice(at, 0, ...(at === headings[own].at + 1 ? ['', ...bullet] : bullet))
  }
  else {
    // Before the first group that comes later in the order; a heading outside the five counts as later.
    const order = name => GROUPS.includes(name) ? GROUPS.indexOf(name) : GROUPS.length
    const later = headings.find(heading => order(heading.name) > order(group))
    section.splice(later ? later.at : afterContent(0, section.length), 0, '', `### ${group}`, '', ...bullet, '')
  }
  // One blank line between blocks, one before the next Release, and none doubled by the splice.
  const tidy = ['', ...section, ''].filter((line, index, all) => !(line.trim() === '' && index > 0 && all[index - 1].trim() === ''))
  return [...lines.slice(0, start + 1), ...tidy, ...lines.slice(end)].join('\n')
}

/** The merged tree with the changelog line in it: objects only, through an index file of its own. */
function treeWithChangelog(tree, changelog) {
  const bullet = bulletOf(changelog)
  const entry = git(['ls-tree', tree, CHANGELOG])
  const mode = /^(\d+) blob /.exec(entry.stdout)?.[1]
  const blob = mode ? git(['cat-file', 'blob', `${tree}:${CHANGELOG}`]) : undefined
  const text = blob?.status === 0 ? withChangelogLine(blob.stdout, changelog.group, bullet) : undefined
  if (text === undefined) refuse(`the merged tree has no ${CHANGELOG} with a "## [Unreleased]" section; nothing written.`)

  const written = git(['hash-object', '-w', '--stdin'], { input: text })
  if (written.status !== 0) refuse(`hash-object failed: ${firstLine(written)}`)
  const scratch = mkdtempSync(join(tmpdir(), 'merge-into-'))
  try {
    const env = { GIT_INDEX_FILE: join(scratch, 'index') }
    const read = git(['read-tree', tree], { env })
    if (read.status !== 0) refuse(`read-tree failed: ${firstLine(read)}`)
    const updated = git(['update-index', '--cacheinfo', `${mode},${written.stdout.trim()},${CHANGELOG}`], { env })
    if (updated.status !== 0) refuse(`update-index failed: ${firstLine(updated)}`)
    const result = git(['write-tree'], { env })
    if (result.status !== 0) refuse(`write-tree failed: ${firstLine(result)}`)
    return result.stdout.trim()
  }
  finally {
    rmSync(scratch, { recursive: true, force: true })
  }
}

function main() {
  const args = parse(process.argv.slice(2))
  if (!args) refuse(USAGE)
  const { target, head, base, changelog, paragraphs } = args

  const fetched = git(['fetch', '--quiet', 'origin'])
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

  const contained = git(['merge-base', '--is-ancestor', headSha, tip])
  if (contained.status === 0) refuse(`${head} is already in ${target}: nothing to merge.`)
  if (contained.status !== 1) refuse(`merge-base failed: ${firstLine(contained)}`)

  // Writes objects only: no working tree, no index.
  const merge = git(['merge-tree', '--write-tree', '--name-only', tip, headSha])
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
  const merged = merge.stdout.split('\n')[0].trim()
  const tree = changelog ? treeWithChangelog(merged, changelog) : merged

  const commit = git(['commit-tree', tree, '-p', tip, '-p', headSha, ...paragraphs.flatMap(paragraph => ['-m', paragraph])])
  if (commit.status !== 0) refuse(`commit-tree failed: ${firstLine(commit)}`)
  const mergeCommit = commit.stdout.trim()

  const pushed = git(['push', 'origin', `${mergeCommit}:refs/heads/${target}`])
  if (pushed.status !== 0) refuse(`push rejected, nothing was merged:\n${String(pushed.stderr).trim()}`)

  if (changelog) console.log(`changelog: the line is under "### ${changelog.group}" of [Unreleased] in the merge commit`)
  console.log(`merged ${headSha.slice(0, 10)} into ${target} as ${mergeCommit}`)
}

try {
  main()
}
catch (error) {
  refuse(`merge-into failed: ${error.message}`)
}
