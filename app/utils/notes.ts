import type { VoteValue } from '~~/shared/poll'

// The Notes on Votes as the pages list them (#102): who wrote what, with the Vote's value for its colour.
export interface NoteRow { userId: string, name: string, isMe: boolean, value: VoteValue, note: string }

/** The Notes among `votes`, in the order of the rows in „Wer kann wann?“ (the Members' order). */
export function noteRows(votes: { userId: string, value: VoteValue, note: string | null }[], members: { id: string, name: string }[], viewerId: string): NoteRow[] {
  return members.flatMap((member) => {
    const vote = votes.find(row => row.userId === member.id)
    return vote?.note ? [{ userId: member.id, name: member.name, isMe: member.id === viewerId, value: vote.value, note: vote.note }] : []
  })
}
