import { describe, expect, it } from 'vitest'
import de from '../../i18n/locales/de.json'
import { loadStates } from '../../scripts/browser/states.mjs'
import { CLAIMS, EVENT_NOTES, NOTES_LIMIT, UNREACHED, WALK_NOTES } from '../../scripts/browser/walk-states-notes.mjs'
import { EVENT_NOTES_MAX } from '../../shared/event'
import { GAME_NOTES_MAX } from '../../shared/game'
import { notesLength, parseNotes, type NotesDoc } from '../../shared/notes-doc'

// The plan of the wording walk's states for 0.16's texts (scripts/browser/walk-states-notes.mjs, #810 part b): every text of the notes editor, the Event notes, the
// game's Events and the archive has a picture PLANNED, and the documents the walk sends are documents the server accepts. That the walk gets the pictures is measured
// by its local run (#812); the states themselves need Chrome and the dev server.
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

  it('leaves unreached exactly the dead text of a finished Event\'s editor', () => {
    expect(Object.keys(unreached)).toEqual(['notesEditor.finishedHelp'])
  })

  it('names a state of the walk for every claimed key', async () => {
    const { states } = await loadStates({ extra: 'walk-states-' }) as { states: { name: string }[] }
    const names = new Set(states.map(state => state.name))
    for (const [key, name] of Object.entries(claims)) expect(names.has(name), `${key} → ${name}`).toBe(true)
  })
})
