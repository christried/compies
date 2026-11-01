import type { Place, Zone } from './board'
import type { SetRejection, SpinRejection } from './rounds'
import type { StartRejection } from './session-state'
import type { VoteRow, VoteValue } from './poll'
import { characterCount } from './text'
import type { EventSettings, SettingsFloors } from './settings'
import type { PoolGame, PoolGameFace, RoundGame } from './game'

// Event limits shared by the create form and the server (#1 § Domain rules).

/** Event name: 1 to this many characters after trimming (an emoji counts as one, as the User sees it (characterCount)). */
export const EVENT_NAME_MAX = 60
/** Slots in a Date poll. */
export const SLOTS_MAX = 16
/** Sessions of one Event (ADR 0011, #49). */
export const SESSIONS_MAX = 8
/** How long a Session lasts in a calendar: 7 h (#1). The calendar file and the Google and Outlook links use it (#81). */
export const SESSION_DURATION_MS = 7 * 60 * 60_000

/** An Event name's length as the rules count it: trimmed, an emoji counts as one, as the User sees it (characterCount). */
export function eventNameLength(raw: string): number {
  return characterCount(raw.trim())
}

export type SlotProblem = 'in_past' | 'duplicate_slot'

/**
 * The Slot rules (#1 § Domain rules): a Slot lies in the future and is unique per minute in its
 * Event. One answer per proposed Slot: `in_past`, `duplicate_slot` when an earlier proposed Slot or
 * an existing one starts at the same time, or null. Existing Slots are only checked for duplicates,
 * because a Slot that has become past is still a Slot. The server and the forms both use this.
 */
export function slotProblems(proposed: Date[], existing: Date[], now: Date): (SlotProblem | null)[] {
  const taken = new Set(existing.map(slot => slot.getTime()))
  return proposed.map((slot) => {
    if (slot <= now) return 'in_past'
    if (taken.has(slot.getTime())) return 'duplicate_slot'
    taken.add(slot.getTime())
    return null
  })
}

/** The Phases of an Event (GLOSSARY: Phase). The MVP uses poll and date_set; the rest come with 1.0. */
export const PHASES = ['draft', 'poll', 'date_set', 'running', 'finished', 'archived'] as const
export type Phase = (typeof PHASES)[number]

/** Every Phase before the Event is finished. What may still change (Sessions, settings) is decided by this one set. */
export function beforeFinish(phase: Phase): boolean {
  return phase === 'draft' || phase === 'poll' || phase === 'date_set' || phase === 'running'
}

/** Sessions are added, removed and reopened in every Phase before the Event finishes (#55). */
export function sessionsEditable(phase: Phase): boolean {
  return beforeFinish(phase)
}

/**
 * Whether the Date poll is open (#1, #164): a Session waits for a Date (`missingDates`) in the poll Phase, or in a
 * running Event, where the poll of a later Session goes on after the first Session started. While the Event is not
 * running, `poll` already means a Session waits for a Date. Votes, Slot edits and setting a Date all ask this.
 */
export function datePollOpen(phase: Phase, missingDates: number): boolean {
  return missingDates > 0 && (phase === 'poll' || phase === 'running')
}

/** What `PUT /api/e/:slug/slots/:slotId/vote` returns: the Vote as saved, with its Note or null (#102). */
export interface SavedVote { slotId: string, value: VoteValue, note: string | null }

/** A Note on a Vote, as listed with the Slot it belongs to (#102). */
export interface SessionNote { userId: string, value: VoteValue, note: string }

/** A Session with its Date (#48, #49). Times are UTC ISO strings. */
export interface DatedSessionView {
  id: string
  /**
   * The number the Session is shown with: 1…n (started Sessions in start order, then the rest by Date) while the Event has several Sessions, null for the
   * one Session of an Event (numberedSessions in server/domain/session.ts, #70). The client shows it as it is.
   */
  number: number | null
  startsAt: string
  /** Set Date and Reschedule clear the Date a Reopen withdrew. */
  previousStartsAt: null
  /** The Notes on the Slot this Session's Date came from (#102); none for a Date set directly. */
  notes: SessionNote[]
  /** When the Host started it (#164), null until then. A started Session is fixed: no remove, reschedule or reopen. */
  startedAt: string | null
  /** When the Host ended it (#164), null while it has not ended. Started and not ended = the Running Session. */
  endedAt: string | null
}

