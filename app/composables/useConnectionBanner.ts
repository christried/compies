import { bannerChangeIn, bannerFor, RECONNECTING_AFTER_MS, type BannerState } from '~/utils/connection-banner'
import type { RoomState } from '~/composables/useEventRoom'

// What the ConnectionBanner shows for a room's state (#156). The timing is bannerFor's; this keeps the clock: when the
// connection went down, when it came back after a drop long enough to have been noticed, and a timer for the next
// change. A banner that never showed has nothing to take back, so a short drop ends in silence. The clock starts with
// the first open (#198): a slow first connect shows nothing, and no „Wieder da“ follows it. A first connect that never
// succeeds shows nothing either; the page polls as before.

export function useConnectionBanner(state: Readonly<Ref<RoomState>>, enabled: boolean): Readonly<Ref<BannerState>> {
  const banner = ref<BannerState>('ok')
  if (!import.meta.client || !enabled) return banner

  let downSince: number | null = null
  let opened = false
  let recoveredAt: number | null = null
  let timer: ReturnType<typeof setTimeout> | undefined

  function update() {
    clearTimeout(timer)
    const now = Date.now()
    const timing = {
      open: state.value === 'open',
      downMs: downSince === null ? null : now - downSince,
      recoveredMs: recoveredAt === null ? null : now - recoveredAt,
    }
    banner.value = bannerFor(timing)
    const next = bannerChangeIn(timing)
    if (next !== null) timer = setTimeout(update, next)
  }

  watch(state, (current) => {
    if (current === 'open') {
      opened = true
      // Only a drop that was long enough to show a banner is announced as over.
      const downMs = downSince === null ? 0 : Date.now() - downSince
      recoveredAt = downMs >= RECONNECTING_AFTER_MS ? Date.now() : null
      downSince = null
    }
    else if (opened && downSince === null) {
      downSince = Date.now()
      recoveredAt = null
    }
    update()
  })
  update()
  onScopeDispose(() => clearTimeout(timer))
  return banner
}
