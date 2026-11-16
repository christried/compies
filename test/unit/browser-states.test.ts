import { describe, expect, it } from 'vitest'
import { loadStates } from '../../scripts/browser/states.mjs'
import { orderStates, sectionOf } from '../../scripts/wording/walk-order.mjs'

// The one source of the state lists (scripts/browser/states.mjs, #629): the dark check and the wording walk both read it. The lists are
// read from the real `dark-states-*.mjs` files, because the loader's job is exactly to find them; what a state does in a browser is not tested here.
type State = { name: string, group: string, account: string, open: unknown }
const { states } = await loadStates() as { states: State[] }
const fake = (name: string, group: string) => ({ name, group, account: 'host', open: async () => {} })

describe('loadStates', () => {
  it('gives states with a unique name, a group, an account and an open', () => {
    expect(states.length).toBeGreaterThan(60)
    expect(new Set(states.map(state => state.name)).size).toBe(states.length)
    for (const state of states) {
      expect(typeof state.name).toBe('string')
      expect(typeof state.group).toBe('string')
      expect(['host', 'member', 'admin']).toContain(state.account)
      expect(typeof state.open).toBe('function')
    }
  })

  it('gives the cleanup of every file that has one', async () => {
    const { cleanups } = await loadStates()
    expect(cleanups.length).toBeGreaterThan(0)
    for (const cleanup of cleanups) expect(typeof cleanup).toBe('function')
  })

  it('loads no walk-states file unless asked', async () => {
    const plain = await loadStates()
    const asked = await loadStates({ extra: 'walk-states-' })
    expect(asked.states.length).toBe(plain.states.length)
  })
})

describe('orderStates', () => {
  const ordered = orderStates(states) as State[]
  const at = (name: string) => ordered.findIndex(state => state.name === name)

  it('places every state of the real lists once', () => {
    expect(ordered).toHaveLength(states.length)
    expect(new Set(ordered.map(state => state.name))).toEqual(new Set(states.map(state => state.name)))
  })

  it('goes signed out, setup, Home, library, stepper, the Event, Profil', () => {
    const sections = ordered.map(state => sectionOf(state))
    const firsts = ['signed-out', 'setup', 'home', 'library', 'stepper', 'event', 'profil'].map(id => sections.indexOf(id))
    expect(firsts).toEqual([...firsts].sort((a, b) => a - b))
    expect(firsts[0]).toBe(0)
    expect(ordered[0]?.group).toBe('signed-out')
    expect(at('einrichten')).toBe(states.filter(state => state.group === 'signed-out').length)
    expect(sections.at(-1)).toBe('profil')
    expect(ordered.at(-1)?.name).toBe('baustelle-event')
  })

  it('keeps Home in the order the table names it', () => {
    expect(['home-leer', 'home', 'home-menue', 'was-ist-neu'].map(at)).toEqual([at('home-leer'), at('home-leer') + 1, at('home-leer') + 2, at('home-leer') + 3])
  })

  it('goes through the Event page groups in order, and the file order inside a group', () => {
    const groupAt = (group: string) => ordered.flatMap((state, i) => (state.group === group ? [i] : []))
    const [poll, board, live, finished] = ['event-poll', 'event-board', 'event-live', 'event-finished'].map(groupAt)
    expect(Math.max(...poll!)).toBeLessThan(Math.min(...board!))
    expect(Math.max(...board!)).toBeLessThan(Math.min(...live!))
    expect(Math.max(...live!)).toBeLessThan(Math.min(...finished!))
    // 0.12's states sit at the end of the file: `teamwahl-wort` belongs to the board, after `teamwahl`.
    expect(at('teamwahl-wort-host')).toBeGreaterThan(at('teamwahl-spieler'))
    expect(at('teamwahl-wort-host')).toBeLessThan(at('rad-vorher-host'))
  })

  it('throws, naming the state, when one fits no section', () => {
    expect(() => orderStates([...states, fake('gibt-es-nicht-state', 'neue-gruppe')])).toThrow(/gibt-es-nicht-state/)
  })

  it('lets a name rule win over a group rule', () => {
    expect(sectionOf(fake('einrichten', 'signed-out'))).toBe('setup')
    expect(sectionOf(fake('profil', 'library'))).toBe('profil')
  })
})
