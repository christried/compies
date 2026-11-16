import { describe, expect, it } from 'vitest'
import { answerMono, answerText, answerUnused, emptyAnswers } from '../../scripts/wording/answers.mjs'
import { flattenMessages } from '../../scripts/wording/messages.mjs'
import { checkRecording, filterSteps, isAnswered, isNewSince, progressOf, sightingToShow, stepsOf } from '../../scripts/wording/review-model.mjs'

// The steps of the wording review (#628, spec #620 § The review page): which texts there are and in what order, the filters,
// resume, and „neu seit dem letzten Durchgang“. All copy here is invented; the real locale file is only read in check-replacement.test.ts.
const locale = {
  common: { save: 'Speichern', cancel: 'Abbrechen' },
  home: { title: 'Deine Events', empty: 'Noch nichts da' },
  vote: { yes: 'Passt', count: '{n} Stimme | {n} Stimmen' },
  legal: { impressum: { title: 'Impressum', body: 'Angaben' }, datenschutz: { title: 'Datenschutz' } },
  wheel: { spin: 'Drehen', old: 'Alt', older: 'Älter' },
  stepper: { title: 'Neues Event' },
}
const messages = flattenMessages(locale)

type Seen = Partial<{ state: string, width: number, marks: ('mono' | 'sr-only')[], via: string }>
function seeing(seq: number, extra: Seen = {}) {
  return {
    seq,
    state: 'home',
    account: 'host' as const,
    width: 390,
    box: { x: 0, y: 0, width: 100, height: 20 },
    picture: `pictures/${seq}.png`,
    rendered: 'x',
    via: 'text' as const,
    marks: [] as ('mono' | 'sr-only')[],
    ...extra,
  }
}
const recorded = (key: string, ...seqs: number[]) => ({ key, sightings: seqs.map(seq => seeing(seq)) })
const recordingOf = (parts: Partial<{ messages: unknown[], monoElements: unknown[], fixed: unknown[], locations: Record<string, unknown> }> = {}) => ({
  version: 1 as const,
  recordedAt: '2026-11-20T10:00:00.000Z',
  commit: 'abc1234',
  messages: [],
  monoElements: [],
  fixed: [],
  locations: {},
  ...parts,
})
const ids = (steps: { id: string }[]) => steps.map(step => step.id)
const asRecording = (value: unknown) => value as Parameters<typeof stepsOf>[0]['recording']

