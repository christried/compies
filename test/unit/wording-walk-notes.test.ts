import { describe, expect, it } from 'vitest'
import de from '../../i18n/locales/de.json'
import { loadStates } from '../../scripts/browser/states.mjs'
import { CLAIMS, EVENT_NOTES, NOTES_LIMIT, UNREACHED, WALK_NOTES } from '../../scripts/browser/walk-states-notes.mjs'
import { EVENT_NOTES_MAX } from '../../shared/event'
import { GAME_NOTES_MAX } from '../../shared/game'
import { notesLength, parseNotes, type NotesDoc } from '../../shared/notes-doc'

// The plan of the wording walk's states for 0.16's texts (scripts/browser/walk-states-notes.mjs, #810 part b): every text of the notes editor, the Event notes, the
// game's Events and the archive has a picture PLANNED, and the documents the walk sends are documents the server accepts. That the walk gets the pictures is measured
// by its local run (#812); the states themselves need Chrome and the dev server. Every text is claimed by a state or called unreached with its reason: since #826 the
// only unreached one is the editor's `sr-only` loading text, and the editor's load failure has a state that blocks the chunk, pinned at the end with a fake tab.
const walkNotes = WALK_NOTES as NotesDoc
const eventNotes = EVENT_NOTES as NotesDoc
const claims = CLAIMS as Record<string, string>
const unreached = UNREACHED as Record<string, string>

/** The leaves of the copy as `a.b.c`. */
function leaves(node: unknown, path: string[] = []): string[] {
  if (typeof node === 'string') return [path.join('.')]
  if (node && typeof node === 'object') return Object.entries(node).flatMap(([key, value]) => leaves(value, [...path, key]))
  return []
}
const copy = leaves(de)

// The texts of 0.16 that the walk must picture: the notes' own namespaces and the few keys of the library the archive and the Events count added.
const OWN = /^(notes|notesEditor|eventNotes|gameEvents|empty\.library)\./
const LIBRARY = ['library.archiveSwitch', 'library.archiveHelp', 'library.archivedDone', 'library.restoredDone', 'library.restore', 'library.restoreLabel', 'library.archivedMark', 'library.filterArchived', 'library.inEvents', 'gameEdit.allTags']
const planned = copy.filter(key => OWN.test(key) || LIBRARY.includes(key))

describe('the walk\'s notes documents', () => {
  it('are documents the server takes unchanged', () => {
    expect(parseNotes(walkNotes, NOTES_LIMIT)).toEqual(walkNotes)
    expect(parseNotes(eventNotes, NOTES_LIMIT)).toEqual(eventNotes)
  })

  it('are far under the limit, so the editor shows no counter until a state types', () => {
    expect(notesLength(walkNotes)).toBeLessThan(NOTES_LIMIT * 0.8)
    expect(notesLength(eventNotes)).toBeLessThan(NOTES_LIMIT * 0.8)
  })

  it('keep the limit of the library and of the Events as a literal', () => {
    expect(NOTES_LIMIT).toBe(GAME_NOTES_MAX)
    expect(NOTES_LIMIT).toBe(EVENT_NOTES_MAX)
  })
})

describe('the plan of the notes states', () => {
  it('has a state or a reason for every text of 0.16 the walk must picture', () => {
    expect(planned.length).toBeGreaterThan(40)
    for (const key of planned) expect(key in claims || key in unreached, key).toBe(true)
  })

  it('claims only keys the copy has, and never a key it also calls unreached', () => {
    for (const key of Object.keys(claims)) {
      expect(copy, key).toContain(key)
      expect(key in unreached, key).toBe(false)
    }
    for (const key of Object.keys(unreached)) expect(copy, key).toContain(key)
  })

  it('leaves unreached exactly the loading text of the editor\'s placeholder', () => {
    expect(Object.keys(unreached)).toEqual(['notesEditor.loading'])
  })

  it('claims the editor\'s load failure with a state of its own', () => {
    expect(claims['notesEditor.loadFailed']).toBe('bibliothek-neu-editor-ladefehler')
  })

  it('names a state of the walk for every claimed key', async () => {
    const { states } = await loadStates({ extra: 'walk-states-' }) as { states: { name: string }[] }
    const names = new Set(states.map(state => state.name))
    for (const [key, name] of Object.entries(claims)) expect(names.has(name), `${key} → ${name}`).toBe(true)
  })
})

