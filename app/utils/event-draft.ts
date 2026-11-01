import type { EventView } from '~~/shared/event'
import { isFullPoolGame, type PoolGame } from '~~/shared/game'
import { defaultSettings, defaultVetoAllowance, hasWheel, type EventSettings, type Pool, type SettingsFloors } from '~~/shared/settings'

// What the Host has entered in the stepper so far (#144). Nothing is sent until „Event erstellen“; then
// `draftBody` is the POST body of `/api/e`. The functions below return a new draft each; the stepper assigns it.

/** The Sessions and Dates step: the Date poll (up to 16 Slots) or one direct Date per Session. Times are Berlin wall-clock values. */
export interface SessionsDraft {
  mode: 'poll' | 'direct'
  sessionCount: number
  slots: string[]
  /** One Date per Session in direct mode; its rows follow the Session count. */
  direct: string[]
}

/** The steps the setup wizard can run (copy in `stepper.steps.<key>`); an entry page picks its own list. */
export type StepKey = 'name' | 'format' | 'games' | 'points' | 'mode' | 'pool' | 'tiebreaker' | 'sessions'

/** What a step reads about locked settings (the editor of a running Event, #147); every step takes it and may ignore it. */
export interface StepLocks {
  reason?: string
  floors?: SettingsFloors
  /** False when the Host may not browse the Game library (the Host permission was revoked, #173); the pool steps then offer no search. */
  library?: boolean
  /** The Players per team of the Event as it is saved, index 0 = team 1, one entry per saved team (#163). The Format step counts the Bench hint from it. */
  teamPlayers?: number[]
}

/** The settings as the steps edit them. The Lucky Wheel's options sit beside them in the draft; `settingsOf` joins both. */
export type DraftSettings = Omit<EventSettings, 'hiddenWheel' | 'vetoAllowance' | 'poolPreview'>

export interface EventDraft {
  name: string
  settings: DraftSettings
  /** „Rad verdecken“, kept while Host-Wahl is chosen so switching back restores it (#145). */
  hiddenWheel: boolean
  /** „Pool vorher zeigen“ (#225): on by default, kept while Host-Wahl is chosen, and off under „Rad verdecken“. */
  poolPreview: boolean
  /** The Host's Veto allowance, kept while Host-Wahl is chosen; null follows the Team size until the Host touches it (#145). */
  vetoAllowance: number | null
  /** The games of the Game pool and the Tiebreaker pool, in the order they were added (#146). Games, not ids, so the step and Fertig can show them. */
  pools: { main: PoolGame[], tiebreaker: PoolGame[] }
  dates: SessionsDraft
}

export function newDraft(): EventDraft {
  const { hiddenWheel, vetoAllowance, poolPreview, ...settings } = defaultSettings()
  return {
    name: '',
    settings,
    hiddenWheel,
    poolPreview,
    vetoAllowance,
    pools: { main: [], tiebreaker: [] },
    dates: { mode: 'poll', sessionCount: 1, slots: [''], direct: [''] },
  }
}

/** The Veto allowance the Lucky Wheel would have: the Host's, or max(3, Team size) until they set one. */
export function vetoAllowanceOf(draft: Pick<EventDraft, 'vetoAllowance' | 'settings'>): number {
  return draft.vetoAllowance ?? defaultVetoAllowance(draft.settings.teamSize)
}

/**
 * The settings that are stored: only the Lucky Wheel has the wheel options, Host pick has none (#145). The Pool preview
 * is the Host's choice, except under a Hidden wheel, where it is always off (#225).
 */
export function settingsOf(draft: EventDraft): EventSettings {
  if (!hasWheel(draft.settings.selectionMode)) return { ...draft.settings, hiddenWheel: false, vetoAllowance: null, poolPreview: draft.poolPreview }
  return { ...draft.settings, hiddenWheel: draft.hiddenWheel, vetoAllowance: vetoAllowanceOf(draft), poolPreview: draft.hiddenWheel ? false : draft.poolPreview }
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

/** The body of `POST /api/e`. */
export function draftBody(draft: EventDraft) {
  const { dates } = draft
  const base = { name: draft.name.trim(), sessions: dates.sessionCount, settings: settingsOf(draft), pools: poolIds(draft) }
  return dates.mode === 'poll'
    ? { ...base, dateMode: 'poll' as const, slots: dates.slots }
    : { ...base, dateMode: 'direct' as const, startsAt: dates.direct }
}

/**
 * The draft of the settings editor (#147), made from the Event as the Host reads it. A stored Veto allowance is the
 * Host's choice, so a Team size change must not overwrite it; a Host pick Event has none stored (null), so the Lucky Wheel
 * would follow the Team size. Name and dates are not edited here.
 */
export function draftFromEvent(view: Pick<EventView, 'settings' | 'pools'>): EventDraft {
  const { hiddenWheel, vetoAllowance, poolPreview, ...settings } = view.settings ?? defaultSettings()
  return {
    ...newDraft(),
    settings,
    hiddenWheel,
    poolPreview,
    vetoAllowance,
    // The Host always gets the games whole; null and the face only (a Member's) only narrow the type, a Member has no editor.
    pools: view.pools
      ? { main: view.pools.main.filter(isFullPoolGame), tiebreaker: view.pools.tiebreaker.filter(isFullPoolGame) }
      : { main: [], tiebreaker: [] },
  }
}

/** The body of `PATCH /api/e/:slug/settings`: all settings (a full payload also sets up an Event) and both pools. */
export function settingsBody(draft: EventDraft) {
  return { settings: settingsOf(draft), pools: poolIds(draft) }
}

function poolIds(draft: EventDraft) {
  return { main: draft.pools.main.map(game => game.id), tiebreaker: draft.pools.tiebreaker.map(game => game.id) }
}