describe('stepsOf: order', () => {
  const recording = asRecording(recordingOf({
    messages: [
      recorded('home.title', 5),
      recorded('common.save', 2, 9, 4),
      recorded('legal.impressum.title', 1),
      recorded('vote.yes', 7),
      recorded('wheel.old', 3),
    ],
    monoElements: [{ component: 'app/components/Clock.vue', what: 'Die Uhr', sightings: [seeing(6, { marks: ['mono'] })] }],
    fixed: [
      { id: 'offline.title', text: 'Du bist offline', file: 'public/offline.html', line: 12, sightings: [seeing(8)] },
      { id: 'manifest.description', text: 'Gemeinsam Spiele planen', file: 'nuxt.config.ts', line: 40, sightings: [] },
      { id: 'changelog.group.added', text: 'Neu', file: 'shared/changelog.ts', line: 3, sightings: [] },
    ],
  }))
  const unused = { groups: [{ group: 'wheel', keys: [{ key: 'wheel.old', text: 'Alt' }, { key: 'wheel.older', text: 'Älter' }] }, { group: 'stepper', keys: [{ key: 'stepper.title', text: 'Neues Event' }] }] }

  it('is the walk by first sighting, then the texts without a picture by group, then legal, then the unused groups', () => {
    const { steps, problems } = stepsOf({ messages, recording, unused })
    expect(ids(steps)).toEqual([
      // walk: seq 2 save, 5 title, 6 mono, 7 yes, 8 fixed (wheel.old, seq 3, is unused too: it stays a picture step)
      'common.save', 'wheel.old', 'home.title', 'mono:app/components/Clock.vue', 'vote.yes', 'fixed:offline.title',
      // unpictured: file order of the locale, then fixed texts by id
      'common.cancel', 'home.empty', 'vote.count', 'wheel.spin', 'fixed:changelog.group.added', 'fixed:manifest.description',
      // legal: seen or not, in file order
      'legal.impressum.title', 'legal.impressum.body', 'legal.datenschutz.title',
      // unused: wheel.old left the list, wheel.older stays
      'unused:wheel', 'unused:stepper',
    ])
    expect(problems).toEqual([expect.stringContaining('wheel.old')])
    expect(steps.map(step => step.section)).toEqual([
      'walk', 'walk', 'walk', 'walk', 'walk', 'walk',
      'unpictured', 'unpictured', 'unpictured', 'unpictured', 'unpictured', 'unpictured',
      'legal', 'legal', 'legal',
      'unused', 'unused',
    ])
  })

  it('makes one step per key however often it was seen, sightings sorted by seq, the first shown', () => {
    const { steps } = stepsOf({ messages, recording, unused: null })
    const save = steps.find(step => step.id === 'common.save')
    expect(save?.sightings.map(s => s.seq)).toEqual([2, 4, 9])
    expect(steps.filter(step => step.id === 'common.save')).toHaveLength(1)
    expect(save && sightingToShow(save, [])?.seq).toBe(2)
  })

  it('puts a mono element between the messages whose first sightings surround it', () => {
    const { steps } = stepsOf({ messages, recording, unused: null })
    const walk = ids(steps.filter(step => step.section === 'walk'))
    expect(walk.indexOf('mono:app/components/Clock.vue')).toBe(walk.indexOf('home.title') + 1)
    expect(walk.indexOf('mono:app/components/Clock.vue')).toBe(walk.indexOf('vote.yes') - 1)
  })

  it('keeps a legal key seen early in the legal section, and fills in each kind of step', () => {
    const { steps } = stepsOf({ messages, recording, unused: null })
    const legal = steps.find(step => step.id === 'legal.impressum.title')
    expect(legal).toMatchObject({ kind: 'message', section: 'legal', group: 'legal', text: 'Impressum', keys: [], where: null })
    expect(legal?.sightings).toHaveLength(1)
    expect(steps.find(step => step.id === 'fixed:offline.title')).toMatchObject({
      kind: 'fixed', section: 'walk', group: 'fest', text: 'Du bist offline', where: { file: 'public/offline.html', line: 12 },
    })
    expect(steps.find(step => step.id === 'fixed:manifest.description')).toMatchObject({ kind: 'fixed', section: 'unpictured', group: 'fest', sightings: [] })
    expect(steps.find(step => step.id === 'mono:app/components/Clock.vue')).toMatchObject({
      kind: 'mono', section: 'walk', group: 'mono', text: null, marks: ['mono'], what: 'Die Uhr',
    })
    expect(steps.find(step => step.id === 'vote.count')).toMatchObject({ kind: 'message', section: 'unpictured', group: 'vote', text: '{n} Stimme | {n} Stimmen' })
  })

  it('shows the unused groups last, as the file lists them, with their keys and no text', () => {
    const { steps } = stepsOf({ messages, recording, unused })
    const last = steps.slice(-2)
    expect(last.map(step => step.id)).toEqual(['unused:wheel', 'unused:stepper'])
    expect(last[0]).toMatchObject({ kind: 'unused', section: 'unused', group: 'wheel', text: null, sightings: [], marks: [], where: null })
    expect(last[0]?.keys).toEqual([{ key: 'wheel.older', text: 'Älter' }])
    expect(last[1]?.keys).toEqual([{ key: 'stepper.title', text: 'Neues Event' }])
  })

  it('keeps the locale’s order when two texts were first seen at the same seq', () => {
    const tied = asRecording(recordingOf({ messages: [recorded('vote.yes', 1), recorded('common.save', 1)] }))
    expect(ids(stepsOf({ messages, recording: tied, unused: null }).steps).slice(0, 2)).toEqual(['common.save', 'vote.yes'])
  })

  it('carries the location of a key the walk never saw, best effort', () => {
    const located = asRecording(recordingOf({ locations: { 'home.empty': { file: 'app/pages/index.vue', line: 31 } } }))
    const { steps } = stepsOf({ messages, recording: located, unused: null })
    expect(steps.find(step => step.id === 'home.empty')?.where).toEqual({ file: 'app/pages/index.vue', line: 31 })
    expect(steps.find(step => step.id === 'home.title')?.where).toBeNull()
  })
})

