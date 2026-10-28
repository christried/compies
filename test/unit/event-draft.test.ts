import { describe, expect, it } from 'vitest'
import { addPoolGame, chooseMode, draftBody, draftFromEvent, followTeamSize, newDraft, setHiddenWheel, settingsBody, setVetoAllowance, togglePoolGame } from '../../app/utils/event-draft'
import type { EventView, PoolGame } from '../../shared/event'
import { defaultSettings, parseSettings } from '../../shared/settings'

// The stepper's draft (#144): what the Host has entered so far, and the body that „Session erstellen“ sends.

describe('newDraft', () => {
  it('starts with no name, the default settings and one empty Slot in a Date poll', () => {
    expect(newDraft()).toEqual({
      name: '',
      settings: defaultSettings(),
      touched: { vetoAllowance: false },
      wheel: { hiddenWheel: false, vetoAllowance: 3 },
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

// The Selection mode step (#145): the Lucky Wheel's options live in the draft while Admin pick is chosen.
describe('the Selection mode', () => {
  it('chooses the Lucky Wheel with the wheel options the Host set', () => {
    const draft = setHiddenWheel(newDraft(), true)

    const chosen = chooseMode(draft, 'lucky_wheel')

    expect(chosen.settings).toMatchObject({ selectionMode: 'lucky_wheel', hiddenWheel: true, vetoAllowance: 3 })
  })

  it('goes back to Admin pick without wheel options, and restores the Host’s wheel options when the Lucky Wheel comes back', () => {
    let draft = setHiddenWheel(newDraft(), true)
    draft = setVetoAllowance(draft, 5)

    const admin = chooseMode(draft, 'admin_pick')
    expect(admin.settings).toMatchObject({ selectionMode: 'admin_pick', hiddenWheel: false, vetoAllowance: null })
    expect(admin.wheel).toEqual({ hiddenWheel: true, vetoAllowance: 5 })

    const wheel = chooseMode(admin, 'lucky_wheel')
    expect(wheel.settings).toMatchObject({ selectionMode: 'lucky_wheel', hiddenWheel: true, vetoAllowance: 5 })
  })

  it('does not change the draft it was given', () => {
    const draft = newDraft()

    chooseMode(draft, 'lucky_wheel')
    setVetoAllowance(draft, 7)

    expect(draft.settings.selectionMode).toBe('admin_pick')
    expect(draft.touched.vetoAllowance).toBe(false)
  })

  it('sets the Veto allowance and marks it as touched', () => {
    const draft = setVetoAllowance(chooseMode(newDraft(), 'lucky_wheel'), 2)

    expect(draft.touched.vetoAllowance).toBe(true)
    expect(draft.wheel.vetoAllowance).toBe(2)
    expect(draft.settings.vetoAllowance).toBe(2)
  })

  it('follows the Team size with an untouched Veto allowance: 3 becomes 5 when the Team size goes to 5', () => {
    let draft = chooseMode(newDraft(), 'lucky_wheel')
    draft = { ...draft, settings: { ...draft.settings, teamSize: 5 } }

    draft = followTeamSize(draft)

    expect(draft.settings.vetoAllowance).toBe(5)
    expect(draft.wheel.vetoAllowance).toBe(5)
  })

  it('keeps a Veto allowance the Host has set when the Team size changes', () => {
    let draft = setVetoAllowance(chooseMode(newDraft(), 'lucky_wheel'), 2)
    draft = { ...draft, settings: { ...draft.settings, teamSize: 5 } }

    draft = followTeamSize(draft)

    expect(draft.settings.vetoAllowance).toBe(2)
    expect(draft.wheel.vetoAllowance).toBe(2)
  })

  it('follows the Team size in the wheel options while Admin pick is chosen, and keeps its null allowance', () => {
    let draft = newDraft()
    draft = { ...draft, settings: { ...draft.settings, teamSize: 5 } }

    draft = followTeamSize(draft)

    expect(draft.wheel.vetoAllowance).toBe(5)
    expect(draft.settings.vetoAllowance).toBeNull()
  })

  it('sends hiddenWheel false and no allowance with Admin pick', () => {
    const draft = chooseMode(setHiddenWheel(newDraft(), true), 'admin_pick')

    expect(draftBody(draft).settings).toMatchObject({ selectionMode: 'admin_pick', hiddenWheel: false, vetoAllowance: null })
    expect(parseSettings(draftBody(draft).settings).ok).toBe(true)
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

    expect(draft.settings).toEqual(settings)
    expect(draft.pools).toEqual({ main: [kart, pong], tiebreaker: [pong] })
  })

  it('starts from the defaults for an Event that is not set up, without a chosen Veto allowance', () => {
    const draft = draftFromEvent(view(null))

    expect(draft.settings).toEqual(defaultSettings())
    expect(draft.touched.vetoAllowance).toBe(false)
  })

  it('counts a stored Veto allowance as the Host’s choice: a Team size change leaves it alone', () => {
    const stored = { ...defaultSettings(), selectionMode: 'lucky_wheel' as const, hiddenWheel: true, vetoAllowance: 2 }

    let draft = draftFromEvent(view(stored))
    expect(draft.touched.vetoAllowance).toBe(true)
    expect(draft.wheel).toEqual({ hiddenWheel: true, vetoAllowance: 2 })

    draft = followTeamSize({ ...draft, settings: { ...draft.settings, teamSize: 5 } })
    expect(draft.settings.vetoAllowance).toBe(2)
  })

  it('does not count an Admin pick Event’s missing Veto allowance as chosen: the Lucky Wheel then follows the Team size', () => {
    const draft = draftFromEvent(view({ ...defaultSettings(), teamSize: 2 }))
    expect(draft.touched.vetoAllowance).toBe(false)

    let wheel = chooseMode(draft, 'lucky_wheel')
    wheel = followTeamSize({ ...wheel, settings: { ...wheel.settings, teamSize: 5 } })

    expect(wheel.settings.vetoAllowance).toBe(5)
  })

  it('keeps default wheel options for an Admin pick Event, so choosing the Lucky Wheel offers them', () => {
    const draft = draftFromEvent(view(defaultSettings()))

    expect(draft.wheel).toEqual({ hiddenWheel: false, vetoAllowance: 3 })
    expect(chooseMode(draft, 'lucky_wheel').settings).toMatchObject({ hiddenWheel: false, vetoAllowance: 3 })
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