/** A Session still waiting for a Date from the Date poll. Times are UTC ISO strings. */
export interface UndatedSessionView {
  id: string
  number: null
  startsAt: null
  /** The Date a Reopen withdrew, until the next Date is set. Members see a notice for it. */
  previousStartsAt: string | null
  /** Only a dated Session starts (#164). */
  startedAt: null
  endedAt: null
}

/** One Session of an Event (#48, #49): it has its Date, or it waits for one. */
export type SessionView = DatedSessionView | UndatedSessionView

/** A Session the Host removed while it had, or had had, a Date (#65). Members see a notice for that Date. */
export interface RemovedSessionView {
  id: string
  /** The Date the removal (or an earlier Reopen) withdrew. */
  previousStartsAt: string
}

/** The Event's Game pool and Tiebreaker pool, with their games (#146): whole for the Host, the face only for every other Member (#224). */
export interface EventPools { main: (PoolGame | PoolGameFace)[], tiebreaker: (PoolGame | PoolGameFace)[] }

/** What `POST /api/e/:slug/move` returns: the Member and the place they stand in now (#160). */
export interface MovedMember { userId: string, to: Place }

/** What `POST /api/e/:slug/sessions/start` returns: the Session that started and the Phase, running from the first start on (#164). */
export interface SessionStarted { sessionId: string, phase: Phase }
/** What `POST /api/e/:slug/sessions/end` returns: the Session that ended and the Phase, which stays running (#164). */
export interface SessionEnded { sessionId: string, phase: Phase }

/**
 * What the Host sees of the start rule (#164): the next Session (the earliest dated one that has not started), its
 * shown number, and why it cannot start now; null when it can. `sessionId` and `number` are null when no dated Session is left.
 */
export interface StartView { sessionId: string | null, number: number | null, rejection: StartRejection | null }

/**
 * An open Round on the stage (#228, GLOSSARY: Round): its game is set and it was not put back. It has no number (0.8 numbers a
 * Round when its result is entered). `notes` are the game's Game notes, only for the Host and only when it has some.
 */
export interface RoundView {
  id: string
  startedAt: string
  setAt: string
  game: RoundGame
  notes?: string
}

/**
 * What the Host sees of setting the next game (#228): why it cannot be set now, or null, and the games of the Game pool that
 * are still left (shared/rounds.ts gamesLeft), which the picker lists first.
 */
export interface SetGameView {
  rejection: SetRejection | null
  /** Why the wheel cannot be spun now, or null (#229): the dock's „Rad drehen“. A Selection mode without a wheel says `no_wheel`. */
  spinRejection: SpinRejection | null
  left: string[]
}

/**
 * A spin of the Lucky Wheel as a Member reads it (#229, spec #218 § Hidden wheel on the wire): the instants (ISO), the slice count,
 * the result slice and where the pointer rests in it, and the slices' labels. `labels` are the real names for the Host and on
 * a visible wheel; for a Member under a Hidden wheel the placeholders shuffled for this spin, the result slice's label turning
 * into the real name from `stopAt` on. `game` is the drawn game: for a Member only from `stopAt` on, for the Host always.
 */
export interface SpinView {
  roundId: string
  drawId: string
  spinStartAt: string
  stopAt: string
  slices: number
  resultIndex: number
  resultOffset: number
  labels: string[] | null
  game: RoundGame | null
}

/**
 * The Lucky Wheel of a running Session (#229). `count` is how many slices it has now (the games left). `slices` are those games
 * in slice order, for the Host and on a visible wheel (also with the Pool preview off); null for a Member under a Hidden wheel,
 * who learns the count from the wheel only. `spin` is the Event's latest spin, null before the first.
 */
export interface WheelView {
  count: number
  slices: { id: string, name: string }[] | null
  spin: SpinView | null
}

/**
 * The clip that runs now (#230, GLOSSARY: Clip, spec #218 § Clip): the latest draw's, from its stop to the end of the game's clip length,
 * for every Member alike. The instants are ISO; the client plays `clipPosition` of them against the server clock. `game.youtubeId`
 * may be null: then the client shows the game's card for the clip's length. It is keyed by the draw, not by the Round: a Veto
 * window (0.7-06) plays the clip of a draw that is not set yet.
 */
export interface ClipView { drawId: string, startAt: string, endsAt: string, game: RoundGame }

/**
 * The Event's Countdown (#236, spec #218 § Countdown): its stored facts, the duration and either the remaining time (paused, ready)
 * or the start instant (running, ISO). The page computes the time left from them and the server clock (remainingMsAt).
 */
