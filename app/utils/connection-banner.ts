// When the ConnectionBanner shows what (02-components § ConnectionBanner, #156), as a function of how long the
// connection has been down and how long ago it came back. No timers in here: useConnectionBanner owns those.

export type BannerState = 'ok' | 'reconnecting' | 'lost' | 'back'

/** A drop shorter than this shows nothing. */
export const RECONNECTING_AFTER_MS = 2000
export const LOST_AFTER_MS = 15_000
/** „Wieder da“ stays this long. */
export const BACK_FOR_MS = 2000

export interface ConnectionTiming {
  open: boolean
  /** How long the connection has been down, while it is. */
  downMs: number | null
  /** How long ago it came back, when the drop was long enough to have shown a banner. */
  recoveredMs: number | null
}

export function bannerFor({ open, downMs, recoveredMs }: ConnectionTiming): BannerState {
  if (open) return recoveredMs !== null && recoveredMs < BACK_FOR_MS ? 'back' : 'ok'
  if (downMs === null || downMs < RECONNECTING_AFTER_MS) return 'ok'
  return downMs < LOST_AFTER_MS ? 'reconnecting' : 'lost'
}

/** Milliseconds until `bannerFor` next gives another answer without the connection changing, or null. */
export function bannerChangeIn({ open, downMs, recoveredMs }: ConnectionTiming): number | null {
  if (open) return recoveredMs !== null && recoveredMs < BACK_FOR_MS ? BACK_FOR_MS - recoveredMs : null
  if (downMs === null) return null
  if (downMs < RECONNECTING_AFTER_MS) return RECONNECTING_AFTER_MS - downMs
  return downMs < LOST_AFTER_MS ? LOST_AFTER_MS - downMs : null
}
