import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// The operator's script that deletes one account (#919, spec #907): what an agent and the operator see is the exit code and what the script prints. It runs as
// they run it, a Node process. The failures before the connection use a dummy DATABASE_URL (a Pool connects lazily, so a run that stops before its first query
// dials nothing); the last case goes as far as loading the TypeScript modules and dialling a port nobody listens on. The work itself is the core's test on
// PGlite (test/integration/delete-account-script.test.ts): a process cannot reach PGlite.
const script = fileURLToPath(new URL('../../scripts/prod/delete-account.mjs', import.meta.url))

const DUMMY_URL = 'postgres://user:pw@localhost/db'
const REFUSED_URL = 'postgres://user:pw@127.0.0.1:1/db'
const USER = '00000000-0000-4000-8000-0000000000a1'

/** The developer's own environment without anything the script reads, then what the case sets. */
function run(args: string[], env: Record<string, string> = {}) {
  const own = ['DATABASE_URL', 'R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET', 'R2_JURISDICTION', 'NODE_OPTIONS']
  const clean = Object.fromEntries(Object.entries(process.env).filter(([name]) => !own.includes(name)))
  const result = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', env: { ...clean, ...env } })
  return { code: result.status, out: result.stdout, err: result.stderr }
}

describe('scripts/prod/delete-account.mjs', { timeout: 30_000 }, () => {
  it.each([
    ['no id', [], { DATABASE_URL: DUMMY_URL }, 'give the User id'],
    ['an id that is no uuid', ['nicht-eine-id'], { DATABASE_URL: DUMMY_URL }, 'give the User id'],
    ['a uuid with a character too many', [`${USER}x`], { DATABASE_URL: DUMMY_URL }, 'give the User id'],
    ['an unknown flag', [USER, '--dry'], { DATABASE_URL: DUMMY_URL }, 'unknown argument'],
    ['a second positional argument', [USER, USER], { DATABASE_URL: DUMMY_URL }, 'unknown argument'],
    ['DATABASE_URL unset', [USER], {}, 'DATABASE_URL is not set'],
    ['DATABASE_URL that is no URL', [USER], { DATABASE_URL: 'kein url' }, 'DATABASE_URL is not a URL'],
    ['--apply and no R2_* variable', [USER, '--apply'], { DATABASE_URL: DUMMY_URL }, '--apply needs R2_ACCOUNT_ID'],
    ['--apply and one R2_* variable missing', [USER, '--apply'], { DATABASE_URL: DUMMY_URL, R2_ACCOUNT_ID: 'a', R2_ACCESS_KEY_ID: 'b', R2_SECRET_ACCESS_KEY: 'c' }, '--apply needs R2_ACCOUNT_ID'],
  ])('stops before any module load or connection: %s', (_label, args, env, reason) => {
    const { code, out, err } = run(args, env)
    expect(code).toBe(1)
    expect(err).toMatch(/^Stopped: /)
    expect(err).toContain(reason)
    expect(out).toBe('')
    // Neither the id nor the URL nor a value of the environment is ever printed.
    for (const secret of [USER, 'localhost', 'pw']) expect(`${out}${err}`).not.toContain(secret)
  })

  it('loads the TypeScript modules in plain Node, then stops on a connection that fails, printing no message of the driver', () => {
    // Pins that the module graph of server/utils/delete-user.ts loads with no flag: the resolve hook (extensionless imports) and the erasable syntax. A later
    // `enum` or parameter property anywhere in that graph breaks the script, and no other test would see it.
    const { code, out, err } = run([USER], { DATABASE_URL: REFUSED_URL })
    expect(code).toBe(1)
    expect(err).toMatch(/^Stopped: could not run the deletion/)
    expect(err).toContain('nothing was committed')
    // The command says which phase failed when it is the loading, and never prints the driver's or Node's own message.
    expect(err).not.toContain('loading the modules')
    for (const loadFailure of ['ERR_UNSUPPORTED_TYPESYNTAX', 'ERR_MODULE_NOT_FOUND', 'Cannot find', 'ERR_UNKNOWN_FILE_EXTENSION']) expect(err).not.toContain(loadFailure)
    expect(out).toBe('')
    for (const secret of [USER, '127.0.0.1', 'localhost', 'pw', 'ECONNREFUSED']) expect(`${out}${err}`).not.toContain(secret)
    expect(err.trim().split('\n')).toHaveLength(1)
  })
})
