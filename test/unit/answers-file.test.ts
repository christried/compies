import { describe, expect, it } from 'vitest'
import {
  answerMono,
  answersFileName,
  answerText,
  answerUnused,
  changedSince,
  emptyAnswers,
  newestAnswersName,
  parseAnswers,
  serializeAnswers,
} from '../../scripts/wording/answers.mjs'

// The wording review's answers file (#628, spec #620 § The answers file): copy only, one small diff per answer, read back as written.
const base = emptyAnswers('2026-11-20')

function filled() {
  let answers = base
  answers = answerText(answers, 'save', { text: 'Speichern', answer: 'passt' })
  answers = answerText(answers, 'vote.count', { text: '{n} Stimme | {n} Stimmen', answer: 'ersetzt', replacement: '{n} Stimme | {n} Stimmen insgesamt', comment: 'klarer' })
  answers = answerText(answers, 'home.title', { text: 'Deine Events', answer: 'alternativen', alternatives: ['Alle Events', 'Meine Events'] })
  answers = answerText(answers, 'fixed:offline.title', { text: 'Du bist offline', answer: 'passt' })
  answers = answerUnused(answers, 'wheel', 'loeschen')
  answers = answerMono(answers, 'app/components/Clock.vue', 'Ziffern sind Mono, passt')
  return answers
}

describe('emptyAnswers', () => {
  it('is version 1 with the sweep date and nothing answered', () => {
    expect(base).toEqual({ version: 1, sweptAt: '2026-11-20', texts: {}, fixed: {}, unused: {}, mono: {} })
  })
})

describe('answerText, answerUnused, answerMono', () => {
  it('return a new file and leave the old one alone', () => {
    const next = answerText(base, 'save', { text: 'Speichern', answer: 'passt' })
    expect(next).not.toBe(base)
    expect(base.texts).toEqual({})
    expect(next.texts.save).toEqual({ text: 'Speichern', answer: 'passt', replacement: null, comment: '', alternatives: [] })
  })

  it('merge a patch into the entry, so a comment keeps the answer and the other way round', () => {
    let answers = answerText(base, 'save', { text: 'Speichern', comment: 'hm' })
    expect(answers.texts.save).toMatchObject({ answer: null, comment: 'hm' })
    answers = answerText(answers, 'save', { answer: 'passt' })
    expect(answers.texts.save).toEqual({ text: 'Speichern', answer: 'passt', replacement: null, comment: 'hm', alternatives: [] })
  })

  it('keep a replacement only while the answer is „ersetzt“', () => {
    let answers = answerText(base, 'save', { text: 'Speichern', answer: 'ersetzt', replacement: 'Sichern' })
    expect(answers.texts.save?.replacement).toBe('Sichern')
    answers = answerText(answers, 'save', { answer: 'passt' })
    expect(answers.texts.save?.replacement).toBeNull()
  })

  it('file a „fixed:“ id under fixed, without the prefix', () => {
    const answers = answerText(base, 'fixed:offline.title', { text: 'Du bist offline', answer: 'passt' })
    expect(Object.keys(answers.fixed)).toEqual(['offline.title'])
    expect(answers.texts).toEqual({})
  })

  it('record an unused group and a mono element', () => {
    const answers = answerMono(answerUnused(base, 'wheel', 'behalten'), 'app/components/Clock.vue', 'passt')
    expect(answers.unused).toEqual({ wheel: 'behalten' })
    expect(answers.mono).toEqual({ 'app/components/Clock.vue': { comment: 'passt' } })
  })
})

