// Vote values shared by the server and the poll UI (#1 § Domain rules). UI copy: Ja / Meh / Nein.

export const VOTE_VALUES = ['yes', 'maybe', 'no'] as const

/** The longest Note on a Vote, in characters as the User sees them (#102). */
export const NOTE_MAX = 80

export type VoteValue = (typeof VOTE_VALUES)[number]

/** One Vote as the Event read sends it (#102): who voted what on which Slot, with the Note or null. */
export interface VoteRow { slotId: string, userId: string, value: VoteValue, note: string | null }