export interface CountdownView { durationMs: number, remainingMs: number, startedAt: string | null }

/**
 * The Coin flip (#235, spec #218 § Coin flip): the Event's latest toss while a Session runs, for every Member, null otherwise. The
 * stored facts (ISO instants); the side shows in the UI only from `landsAt`.
 */
export interface CoinView { id: string, side: 'heads' | 'tails', startedAt: string, landsAt: string }
/** What `POST /api/e/:slug/coin` returns: the toss and its instants (ISO), #235. */
export interface CoinTossed { tossId: string, side: 'heads' | 'tails', startedAt: string, landsAt: string }

/** What `POST /api/e/:slug/rounds` returns: the Round that was opened (#228). */
export interface RoundSet { roundId: string }
/** What `POST /api/e/:slug/rounds/spin` returns: the Round being drawn and its draw (#229). */
export interface RoundSpun { roundId: string, drawId: string }
/** What `POST /api/e/:slug/clip/skip` returns: the draw whose clip was skipped (#230). */
export interface ClipSkipped { drawId: string }
/** What `DELETE /api/e/:slug/rounds/:id` returns: the Round that was put back (#228). */
export interface RoundPutBack { roundId: string }

/** What `POST /api/e/:slug/team-word` returns: the team and the word as saved, null when it was removed (#161). */
export interface TeamWordSet { team: number, word: string | null }

/** What `POST /api/e/:slug/teams/:position/reset-name` returns: the team whose name is the colour name again (#161). */
export interface TeamNameReset { team: number }

/**
 * One team of the Game board (#160): its position, 1..team count, which is also its Team colour index. `name` is the
 * Team name composed from the words (or the frozen name), null when the team shows its colour's name (#161); `frozen`
 * says the name is frozen since the first Session started (#164): then `name` is the frozen name, null for the colour name.
 */
export interface BoardTeam { position: number, name: string | null, frozen: boolean }

/** A Member as the Event read lists them. `team` is set exactly when `zone` is `team` (#160). */
export interface MemberView {
  id: string
  name: string
  image: string | null
  isHost: boolean
  zone: Zone
  team: number | null
  /** The Member's Team word; null without one, and always null outside a team (#161). */
  teamWord: string | null
}

/** What `GET /api/e/:slug` returns to a Member (#11). Times are UTC ISO strings. */
export interface EventView {
  event: {
    slug: string
    name: string
    phase: Phase
    isHost: boolean
  }
  /** The Event's settings (#144); null for an Event from before 1.3 that was never set up. Not secret: Members get them too. */
  settings: EventSettings | null
  /** The lowest Team size and Veto allowance the settings editor offers (#147). Only the Host gets them; null for every other Member. */
  settingsFloors: SettingsFloors | null
  /**
   * The Event's pools (#146): the Host always sees the games, every other Member only while the Pool preview is on (canSeePoolGames,
   * #148, #222, #225). Null = this viewer learns nothing about the pools, not even how many games they hold.
   */
  pools: EventPools | null
  /** The Event's Sessions (ADR 0011): dated ones in Date order first. Each has its Date, and the Date a Reopen withdrew until the next Date is set. */
  sessions: SessionView[]
  /** The removed Sessions that had a Date, earliest first (#65): only for the notice with that Date; they count nowhere else. */
  removedSessions: RemovedSessionView[]
  /** How many Sessions still wait for a Date: the undated ones in `sessions`, counted by the server. */
  missingDates: number
  viewerId: string
  /** The open Slots only (#52): a Slot that became a Session's Date is left out, with its Votes. */
  slots: { id: string, startsAt: string, past: boolean }[]
  votes: VoteRow[]
  members: MemberView[]
  /** The teams of the Game board (#160): one per team count; none while the Event has no settings. */
  teams: BoardTeam[]
  /** Whether Players may move into and out of teams now (Team choice, shared/board.ts). */
  teamChoiceOpen: boolean
  /** The Running Session (started, not ended), or null (#164). */
  runningSessionId: string | null
  /** The start rule's answer for the next Session (#164). Only the Host gets it; null for every other Member. */
  start: StartView | null
  /**
   * The open Rounds in start order (#228). Their games are visible to every Member from the moment they are set, with the
   * Pool preview off and under a Hidden wheel alike; nothing else about the pools is.
   */
  rounds: RoundView[]
  /** Setting the next game (#228). Only the Host gets it; null for every other Member. */
  setGame: SetGameView | null
  /** The Lucky Wheel (#229): in a running Session of a Lucky Wheel Event, else null. */
  wheel: WheelView | null
  /** The clip that runs now (#230): while a Session runs, from a draw's stop to the end of its clip, unless the Host skipped it. Else null. */
  clip: ClipView | null
  /** The Countdown of the running Session (#236): every Member gets it while a Session runs, null otherwise. */
  countdown: CountdownView | null
  /** The Coin flip (#235): the latest toss of the running Session; every Member gets it, null otherwise. */
  coin: CoinView | null
  /** The Best slot, or null when no future Slot has a yes or maybe Vote. */
  bestSlotId: string | null
  /** Members who have a Vote on every votable (not past) Slot, out of all Members. */
  progress: { voted: number, total: number }
  /** The Invite link (#16). Only the Host gets it; null for every other Member. */
  inviteUrl: string | null
}

