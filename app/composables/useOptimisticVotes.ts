import { apiFailure } from '~/utils/api-error'
import type { EventView } from '~~/shared/event'
import type { VoteValue } from '~~/shared/poll'

// The Votes as the poll draws them (ADR 0001, #50): a press shows at once and rolls back with a toast when
// saving fails. While a Vote is in flight, the later presses on that Slot wait and only the newest of them is
// sent. After each save the Event is refetched, and the server's answer replaces the drawn Vote.

export function useOptimisticVotes(
  slug: Readonly<Ref<string>>,
  data: Readonly<Ref<Pick<EventView, 'viewerId' | 'votes'> | undefined>>,
  refresh: () => Promise<unknown>,
) {
  const { t } = useI18n()
  const { toast } = useToast()

  /** Votes that are being saved, by Slot. They are drawn at once and dropped when the server has answered. */
  const pending = ref<Partial<Record<string, VoteValue>>>({})
  /** Whether the „Gespeichert.“ notice shows: set by each saved Vote, cleared when the User closes it. */
  const savedNote = ref(false)

  const viewerId = computed(() => data.value?.viewerId ?? '')

  /** The server's Votes with this User's pending Votes laid over them. */
  const shown = computed(() => {
    const overlaid = (data.value?.votes ?? []).filter(vote => vote.userId !== viewerId.value || pending.value[vote.slotId] === undefined)
    const mine = Object.entries(pending.value)
      .filter((entry): entry is [string, VoteValue] => entry[1] !== undefined)
      .map(([slotId, value]) => ({ slotId, userId: viewerId.value, value }))
    return [...overlaid, ...mine]
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
      // Only a rate limit gets its own copy; any other refusal is the plain "did not arrive" (#11).
      const rateLimited = apiFailure(failure).code === 'rate_limited'
      toast({ tone: 'error', text: t(rateLimited ? 'error.rateLimited' : 'error.voteFailed') })
      dropPending(slotId)
    }
    finally {
      sending.delete(slotId)
      // Refetch first so the server's answer replaces the drawn Vote without a flicker back to the old one.
      await refresh()
      if (!sending.has(slotId)) dropPending(slotId)
    }
  }

  return { shown, savedNote, countsFor, myVoteFor, vote }
}

/** The Votes of one Event as the poll draws them, and how a press saves one (useOptimisticVotes). */
export type OptimisticVotes = ReturnType<typeof useOptimisticVotes>
