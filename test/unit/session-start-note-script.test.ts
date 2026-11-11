import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

// The note a session gets at start when its checkout is behind origin/staging (#484): what the agent sees is the exit
// code and stdout. It runs as a Node process against temporary repos with a bare origin, like merge-into-script.test.ts.
const script = fileURLToPath(new URL('../../scripts/session-start-note.mjs', import.meta.url))
const settingsFile = fileURLToPath(new URL('../../.claude/settings.json', import.meta.url))

// A hook-inherited GIT_DIR would point the temporary repos at the real checkout.
const { GIT_DIR: _dir, GIT_WORK_TREE: _tree, GIT_INDEX_FILE: _index, ...inherited } = process.env
const gitEnv = { ...inherited, GIT_TERMINAL_PROMPT: '0' }

function git(cwd: string, ...args: string[]) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', env: gitEnv })
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`)
  return result.stdout.trim()
}

function identify(cwd: string) {
  git(cwd, 'config', 'commit.gpgsign', 'false')
  git(cwd, 'config', 'user.name', 'Test')
  git(cwd, 'config', 'user.email', 'test@example.invalid')
}

function commitFile(cwd: string, path: string, content: string, message: string) {
  mkdirSync(dirname(join(cwd, path)), { recursive: true })
  writeFileSync(join(cwd, path), content)
  git(cwd, 'add', '.')
  git(cwd, 'commit', '-m', message)
}

function runScript(cwd: string) {
  const result = spawnSync(process.execPath, [script], { cwd, encoding: 'utf8', env: gitEnv })
  return { code: result.status, stdout: result.stdout, stderr: result.stderr }
}

describe('scripts/session-start-note.mjs', { timeout: 30_000 }, () => {
  let root: string
  let origin: string
  let dev: string
  let work: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'session-note-'))
    origin = join(root, 'origin.git')
    dev = join(root, 'dev')
    work = join(root, 'work')
    git(root, 'init', '--bare', '-b', 'main', origin)
    git(root, 'clone', origin, dev)
    identify(dev)
    git(dev, 'checkout', '-b', 'main')
    commitFile(dev, 'README.md', 'base\n', 'base')
    git(dev, 'push', 'origin', 'main')
    git(dev, 'push', 'origin', 'main:refs/heads/staging')
    // The checkout under test, at the old commit.
    git(root, 'clone', origin, work)
    identify(work)
    // Staging moves on in a second clone.
    git(dev, 'checkout', '-b', 'staging', 'origin/staging')
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('names the count and the changed skill, and says how to read it, when staging is ahead', () => {
    commitFile(dev, '.claude/skills/tdd/SKILL.md', 'new rule\n', 'docs: skill')
    commitFile(dev, 'app/pages/index.vue', '<template />\n', 'feat: page')
    git(dev, 'push', 'origin', 'staging')

    const result = runScript(work)

    expect(result.code).toBe(0)
    expect(result.stdout).toMatch(/^This checkout is 2 commits behind origin\/staging\./)
    expect(result.stdout).toContain('.claude/skills/tdd/SKILL.md')
    expect(result.stdout).toContain('git show origin/staging:<path>')
    expect(result.stdout).not.toContain('app/pages/index.vue')
  })

  it('names a docs/agents file and CLAUDE.md, and says "1 commit" for one commit', () => {
    mkdirSync(join(dev, 'docs/agents'), { recursive: true })
    writeFileSync(join(dev, 'docs/agents/delivery.md'), 'x\n')
    writeFileSync(join(dev, 'CLAUDE.md'), 'y\n')
    git(dev, 'add', '.')
    git(dev, 'commit', '-m', 'docs')
    git(dev, 'push', 'origin', 'staging')

    const result = runScript(work)

    expect(result.stdout).toMatch(/^This checkout is 1 commit behind origin\/staging\./)
    expect(result.stdout).toContain('docs/agents/delivery.md')
    expect(result.stdout).toContain('CLAUDE.md')
  })

  it('is silent when only other files changed on staging', () => {
    commitFile(dev, 'app/pages/index.vue', '<template />\n', 'feat: page')
    git(dev, 'push', 'origin', 'staging')

    const result = runScript(work)

    expect(result.code).toBe(0)
    expect(result.stdout).toBe('')
  })

  it('is silent when the checkout is up to date', () => {
    expect(runScript(work)).toMatchObject({ code: 0, stdout: '' })
  })

  it('is silent when the checkout is only ahead of staging, and names no file only the checkout changed', () => {
    commitFile(work, 'docs/agents/local-only.md', 'z\n', 'docs: local')

    expect(runScript(work)).toMatchObject({ code: 0, stdout: '' })
  })

  it('does not name a file only the checkout changed when staging is ahead', () => {
    commitFile(work, 'docs/agents/local-only.md', 'z\n', 'docs: local')
    commitFile(dev, '.claude/skills/tdd/SKILL.md', 'new rule\n', 'docs: skill')
    git(dev, 'push', 'origin', 'staging')

    const result = runScript(work)

    expect(result.stdout).toContain('.claude/skills/tdd/SKILL.md')
    expect(result.stdout).not.toContain('local-only.md')
  })

  it('is silent when origin cannot be reached, and leaves the checkout untouched', () => {
    commitFile(dev, '.claude/skills/tdd/SKILL.md', 'new rule\n', 'docs: skill')
    git(dev, 'push', 'origin', 'staging')
    renameSync(origin, join(root, 'moved.git'))
    const head = git(work, 'rev-parse', 'HEAD')

    const result = runScript(work)

    expect(result).toMatchObject({ code: 0, stdout: '' })
    expect(git(work, 'rev-parse', 'HEAD')).toBe(head)
    expect(git(work, 'status', '--porcelain')).toBe('')
  })

  it('is silent when origin/staging does not exist', () => {
    git(work, 'branch', '-rd', 'origin/staging')
    git(dev, 'push', 'origin', '--delete', 'staging')

    expect(runScript(work)).toMatchObject({ code: 0, stdout: '' })
  })

  it('is registered as a SessionStart hook that also covers /clear', () => {
    const settings = JSON.parse(readFileSync(settingsFile, 'utf8'))
    const entry = settings.hooks.SessionStart.find((candidate: { hooks: { command: string }[] }) =>
      candidate.hooks.some(hook => hook.command.includes('scripts/session-start-note.mjs')))
    expect(entry.matcher).toBe('startup|resume|clear')
    expect(entry.hooks[0].type).toBe('command')
    expect(entry.hooks[0].command).toBe('node "$CLAUDE_PROJECT_DIR"/scripts/session-start-note.mjs')
  })
})
