import type { VoteValue } from './poll'
import { characterCount } from './text'

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

/** Sessions are added, removed and reopened in every Phase before the Event finishes (#55). */
export function sessionsEditable(phase: Phase): boolean {
  return phase === 'draft' || phase === 'poll' || phase === 'date_set' || phase === 'running'
}

/** Slots can be added, removed and only then changed by the Host while the Date poll is open (#1). */
export function slotsEditable(phase: Phase): boolean {
  return phase === 'poll'
}

/** What `PUT /api/e/:slug/slots/:slotId/vote` returns: the Vote as saved, with its Note or null (#102). */
export interface SavedVote { slotId: string, value: VoteValue, note: string | null }

/** A Note on a Vote, as listed with the Slot it belongs to (#102). */
export interface SessionNote { userId: string, value: VoteValue, note: string }

/** A Session with its Date (#48, #49). Times are UTC ISO strings. */
export interface DatedSessionView {
  id: string
  /**
   * The number the Session is shown with: 1…n in Date order while the Event has several Sessions, null for the
   * one Session of an Event (numberedSessions in server/domain/session.ts, #70). The client shows it as it is.
   */
  number: number | null
  startsAt: string
  /** Set Date and Reschedule clear the Date a Reopen withdrew. */
  previousStartsAt: null
  /** The Notes on the Slot this Session's Date came from (#102); none for a Date set directly. */
  notes: SessionNote[]
}

/** A Session still waiting for a Date from the Date poll. Times are UTC ISO strings. */
export interface UndatedSessionView {
  id: string
  number: null
  startsAt: null
  /** The Date a Reopen withdrew, until the next Date is set. Members see a notice for it. */
  previousStartsAt: string | null
}

/** One Session of an Event (#48, #49): it has its Date, or it waits for one. */
export type SessionView = DatedSessionView | UndatedSessionView

/** A Session the Host removed while it had, or had had, a Date (#65). Members see a notice for that Date. */
export interface RemovedSessionView {
  id: string
  /** The Date the removal (or an earlier Reopen) withdrew. */
  previousStartsAt: string
}

/** What `GET /api/e/:slug` returns to a Member (#11). Times are UTC ISO strings. */
export interface EventView {
  event: {
    slug: string
    name: string
    phase: Phase
    isHost: boolean
  }
  /** The Event's Sessions (ADR 0011): dated ones in Date order first. Each has its Date, and the Date a Reopen withdrew until the next Date is set. */
  sessions: SessionView[]
  /** The removed Sessions that had a Date, earliest first (#65): only for the notice with that Date; they count nowhere else. */
  removedSessions: RemovedSessionView[]
  /** How many Sessions still wait for a Date: the undated ones in `sessions`, counted by the server. */
  missingDates: number
  viewerId: string
  /** The open Slots only (#52): a Slot that became a Session's Date is left out, with its Votes. */
  slots: { id: string, startsAt: string, past: boolean }[]
  votes: { slotId: string, userId: string, value: VoteValue, note: string | null }[]
  members: { id: string, name: string, image: string | null, isHost: boolean }[]
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
