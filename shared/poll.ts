// Vote values shared by the server and the poll UI (#1 § Domain rules). UI copy: Ja / Wenn nötig / Nein.

export const VOTE_VALUES = ['yes', 'maybe', 'no'] as const

export type VoteValue = (typeof VOTE_VALUES)[number]
