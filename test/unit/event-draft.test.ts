import { describe, expect, it } from 'vitest'
import { addPoolGame, draftBody, draftFromEvent, newDraft, settingsBody, settingsOf, togglePoolGame, vetoAllowanceOf, type EventDraft } from '../../app/utils/event-draft'
import type { EventView, PoolGame } from '../../shared/event'
import { defaultSettings, parseSettings, type EventSettings } from '../../shared/settings'

// The stepper's draft (#144): what the Host has entered so far, and the body that „Event erstellen“ sends.

describe('newDraft', () => {
  it('starts with no name, the default settings and one empty Slot in a Date poll', () => {
    expect(newDraft()).toEqual({
      name: '',
      settings: { format: 'teams', teamCount: 2, teamSize: 3, gameCount: 10, pointsTable: { preset: 'linear', values: [1, 0] }, selectionMode: 'admin_pick' },
      hiddenWheel: false,
      vetoAllowance: null,
      pools: { main: [], tiebreaker: [] },
      dates: { mode: 'poll', sessionCount: 1, slots: [''], direct: [''] },
    })
  })

  it('gives every draft its own lists', () => {
    expect(newDraft().dates.slots).not.toBe(newDraft().dates.slots)
    expect(newDraft().pools.main).not.toBe(newDraft().pools.main)
  })
})

describe('draftBody', () => {
  it('sends a Date poll with its Slots, the trimmed name and the settings', () => {
    const draft = newDraft()
    draft.name = '  Freitags-Zocken '
    draft.dates.slots = ['2090-10-30T20:30', '2090-10-31T19:00']
    draft.dates.sessionCount = 2

    expect(draftBody(draft)).toEqual({
      name: 'Freitags-Zocken',
      dateMode: 'poll',
      sessions: 2,
      slots: ['2090-10-30T20:30', '2090-10-31T19:00'],
      settings: defaultSettings(),
      pools: { main: [], tiebreaker: [] },
    })
  })

  it('sends direct Dates as startsAt, one per Session', () => {
    const draft = newDraft()
    draft.name = 'Abend'
    draft.dates = { mode: 'direct', sessionCount: 2, slots: ['2090-10-30T20:30'], direct: ['2090-11-07T20:00', '2090-11-08T19:00'] }

    expect(draftBody(draft)).toEqual({
      name: 'Abend',
      dateMode: 'direct',
      sessions: 2,
      startsAt: ['2090-11-07T20:00', '2090-11-08T19:00'],
      settings: defaultSettings(),
      pools: { main: [], tiebreaker: [] },
    })
  })

  it('sends the ids of the games in both pools', () => {
    let draft = togglePoolGame(newDraft(), 'main', game('a', 'Mario Kart'))
    draft = togglePoolGame(draft, 'main', game('b', 'Pong'))
    draft = togglePoolGame(draft, 'tiebreaker', game('b', 'Pong'))

    expect(draftBody(draft).pools).toEqual({ main: ['a', 'b'], tiebreaker: ['b'] })
  })

  it('sends settings the server accepts', () => {
    expect(parseSettings(draftBody(newDraft()).settings).ok).toBe(true)
  })
})

function game(id: string, name: string): PoolGame {
  return { id, name, imageUrl: null, youtubeId: null, clipStart: 0, clipLength: 30, playersMin: null, playersMax: null, suitabilities: [] }
}

// The pool steps (#146): the draft keeps the games themselves, so the step and Fertig can show them.
describe('the pools', () => {
  it('adds a game that is not in the pool, and takes it out when it is', () => {
    const kart = game('a', 'Mario Kart')

    const added = togglePoolGame(newDraft(), 'main', kart)
    expect(added.pools.main).toEqual([kart])

    expect(togglePoolGame(added, 'main', kart).pools.main).toEqual([])
  })

  it('keeps the order in which games were added', () => {
    let draft = newDraft()
    for (const [id, name] of [['c', 'Zelda'], ['a', 'Alpha'], ['b', 'Beta']] as const) draft = togglePoolGame(draft, 'main', game(id, name))

    expect(draft.pools.main.map(entry => entry.name)).toEqual(['Zelda', 'Alpha', 'Beta'])
  })

  it('keeps the two pools apart: a game may be in both', () => {
    const kart = game('a', 'Mario Kart')

    const draft = togglePoolGame(togglePoolGame(newDraft(), 'main', kart), 'tiebreaker', kart)
    expect(draft.pools).toEqual({ main: [kart], tiebreaker: [kart] })

    expect(togglePoolGame(draft, 'main', kart).pools).toEqual({ main: [], tiebreaker: [kart] })
  })

  it('adds a game once, however often it is added', () => {
    const kart = game('a', 'Mario Kart')

    const draft = addPoolGame(addPoolGame(newDraft(), 'tiebreaker', kart), 'tiebreaker', kart)

    expect(draft.pools.tiebreaker).toEqual([kart])
  })

  it('does not change the draft it was given', () => {
    const draft = newDraft()

    togglePoolGame(draft, 'main', game('a', 'Mario Kart'))
    addPoolGame(draft, 'main', game('a', 'Mario Kart'))

    expect(draft.pools).toEqual({ main: [], tiebreaker: [] })
  })
})

