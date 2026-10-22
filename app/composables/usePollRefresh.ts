// Keeps a Session fresh without realtime (ADR 0001): refetch every 15 s while the tab is visible,
// on window focus, and when the tab becomes visible again. The caller also refetches after its own
// writes. Stops when the page scope ends. Does nothing on the server.

export const POLL_INTERVAL_MS = 15_000

export function usePollRefresh(refresh: () => unknown, intervalMs = POLL_INTERVAL_MS) {
  if (!import.meta.client) return

  const visible = () => document.visibilityState === 'visible'
  const timer = setInterval(() => {
    if (visible()) refresh()
  }, intervalMs)
  const onVisibility = () => {
    if (visible()) refresh()
  }
  const onFocus = () => refresh()

  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('focus', onFocus)
  onScopeDispose(() => {
    clearInterval(timer)
    document.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('focus', onFocus)
  })
}
