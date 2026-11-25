import { describe, expect, it } from 'vitest'
import de from '../../i18n/locales/de.json'
import { loadStates } from '../../scripts/browser/states.mjs'
import { CLAIMS, UNREACHED, kontoFake } from '../../scripts/browser/walk-states-konto.mjs'
import { orderStates, sectionOf } from '../../scripts/wording/walk-order.mjs'

// The wording walk's states for the texts 0.21 adds or changes (#921, spec #907): every one of them has a state that shows it, or a reason why no state can, the states sit in the
// order a User meets them, and the fake that makes a call of the Profil page fail or hang answers as it says and lets every other request through. The pictures themselves come from the
// walk on the dev server (`node scripts/wording/walk.mjs --only=<states>`); this file pins the plan.

/** The leaves of the copy as `a.b.c`. */
function leaves(node: unknown, path: string[] = []): string[] {
  if (typeof node === 'string') return [path.join('.')]
  if (node && typeof node === 'object') return Object.entries(node).flatMap(([key, value]) => leaves(value, [...path, key]))
  return []
}
const copy = leaves(de)

/** The texts 0.21 adds or changes, as `git diff origin/main -- i18n/locales/de.json` shows them (the copy the review has not seen yet). */
const TEXTS_021 = [
  'common.deletedUser',
  'profile.upload',
  'profile.removeImage',
  'profile.avatarHelpOwn',
  'profile.imageRemoveFailed',
  'profile.imageUploading',
  'profile.imageConverting',
  'profile.imageConvertFailed',
  'profile.imageUploadFailed',
  ...Object.keys(de.accountDelete).map(key => `accountDelete.${key}`),
  'error.imageUnsupported',
  'legal.datenschutz.storage.heading',
  'legal.datenschutz.storage.text',
  'legal.datenschutz.signIn.text',
  'legal.datenschutz.avatar.text',
  'legal.datenschutz.retention.text',
  'legal.datenschutz.rights.text',
  'legal.datenschutz.changes.text',
]

/** The states 0.21 adds to the walk, and the section each one sits in. */
const NEW_STATES: Record<string, string> = {
  'profil-bild-zuschneiden': 'profil',
  'profil-bild-umwandeln': 'profil',
  'profil-bild-umwandeln-fehler': 'profil',
  'profil-bild-laedt-hoch': 'profil',
  'profil-bild-hochladen-fehler': 'profil',
  'profil-bild-eigenes': 'profil',
  'profil-bild-entfernen-fehler': 'profil',
  'konto-loeschen-ohne-events': 'profil',
  'konto-loeschen-ein-event': 'profil',
  'konto-loeschen-mehrere': 'profil',
  'konto-loeschen-zaehlt': 'profil',
  'konto-loeschen-zaehlen-fehler': 'profil',
  'konto-loeschen-fehler': 'profil',
  'geloescht-host': 'event',
  'geloescht-spieler': 'event',
  'geloescht-weg-geloescht-spieler': 'event',
  'geloescht-weg-ungueltig-spieler': 'event',
}

type State = { name: string, group: string }
const { states } = await loadStates({ extra: 'walk-states-' }) as { states: State[] }
const names = states.map(state => state.name)
const claims = CLAIMS as Record<string, string>
const unreached = UNREACHED as Record<string, string>

describe('the walk\'s states for the texts of 0.21', () => {
  it('claims every text 0.21 adds or changes with a state, or says why no state shows it', () => {
    for (const key of TEXTS_021) expect(key in claims || key in unreached, key).toBe(true)
  })

  it('claims only keys the copy has, and never a key it also calls unreached', () => {
    for (const key of Object.keys(claims)) {
      expect(copy, key).toContain(key)
      expect(key in unreached, key).toBe(false)
    }
    for (const [key, why] of Object.entries(unreached)) {
      expect(copy, key).toContain(key)
      expect(why.trim().length, key).toBeGreaterThan(0)
    }
  })

  it('leaves unreached exactly the one text no surface shows', () => {
    expect(Object.keys(unreached)).toEqual(['error.imageUnsupported'])
  })

  it('names only states the walk loads (the pair\'s sides counted), and each new one exists', () => {
    const known = new Set(names)
    for (const [key, name] of Object.entries(claims)) {
      expect(known.has(name) || known.has(`${name}-host`) || known.has(`${name}-spieler`), `${key} → ${name}`).toBe(true)
    }
    for (const name of Object.keys(NEW_STATES)) expect(known.has(name), name).toBe(true)
  })

  it('has unique state names across every state file of the walk', () => {
    expect(new Set(names).size).toBe(names.length)
  })

  it('places each new state in the section a User meets it in', () => {
    for (const [name, section] of Object.entries(NEW_STATES)) expect(sectionOf(states.find(state => state.name === name)!), name).toBe(section)
  })

  it('keeps the walk order complete: every loaded state has a place', () => {
    expect(orderStates(states)).toHaveLength(states.length)
  })

  it('puts the card\'s picture states before the sheet of „Konto löschen“, both behind the Profil states that save', () => {
    const placed = orderStates(states) as State[]
    const at = (name: string) => placed.findIndex(state => state.name === name)
    const picture = Object.keys(NEW_STATES).filter(name => name.startsWith('profil-bild-')).map(at)
    const sheet = Object.keys(NEW_STATES).filter(name => name.startsWith('konto-loeschen-')).map(at)
    expect(Math.min(...picture)).toBeGreaterThan(at('profil-weniger-bewegung-fehler'))
    expect(Math.max(...picture)).toBeLessThan(Math.min(...sheet))
    expect(Math.max(...sheet)).toBeLessThan(at('baustelle-admin'))
  })

  it('puts the Deleted User\'s Event after the finished states, and the Event that is gone last', () => {
    const placed = orderStates(states) as State[]
    const at = (name: string) => placed.findIndex(state => state.name === name)
    const finished = placed.flatMap((state, index) => (state.group === 'event-finished' ? [index] : []))
    expect(at('geloescht-host')).toBeGreaterThan(Math.max(...finished))
    expect(at('geloescht-spieler')).toBeGreaterThan(at('geloescht-host'))
    expect(at('geloescht-weg-geloescht-spieler')).toBeGreaterThan(at('geloescht-spieler'))
    expect(at('geloescht-weg-ungueltig-spieler')).toBeGreaterThan(at('geloescht-weg-geloescht-spieler'))
    for (const name of ['geloescht-host', 'geloescht-spieler', 'geloescht-weg-geloescht-spieler', 'geloescht-weg-ungueltig-spieler']) expect(placed[at(name)]!.group).toBe('event-konto')
  })
})

