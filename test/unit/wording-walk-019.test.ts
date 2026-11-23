import { describe, expect, it } from 'vitest'
import { loadStates } from '../../scripts/browser/states.mjs'
import { CLAIMS } from '../../scripts/browser/walk-states-notes.mjs'
import { FAKE_MOTION_FAIL } from '../../scripts/browser/walk-states-forms.mjs'
import { orderStates, sectionOf } from '../../scripts/wording/walk-order.mjs'

// The wording walk's states for the texts 0.19 adds or changes (#861, spec #856): every one of them has a state that shows it, the states sit in the order a Host
// meets them, and the one state that makes a save fail (`settings.motionSaveFailed`) answers with a failure without touching anything else. The pictures themselves
// come from the walk on the dev server (`node scripts/wording/walk.mjs --only=<states>`); this file pins the plan.

/** The texts 0.19 adds or changes, as `git diff origin/main -- i18n/locales/de.json` shows them (the copy the review has not seen yet). */
const TEXTS_019 = [
  'notes.add',
  'notes.edit_a11y',
  'notes.open_a11y',
  'gameEdit.duplicate',
  'gameEdit.duplicateArchived',
  'gameEdit.useExisting',
  'gameEdit.openArchived',
  'settings.motion',
  'settings.motionHelp',
  'settings.motionSaveFailed',
  'legal.datenschutz.cookies.text',
  'legal.datenschutz.changes.text',
]

/** The states 0.19 adds to the walk, and the section each one sits in. */
const NEW_STATES: Record<string, string> = {
  'bibliothek-karte-schlagworte': 'library',
  'bibliothek-karte-notizen': 'library',
  'bibliothek-neu-doppelt': 'library',
  'bibliothek-neu-doppelt-archiviert': 'library',
  'neu-spiele-doppelt': 'stepper',
  'profil-weniger-bewegung-fehler': 'profil',
}

describe('the walk\'s states for the texts of 0.19', () => {
  it('claims every text 0.19 adds or changes with a state of the walk', async () => {
    for (const key of TEXTS_019) expect(key in CLAIMS, key).toBe(true)
  })

  it('names only states the walk loads, and each of them exists', async () => {
    const { states } = await loadStates({ extra: 'walk-states-' }) as { states: { name: string }[] }
    const names = new Set(states.map(state => state.name))
    for (const key of TEXTS_019) expect(names.has(CLAIMS[key as keyof typeof CLAIMS]), key).toBe(true)
    for (const name of Object.keys(NEW_STATES)) expect(names.has(name), name).toBe(true)
  })

  it('places each new state in the section a User meets it in', async () => {
    const { states } = await loadStates({ extra: 'walk-states-' }) as { states: { name: string, group: string }[] }
    for (const [name, section] of Object.entries(NEW_STATES)) {
      const state = states.find(entry => entry.name === name)
      expect(state, name).toBeDefined()
      expect(sectionOf(state!), name).toBe(section)
    }
  })

  it('keeps the walk order complete: every loaded state has a place', async () => {
    const { states } = await loadStates({ extra: 'walk-states-' }) as { states: { name: string, group: string }[] }
    expect(orderStates(states)).toHaveLength(states.length)
  })

  it('puts the failed-save state of „Weniger Bewegung“ right after the Profil states that save', async () => {
    const { states } = await loadStates({ extra: 'walk-states-' }) as { states: { name: string }[] }
    const names = states.map(state => state.name)
    expect(names.indexOf('profil-weniger-bewegung-fehler')).toBeGreaterThan(names.indexOf('profil-gespeichert'))
  })
})

// The failing save (`settings.motionSaveFailed`): the walk replaces `window.fetch` in the tab, so the one POST of the switch answers 500 and the rest of the page's
// requests go on as they are. Run here in Node with a stub window: the script is the same text the tab evaluates.
describe('the fake that makes the „Weniger Bewegung“ save fail', () => {
  function tabWith(calls: string[]) {
    const real = async (input: string, init?: { method?: string }) => {
      calls.push(`${init?.method ?? 'GET'} ${input}`)
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
    }
    const win = { fetch: real }
    new Function('window', 'location', 'Response', `${FAKE_MOTION_FAIL}`)(win, new URL('http://localhost:3100/profil'), Response)
    return win
  }

  it('answers POST /api/me/motion with a 500', async () => {
    const calls: string[] = []
    const win = tabWith(calls)
    const answer = await win.fetch('/api/me/motion', { method: 'POST' } as never)
    expect(answer.status).toBe(500)
    expect(calls).toEqual([])
  })

  it('lets every other request through to the page', async () => {
    const calls: string[] = []
    const win = tabWith(calls)
    const answer = await win.fetch('/api/e', { method: 'GET' } as never)
    expect(answer.status).toBe(200)
    expect(calls).toEqual(['GET /api/e'])
  })
})
