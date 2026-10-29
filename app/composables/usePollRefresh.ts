// Keeps data fresh without realtime (ADR 0001); the Event page uses it as the fallback while its room is down. Both refetch on window focus and when the tab becomes
// visible again; an Event also refetches every 15 s while the tab is visible. The caller refetches
// after its own writes. Listeners stop when the page scope ends. Nothing runs on the server.

export const POLL_INTERVAL_MS = 15_000

const visible = () => document.visibilityState === 'visible'

/** Refetch when the User comes back to the tab: on window focus and when it becomes visible (Home, #12). */
export function useRefreshOnReturn(refresh: () => unknown) {
  if (!import.meta.client) return

  const onVisibility = () => {
    if (visible()) refresh()
  }
  const onFocus = () => refresh()

  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('focus', onFocus)
  onScopeDispose(() => {
    document.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('focus', onFocus)
  })
}

/**
 * Refetch on return, and every `intervalMs` while the tab is visible (the Event page, #11). With the live room (#156)
 * this is the fallback: `active` says whether the page needs it right now, i.e. the room is not open. While it is
 * not, nothing refetches, because the room says when to.
 */
export function usePollRefresh(refresh: () => unknown, intervalMs = POLL_INTERVAL_MS, active: () => boolean = () => true) {
  if (!import.meta.client) return

  useRefreshOnReturn(() => {
    if (active()) refresh()
  })
  const timer = setInterval(() => {
    if (visible() && active()) refresh()
  }, intervalMs)
  onScopeDispose(() => clearInterval(timer))
}