// The fake of the Profil page's calls: run here in Node with a stub window, as the script the tab evaluates.
describe('the fake of the Profil page\'s calls', () => {
  type Win = { fetch: (input: string, init?: { method?: string }) => Promise<Response>, createImageBitmap?: unknown, __kontoFake?: unknown }
  function tabWith(config: object, calls: string[]) {
    const real = async (input: string, init?: { method?: string }) => {
      calls.push(`${init?.method ?? 'GET'} ${input}`)
      return new Response('{"real":true}', { status: 200, headers: { 'content-type': 'application/json' } })
    }
    const win: Win = { fetch: real, createImageBitmap: () => Promise.resolve('bitmap') }
    new Function('window', 'location', 'Response', 'URL', kontoFake(config))(win, new URL('http://localhost:3000/profil'), Response, URL)
    return win
  }
  const settled = async (promise: Promise<unknown>) => Promise.race([promise.then(() => 'answered'), new Promise(resolve => setTimeout(() => resolve('pending'), 20))])

  it('answers the read of the counts with the counts, a 500, or never', async () => {
    const calls: string[] = []
    const counted = await tabWith({ hosted: { events: 3, games: 12 } }, calls).fetch('/api/me/hosted')
    expect(await counted.json()).toEqual({ events: 3, games: 12 })
    expect((await tabWith({ hosted: 'fail' }, calls).fetch('/api/me/hosted')).status).toBe(500)
    expect(await settled(tabWith({ hosted: 'hold' }, calls).fetch('/api/me/hosted'))).toBe('pending')
    expect(calls).toEqual([])
  })

  it('fails or holds the upload, fails the removal and the deletion, each only on its own request', async () => {
    const calls: string[] = []
    expect((await tabWith({ put: 'fail' }, calls).fetch('/api/me/image', { method: 'PUT' })).status).toBe(500)
    expect(await settled(tabWith({ put: 'pending' }, calls).fetch('/api/me/image', { method: 'PUT' }))).toBe('pending')
    expect((await tabWith({ removeFail: true }, calls).fetch('/api/me/image', { method: 'DELETE' })).status).toBe(500)
    expect((await tabWith({ deleteFail: true }, calls).fetch('/api/me', { method: 'DELETE' })).status).toBe(500)
    expect(calls).toEqual([])
  })

  it('lets every other request through, and the switched-off fake changes nothing', async () => {
    const calls: string[] = []
    const win = tabWith({ put: 'fail', removeFail: true, deleteFail: true, hosted: 'fail' }, calls)
    expect((await win.fetch('/api/me/image', { method: 'DELETE' })).status).toBe(500)
    expect((await win.fetch('/api/e', { method: 'GET' })).status).toBe(200)
    expect((await win.fetch('/api/me/image', { method: 'PUT' })).status).toBe(500)
    win.__kontoFake = null
    expect((await win.fetch('/api/me', { method: 'DELETE' })).status).toBe(200)
    expect(calls).toEqual(['GET /api/e', 'DELETE /api/me'])
  })

  it('holds the conversion only when it is asked to', async () => {
    const calls: string[] = []
    const plain = tabWith({ put: 'fail' }, calls)
    expect(await (plain.createImageBitmap as () => Promise<string>)()).toBe('bitmap')
    const held = tabWith({ bitmap: 'hold' }, calls)
    expect(await settled((held.createImageBitmap as () => Promise<string>)())).toBe('pending')
  })
})
