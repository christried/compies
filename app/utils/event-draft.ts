import type { EventView, PoolGame } from '~~/shared/event'
import { defaultSettings, defaultVetoAllowance, type EventSettings, type Pool } from '~~/shared/settings'

// What the Host has entered in the stepper so far (#144). Nothing is sent until „Session erstellen“; then
// `draftBody` is the POST body of `/api/e`. The functions below return a new draft each; the stepper assigns it.

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
  /** The games of the Game pool and the Tiebreaker pool, in the order they were added (#146). Games, not ids, so the step and Fertig can show them. */
  pools: { main: PoolGame[], tiebreaker: PoolGame[] }
  dates: SessionsDraft
}

export function newDraft(): EventDraft {
  return {
    name: '',
    settings: defaultSettings(),
    touched: { vetoAllowance: false },
    wheel: { hiddenWheel: false, vetoAllowance: defaultVetoAllowance(defaultSettings().teamSize) },
    pools: { main: [], tiebreaker: [] },
    dates: { mode: 'poll', sessionCount: 1, slots: [''], direct: [''] },
  }
}

/** A game into a pool, or out of it when it is in already (the picker's toggle button, #146). */
export function togglePoolGame(draft: EventDraft, pool: Pool, game: PoolGame): EventDraft {
  const games = draft.pools[pool]
  const next = games.some(entry => entry.id === game.id) ? games.filter(entry => entry.id !== game.id) : [...games, game]
  return { ...draft, pools: { ...draft.pools, [pool]: next } }
}

/** A game into a pool; nothing changes when it is in already (a game just created in the sheet, #146). */
export function addPoolGame(draft: EventDraft, pool: Pool, game: PoolGame): EventDraft {
  return draft.pools[pool].some(entry => entry.id === game.id)
    ? draft
    : { ...draft, pools: { ...draft.pools, [pool]: [...draft.pools[pool], game] } }
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
  const base = { name: draft.name.trim(), sessions: dates.sessionCount, settings: draft.settings, pools: poolIds(draft) }
  return dates.mode === 'poll'
    ? { ...base, dateMode: 'poll' as const, slots: dates.slots }
    : { ...base, dateMode: 'direct' as const, startsAt: dates.direct }
}

/**
 * The draft of the settings editor (#147), made from the Event as the Host reads it. A stored Veto allowance is the
 * Host's choice, so a Team size change must not overwrite it. Name and dates are not edited here.
 */
export function draftFromEvent(view: Pick<EventView, 'settings' | 'pools'>): EventDraft {
  const settings = view.settings ?? defaultSettings()
  return {
    ...newDraft(),
    settings,
    touched: { vetoAllowance: view.settings !== null },
    wheel: { hiddenWheel: settings.hiddenWheel, vetoAllowance: settings.vetoAllowance ?? defaultVetoAllowance(settings.teamSize) },
    // The Host always gets the games; the guard only narrows the type.
    pools: view.pools.hidden ? { main: [], tiebreaker: [] } : { main: [...view.pools.main], tiebreaker: [...view.pools.tiebreaker] },
  }
}

/** The body of `PATCH /api/e/:slug/settings`: all settings (a full payload also sets up an Event) and both pools. */
export function settingsBody(draft: EventDraft) {
  return { settings: draft.settings, pools: poolIds(draft) }
}

function poolIds(draft: EventDraft) {
  return { main: draft.pools.main.map(game => game.id), tiebreaker: draft.pools.tiebreaker.map(game => game.id) }
}
