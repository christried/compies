import { describe, expect, it } from 'vitest'
import { draftBody, newDraft } from '../../app/utils/event-draft'
import { defaultSettings, parseSettings } from '../../shared/settings'

// The stepper's draft (#144): what the Host has entered so far, and the body that „Session erstellen“ sends.

describe('newDraft', () => {
  it('starts with no name, the default settings and one empty Slot in a Date poll', () => {
    expect(newDraft()).toEqual({
      name: '',
      settings: defaultSettings(),
      touched: { vetoAllowance: false },
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