// The Selection mode step (#145): the Glücksrad's options live in the draft while Admin pick is chosen, and
// `settingsOf` is the one place that derives the stored settings from them.
describe('the stored settings', () => {
  const wheelDraft = (patch: Partial<EventDraft> = {}, mode: EventSettings['selectionMode'] = 'lucky_wheel'): EventDraft => {
    const draft = newDraft()
    return { ...draft, settings: { ...draft.settings, selectionMode: mode }, ...patch }
  }

  it('are the default settings for a new draft', () => {
    expect(settingsOf(newDraft())).toEqual(defaultSettings())
  })

  it('give the Glücksrad the Host’s hidden wheel and Veto allowance', () => {
    expect(settingsOf(wheelDraft({ hiddenWheel: true, vetoAllowance: 5 }))).toMatchObject({ selectionMode: 'lucky_wheel', hiddenWheel: true, vetoAllowance: 5 })
  })

  it('let the Veto allowance follow the Team size until the Host sets one: max(3, Team size)', () => {
    const draft = wheelDraft()
    expect(settingsOf(draft).vetoAllowance).toBe(3)

    const bigger = { ...draft, settings: { ...draft.settings, teamSize: 5 } }
    expect(settingsOf(bigger).vetoAllowance).toBe(5)
    expect(vetoAllowanceOf(bigger)).toBe(5)
  })

  it('keep a Veto allowance the Host has set when the Team size changes, even at the default value', () => {
    const draft = wheelDraft({ vetoAllowance: 2 })
    expect(settingsOf({ ...draft, settings: { ...draft.settings, teamSize: 5 } }).vetoAllowance).toBe(2)

    const atDefault = wheelDraft({ vetoAllowance: 3 })
    expect(settingsOf({ ...atDefault, settings: { ...atDefault.settings, teamSize: 5 } }).vetoAllowance).toBe(3)
  })

  it('have no wheel options with Admin pick, while the draft keeps them so the Glücksrad gets them back', () => {
    const draft = wheelDraft({ hiddenWheel: true, vetoAllowance: 5 }, 'admin_pick')

    expect(settingsOf(draft)).toMatchObject({ selectionMode: 'admin_pick', hiddenWheel: false, vetoAllowance: null })
    expect(settingsOf({ ...draft, settings: { ...draft.settings, selectionMode: 'lucky_wheel' } })).toMatchObject({ hiddenWheel: true, vetoAllowance: 5 })
  })

  it('are what both bodies send, and the server accepts them', () => {
    const draft = wheelDraft({ hiddenWheel: true, vetoAllowance: 2 })

    expect(draftBody(draft).settings).toEqual(settingsOf(draft))
    expect(settingsBody(draft).settings).toEqual(settingsOf(draft))
    expect(parseSettings(settingsOf(draft)).ok).toBe(true)
    expect(parseSettings(settingsOf(wheelDraft({ hiddenWheel: true }, 'admin_pick'))).ok).toBe(true)
  })

  it('do not change the draft they were made from', () => {
    const draft = wheelDraft({ vetoAllowance: null })

    settingsOf(draft)

    expect(draft.vetoAllowance).toBeNull()
    expect(draft.settings).not.toHaveProperty('vetoAllowance')
  })
})

// The settings editor (#147): a draft made from an Event that exists, and the body of its PATCH.
describe('the editor draft', () => {
  const kart = game('a', 'Mario Kart')
  const pong = game('b', 'Pong')

  function view(settings: EventView['settings'], pools: EventView['pools'] = { hidden: false, main: [], tiebreaker: [] }): EventView {
    return { settings, pools } as EventView
  }

  it('starts from the Event’s settings and pools', () => {
    const settings = { ...defaultSettings(), teamSize: 4, gameCount: 7 }

    const draft = draftFromEvent(view(settings, { hidden: false, main: [kart, pong], tiebreaker: [pong] }))

    expect(settingsOf(draft)).toEqual(settings)
    expect(draft.pools).toEqual({ main: [kart, pong], tiebreaker: [pong] })
  })

  it('starts from the defaults for an Event that is not set up, without a chosen Veto allowance', () => {
    const draft = draftFromEvent(view(null))

    expect(settingsOf(draft)).toEqual(defaultSettings())
    expect(draft.vetoAllowance).toBeNull()
  })

  it('counts a stored Veto allowance as the Host’s choice: a Team size change leaves it alone', () => {
    const stored = { ...defaultSettings(), selectionMode: 'lucky_wheel' as const, hiddenWheel: true, vetoAllowance: 2 }

    const draft = draftFromEvent(view(stored))
    expect(draft).toMatchObject({ hiddenWheel: true, vetoAllowance: 2 })

    expect(settingsOf({ ...draft, settings: { ...draft.settings, teamSize: 5 } }).vetoAllowance).toBe(2)
    expect(settingsOf(draft)).toEqual(stored)
  })

  it('does not count an Admin pick Event’s missing Veto allowance as chosen: the Glücksrad then follows the Team size', () => {
    const draft = draftFromEvent(view({ ...defaultSettings(), teamSize: 2 }))
    expect(draft.vetoAllowance).toBeNull()

    const wheel = { ...draft, settings: { ...draft.settings, selectionMode: 'lucky_wheel' as const, teamSize: 5 } }

    expect(settingsOf(wheel).vetoAllowance).toBe(5)
  })

  it('has no games when the pools are hidden from the viewer', () => {
    const draft = draftFromEvent(view(defaultSettings(), { hidden: true, mainCount: 2, tiebreakerCount: 1 }))

    expect(draft.pools).toEqual({ main: [], tiebreaker: [] })
  })

  it('sends the settings and the ids of both pools, which the server accepts', () => {
    const draft = togglePoolGame(togglePoolGame(draftFromEvent(view(defaultSettings())), 'main', kart), 'tiebreaker', pong)

    const body = settingsBody(draft)

    expect(body).toEqual({ settings: defaultSettings(), pools: { main: ['a'], tiebreaker: ['b'] } })
    expect(parseSettings(body.settings).ok).toBe(true)
  })
})
