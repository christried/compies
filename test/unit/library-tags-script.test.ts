import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'

// The command of the operator's Tag review (#730): what an agent and the operator see is the exit code and what the script prints. It runs as they run it, a
// Node process, with a dummy DATABASE_URL (a Pool connects lazily, so a run that stops before its first query dials nothing).
const script = fileURLToPath(new URL('../../.claude/skills/christried-tag-review/library-tags.mjs', import.meta.url))
const notesText = fileURLToPath(new URL('../../.claude/skills/christried-tag-review/notes-text.mjs', import.meta.url))

const DUMMY_URL = 'postgres://user:pw@localhost/db'
const USER = '00000000-0000-4000-8000-0000000000a1'

describe('.claude/skills/christried-tag-review/library-tags.mjs', { timeout: 20_000 }, () => {
  const folder = mkdtempSync(join(tmpdir(), 'library-tags-'))
  afterAll(() => {
    rmSync(folder, { recursive: true, force: true, maxRetries: 3 })
  })

  function run(args: string[]) {
    const result = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', env: { ...process.env, DATABASE_URL: DUMMY_URL } })
    return { code: result.status, out: result.stdout, err: result.stderr }
  }

  const plan = join(folder, 'plan.json')
  writeFileSync(plan, JSON.stringify([{ id: USER, name: 'x', tagsBefore: [], add: ['Neu'], remove: [] }]))
  const exported = join(folder, 'library.json')

  it.each([
    ['export, no --user', ['export', exported]],
    ['export, a value that is no uuid', ['export', exported, '--user', 'nicht-eine-id']],
    ['export, --user without a value', ['export', exported, '--user']],
    ['plan, no --user', [plan]],
    ['plan, a value that is no uuid', [plan, '--user', '1234']],
    ['plan, --apply and no --user', [plan, '--apply']],
  ])('stops before any connection: %s', (_label, args) => {
    const { code, out, err } = run(args)
    expect(code).toBe(1)
    expect(err).toContain('--user')
    expect(err).toContain('Stopped:')
    expect(out).toBe('')
  })

  it('never prints the User id or the URL when it stops', () => {
    const { out, err } = run(['export', exported, '--user', `${USER}x`])
    expect(`${out}${err}`).not.toContain(USER)
    expect(`${out}${err}`).not.toContain('localhost')
    expect(`${out}${err}`).not.toContain('pw')
  })
})

describe('.claude/skills/christried-tag-review/notes-text.mjs', { timeout: 20_000 }, () => {
  it('loads notesPlainText of shared/notes-doc.ts in a plain Node process', () => {
    const doc = { type: 'doc', content: [{ type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Setup' }] }, { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Mods', marks: [{ type: 'bold' }] }] }] }] }] }
    const code = `const { loadNotesPlainText } = await import(${JSON.stringify(`file://${notesText}`)}); const fn = await loadNotesPlainText(); console.log(JSON.stringify(fn(${JSON.stringify(doc)})))`
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8' })
    expect(result.stderr).toBe('')
    expect(result.status).toBe(0)
    expect(JSON.parse(result.stdout)).toBe('Setup\n- Mods')
  })
})
