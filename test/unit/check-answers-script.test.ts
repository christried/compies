import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { answerText, emptyAnswers, serializeAnswers } from '../../scripts/wording/answers.mjs'

// What the user and the agent see of the answers file's check (#628, spec #620 § The answers file): the lines and the exit code of
// `node scripts/wording/check-answers.mjs`. It runs as a Node process on a copy of the scripts folder in a temporary checkout with a small
// locale, so its default paths (docs/reviews, i18n/locales/de.json, found from import.meta.url) are tested too, like session-start-note-script.test.ts.
const wordingDir = fileURLToPath(new URL('../../scripts/wording/', import.meta.url))
const MODULES = ['check-answers.mjs', 'answers.mjs', 'check-replacement.mjs', 'messages.mjs', 'retired-words.mjs']

const locale = {
  common: { save: 'Speichern' },
  vote: { count: '{n} Stimme | {n} Stimmen' },
  home: { title: 'Deine Events' },
}

let root: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'compies-check-answers-'))
  mkdirSync(join(root, 'scripts', 'wording'), { recursive: true })
  for (const name of MODULES) copyFileSync(join(wordingDir, name), join(root, 'scripts', 'wording', name))
  mkdirSync(join(root, 'i18n', 'locales'), { recursive: true })
  writeFileSync(join(root, 'i18n', 'locales', 'de.json'), JSON.stringify(locale))
  mkdirSync(join(root, 'docs', 'reviews'), { recursive: true })
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

function writeAnswers(name: string, text: string) {
  writeFileSync(join(root, 'docs', 'reviews', name), text)
}

function run(...args: string[]) {
  const result = spawnSync(process.execPath, [join(root, 'scripts', 'wording', 'check-answers.mjs'), ...args], { cwd: tmpdir(), encoding: 'utf8' })
  return { code: result.status, lines: result.stdout.split('\n').filter(Boolean), stderr: result.stderr }
}

const base = emptyAnswers('2026-11-20')

