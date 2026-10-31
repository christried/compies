import { apiErrorKey } from '~/utils/api-error'
import type { ApiErrorCode } from '~~/shared/errors'
import { SLOTS_MAX } from '~~/shared/event'

// The one way the client changes an Event (#74): the Host's Session actions, the Slot editor and the Invite link
// all post through `send`, and so do the Game board's moves and the Team word. A refusal shows as a toast in the shared error copy (app/utils/api-error.ts), and the
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
  /** The toast copy for a refusal that has no copy of its own; `error.saveFailed` by default. */
  fallback?: string
  /** Runs when the change failed, before the toast and the refetch, e.g. to put an avatar back (#160) or roll a draft back (#161). */
  refused?: (failure: unknown) => void
  /** The toast text for a failure that has copy of its own (the lost race names the winner, #160); undefined keeps the shared copy. */
  refusalText?: (failure: unknown) => string | undefined
}

/** `refresh` refetches the Event, or asks the page to (a sheet emits `changed`). */
export function useEventMutation(slug: MaybeRefOrGetter<string>, refresh: () => unknown) {
  const { t } = useI18n()
  const { toast } = useToast()

  /** Sends one change to `/api/e/<slug>/<path>` and resolves to whether the server took it. Never throws. */
  async function send<Answer = unknown>(method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, options: SendOptions<Answer> = {}) {
    const { body, busy, errorKeys, done, fallback = 'error.saveFailed', refused, refusalText } = options
    if (busy) busy.value = true
    let taken = false
    try {
      const answer = await $fetch<Answer>(`/api/e/${toValue(slug)}/${path}`, { method, body })
      taken = true
      // Nitro wraps `$fetch<Answer>`'s result in a conditional type that TypeScript cannot resolve for a generic Answer.
      done?.(answer as Answer)
    }
    catch (failure) {
      refused?.(failure)
      // `{max}` is the one placeholder in the shared error copy (slots_max).
      toast({ tone: 'error', text: refusalText?.(failure) ?? t(apiErrorKey(failure, fallback, errorKeys), { max: SLOTS_MAX }) })
    }
    finally {
      if (busy) busy.value = false
      await refresh()
    }
    return taken
  }

  return { send }
}
