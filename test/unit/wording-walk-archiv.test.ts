import { describe, expect, it } from 'vitest'
import de from '../../i18n/locales/de.json'
import { loadStates } from '../../scripts/browser/states.mjs'
import { archiveFake, CLAIMS, UNREACHED } from '../../scripts/browser/walk-states-archiv.mjs'
import { orderStates, sectionOf } from '../../scripts/wording/walk-order.mjs'

// The wording walk's states for the Archive (#888, spec #683 story 68): every text of the list, of its cards and of its states has a state that shows it, the states
// sit in the nav's order (Home, Archiv, Bibliothek), the plain page is the one `archiv` of the dark check (#882: no Construction page any more), and the fake
// that keeps the list to the walk's own Events answers the way the server does. The pictures come from the walk on the dev server (`node scripts/wording/walk.mjs`).

/** The texts of the Archive, as `de.json` has them: every `archiveList` leaf, and the three keys its cards and states show from the copy of other namespaces. */
const ARCHIVE_TEXTS = [
  ...Object.keys(de.archiveList).map(key => `archiveList.${key}`),
  'board.stands',
  'common.host',
  'ceremony.pending.member',
]

/** The states the walk adds for the Archive, and the section each one sits in. */
const NEW_STATES = [
  'archiv-laedt',
  'archiv-leer',
  'archiv-eine',
  'archiv-ohne-datum',
  'archiv-mehrere',
  'archiv-spieler',
  'archiv-gleichstand',
  'archiv-tribuene',
  'archiv-host',
  'archiv-siegerehrung-offen',
  'archiv-alle',
  'archiv-gewonnen',
  'archiv-als-host',
  'archiv-suche',
  'archiv-kein-treffer',
  'archiv-kein-treffer-gewonnen',
  'archiv-noch-kein-sieg',
]

/** The leaves of the copy as `a.b.c`, to check that a claimed key is a key of the copy. */
function leaves(node: unknown, path: string[] = []): string[] {
  if (typeof node === 'string') return [path.join('.')]
  if (node && typeof node === 'object') return Object.entries(node).flatMap(([key, value]) => leaves(value, [...path, key]))
  return []
}
const copy = leaves(de)

const { states } = await loadStates({ extra: 'walk-states-' }) as { states: { name: string, group: string }[] }
const names = states.map(state => state.name)

describe('the walk\'s states for the Archive', () => {
  it('claims every text of the Archive with a state of the walk, or says why no state shows it', () => {
    for (const key of ARCHIVE_TEXTS) expect(key in CLAIMS || key in UNREACHED, key).toBe(true)
  })

  it('claims only keys the copy has, and never a key it also calls unreached', () => {
    for (const key of Object.keys(CLAIMS)) {
      expect(copy, key).toContain(key)
      expect(key in UNREACHED, key).toBe(false)
    }
  })

  it('names only states the walk loads, and each of them exists', () => {
    for (const [key, name] of Object.entries(CLAIMS)) expect(names.includes(name), `${key} → ${name}`).toBe(true)
    for (const name of NEW_STATES) expect(names.includes(name), name).toBe(true)
  })

  it('has its states in the Archive section, the plain page `archiv` of the dark check first', () => {
    const placed = orderStates(states) as { name: string, group: string }[]
    const archive = placed.filter(state => sectionOf(state) === 'archiv').map(state => state.name)
    expect(archive[0]).toBe('archiv')
    expect(archive.slice(1)).toEqual(NEW_STATES)
  })

  it('places the Archive between Home and the Bibliothek, as the nav does', () => {
    const placed = orderStates(states) as { name: string, group: string }[]
    const index = (name: string) => placed.findIndex(state => state.name === name)
    expect(index('home-menue')).toBeLessThan(index('archiv'))
    expect(index('archiv-gewonnen')).toBeLessThan(index('bibliothek'))
  })

  it('no longer holds the Construction page of the Archive: `archiv` is the one state of it', () => {
    expect(names).not.toContain('baustelle-archiv')
    expect(names.filter(name => name === 'archiv')).toHaveLength(1)
  })
})

// The fake of the read: the server's answer, kept to the walk's Events and changed only where it says so. Run here in Node with a stub window: the script is the
// same text the tab evaluates.
describe('the fake of the Archive\'s read', () => {
  const ENTRY = (slug: string) => ({ slug, name: slug, finishedAt: '2026-11-23T10:00:00.000Z', resultOpen: false, isHost: true, seated: true, gameCount: 1, memberCount: 2, format: null })
  const SERVER = { events: ['a', 'b', 'c'].map(ENTRY) }

  function windowWith(calls: string[], answer: unknown = SERVER) {
    const real = async (input: string | { url: string }, init?: { method?: string }) => {
      const url = typeof input === 'string' ? input : input.url
      calls.push(`${init?.method ?? 'GET'} ${url}`)
      return new Response(JSON.stringify(answer), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    const win = { fetch: real } as { fetch: (input: unknown, init?: unknown) => Promise<Response> } & Record<string, unknown>
    new Function('window', 'location', 'Response', 'URL', archiveFake({ keep: ['a', 'c'], edit: null, hold: false }))(win, new URL('http://localhost:3100/profil'), Response, URL)
    return win
  }

  it('keeps the list to the Events it names, in the server\'s order', async () => {
    const calls: string[] = []
    const win = windowWith(calls)
    const answer = await win.fetch('/api/archive', { method: 'GET' }) as Response
    expect((await answer.json()).events.map((entry: { slug: string }) => entry.slug)).toEqual(['a', 'c'])
    expect(calls).toEqual(['GET /api/archive'])
  })

  it('changes the fields it names in the one Event it names, and no other', async () => {
    const calls: string[] = []
    const win = windowWith(calls)
    win.__archiveFake = { keep: null, edit: { b: { finishedAt: null, memberCount: 1 } }, hold: false }
    const answer = await win.fetch('/api/archive', { method: 'GET' }) as Response
    const events = (await answer.json()).events as { slug: string, finishedAt: string | null, memberCount: number }[]
    expect(events.map(entry => [entry.slug, entry.finishedAt === null, entry.memberCount])).toEqual([['a', false, 2], ['b', true, 1], ['c', false, 2]])
  })

  it('never answers the read when it holds it', async () => {
    const calls: string[] = []
    const win = windowWith(calls)
    win.__archiveFake = { keep: null, noDate: null, hold: true }
    const pending = win.fetch('/api/archive', { method: 'GET' })
    const first = await Promise.race([pending.then(() => 'answered'), new Promise(resolve => setTimeout(() => resolve('pending'), 20))])
    expect(first).toBe('pending')
    expect(calls).toEqual([])
  })

  it('lets every other request through, and the switched-off fake changes nothing', async () => {
    const calls: string[] = []
    const win = windowWith(calls)
    const other = await win.fetch('/api/e', { method: 'GET' }) as Response
    expect(await other.json()).toEqual(SERVER)
    win.__archiveFake = null
    const off = await win.fetch('/api/archive', { method: 'GET' }) as Response
    expect((await off.json()).events).toHaveLength(3)
    expect(calls).toEqual(['GET /api/e', 'GET /api/archive'])
  })
})