describe('scripts/wording/check-answers.mjs', { timeout: 30_000 }, () => {
  it('passes a file whose answers are fine: exit 0, only the counts', () => {
    let answers = answerText(base, 'common.save', { text: 'Speichern', answer: 'passt' })
    answers = answerText(answers, 'vote.count', { text: '{n} Stimme | {n} Stimmen', answer: 'ersetzt', replacement: '{n} Stimme | {n} Stimmen gesamt' })
    answers = answerText(answers, 'home.title', { text: 'Deine Events', comment: 'später' })
    writeAnswers('wording_2026-11-20.json', serializeAnswers(answers))
    const { code, lines } = run()
    expect(lines).toEqual(['answered 2, refused 0, changed 0'])
    expect(code).toBe(0)
  })

  it('reports each refused replacement and alternative, with key, code and reason, and exits 1', () => {
    let answers = answerText(base, 'vote.count', {
      text: '{n} Stimme | {n} Stimmen',
      answer: 'ersetzt',
      replacement: 'Stimmen gesamt | Stimmen',
      alternatives: ['{n} Stimme | {n} Stimmen insgesamt', '{n} Stimmen'],
    })
    answers = answerText(answers, 'common.save', { text: 'Speichern', answer: 'ersetzt', replacement: 'Speichern {name}' })
    writeAnswers('wording_2026-11-20.json', serializeAnswers(answers))
    const { code, lines } = run()
    expect(lines).toEqual([
      'REFUSED common.save placeholder-added {name} gibt es in der Nachricht nicht',
      'REFUSED vote.count placeholder-dropped {n} fehlt',
      'REFUSED vote.count alternative 2 forms 1 Form statt 2',
      'answered 2, refused 3, changed 0',
    ])
    expect(code).toBe(1)
  })

  it('reports a text that changed since the sweep, does not check its replacement, and exits 0', () => {
    const answers = answerText(base, 'common.save', { text: 'Sichern', answer: 'ersetzt', replacement: 'Speichern {name}' })
    writeAnswers('wording_2026-11-20.json', serializeAnswers(answers))
    const { code, lines } = run()
    expect(lines).toEqual([
      'CHANGED common.save was „Sichern“ now „Speichern“',
      'answered 1, refused 0, changed 1',
    ])
    expect(code).toBe(0)
  })

  it('reports a key the locale no longer has', () => {
    const answers = answerText(base, 'gone.key', { text: 'Weg', answer: 'passt' })
    writeAnswers('wording_2026-11-20.json', serializeAnswers(answers))
    expect(run().lines[0]).toBe('CHANGED gone.key was „Weg“ now gone')
  })

  it('prints warnings of a replacement and of an alternative, which do not change the exit code', () => {
    const answers = answerText(base, 'common.save', { text: 'Speichern', answer: 'ersetzt', replacement: 'Zurück in die Lobby', alternatives: ['Eins · Zwei'] })
    writeAnswers('wording_2026-11-20.json', serializeAnswers(answers))
    const { code, lines } = run()
    expect(lines).toEqual([
      'WARN common.save retired',
      'WARN common.save alternative 1 middot',
      'answered 1, refused 0, changed 0',
    ])
    expect(code).toBe(0)
  })

  it('says it did not check the fixed texts', () => {
    let answers = answerText(base, 'fixed:offline.title', { text: 'Du bist offline', answer: 'passt' })
    answers = answerText(answers, 'fixed:manifest.description', { text: 'Gemeinsam Spiele planen', answer: 'passt' })
    writeAnswers('wording_2026-11-20.json', serializeAnswers(answers))
    const { code, lines } = run()
    expect(lines.at(-1)).toBe('answered 2, refused 0, changed 0, NOT CHECKED 2 fixed texts')
    expect(code).toBe(0)
  })

  it('takes the newest answers file of docs/reviews by default, never a .md review, and a file named on the command line instead', () => {
    writeAnswers('wording_2026-11-20.json', serializeAnswers(answerText(base, 'common.save', { text: 'Speichern', answer: 'passt' })))
    writeAnswers('wording_2026-12-04.json', serializeAnswers(answerText(emptyAnswers('2026-12-04'), 'common.save', { text: 'Speichern', answer: 'ersetzt', replacement: '{name}' })))
    writeAnswers('wording_2026-12-09.md', 'kein Antwortdatei')
    expect(run().lines[0]).toContain('REFUSED common.save')
    expect(run(join(root, 'docs', 'reviews', 'wording_2026-11-20.json')).lines).toEqual(['answered 1, refused 0, changed 0'])
  })

  it('reads another locale file with --locale', () => {
    const other = join(root, 'other.json')
    writeFileSync(other, JSON.stringify({ common: { save: 'Sichern' } }))
    writeAnswers('wording_2026-11-20.json', serializeAnswers(answerText(base, 'common.save', { text: 'Speichern', answer: 'passt' })))
    expect(run('--locale', other).lines).toEqual([
      'CHANGED common.save was „Speichern“ now „Sichern“',
      'answered 1, refused 0, changed 1',
    ])
  })

  it('says where to make an answers file when there is none, and exits 1', () => {
    writeAnswers('review_0.13.3_2026-11-13.md', '# review')
    const { code, lines } = run()
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatch(/docs\/reviews\/wording_\d{4}-\d{2}-\d{2}\.json/)
    expect(code).toBe(1)
  })

  it('names the problems of a file it cannot read, and exits 1', () => {
    writeAnswers('wording_2026-11-20.json', '{ "version": ')
    const { code, lines } = run()
    expect(lines[0]).toMatch(/^PROBLEM .*JSON/)
    expect(code).toBe(1)
  })

  it('names the problem of an entry it leaves out, still checks the rest, and exits 1', () => {
    const text = JSON.stringify({
      ...base,
      texts: {
        'common.save': { text: 'Speichern', answer: 'ersetzt', replacement: null, comment: '', alternatives: [] },
        'vote.count': { text: '{n} Stimme | {n} Stimmen', answer: 'ersetzt', replacement: '{n} Stimme', comment: '', alternatives: [] },
      },
    })
    writeAnswers('wording_2026-11-20.json', text)
    const { code, lines } = run()
    expect(lines[0]).toMatch(/^PROBLEM texts\.common\.save/)
    expect(lines).toContain('REFUSED vote.count forms 1 Form statt 2')
    expect(code).toBe(1)
  })

  it('exits 1 for a file that does not exist', () => {
    const { code, lines } = run(join(root, 'docs', 'reviews', 'wording_2030-01-01.json'))
    expect(code).toBe(1)
    expect(lines.join('\n')).toContain('wording_2030-01-01.json')
  })
})
