import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { results } from '../../scripts/browser/kit.mjs'

// The results log of a browser check (scripts/browser/kit.mjs). A run name is reused from Release to Release (`l1`, `m2`):
// in 0.13.1 and 0.13.2 a run's lines landed under the log of an earlier Release's run of the same name, and every report
// had to say where its lines start (#599). A log of another commit is set aside under that commit.
const RUN = `test-results-${process.pid}`
const DIR = join(tmpdir(), 'compies-browser', RUN)
const LOG = join(DIR, 'results.log')
const HEAD = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim()
// A commit this checkout is not on: its first character differs from HEAD's.
const OTHER = `${HEAD[0] === 'a' ? 'b' : 'a'}${HEAD.slice(1)}`

describe('results', () => {
  afterEach(() => rmSync(DIR, { recursive: true, force: true }))

  it('starts a log with the script and the commit under test', () => {
    const log = results(RUN)
    log.check('first item', true, '12 px')

    const lines = readFileSync(LOG, 'utf8').trim().split('\n')
    expect(lines[0]).toMatch(new RegExp(`^== .+ on ${HEAD}, `))
    expect(lines[1]).toBe('PASS  first item  (12 px)')
  })

  it('goes on in the same log for a second script on the same commit', () => {
    results(RUN).check('first script', true)
    results(RUN).check('second script', false)

    const text = readFileSync(LOG, 'utf8')
    expect(text).toContain('PASS  first script')
    expect(text).toContain('FAIL  second script')
    expect(text.match(/^== /gm)).toHaveLength(2)
  })

  it('sets a log of another commit aside and starts a fresh one', () => {
    mkdirSync(DIR, { recursive: true })
    writeFileSync(LOG, `== old.mjs on ${OTHER}, 2026-11-11T10:00:00.000Z\nFAIL  an item of the earlier Release\n`)

    results(RUN).check('this run', true)

    const text = readFileSync(LOG, 'utf8')
    expect(text).not.toContain('an item of the earlier Release')
    expect(text).toContain('PASS  this run')
    expect(readFileSync(join(DIR, `results-${OTHER}.log`), 'utf8')).toContain('FAIL  an item of the earlier Release')
  })

  it('keeps an earlier log that was set aside under the same commit', () => {
    mkdirSync(DIR, { recursive: true })
    writeFileSync(join(DIR, `results-${OTHER}.log`), 'FAIL  set aside before\n')
    writeFileSync(LOG, `== old.mjs on ${OTHER}, 2026-11-12T10:00:00.000Z\nFAIL  set aside now\n`)

    results(RUN)

    const aside = readFileSync(join(DIR, `results-${OTHER}.log`), 'utf8')
    expect(aside).toContain('set aside before')
    expect(aside).toContain('set aside now')
    expect(existsSync(LOG)).toBe(true)
  })

  // A run against staging tests the commit staging serves, not the check worktree's (#780): 0.14's staging logs named the wrong one.
  it('names the commit a remote base serves, with the kit\'s own commit beside it', () => {
    results(RUN, { sha: `${OTHER}${'f'.repeat(40 - OTHER.length)}`, base: 'https://staging.example.invalid' }).check('on staging', true)

    const lines = readFileSync(LOG, 'utf8').trim().split('\n')
    expect(lines[0]).toMatch(new RegExp(`^== .+ on ${OTHER}, .+ \\(served by https://staging\\.example\\.invalid; kit of ${HEAD}\\)$`))
    expect(lines[1]).toBe('PASS  on staging')
  })

  it('sets a local run\'s log aside when the next run is of the commit a remote base serves', () => {
    results(RUN).check('local run', true)

    results(RUN, { sha: OTHER, base: 'https://staging.example.invalid' }).check('on staging', true)

    expect(readFileSync(LOG, 'utf8')).not.toContain('local run')
    expect(readFileSync(join(DIR, `results-${HEAD}.log`), 'utf8')).toContain('PASS  local run')
  })

  it('says so when a remote base is checked without the commit it serves', () => {
    results(RUN, { sha: undefined, base: 'https://staging.example.invalid' })

    const text = readFileSync(LOG, 'utf8')
    expect(text).toMatch(new RegExp(`^== .+ on ${HEAD}, `))
    expect(text).toContain('NOTE  ')
    expect(text).toContain('COMPIES_TESTED_SHA')
  })

  it('keeps the plain header on a local base, whatever the environment names', () => {
    results(RUN, { sha: OTHER, base: 'http://localhost:3001' })

    expect(readFileSync(LOG, 'utf8')).toMatch(new RegExp(`^== .+ on ${HEAD}, [^(]+$`, 'm'))
  })
})
