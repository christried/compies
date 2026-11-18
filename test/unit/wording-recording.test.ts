import { describe, expect, it } from 'vitest'
import { answerText, emptyAnswers } from '../../scripts/wording/answers.mjs'
import { assemble, budgetId, createBudget, dedupeItems, SIGHTINGS_PER_KEY, selectItems, wheelPlaceholderKeys } from '../../scripts/wording/recording.mjs'
import { checkRecording } from '../../scripts/wording/review-model.mjs'
import { isLocalBase, reportOf, withoutPicture } from '../../scripts/wording/walk-report.mjs'

// What the wording walk makes of its readings (scripts/wording/recording.mjs, #629): items with their pictures in, the recording of #628's
// typedef out. Everything that needs Chrome (the page scripts, the pictures) is measured by running the walk, not here.
const BOX = { x: 10, y: 20, width: 100, height: 30 }
const MONO_TABLE = { 'app/components/HostDock.vue': 'Taste „H“ im Host-Dock', 'app/components/ClipPreview.vue': 'Clip-Zeiten' }
const COMMIT = 'abc1234'
const AT = '2026-11-20T10:00:00.000Z'

type Item = { key: string | null, via: string, rendered: string, box: typeof BOX, picture: string, marks: string[], component: string | null, element: string, fixedId?: string }
const item = (fields: Partial<Item> = {}): Item => ({ key: 'home.title', via: 'text', rendered: 'Deine Events', box: BOX, picture: 'pictures/0.jpg', marks: [], component: 'app/pages/index.vue', element: 'h1', ...fields })
const reading = (items: Item[], fields: Partial<{ state: string, account: string | null, width: number }> = {}) => ({ state: 'home', account: 'host', width: 1440, items, ...fields })
// The recording as these tests read it: loosely typed, because they look at fields of entries that the typedef makes optional or exact.
type Sighting = { seq: number, state: string, account: string | null, width: number, box: typeof BOX, picture: string, rendered: string, via: string, marks: string[] }
type Made = { version: number, recordedAt: string, commit: string, messages: { key: string, sightings: Sighting[] }[], monoElements: { component: string, what: string, sightings: Sighting[] }[], fixed: { id: string, text: string, file: string, line: number | null, sightings: Sighting[] }[], locations: Record<string, unknown> }
const make = (readings: ReturnType<typeof reading>[], extra: Record<string, unknown> = {}) => assemble({ readings, fixed: [], mono: MONO_TABLE, locations: {}, commit: COMMIT, recordedAt: AT, ...extra } as never) as unknown as Made

