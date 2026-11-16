import { describe, expect, it } from 'vitest'
import { assemble, budgetId, createBudget, dedupeItems, SIGHTINGS_PER_KEY, selectItems } from '../../scripts/wording/recording.mjs'
import { checkRecording } from '../../scripts/wording/review-model.mjs'

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
