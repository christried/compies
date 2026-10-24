import { apiErrorKey } from '~/utils/api-error'

// The Host's actions on the Event page: Set the Date from a Slot (#52), and per Session Reschedule, Reopen and
// remove, plus adding a Session (#13, #14, #55). Each posts to its endpoint, shows the server's refusal as a
// toast and refetches the Event afterwards (ADR 0001). The dialogs and the sheet close on success only. Each
// call resolves to whether the server took it, so a hold button can start again after a refusal.

export function useHostActions(slug: Readonly<Ref<string>>, refresh: () => Promise<unknown>) {
  const { t } = useI18n()
  const { toast } = useToast()

  const confirmOpen = ref(false)
  const confirming = ref(false)
  const rescheduleOpen = ref(false)
  const rescheduling = ref(false)
  /** The Session the reschedule dialog moves (#55). */
  const rescheduleSessionId = ref<string | null>(null)
  const addOpen = ref(false)
  const adding = ref(false)

  /** Sends one action. `busy` is true while it runs; `done` runs on success, before the refetch. */
  async function send(method: 'POST' | 'DELETE', path: string, options: { body?: Record<string, unknown>, busy?: Ref<boolean>, done?: () => void } = {}) {
    if (options.busy) options.busy.value = true
    let saved = false
    try {
      await $fetch(`/api/e/${slug.value}/${path}`, { method, body: options.body })
      saved = true
      options.done?.()
    }
    catch (failure) {
      toast({ tone: 'error', text: t(apiErrorKey(failure)) })
    }
    finally {
      if (options.busy) options.busy.value = false
      await refresh()
    }
    return saved
  }

  /** Sets the Date of the next undated Session from the Slot the Host picked (#52). */
  function confirmDate(slotId: string) {
    return send('POST', 'confirm', { body: { slotId }, busy: confirming, done: () => (confirmOpen.value = false) })
  }

  /** Opens the reschedule dialog for one Session (#55). */
  function openReschedule(sessionId: string) {
    rescheduleSessionId.value = sessionId
    rescheduleOpen.value = true
  }

  /** Moves the Session's set Date to a new Berlin time (`YYYY-MM-DDTHH:mm`); its card then shows the new time. */
  function rescheduleDate(startsAt: string) {
    const sessionId = rescheduleSessionId.value
    if (!sessionId) return Promise.resolve(false)
    return send('POST', `sessions/${sessionId}/reschedule`, { body: { startsAt }, busy: rescheduling, done: () => (rescheduleOpen.value = false) })
  }

  /** Withdraws one Session's Date and frees its Slot. The other Sessions and the Votes stay. */
  function reopenSession(sessionId: string) {
    return send('POST', `sessions/${sessionId}/reopen`)
  }

  /** Removes one Session, dated or not; its Slot, if any, goes back to the poll (#55). */
  function removeSession(sessionId: string) {
    return send('DELETE', `sessions/${sessionId}`)
  }

  /** Adds a Session with this Berlin time, or without one (null) to leave its Date to the poll (#55). */
  function addSession(startsAt: string | null) {
    return send('POST', 'sessions', { body: startsAt === null ? {} : { startsAt }, busy: adding, done: () => (addOpen.value = false) })
  }

  return {
    confirmOpen,
    confirming,
    rescheduleOpen,
    rescheduling,
    rescheduleSessionId,
    addOpen,
    adding,
    confirmDate,
    openReschedule,
    rescheduleDate,
    reopenSession,
    removeSession,
    addSession,
  }
}