describe('assemble', () => {
  it('gives a recording that checkRecording accepts, even for nothing read', () => {
    expect(checkRecording(make([]))).toEqual([])
    const full = make([reading([item(), item({ key: 'home.sub', via: 'aria-label', marks: ['sr-only'] })])])
    expect(checkRecording(full)).toEqual([])
    expect(full).toMatchObject({ version: 1, commit: COMMIT, recordedAt: AT })
  })

  it('numbers the sightings from 1 over the readings, in order', () => {
    const recording = make([
      reading([item({ key: 'a.one' }), item({ key: 'a.two' })]),
      reading([item({ key: 'a.three' })], { state: 'home-menue', width: 390 }),
    ])
    expect(recording.messages.flatMap((entry: { sightings: { seq: number }[] }) => entry.sightings.map(s => s.seq))).toEqual([1, 2, 3])
  })

  it('gives two readings of one key one message with two sightings, each with its state and width', () => {
    const recording = make([reading([item()]), reading([item()], { state: 'profil', width: 390 })])
    expect(recording.messages).toHaveLength(1)
    expect(recording.messages[0]!.key).toBe('home.title')
    expect(recording.messages[0]!.sightings.map((s: { state: string, width: number }) => [s.state, s.width])).toEqual([['home', 1440], ['profil', 390]])
  })

  it('carries the fields of a Sighting and nothing of the item beyond them', () => {
    const [sighting] = make([reading([item({ rendered: 'Hallo', via: 'placeholder' })])]).messages[0]!.sightings
    expect(sighting).toEqual({ seq: 1, state: 'home', account: 'host', width: 1440, box: BOX, picture: 'pictures/0.jpg', rendered: 'Hallo', via: 'placeholder', marks: [] })
  })

  it('keeps a mono and a non-mono sighting of one key in one message, which then carries the mono mark', () => {
    const recording = make([reading([item({ key: 'common.counter', marks: ['mono'] }), item({ key: 'common.counter', via: 'title' })])])
    expect(recording.messages).toHaveLength(1)
    expect(recording.messages[0]!.sightings.map((s: { marks: string[] }) => s.marks)).toEqual([['mono'], []])
  })

  it('gives an untagged mono item an entry per component, two readings one entry with two sightings', () => {
    const dock = item({ key: null, rendered: 'H', marks: ['mono'], component: 'app/components/HostDock.vue', element: 'kbd' })
    const recording = make([reading([dock]), reading([dock], { state: 'rad-vorher-host' })])
    const entry = recording.monoElements.find((e: { component: string }) => e.component === 'app/components/HostDock.vue')
    expect(entry).toMatchObject({ what: 'Taste „H“ im Host-Dock' })
    expect(entry!.sightings).toHaveLength(2)
    expect(recording.messages).toEqual([])
  })

  it('gives a tabled component that was never seen an entry with no sightings', () => {
    const recording = make([reading([item()])])
    expect(recording.monoElements.map((e: { component: string, sightings: unknown[] }) => [e.component, e.sightings.length])).toEqual([['app/components/HostDock.vue', 0], ['app/components/ClipPreview.vue', 0]])
  })

  it('labels a component that is not in the table by its file name', () => {
    const recording = make([reading([item({ key: null, marks: ['mono'], component: 'app/components/Neu/Etwas.vue', element: 'span' })])])
    expect(recording.monoElements.find((e: { component: string }) => e.component === 'app/components/Neu/Etwas.vue')?.what).toBe('Mono-Element in Etwas.vue')
  })

  it('puts an item with a fixed id into fixed, and lists every fixed text, seen or not', () => {
    const fixed = [
      { id: 'offline.heading', text: 'Keine Verbindung.', file: 'public/offline.html', line: 53 },
      { id: 'offline.button', text: 'Seite neu laden', file: 'public/offline.html', line: 55 },
    ]
    const recording = make([reading([item({ key: null, fixedId: 'offline.heading', rendered: 'Keine Verbindung.' })], { state: 'offline', account: null, width: 390 })], { fixed })
    expect(recording.fixed.map((e: { id: string, sightings: unknown[] }) => [e.id, e.sightings.length])).toEqual([['offline.heading', 1], ['offline.button', 0]])
    expect(recording.fixed[0]).toMatchObject({ text: 'Keine Verbindung.', file: 'public/offline.html', line: 53 })
    expect(recording.messages).toEqual([])
  })

  it('gives the sightings of a signed-out reading no account', () => {
    const recording = make([reading([item()], { state: 'anmelden', account: null })])
    expect(recording.messages[0]!.sightings[0]!.account).toBeNull()
    expect(checkRecording(recording)).toEqual([])
  })

  it('keeps the box of the element a screen-reader label names, as the item gave it', () => {
    const labelled = { x: 5, y: 6, width: 48, height: 48 }
    const recording = make([reading([item({ key: 'common.close', via: 'aria-label', marks: ['sr-only'], box: labelled })])])
    expect(recording.messages[0]!.sightings[0]!).toMatchObject({ box: labelled, marks: ['sr-only'] })
  })

  it('passes the locations through', () => {
    const recording = make([], { locations: { 'a.b': { file: 'app/x.vue', line: 3 } } })
    expect(recording.locations).toEqual({ 'a.b': { file: 'app/x.vue', line: 3 } })
  })
})

describe('dedupeItems', () => {
  it('gives one item for the same key and via in one reading, and keeps different marks apart', () => {
    const out = dedupeItems([item(), item(), item({ via: 'aria-label' }), item({ marks: ['mono'] })])
    expect(out).toHaveLength(3)
  })

  it('keeps the first of a key that Home shows 278 times, in document order', () => {
    const rows = Array.from({ length: 278 }, (_, i) => item({ key: 'mvp.home.hostYou', rendered: `Du ${i}` }))
    const out = dedupeItems([item({ key: 'home.title' }), ...rows])
    expect(out.map((o: Item) => o.key)).toEqual(['home.title', 'mvp.home.hostYou'])
    expect(out[1]!.rendered).toBe('Du 0')
  })

  it('takes one mono item per component and element name', () => {
    const mono = (element: string, component = 'app/components/HostDock.vue') => item({ key: null, marks: ['mono'], element, component })
    expect(dedupeItems([mono('kbd'), mono('kbd'), mono('span'), mono('kbd', 'app/components/ClipPreview.vue')])).toHaveLength(3)
  })
})

describe('selectItems', () => {
  const known = new Set(['home.title', 'home.sub'])

  it('leaves out a key that is not in de.json and counts it', () => {
    const { kept, missing } = selectItems([item({ key: 'home.title' }), item({ key: 'gibt.es.nicht' }), item({ key: 'gibt.es.nicht', via: 'title' })], known)
    expect(kept.map((o: Item) => o.key)).toEqual(['home.title'])
    expect(missing).toEqual(['gibt.es.nicht'])
  })

  it('does not look for a key in the items that have none', () => {
    const { kept } = selectItems([item({ key: null, marks: ['mono'], component: 'app/components/HostDock.vue' }), item({ key: null, fixedId: 'offline.title' })], known)
    expect(kept).toHaveLength(2)
  })
})