/** A Home card's call to action: `open` for the Host, `vote` while the viewer still has to vote, `view` otherwise. */
export type HomeAction = 'open' | 'vote' | 'view'

/** One card on Home (`GET /api/e`, #12). Times are UTC ISO strings. */
export interface HomeEvent {
  slug: string
  name: string
  host: { name: string }
  phase: Phase
  /** How many Sessions the Event has (#54). */
  sessionCount: number
  /** How many Sessions still wait for a Date. */
  missingDates: number
  /**
   * The next upcoming Session, else the latest passed one; null while no Session has a Date. Its number is the one
   * it is shown with: null for the one Session of an Event (as in DatedSessionView, #70).
   */
  nextSession: { number: number | null, startsAt: string } | null
  /** When the Event was created; picks the latest open poll for the Construction page (#12). */
  createdAt: string
  /** The Best slot so far, or null. */
  bestSlot: { id: string, startsAt: string } | null
  /** Members who have a Vote on every votable Slot, out of all Members. */
  progress: { voted: number, total: number }
  /** Whether the viewer has a Vote on every votable Slot. */
  viewerVoted: boolean
  isHost: boolean
  action: HomeAction
}

/** What `GET /api/e` returns, already in Home order (open polls to vote on, other open polls, Dates upcoming first). */
export interface HomeView {
  events: HomeEvent[]
}

/** What `POST /api/e` returns: the new Event's link and its Invite link (#1, #16). */
export interface CreatedEvent {
  slug: string
  inviteUrl: string
}

/** What `PATCH /api/e/:slug/slots/:slotId` returns: the Slot the Host moved and its new time, a UTC ISO string (#85). */
export interface ChangedSlot {
  slotId: string
  startsAt: string
}

/** What `POST /api/e/:slug/confirm` returns: the Date the Session took from its Slot, a UTC ISO string, and the Phase (#52). */
export interface DateConfirmed { startsAt: string, phase: Phase }
/** What `POST /api/e/:slug/sessions` returns: the new Session's id and the Phase (#55). */
export interface SessionAdded { id: string, phase: Phase }
/** What `DELETE /api/e/:slug/sessions/:id` returns: the removed Session's id and the Phase (#55). */
export interface SessionRemoved { id: string, phase: Phase }
/** What `POST /api/e/:slug/sessions/:id/reopen` returns: the Phase only (#14, #55). */
export interface SessionReopened { phase: Phase }
/** What `POST /api/e/:slug/sessions/:id/reschedule` returns: the Session's new Date, a UTC ISO string, and the Phase (#53). */
export interface SessionRescheduled { startsAt: string, phase: Phase }
/** What `POST /api/e/:slug/slots` returns: the new Slot's id and its time, a UTC ISO string (#15). */
export interface SlotAdded { slotId: string, startsAt: string }
/** What `DELETE /api/e/:slug/slots/:slotId` returns: the removed Slot's id and how many Votes went with it (#15). */
export interface SlotRemoved { slotId: string, votesDeleted: number }

/** What `POST /api/e/:slug/rotate` returns: the new Invite link (#16). The old one answers 404 from now on. */
export interface RotatedInvite {
  inviteUrl: string
}

/**
 * What `GET /api/invite/:invite` returns to anyone, signed out too (screen 07, ADR 0006): the Event name and the
 * Host's Display name and avatar, nothing else.
 */
export interface InvitePreview {
  eventName: string
  host: { name: string, image: string | null }
}

/** What `POST /api/invite/:invite` returns: the Event the User is a Member of now, and whether this call added them (#10). */
export interface JoinedEvent {
  slug: string
  joined: boolean
}
