import { describe, expect, it } from 'vitest'
import { chooseMode, draftBody, followTeamSize, newDraft, setHiddenWheel, setVetoAllowance } from '../../app/utils/event-draft'
import { defaultSettings, parseSettings } from '../../shared/settings'

// The stepper's draft (#144): what the Host has entered so far, and the body that „Session erstellen“ sends.

describe('newDraft', () => {
  it('starts with no name, the default settings and one empty Slot in a Date poll', () => {
    expect(newDraft()).toEqual({
      name: '',
      settings: defaultSettings(),
      touched: { vetoAllowance: false },
      wheel: { hiddenWheel: false, vetoAllowance: 3 },
      dates: { mode: 'poll', sessionCount: 1, slots: [''], direct: [''] },
    })
  })

  it('gives every draft its own lists', () => {
    expect(newDraft().dates.slots).not.toBe(newDraft().dates.slots)
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
    })
  })

  it('sends settings the server accepts', () => {
    expect(parseSettings(draftBody(newDraft()).settings).ok).toBe(true)
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