describe('budgetId', () => {
  const idFor = (fields: Partial<Item>) => budgetId(fields as never)
  it('counts a mono use and a screen-reader use of a key apart from its plain ones, and a mono use per component', () => {
    const plain = idFor(item({ key: 'common.counter' }))
    const monoA = idFor(item({ key: 'common.counter', marks: ['mono'], component: 'app/components/TextField.vue' }))
    const monoB = idFor(item({ key: 'common.counter', marks: ['mono'], component: 'app/components/NoteEditor.vue' }))
    const hidden = idFor(item({ key: 'common.counter', via: 'aria-label', marks: ['sr-only'] }))
    expect(new Set([plain, monoA, monoB, hidden]).size).toBe(4)
    expect(idFor(item({ key: 'common.counter', via: 'title' }))).toBe(plain)
  })

  it('is the mono component for an element with no message and the fixed id for a fixed text', () => {
    expect(idFor(item({ key: null, marks: ['mono'], component: 'app/components/HostDock.vue' }))).toBe('mono:app/components/HostDock.vue')
    expect(idFor(item({ key: null, fixedId: 'offline.title' }))).toBe('fixed:offline.title')
  })
})

describe('createBudget', () => {
  it('keeps the first six sightings of a key and counts the rest as dropped', () => {
    const budget = createBudget()
    expect(SIGHTINGS_PER_KEY).toBe(6)
    const taken = Array.from({ length: 9 }, () => (budget.full('home.title') ? false : (budget.use('home.title'), true)))
    expect(taken).toEqual([true, true, true, true, true, true, false, false, false])
    budget.drop()
    expect(budget.dropped).toBe(1)
    expect(budget.full('home.sub')).toBe(false)
  })

  it('goes back to a snapshot, for a state that is read again', () => {
    const budget = createBudget(2)
    budget.use('a')
    const snapshot = budget.snapshot()
    budget.use('a')
    budget.drop()
    budget.restore(snapshot)
    expect(budget.full('a')).toBe(false)
    expect(budget.dropped).toBe(0)
  })
})

// The walk makes a Host and Events, so it runs only against the local dev server (Hell only, the local dev database; #620).
describe('isLocalBase', () => {
  it('takes the loopback names with a port', () => {
    for (const base of ['http://localhost:3100', 'http://127.0.0.1:3000', 'http://localhost:3100/']) expect(isLocalBase(base)).toBe(true)
  })

  it('refuses staging, production, another host that starts like a local one, and a base without a port', () => {
    for (const base of ['https://staging.compies.de', 'https://compies.de', 'http://localhost.evil.example:3100', 'http://localhost', 'https://localhost:3100', 'http://127.0.0.1:3100@evil.example', 'http://localhost:3100/x']) expect(isLocalBase(base)).toBe(false)
  })
})

// The Hidden wheel's placeholders are server-drawn: a spin's labels reach the Member as plain strings, so the keys are read from them (#810).
describe('wheelPlaceholderKeys', () => {
  const placeholders = Array.from({ length: 30 }, (_, i) => `Platzhalter ${i}`)

  it('gives the 30 keys for the 30 labels of a spin, in any order', () => {
    const labels = [...placeholders].reverse()
    expect(wheelPlaceholderKeys(labels, placeholders)).toEqual(labels.map(label => `wheel.placeholders.${placeholders.indexOf(label)}`))
    expect(new Set(wheelPlaceholderKeys(placeholders, placeholders)).size).toBe(30)
  })

  it('gives 29 when a real name stands among the labels (a late read: the result slice shows the game)', () => {
    const labels = [...placeholders.slice(0, 12), 'Ein echtes Spiel', ...placeholders.slice(13)]
    const keys = wheelPlaceholderKeys(labels, placeholders)
    expect(keys).toHaveLength(29)
    expect(keys).not.toContain('wheel.placeholders.12')
  })

  it('gives nothing for the ??? of a wheel at rest, an empty label and a name that is no placeholder', () => {
    expect(wheelPlaceholderKeys(['???', '', 'Ein echtes Spiel'], placeholders)).toEqual([])
    expect(wheelPlaceholderKeys([], placeholders)).toEqual([])
  })

  it('gives a key once when a label stands twice', () => {
    expect(wheelPlaceholderKeys(['Platzhalter 3', 'Platzhalter 3', 'Platzhalter 4'], placeholders)).toEqual(['wheel.placeholders.3', 'wheel.placeholders.4'])
  })
})

