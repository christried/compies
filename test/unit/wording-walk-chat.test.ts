import { describe, expect, it } from 'vitest'
import de from '../../i18n/locales/de.json'
import { loadStates } from '../../scripts/browser/states.mjs'
import { CLAIMS, UNREACHED, WAIT_MS } from '../../scripts/browser/walk-states-chat.mjs'
import { orderStates, sectionOf } from '../../scripts/wording/walk-order.mjs'
import { EMOTE_PAGE_WAIT_MS } from '../../shared/emote'

// The plan of the wording walk's states for 0.18's texts (scripts/browser/walk-states-chat.mjs, #773, spec #719): every text of the Chat and the Emotes has a picture PLANNED.
// That the walk gets the pictures is measured by its own run on the dev server; the states need Chrome. Every key is claimed by a state or called unreached with its reason.
const claims = CLAIMS as Record<string, string>
const unreached = UNREACHED as Record<string, string>

/** The leaves of the copy as `a.b.c`. */
function leaves(node: unknown, path: string[] = []): string[] {
  if (typeof node === 'string') return [path.join('.')]
  if (node && typeof node === 'object') return Object.entries(node).flatMap(([key, value]) => leaves(value, [...path, key]))
  return []
}
const copy = leaves(de)

// The texts the walk must picture: the Chat's, the Emotes' and the Chat's empty state, and the four reasons the Chat's calls can show (`error.rateLimited` under a limited send, the
// other three after a delete, `error.messageInvalid` being the one no surface shows).
const OWN = /^(chat|emote|empty\.chat)\./
const ERRORS = ['error.messageInvalid', 'error.messageNotFound', 'error.messageNotYours', 'error.rateLimited']
const planned = copy.filter(key => OWN.test(key) || ERRORS.includes(key))

type State = { name: string, group: string }
const walkStates = async () => (await loadStates({ extra: 'walk-states-' }) as { states: State[] }).states

describe('the plan of the Chat and Emote states', () => {
  it('has a state or a reason for every text of the Chat and the Emotes', () => {
    expect(planned.length).toBeGreaterThanOrEqual(30)
    for (const key of planned) expect(key in claims || key in unreached, key).toBe(true)
  })

  it('claims only keys the copy has, and never a key it also calls unreached', () => {
    for (const key of Object.keys(claims)) {
      expect(copy, key).toContain(key)
      expect(key in unreached, key).toBe(false)
    }
    for (const key of Object.keys(unreached)) expect(copy, key).toContain(key)
  })

  it('leaves unreached exactly the one text no surface shows, with its reason', () => {
    expect(Object.keys(unreached).sort()).toEqual(['error.messageInvalid'])
    for (const [key, reason] of Object.entries(unreached)) expect(reason.trim().length, key).toBeGreaterThan(0)
  })

  it('names a state of the walk for every claimed key', async () => {
    const names = new Set((await walkStates()).map(state => state.name))
    for (const [key, name] of Object.entries(claims)) {
      expect(names.has(name) || names.has(`${name}-host`) || names.has(`${name}-spieler`), `${key} → ${name}`).toBe(true)
    }
  })

  it('has unique state names across every state file of the walk', async () => {
    const names = (await walkStates()).map(state => state.name)
    expect(new Set(names).size).toBe(names.length)
  })
})

describe('the Emote wait the walk holds', () => {
  it('is the page\'s wait, so the patch holds the timer the bar starts and no other', () => {
    expect(WAIT_MS).toBe(EMOTE_PAGE_WAIT_MS)
  })
})

describe('the order of the Chat and Emote states', () => {
  const OWN_STATE = /^(emote|chat)-/

  it('places every one of them in the event section without throwing', async () => {
    const own = (await walkStates()).filter(state => OWN_STATE.test(state.name))
    expect(own.length).toBeGreaterThan(20)
    for (const state of own) expect(sectionOf(state), state.name).toBe('event')
    expect(() => orderStates(own)).not.toThrow()
  })

  it('puts the Emotes and the live Chat after the live states and before the finished ones, the finished Chat among the finished', async () => {
    const ordered = orderStates(await walkStates())
    const index = (predicate: (state: State) => boolean) => ordered.flatMap((state, at) => (predicate(state) ? [at] : []))
    const live = index(state => state.group === 'event-live')
    const emotes = index(state => state.group === 'event-emote')
    const chat = index(state => state.group === 'event-chat')
    const finished = index(state => state.group === 'event-finished')
    expect(emotes.length).toBeGreaterThan(0)
    expect(chat.length).toBeGreaterThan(0)
    expect(Math.min(...emotes)).toBeGreaterThan(Math.max(...live))
    expect(Math.min(...chat)).toBeGreaterThan(Math.max(...emotes))
    expect(Math.max(...chat)).toBeLessThan(Math.min(...finished))
    const chatFinished = ordered.filter(state => state.name.startsWith('chat-fertig'))
    expect(chatFinished.length).toBeGreaterThan(0)
    for (const state of chatFinished) expect(state.group).toBe('event-finished')
  })
})
