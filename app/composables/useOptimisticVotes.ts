import { apiErrorKey } from '~/utils/api-error'
import { useEventMutation } from '~/composables/useEventMutation'
import { noteRows } from '~/utils/notes'
import type { EventView, SavedVote } from '~~/shared/event'
import type { VoteValue } from '~~/shared/poll'

// The Votes as the poll draws them (ADR 0001, #50): a press shows at once and rolls back with a toast when
// saving fails. While a Vote is in flight, the later presses on that Slot wait and only the newest of them is
// sent. After each save the Event is refetched, and the server's answer replaces the drawn Vote. A Note on a
// Vote (#102) is drawn the same way and rolls back with the same toast.

export function useOptimisticVotes(
  slug: Readonly<Ref<string>>,
  data: Readonly<Ref<Pick<EventView, 'viewerId' | 'votes'> | undefined>>,
  refresh: () => Promise<unknown>,
) {
  const { t } = useI18n()
  const { toast } = useToast()
  const { send } = useEventMutation(slug, refresh)

  /** Votes that are being saved, by Slot. They are drawn at once and dropped when the server has answered. */
  const pending = ref<Partial<Record<string, VoteValue>>>({})
  /** Notes that are being saved, by Slot (null: removed). Drawn at once and dropped when the server has answered. */
  const pendingNotes = ref<Partial<Record<string, string | null>>>({})
  /** Whether the „Gespeichert.“ notice shows: set by each saved Vote, cleared when the User closes it. */
  const savedNote = ref(false)

  const viewerId = computed(() => data.value?.viewerId ?? '')

  /** The server's Votes with this User's pending Votes and Notes laid over them. A pending Vote keeps the server's Note. */
  const shown = computed(() => {
    const votes = data.value?.votes ?? []
    const isMine = (vote: { userId: string }) => vote.userId === viewerId.value
    const mineOn = (slotId: string) => votes.find(vote => isMine(vote) && vote.slotId === slotId)
    const others = votes.filter(vote => !isMine(vote) || (pending.value[vote.slotId] === undefined && pendingNotes.value[vote.slotId] === undefined))
    const slotIds = new Set([...Object.keys(pending.value), ...Object.keys(pendingNotes.value)])
    const mine = [...slotIds].flatMap((slotId) => {
      const saved = mineOn(slotId)
      const value = pending.value[slotId] ?? saved?.value
      if (value === undefined) return []
      const note = pendingNotes.value[slotId] === undefined ? (saved?.note ?? null) : pendingNotes.value[slotId]
      return [{ slotId, userId: viewerId.value, value, note }]
    })
    return [...others, ...mine]
  })

  function countsFor(slotId: string) {
    const counts = { yes: 0, maybe: 0, no: 0 }
    for (const vote of shown.value) {
      if (vote.slotId === slotId) counts[vote.value] += 1
    }
    return counts
  }

  function myVoteFor(slotId: string): VoteValue | null {
    return shown.value.find(vote => vote.slotId === slotId && vote.userId === viewerId.value)?.value ?? null
  }

  function myNoteFor(slotId: string): string | null {
    return shown.value.find(vote => vote.slotId === slotId && vote.userId === viewerId.value)?.note ?? null
  }

  /** The Notes on a Slot, in the order of `members` (the rows of „Wer kann wann?“), with this User's pending one (#102). */
  function notesFor(slotId: string, members: { id: string, name: string }[]) {
    return noteRows(shown.value.filter(vote => vote.slotId === slotId), members, viewerId.value)
  }

  function dropPending(slotId: string) {
    pending.value = Object.fromEntries(Object.entries(pending.value).filter(([key]) => key !== slotId))
  }

  /** The Slots with a Vote on its way to the server. */
  const sending = new Set<string>()

  // Quick presses: the drawn choice follows each press at once, but while a Vote is in flight the later
  // choices wait, and only the newest of them is sent (#50). A failed save falls back to the saved Vote.
  async function vote(slotId: string, value: VoteValue) {
    pending.value = { ...pending.value, [slotId]: value }
    if (sending.has(slotId)) return
    sending.add(slotId)
    try {
      let sent: VoteValue | undefined = value
      while (sent !== undefined) {
        await $fetch(`/api/e/${slug.value}/slots/${slotId}/vote`, { method: 'PUT', body: { value: sent } })
        savedNote.value = true
        const newest: VoteValue | undefined = pending.value[slotId]
        sent = newest === sent ? undefined : newest
      }
    }
    catch (failure) {
      // The shared error copy, as for every Event change (#74); a reason it has no copy for is the plain
      // "did not arrive" (#11).
      toast({ tone: 'error', text: t(apiErrorKey(failure, 'error.voteFailed')) })
      dropPending(slotId)
    }
    finally {
      sending.delete(slotId)
      // Refetch first so the server's answer replaces the drawn Vote without a flicker back to the old one.
      await refresh()
      if (!sending.has(slotId)) dropPending(slotId)
    }
  }

  /** Saves this User's Note on a Slot they voted on (#102): shown at once, rolled back with the failed-vote toast. */
  async function saveNote(slotId: string, text: string): Promise<boolean> {
    const value = myVoteFor(slotId)
    if (value === null) return false
    // The server's rules, so the drawn Note is the one it will answer with: line breaks are spaces, trimmed, empty is none.
    pendingNotes.value = { ...pendingNotes.value, [slotId]: text.replace(/\r\n|[\r\n]/g, ' ').trim() || null }
    const taken = await send<SavedVote>('PUT', `slots/${slotId}/vote`, { body: { value, note: text }, fallback: 'error.voteFailed' })
    pendingNotes.value = Object.fromEntries(Object.entries(pendingNotes.value).filter(([key]) => key !== slotId))
    return taken
  }

  return { shown, savedNote, countsFor, myVoteFor, myNoteFor, notesFor, vote, saveNote }
}

/** The Votes of one Event as the poll draws them, and how a press saves one (useOptimisticVotes). */
export type OptimisticVotes = ReturnType<typeof useOptimisticVotes>
