import type { VoteValue } from './poll'

// Event limits shared by the create form and the server (#1 § Domain rules).

/** Event name: 1 to this many characters after trimming (emoji count as one). */
export const EVENT_NAME_MAX = 60
/** Slots in a Date poll. */
export const SLOTS_MAX = 8
/** Sessions of one Event (ADR 0011, #49). */
export const SESSIONS_MAX = 8

/** An Event name's length as the rules count it: trimmed, an emoji counts as one. */
export function eventNameLength(raw: string): number {
  return [...raw.trim()].length
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

/** One Session of an Event (#48, #49). Times are UTC ISO strings. */
export interface SessionView {
  id: string
  /** 1…n in Date order for a Session with a Date; null while it waits for one (server/domain/session.ts). */
  number: number | null
  /** The Date, or null while the Session waits for one from the Date poll. */
  startsAt: string | null
  /** The Date a Reopen withdrew, until the next Date is set. Members see a notice for it. */
  previousStartsAt: string | null
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
  /** How many Sessions still wait for a Date. */
  missingDates: number
  viewerId: string
  /** The open Slots only (#52): a Slot that became a Session's Date is left out, with its Votes. */
  slots: { id: string, startsAt: string, past: boolean }[]
  votes: { slotId: string, userId: string, value: VoteValue }[]
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
  /** The next upcoming Session, else the latest passed one; null while no Session has a Date. */
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