// The state of the failed editor chunk (#826): the walk runs on `pnpm dev`, where a script from the load cannot fail a dynamic import, so the state blocks the file's
// request through the tab's CDP session. A fake tab records the calls; the real page needs Chrome (#812).
describe('the state of the editor that cannot load', () => {
  const BLOCKED = 'http://localhost:3100/_nuxt/components/RichNotesEditor.vue'
  /** Chrome's URL patterns for `Network.setBlockedURLs`: `*` matches any run of characters. */
  const matches = (pattern: string, url: string) => new RegExp(`^${pattern.split('*').map(part => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`).test(url)

  type Call = { method: string, params: Record<string, unknown> }
  async function fakeTab() {
    const calls: Call[] = []
    const waited: string[] = []
    const tab = {
      account: 'host',
      spying: true,
      send: async (method: string, params: Record<string, unknown>) => { calls.push({ method, params }); return { result: {} } },
      evaluate: async (expression: string) => { waited.push(expression); return true },
    }
    const { states } = await loadStates({ extra: 'walk-states-' }) as { states: { name: string, group: string, stops?: unknown[], open: (ctx: unknown) => Promise<void>, after: (ctx: unknown) => Promise<void> }[] }
    const state = states.find(entry => entry.name === 'bibliothek-neu-editor-ladefehler')!
    return { calls, waited, tab, ctx: { tab, width: 1440, height: 900, appearance: 'dark' }, state, names: states.map(entry => entry.name) }
  }

  it('sits in the library group, beside the empty editor, with no stops', async () => {
    const { state, names } = await fakeTab()
    expect(state.group).toBe('library')
    expect(names.indexOf('bibliothek-neu-editor-ladefehler')).toBe(names.indexOf('bibliothek-neu-editor') + 1)
    expect(state.stops ?? []).toEqual([])
  })

  it('blocks the editor\'s file before the page opens, and only that file', async () => {
    const { calls, ctx, state } = await fakeTab()
    await state.open(ctx)
    const methods = calls.map(call => call.method)
    expect(methods).toContain('Network.enable')
    expect(methods).toContain('Network.setBlockedURLs')
    expect(methods.indexOf('Network.setBlockedURLs')).toBeLessThan(methods.indexOf('Page.navigate'))
    const urls = calls.find(call => call.method === 'Network.setBlockedURLs')!.params.urls as string[]
    expect(urls.some(pattern => matches(pattern, BLOCKED))).toBe(true)
    expect(urls.some(pattern => matches(pattern, `${BLOCKED}?t=1700000000000`))).toBe(true)
    for (const other of ['RichNotesEditorLoader.vue', 'RichNotesEditorFallback.vue']) expect(urls.some(pattern => matches(pattern, BLOCKED.replace('RichNotesEditor.vue', other)))).toBe(false)
  })

  it('opens /bibliothek/neu and waits for the notice, not for the editor', async () => {
    const { calls, waited, ctx, state } = await fakeTab()
    await state.open(ctx)
    expect(decodeURIComponent(calls.find(call => call.method === 'Page.navigate')!.params.url as string)).toContain('/bibliothek/neu')
    expect(waited.some(expression => expression.includes(de.notesEditor.loadFailed))).toBe(true)
    expect(waited.some(expression => expression.includes('data-notes-editor'))).toBe(false)
  })

  it('lifts the block again after the reading, also when the open threw', async () => {
    const lifted = { method: 'Network.setBlockedURLs', params: { urls: [] } }
    const read = await fakeTab()
    await read.state.open(read.ctx)
    await read.state.after(read.ctx)
    expect(read.calls.at(-1)).toEqual(lifted)

    const thrown = await fakeTab()
    thrown.tab.send = async (method, params) => {
      thrown.calls.push({ method, params })
      if (method === 'Page.navigate') throw new Error('navigation failed')
      return { result: {} }
    }
    await expect(thrown.state.open(thrown.ctx)).rejects.toThrow('navigation failed')
    await thrown.state.after(thrown.ctx)
    expect(thrown.calls.at(-1)).toEqual(lifted)
  })
})
