import { defaultSettings, type EventSettings } from '~~/shared/settings'

// What the Host has entered in the stepper so far (#144). Nothing is sent until „Session erstellen“; then
// `draftBody` is the POST body of `/api/e`. Later steps (#145 Selection mode, #146 pools) extend the draft.

/** The Sessions and Dates step: the Date poll (up to 16 Slots) or one direct Date per Session. Times are Berlin wall-clock values. */
export interface SessionsDraft {
  mode: 'poll' | 'direct'
  sessionCount: number
  slots: string[]
  /** One Date per Session in direct mode; its rows follow the Session count. */
  direct: string[]
}

export interface EventDraft {
  name: string
  settings: EventSettings
  /** Which defaults the Host has changed by hand, so a later change of the team size does not overwrite them (#145). */
  touched: { vetoAllowance: boolean }
  dates: SessionsDraft
}

export function newDraft(): EventDraft {
  return {
    name: '',
    settings: defaultSettings(),
    touched: { vetoAllowance: false },
    dates: { mode: 'poll', sessionCount: 1, slots: [''], direct: [''] },
  }
}

/** The body of `POST /api/e`. */
export function draftBody(draft: EventDraft) {
  const { dates } = draft
  const base = { name: draft.name.trim(), sessions: dates.sessionCount, settings: draft.settings }
  return dates.mode === 'poll'
    ? { ...base, dateMode: 'poll' as const, slots: dates.slots }
    : { ...base, dateMode: 'direct' as const, startsAt: dates.direct }
}
