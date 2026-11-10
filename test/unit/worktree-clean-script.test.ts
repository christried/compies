import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// The worktree cleaner (retro 0.8, #477): what a session sees is its exit code, what it prints and what is left in git
// and on disk. It runs as a session runs it, a Node process, in a temporary repo with a bare origin, so the real
// repo's worktrees are never touched.
const script = fileURLToPath(new URL('../../scripts/worktree-clean.mjs', import.meta.url))

const identity = { GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@example.com', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@example.com' }

function git(cwd: string, ...args: string[]) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...identity }, stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

describe('scripts/worktree-clean.mjs', () => {
  let tmp: string
  let work: string
  let result: { code: number | null, output: string }

  const folder = (name: string) => join(work, '.claude', 'worktrees', name)
  /** The harness's lock reason; `<pid>` is the Claude session that spawned the agent. */
  const lock = (name: string, pid: number) => git(work, 'worktree', 'lock', '--reason', `claude agent ${name} (pid ${pid})`, folder(name))
  /** A worktree like the harness makes it: on its own branch, started from origin/main. */
  function add(name: string, branch = `worktree-${name}`) {
    git(work, 'worktree', 'add', '-b', branch, folder(name), 'origin/main')
  }
  const listed = (name: string) => git(work, 'worktree', 'list', '--porcelain').replaceAll('\\', '/').includes(`/.claude/worktrees/${name}\n`)
  const locked = (name: string) => git(work, 'worktree', 'list', '--porcelain').split(/\n\n+/).some(block => block.replaceAll('\\', '/').includes(`/.claude/worktrees/${name}\n`) && /^locked/m.test(block))
  const hasBranch = (branch: string) => git(work, 'branch', '--list', branch) !== ''
  const lines = () => result.output.split(/\r?\n/)

  function run(...args: string[]) {
    return new Promise<{ code: number | null, output: string }>((resolve) => {
      const child = spawn(process.execPath, [script, ...args], { cwd: work, env: { ...process.env, ...identity } })
      let output = ''
      child.stdout.on('data', chunk => output += chunk)
      child.stderr.on('data', chunk => output += chunk)
      child.on('close', code => resolve({ code, output }))
    })
  }

  // The script scans the processes with PowerShell on Windows, which takes seconds.
  beforeAll(async () => {
    // The real path, so Windows 8.3 names cannot make git's listing differ from the folder path.
    tmp = realpathSync.native(mkdtempSync(join(tmpdir(), 'worktree-clean-')))
    work = join(tmp, 'work')
    git(tmp, 'init', '--bare', '-b', 'main', 'origin.git')
    git(tmp, 'init', '-b', 'main', 'work')
    git(work, 'commit', '--allow-empty', '-m', 'init')
    git(work, 'remote', 'add', 'origin', join(tmp, 'origin.git'))
    git(work, 'push', '-u', 'origin', 'main')

    const deadPid = spawnSync(process.execPath, ['-e', '']).pid
    const livePid = process.pid

    add('agent-a1a1a1')
    lock('agent-a1a1a1', livePid)
    add('agent-a7a7a7')
    add('agent-b2b2b2')
    add('agent-c3c3c3')
    lock('agent-c3c3c3', deadPid)
    add('agent-d4d4d4')
    lock('agent-d4d4d4', livePid)
    add('merge-398', 'merge-398')
    add('agent-e5e5e5')
    writeFileSync(join(folder('agent-e5e5e5'), 'unsaved.txt'), 'work in progress')
    add('agent-f6f6f6')
    git(folder('agent-f6f6f6'), 'commit', '--allow-empty', '-m', 'not pushed')

    mkdirSync(folder('leftover-plain'), { recursive: true })
    writeFileSync(join(folder('leftover-plain'), 'file.txt'), 'x')
    mkdirSync(folder('leftover-git'), { recursive: true })
    writeFileSync(join(folder('leftover-git'), '.git'), '')

    result = await run('agent-a1a1a1', 'a7a7a7', 'agent-e5e5e5', 'agent-f6f6f6')
  }, 120_000)

  afterAll(() => {
    rmSync(tmp, { recursive: true, force: true, maxRetries: 5 })
  })

  it('exits 0', () => {
    expect(result.code).toBe(0)
  })

  it('removes a named worktree that is clean and pushed, with its branch, though a live session locks it', () => {
    expect(listed('agent-a1a1a1')).toBe(false)
    expect(existsSync(folder('agent-a1a1a1'))).toBe(false)
    expect(hasBranch('worktree-agent-a1a1a1')).toBe(false)
    expect(lines().some(line => line.startsWith('removed agent-a1a1a1'))).toBe(true)
  })

  it('removes a worktree named by its bare id', () => {
    expect(listed('agent-a7a7a7')).toBe(false)
    expect(existsSync(folder('agent-a7a7a7'))).toBe(false)
    expect(hasBranch('worktree-agent-a7a7a7')).toBe(false)
    expect(lines().some(line => line.startsWith('removed agent-a7a7a7'))).toBe(true)
  })

  it('removes an unnamed worktree that a session which has ended left locked', () => {
    expect(listed('agent-c3c3c3')).toBe(false)
    expect(existsSync(folder('agent-c3c3c3'))).toBe(false)
    expect(hasBranch('worktree-agent-c3c3c3')).toBe(false)
    expect(lines().some(line => line.startsWith('removed agent-c3c3c3'))).toBe(true)
  })

  it('keeps an unlocked worktree nobody named', () => {
    expect(listed('agent-b2b2b2')).toBe(true)
    expect(existsSync(folder('agent-b2b2b2'))).toBe(true)
    expect(lines()).toContain('kept agent-b2b2b2: not named; name it if it is yours')
  })

  it('keeps an unnamed worktree that is not named like an agent', () => {
    expect(listed('merge-398')).toBe(true)
    expect(existsSync(folder('merge-398'))).toBe(true)
    expect(lines()).toContain('kept merge-398: not named; name it if it is yours')
  })

  it('keeps an unnamed worktree locked by a session that runs', () => {
    expect(listed('agent-d4d4d4')).toBe(true)
    expect(locked('agent-d4d4d4')).toBe(true)
    expect(lines().some(line => line.startsWith('kept agent-d4d4d4: its session runs'))).toBe(true)
  })

  it('keeps a named worktree with an uncommitted change', () => {
    expect(listed('agent-e5e5e5')).toBe(true)
    expect(lines()).toContain('kept agent-e5e5e5: 1 uncommitted change')
  })

  it('keeps a named worktree with a commit no remote branch contains', () => {
    expect(listed('agent-f6f6f6')).toBe(true)
    expect(result.output).toMatch(/^kept agent-f6f6f6: [0-9a-f]{7} is on no remote branch$/m)
  })

  it('deletes a folder git does not list, which has no .git', () => {
    expect(existsSync(folder('leftover-plain'))).toBe(false)
    expect(lines()).toContain('deleted leftover-plain: no longer a worktree')
  })

  it('keeps a folder git does not list that has a .git', () => {
    expect(existsSync(folder('leftover-git'))).toBe(true)
    expect(lines().some(line => line.startsWith('kept leftover-git: it has a .git'))).toBe(true)
  })
})