describe('serializeAnswers and parseAnswers', () => {
  it('read back what was written', () => {
    const answers = filled()
    const { answers: back, problems } = parseAnswers(serializeAnswers(answers))
    expect(problems).toEqual([])
    expect(back).toEqual(answers)
  })

  it('writes sorted keys, two spaces and a trailing newline, whatever order the answers came in', () => {
    const one = answerText(answerText(base, 'b.key', { text: 'B' }), 'a.key', { text: 'A' })
    const other = answerText(answerText(base, 'a.key', { text: 'A' }), 'b.key', { text: 'B' })
    expect(serializeAnswers(one)).toBe(serializeAnswers(other))
    const out = serializeAnswers(one)
    expect(out.endsWith('}\n')).toBe(true)
    expect(out).toContain('\n  "texts": {\n    "a.key": {')
    expect(Object.keys(JSON.parse(out).texts)).toEqual(['a.key', 'b.key'])
  })

  it('drops unknown extra fields', () => {
    const text = JSON.stringify({
      version: 1,
      sweptAt: '2026-11-20',
      stray: true,
      texts: { save: { text: 'Speichern', answer: 'passt', replacement: null, comment: '', alternatives: [], rendered: 'Speichern', account: 'host' } },
      fixed: {},
      unused: {},
      mono: {},
    })
    const { answers, problems } = parseAnswers(text)
    expect(problems).toEqual([])
    expect(answers).toEqual({ version: 1, sweptAt: '2026-11-20', texts: { save: { text: 'Speichern', answer: 'passt', replacement: null, comment: '', alternatives: [] } }, fixed: {}, unused: {}, mono: {} })
  })

  it('never throws: broken JSON gives a problem and no file', () => {
    const { answers, problems } = parseAnswers('{ "version": ')
    expect(answers).toBeNull()
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('JSON')
  })

  it('names a wrong version, and a value that is no file', () => {
    expect(parseAnswers(JSON.stringify({ version: 2, sweptAt: '2026-11-20' })).problems).toEqual([expect.stringContaining('version')])
    expect(parseAnswers('[]').answers).toBeNull()
    expect(parseAnswers('null').problems).toHaveLength(1)
  })

  it('names an „ersetzt“ without a replacement and leaves the entry out', () => {
    const text = JSON.stringify({ ...base, texts: { save: { text: 'Speichern', answer: 'ersetzt', replacement: null, comment: '', alternatives: [] } } })
    const { answers, problems } = parseAnswers(text)
    expect(problems).toEqual([expect.stringContaining('texts.save')])
    expect(answers?.texts).toEqual({})
  })

  it('names a replacement that has no „ersetzt“', () => {
    const text = JSON.stringify({ ...base, texts: { save: { text: 'Speichern', answer: 'passt', replacement: 'Sichern', comment: '', alternatives: [] } } })
    expect(parseAnswers(text).problems).toEqual([expect.stringContaining('texts.save')])
  })

  it('names an unknown answer, an unknown unused answer and a malformed entry', () => {
    const text = JSON.stringify({
      ...base,
      texts: { save: { text: 'Speichern', answer: 'vielleicht', replacement: null, comment: '', alternatives: [] }, other: 'x' },
      fixed: { 'offline.title': { text: 'Du bist offline', answer: 'passt', replacement: null, comment: '', alternatives: [3] } },
      unused: { wheel: 'später' },
      mono: { 'app/components/Clock.vue': 'passt' },
    })
    const { answers, problems } = parseAnswers(text)
    expect(problems).toHaveLength(5)
    expect(problems.join('\n')).toContain('texts.save')
    expect(problems.join('\n')).toContain('texts.other')
    expect(problems.join('\n')).toContain('fixed.offline.title')
    expect(problems.join('\n')).toContain('unused.wheel')
    expect(problems.join('\n')).toContain('mono.app/components/Clock.vue')
    expect(answers).toEqual(base)
  })
})

