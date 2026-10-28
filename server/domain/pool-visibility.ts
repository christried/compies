import type { EventSettings } from '../../shared/settings'

/**
 * Whether a viewer sees the games of the pools, or only how many there are (#146, #148). The Host always sees
 * them, also under a Hidden wheel. Every other Member sees them only while the wheel is not hidden. An Event that
 * is not set up has empty pools, and a non-Host gets the (zero) counts: the safe default.
 */
export function poolsVisibleTo({ isHost, settings }: { isHost: boolean, settings: EventSettings | null }): boolean {
  return isHost || (settings !== null && !settings.hiddenWheel)
}
