import { defaultSettings, defaultVetoAllowance, type EventSettings } from '~~/shared/settings'

// What the Host has entered in the stepper so far (#144). Nothing is sent until „Session erstellen“; then
// `draftBody` is the POST body of `/api/e`. Later steps (#146 pools) extend the draft. The functions below
// return a new draft each; the stepper assigns it.

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
  /** The Lucky Wheel options the Host chose, kept while Admin pick is chosen so switching back restores them (#145). */
  wheel: { hiddenWheel: boolean, vetoAllowance: number }
  dates: SessionsDraft
}

export function newDraft(): EventDraft {
  return {
    name: '',
    settings: defaultSettings(),
    touched: { vetoAllowance: false },
    wheel: { hiddenWheel: false, vetoAllowance: defaultVetoAllowance(defaultSettings().teamSize) },
    dates: { mode: 'poll', sessionCount: 1, slots: [''], direct: [''] },
  }
}

/** The Selection mode step (#145): Lucky Wheel brings back the Host's wheel options, Admin pick clears them. */
export function chooseMode(draft: EventDraft, mode: 'lucky_wheel' | 'admin_pick'): EventDraft {
  if (mode === 'admin_pick') {
    return { ...draft, settings: { ...draft.settings, selectionMode: mode, hiddenWheel: false, vetoAllowance: null } }
  }
  const vetoAllowance = draft.touched.vetoAllowance ? draft.wheel.vetoAllowance : defaultVetoAllowance(draft.settings.teamSize)
  return { ...draft, settings: { ...draft.settings, selectionMode: mode, hiddenWheel: draft.wheel.hiddenWheel, vetoAllowance } }
}

/** „Rad verdecken“ on or off (only meaningful with the Lucky Wheel). */
export function setHiddenWheel(draft: EventDraft, on: boolean): EventDraft {
  return { ...draft, wheel: { ...draft.wheel, hiddenWheel: on }, settings: { ...draft.settings, hiddenWheel: on } }
}

/** The Host sets the Veto allowance by hand: from now on a Team size change leaves it alone (#145). */
export function setVetoAllowance(draft: EventDraft, vetoAllowance: number): EventDraft {
  return {
    ...draft,
    touched: { ...draft.touched, vetoAllowance: true },
    wheel: { ...draft.wheel, vetoAllowance },
    settings: { ...draft.settings, vetoAllowance },
  }
}

/** After a Team size change: an untouched Veto allowance follows max(3, Team size), a chosen one stays. */
export function followTeamSize(draft: EventDraft): EventDraft {
  if (draft.touched.vetoAllowance) return draft
  const vetoAllowance = defaultVetoAllowance(draft.settings.teamSize)
  const wheel = { ...draft.wheel, vetoAllowance }
  if (draft.settings.selectionMode !== 'lucky_wheel') return { ...draft, wheel }
  return { ...draft, wheel, settings: { ...draft.settings, vetoAllowance } }
}

/** The body of `POST /api/e`. */
export function draftBody(draft: EventDraft) {
  const { dates } = draft
  const base = { name: draft.name.trim(), sessions: dates.sessionCount, settings: draft.settings }
  return dates.mode === 'poll'
    ? { ...base, dateMode: 'poll' as const, slots: dates.slots }
    : { ...base, dateMode: 'direct' as const, startsAt: dates.direct }
}
