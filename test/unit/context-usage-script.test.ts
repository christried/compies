import { execFileSync, spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// The context measurement of the main session (#480): what an agent sees is the exit code and what the script prints.
// It runs as an agent runs it, a Node process, against a fake config folder holding two sessions' transcripts of one
// temporary git repo and a worktree of it. No folder exists for the worktree's path, so a pass from there proves that
// the main checkout's folder was used.
const script = fileURLToPath(new URL('../../scripts/context-usage.mjs', import.meta.url))

const MINE = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const UNKNOWN = '33333333-3333-4333-8333-333333333333'

describe('scripts/context-usage.mjs', { timeout: 20_000 }, () => {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), 'context-usage-')))
  const repo = join(root, 'repo')
  const worktree = join(root, 'repo-wt')
  const config = join(root, 'config')
  const project = join(config, 'projects', repo.replace(/[^a-zA-Z0-9]/g, '-'))

  beforeAll(() => {
    mkdirSync(repo)
    const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, stdio: 'ignore' })
    git('init', '-q')
    git('-c', 'user.name=test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-q', '--allow-empty', '-m', 'init')
    git('worktree', 'add', '-q', worktree, '-b', 'wt')
  })

  afterAll(() => {
    rmSync(root, { recursive: true, force: true, maxRetries: 3 })
  })

  /** One assistant turn whose context is `tokens`. */
  function turn(tokens: number) {
    return `${JSON.stringify({
      type: 'assistant',
      message: { role: 'assistant', usage: { input_tokens: 10, cache_creation_input_tokens: tokens - 10 - 1000, cache_read_input_tokens: 1000 } },
    })}\n`
  }

  /** The project folder holds exactly these sessions, each last changed `ageMinutes` ago. */
  function stage(files: { id: string, tokens: number, ageMinutes: number }[]) {
    rmSync(project, { recursive: true, force: true })
    mkdirSync(project, { recursive: true })
    for (const { id, tokens, ageMinutes } of files) write(join(project, `${id}.jsonl`), tokens, ageMinutes)
  }

  function write(file: string, tokens: number, ageMinutes: number) {
    writeFileSync(file, turn(tokens))
    const when = new Date(Date.now() - ageMinutes * 60_000)
    utimesSync(file, when, when)
  }

  const mine = (ageMinutes: number) => ({ id: MINE, tokens: 120_000, ageMinutes })
  const other = (ageMinutes: number) => ({ id: OTHER, tokens: 310_000, ageMinutes })

  function run(args: string[], { cwd = repo, sessionId }: { cwd?: string, sessionId?: string } = {}) {
    // The test itself runs inside a Claude Code session: its own id must not leak into the script.
    const env: NodeJS.ProcessEnv = { ...process.env, CLAUDE_CONFIG_DIR: config }
    delete env.CLAUDE_CODE_SESSION_ID
    if (sessionId) env.CLAUDE_CODE_SESSION_ID = sessionId
    return new Promise<{ code: number | null, stdout: string, stderr: string }>((resolve) => {
      const child = spawn(process.execPath, [script, ...args], { cwd, env })
      let stdout = ''
      let stderr = ''
      child.stdout.on('data', chunk => stdout += chunk)
      child.stderr.on('data', chunk => stderr += chunk)
      child.on('close', code => resolve({ code, stdout, stderr }))
    })
  }

  it('measures the transcript of the id it is given, although another session changed more recently', async () => {
    stage([mine(5), other(0)])

    const result = await run([MINE])

    expect(result.code).toBe(0)
    expect(result.stdout).toContain('120k tokens (120000)')
    expect(result.stdout).toContain(`session ${MINE}`)
    expect(result.stdout).not.toContain('310k')
  })

  it('refuses without an id while another session changed in the last ten minutes', async () => {
    stage([mine(0), other(2)])

    const result = await run([])

    expect(result.code).toBe(2)
    expect(result.stdout).toBe('')
    expect(result.stderr).toContain('Pass your session id')
    expect(result.stderr).toContain('10 minutes')
    expect(result.stderr).toContain(OTHER)
  })

  it('finds the main checkout\'s folder from a worktree of the repository', async () => {
    stage([mine(0), other(30)])

    const without = await run([], { cwd: worktree })
    const given = await run([OTHER], { cwd: worktree })

    expect(without.code).toBe(0)
    expect(without.stdout).toContain('120k tokens (120000)')
    expect(given.code).toBe(0)
    expect(given.stdout).toContain('310k tokens (310000)')
    expect(given.stdout).toContain('HAND OFF')
  })

  it('measures the only transcript of the folder without an id', async () => {
    stage([mine(0)])

    const result = await run([])

    expect(result.code).toBe(0)
    expect(result.stdout).toContain('120k tokens (120000)')
  })

  it('measures the newest transcript without an id when the other one is old', async () => {
    stage([mine(30), other(0)])

    const result = await run([])

    expect(result.code).toBe(0)
    expect(result.stdout).toContain('310k tokens (310000)')
  })

  it('refuses an id without a transcript, a path included', async () => {
    stage([mine(0)])

    const unknown = await run([UNKNOWN])
    const path = await run([`../${MINE}`])

    expect(unknown.code).toBe(2)
    expect(unknown.stdout).toBe('')
    expect(unknown.stderr).toContain(`No transcript for session id ${UNKNOWN}`)
    expect(path.code).toBe(2)
  })

  it('does not count subagent transcripts', async () => {
    stage([mine(0), other(30)])
    mkdirSync(join(project, MINE, 'subagents'), { recursive: true })
    write(join(project, MINE, 'subagents', 'agent-abc.jsonl'), 310_000, 1)

    const result = await run([])

    expect(result.code).toBe(0)
    expect(result.stdout).toContain('120k tokens (120000)')
  })

  it('takes the session id from the environment when none is passed, and the argument wins over it', async () => {
    stage([mine(5), other(0)])

    const fromEnv = await run([], { sessionId: MINE })
    const argument = await run([OTHER], { sessionId: MINE })

    expect(fromEnv.code).toBe(0)
    expect(fromEnv.stdout).toContain('120k tokens (120000)')
    expect(argument.code).toBe(0)
    expect(argument.stdout).toContain('310k tokens (310000)')
  })

  it('takes the id from the environment when its own transcript is idle and another one is newer', async () => {
    stage([mine(30), other(0)])

    const result = await run([], { sessionId: MINE })

    expect(result.code).toBe(0)
    expect(result.stdout).toContain('120k tokens (120000)')
  })

  it('ignores an environment id that has no transcript', async () => {
    stage([mine(0)])
    const alone = await run([], { sessionId: UNKNOWN })
    stage([mine(0), other(2)])
    const crowded = await run([], { sessionId: UNKNOWN })

    expect(alone.code).toBe(0)
    expect(alone.stdout).toContain('120k tokens (120000)')
    expect(crowded.code).toBe(2)
  })

  it('refuses when the folder holds no transcript at all', async () => {
    stage([])

    const result = await run([])

    expect(result.code).toBe(2)
    expect(result.stdout).toBe('')
    expect(result.stderr).toContain('No session transcript in')
  })
})