describe('stepsOf: edges', () => {
  it('without a recording every key is a text without a picture, legal still last before unused', () => {
    const { steps, problems } = stepsOf({ messages, recording: null, unused: null })
    expect(problems).toEqual([])
    expect(steps.map(step => step.section)).toEqual([
      ...messages.filter(m => !m.key.startsWith('legal.')).map(() => 'unpictured'),
      'legal', 'legal', 'legal',
    ])
    expect(steps[0]?.sightings).toEqual([])
    expect(steps[0]?.marks).toEqual([])
  })

  it('has no steps at all for no messages, and one step for one message', () => {
    expect(stepsOf({ messages: [], recording: null, unused: null })).toEqual({ steps: [], problems: [] })
    const one = stepsOf({ messages: [{ key: 'a.b', text: 'Eins' }], recording: asRecording(recordingOf({ messages: [recorded('a.b', 1)] })), unused: { groups: [] } })
    expect(ids(one.steps)).toEqual(['a.b'])
  })

  it('handles two messages, one seen and one not', () => {
    const two = [{ key: 'a', text: 'Eins' }, { key: 'b', text: 'Zwei' }]
    const { steps } = stepsOf({ messages: two, recording: asRecording(recordingOf({ messages: [recorded('b', 1)] })), unused: null })
    expect(steps.map(step => [step.id, step.section])).toEqual([['b', 'walk'], ['a', 'unpictured']])
    expect(steps[1]).toMatchObject({ group: 'a' })
  })

  it('treats an empty recording and an empty unused list as none', () => {
    const { steps, problems } = stepsOf({ messages, recording: asRecording(recordingOf()), unused: { groups: [] } })
    expect(problems).toEqual([])
    expect(steps).toHaveLength(messages.length)
  })

  it('names a key both recorded and unused: it stays a picture step, and an emptied group goes', () => {
    const unused = { groups: [{ group: 'stepper', keys: [{ key: 'stepper.title', text: 'Neues Event' }] }] }
    const { steps, problems } = stepsOf({ messages, recording: asRecording(recordingOf({ messages: [recorded('stepper.title', 1)] })), unused })
    expect(steps[0]).toMatchObject({ id: 'stepper.title', section: 'walk' })
    expect(ids(steps)).not.toContain('unused:stepper')
    expect(problems).toEqual([expect.stringContaining('stepper.title')])
  })

  it('names a recorded key the locale no longer has, and drops its step', () => {
    const { steps, problems } = stepsOf({ messages, recording: asRecording(recordingOf({ messages: [recorded('gone.key', 1), recorded('vote.yes', 2)] })), unused: null })
    expect(ids(steps)).not.toContain('gone.key')
    expect(steps[0]?.id).toBe('vote.yes')
    expect(problems).toEqual([expect.stringContaining('gone.key')])
  })

  it('ignores an unused key the locale does not have, with a problem', () => {
    const unused = { groups: [{ group: 'wheel', keys: [{ key: 'wheel.old', text: 'Alt' }, { key: 'wheel.never', text: 'Nie' }] }] }
    const { steps, problems } = stepsOf({ messages, recording: null, unused })
    expect(steps.at(-1)?.keys).toEqual([{ key: 'wheel.old', text: 'Alt' }])
    expect(problems).toEqual([expect.stringContaining('wheel.never')])
  })

  it('does not list an unused key as a text without a picture', () => {
    const unused = { groups: [{ group: 'wheel', keys: [{ key: 'wheel.old', text: 'Alt' }] }] }
    expect(ids(stepsOf({ messages, recording: null, unused }).steps)).not.toContain('wheel.old')
  })

  it('merges the sightings of a key recorded twice, with a problem', () => {
    const doubled = asRecording(recordingOf({ messages: [recorded('vote.yes', 5), recorded('vote.yes', 2)] }))
    const { steps, problems } = stepsOf({ messages, recording: doubled, unused: null })
    expect(steps.filter(step => step.id === 'vote.yes')).toHaveLength(1)
    expect(steps[0]?.sightings.map(s => s.seq)).toEqual([2, 5])
    expect(problems).toEqual([expect.stringContaining('vote.yes')])
  })

  it('unites the marks of the sightings', () => {
    const marked = asRecording(recordingOf({
      messages: [{ key: 'vote.yes', sightings: [seeing(1), seeing(2, { marks: ['sr-only'] }), seeing(3, { marks: ['mono'] })] }],
    }))
    expect(stepsOf({ messages, recording: marked, unused: null }).steps[0]?.marks).toEqual(['mono', 'sr-only'])
  })
})

