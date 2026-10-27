import { apiErrorKey } from '~/utils/api-error'
import type { ApiErrorCode } from '~~/shared/errors'
import { SLOTS_MAX } from '~~/shared/event'

// The one way the client changes an Event (#74): the Host's Session actions, the Slot editor and the Invite link
// all post through `send`. A refusal shows as a toast in the shared error copy (app/utils/api-error.ts), and the
// Event is refetched afterwards, taken or not (ADR 0001). Only the Votes keep their own optimistic loop
// (useOptimisticVotes), with the same error copy.

export interface SendOptions<Answer> {
  body?: Record<string, unknown>
  /** True while the request runs, e.g. a dialog's loading state. */
  busy?: Ref<boolean>
  /** The screen's own copy for some error codes, over the shared one (apiErrorKey's overrides). */
  errorKeys?: Partial<Record<ApiErrorCode, string>>
  /** Runs with the server's answer when it took the change, before the refetch, e.g. to close a dialog. */
  done?: (answer: Answer) => void
}

/** `refresh` refetches the Event, or asks the page to (a sheet emits `changed`). */
export function useEventMutation(slug: MaybeRefOrGetter<string>, refresh: () => unknown) {
  const { t } = useI18n()
  const { toast } = useToast()

  /** Sends one change to `/api/e/<slug>/<path>` and resolves to whether the server took it. Never throws. */
  async function send<Answer = unknown>(method: 'POST' | 'PATCH' | 'DELETE', path: string, options: SendOptions<Answer> = {}) {
    const { body, busy, errorKeys, done } = options
    if (busy) busy.value = true
    let taken = false
    try {
      const answer = await $fetch<Answer>(`/api/e/${toValue(slug)}/${path}`, { method, body })
      taken = true
      // Nitro wraps `$fetch<Answer>`'s result in a conditional type that TypeScript cannot resolve for a generic Answer.
      done?.(answer as Answer)
    }
    catch (failure) {
      // `{max}` is the one placeholder in the shared error copy (slots_max).
      toast({ tone: 'error', text: t(apiErrorKey(failure, 'error.saveFailed', errorKeys), { max: SLOTS_MAX }) })
    }
    finally {
      if (busy) busy.value = false
      await refresh()
    }
    return taken
  }

  return { send }
}
