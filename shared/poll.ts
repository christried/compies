// Vote values shared by the server and the poll UI (#1 § Domain rules). UI copy: Ja / Meh / Nein.

export const VOTE_VALUES = ['yes', 'maybe', 'no'] as const

/** The longest Note on a Vote, in characters as the User sees them (#102). */
export const NOTE_MAX = 80

export type VoteValue = (typeof VOTE_VALUES)[number]
