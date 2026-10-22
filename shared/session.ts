import type { VoteValue } from './poll'

// Session limits shared by the create form and the server (#1 § Domain rules).

/** Session name: 1 to this many characters after trimming (emoji count as one). */
export const SESSION_NAME_MAX = 60
/** Slots in a Date poll. */
export const SLOTS_MAX = 8

/** A Session name's length as the rules count it: trimmed, an emoji counts as one. */
export function sessionNameLength(raw: string): number {
  return [...raw.trim()].length
}

export type SlotProblem = 'in_past' | 'duplicate_slot'

/**
 * The Slot rules (#1 § Domain rules): a Slot lies in the future and is unique per minute in its
 * Session. One answer per proposed Slot: `in_past`, `duplicate_slot` when an earlier proposed Slot or
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

/** The Phases of a Session (GLOSSARY: Phase). The MVP uses poll and date_set; the rest come with 1.0. */
export const PHASES = ['draft', 'poll', 'date_set', 'running', 'finished', 'archived'] as const
export type Phase = (typeof PHASES)[number]

/** What `GET /api/s/:slug` returns to a Member (#11). Times are UTC ISO strings. */
export interface SessionView {
  session: {
    slug: string
    name: string
    phase: Phase
    dateMode: 'poll' | 'direct'
    startsAt: string | null
    /** The Date a Reopen withdrew (#14), until the next Date is set. Members see a notice for it. */
    previousStartsAt: string | null
    isHost: boolean
  }
  viewerId: string
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

/** One card on Home (`GET /api/s`, #12). Times are UTC ISO strings. */
export interface HomeSession {
  slug: string
  name: string
  host: { name: string }
  phase: Phase
  dateMode: 'poll' | 'direct'
  startsAt: string | null
  /** When the Session was created; picks the latest open poll for the Construction page (#12). */
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

/** What `GET /api/s` returns, already in Home order (open polls to vote on, other open polls, Dates upcoming first). */
export interface HomeView {
  sessions: HomeSession[]
}