describe('changedSince', () => {
  const now = [
    { key: 'save', text: 'Speichern' },
    { key: 'vote.count', text: '{n} Stimme | {n} Stimmen' },
    { key: 'home.title', text: 'Deine Events' },
  ]

  it('reports nothing when every text is still what was swept', () => {
    expect(changedSince(filled(), now, [{ id: 'offline.title', text: 'Du bist offline' }])).toEqual([])
  })

  it('reports a message reworded since the sweep, with what was swept, the replacement and today’s text', () => {
    const answers = answerText(base, 'vote.count', { text: '{n} Stimme | {n} Stimmen', answer: 'ersetzt', replacement: '{n} Stimme | {n} Stimmen gesamt' })
    expect(changedSince(answers, [{ key: 'vote.count', text: '{n} Stimme | {n} Stimmen zusammen' }])).toEqual([
      { id: 'vote.count', swept: '{n} Stimme | {n} Stimmen', replacement: '{n} Stimme | {n} Stimmen gesamt', now: '{n} Stimme | {n} Stimmen zusammen' },
    ])
  })

  it('does not report a replacement that has been applied since', () => {
    const answers = answerText(base, 'save', { text: 'Speichern', answer: 'ersetzt', replacement: 'Sichern' })
    expect(changedSince(answers, [{ key: 'save', text: 'Sichern' }])).toEqual([])
  })

  it('reports a key de.json no longer has with now null', () => {
    const answers = answerText(base, 'gone', { text: 'Weg', answer: 'passt' })
    expect(changedSince(answers, now)).toEqual([{ id: 'gone', swept: 'Weg', replacement: null, now: null }])
  })

  it('reports an entry that holds only a comment when its text changed', () => {
    const answers = answerText(base, 'save', { text: 'Speichern', comment: 'hm' })
    expect(changedSince(answers, [{ key: 'save', text: 'Sichern' }])).toHaveLength(1)
  })

  it('reports a fixed text reworded since the sweep under its step id, and a replacement applied since is not a change', () => {
    let answers = answerText(base, 'fixed:offline.title', { text: 'Du bist offline', answer: 'passt' })
    answers = answerText(answers, 'fixed:offline.button', { text: 'Neu laden', answer: 'ersetzt', replacement: 'Nochmal' })
    const same = [{ id: 'offline.title', text: 'Du bist offline' }, { id: 'offline.button', text: 'Nochmal' }]
    expect(changedSince(answers, [], same)).toEqual([])
    expect(changedSince(answers, [], [{ id: 'offline.title', text: 'Keine Verbindung' }, same[1]!])).toEqual([
      { id: 'fixed:offline.title', swept: 'Du bist offline', replacement: null, now: 'Keine Verbindung' },
    ])
  })

  it('reports a fixed text the files no longer hold with now null', () => {
    const answers = answerText(base, 'fixed:offline.title', { text: 'Du bist offline', answer: 'passt' })
    expect(changedSince(answers, [], [])).toEqual([{ id: 'fixed:offline.title', swept: 'Du bist offline', replacement: null, now: null }])
  })
})

describe('answersFileName and newestAnswersName', () => {
  it('names the file for the sweep date', () => {
    expect(answersFileName('2026-11-20')).toBe('wording_2026-11-20.json')
  })

  it('picks the greatest name, ignoring the .md reviews and anything else', () => {
    const names = ['review_0.13.3_2026-11-13.md', 'wording_2026-11-20.json', 'wording_2026-12-02.json', 'wording_2026-12-02.md', 'wording_2027-01-05.json.bak', 'audit_2026-10-24.md', 'mvp_review_1']
    expect(newestAnswersName(names)).toBe('wording_2026-12-02.json')
  })

  it('leaves out the file being filled', () => {
    const names = ['wording_2026-11-20.json', 'wording_2026-12-02.json']
    expect(newestAnswersName(names, { except: 'wording_2026-12-02.json' })).toBe('wording_2026-11-20.json')
  })

  it('is null when there is none', () => {
    expect(newestAnswersName([])).toBeNull()
    expect(newestAnswersName(['review_0.13.3_2026-11-13.md'])).toBeNull()
    expect(newestAnswersName(['wording_2026-11-20.json'], { except: 'wording_2026-11-20.json' })).toBeNull()
  })
})
