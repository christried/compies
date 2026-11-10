import { spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

// The orchestrator's merge into an integration branch (#478): what the caller sees is the exit code, what it prints, the
// refs in origin and its own untouched checkout. It runs as a Node process against a temporary repo with a bare origin.
const script = fileURLToPath(new URL('../../scripts/merge-into.mjs', import.meta.url))

const gitEnv = { ...process.env, GIT_TERMINAL_PROMPT: '0' }

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

const MESSAGE = ['-m', 'Merge ticket-clean (#1)', '-m', 'Co-Authored-By: A <a@example.invalid>\nClaude-Session: https://example.invalid/s']

describe('scripts/merge-into.mjs', { timeout: 30_000 }, () => {
  let root: string
  let origin: string
  let work: string
  let base: string
  let tip: string
  let cleanHead: string
  let conflictHead: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'merge-into-'))
    origin = join(root, 'origin.git')
    const dev = join(root, 'dev')
    work = join(root, 'work')
    git(root, 'init', '--bare', '-b', 'main', origin)
    git(root, 'clone', origin, dev)
    identify(dev)
    git(dev, 'checkout', '-b', 'main')
    writeFileSync(join(dev, 'a.txt'), 'one\ntwo\nthree\n')
    git(dev, 'add', '.')
    git(dev, 'commit', '-m', 'base')
    git(dev, 'push', 'origin', 'main')
    base = git(dev, 'rev-parse', 'HEAD')
    git(dev, 'push', 'origin', 'main:refs/heads/integration')

    git(dev, 'checkout', '-b', 'ticket-clean', base)
    writeFileSync(join(dev, 'ticket.txt'), 'x\n')
    git(dev, 'add', '.')
    git(dev, 'commit', '-m', 'ticket clean')
    git(dev, 'push', 'origin', 'ticket-clean')
    cleanHead = git(dev, 'rev-parse', 'HEAD')

    git(dev, 'checkout', '-b', 'ticket-conflict', base)
    writeFileSync(join(dev, 'a.txt'), 'one\nticket\nthree\n')
    git(dev, 'commit', '-am', 'ticket conflict')
    git(dev, 'push', 'origin', 'ticket-conflict')
    conflictHead = git(dev, 'rev-parse', 'HEAD')

    git(dev, 'checkout', '-b', 'integration', base)
    writeFileSync(join(dev, 'a.txt'), 'one\nintegration\nthree\n')
    git(dev, 'commit', '-am', 'tip')
    git(dev, 'push', 'origin', 'integration')
    tip = git(dev, 'rev-parse', 'HEAD')

    git(root, 'clone', origin, work)
    identify(work)
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true, maxRetries: 5 })
  })

  function run(args: string[], cwd = work) {
    const result = spawnSync(process.execPath, [script, ...args], { cwd, encoding: 'utf8', env: gitEnv })
    return { code: result.status, output: `${result.stdout}${result.stderr}` }
  }

  const originTip = (branch: string) => git(origin, 'rev-parse', branch)
  const originRefs = () => git(origin, 'for-each-ref')

  function snapshot() {
    return {
      branch: git(work, 'rev-parse', '--abbrev-ref', 'HEAD'),
      head: git(work, 'rev-parse', 'HEAD'),
      status: git(work, 'status', '--porcelain'),
      a: readFileSync(join(work, 'a.txt'), 'utf8'),
    }
  }

  it('merges a clean head into the target as a merge commit with the paragraphs in order', () => {
    const result = run(['integration', 'ticket-clean', ...MESSAGE])

    expect(result.code).toBe(0)
    const merged = originTip('integration')
    expect(merged).not.toBe(tip)
    expect(git(origin, 'rev-parse', 'integration^1', 'integration^2').split('\n')).toEqual([tip, cleanHead])
    expect(git(origin, 'show', '-s', '--format=%B', 'integration')).toBe('Merge ticket-clean (#1)\n\nCo-Authored-By: A <a@example.invalid>\nClaude-Session: https://example.invalid/s')
    expect(result.output).toContain(merged)
    expect(git(origin, 'show', 'integration:ticket.txt')).toBe('x')
    expect(git(origin, 'show', 'integration:a.txt')).toContain('integration')
  })

  it('joins any number of paragraphs with a blank line, in the order given', () => {
    const result = run(['integration', 'ticket-clean', '-m', 'one', '-m', 'two', '-m', 'three'])

    expect(result.code).toBe(0)
    expect(git(origin, 'show', '-s', '--format=%B', 'integration')).toBe('one\n\ntwo\n\nthree')
  })

  it.each([
    ['a remote branch name', () => 'ticket-clean'],
    ['a full SHA', () => cleanHead],
    ['an abbreviated SHA', () => cleanHead.slice(0, 10)],
  ])('takes the head as %s', (_name, head) => {
    const result = run(['integration', head(), ...MESSAGE])

    expect(result.code).toBe(0)
    expect(originTip('integration^2')).toBe(cleanHead)
  })

  it('exits 1 and lists the conflicting paths, leaving origin unchanged', () => {
    const before = originRefs()

    const result = run(['integration', 'ticket-conflict', ...MESSAGE])

    expect(result.code).toBe(1)
    expect(result.output).toContain('a.txt')
    expect(result.output.toLowerCase()).toContain('conflict')
    expect(originTip('integration')).toBe(tip)
    expect(originTip('main')).toBe(base)
    expect(originTip('ticket-conflict')).toBe(conflictHead)
    expect(originRefs()).toBe(before)
  })

  it('exits 2 when the target is not at the expected base, naming the actual tip', () => {
    const before = originRefs()

    const result = run(['integration', 'ticket-clean', '--base', base, ...MESSAGE])

    expect(result.code).toBe(2)
    expect(result.output).toContain(tip)
    expect(originTip('integration')).toBe(tip)
    expect(originRefs()).toBe(before)
  })

  it.each([
    ['the full tip', () => tip],
    ['the abbreviated tip', () => tip.slice(0, 10)],
  ])('merges when the target is at the expected base given as %s', (_name, expected) => {
    const result = run(['integration', 'ticket-clean', '--base', expected(), ...MESSAGE])

    expect(result.code).toBe(0)
    expect(originTip('integration^1')).toBe(tip)
  })

  it('exits 2 when the target moves while the push is received', () => {
    const hook = join(origin, 'hooks', 'update')
    mkdirSync(join(origin, 'hooks'), { recursive: true })
    writeFileSync(hook, `#!/bin/sh\ngit update-ref refs/heads/integration ${conflictHead}\nexit 0\n`)
    chmodSync(hook, 0o755)

    const result = run(['integration', 'ticket-clean', ...MESSAGE])

    expect(result.code).toBe(2)
    expect(result.output).toContain('push rejected')
    expect(originTip('integration')).toBe(conflictHead)
  })

  it('leaves a dirty calling checkout as it was after a merge', () => {
    writeFileSync(join(work, 'a.txt'), 'one\ntwo\nthree\nlocal edit\n')
    writeFileSync(join(work, 'scratch.txt'), 'untracked\n')
    const before = snapshot()

    const result = run(['integration', 'ticket-clean', ...MESSAGE])

    expect(result.code).toBe(0)
    expect(snapshot()).toEqual(before)
    expect(before.branch).toBe('main')
    expect(() => readFileSync(join(work, 'ticket.txt'))).toThrow()
  })

  it('leaves a dirty calling checkout as it was after a conflict', () => {
    writeFileSync(join(work, 'a.txt'), 'one\ntwo\nthree\nlocal edit\n')
    writeFileSync(join(work, 'scratch.txt'), 'untracked\n')
    const before = snapshot()

    const result = run(['integration', 'ticket-conflict', ...MESSAGE])

    expect(result.code).toBe(1)
    expect(snapshot()).toEqual(before)
  })

  it('exits 2 when the target does not exist on origin', () => {
    const before = originRefs()

    const result = run(['nonexistent', 'ticket-clean', ...MESSAGE])

    expect(result.code).toBe(2)
    expect(result.output).toContain('nonexistent')
    expect(originRefs()).toBe(before)
  })

  it('exits 2 when the head cannot be resolved', () => {
    const result = run(['integration', 'no-such-ticket', ...MESSAGE])

    expect(result.code).toBe(2)
    expect(result.output).toContain('no-such-ticket')
    expect(originTip('integration')).toBe(tip)
  })

  it.each([
    ['the target branch itself', () => 'integration'],
    ['the target tip as a SHA', () => tip],
  ])('exits 2 when the head is %s, already in the target', (_name, head) => {
    const result = run(['integration', head(), ...MESSAGE])

    expect(result.code).toBe(2)
    expect(result.output).toContain('already')
    expect(originTip('integration')).toBe(tip)
  })

  it.each([
    ['no message paragraph', ['integration', 'ticket-clean']],
    ['no head', ['integration', '-m', 'x']],
    ['an unknown option', ['integration', 'ticket-clean', '--force', '-m', 'x']],
    ['an empty paragraph', ['integration', 'ticket-clean', '-m', '  ']],
  ])('exits 2 with the usage line for %s', (_name, args) => {
    const before = originRefs()

    const result = run(args)

    expect(result.code).toBe(2)
    expect(result.output.toLowerCase()).toContain('usage')
    expect(originRefs()).toBe(before)
  })
})