describe('sightingToShow', () => {
  const marked = asRecording(recordingOf({
    messages: [{ key: 'vote.yes', sightings: [seeing(1), seeing(2, { marks: ['sr-only'] }), seeing(3, { marks: ['mono'] }), seeing(4, { marks: ['mono', 'sr-only'] })] }],
  }))
  const step = stepsOf({ messages, recording: marked, unused: null }).steps[0]!

  it('is the first sighting, or the first one carrying the filtered mark', () => {
    expect(sightingToShow(step, [])?.seq).toBe(1)
    expect(sightingToShow(step, ['open'])?.seq).toBe(1)
    expect(sightingToShow(step, ['mono'])?.seq).toBe(3)
    expect(sightingToShow(step, ['sr-only'])?.seq).toBe(2)
  })

  it('is null without a sighting', () => {
    const none = stepsOf({ messages, recording: null, unused: null }).steps[0]!
    expect(sightingToShow(none, ['mono'])).toBeNull()
  })
})

describe('filterSteps', () => {
  const recording = asRecording(recordingOf({
    messages: [
      recorded('common.save', 1),
      { key: 'home.title', sightings: [seeing(2), seeing(3, { marks: ['mono'] })] },
      { key: 'vote.yes', sightings: [seeing(4, { marks: ['sr-only'] })] },
    ],
    monoElements: [{ component: 'app/components/Clock.vue', what: 'Die Uhr', sightings: [seeing(5, { marks: ['mono'] })] }],
    fixed: [{ id: 'offline.title', text: 'Du bist offline', file: 'public/offline.html', line: 12, sightings: [seeing(6)] }],
  }))
  const unused = { groups: [{ group: 'wheel', keys: [{ key: 'wheel.old', text: 'Alt' }] }] }
  const { steps } = stepsOf({ messages, recording, unused })
  let answers = emptyAnswers('2026-11-20')
  answers = answerText(answers, 'common.save', { text: 'Speichern', answer: 'passt' })
  answers = answerText(answers, 'home.title', { text: 'Deine Events', answer: 'alternativen', alternatives: ['Alle Events'] })
  answers = answerText(answers, 'vote.yes', { text: 'Passt', comment: 'nur ein Kommentar' })
  answers = answerText(answers, 'fixed:offline.title', { text: 'Du bist offline', answer: 'alternativen' })
  answers = answerMono(answers, 'app/components/Clock.vue', 'ok')
  const baseline = answerText(emptyAnswers('2026-11-01'), 'common.save', { text: 'Speichern', answer: 'passt' })
  const context = { answers, baseline }
  const pick = (filters: Parameters<typeof filterSteps>[1], source = steps) => ids(filterSteps(source, filters, context))

  it('shows everything without a filter, in order', () => {
    expect(pick([])).toEqual(ids(steps))
  })

  it('mono keeps the steps with a mono mark, and a mono element always holds it', () => {
    expect(pick(['mono'])).toEqual(['home.title', 'mono:app/components/Clock.vue'])
  })

  it('sr-only keeps the steps with that mark', () => {
    expect(pick(['sr-only'])).toEqual(['vote.yes'])
  })

  it('open keeps what is not answered: a comment alone stays open, a mono element and an unused group count once they have an entry', () => {
    expect(pick(['open'])).toEqual(expect.arrayContaining(['vote.yes', 'vote.count', 'unused:wheel']))
    expect(pick(['open'])).not.toContain('common.save')
    expect(pick(['open'])).not.toContain('mono:app/components/Clock.vue')
    expect(pick(['open'])).not.toContain('fixed:offline.title')
  })

  it('alternatives keeps the texts answered „Alternativen bitte“, fixed ones included', () => {
    expect(pick(['alternatives'])).toEqual(['home.title', 'fixed:offline.title'])
  })

  it('new keeps the texts the baseline lacks or whose text changed, and never a mono element or an unused group', () => {
    const fresh = pick(['new'])
    expect(fresh).not.toContain('common.save')
    expect(fresh).toContain('home.title')
    expect(fresh).toContain('fixed:offline.title')
    expect(fresh).not.toContain('mono:app/components/Clock.vue')
    expect(fresh).not.toContain('unused:wheel')
  })

  it('combines filters with AND and keeps the order', () => {
    expect(pick(['mono', 'open'])).toEqual([])
    expect(pick(['mono', 'new'])).toEqual(['home.title'])
    expect(pick(['alternatives', 'new'])).toEqual(['home.title', 'fixed:offline.title'])
  })

  it('mono + open together keeps an open step with a mono mark', () => {
    const open = filterSteps(steps, ['mono', 'open'], { answers: emptyAnswers('2026-11-20'), baseline: null })
    expect(ids(open)).toEqual(['home.title', 'mono:app/components/Clock.vue'])
  })
})

