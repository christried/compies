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
}
