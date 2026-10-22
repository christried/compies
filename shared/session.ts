import type { VoteValue } from './poll'

// Session limits shared by the create form and the server (#1 § Domain rules).

/** Session name: 1 to this many characters after trimming (emoji count as one). */
export const SESSION_NAME_MAX = 60
/** Slots in a Date poll. */
export const SLOTS_MAX = 8

/** What `GET /api/s/:slug` returns to a Member (#11). Times are UTC ISO strings. */
export interface SessionView {
  session: {
    slug: string
    name: string
    phase: 'draft' | 'poll' | 'date_set' | 'running' | 'finished' | 'archived'
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

/** One card on Home (`GET /api/s`, #12). Times are UTC ISO strings. */
export interface HomeSession {
  slug: string
  name: string
  host: { name: string }
  phase: SessionView['session']['phase']
  dateMode: 'poll' | 'direct'
  startsAt: string | null
  /** The Best slot so far, or null. */
  bestSlot: { id: string, startsAt: string } | null
  /** Members who have a Vote on every votable Slot, out of all Members. */
  progress: { voted: number, total: number }
  /** Whether the viewer has a Vote on every votable Slot. */
  viewerVoted: boolean
  isHost: boolean
  /** The call to action: `open` for the Host, `vote` while the viewer still has to vote, `view` otherwise. */
  action: 'open' | 'vote' | 'view'
}

/** What `GET /api/s` returns, already in Home order (open polls to vote on, other open polls, Dates upcoming first). */
export interface HomeView {
  sessions: HomeSession[]
}
