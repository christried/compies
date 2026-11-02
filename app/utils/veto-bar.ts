import type { OwnVetoView } from '~~/shared/event'

// What the Veto bar and its button show for a Player's Party (#231, review 0.7 F4, reference App Spielrunde „Clip + Veto-Fenster“,
// „Eigenes Veto versiegelt“).

/** The Party's state in the Veto window: it may veto (`ready`), the viewer cast for it (`mine`), a teammate did (`mate`), or no Veto is left (`none`). */
export type VetoBarState = 'ready' | 'mine' | 'mate' | 'none'

/**
 * Whether the Veto action shows for this Party: it cast already, may cast, or has none left. A Party that cannot cast for another
 * reason (the window is closed, no Session runs) has no action, and with it no bar.
 */
export function vetoActionShown(own: OwnVetoView | null): own is OwnVetoView {
  return own !== null && (own.castBy !== null || own.rejection === null || own.rejection === 'no_vetoes_left')
}

/** The state of the viewer's Party, from the read's own part. */
export function vetoBarState(own: OwnVetoView, viewerId: string): VetoBarState {
  if (own.castBy !== null) return own.castBy === viewerId ? 'mine' : 'mate'
  return own.rejection === 'no_vetoes_left' ? 'none' : 'ready'
}

/** The time left as `m:ss`, for the bar's clock. */
export function clockText(seconds: number): string {
  const whole = Math.max(0, Math.ceil(seconds))
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}
