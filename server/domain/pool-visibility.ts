import type { EventSettings } from '../../shared/settings'

/**
 * The one rule for who sees the games of the pools under a Hidden wheel (#146, #148, #183). The Host always sees
 * them. Every other Member sees them only while the wheel is known not to be hidden; `hiddenWheel` null is an Event
 * that is not set up (empty pools), which counts as hidden: the safe default. The Event read and the image route
 * both ask here, so a Member never sees a name without its image or the reverse.
 * 1.5 adds the "drawn games" branch here: a game that was drawn becomes visible under a Hidden wheel.
 */
export function canSeePoolGames({ isHost, hiddenWheel }: { isHost: boolean, hiddenWheel: boolean | null }): boolean {
  return isHost || hiddenWheel === false
}

/** Whether a viewer sees the games of the pools, or only how many there are, from an Event's settings (null = not set up). */
export function poolsVisibleTo({ isHost, settings }: { isHost: boolean, settings: EventSettings | null }): boolean {
  return canSeePoolGames({ isHost, hiddenWheel: settings?.hiddenWheel ?? null })
}
