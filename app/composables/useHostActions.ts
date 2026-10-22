import { apiErrorKey } from '~/utils/api-error'
import { utcToBerlin } from '~~/shared/time'

// The Host's Date actions on the Session page (#13, #14): Set the Date, Reschedule and Reopen. Each
// posts to its endpoint, shows the server's refusal as a toast and refetches the Session afterwards
// (ADR 0001). The dialogs close on success only.

export function useHostActions(slug: Readonly<Ref<string>>, refresh: () => Promise<unknown>) {
  const { t } = useI18n()
  const { toast } = useToast()

  const confirmOpen = ref(false)
  const confirming = ref(false)
  const rescheduleOpen = ref(false)
  const rescheduling = ref(false)

  /** Posts one action. `busy` is true while it runs; `done` runs on success, before the refetch. */
  async function post(action: string, options: { body?: Record<string, unknown>, busy?: Ref<boolean>, done?: () => void } = {}) {
    if (options.busy) options.busy.value = true
    try {
      await $fetch(`/api/s/${slug.value}/${action}`, { method: 'POST', body: options.body })
      options.done?.()
    }
    catch (failure) {
      toast({ tone: 'error', text: t(apiErrorKey(failure)) })
    }
    finally {
      if (options.busy) options.busy.value = false
      await refresh()
    }
  }

  /** Sets the Date to a Slot's start, sent as the Berlin wall clock (ADR 0003). */
  function confirmDate(startsAt: Date) {
    return post('confirm', { body: { startsAt: utcToBerlin(startsAt) }, busy: confirming, done: () => (confirmOpen.value = false) })
  }

  /** Moves the set Date to a new Berlin time (`YYYY-MM-DDTHH:mm`); the card then shows the new time. */
  function rescheduleDate(startsAt: string) {
    return post('reschedule', { body: { startsAt }, busy: rescheduling, done: () => (rescheduleOpen.value = false) })
  }

  /** Withdraws the set Date and goes back to the poll. Slots and Votes stay. */
  function reopenDate() {
    return post('reopen')
  }

  return { confirmOpen, confirming, rescheduleOpen, rescheduling, confirmDate, rescheduleDate, reopenDate }
}