// The report names every new text that still has no picture, and why (#810): the check that the walk's states reach the new texts.
describe('withoutPicture', () => {
  type Step = Parameters<typeof withoutPicture>[0]['steps'][number]
  const step = (id: string, fields: Partial<Step> = {}) => ({ id, kind: 'message', section: 'unpictured', group: id.split('.')[0]!, text: `Text von ${id}`, what: null, keys: [], sightings: [], marks: [], where: null, ...fields }) as Step
  // The baseline holds `old.same` as it is today and `old.changed` as it was.
  const baseline = answerText(answerText(emptyAnswers('2026-11-16'), 'old.same', { text: 'Text von old.same', answer: 'passt' }), 'old.changed', { text: 'Früher', answer: 'passt' })
  const none = new Map<string, 'notPainted' | 'covered'>()

  it('names a new text that no state reached, with its first reference when the recording has one', () => {
    const found = withoutPicture({ steps: [step('new.a', { where: { file: 'app/components/A.vue', line: 12 } }), step('new.b'), step('new.c', { where: { file: 'app/pages/c.vue', line: null } })], baseline, skipped: none })
    expect(found).toEqual([
      { id: 'new.a', reason: 'not reached by any state, referenced at app/components/A.vue:12' },
      { id: 'new.b', reason: 'not reached by any state, no reference found' },
      { id: 'new.c', reason: 'not reached by any state, referenced at app/pages/c.vue' },
    ])
  })

  it('says why a text the walk read could not be pictured', () => {
    const skipped = new Map<string, 'notPainted' | 'covered'>([['new.hidden', 'notPainted'], ['new.layer', 'covered']])
    expect(withoutPicture({ steps: [step('new.hidden'), step('new.layer')], baseline, skipped })).toEqual([
      { id: 'new.hidden', reason: 'screen-reader only, no painted box' },
      { id: 'new.layer', reason: 'covered by a layer each time' },
    ])
  })

  it('names a new key of an unused group, which has no step of its own', () => {
    const unused = step('unused:wheel', { kind: 'unused', section: 'unused', group: 'wheel', text: null, keys: [{ key: 'wheel.gone', text: 'Weg' }, { key: 'old.same', text: 'Text von old.same' }, { key: 'legal.gone', text: 'Recht' }] })
    expect(withoutPicture({ steps: [unused], baseline, skipped: none })).toEqual([{ id: 'wheel.gone', reason: 'unused: no code refers to it' }])
  })

  it('leaves out a legal text, a text with a picture, a text the baseline holds unchanged and a mono step', () => {
    const steps = [
      step('legal.title', { section: 'legal' }),
      step('new.pictured', { section: 'walk' }),
      step('old.same'),
      step('mono:app/components/Clock.vue', { kind: 'mono', text: null }),
    ]
    expect(withoutPicture({ steps, baseline, skipped: none })).toEqual([])
  })

  it('counts a text the baseline holds in another wording as new, and every text as new without a baseline', () => {
    expect(withoutPicture({ steps: [step('old.changed')], baseline, skipped: none }).map(entry => entry.id)).toEqual(['old.changed'])
    expect(withoutPicture({ steps: [step('old.same')], baseline: null, skipped: none }).map(entry => entry.id)).toEqual(['old.same'])
  })

  it('names a fixed text that no state reached by its file', () => {
    const fixed = step('fixed:offline.title', { kind: 'fixed', group: 'fest', text: 'Du bist offline', where: { file: 'public/offline.html', line: 5 } })
    expect(withoutPicture({ steps: [fixed], baseline, skipped: none })).toEqual([{ id: 'fixed:offline.title', reason: 'not reached by any state, referenced at public/offline.html:5' }])
  })
})

describe('reportOf: new texts without a picture', () => {
  const input = (unpictured: { id: string, reason: string }[]) => ({
    run: 'walk', commit: COMMIT, seconds: 1, partial: false, statesRead: 1, unreached: [], readings: 1, sightings: 1, dropped: 0, covered: 0, notPainted: 0,
    pictures: { count: 1, bytes: 0, folder: '/tmp/x' }, steps: [], stepProblems: [], unusedNote: null, monoUses: [], unlabelled: [], fixed: { withPicture: 0, without: 0 },
    unpictured, missing: [], untagged: 0, monoFamily: null, notes: [],
  })

  it('has one `key  reason` line per text under its heading', () => {
    const lines = reportOf(input([{ id: 'notes.title', reason: 'not reached by any state, no reference found' }, { id: 'tour.live', reason: 'screen-reader only, no painted box' }]))
    const at = lines.indexOf('New texts without a picture (2):')
    expect(at).toBeGreaterThan(-1)
    expect(lines.slice(at + 1, at + 3)).toEqual(['  notes.title  not reached by any state, no reference found', '  tour.live  screen-reader only, no painted box'])
  })

  it('says none when there is none', () => {
    expect(reportOf(input([]))).toContain('New texts without a picture (0): none')
  })
})