describe('isAnswered and progressOf', () => {
  const five = [
    { key: 'a', text: 'A' }, { key: 'b', text: 'B' }, { key: 'c', text: 'C' }, { key: 'd', text: 'D' }, { key: 'e', text: 'E' },
  ]
  const { steps } = stepsOf({ messages: five, recording: asRecording(recordingOf({ messages: five.map((m, i) => recorded(m.key, i + 1)) })), unused: null })

  it('resumes at the first open step of a partly filled file', () => {
    let answers = emptyAnswers('2026-11-20')
    for (const key of ['a', 'b', 'c']) answers = answerText(answers, key, { text: key.toUpperCase(), answer: 'passt' })
    expect(progressOf(steps, answers)).toEqual({ total: 5, done: 3, left: 2, firstOpen: 3 })
  })

  it('leaves a step with only a comment open', () => {
    let answers = emptyAnswers('2026-11-20')
    answers = answerText(answers, 'a', { text: 'A', comment: 'später' })
    answers = answerText(answers, 'b', { text: 'B', answer: 'passt' })
    expect(isAnswered(steps[0]!, answers)).toBe(false)
    expect(progressOf(steps, answers)).toEqual({ total: 5, done: 1, left: 4, firstOpen: 0 })
  })

  it('is firstOpen -1 when everything is answered or there are no steps', () => {
    let answers = emptyAnswers('2026-11-20')
    for (const { key, text } of five) answers = answerText(answers, key, { text, answer: 'passt' })
    expect(progressOf(steps, answers)).toEqual({ total: 5, done: 5, left: 0, firstOpen: -1 })
    expect(progressOf([], answers)).toEqual({ total: 0, done: 0, left: 0, firstOpen: -1 })
  })

  it('counts a mono element and an unused group as answered once their entry exists', () => {
    const { steps: more } = stepsOf({
      messages,
      recording: asRecording(recordingOf({ monoElements: [{ component: 'app/components/Clock.vue', what: 'Die Uhr', sightings: [seeing(1, { marks: ['mono'] })] }] })),
      unused: { groups: [{ group: 'wheel', keys: [{ key: 'wheel.old', text: 'Alt' }] }] },
    })
    const mono = more.find(step => step.kind === 'mono')!
    const group = more.find(step => step.kind === 'unused')!
    const empty = emptyAnswers('2026-11-20')
    expect([isAnswered(mono, empty), isAnswered(group, empty)]).toEqual([false, false])
    expect(isAnswered(mono, answerMono(empty, 'app/components/Clock.vue', ''))).toBe(true)
    expect(isAnswered(group, answerUnused(empty, 'wheel', 'behalten'))).toBe(true)
  })
})

describe('isNewSince', () => {
  const step = (id: string, text: string, kind: 'message' | 'fixed' = 'message') => ({ id, kind, text }) as Parameters<typeof isNewSince>[0]
  const baseline = (() => {
    let file = emptyAnswers('2026-11-01')
    file = answerText(file, 'a.same', { text: 'Gleich', answer: 'passt' })
    file = answerText(file, 'a.changed', { text: 'Vorher', answer: 'passt' })
    file = answerText(file, 'a.replaced', { text: 'Alt', answer: 'ersetzt', replacement: 'Neu' })
    file = answerText(file, 'a.comment', { text: 'Nur Kommentar', comment: 'hm' })
    file = answerText(file, 'fixed:offline.title', { text: 'Du bist offline', answer: 'passt' })
    return file
  })()

  it('is true for a key the baseline lacks', () => {
    expect(isNewSince(step('a.fresh', 'Neu da'), baseline)).toBe(true)
    expect(isNewSince(step('fixed:other', 'Etwas'), baseline)).toBe(true)
  })

  it('is true for a key whose text is neither what was swept nor its replacement', () => {
    expect(isNewSince(step('a.changed', 'Nachher'), baseline)).toBe(true)
    expect(isNewSince(step('a.replaced', 'Ganz anders'), baseline)).toBe(true)
  })

  it('is false for a key whose text is unchanged, or equals its replacement, or whose entry is only a comment', () => {
    expect(isNewSince(step('a.same', 'Gleich'), baseline)).toBe(false)
    expect(isNewSince(step('a.replaced', 'Neu'), baseline)).toBe(false)
    expect(isNewSince(step('a.replaced', 'Alt'), baseline)).toBe(false)
    expect(isNewSince(step('a.comment', 'Nur Kommentar'), baseline)).toBe(false)
    expect(isNewSince(step('fixed:offline.title', 'Du bist offline', 'fixed'), baseline)).toBe(false)
  })

  it('is true for every text without a baseline', () => {
    expect(isNewSince(step('a.same', 'Gleich'), null)).toBe(true)
    expect(isNewSince(step('fixed:offline.title', 'Du bist offline', 'fixed'), null)).toBe(true)
  })
})

