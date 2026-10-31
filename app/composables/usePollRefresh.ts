// Keeps data fresh without realtime (ADR 0001); the Event page uses it as the fallback while its room is down. Every
// return refetches: the tab becoming visible again, window focus and the browser being back online (#198). An Event
// also refetches every 15 s while the tab is visible, but only while its room is not open. The caller refetches
// after its own writes. Listeners stop when the page scope ends. Nothing runs on the server.

export const POLL_INTERVAL_MS = 15_000

const visible = () => document.visibilityState === 'visible'

/**
 * Refetch when the User comes back: the tab becomes visible again, window focus, and the browser is back online
 * (Home, #12; `online` #198).
 */
export function useRefreshOnReturn(refresh: () => unknown) {
  if (!import.meta.client) return

  const onVisibility = () => {
    if (visible()) refresh()
  }
  const onReturn = () => refresh()

  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('focus', onReturn)
  window.addEventListener('online', onReturn)
  onScopeDispose(() => {
    document.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('focus', onReturn)
    window.removeEventListener('online', onReturn)
  })
}

/**
 * Refetch on every return, and every `intervalMs` while the tab is visible (the Event page, #11). With the live room
 * (#156) the interval is the fallback: `active` says whether the page needs it right now, i.e. the room is not open.
 * While it is not, nothing polls, because the room says when to. The returns always refetch, whatever the room says:
 * a socket that died while a phone slept can still read `open`, and the messages sent meanwhile are gone (spec #153
 * § Protocol, no replay). One cheap read on return catches the page up (story 12, #198).
 */
export function usePollRefresh(refresh: () => unknown, intervalMs = POLL_INTERVAL_MS, active: () => boolean = () => true) {
  if (!import.meta.client) return

  useRefreshOnReturn(refresh)
  const timer = setInterval(() => {
    if (visible() && active()) refresh()
  }, intervalMs)
  onScopeDispose(() => clearInterval(timer))
}