describe('checkRecording', () => {
  const valid = () => recordingOf({
    messages: [recorded('vote.yes', 1)],
    monoElements: [{ component: 'app/components/Clock.vue', what: 'Die Uhr', sightings: [seeing(2, { marks: ['mono'] })] }],
    fixed: [{ id: 'offline.title', text: 'Du bist offline', file: 'public/offline.html', line: null, sightings: [] }],
    locations: { 'home.empty': { file: 'app/pages/index.vue', line: 31 } },
  })

  it('is empty for a valid recording', () => {
    expect(checkRecording(valid())).toEqual([])
    expect(checkRecording(recordingOf())).toEqual([])
  })

  it('names a value that is no recording, without throwing', () => {
    expect(checkRecording(null)).toHaveLength(1)
    expect(checkRecording('x')).toHaveLength(1)
    expect(checkRecording([])).toHaveLength(1)
  })

  it.each([
    ['version', (r: Record<string, unknown>) => { r.version = 2 }],
    ['recordedAt', (r: Record<string, unknown>) => { r.recordedAt = 5 }],
    ['commit', (r: Record<string, unknown>) => { delete r.commit }],
    ['messages', (r: Record<string, unknown>) => { r.messages = {} }],
    ['monoElements', (r: Record<string, unknown>) => { r.monoElements = 'x' }],
    ['fixed', (r: Record<string, unknown>) => { r.fixed = null }],
    ['locations', (r: Record<string, unknown>) => { r.locations = [] }],
  ])('names a wrong %s', (field, spoil) => {
    const value = valid() as Record<string, unknown>
    spoil(value)
    const problems = checkRecording(value)
    expect(problems.length).toBeGreaterThan(0)
    expect(problems.join('\n')).toContain(field)
  })

  it.each([
    ['seq', { seq: '1' }],
    ['seq', { seq: 0 }],
    ['state', { state: 3 }],
    ['account', { account: 'guest' }],
    ['width', { width: '390' }],
    ['box', { box: { x: 0, y: 0, width: 'a', height: 1 } }],
    ['picture', { picture: null }],
    ['rendered', { rendered: 1 }],
    ['via', { via: 'css' }],
    ['marks', { marks: ['bold'] }],
  ])('names a wrong sighting %s, with where it is', (field, patch) => {
    const value = recordingOf({ messages: [{ key: 'vote.yes', sightings: [{ ...seeing(1), ...patch }] }] })
    const problems = checkRecording(value)
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('messages[0].sightings[0].')
    expect(problems[0]).toContain(field)
  })

  it('accepts a signed-out sighting, every account and via, and a line that is null', () => {
    const sightings = [
      seeing(1, { via: 'aria-label' }), { ...seeing(2), account: null }, { ...seeing(3), account: 'member2' as const }, seeing(4, { via: 'server' }),
    ]
    expect(checkRecording(recordingOf({ messages: [{ key: 'a', sightings }] }))).toEqual([])
  })

  it('names a wrong mono element, fixed text and location', () => {
    expect(checkRecording(recordingOf({ monoElements: [{ component: 4, what: 'x', sightings: [] }] }))[0]).toContain('monoElements[0].component')
    expect(checkRecording(recordingOf({ fixed: [{ id: 'a', text: 'b', file: 'c', line: 'x', sightings: [] }] }))[0]).toContain('fixed[0].line')
    expect(checkRecording(recordingOf({ locations: { a: { file: 3, line: 1 } } }))[0]).toContain('locations.a')
  })
})
